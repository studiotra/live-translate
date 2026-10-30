import type { CaptionLanguage } from '../../../shared/ipc'

export interface CaptionLine {
  speaker: number | null
  language: CaptionLanguage | null
  text: string
}

export interface TranscriptWord {
  text: string
  speaker: number | null
  language: CaptionLanguage | null
}

export interface TranscriptState {
  lines: CaptionLine[]
  interim: CaptionLine[]
}

export interface TranscriptEvent {
  text: string
  words: TranscriptWord[]
  isFinal: boolean
}

export interface TranscriptResult {
  state: TranscriptState
  phrases: CaptionLine[]
}

export const emptyTranscript: TranscriptState = { lines: [], interim: [] }

export function applyTranscript(state: TranscriptState, event: TranscriptEvent): TranscriptResult {
  const incoming = linesFromEvent(event)
  if (!event.isFinal) {
    return { state: { ...state, interim: incoming }, phrases: [] }
  }
  if (incoming.length === 0) {
    return { state: { ...state, interim: [] }, phrases: [] }
  }
  return {
    state: { lines: [...state.lines, ...incoming], interim: [] },
    phrases: incoming
  }
}

export function flushTranscript(state: TranscriptState): TranscriptResult {
  if (state.interim.length === 0) return { state, phrases: [] }
  return {
    state: { lines: [...state.lines, ...state.interim], interim: [] },
    phrases: state.interim
  }
}

export function speakerLabel(speaker: number | null, text: string): string {
  const body = text.trim()
  if (speaker === null || speaker < 0) return body
  return `P${speaker + 1}  ${body}`
}

function linesFromEvent(event: TranscriptEvent): CaptionLine[] {
  const grouped = groupWords(event.words)
  if (grouped.length > 0) return grouped
  const text = event.text.trim()
  return isSpeakable(text) ? [{ speaker: null, language: inferCaptionLanguage(text), text }] : []
}

export function inferCaptionLanguage(text: string): CaptionLanguage | null {
  const hangul = text.match(/\p{Script=Hangul}/gu)?.length ?? 0
  const kana = text.match(/[\u3040-\u30ff]/gu)?.length ?? 0
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  if (hangul > 0 && hangul * 2 >= letters) return 'ko'
  if (kana > 0) return 'ja'
  return null
}

function groupWords(words: TranscriptWord[]): CaptionLine[] {
  const groups: CaptionLine[] = []
  for (const word of words) {
    const text = word.text.trim()
    if (!text) continue
    const language = word.language ?? inferCaptionLanguage(text)
    const last = groups[groups.length - 1]
    if (last && last.speaker === word.speaker && last.language === language) {
      last.text = `${last.text} ${text}`
    } else {
      groups.push({ speaker: word.speaker, language, text })
    }
  }
  return groups.filter((group) => isSpeakable(group.text))
}

function isSpeakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}
