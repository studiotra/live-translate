export function OverlayHeader({
  title,
  trailing,
  onSmaller,
  onLarger,
  canSmaller,
  canLarger,
  speechOn,
  onToggleSpeech
}: {
  title: string
  trailing?: string
  onSmaller: () => void
  onLarger: () => void
  canSmaller: boolean
  canLarger: boolean
  speechOn?: boolean
  onToggleSpeech?: () => void
}) {
  return (
    <header className="drag-region flex h-8 shrink-0 items-center gap-3 bg-white/10 px-3">
      <span className="h-1 w-8 rounded-full bg-white/40" aria-hidden />
      <span className="text-[11px] font-medium tracking-[0.16em] text-white/70 uppercase">{title}</span>
      {trailing && (
        <span className="text-[11px] font-medium tracking-[0.14em] text-[#ffb4a2] uppercase">{trailing}</span>
      )}
      <div className="no-drag ml-auto flex items-center gap-1">
        {onToggleSpeech && (
          <SizeButton
            label={speechOn ? 'Mute speech' : 'Speak translations'}
            disabled={false}
            active={speechOn}
            onClick={onToggleSpeech}
          >
            {speechOn ? 'Mute' : 'Speak'}
          </SizeButton>
        )}
        <SizeButton label="Smaller text" disabled={!canSmaller} onClick={onSmaller}>
          A−
        </SizeButton>
        <SizeButton label="Larger text" disabled={!canLarger} onClick={onLarger}>
          A+
        </SizeButton>
        <button
          type="button"
          aria-label="Close"
          className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none text-white/80 hover:bg-white/20"
          onClick={() => window.api.closeThisWindow()}
        >
          ×
        </button>
      </div>
    </header>
  )
}

function SizeButton({
  children,
  label,
  disabled,
  active = false,
  onClick
}: {
  children: string
  label: string
  disabled: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 ${active ? 'bg-white/25 text-white' : 'text-white/80'}`}
    >
      {children}
    </button>
  )
}
