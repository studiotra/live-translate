import type { TranslatorApi } from '../../shared/ipc'

interface ImportMetaEnv {
  readonly VITE_DEEPGRAM_API_KEY?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_DEEPGRAM_LANGUAGE?: string
}

declare global {
  interface Window {
    api: TranslatorApi
  }
}

export {}
