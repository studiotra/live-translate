import { app, Menu, nativeImage, Tray } from 'electron'
import { showControllerWindow } from './windows'

let tray: Tray | null = null

export function createAppTray(): void {
  if (tray) return
  tray = new Tray(menuIcon())
  tray.setToolTip('Live Translate')
  const menu = Menu.buildFromTemplate([
    { label: 'Show Controller', click: () => showControllerWindow() },
    { type: 'separator' },
    { label: 'Quit Live Translate', click: () => app.quit() }
  ])
  tray.on('click', () => showControllerWindow())
  tray.on('right-click', () => tray?.popUpContextMenu(menu))
}

export function setTrayRecording(active: boolean): void {
  tray?.setToolTip(active ? 'Live Translate — Recording' : 'Live Translate')
}

function menuIcon(): Electron.NativeImage {
  const size = 44
  const buffer = Buffer.alloc(size * size * 4)
  const ink = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const offset = (y * size + x) * 4
    buffer[offset] = 0
    buffer[offset + 1] = 0
    buffer[offset + 2] = 0
    buffer[offset + 3] = 255
  }

  for (let y = 14; y < 20; y += 1) {
    for (let x = 8; x < 36; x += 1) ink(x, y)
  }
  for (let y = 26; y < 32; y += 1) {
    for (let x = 8; x < 26; x += 1) ink(x, y)
  }

  const image = nativeImage.createFromBitmap(buffer, { width: size, height: size, scaleFactor: 2 })
  image.setTemplateImage(true)
  return image
}
