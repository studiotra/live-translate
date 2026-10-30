import { startDeepgram, type DeepgramSession } from './deepgram'
import { requireKey } from './keys'
import { isSpeechHold } from './playbackHold'
import { applyTranscript, emptyTranscript, flushTranscript, type CaptionLine, type TranscriptState } from './transcript'

interface LiveSessionOptions {
  onTranscript: (state: TranscriptState) => void
  onSentence: (phrase: CaptionLine) => void
  onError: (error: Error) => void
}

export interface LiveSession {
  start: () => Promise<void>
  stop: () => Promise<void>
  dropInterim: () => void
}

export function createLiveSession(options: LiveSessionOptions): LiveSession {
  let state = emptyTranscript
  let connectionPromise: Promise<DeepgramSession> | null = null
  let stopPromise: Promise<void> | null = null
  let accepting = true

  const publish = (next: TranscriptState, phrases: CaptionLine[]) => {
    state = next
    options.onTranscript(state)
    for (const phrase of phrases) options.onSentence(phrase)
  }

  return {
    async start() {
      connectionPromise = startDeepgram({
        apiKey: requireKey('deepgram'),
        onTranscript: (event) => {
          if (!accepting || isSpeechHold()) return
          const result = applyTranscript(state, event)
          publish(result.state, result.phrases)
        },
        onError: (error) => {
          if (accepting) options.onError(error)
        }
      })

      const connection = await connectionPromise
      if (stopPromise) await connection.stop()
    },
    dropInterim() {
      if (state.interim.length === 0) return
      state = { ...state, interim: [] }
      options.onTranscript(state)
    },
    stop() {
      if (stopPromise) return stopPromise
      stopPromise = (async () => {
        try {
          if (connectionPromise) {
            const connection = await connectionPromise
            await connection.stop()
          }
        } catch {
          // start() reports connection failures to the controller.
        }

        accepting = false
        const result = flushTranscript(state)
        if (result.phrases.length > 0) publish(result.state, result.phrases)
      })()
      return stopPromise
    }
  }
}
