import { systemPreferences } from 'electron'

export async function ensureMicrophoneAccess(): Promise<void> {
  if (process.platform !== 'darwin') return

  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'granted') return
  if (status === 'restricted') {
    throw new Error('Microphone access is restricted on this Mac.')
  }

  const granted = await systemPreferences.askForMediaAccess('microphone')
  if (!granted) {
    throw new Error('Microphone access was denied. Enable it for Electron in System Settings, then try again.')
  }
}
