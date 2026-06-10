import { GripVertical } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface BeforeAfterSliderProps {
  /** URL or data URI for the 'before' (original) image */
  beforeSrc: string
  /** URL or data URI for the 'after' (result) image */
  afterSrc: string
  className?: string
  /** Initial slider position as percentage 0-100 (default: 50) */
  initialPosition?: number
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  className = "",
  initialPosition = 50,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sliderPos, setSliderPos] = useState(initialPosition)
  const [isDragging, setIsDragging] = useState(false)

  const updateSlider = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const raw = ((clientX - rect.left) / rect.width) * 100
    setSliderPos(Math.max(0, Math.min(100, raw)))
  }, [])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    updateSlider(e.clientX)
  }

  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (e: MouseEvent) => updateSlider(e.clientX)
    const onMouseUp = () => setIsDragging(false)

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [isDragging, updateSlider])

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    updateSlider(e.touches[0].clientX)
  }

  useEffect(() => {
    if (!isDragging) return

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      updateSlider(e.touches[0].clientX)
    }
    const onTouchEnd = () => setIsDragging(false)

    window.addEventListener("touchmove", onTouchMove, { passive: false })
    window.addEventListener("touchend", onTouchEnd)
    return () => {
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [isDragging, updateSlider])

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-lg w-fit h-fit max-h-[calc(100vh-14rem)] max-w-full ${className}`}
      style={{ cursor: isDragging ? "ew-resize" : "default" }}
    >
      {/* After image (full, underneath) */}
      <img
        src={afterSrc}
        alt="After"
        className="block w-auto h-auto max-h-[calc(100vh-14rem)] max-w-full pointer-events-none"
        draggable={false}
      />

      {/* Before image (clipped to right of slider) */}
      <img
        src={beforeSrc}
        alt="Before"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        draggable={false}
      />

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.6)] z-10"
        style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
      />

      {/* Drag handle */}
      <div
        className={`absolute top-1/2 z-20 -translate-y-1/2 -translate-x-1/2
          size-10 rounded-full bg-white shadow-xl
          flex items-center justify-center
          border-2 border-zinc-200
          transition-transform duration-75
          ${isDragging ? "scale-110" : "scale-100 hover:scale-105"}
        `}
        style={{ left: `${sliderPos}%`, cursor: "ew-resize" }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="slider"
        aria-label="Comparison slider"
        aria-valuenow={Math.round(sliderPos)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
      >
        <GripVertical className="size-4 text-zinc-500" />
      </div>

      {/* Labels */}
      <span
        className="absolute bottom-3 left-3 z-10 text-xs font-bold text-white
          bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full
          pointer-events-none"
      >
        Before
      </span>
      <span
        className="absolute bottom-3 right-3 z-10 text-xs font-bold text-white
          bg-emerald-600/80 backdrop-blur-sm px-2 py-0.5 rounded-full
          pointer-events-none"
      >
        After
      </span>
    </div>
  )
}
