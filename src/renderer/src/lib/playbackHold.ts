const RELEASE_TAIL_MS = 1200

let held = false
let releaseTimer: ReturnType<typeof setTimeout> | null = null

export function setSpeechHold(active: boolean): void {
  if (active) {
    if (releaseTimer) clearTimeout(releaseTimer)
    releaseTimer = null
    held = true
    return
  }
  if (releaseTimer) clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => {
    held = false
    releaseTimer = null
  }, RELEASE_TAIL_MS)
}

export function isSpeechHold(): boolean {
  return held
}
