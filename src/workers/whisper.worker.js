/**
 * whisper.worker.js
 *
 * Runs in a dedicated Vite Web Worker (type: 'module').
 * Isolated from the main thread — ONNX Runtime and its WASM backends
 * initialize cleanly here without conflicting with Vite's module graph.
 *
 * Message protocol (postMessage):
 *   IN  { type: 'transcribe', audioData: Float32Array }
 *   OUT { type: 'progress',  data: { status, file, loaded, total } }
 *   OUT { type: 'result',    chunks: Array<{timestamp:[s,e], text:string}> }
 *   OUT { type: 'error',     message: string }
 */

import { pipeline, env } from '@huggingface/transformers'

// ── Configure environment ──────────────────────────────────────────────────
// Never look for local model files — always fetch from Hugging Face CDN.
env.allowLocalModels = false

// Cache downloaded model files in the browser's Cache API (IndexedDB).
env.useBrowserCache = true

// ── Singleton pipeline (cached across calls) ───────────────────────────────
let whisperPipeline = null

async function loadPipeline(progressCallback) {
  if (whisperPipeline) return whisperPipeline

  whisperPipeline = await pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-tiny.en',      // ONNX-quantized whisper-tiny (English)
    {
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4',        // 4-bit quantized decoder — smaller, faster
      },
      device: 'wasm',                      // WebAssembly backend — works in all browsers
      progress_callback: progressCallback,
    }
  )

  return whisperPipeline
}

// ── Message handler ────────────────────────────────────────────────────────
self.addEventListener('message', async (event) => {
  const { type, audioData } = event.data

  if (type !== 'transcribe') return

  try {
    // 1. Load / reuse the pipeline
    const pipe = await loadPipeline((p) => {
      self.postMessage({ type: 'progress', data: p })
    })

    // 2. Run Whisper on the Float32Array audio (16kHz mono)
    self.postMessage({
      type: 'progress',
      data: { status: 'running', message: 'Transcribing speech…' },
    })

    const result = await pipe(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    })

    // 3. Send results back
    self.postMessage({ type: 'result', chunks: result.chunks ?? [] })

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
})
