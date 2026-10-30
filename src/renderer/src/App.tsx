import { isCaptionLanguage } from '../../shared/ipc'
import { getWindowRole } from './lib/role'
import { ControllerWindow } from './windows/ControllerWindow'
import { OriginalWindow } from './windows/OriginalWindow'
import { TranslatedWindow } from './windows/TranslatedWindow'

export function App() {
  const role = getWindowRole()

  if (role === 'original') return <OriginalWindow />
  if (isCaptionLanguage(role)) return <TranslatedWindow language={role} />
  return <ControllerWindow />
}
