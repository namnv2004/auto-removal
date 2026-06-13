/** Phase 1: single white dot grid with a soft fade sweeping top → bottom. */
export function StripeScanOverlay() {
  return (
    <div
      className="seg-phase1 pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-lg"
      aria-hidden
    >
      <div className="seg-phase1-dots absolute inset-0" />
      <div className="seg-phase1-fade absolute inset-0" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/15 bg-zinc-950/65 px-4 py-1.5 backdrop-blur-sm">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/40 opacity-30" />
          <span className="relative inline-flex size-1.5 rounded-full bg-white/65" />
        </span>
        <span className="text-xs font-medium tracking-wide text-white/70">
          Detecting object…
        </span>
      </div>
    </div>
  )
}
