import { useEffect, useRef, useState, useCallback } from 'react'
import './Waveform.css'

const CANVAS_HEIGHT = 120
const BAR_GAP = 1

export default function Waveform({ videoFile, videoRef }) {
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState('')
  const waveformData = useRef(null) // Float32Array of downsampled peaks

  // ── Decode audio from the video file ──────────────────────────────
  useEffect(() => {
    if (!videoFile) {
      waveformData.current = null
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('loading')
    setErrorMsg('')

    async function decodeAudio() {
      try {
        const arrayBuffer = await videoFile.arrayBuffer()
        if (cancelled) return

        // Create a temporary AudioContext just for decoding
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

        let audioBuffer
        try {
          audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        } catch (decodeErr) {
          // Some video containers (e.g. MKV, TS) can't be decoded by WebAudio
          // Fall back gracefully
          audioCtx.close()
          if (!cancelled) {
            setStatus('error')
            setErrorMsg('Audio decode failed. Try MP4 or WebM.')
          }
          return
        }

        await audioCtx.close()
        if (cancelled) return

        // Use the first channel (left / mono)
        const channelData = audioBuffer.getChannelData(0)

        // Downsample to canvas width in pixels
        const canvas = canvasRef.current
        const numBars = canvas ? Math.floor(canvas.width / (2 + BAR_GAP)) : 600
        const blockSize = Math.floor(channelData.length / numBars)
        const peaks = new Float32Array(numBars)

        for (let i = 0; i < numBars; i++) {
          let max = 0
          const start = i * blockSize
          for (let j = start; j < start + blockSize; j++) {
            const abs = Math.abs(channelData[j])
            if (abs > max) max = abs
          }
          peaks[i] = max
        }

        waveformData.current = peaks
        if (!cancelled) {
          setStatus('ready')
          drawWaveform(0, 1, peaks)
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg('Could not read audio: ' + err.message)
        }
      }
    }

    decodeAudio()
    return () => { cancelled = true }
  }, [videoFile])

  // ── Draw waveform bars on canvas ──────────────────────────────────
  const drawWaveform = useCallback((currentTimeSec, durationSec, peaks) => {
    const canvas = canvasRef.current
    if (!canvas || !peaks) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const mid = H / 2
    const barW = 2

    ctx.clearRect(0, 0, W, H)

    // Background grid lines
    ctx.strokeStyle = 'rgba(48, 54, 61, 0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, mid)
    ctx.lineTo(W, mid)
    ctx.stroke()

    const progress = durationSec > 0 ? currentTimeSec / durationSec : 0
    const progressX = Math.floor(progress * W)

    for (let i = 0; i < peaks.length; i++) {
      const x = i * (barW + BAR_GAP)
      const barH = Math.max(2, peaks[i] * (mid - 2))

      const isPast = x < progressX

      if (isPast) {
        ctx.fillStyle = 'rgba(88, 166, 255, 0.9)'
      } else {
        ctx.fillStyle = 'rgba(88, 166, 255, 0.35)'
      }

      // Draw bar symmetrically around midline
      ctx.fillRect(x, mid - barH, barW, barH * 2)
    }

    // Playhead line
    if (progress > 0) {
      ctx.strokeStyle = '#79b8ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(progressX, 0)
      ctx.lineTo(progressX, H)
      ctx.stroke()
    }
  }, [])

  // ── Animate playhead as video plays ──────────────────────────────
  useEffect(() => {
    if (status !== 'ready') return
    const video = videoRef?.current
    if (!video) return

    const tick = () => {
      const peaks = waveformData.current
      if (peaks) {
        drawWaveform(video.currentTime, video.duration || 1, peaks)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [status, videoRef, drawWaveform])

  // ── Handle canvas click for seeking ──────────────────────────────
  const handleCanvasClick = (e) => {
    const video = videoRef?.current
    if (!video || !video.duration) return
    const rect = canvasRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    video.currentTime = ratio * video.duration
  }

  // ── Resize canvas to match its CSS width ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = CANVAS_HEIGHT
      if (waveformData.current) {
        const video = videoRef?.current
        drawWaveform(
          video?.currentTime ?? 0,
          video?.duration ?? 1,
          waveformData.current
        )
      }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [drawWaveform, videoRef])

  return (
    <div className="waveform-container">
      <div className="waveform-label">
        <span>🎵 Audio Waveform</span>
        {status === 'loading' && <span className="waveform-status loading">Decoding audio…</span>}
        {status === 'error' && <span className="waveform-status error">⚠ {errorMsg}</span>}
        {status === 'ready' && <span className="waveform-status ready">Click to seek</span>}
      </div>
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        height={CANVAS_HEIGHT}
        onClick={handleCanvasClick}
        title="Click to seek"
      />
      {status === 'idle' && (
        <div className="waveform-idle">Upload a video to see the audio waveform</div>
      )}
      {status === 'loading' && (
        <div className="waveform-loading-overlay">
          <div className="spinner" />
          <span>Decoding audio from video…</span>
        </div>
      )}
    </div>
  )
}
