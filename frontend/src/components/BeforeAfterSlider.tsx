import { GripVertical } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface BeforeAfterSliderProps {
  beforeSrc: string
  afterSrc: string
  className?: string
  initialPosition?: number
}

type DisplaySize = { width: number; height: number }

const MAX_HEIGHT_CSS = "calc(100vh - 14rem)"

function measureDisplaySize(
  beforeSrc: string,
  afterSrc: string,
): Promise<DisplaySize> {
  return new Promise((resolve, reject) => {
    const before = new Image()
    const after = new Image()
    let loaded = 0

    const finish = () => {
      loaded += 1
      if (loaded < 2) return

      const natW = before.naturalWidth
      const natH = before.naturalHeight
      if (natW === 0 || natH === 0) {
        reject(new Error("Invalid image dimensions"))
        return
      }

      if (
        after.naturalWidth !== natW ||
        after.naturalHeight !== natH
      ) {
        console.warn(
          "Before/after size mismatch:",
          `${natW}x${natH}`,
          "vs",
          `${after.naturalWidth}x${after.naturalHeight}`,
        )
      }

      const maxHeight = Math.max(
        200,
        window.innerHeight - 14 * 16,
      )
      const scale = Math.min(1, maxHeight / natH)
      resolve({
        width: Math.round(natW * scale),
        height: Math.round(natH * scale),
      })
    }

    before.onload = finish
    after.onload = finish
    before.onerror = () => reject(new Error("Failed to load before image"))
    after.onerror = () => reject(new Error("Failed to load after image"))
    before.src = beforeSrc
    after.src = afterSrc
  })
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
  const [displaySize, setDisplaySize] = useState<DisplaySize | null>(null)

  useEffect(() => {
    let cancelled = false
    setDisplaySize(null)

    measureDisplaySize(beforeSrc, afterSrc)
      .then((size) => {
        if (!cancelled) setDisplaySize(size)
      })
      .catch(() => {
        if (!cancelled) setDisplaySize(null)
      })

    return () => {
      cancelled = true
    }
  }, [beforeSrc, afterSrc])

  const updateSlider = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const raw = ((clientX - rect.left) / rect.width) * 100
    setSliderPos(Math.max(0, Math.min(100, raw)))
  }, [])

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

  const layerStyle = displaySize
    ? {
        width: displaySize.width,
        height: displaySize.height,
      }
    : undefined

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-lg shrink-0 ${className}`}
      style={{
        cursor: isDragging ? "ew-resize" : "default",
        ...layerStyle,
        maxHeight: MAX_HEIGHT_CSS,
      }}
    >
      {!displaySize && (
        <div
          className="flex items-center justify-center bg-zinc-900/50 text-zinc-500 text-sm"
          style={{ width: 320, height: 240 }}
        >
          Loading comparison…
        </div>
      )}

      {displaySize && (
        <>
          <img
            src={afterSrc}
            alt="After"
            width={displaySize.width}
            height={displaySize.height}
            className="block pointer-events-none"
            style={layerStyle}
            draggable={false}
          />

          <img
            src={beforeSrc}
            alt="Before"
            width={displaySize.width}
            height={displaySize.height}
            className="absolute top-0 left-0 block pointer-events-none"
            style={{
              ...layerStyle,
              clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
            }}
            draggable={false}
          />

          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.6)] z-10 pointer-events-none"
            style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
          />

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

          <span
            className="absolute bottom-3 left-3 z-10 text-xs font-bold text-white
              bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full pointer-events-none"
          >
            Before
          </span>
          <span
            className="absolute bottom-3 right-3 z-10 text-xs font-bold text-white
              bg-emerald-600/80 backdrop-blur-sm px-2 py-0.5 rounded-full pointer-events-none"
          >
            After
          </span>
        </>
      )}
    </div>
  )
}
