import { useEffect, useRef, useState } from 'react'
import { CAPTION_LANGUAGES, type CaptionLanguage, type SessionState, type TranscriptSnapshot } from '../../../shared/ipc'
import { checkApiKey, currentKeys, refreshKeys, requireKey, type KeySource, type ResolvedKeys } from '../lib/keys'
import { setSpeechHold } from '../lib/playbackHold'
import { resetOpenAI } from '../lib/translate'
import { createLiveSession, type LiveSession } from '../lib/liveSession'
import { formatScript, type MeetingTurn, type ScriptSections } from '../lib/meetingLog'
import { flushPhrases, pushPhrase, type PhraseChunk } from '../lib/phraseBatch'
import { summarizeMeeting } from '../lib/summarize'
import { inferCaptionLanguage, speakerLabel } from '../lib/transcript'
import { translateSentence } from '../lib/translate'
import { useCaptionSize } from './useCaptionSize'

const idleSession: SessionState = { recording: false, translatorsOpen: false }
const emptyCaption: TranscriptSnapshot = { lines: [], interim: [] }
const PHRASE_PAUSE_MS = 1600
const MAX_CALLS_PER_MINUTE = 40

const TEST_LINES: Record<CaptionLanguage, string> = {
  en: 'Test Translation',
  ko: '테스트 번역',
  ja: 'テスト翻訳'
}

function emptyLanguageLines(): Record<CaptionLanguage, string[]> {
  return { en: [], ko: [], ja: [] }
}

export function ControllerWindow() {
  const [session, setSession] = useState<SessionState>(idleSession)
  const [notice, setNotice] = useState('Ready')
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [savingScript, setSavingScript] = useState(false)
  const [keys, setKeys] = useState<ResolvedKeys | null>(null)
  const [deepgramDraft, setDeepgramDraft] = useState('')
  const [openaiDraft, setOpenaiDraft] = useState('')
  const [savingKeys, setSavingKeys] = useState(false)
  const [checkingKeys, setCheckingKeys] = useState(false)
  const [apiCalls, setApiCalls] = useState(0)
  const sessionRef = useRef<LiveSession | null>(null)
  const stopRequested = useRef(false)
  const discarding = useRef(false)
  const halting = useRef(false)
  const generation = useRef(0)
  const translations = useRef<Promise<void>>(Promise.resolve())
  const logRef = useRef<MeetingTurn[]>([])
  const translatedRef = useRef<Record<CaptionLanguage, string[]>>(emptyLanguageLines())
  const captionRef = useRef<TranscriptSnapshot>(emptyCaption)
  const phraseBuffer = useRef<PhraseChunk[]>([])
  const phraseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callTimes = useRef<number[]>([])
  const limitNoticeSent = useRef(false)
  const textSize = useCaptionSize()

  useEffect(() => {
    document.title = 'Live Translate'
    let active = true

    void window.api
      .getSession()
      .then((next) => {
        if (active) setSession(next)
      })
      .catch((error: unknown) => {
        if (active) setNotice(errorText(error))
      })

    void refreshKeys()
      .then((next) => {
        if (!active) return
        setKeys(next)
        if (next.deepgramSource === 'missing' || next.openaiSource === 'missing') {
          setNotice('Add your Deepgram and OpenAI keys below. They stay on this Mac.')
        }
      })
      .catch((error: unknown) => {
        if (active) setNotice(errorText(error))
      })

    const unsubscribe = window.api.onSession((next) => setSession(next))
    const unsubscribeHello = window.api.onCaptionHello(() => replayCaptions())
    const unsubscribeSpeech = window.api.onSpeechHold((activeHold) => {
      setSpeechHold(activeHold)
      if (activeHold) sessionRef.current?.dropInterim()
    })
    return () => {
      active = false
      unsubscribe()
      unsubscribeHello()
      unsubscribeSpeech()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (phraseTimer.current) clearTimeout(phraseTimer.current)
      void sessionRef.current?.stop()
    }
  }, [])

  function replayCaptions(): void {
    const caption = captionRef.current
    if (caption.lines.length > 0 || caption.interim.length > 0) {
      window.api.publishOriginal({ type: 'update', lines: caption.lines, interim: caption.interim })
    }
    for (const language of CAPTION_LANGUAGES) {
      const lines = translatedRef.current[language]
      if (lines.length > 0) window.api.publishTranslated({ type: 'update', language, lines })
    }
  }

  function publishTranslations(): void {
    for (const language of CAPTION_LANGUAGES) {
      translatedRef.current[language] = logRef.current.map((turn) => turn[language]).filter((text) => text.length > 0)
      window.api.publishTranslated({ type: 'update', language, lines: translatedRef.current[language] })
    }
  }

  function clearPhraseTimer(): void {
    if (!phraseTimer.current) return
    clearTimeout(phraseTimer.current)
    phraseTimer.current = null
  }

  function allowTranslationCall(): boolean {
    const now = Date.now()
    callTimes.current = callTimes.current.filter((time) => now - time < 60_000)
    if (callTimes.current.length >= MAX_CALLS_PER_MINUTE) {
      if (!limitNoticeSent.current) {
        limitNoticeSent.current = true
        setNotice('Translation paused for a minute so API calls stay limited. Speech is still being captured.')
      }
      return false
    }
    callTimes.current.push(now)
    limitNoticeSent.current = false
    return true
  }

  function enqueueTranslation(
    speaker: number | null,
    language: CaptionLanguage | null,
    sentence: string,
    ticket: number
  ): void {
    const index = logRef.current.length
    const source = language ?? inferCaptionLanguage(sentence)
    logRef.current.push({ original: speakerLabel(speaker, sentence), en: '', ko: '', ja: '' })
    if (!allowTranslationCall()) return
    setApiCalls((count) => count + 1)
    translations.current = translations.current
      .then(async () => {
        const text = await translateSentence(sentence, source)
        if (ticket !== generation.current) return
        const turn = logRef.current[index]
        if (!turn) return
        for (const language of CAPTION_LANGUAGES) {
          const line = text[language].trim()
          if (line) turn[language] = speakerLabel(speaker, line)
        }
        publishTranslations()
      })
      .catch((error: unknown) => {
        if (ticket === generation.current) setNotice(errorText(error))
      })
  }

  function releasePhrases(ticket: number): void {
    clearPhraseTimer()
    const flushed = flushPhrases(phraseBuffer.current)
    phraseBuffer.current = flushed.buffer
    for (const batch of flushed.ready) enqueueTranslation(batch.speaker, batch.language, batch.text, ticket)
  }

  function queuePhrase(speaker: number | null, language: CaptionLanguage | null, text: string, ticket: number): void {
    const result = pushPhrase(phraseBuffer.current, speaker, language, text)
    phraseBuffer.current = result.buffer
    for (const batch of result.ready) enqueueTranslation(batch.speaker, batch.language, batch.text, ticket)
    if (phraseBuffer.current.length === 0) {
      clearPhraseTimer()
      return
    }
    clearPhraseTimer()
    phraseTimer.current = setTimeout(() => releasePhrases(ticket), PHRASE_PAUSE_MS)
  }

  async function halt(fallbackNotice: string): Promise<void> {
    if (halting.current) return
    halting.current = true
    stopRequested.current = true
    setStopping(true)
    try {
      await sessionRef.current?.stop()
      sessionRef.current = null
      releasePhrases(generation.current)
      await translations.current
      window.api.publishOriginal({ type: 'stopped' })
      const next = await window.api.setRecording(false)
      setSession(next)

      const turns = logRef.current.filter((turn) => turn.original.trim().length > 0)
      if (turns.length === 0) {
        setNotice(fallbackNotice)
        return
      }

      setSummarizing(true)
      setNotice('Writing the meeting summary…')
      const markdown = await summarizeMeeting(turns)
      await window.api.saveSummary(markdown)
      setNotice('Summary saved to Desktop!')
    } catch (error) {
      setNotice(errorText(error))
    } finally {
      setSummarizing(false)
      setStopping(false)
      setStarting(false)
      halting.current = false
    }
  }

  function capturedLines(): ScriptSections {
    const caption = captionRef.current
    const originalFromCaption = [...caption.lines, ...caption.interim]
      .map((line) => speakerLabel(line.speaker, line.text))
      .filter((text) => text.length > 0)
    const originalFromLog = logRef.current.map((turn) => turn.original.trim()).filter((text) => text.length > 0)
    return {
      original: originalFromCaption.length > 0 ? originalFromCaption : originalFromLog,
      en: languageLines('en'),
      ko: languageLines('ko'),
      ja: languageLines('ja')
    }
  }

  function languageLines(language: CaptionLanguage): string[] {
    const fromWindow = translatedRef.current[language].map((line) => line.trim()).filter((text) => text.length > 0)
    if (fromWindow.length > 0) return fromWindow
    return logRef.current.map((turn) => turn[language].trim()).filter((text) => text.length > 0)
  }

  function hasCapturedText(sections: ScriptSections): boolean {
    return sections.original.length > 0 || sections.en.length > 0 || sections.ko.length > 0 || sections.ja.length > 0
  }

  async function downloadScript(): Promise<void> {
    setSavingScript(true)
    setNotice('Saving the transcript…')
    try {
      await translations.current
      const sections = capturedLines()
      if (!hasCapturedText(sections)) {
        setNotice('No transcript to download.')
        return
      }
      const dateLabel = new Date().toLocaleString('en-CA', { hour12: false })
      const saved = await window.api.saveTranscript(formatScript(sections, dateLabel))
      const name = saved.filePath.split(/[/\\]/).pop() ?? 'Transcript'
      setNotice(`Saved ${name} on the Desktop.`)
    } finally {
      setSavingScript(false)
    }
  }

  async function deleteTranscript(): Promise<void> {
    if (halting.current) return
    const sections = capturedLines()
    const recording = sessionRef.current !== null
    if (!recording && !hasCapturedText(sections)) {
      setNotice('No transcript to delete.')
      return
    }

    halting.current = true
    discarding.current = true
    stopRequested.current = true
    generation.current += 1
    clearPhraseTimer()
    phraseBuffer.current = []
    setStopping(true)
    try {
      await sessionRef.current?.stop()
      sessionRef.current = null
      logRef.current = []
      translatedRef.current = emptyLanguageLines()
      captionRef.current = emptyCaption
      window.api.publishOriginal({ type: 'reset' })
      window.api.publishTranslated({ type: 'reset' })
      const next = await window.api.setRecording(false)
      setSession(next)
      setNotice('Transcript deleted.')
    } catch (error) {
      setNotice(errorText(error))
    } finally {
      discarding.current = false
      setStopping(false)
      setStarting(false)
      halting.current = false
    }
  }

  async function startRecording(): Promise<void> {
    stopRequested.current = false
    discarding.current = false
    setStarting(true)
    logRef.current = []
    translatedRef.current = emptyLanguageLines()
    captionRef.current = emptyCaption
    phraseBuffer.current = []
    clearPhraseTimer()
    callTimes.current = []
    limitNoticeSent.current = false
    setApiCalls(0)
    const ticket = generation.current + 1
    generation.current = ticket

    try {
      const loaded = await refreshKeys()
      setKeys(loaded)
      requireKey('deepgram')
      requireKey('openai')
      if (stopRequested.current) return

      await window.api.ensureMicrophone()
      if (stopRequested.current) return

      await window.api.openTranslators(false)
      window.api.publishOriginal({ type: 'reset' })
      window.api.publishTranslated({ type: 'reset' })
      if (stopRequested.current) return

      const live = createLiveSession({
        onTranscript: (snapshot) => {
          captionRef.current = snapshot
          window.api.publishOriginal({ type: 'update', lines: snapshot.lines, interim: snapshot.interim })
        },
        onSentence: (phrase) => {
          if (discarding.current) return
          queuePhrase(phrase.speaker, phrase.language, phrase.text, ticket)
        },
        onError: (error) => {
          void halt(error.message)
        }
      })
      sessionRef.current = live
      await live.start()
      if (stopRequested.current) return

      const next = await window.api.setRecording(true)
      setSession(next)
      setNotice('Listening. Korean, English, and Japanese are recognized automatically.')
    } finally {
      setStarting(false)
    }
  }

  async function saveKeys(): Promise<void> {
    setSavingKeys(true)
    try {
      await window.api.saveApiKeys({
        deepgram: deepgramDraft.trim() || undefined,
        openai: openaiDraft.trim() || undefined
      })
      resetOpenAI()
      setDeepgramDraft('')
      setOpenaiDraft('')
      setKeys(await refreshKeys())
      setNotice('API keys saved on this Mac.')
    } catch (error) {
      setNotice(errorText(error))
    } finally {
      setSavingKeys(false)
    }
  }

  async function checkKeys(): Promise<void> {
    setCheckingKeys(true)
    setNotice('Checking API keys…')
    try {
      const loaded = currentKeys()
      const [deepgram, openai] = await Promise.all([
        checkApiKey('deepgram', deepgramDraft.trim() || loaded.deepgram),
        checkApiKey('openai', openaiDraft.trim() || loaded.openai)
      ])
      setNotice(`${deepgram} ${openai}`)
    } catch (error) {
      setNotice(errorText(error))
    } finally {
      setCheckingKeys(false)
    }
  }

  async function forgetKeys(): Promise<void> {
    setSavingKeys(true)
    try {
      await window.api.clearApiKeys()
      resetOpenAI()
      setDeepgramDraft('')
      setOpenaiDraft('')
      setKeys(await refreshKeys())
      setNotice('Saved API keys were removed from this Mac.')
    } catch (error) {
      setNotice(errorText(error))
    } finally {
      setSavingKeys(false)
    }
  }

  return (
    <main className="flex h-full flex-col overflow-y-auto bg-[#121417] px-8 py-7 text-[#f4f1ea]">
      <header className="mb-8">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-[#a39e94] uppercase">Controller</p>
        <h1 className="mt-2 text-[2rem] leading-none font-medium tracking-tight">Live Translate</h1>
      </header>

      <section className="mb-6 flex items-center justify-between border-y border-white/10 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${session.recording ? 'bg-[#ff5a36]' : 'bg-[#5f5a53]'}`}
            aria-hidden
          />
          {session.recording ? 'Recording' : 'Idle'}
        </span>
        <span className="text-[#a39e94]">{session.translatorsOpen ? 'Translators open' : 'Translators closed'}</span>
      </section>

      <p className="mb-6 text-sm text-[#a39e94]">Translation calls: {apiCalls}</p>

      <section className="mb-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">API keys</h2>
          <p className="text-xs text-[#a39e94]">Saved on this Mac</p>
        </div>
        <KeyField
          label="Deepgram"
          source={keys?.deepgramSource ?? 'missing'}
          value={deepgramDraft}
          onChange={setDeepgramDraft}
        />
        <KeyField
          label="OpenAI"
          source={keys?.openaiSource ?? 'missing'}
          value={openaiDraft}
          onChange={setOpenaiDraft}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <ActionButton
            tone="quiet"
            disabled={savingKeys || checkingKeys || stopping || starting || session.recording}
            onClick={() => void saveKeys()}
          >
            {savingKeys ? 'Saving keys…' : 'Save keys'}
          </ActionButton>
          <ActionButton tone="quiet" disabled={savingKeys || checkingKeys || stopping} onClick={() => void checkKeys()}>
            {checkingKeys ? 'Checking…' : 'Check keys'}
          </ActionButton>
        </div>
        <button
          type="button"
          disabled={savingKeys || checkingKeys || stopping || starting || session.recording}
          onClick={() => void forgetKeys()}
          className="mt-3 text-sm text-[#a39e94] underline-offset-2 hover:text-[#f4f1ea] hover:underline disabled:opacity-40"
        >
          Remove saved keys
        </button>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>Caption size</span>
          <span className="text-[#a39e94]">{textSize.size}px</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton tone="quiet" disabled={!textSize.canSmaller} onClick={textSize.smaller}>
            A− Smaller
          </ActionButton>
          <ActionButton tone="quiet" disabled={!textSize.canLarger} onClick={textSize.larger}>
            A+ Larger
          </ActionButton>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <ActionButton
            tone={session.recording || starting ? 'quiet' : 'solid'}
            disabled={starting || stopping || session.recording}
            onClick={() => {
              void startRecording().catch((error: unknown) => setNotice(errorText(error)))
            }}
          >
            Start Recording
          </ActionButton>
          <ActionButton
            tone={session.recording || starting ? 'solid' : 'quiet'}
            disabled={stopping || (!starting && !session.recording)}
            onClick={() => {
              void halt('Recording stopped.')
            }}
          >
            {summarizing ? 'Saving summary…' : 'Stop Recording'}
          </ActionButton>
        </div>
        <ActionButton
          tone="quiet"
          disabled={starting || stopping || savingScript}
          onClick={() => {
            void downloadScript().catch((error: unknown) => setNotice(errorText(error)))
          }}
        >
          {savingScript ? 'Saving transcript…' : 'Download Script'}
        </ActionButton>
        <ActionButton
          tone="ghost"
          disabled={starting || stopping}
          onClick={() => {
            void deleteTranscript()
          }}
        >
          Delete Transcript
        </ActionButton>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton
            tone="quiet"
            disabled={starting || stopping}
            onClick={() => {
              void window.api
                .openTranslators(true)
                .then((result) => {
                  setNotice(result.alreadyOpen ? 'Translator windows focused.' : 'Translator windows opened.')
                })
                .catch((error: unknown) => setNotice(errorText(error)))
            }}
          >
            Open Translators
          </ActionButton>
          <ActionButton
            tone="quiet"
            disabled={starting || stopping || !session.translatorsOpen}
            onClick={() => {
              void window.api
                .closeTranslators()
                .then(() =>
                  setNotice(session.recording ? 'Translator windows closed. Recording is still on.' : 'Translator windows closed.')
                )
                .catch((error: unknown) => setNotice(errorText(error)))
            }}
          >
            Close Translators
          </ActionButton>
        </div>
      </div>

      <div className="mt-8 border-t border-white/10 pt-6">
        <ActionButton
          tone="ghost"
          disabled={starting || stopping}
          onClick={() => {
            if (!session.translatorsOpen) {
              setNotice('Open the translator windows before sending text.')
              return
            }
            window.api.publishOriginal({ type: 'append', text: 'Test Source' })
            for (const language of CAPTION_LANGUAGES) {
              translatedRef.current[language] = [...translatedRef.current[language], TEST_LINES[language]]
              window.api.publishTranslated({ type: 'update', language, lines: translatedRef.current[language] })
            }
            setNotice('Sent test text to the original window and all three language screens.')
          }}
        >
          Test Send
        </ActionButton>
        <p className="mt-3 text-sm leading-relaxed text-[#a39e94]">
          Sends “Test Source” to the original window, and a test line to English, Korean, and Japanese.
        </p>
      </div>

      <p className="mt-auto flex items-center gap-2 pt-6 text-sm text-[#d8d2c8]" role="status">
        {summarizing && <span className="h-2 w-2 animate-pulse rounded-full bg-[#f4f1ea]" aria-hidden />}
        {notice}
      </p>
    </main>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'solid'
}: {
  children: string
  onClick: () => void
  disabled: boolean
  tone?: 'solid' | 'quiet' | 'ghost'
}) {
  const toneClass =
    tone === 'solid'
      ? 'bg-[#f4f1ea] text-[#121417]'
      : tone === 'quiet'
        ? 'bg-transparent text-[#f4f1ea] ring-1 ring-white/20'
        : 'bg-transparent text-[#f4f1ea] ring-1 ring-[#ff5a36]/70'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-11 rounded-full px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  )
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function sourceLabel(source: KeySource): string {
  if (source === 'saved') return 'Saved on this Mac'
  if (source === 'build') return 'Using the development key'
  return 'Needed'
}

function KeyField({
  label,
  source,
  value,
  onChange
}: {
  label: string
  source: KeySource
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs text-[#a39e94]">{sourceLabel(source)}</span>
      </span>
      <input
        type="password"
        value={value}
        autoComplete="off"
        spellCheck={false}
        placeholder={source === 'missing' ? 'Paste your key' : 'Paste a new key to replace it'}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-full border border-white/15 bg-transparent px-4 text-sm outline-none placeholder:text-[#6f6a62] focus:border-white/40"
      />
    </label>
  )
}
