/** Phase 1: subtle white dot grid fading from top to bottom while SAM runs. */
export function StripeScanOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-lg"
      aria-hidden
    >
      <div className="seg-dot-grid absolute inset-0" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/15 bg-zinc-950/70 px-4 py-1.5 backdrop-blur-sm">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/50 opacity-40" />
          <span className="relative inline-flex size-1.5 rounded-full bg-white/70" />
        </span>
        <span className="text-xs font-medium tracking-wide text-white/75">
          Detecting object…
        </span>
      </div>
    </div>
  )
}
