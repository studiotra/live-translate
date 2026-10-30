import { app, session } from 'electron'
import { registerIpc } from './ipc'
import { createAppTray } from './tray'
import { createControllerWindow, showControllerWindow } from './windows'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals')
  app.commandLine.appendSwitch('disable-gpu')
}

app.setName('Live Translate')

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  registerIpc()
  createAppTray()
  createControllerWindow()

  app.on('activate', () => {
    showControllerWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
