import { app, BrowserWindow, screen } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  CAPTION_LANGUAGES,
  DEFAULT_CAPTION_SIZE,
  IpcChannel,
  isCaptionSize,
  type CaptionSize,
  type OriginalCaption,
  type SessionState,
  type TranslatedCaption,
  type WindowRole
} from '../shared/ipc'

const OVERLAY_ROLES = ['original', ...CAPTION_LANGUAGES] as const
type OverlayRole = (typeof OVERLAY_ROLES)[number]

const OVERLAY_TITLES: Record<OverlayRole, string> = {
  original: 'Original Text',
  en: 'English',
  ko: '한국어',
  ja: '日本語'
}

let controllerWindow: BrowserWindow | null = null
const overlayWindows: Record<OverlayRole, BrowserWindow | null> = {
  original: null,
  en: null,
  ko: null,
  ja: null
}
let recording = false
let captionSize: CaptionSize | null = null
let openingTranslators: Promise<void> | null = null

function savedCaptionSize(): CaptionSize {
  if (captionSize !== null) return captionSize
  try {
    const raw = JSON.parse(readFileSync(join(app.getPath('userData'), 'caption-size.json'), 'utf8')) as { size?: unknown }
    captionSize = isCaptionSize(raw.size) ? raw.size : DEFAULT_CAPTION_SIZE
  } catch {
    captionSize = DEFAULT_CAPTION_SIZE
  }
  return captionSize
}

function isAlive(window: BrowserWindow | null): window is BrowserWindow {
  return window !== null && !window.isDestroyed()
}

function webPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
}

export function loadWindow(window: BrowserWindow, role: WindowRole): void {
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) window.webContents.send(IpcChannel.CaptionSize, savedCaptionSize())
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = new URL(devUrl)
    url.searchParams.set('role', role)
    void window.loadURL(url.toString())
    return
  }

  void window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: { role }
  })
}

export function getSession(): SessionState {
  return {
    recording,
    translatorsOpen: OVERLAY_ROLES.some((role) => isAlive(overlayWindows[role]))
  }
}

export function isControllerSender(webContentsId: number): boolean {
  return isAlive(controllerWindow) && controllerWindow.webContents.id === webContentsId
}

const speakingWindows = new Set<number>()

function publishSpeechHold(): void {
  if (!isAlive(controllerWindow)) return
  controllerWindow.webContents.send(IpcChannel.SpeechHold, speakingWindows.size > 0)
}

export function setSpeechPlayback(webContentsId: number, active: boolean): void {
  if (active) speakingWindows.add(webContentsId)
  else speakingWindows.delete(webContentsId)
  publishSpeechHold()
}

export function clearSpeechPlayback(webContentsId: number): void {
  if (!speakingWindows.delete(webContentsId)) return
  publishSpeechHold()
}

function publishSession(): void {
  if (!isAlive(controllerWindow)) return
  controllerWindow.webContents.send(IpcChannel.SessionUpdated, getSession())
}

export function requestCaptionReplay(): void {
  if (!isAlive(controllerWindow)) return
  controllerWindow.webContents.send(IpcChannel.CaptionHello)
}

export function showControllerWindow(): BrowserWindow {
  if (!isAlive(controllerWindow)) return createControllerWindow()

  const window = controllerWindow
  if (window.isMinimized()) window.restore()
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  window.show()
  window.focus()
  if (process.platform === 'darwin') {
    setTimeout(() => {
      if (!window.isDestroyed()) window.setVisibleOnAllWorkspaces(false)
    }, 80)
  }
  return window
}

export function createControllerWindow(): BrowserWindow {
  if (isAlive(controllerWindow)) return showControllerWindow()

  const window = new BrowserWindow({
    width: 420,
    height: 1080,
    minWidth: 380,
    minHeight: 800,
    show: false,
    title: 'Live Translate',
    backgroundColor: '#121417',
    autoHideMenuBar: true,
    webPreferences: webPreferences()
  })

  controllerWindow = window
  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    controllerWindow = null
    closeTranslatorWindows()
  })

  loadWindow(window, 'controller')
  return window
}

function overlayBounds(role: OverlayRole): { x: number; y: number; width: number; height: number } {
  const anchor = isAlive(controllerWindow) ? controllerWindow.getBounds() : undefined
  const display = anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay()
  const area = display.workArea
  const width = Math.min(720, Math.max(420, area.width - 80))
  const gap = 8
  const count = OVERLAY_ROLES.length
  const height = Math.max(150, Math.min(210, Math.floor((area.height - 32 - gap * (count - 1)) / count)))
  const index = OVERLAY_ROLES.indexOf(role)
  const stackHeight = count * height + (count - 1) * gap
  const x = area.x + 32
  const y = area.y + area.height - 16 - stackHeight + index * (height + gap)
  return { x, y, width, height }
}

function createOverlayWindow(role: OverlayRole): BrowserWindow {
  const bounds = overlayBounds(role)
  const title = OVERLAY_TITLES[role]

  const window = new BrowserWindow({
    ...bounds,
    title,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    minWidth: 360,
    minHeight: 140,
    show: false,
    webPreferences: webPreferences()
  })

  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.on('ready-to-show', () => window.showInactive())
  window.on('close', () => {
    if (!window.webContents.isDestroyed()) clearSpeechPlayback(window.webContents.id)
  })
  window.on('closed', () => {
    overlayWindows[role] = null
    publishSession()
  })

  loadWindow(window, role)
  return window
}

function overlaysOpen(): boolean {
  return OVERLAY_ROLES.every((role) => isAlive(overlayWindows[role]))
}

async function ensureTranslatorWindows(): Promise<void> {
  for (const role of OVERLAY_ROLES) {
    if (!isAlive(overlayWindows[role])) overlayWindows[role] = createOverlayWindow(role)
  }
  publishSession()
}

export async function openTranslatorWindows(options?: { focus?: boolean }): Promise<{ alreadyOpen: boolean }> {
  if (overlaysOpen()) {
    if (options?.focus !== false) {
      for (const role of OVERLAY_ROLES) overlayWindows[role]?.focus()
    }
    return { alreadyOpen: true }
  }

  if (!openingTranslators) {
    openingTranslators = ensureTranslatorWindows().finally(() => {
      openingTranslators = null
    })
  }

  await openingTranslators
  return { alreadyOpen: false }
}

export function closeTranslatorWindows(): void {
  for (const role of OVERLAY_ROLES) {
    if (isAlive(overlayWindows[role])) overlayWindows[role]?.close()
  }
}

export function closeSenderWindow(contents: Electron.WebContents): void {
  const window = BrowserWindow.fromWebContents(contents)
  if (!window || window.isDestroyed()) return
  window.close()
}

export function setRecording(active: boolean): SessionState {
  recording = active
  const session = getSession()
  publishSession()
  return session
}

export function publishOriginal(message: OriginalCaption): void {
  const window = overlayWindows.original
  if (!isAlive(window)) return
  window.webContents.send(IpcChannel.OriginalCaption, message)
}

export function publishTranslated(message: TranslatedCaption): void {
  const roles = message.type === 'reset' ? CAPTION_LANGUAGES : [message.language]
  for (const role of roles) {
    const window = overlayWindows[role]
    if (isAlive(window)) window.webContents.send(IpcChannel.TranslatedCaption, message)
  }
}

export function publishCaptionSize(size: unknown): void {
  if (!isCaptionSize(size) || size === savedCaptionSize()) return
  captionSize = size
  writeFileSync(join(app.getPath('userData'), 'caption-size.json'), JSON.stringify({ size }))
  const windows = [controllerWindow, ...OVERLAY_ROLES.map((role) => overlayWindows[role])]
  for (const window of windows) {
    if (isAlive(window)) window.webContents.send(IpcChannel.CaptionSize, size)
  }
}
