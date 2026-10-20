/**
 * TranscribePanel.jsx
 *
 * Runs OpenAI Whisper speech-to-text entirely in the browser using:
 *   • @huggingface/transformers v3 (successor to @xenova/transformers)
 *   • onnx-community/whisper-tiny.en (ONNX-quantized, ~40 MB)
 *   • A Vite Web Worker — isolates ONNX Runtime from Vite's module graph,
 *     which is the documented fix for the "registerBackend undefined" error.
 *
 * No API key, no backend, no data leaves the device.
 * Model is downloaded once from Hugging Face CDN and cached in the browser.
 *
 * Honest limitations:
 *   • whisper-tiny.en — English only. Fast but may miss words in noisy audio.
 *   • First-run model download: ~40 MB (quantized) — expect 30–90 s on slow connections.
 *   • Very long videos (>10 min) may take 1–3 minutes to transcribe.
 *   • WebAssembly backend used (no GPU). Chrome/Edge/Firefox all supported.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import './TranscribePanel.css'

// ── Audio extraction helper ────────────────────────────────────────────────
/**
 * Reads the video File, decodes its audio track, downmixes to mono,
 * and resamples to 16 000 Hz — the exact format Whisper expects.
 * Returns a Float32Array.
 */
async function extractAudio(videoFile) {
  const arrayBuffer = await videoFile.arrayBuffer()

  // Request 16 kHz directly from the browser's audio decoder
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  })

  let audioBuffer
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  } finally {
    // Always close to free resources, even on error
    await audioCtx.close()
  }

  // Downmix all channels to mono by averaging
  const numCh = audioBuffer.numberOfChannels
  const len = audioBuffer.length
  const mono = new Float32Array(len)
  for (let c = 0; c < numCh; c++) {
    const ch = audioBuffer.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += ch[i]
  }
  for (let i = 0; i < len; i++) mono[i] /= numCh

  return mono
}

// ── SRT time formatter ─────────────────────────────────────────────────────
function secToSrtTime(sec) {
  if (sec == null || !isFinite(sec)) sec = 0
  const h  = Math.floor(sec / 3600)
  const m  = Math.floor((sec % 3600) / 60)
  const s  = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  const pad = (n, l = 2) => String(n).padStart(l, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

// ── Status constants ───────────────────────────────────────────────────────
const S = {
  IDLE:        'idle',
  EXTRACTING:  'extracting',
  LOADING:     'loading',
  TRANSCRIBING:'transcribing',
  DONE:        'done',
  ERROR:       'error',
}

// ── Component ──────────────────────────────────────────────────────────────
export default function TranscribePanel({ videoFile, onTranscribed }) {
  const [status,      setStatus]      = useState(S.IDLE)
  const [statusMsg,   setStatusMsg]   = useState('')
  const [dlFile,      setDlFile]      = useState('')   // filename being downloaded
  const [dlPct,       setDlPct]       = useState(null) // 0-100 or null
  const [resultCount, setResultCount] = useState(0)
  const [errorMsg,    setErrorMsg]    = useState('')

  const workerRef = useRef(null)

  // Reset panel whenever the user loads a new video
  useEffect(() => {
    setStatus(S.IDLE)
    setStatusMsg('')
    setDlFile('')
    setDlPct(null)
    setResultCount(0)
    setErrorMsg('')
  }, [videoFile])

  // Terminate worker on unmount
  useEffect(() => () => workerRef.current?.terminate(), [])

  // ── Main transcription handler ───────────────────────────────────────────
  const handleTranscribe = useCallback(async () => {
    if (!videoFile) return

    // Terminate any previous worker run
    workerRef.current?.terminate()

    // ── Stage 1: Extract audio ─────────────────────────────────────
    setStatus(S.EXTRACTING)
    setStatusMsg('Extracting audio from video…')
    setDlPct(null)
    setErrorMsg('')

    let audioData
    try {
      audioData = await extractAudio(videoFile)
    } catch (err) {
      setStatus(S.ERROR)
      setErrorMsg(
        'Could not decode audio. Use an MP4 or WebM file. (' + err.message + ')'
      )
      return
    }

    // ── Stage 2 & 3: Worker loads model + runs Whisper ─────────────
    setStatus(S.LOADING)
    setStatusMsg('Starting Whisper model…')

    // Vite's `new URL(..., import.meta.url)` syntax creates a proper
    // chunk-hashed worker URL that Vite knows to bundle separately.
    const worker = new Worker(
      new URL('../workers/whisper.worker.js', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e) => {
      const msg = e.data

      if (msg.type === 'progress') {
        const p = msg.data
        if (p.status === 'initiate') {
          setStatus(S.LOADING)
          setStatusMsg('Downloading model…')
          setDlFile(p.file ?? '')
          setDlPct(0)
        } else if (p.status === 'download') {
          setDlFile(p.file ?? '')
          setDlPct(0)
        } else if (p.status === 'progress') {
          setDlFile(p.file ?? '')
          setDlPct(p.progress != null ? Math.round(p.progress) : null)
        } else if (p.status === 'done') {
          setDlFile('')
          setDlPct(null)
          setStatusMsg('Loading model into memory…')
        } else if (p.status === 'ready') {
          setStatus(S.TRANSCRIBING)
          setStatusMsg('Transcribing speech…')
        } else if (p.status === 'running') {
          setStatus(S.TRANSCRIBING)
          setStatusMsg(p.message ?? 'Transcribing…')
        }
        return
      }

      if (msg.type === 'result') {
        const chunks = msg.chunks ?? []
        worker.terminate()
        workerRef.current = null

        if (chunks.length === 0) {
          setStatus(S.ERROR)
          setErrorMsg(
            'No speech detected. Make sure the video has clear English speech ' +
            'and is not silent or music-only.'
          )
          return
        }

        const entries = chunks
          .filter(c => c.text?.trim())
          .map(c => {
            const [startSec, endSec] = c.timestamp
            return {
              start: secToSrtTime(startSec),
              end:   secToSrtTime(endSec ?? (startSec ?? 0) + 2),
              text:  c.text.trim(),
            }
          })

        setResultCount(entries.length)
        setStatus(S.DONE)
        setStatusMsg('')
        onTranscribed(entries)
        return
      }

      if (msg.type === 'error') {
        worker.terminate()
        workerRef.current = null
        setStatus(S.ERROR)
        setErrorMsg(msg.message)
      }
    }

    worker.onerror = (err) => {
      workerRef.current = null
      setStatus(S.ERROR)
      setErrorMsg('Worker error: ' + (err.message ?? 'unknown'))
    }

    // Send the audio data to the worker (transferable — zero-copy)
    worker.postMessage(
      { type: 'transcribe', audioData },
      [audioData.buffer]
    )
  }, [videoFile, onTranscribed])

  const handleCancel = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    setStatus(S.IDLE)
    setStatusMsg('')
    setDlPct(null)
  }

  const handleRetry = () => {
    setStatus(S.IDLE)
    setErrorMsg('')
    setStatusMsg('')
  }

  const isRunning = [S.EXTRACTING, S.LOADING, S.TRANSCRIBING].includes(status)

  // ── Stage badge helper ───────────────────────────────────────────
  const stageCls = (stageStatus) => {
    const order = [S.EXTRACTING, S.LOADING, S.TRANSCRIBING]
    const cur = order.indexOf(status)
    const tgt = order.indexOf(stageStatus)
    if (cur === tgt) return 'stage-badge active'
    if (cur > tgt)   return 'stage-badge done'
    return 'stage-badge'
  }

  return (
    <div className="transcribe-panel">
      <div className="transcribe-header">
        <span className="transcribe-title">🤖 Generate Subtitles</span>
        <span className="transcribe-engine">Whisper · in-browser · no API key</span>
      </div>

      <div className="transcribe-body">

        {/* ── Idle / Done ── */}
        {(status === S.IDLE || status === S.DONE) && (
          <>
            {status === S.DONE && (
              <div className="transcribe-success">
                ✅ Generated {resultCount} subtitle{resultCount !== 1 ? 's' : ''} from
                real speech — edit them in the table →
              </div>
            )}
            <div className="transcribe-info">
              <strong>How it works:</strong> Runs <code>whisper-tiny.en</code> (ONNX,
              ~40 MB) entirely in your browser via WebAssembly. The model
              downloads once and is cached. No data leaves your device.
            </div>
            <div className="transcribe-actions">
              <button
                className="btn btn-transcribe"
                onClick={handleTranscribe}
                disabled={!videoFile}
              >
                {status === S.DONE ? '🔄 Re-transcribe' : '▶ Generate Subtitles'}
              </button>
              {!videoFile && (
                <span className="transcribe-hint">Upload a video first</span>
              )}
            </div>
          </>
        )}

        {/* ── Running ── */}
        {isRunning && (
          <div className="transcribe-running">

            {/* Stage pipeline */}
            <div className="transcribe-stages">
              <span className={stageCls(S.EXTRACTING)}>1. Extract audio</span>
              <span className="stage-sep">›</span>
              <span className={stageCls(S.LOADING)}>2. Load model</span>
              <span className="stage-sep">›</span>
              <span className={stageCls(S.TRANSCRIBING)}>3. Transcribe</span>
            </div>

            {/* Spinner + status message */}
            <div className="transcribe-spinner-row">
              <div className="transcribe-spinner" />
              <div className="transcribe-msg">
                <div className="transcribe-msg-main">{statusMsg}</div>
                {dlFile && (
                  <div className="transcribe-msg-sub">
                    {dlFile.split('/').pop()}
                  </div>
                )}
              </div>
            </div>

            {/* Download progress bar */}
            {dlPct != null && (
              <div className="dl-bar-wrap">
                <div className="dl-bar-fill" style={{ width: `${dlPct}%` }} />
                <span className="dl-bar-pct">{dlPct}%</span>
              </div>
            )}

            <button className="btn btn-sm" onClick={handleCancel}>⏹ Cancel</button>
          </div>
        )}

        {/* ── Error ── */}
        {status === S.ERROR && (
          <div className="transcribe-error-box">
            <div className="transcribe-error-msg">❌ {errorMsg}</div>
            <button className="btn" onClick={handleRetry}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
