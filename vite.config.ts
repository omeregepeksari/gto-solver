import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The multithreaded solver needs SharedArrayBuffer, which browsers only allow on
// cross-origin isolated pages. "credentialless" keeps Google Fonts loading.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

// wasm-bindgen-rayon spawns its thread workers with `new URL('./workerHelpers.js', import.meta.url)`,
// which Vite's build rewrites to `self.location.href` (the page, not the helper). Pointing it at
// the module's own URL keeps it working after bundling.
const rayonWorkerUrl: Plugin = {
  name: 'rayon-worker-url',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('wasm-bindgen-rayon') || !id.endsWith('workerHelpers.js')) return
    return code.replace("new URL('./workerHelpers.js', import.meta.url)", 'import.meta.url')
  },
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), rayonWorkerUrl],
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
})
