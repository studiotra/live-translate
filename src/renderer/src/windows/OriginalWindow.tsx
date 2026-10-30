import { useEffect, useRef, useState } from 'react'
import type { CaptionLine, TranscriptSnapshot } from '../../../shared/ipc'
import { OverlayHeader } from './OverlayHeader'
import { captionTextStyle, useCaptionSize } from './useCaptionSize'

const emptyCaption: TranscriptSnapshot = { lines: [], interim: [] }

export function OriginalWindow() {
  const [caption, setCaption] = useState<TranscriptSnapshot>(emptyCaption)
  const [stopped, setStopped] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const textSize = useCaptionSize()
  const hasText = caption.lines.length > 0 || caption.interim.length > 0

  useEffect(() => {
    document.title = 'Original Text'
    window.api.announceCaption()
    return window.api.onOriginalCaption((message) => {
      if (message.type === 'reset') {
        setCaption(emptyCaption)
        setStopped(false)
        return
      }
      if (message.type === 'stopped') {
        setStopped(true)
        return
      }
      if (message.type === 'append') {
        setCaption((current) => ({
          lines: [...current.lines, { speaker: null, text: message.text }],
          interim: []
        }))
        return
      }
      setCaption({ lines: message.lines, interim: message.interim })
    })
  }, [])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTop = scroller.scrollHeight
  }, [caption, stopped])

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl bg-black/70 text-white ring-1 ring-white/15">
      <OverlayHeader
        title="Original Text"
        trailing={stopped ? 'Recording stopped' : undefined}
        onSmaller={textSize.smaller}
        onLarger={textSize.larger}
        canSmaller={textSize.canSmaller}
        canLarger={textSize.canLarger}
      />
      <div ref={scrollerRef} className="no-drag min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {hasText ? (
          <div className="flex flex-col gap-3">
            {caption.lines.map((line, index) => (
              <CaptionBlock key={`${index}-${line.text.slice(0, 24)}`} line={line} size={textSize.size} />
            ))}
            {caption.interim.map((line, index) => (
              <CaptionBlock key={`interim-${index}-${line.text.slice(0, 24)}`} line={line} size={textSize.size} muted />
            ))}
          </div>
        ) : (
          <p className="font-medium text-white/75" style={captionTextStyle(textSize.size)}>
            Waiting for speech...
          </p>
        )}
      </div>
    </section>
  )
}

function CaptionBlock({ line, size, muted = false }: { line: CaptionLine; size: number; muted?: boolean }) {
  return (
    <p className={`font-medium ${muted ? 'text-white/50' : 'text-white'}`} style={captionTextStyle(size)}>
      {line.speaker !== null && <span className={muted ? 'text-white/40' : 'text-white/60'}>P{line.speaker + 1} </span>}
      {line.text}
    </p>
  )
}
