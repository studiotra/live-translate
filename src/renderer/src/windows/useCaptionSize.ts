import { useEffect, useState } from 'react'
import { CAPTION_SIZES, DEFAULT_CAPTION_SIZE, isCaptionSize, type CaptionSize } from '../../../shared/ipc'

export function useCaptionSize() {
  const [size, setSize] = useState<CaptionSize>(DEFAULT_CAPTION_SIZE)

  useEffect(() => {
    return window.api.onCaptionSize((next) => {
      if (isCaptionSize(next)) setSize(next)
    })
  }, [])

  const index = CAPTION_SIZES.indexOf(size)

  function step(direction: -1 | 1): void {
    const next = CAPTION_SIZES[index + direction]
    if (next === undefined) return
    setSize(next)
    window.api.setCaptionSize(next)
  }

  return {
    size,
    smaller: () => step(-1),
    larger: () => step(1),
    canSmaller: index > 0,
    canLarger: index >= 0 && index < CAPTION_SIZES.length - 1
  }
}

export function captionTextStyle(size: number): { fontSize: number; lineHeight: number } {
  return { fontSize: size, lineHeight: 1.35 }
}
