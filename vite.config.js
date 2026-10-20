import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Do NOT pre-bundle @huggingface/transformers — it dynamically loads
  // ONNX Runtime WASM files at runtime and must stay as-is.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },

  // Required so Vite emits ESM workers correctly when using
  // `new Worker(new URL(...), { type: 'module' })` syntax.
  worker: {
    format: 'es',
  },

  server: {
    headers: {
      // SharedArrayBuffer is needed by ONNX Runtime's multi-threaded WASM.
      // These two headers opt the page into a "cross-origin isolated" context.
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
