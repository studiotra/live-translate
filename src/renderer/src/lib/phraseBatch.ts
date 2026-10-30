import type { CaptionLanguage } from '../../../shared/ipc'

export interface PhraseChunk {
  speaker: number | null
  language: CaptionLanguage | null
  text: string
}

export interface PhraseBatch {
  speaker: number | null
  language: CaptionLanguage | null
  text: string
}

const MAX_CHARS = 160
const SENTENCE_END = /[.?!。？！]$|\.\.\.$/

export function pushPhrase(
  buffer: PhraseChunk[],
  speaker: number | null,
  language: CaptionLanguage | null,
  text: string
): { buffer: PhraseChunk[]; ready: PhraseBatch[] } {
  const clean = text.trim()
  if (!clean) return { buffer, ready: [] }

  const ready: PhraseBatch[] = []
  let next = buffer
  const last = next[next.length - 1]
  if (last && (last.speaker !== speaker || last.language !== language)) {
    const flushed = flushPhrases(next)
    ready.push(...flushed.ready)
    next = []
  } else if (last && last.speaker === speaker && last.language === language && last.text === clean) {
    return { buffer, ready }
  }

  next = [...next, { speaker, language, text: clean }]
  const combined = joinChunks(next)
  if (endsSentence(combined) || combined.length >= MAX_CHARS) {
    ready.push({ speaker, language, text: combined })
    return { buffer: [], ready }
  }
  return { buffer: next, ready }
}

export function flushPhrases(buffer: PhraseChunk[]): { buffer: PhraseChunk[]; ready: PhraseBatch[] } {
  if (buffer.length === 0) return { buffer: [], ready: [] }
  return {
    buffer: [],
    ready: [{ speaker: buffer[0].speaker, language: buffer[0].language, text: joinChunks(buffer) }]
  }
}

function joinChunks(chunks: PhraseChunk[]): string {
  return chunks
    .map((chunk) => chunk.text.trim())
    .filter((text) => text.length > 0)
    .join(' ')
}

function endsSentence(text: string): boolean {
  return SENTENCE_END.test(text)
}
