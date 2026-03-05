import type { PreloadApi } from '../preload/index.js'

declare global {
  interface Window {
    jarvis: PreloadApi
  }
}

export {}
