import { useEffect, useRef, useState } from 'react'
import { LANGUAGE_LABELS, type CaptionLanguage } from '../../../shared/ipc'
import { OverlayHeader } from './OverlayHeader'
import { captionTextStyle, useCaptionSize } from './useCaptionSize'

const PLACEHOLDERS: Record<CaptionLanguage, string> = {
  en: 'Waiting for English...',
  ko: 'Waiting for Korean...',
  ja: 'Waiting for Japanese...'
}

const SPEECH_LANG: Record<CaptionLanguage, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP'
}

function speechStorageKey(language: CaptionLanguage): string {
  return `caption-speech-${language}`
}

function readSpeechEnabled(language: CaptionLanguage): boolean {
  return localStorage.getItem(speechStorageKey(language)) !== 'off'
}

function spokenText(line: string): string {
  return line.replace(/^P\d+\s+/, '').trim()
}

function releaseSpeech(): void {
  const synth = window.speechSynthesis
  if (synth?.speaking || synth?.pending) return
  window.api.setSpeechPlayback(false)
}

function stopSpeech(): void {
  window.speechSynthesis?.cancel()
  window.api.setSpeechPlayback(false)
}

function speakLine(language: CaptionLanguage, line: string): void {
  const text = spokenText(line)
  if (!text || typeof window.speechSynthesis === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = SPEECH_LANG[language]
  const voice = window.speechSynthesis
    .getVoices()
    .find((item) => item.lang.toLowerCase().startsWith(language))
  if (voice) utterance.voice = voice
  utterance.onend = releaseSpeech
  utterance.onerror = releaseSpeech
  window.api.setSpeechPlayback(true)
  window.speechSynthesis.speak(utterance)
}

export function TranslatedWindow({ language }: { language: CaptionLanguage }) {
  const [lines, setLines] = useState<string[]>([])
  const [speechOn, setSpeechOn] = useState(() => readSpeechEnabled(language))
  const scrollerRef = useRef<HTMLDivElement>(null)
  const textSize = useCaptionSize()
  const title = LANGUAGE_LABELS[language]
  const speechOnRef = useRef(speechOn)
  const primed = useRef(false)
  const spokenCount = useRef(0)

  useEffect(() => {
    speechOnRef.current = speechOn
  }, [speechOn])

  useEffect(() => {
    window.speechSynthesis?.getVoices()
    const warmVoices = () => window.speechSynthesis?.getVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', warmVoices)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', warmVoices)
      stopSpeech()
    }
  }, [])

  useEffect(() => {
    document.title = title
    window.api.announceCaption()
    return window.api.onTranslatedCaption((message) => {
      if (message.type === 'reset') {
        stopSpeech()
        primed.current = true
        spokenCount.current = 0
        setLines([])
        return
      }
      if (message.language !== language) return
      setLines(message.lines)
      if (!primed.current) {
        spokenCount.current = message.lines.length
        primed.current = true
        return
      }
      const fresh = message.lines.slice(spokenCount.current)
      spokenCount.current = message.lines.length
      if (!speechOnRef.current) return
      for (const line of fresh) speakLine(language, line)
    })
  }, [language, title])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTop = scroller.scrollHeight
  }, [lines])

  function toggleSpeech(): void {
    const next = !speechOn
    setSpeechOn(next)
    localStorage.setItem(speechStorageKey(language), next ? 'on' : 'off')
    if (!next) {
      stopSpeech()
      return
    }
    const latest = lines[lines.length - 1]
    if (latest) speakLine(language, latest)
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl bg-black/70 text-white ring-1 ring-white/15">
      <OverlayHeader
        title={title}
        onSmaller={textSize.smaller}
        onLarger={textSize.larger}
        canSmaller={textSize.canSmaller}
        canLarger={textSize.canLarger}
        speechOn={speechOn}
        onToggleSpeech={toggleSpeech}
      />
      <div ref={scrollerRef} className="no-drag min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {lines.length === 0 ? (
          <p className="font-medium text-white/75" style={captionTextStyle(textSize.size)}>
            {PLACEHOLDERS[language]}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {lines.map((line, index) => (
              <p key={`${index}-${line.slice(0, 24)}`} className="font-medium text-white" style={captionTextStyle(textSize.size)}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
