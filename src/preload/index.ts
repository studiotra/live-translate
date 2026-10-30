import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  type CaptionSize,
  type OriginalCaption,
  type SessionState,
  type TranslatedCaption,
  type ApiKeyUpdate,
  type TranslatorApi
} from '../shared/ipc'

const api: TranslatorApi = {
  getSession: () => ipcRenderer.invoke(IpcChannel.GetSession),
  ensureMicrophone: () => ipcRenderer.invoke(IpcChannel.EnsureMicrophone),
  openTranslators: (focus = true) => ipcRenderer.invoke(IpcChannel.OpenTranslators, focus),
  closeTranslators: () => ipcRenderer.invoke(IpcChannel.CloseTranslators),
  closeThisWindow: () => ipcRenderer.send(IpcChannel.CloseThisWindow),
  announceCaption: () => ipcRenderer.send(IpcChannel.CaptionHello),
  onCaptionHello: (callback) => {
    const listener = () => callback()
    ipcRenderer.on(IpcChannel.CaptionHello, listener)
    return () => ipcRenderer.removeListener(IpcChannel.CaptionHello, listener)
  },
  setRecording: (active) => ipcRenderer.invoke(IpcChannel.SetRecording, active),
  publishOriginal: (message) => ipcRenderer.send(IpcChannel.PublishOriginal, message),
  publishTranslated: (message) => ipcRenderer.send(IpcChannel.PublishTranslated, message),
  saveSummary: (markdown) => ipcRenderer.invoke(IpcChannel.SaveSummary, markdown),
  saveTranscript: (markdown) => ipcRenderer.invoke(IpcChannel.SaveTranscript, markdown),
  getApiKeys: () => ipcRenderer.invoke(IpcChannel.GetApiKeys),
  saveApiKeys: (keys: ApiKeyUpdate) => ipcRenderer.invoke(IpcChannel.SaveApiKeys, keys),
  clearApiKeys: () => ipcRenderer.invoke(IpcChannel.ClearApiKeys),
  setCaptionSize: (size) => ipcRenderer.send(IpcChannel.SetCaptionSize, size),
  onCaptionSize: (callback) => {
    const listener = (_event: IpcRendererEvent, size: CaptionSize) => callback(size)
    ipcRenderer.on(IpcChannel.CaptionSize, listener)
    return () => ipcRenderer.removeListener(IpcChannel.CaptionSize, listener)
  },
  onSession: (callback) => {
    const listener = (_event: IpcRendererEvent, session: SessionState) => callback(session)
    ipcRenderer.on(IpcChannel.SessionUpdated, listener)
    return () => ipcRenderer.removeListener(IpcChannel.SessionUpdated, listener)
  },
  onOriginalCaption: (callback) => {
    const listener = (_event: IpcRendererEvent, message: OriginalCaption) => callback(message)
    ipcRenderer.on(IpcChannel.OriginalCaption, listener)
    return () => ipcRenderer.removeListener(IpcChannel.OriginalCaption, listener)
  },
  onTranslatedCaption: (callback) => {
    const listener = (_event: IpcRendererEvent, message: TranslatedCaption) => callback(message)
    ipcRenderer.on(IpcChannel.TranslatedCaption, listener)
    return () => ipcRenderer.removeListener(IpcChannel.TranslatedCaption, listener)
  },
  setSpeechPlayback: (active) => ipcRenderer.send(IpcChannel.SpeechPlayback, active),
  onSpeechHold: (callback) => {
    const listener = (_event: IpcRendererEvent, active: boolean) => callback(active)
    ipcRenderer.on(IpcChannel.SpeechHold, listener)
    return () => ipcRenderer.removeListener(IpcChannel.SpeechHold, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
