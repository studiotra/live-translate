import { isCaptionLanguage, type WindowRole } from '../../../shared/ipc'

export function getWindowRole(): WindowRole {
  const role = new URLSearchParams(window.location.search).get('role')
  if (role === 'original' || role === 'controller' || isCaptionLanguage(role)) return role
  return 'controller'
}
