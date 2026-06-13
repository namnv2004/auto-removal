import type { CSSProperties } from "react"

type MaskGlowOverlayProps = {
  overlaySrc: string
  phase: "segmented" | "inpainting"
}

const maskClipStyle = (overlaySrc: string): CSSProperties => ({
  WebkitMaskImage: `url(${overlaySrc})`,
  maskImage: `url(${overlaySrc})`,
  WebkitMaskSize: "100% 100%",
  maskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
})

/** Phase 2+: shimmer, pulse and sparkle confined to the segmented mask region. */
export function MaskGlowOverlay({ overlaySrc, phase }: MaskGlowOverlayProps) {
  const isErasing = phase === "inpainting"
  const clip = maskClipStyle(overlaySrc)

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-lg"
      aria-hidden
    >
      <img
        src={overlaySrc}
        alt=""
        className={`absolute inset-0 block h-full w-full transition-all duration-700 ${
          isErasing ? "opacity-85 scale-[1.002]" : "opacity-100"
        }`}
        draggable={false}
      />

      <img
        src={overlaySrc}
        alt=""
        className={`mask-glow-pulse absolute inset-0 block h-full w-full ${
          isErasing ? "mask-glow-erasing" : "mask-glow-found"
        }`}
        draggable={false}
      />

      <div className="mask-shimmer-sweep absolute inset-0" style={clip} />

      <div className="mask-edge-sparkle absolute inset-0" style={clip} />

      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border bg-zinc-950/80 px-4 py-1.5 backdrop-blur-md transition-colors duration-500 ${
          isErasing ? "border-violet-500/40" : "border-emerald-500/40"
        }`}
      >
        <span className="relative flex size-2">
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${
              isErasing ? "bg-violet-400" : "bg-emerald-400"
            }`}
          />
          <span
            className={`relative inline-flex size-2 rounded-full ${
              isErasing ? "bg-violet-400" : "bg-emerald-400"
            }`}
          />
        </span>
        <span
          className={`text-xs font-medium tracking-wide ${
            isErasing ? "text-violet-200/90" : "text-emerald-200/90"
          }`}
        >
          {isErasing ? "Erasing object…" : "Target locked"}
        </span>
      </div>
    </div>
  )
}
