import { ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import {
  IpcChannel,
  isCaptionLanguage,
  type CaptionLine,
  type OriginalCaption,
  type TranscriptSnapshot,
  type TranslatedCaption
} from '../shared/ipc'
import { clearApiKeys, readApiKeys, saveApiKeys } from './apiKeys'
import { ensureMicrophoneAccess } from './microphone'
import { setTrayRecording } from './tray'
import { saveMeetingSummary, saveMeetingTranscript } from './summary'
import {
  closeSenderWindow,
  closeTranslatorWindows,
  getSession,
  isControllerSender,
  openTranslatorWindows,
  publishCaptionSize,
  publishOriginal,
  publishTranslated,
  requestCaptionReplay,
  setRecording,
  setSpeechPlayback
} from './windows'

const MAX_TEXT_LENGTH = 8000
const MAX_SEGMENTS = 400
const MAX_SUMMARY_LENGTH = 500_000

function assertController(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!isControllerSender(event.sender.id)) {
    throw new Error('Only the main controller can perform this action.')
  }
}

function readOptionalKey(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error('An API key must be text.')
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 400) throw new Error('That API key is too long.')
  if (/\s/.test(trimmed)) throw new Error('An API key cannot contain spaces.')
  return trimmed
}

function readKeyUpdate(value: unknown): { deepgram?: string; openai?: string } {
  if (!value || typeof value !== 'object') throw new Error('API keys were missing.')
  const input = value as { deepgram?: unknown; openai?: unknown }
  return {
    deepgram: readOptionalKey(input.deepgram),
    openai: readOptionalKey(input.openai)
  }
}

function readMarkdown(value: unknown, emptyMessage: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(emptyMessage)
  }
  if (value.length > MAX_SUMMARY_LENGTH) {
    throw new Error('The file is too long to save.')
  }
  return value
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.slice(0, MAX_TEXT_LENGTH)
}

function readLine(value: unknown): CaptionLine | null {
  if (!value || typeof value !== 'object') return null
  const line = value as Partial<CaptionLine>
  const text = readText(line.text)
  if (text === null) return null
  const speaker =
    typeof line.speaker === 'number' && Number.isInteger(line.speaker) && line.speaker >= 0 && line.speaker < 32
      ? line.speaker
      : null
  return { speaker, text }
}

function readLines(value: unknown): CaptionLine[] | null {
  if (!Array.isArray(value) || !value.every((line) => line && typeof line === 'object')) return null
  return value.slice(-MAX_SEGMENTS).map((line) => readLine(line) ?? { speaker: null, text: '' }).filter((line) => line.text.length > 0)
}

function readSnapshot(value: Partial<TranscriptSnapshot>): TranscriptSnapshot | null {
  const lines = readLines(value.lines)
  const interim = readLines(value.interim)
  if (!lines || !interim) return null
  return { lines, interim }
}

function readOriginal(value: unknown): OriginalCaption | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Partial<OriginalCaption>
  if (message.type === 'reset' || message.type === 'stopped') return { type: message.type }
  if (message.type === 'append') {
    const text = readText(message.text)
    return text === null ? null : { type: 'append', text }
  }
  if (message.type === 'update') {
    const snapshot = readSnapshot(message)
    return snapshot ? { type: 'update', ...snapshot } : null
  }
  return null
}

function readTranslated(value: unknown): TranslatedCaption | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Partial<TranslatedCaption>
  if (message.type === 'reset') return { type: 'reset' }
  if (message.type === 'update' && isCaptionLanguage(message.language) && Array.isArray(message.lines)) {
    const lines = message.lines.filter((line) => typeof line === 'string').slice(-MAX_SEGMENTS).map((line) => line.slice(0, MAX_TEXT_LENGTH))
    return { type: 'update', language: message.language, lines }
  }
  return null
}

export function registerIpc(): void {
  ipcMain.handle(IpcChannel.GetSession, (event) => {
    assertController(event)
    return getSession()
  })

  ipcMain.handle(IpcChannel.EnsureMicrophone, (event) => {
    assertController(event)
    return ensureMicrophoneAccess()
  })

  ipcMain.handle(IpcChannel.OpenTranslators, (event, focus: unknown) => {
    assertController(event)
    return openTranslatorWindows({ focus: focus !== false })
  })

  ipcMain.handle(IpcChannel.CloseTranslators, (event) => {
    assertController(event)
    closeTranslatorWindows()
  })

  ipcMain.on(IpcChannel.CloseThisWindow, (event) => {
    closeSenderWindow(event.sender)
  })

  ipcMain.on(IpcChannel.CaptionHello, (event) => {
    if (isControllerSender(event.sender.id)) return
    requestCaptionReplay()
  })

  ipcMain.handle(IpcChannel.SetRecording, (event, active: unknown) => {
    assertController(event)
    if (typeof active !== 'boolean') {
      throw new Error('Recording state must be a boolean.')
    }
    const session = setRecording(active)
    setTrayRecording(session.recording)
    return session
  })

  ipcMain.handle(IpcChannel.SaveSummary, async (event, payload: unknown) => {
    assertController(event)
    return { filePath: await saveMeetingSummary(readMarkdown(payload, 'The summary was empty.')) }
  })

  ipcMain.handle(IpcChannel.SaveTranscript, async (event, payload: unknown) => {
    assertController(event)
    const filePath = await saveMeetingTranscript(readMarkdown(payload, 'The transcript was empty.'))
    shell.showItemInFolder(filePath)
    return { filePath }
  })

  ipcMain.handle(IpcChannel.GetApiKeys, (event) => {
    assertController(event)
    return readApiKeys()
  })

  ipcMain.handle(IpcChannel.SaveApiKeys, (event, payload: unknown) => {
    assertController(event)
    const update = readKeyUpdate(payload)
    if (!update.deepgram && !update.openai) throw new Error('Paste a key to save it.')
    return saveApiKeys(update)
  })

  ipcMain.handle(IpcChannel.ClearApiKeys, (event) => {
    assertController(event)
    return clearApiKeys()
  })

  ipcMain.on(IpcChannel.PublishOriginal, (event, payload: unknown) => {
    if (!isControllerSender(event.sender.id)) return
    const message = readOriginal(payload)
    if (message) publishOriginal(message)
  })

  ipcMain.on(IpcChannel.SetCaptionSize, (_event, payload: unknown) => {
    publishCaptionSize(payload)
  })

  ipcMain.on(IpcChannel.SpeechPlayback, (event, active: unknown) => {
    if (isControllerSender(event.sender.id) || typeof active !== 'boolean') return
    setSpeechPlayback(event.sender.id, active)
  })

  ipcMain.on(IpcChannel.PublishTranslated, (event, payload: unknown) => {
    if (!isControllerSender(event.sender.id)) return
    const message = readTranslated(payload)
    if (message) publishTranslated(message)
  })
}
