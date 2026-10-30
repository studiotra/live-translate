import type { CaptionLanguage } from '../../../shared/ipc'
import { isSpeechHold } from './playbackHold'
import { startPcmCapture } from './pcmCapture'
import type { TranscriptWord } from './transcript'

export interface DeepgramTranscript {
  text: string
  words: TranscriptWord[]
  isFinal: boolean
  speechFinal: boolean
}

export interface DeepgramSession {
  stop: () => Promise<void>
}

interface ListenOptions {
  apiKey: string
  onTranscript: (event: DeepgramTranscript) => void
  onError: (error: Error) => void
}

const KEYTERMS = [
  'carbon capture',
  'hydrogen fuel cell',
  'grid modernization',
  'ESG',
  'Deepgram',
  'OpenAI',
  'Live Translate'
]

export async function startDeepgram({ apiKey, onTranscript, onError }: ListenOptions): Promise<DeepgramSession> {
  const stream = await captureMicrophone()
  let socket: WebSocket | null = null
  let stopPcm: (() => Promise<void>) | null = null
  let keepAlive: ReturnType<typeof setInterval> | null = null
  let closed = false
  let shutdownPromise: Promise<void> | null = null

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise
    closed = true
    shutdownPromise = (async () => {
      if (keepAlive) clearInterval(keepAlive)
      await stopPcm?.()
      stopPcm = null

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'CloseStream' }))
        await wait(400)
      }

      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close()
      }

      stream.getTracks().forEach((track) => track.stop())
    })()
    return shutdownPromise
  }

  try {
    socket = openSocket(apiKey)
    await waitForOpen(socket)
    if (closed) {
      await shutdown()
      return { stop: shutdown }
    }

    const liveSocket = socket
    socket.addEventListener('message', (event) => {
      const transcript = readTranscript(event.data)
      if (transcript) onTranscript(transcript)
      const failure = readFailure(event.data)
      if (failure) onError(failure)
    })
    socket.addEventListener('close', () => {
      if (!closed) onError(new Error('The Deepgram connection closed.'))
    })

    stopPcm = await startPcmCapture(stream, (pcm) => {
      if (liveSocket.readyState !== WebSocket.OPEN) return
      liveSocket.send(isSpeechHold() ? new ArrayBuffer(pcm.byteLength) : pcm)
    })

    keepAlive = setInterval(() => {
      if (liveSocket.readyState === WebSocket.OPEN) {
        liveSocket.send(JSON.stringify({ type: 'KeepAlive' }))
      }
    }, 4000)

    return { stop: shutdown }
  } catch (error) {
    await shutdown()
    throw error
  }
}

function captureMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('This environment cannot capture microphone audio.'))
  }

  return navigator.mediaDevices
    .getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }))
    .catch((error: unknown) => {
      throw microphoneError(error)
    })
}

function microphoneError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return new Error('Microphone permission was denied.')
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return new Error('No microphone was found.')
    }
    if (error.name === 'NotReadableError') {
      return new Error('The microphone is in use by another application.')
    }
  }
  return error instanceof Error ? error : new Error('Could not start the microphone.')
}

function openSocket(apiKey: string): WebSocket {
  const url = new URL('wss://api.deepgram.com/v1/listen')
  url.searchParams.set('model', 'nova-3')
  url.searchParams.set('language', 'multi')
  for (const hint of ['en', 'ko', 'ja']) url.searchParams.append('language_hint', hint)
  url.searchParams.set('punctuate', 'true')
  url.searchParams.set('smart_format', 'true')
  url.searchParams.set('interim_results', 'true')
  url.searchParams.set('endpointing', '100')
  url.searchParams.set('diarize', 'true')
  url.searchParams.set('encoding', 'linear16')
  url.searchParams.set('sample_rate', '16000')
  url.searchParams.set('channels', '1')
  for (const term of KEYTERMS) url.searchParams.append('keyterm', term)
  return new WebSocket(url, ['token', apiKey])
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (event: CloseEvent) => {
      reject(new Error(event.reason || `Deepgram rejected the connection (${event.code}). Check the API key.`))
    }
    const onSocketError = () => reject(new Error('Could not reach Deepgram.'))
    socket.addEventListener('open', () => {
      socket.removeEventListener('close', fail)
      socket.removeEventListener('error', onSocketError)
      resolve()
    })
    socket.addEventListener('error', onSocketError)
    socket.addEventListener('close', fail)
  })
}

function readTranscript(data: unknown): DeepgramTranscript | null {
  const message = parseMessage(data)
  if (!message || message.type !== 'Results') return null

  const channel = message.channel
  const alternatives = channel && typeof channel === 'object' && 'alternatives' in channel ? channel.alternatives : undefined
  const alternative = Array.isArray(alternatives) ? alternatives[0] : undefined
  const record = alternative && typeof alternative === 'object' ? (alternative as Record<string, unknown>) : null
  const text = record && typeof record.transcript === 'string' ? record.transcript : ''
  const words = record ? readWords(record.words, dominantLanguage(record.languages)) : []
  if (!text.trim() && words.length === 0 && message.is_final !== true) return null

  return {
    text,
    words,
    isFinal: message.is_final === true,
    speechFinal: message.speech_final === true
  }
}

function readWords(value: unknown, fallbackLanguage: CaptionLanguage | null): TranscriptWord[] {
  if (!Array.isArray(value)) return []
  const words: TranscriptWord[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const word = entry as Record<string, unknown>
    const text = typeof word.punctuated_word === 'string' ? word.punctuated_word : typeof word.word === 'string' ? word.word : ''
    if (!text.trim()) continue
    words.push({
      text,
      speaker: typeof word.speaker === 'number' ? word.speaker : null,
      language: captionLanguage(word.language) ?? fallbackLanguage
    })
  }
  return words
}

function dominantLanguage(value: unknown): CaptionLanguage | null {
  if (!Array.isArray(value)) return null
  for (const entry of value) {
    const language = captionLanguage(entry)
    if (language) return language
  }
  return null
}

function captionLanguage(value: unknown): CaptionLanguage | null {
  if (typeof value !== 'string') return null
  const code = value.toLowerCase()
  if (code.startsWith('ko')) return 'ko'
  if (code.startsWith('ja')) return 'ja'
  if (code.startsWith('en')) return 'en'
  return null
}

function readFailure(data: unknown): Error | null {
  const message = parseMessage(data)
  if (!message) return null
  if (message.type !== 'Error' && !message.err_msg) return null
  const detail = message.description || message.message || message.err_msg
  return new Error(typeof detail === 'string' ? detail : 'Deepgram returned an error.')
}

function parseMessage(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'string') return null
  try {
    const message: unknown = JSON.parse(data)
    if (!message || typeof message !== 'object') return null
    return message as Record<string, unknown>
  } catch {
    return null
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
