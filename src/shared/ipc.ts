export const IpcChannel = {
  GetSession: 'session:get',
  SessionUpdated: 'session:updated',
  EnsureMicrophone: 'microphone:ensure',
  OpenTranslators: 'windows:open-translators',
  CloseTranslators: 'windows:close-translators',
  CloseThisWindow: 'windows:close-self',
  CaptionHello: 'caption:hello',
  SetRecording: 'recording:set',
  PublishOriginal: 'caption:original:publish',
  OriginalCaption: 'caption:original',
  PublishTranslated: 'caption:translated:publish',
  TranslatedCaption: 'caption:translated',
  SetCaptionSize: 'appearance:set-font-size',
  CaptionSize: 'appearance:font-size',
  SaveSummary: 'summary:save',
  SaveTranscript: 'transcript:save',
  GetApiKeys: 'keys:get',
  SaveApiKeys: 'keys:save',
  ClearApiKeys: 'keys:clear',
  SpeechPlayback: 'speech:playback',
  SpeechHold: 'speech:hold'
} as const

export const CAPTION_SIZES = [18, 22, 26, 32, 40, 48, 56] as const
export type CaptionSize = (typeof CAPTION_SIZES)[number]
export const DEFAULT_CAPTION_SIZE: CaptionSize = 26

export function isCaptionSize(value: unknown): value is CaptionSize {
  return typeof value === 'number' && (CAPTION_SIZES as readonly number[]).includes(value)
}

export const CAPTION_LANGUAGES = ['en', 'ko', 'ja'] as const
export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<CaptionLanguage, string> = {
  en: 'English',
  ko: '한국어',
  ja: '日本語'
}

export function isCaptionLanguage(value: unknown): value is CaptionLanguage {
  return value === 'en' || value === 'ko' || value === 'ja'
}

export function speechLanguageFromCode(value: string | undefined): CaptionLanguage {
  const code = value?.trim().toLowerCase() ?? ''
  if (code.startsWith('en')) return 'en'
  if (code.startsWith('ja')) return 'ja'
  return 'ko'
}

export type WindowRole = 'controller' | 'original' | CaptionLanguage

export interface SessionState {
  recording: boolean
  translatorsOpen: boolean
}

export interface OpenTranslatorsResult {
  alreadyOpen: boolean
}

export interface CaptionLine {
  speaker: number | null
  text: string
}

export interface TranscriptSnapshot {
  lines: CaptionLine[]
  interim: CaptionLine[]
}

export type OriginalCaption =
  | { type: 'reset' }
  | { type: 'stopped' }
  | { type: 'append'; text: string }
  | ({ type: 'update' } & TranscriptSnapshot)

export type TranslatedCaption = { type: 'reset' } | { type: 'update'; language: CaptionLanguage; lines: string[] }

export interface SaveSummaryResult {
  filePath: string
}

export interface ApiKeyValues {
  deepgram: string
  openai: string
}

export interface ApiKeyStatus {
  deepgram: boolean
  openai: boolean
}

export interface ApiKeyUpdate {
  deepgram?: string
  openai?: string
}

export interface TranslatorApi {
  getSession: () => Promise<SessionState>
  ensureMicrophone: () => Promise<void>
  openTranslators: (focus?: boolean) => Promise<OpenTranslatorsResult>
  closeTranslators: () => Promise<void>
  closeThisWindow: () => void
  announceCaption: () => void
  onCaptionHello: (callback: () => void) => () => void
  setRecording: (active: boolean) => Promise<SessionState>
  publishOriginal: (message: OriginalCaption) => void
  publishTranslated: (message: TranslatedCaption) => void
  saveSummary: (markdown: string) => Promise<SaveSummaryResult>
  saveTranscript: (markdown: string) => Promise<SaveSummaryResult>
  getApiKeys: () => Promise<ApiKeyValues>
  saveApiKeys: (keys: ApiKeyUpdate) => Promise<ApiKeyStatus>
  clearApiKeys: () => Promise<ApiKeyStatus>
  setCaptionSize: (size: CaptionSize) => void
  onCaptionSize: (callback: (size: CaptionSize) => void) => () => void
  onSession: (callback: (session: SessionState) => void) => () => void
  onOriginalCaption: (callback: (message: OriginalCaption) => void) => () => void
  onTranslatedCaption: (callback: (message: TranslatedCaption) => void) => () => void
  setSpeechPlayback: (active: boolean) => void
  onSpeechHold: (callback: (active: boolean) => void) => () => void
}
