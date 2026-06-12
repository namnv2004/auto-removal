import { createFileRoute } from "@tanstack/react-router"
import {
  Download,
  GripVertical,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import { OpenAPI } from "@/client"
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider"
import { MaskGlowOverlay } from "@/components/object-removal/MaskGlowOverlay"
import { StripeScanOverlay } from "@/components/object-removal/StripeScanOverlay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { normalizeImageFile } from "@/lib/normalizeImage"

export const Route = createFileRoute("/_layout/object-removal")({
  component: ObjectRemoval,
  head: () => ({
    meta: [
      {
        title: "LumaErase Studio",
      },
    ],
  }),
})

function ObjectRemoval() {
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<ImageSize | null>(null)
  const [boxPrompt, setBoxPrompt] = useState<PromptBox | null>(null)
  const [dragPath, setDragPath] = useState<{ x: number; y: number }[]>([])
  const [drawnPath, setDrawnPath] = useState<{ x: number; y: number }[] | null>(
    null,
  )
  const [result, setResult] = useState<SegmentationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Prompt state
  const [textPrompt, setTextPrompt] = useState<string>("")
  const [promptInput, setPromptInput] = useState<string>("")

  // Processing state
  type ProcessingPhase = "idle" | "segmenting" | "segmented" | "inpainting"
  const [processingPhase, setProcessingPhase] =
    useState<ProcessingPhase>("idle")
  const [inpaintResult, setInpaintResult] = useState<string | null>(null)
  const isProcessing = processingPhase !== "idle"
  const [inpaintSeed, setInpaintSeed] = useState<number | null>(null)
  const [inpaintDuration, setInpaintDuration] = useState<number | null>(null)
  const [showComparison, setShowComparison] = useState(false)

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const normalized = await normalizeImageFile(file)
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
      setImageFile(normalized.file)
      setImageUrl(normalized.previewUrl)
      setNaturalSize({ width: normalized.width, height: normalized.height })
      setBoxPrompt(null)
      setDragPath([])
      setDrawnPath(null)
      setTextPrompt("")
      setPromptInput("")
      setResult(null)
      setError(null)
      setInpaintResult(null)
      setInpaintSeed(null)
      setInpaintDuration(null)
      setShowComparison(false)
      setProcessingPhase("idle")
    } catch {
      setError("Failed to load image. Please try another file.")
    } finally {
      event.target.value = ""
    }
  }

  const handleImageLoad = () => {
    const image = imageRef.current
    if (!image) {
      return
    }
    setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
  }

  const getPercentPoint = (event: MouseEvent<HTMLElement>) => {
    const image = imageRef.current
    if (!image) {
      return null
    }

    const rect = image.getBoundingClientRect()
    const rawX = (event.clientX - rect.left) / rect.width
    const rawY = (event.clientY - rect.top) / rect.height

    const x = Math.max(0, Math.min(rawX, 1.0))
    const y = Math.max(0, Math.min(rawY, 1.0))

    return { x, y }
  }

  const handleCanvasMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (showComparison || inpaintResult || isProcessing) return
    const point = getPercentPoint(event)
    if (!point) {
      return
    }

    setDragPath([point])
    setDrawnPath(null)
    setBoxPrompt(null)
  }

  const handleCanvasMouseMove = (event: MouseEvent<HTMLElement>) => {
    if (dragPath.length === 0) {
      return
    }

    const point = getPercentPoint(event)
    if (!point) {
      return
    }

    setDragPath((prev) => [...prev, point])
  }

  const handleCanvasMouseUp = () => {
    if (dragPath.length < 2) {
      setDragPath([])
      return
    }

    const path = [...dragPath]
    setDragPath([])
    setDrawnPath(path)

    if (naturalSize) {
      const xs = path.map((p) => p.x)
      const ys = path.map((p) => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)

      const boxW = (maxX - minX) * naturalSize.width
      const boxH = (maxY - minY) * naturalSize.height

      if (boxW >= 10 && boxH >= 10) {
        const normalizedBox = {
          x1: minX * naturalSize.width,
          y1: minY * naturalSize.height,
          x2: maxX * naturalSize.width,
          y2: maxY * naturalSize.height,
        }
        setBoxPrompt(normalizedBox)
        setResult(null)
        setError(null)
        setInpaintResult(null)
        setShowComparison(false)
        handleRunSegmentation(textPrompt, normalizedBox)
      }
    }
  }

  const handleClearImage = () => {
    setImageFile(null)
    setImageUrl(null)
    setNaturalSize(null)
    setBoxPrompt(null)
    setDragPath([])
    setDrawnPath(null)
    setTextPrompt("")
    setPromptInput("")
    setResult(null)
    setError(null)
    setInpaintResult(null)
    setInpaintSeed(null)
    setInpaintDuration(null)
    setShowComparison(false)
    setProcessingPhase("idle")
  }

  const handleRunSegmentation = async (
    queryOverride?: string,
    boxOverride?: PromptBox | null,
    seedOverride?: number,
  ) => {
    const activeQuery = queryOverride !== undefined ? queryOverride : textPrompt
    const activeBox = boxOverride !== undefined ? boxOverride : boxPrompt

    if (!imageFile) {
      setError("Please upload an image first.")
      return
    }
    if (!activeBox && !activeQuery) {
      setError(
        "Please type a description or draw a circle on the image to erase.",
      )
      return
    }

    setProcessingPhase("segmenting")
    setError(null)
    setResult(null)
    setInpaintResult(null)
    setShowComparison(false)

    const segForm = buildSegmentationFormData(imageFile, activeQuery, activeBox)

    try {
      const token = getAccessToken()
      const segResponse = await fetch(
        `${apiBase()}/api/v1/segmentation/predict`,
        {
          method: "POST",
          body: segForm,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      )

      if (!segResponse.ok) {
        await handleAuthOrThrow(segResponse)
      }

      const segData = (await segResponse.json()) as SegmentationResponse
      if (segData.best_score <= 0.01) {
        throw new Error(
          "No object detected. Draw a circle around the target or try a different description.",
        )
      }

      const segResult: SegmentationResponse = {
        width: segData.width,
        height: segData.height,
        processed_width: segData.processed_width,
        processed_height: segData.processed_height,
        best_score: segData.best_score,
        mask_png_base64: segData.mask_png_base64,
        overlay_png_base64: segData.overlay_png_base64,
      }
      setResult(segResult)
      setProcessingPhase("segmented")
      await new Promise((resolve) => setTimeout(resolve, 700))
      setProcessingPhase("inpainting")

      const inpaintForm = new FormData()
      inpaintForm.append("image", imageFile)
      inpaintForm.append(
        "mask",
        base64ToBlob(segData.mask_png_base64, "image/png"),
        "mask.png",
      )
      appendInpaintingParams(inpaintForm)
      if (seedOverride !== undefined) {
        inpaintForm.append("seed", String(seedOverride))
      }

      const inpaintResponse = await fetch(
        `${apiBase()}/api/v1/inpainting/remove`,
        {
          method: "POST",
          body: inpaintForm,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      )

      if (!inpaintResponse.ok) {
        await handleAuthOrThrow(inpaintResponse)
      }

      const inpaintData = (await inpaintResponse.json()) as InpaintingResponse
      setInpaintResult(inpaintData.result_png_base64)
      setInpaintSeed(inpaintData.seed_used)
      setInpaintDuration(inpaintData.duration_ms)
      setShowComparison(true)
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Object removal failed."
      setError(errMsg)
      setResult(null)
    } finally {
      setProcessingPhase("idle")
    }
  }

  const handleRemoveObject = useCallback(
    async (seedOverride?: number) => {
      if (!imageFile || !result) return

      setProcessingPhase("inpainting")
      setError(null)

      const maskBlob = base64ToBlob(result.mask_png_base64, "image/png")
      const formData = new FormData()
      formData.append("image", imageFile)
      formData.append("mask", maskBlob, "mask.png")
      appendInpaintingParams(formData)
      if (seedOverride !== undefined) {
        formData.append("seed", String(seedOverride))
      }

      try {
        const token = getAccessToken()
        const response = await fetch(`${apiBase()}/api/v1/inpainting/remove`, {
          method: "POST",
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })

        if (!response.ok) {
          await handleAuthOrThrow(response)
        }

        const data = (await response.json()) as InpaintingResponse
        setInpaintResult(data.result_png_base64)
        setInpaintSeed(data.seed_used)
        setInpaintDuration(data.duration_ms)
        setShowComparison(true)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Inpainting failed."
        setError(errMsg)
      } finally {
        setProcessingPhase("idle")
      }
    },
    [imageFile, result],
  )

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = promptInput.trim()
    if (!trimmed && !boxPrompt) {
      return
    }
    setTextPrompt(trimmed)
    handleRunSegmentation(trimmed, boxPrompt)
  }

  return (
    <div className="absolute inset-x-0 bottom-0 top-16 bg-zinc-950 flex flex-col z-20 select-none">
      {/* Floating Header Actions */}
      <div className="absolute top-4 right-4 z-30 pointer-events-auto flex gap-2">
        {/* Re-segment after inpaint result */}
        {inpaintResult && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setInpaintResult(null)
              setShowComparison(false)
              setResult(null)
              setBoxPrompt(null)
              setDrawnPath(null)
            }}
            className="bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:bg-zinc-800 shadow-lg animate-fade-in"
          >
            <RefreshCw className="size-4 mr-1.5" />
            New Selection
          </Button>
        )}

        {imageFile && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearImage}
            className="bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:bg-red-950/40 hover:text-red-400 shadow-lg"
          >
            <X className="size-4 mr-1.5" />
            Clear Workspace
          </Button>
        )}
      </div>

      {/* Full-width and height viewport canvas area */}
      <div className="flex-1 w-full h-full relative flex items-center justify-center p-6 overflow-hidden bg-zinc-950">
        {imageUrl ? (
          showComparison && inpaintResult ? (
            // Before/After comparison view
            <BeforeAfterSlider
              beforeSrc={imageUrl}
              afterSrc={`data:image/png;base64,${inpaintResult}`}
              className="shadow-2xl border border-zinc-800"
            />
          ) : inpaintResult && !showComparison ? (
            // Static result view
            <div className="relative w-fit h-fit select-none">
              <img
                src={`data:image/png;base64,${inpaintResult}`}
                alt="Object removal result"
                className="block select-none max-h-[calc(100vh-14rem)] w-auto max-w-full shadow-2xl border border-zinc-800 rounded-lg animate-fade-in animate-duration-200"
                draggable={false}
              />
            </div>
          ) : (
            // Interactive editor view (drawing/masking)
            // biome-ignore lint/a11y/noStaticElementInteractions: Canvas wrapper handles dragging events
            <div
              className={`relative w-fit h-fit select-none rounded-lg overflow-hidden shadow-2xl border border-zinc-800/80 ${
                isProcessing ? "cursor-wait" : "cursor-crosshair"
              }`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Workspace canvas background"
                className={`block select-none max-h-[calc(100vh-14rem)] w-auto max-w-full transition-[filter] duration-500 ${
                  processingPhase === "segmenting"
                    ? "brightness-[0.94] saturate-[0.92]"
                    : ""
                }`}
                onLoad={handleImageLoad}
                draggable={false}
              />
              {result && !isProcessing && (
                <img
                  src={`data:image/png;base64,${result.overlay_png_base64}`}
                  alt="Workspace mask overlay"
                  className="pointer-events-none absolute inset-0 w-full h-full select-none block transition-opacity duration-300"
                  draggable={false}
                />
              )}
              {processingPhase === "segmenting" && <StripeScanOverlay />}
              {(processingPhase === "segmented" ||
                processingPhase === "inpainting") &&
                result && (
                  <MaskGlowOverlay
                    overlaySrc={`data:image/png;base64,${result.overlay_png_base64}`}
                    phase={
                      processingPhase === "inpainting"
                        ? "inpainting"
                        : "segmented"
                    }
                  />
                )}
              <svg
                className="pointer-events-none absolute inset-0 w-full h-full z-10 overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <title>Circle Selection</title>
                <defs>
                  <linearGradient
                    id="circle-search-grad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="30%" stopColor="#8b5cf6" />
                    <stop offset="70%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <filter
                    id="neon-glow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {(dragPath.length > 1 || (drawnPath && !result)) && (
                  <path
                    d={getPathData(
                      dragPath.length > 1 ? dragPath : drawnPath || [],
                    )}
                    fill="none"
                    stroke="url(#circle-search-grad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#neon-glow)"
                    className={
                      dragPath.length === 0
                        ? "animate-pulse opacity-90"
                        : "opacity-100"
                    }
                  />
                )}
              </svg>
            </div>
          )
        ) : (
          <label
            htmlFor="canvas-image-upload"
            className="group flex h-64 w-96 cursor-pointer flex-col items-center justify-center p-8 text-center transition hover:bg-zinc-900/40 rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-900/10 hover:border-zinc-700/80 shadow-xl"
          >
            <div className="p-4 bg-emerald-500/10 text-emerald-400 group-hover:text-emerald-350 rounded-full mb-4 animate-pulse">
              <Upload className="size-8" />
            </div>
            <span className="text-zinc-200 font-bold tracking-wide">
              Upload Image to Erase
            </span>
            <span className="mt-2 text-xs text-zinc-500 max-w-[220px] leading-relaxed">
              Drag &amp; drop or click to upload
            </span>
            <Input
              id="canvas-image-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>
        )}
      </div>

      {/* Pinned Bottom Control Panel */}
      <div className="w-full border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-md px-6 py-4 flex flex-col gap-3 shrink-0 z-30">
        {/* Active Box Prompt Info (if any) */}
        {boxPrompt && !inpaintResult && (
          <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg font-medium animate-fade-in">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 bg-emerald-500 rounded-full animate-ping" />
              Area selection active. SAM will target this region.
            </span>
            <button
              type="button"
              onClick={() => {
                setBoxPrompt(null)
                handleRunSegmentation(textPrompt, null)
              }}
              className="font-bold underline hover:text-emerald-300"
            >
              Reset Area
            </button>
          </div>
        )}

        {inpaintResult && (
          /* Results action toolbar */
          <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-zinc-800/60 animate-fade-in">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showComparison ? "default" : "outline"}
                onClick={() => setShowComparison((prev) => !prev)}
                className={
                  showComparison
                    ? "bg-violet-600 hover:bg-violet-500 text-white border-0 h-9 font-semibold"
                    : "border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-9 font-semibold"
                }
              >
                <GripVertical className="size-3.5 mr-1" />
                {showComparison ? "Show Result" : "Compare Before/After"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRemoveObject()}
                disabled={isProcessing}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-9 font-semibold"
              >
                <RefreshCw className="size-3.5 mr-1" />
                Retry (New Seed)
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {inpaintDuration !== null && (
                <span className="text-[11px] text-zinc-500 font-mono">
                  {(inpaintDuration / 1000).toFixed(1)}s · seed: {inpaintSeed}
                </span>
              )}
              <Button
                size="sm"
                onClick={() => {
                  const link = document.createElement("a")
                  link.href = `data:image/png;base64,${inpaintResult}`
                  link.download = "removed_object.png"
                  link.click()
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-9"
              >
                <Download className="size-3.5 mr-1" />
                Download
              </Button>
            </div>
          </div>
        )}

        {/* Text prompt input form */}
        <form
          onSubmit={handlePromptSubmit}
          className="flex gap-3 bg-zinc-950 p-1.5 border border-zinc-800/80 rounded-xl items-center w-full focus-within:border-zinc-700 transition"
        >
          <div className="pl-3 text-zinc-400">
            <Sparkles className="size-4 text-emerald-400" />
          </div>
          <Input
            placeholder={
              imageFile
                ? "Describe object to erase (e.g. text, person) or draw direct on image..."
                : "Please upload an image to start..."
            }
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            disabled={!imageFile || isProcessing}
            className="flex-1 text-sm bg-transparent border-none text-zinc-100 placeholder-zinc-500 focus-visible:ring-0 focus-visible:outline-none"
          />
          <Button
            type="submit"
            disabled={
              !imageFile || isProcessing || (!promptInput.trim() && !boxPrompt)
            }
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 font-semibold rounded-lg shrink-0 shadow-lg shadow-emerald-600/10 h-9"
          >
            {isProcessing ? (
              <Loader2 className="animate-spin size-4 mr-2" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            Erase
          </Button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-900/30 bg-red-950/20 p-2.5 text-xs text-red-400 flex items-center gap-2 animate-fade-in">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}

type ImageSize = {
  width: number
  height: number
}

type PromptBox = {
  x1: number
  y1: number
  x2: number
  y2: number
}

type SegmentationResponse = {
  width: number
  height: number
  processed_width: number
  processed_height: number
  best_score: number
  mask_png_base64: string
  overlay_png_base64: string
}

type InpaintingResponse = {
  result_png_base64: string
  debug_crop_png_base64: string
  width: number
  height: number
  duration_ms: number
  seed_used: number
}

function apiBase() {
  return OpenAPI.BASE.replace(/\/$/, "")
}

function getAccessToken() {
  return localStorage.getItem("access_token")
}

async function handleAuthOrThrow(response: Response) {
  if ([401, 403].includes(response.status)) {
    localStorage.removeItem("access_token")
    window.location.href = "/login"
    throw new Error("Unauthorized")
  }
  throw new Error(await readApiError(response))
}

function buildSegmentationFormData(
  imageFile: File,
  textPrompt: string,
  box: PromptBox | null,
) {
  const formData = new FormData()
  formData.append("image", imageFile)
  if (textPrompt) {
    formData.append("text_prompt", textPrompt)
  }
  if (box) {
    formData.append(
      "circle_box",
      JSON.stringify([box.x1, box.y1, box.x2, box.y2]),
    )
  }
  formData.append("mask_threshold", "0.35")
  formData.append("feather_radius", "0.0")
  return formData
}

function appendInpaintingParams(formData: FormData) {
  formData.append("steps", "20")
  formData.append("guidance_scale", "2.5")
  formData.append("strength", "1.0")
  formData.append("mask_dilation", "10")
  formData.append("mask_feather", "4.0")
  formData.append("prefill", "false")
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === "string") {
      return body.detail
    }
    if (body.detail) {
      return JSON.stringify(body.detail)
    }
  } catch {
    return `Request failed with status ${response.status}`
  }
  return `Request failed with status ${response.status}`
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i)
  }
  return new Blob([arr], { type: mimeType })
}

function getPathData(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ""
  return points
    .map((p, idx) => {
      const x = p.x * 100
      const y = p.y * 100
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}
