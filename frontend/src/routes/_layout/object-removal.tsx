import { createFileRoute, redirect } from "@tanstack/react-router"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  History,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
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
  beforeLoad: () => {
    if (
      typeof window !== "undefined" &&
      window.location.hostname.startsWith("image.")
    ) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [
      {
        title: "LumaErase Studio",
      },
    ],
  }),
})

interface ImageSize {
  width: number
  height: number
}

interface HistoryItem {
  id: string
  title: string
  originalBase64: string
  resultBase64: string
  prompt: string
  seed: number
  duration: number
  timestamp: number
  boxPrompt: PromptBox | null
}

interface SessionItem {
  id: string
  name: string
  originalBase64: string
  thumbnailUrl: string
  timestamp: number
  prompt: string
  boxPrompt: PromptBox | null
  drawnPath: { x: number; y: number }[] | null
  inpaintResultBase64?: string | null
}

type PipelineSettings = {
  steps: number
  guidanceScale: number
  strength: number
  maskDilation: number
  maskFeather: number
  prefill: boolean
}

type ServiceStatus = {
  model: string
  device: string
  cuda_available: boolean
  loaded: boolean
}

const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  steps: 20,
  guidanceScale: 2.5,
  strength: 1.0,
  maskDilation: 10,
  maskFeather: 4.0,
  prefill: false,
}

const PIPELINE_SETTINGS_STORAGE_KEY = "lumaerase_pipeline_settings"

function loadPipelineSettings(): PipelineSettings {
  if (typeof localStorage === "undefined") return DEFAULT_PIPELINE_SETTINGS

  try {
    const saved = localStorage.getItem(PIPELINE_SETTINGS_STORAGE_KEY)
    if (!saved) return DEFAULT_PIPELINE_SETTINGS

    return { ...DEFAULT_PIPELINE_SETTINGS, ...JSON.parse(saved) }
  } catch {
    return DEFAULT_PIPELINE_SETTINGS
  }
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
}

export function ObjectRemoval() {
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

  // Layout & Sections
  const [activeSection, setActiveSection] = useState<
    "studio" | "gallery" | "settings"
  >("studio")
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>(() => {
    try {
      const saved = localStorage.getItem("lumaerase_sessions")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const handleLoadSession = async (sess: SessionItem) => {
    try {
      setError(null)
      const response = await fetch(sess.originalBase64)
      const blob = await response.blob()
      const file = new File([blob], sess.name, { type: "image/png" })

      setImageFile(file)
      setImageUrl(sess.originalBase64)
      setNaturalSize(null)
      setBoxPrompt(sess.boxPrompt)
      setDrawnPath(sess.drawnPath)
      setDragPath([])
      setTextPrompt(sess.prompt)
      setPromptInput(sess.prompt)
      setInpaintResult(sess.inpaintResultBase64 || null)
      setInpaintSeed(null)
      setInpaintDuration(null)
      setShowComparison(!!sess.inpaintResultBase64)
      setResult(null)
      setProcessingPhase("idle")
      setCurrentSessionId(sess.id)
      setActiveSection("studio")
    } catch (_e) {
      setError("Failed to load session.")
    }
  }

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id)
      localStorage.setItem("lumaerase_sessions", JSON.stringify(updated))
      return updated
    })
    if (currentSessionId === id) {
      handleClearImage()
      setCurrentSessionId(null)
    }
  }

  // Pipeline Settings
  const [settings, setSettings] = useState<PipelineSettings>(
    loadPipelineSettings,
  )
  const [serviceStatus, setServiceStatus] = useState<{
    segmentation: ServiceStatus | null
    inpainting: ServiceStatus | null
    loading: boolean
    error: string | null
  }>({ segmentation: null, inpainting: null, loading: false, error: null })

  // History List
  const [historyList, setHistoryList] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem("lumaerase_history")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const [gallerySearch, setGallerySearch] = useState("")

  useEffect(() => {
    localStorage.setItem(PIPELINE_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const handleRefreshServiceStatus = useCallback(async () => {
    setServiceStatus((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const [segmentationResponse, inpaintingResponse] = await Promise.all([
        fetch(`${apiBase()}/api/v1/segmentation/status`),
        fetch(`${apiBase()}/api/v1/inpainting/status`),
      ])

      if (!segmentationResponse.ok) {
        throw new Error(await readApiError(segmentationResponse))
      }
      if (!inpaintingResponse.ok) {
        throw new Error(await readApiError(inpaintingResponse))
      }

      setServiceStatus({
        segmentation: (await segmentationResponse.json()) as ServiceStatus,
        inpainting: (await inpaintingResponse.json()) as ServiceStatus,
        loading: false,
        error: null,
      })
    } catch (err) {
      setServiceStatus((prev) => ({
        ...prev,
        loading: false,
        error:
          err instanceof Error ? err.message : "Failed to load model status.",
      }))
    }
  }, [])

  // Helper to save to history
  const saveToHistory = useCallback(
    async (
      originalFile: File,
      resultBase64: string,
      prompt: string,
      seed: number,
      duration: number,
      box: PromptBox | null,
    ) => {
      try {
        const originalBase64 = await fileToBase64(originalFile)

        // Update session if it exists
        if (currentSessionId) {
          setSessions((prev) => {
            const updated = prev.map((s) =>
              s.id === currentSessionId
                ? {
                    ...s,
                    inpaintResultBase64: resultBase64,
                    prompt: prompt,
                    boxPrompt: box,
                    timestamp: Date.now(),
                  }
                : s,
            )
            localStorage.setItem("lumaerase_sessions", JSON.stringify(updated))
            return updated
          })
        }

        const newItem: HistoryItem = {
          id: crypto.randomUUID(),
          title: prompt || "Erase selected area",
          originalBase64,
          resultBase64,
          prompt,
          seed,
          duration,
          timestamp: Date.now(),
          boxPrompt: box,
        }
        setHistoryList((prev) => {
          const filtered = prev.filter(
            (item) =>
              item.prompt !== prompt || item.originalBase64 !== originalBase64,
          )
          const updated = [newItem, ...filtered].slice(0, 8)
          localStorage.setItem("lumaerase_history", JSON.stringify(updated))
          return updated
        })
      } catch (e) {
        console.error("Failed to save to history", e)
      }
    },
    [currentSessionId],
  )

  // Helper to load history item
  const handleLoadHistoryItem = async (item: HistoryItem) => {
    try {
      const response = await fetch(item.originalBase64)
      const blob = await response.blob()
      const file = new File([blob], "original.png", { type: "image/png" })

      setImageFile(file)
      setImageUrl(item.originalBase64)
      setNaturalSize(null)
      setBoxPrompt(item.boxPrompt)
      setDrawnPath(null)
      setDragPath([])
      setTextPrompt(item.prompt)
      setPromptInput(item.prompt)
      setInpaintResult(item.resultBase64)
      setInpaintSeed(item.seed)
      setInpaintDuration(item.duration)
      setShowComparison(true)
      setResult(null)
      setProcessingPhase("idle")
      setActiveSection("studio")
    } catch (_e) {
      setError("Failed to load history item.")
    }
  }

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

      // Session saving logic: when a new image is uploaded, we start a new session
      const base64 = await fileToBase64(normalized.file)
      const newId = crypto.randomUUID()
      setCurrentSessionId(newId)
      const newSession: SessionItem = {
        id: newId,
        name: normalized.file.name,
        originalBase64: base64,
        thumbnailUrl: base64,
        timestamp: Date.now(),
        prompt: "",
        boxPrompt: null,
        drawnPath: null,
        inpaintResultBase64: null,
      }
      setSessions((prev) => {
        const updated = [newSession, ...prev]
        localStorage.setItem("lumaerase_sessions", JSON.stringify(updated))
        return updated
      })
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

  const handleClearImage = useCallback(() => {
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
    setCurrentSessionId(null)
  }, [])

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
      appendInpaintingParams(inpaintForm, settings)
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

      // Save to history
      await saveToHistory(
        imageFile,
        inpaintData.result_png_base64,
        activeQuery,
        inpaintData.seed_used,
        inpaintData.duration_ms,
        activeBox,
      )
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
      appendInpaintingParams(formData, settings)
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

        // Save to history
        await saveToHistory(
          imageFile,
          data.result_png_base64,
          textPrompt,
          data.seed_used,
          data.duration_ms,
          boxPrompt,
        )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Inpainting failed."
        setError(errMsg)
      } finally {
        setProcessingPhase("idle")
      }
    },
    [imageFile, result, settings, textPrompt, boxPrompt, saveToHistory],
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

  // Keyboard Shortcuts (Alt+N for new erasure)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault()
        handleClearImage()
        setActiveSection("studio")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleClearImage])

  useEffect(() => {
    if (
      activeSection === "settings" &&
      !serviceStatus.loading &&
      !serviceStatus.segmentation &&
      !serviceStatus.inpainting
    ) {
      void handleRefreshServiceStatus()
    }
  }, [
    activeSection,
    handleRefreshServiceStatus,
    serviceStatus.inpainting,
    serviceStatus.loading,
    serviceStatus.segmentation,
  ])

  const filteredHistory = historyList.filter(
    (item) =>
      item.title.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      item.prompt.toLowerCase().includes(gallerySearch.toLowerCase()),
  )
  const hasRunnableSelection = Boolean(imageFile && (result || boxPrompt || textPrompt))
  const settingsStatusText = serviceStatus.error
    ? "Status unavailable"
    : serviceStatus.loading
      ? "Checking services"
      : serviceStatus.inpainting?.loaded && serviceStatus.segmentation?.loaded
        ? "Models ready"
        : "Ready to check"

  return (
    <div className="w-full h-screen bg-zinc-50 dark:bg-zinc-950 flex z-20 select-none overflow-hidden">
      {/* Left Sidebar (Open WebUI-like) */}
      <div
        onClick={() => {
          if (!sidebarOpen) {
            setSidebarOpen(true)
          }
        }}
        className={`bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-900 flex flex-col h-full transition-all duration-300 shrink-0 overflow-hidden ${
          sidebarOpen
            ? "w-66"
            : "w-14 cursor-e-resize hover:bg-zinc-100/50 dark:hover:bg-zinc-900/60"
        }`}
        title={sidebarOpen ? undefined : "Expand sidebar"}
      >
        {sidebarOpen && (
          <>
        <div className="p-3.5 flex-1 flex flex-col min-h-0">
          {/* Logo / Header */}
          <div className="px-3.5 py-2 flex items-center justify-between gap-2.5 flex-shrink-0 mb-4 select-none">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="size-6 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center border border-emerald-500/20 shrink-0">
                <Sparkles className="size-3.5" />
              </div>
              <span className="font-extrabold text-sm text-zinc-900 dark:text-zinc-50 tracking-tight truncate">
                LumaErase
              </span>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setSidebarOpen(false)
              }}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>

          {/* Navigation Sections */}
          <div className="space-y-1 flex-shrink-0 mb-4">
            <button
              type="button"
              onClick={() => {
                handleClearImage()
                setActiveSection("studio")
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs rounded-xl transition font-medium ${
                activeSection === "studio" && !imageFile
                  ? "bg-zinc-200/60 dark:bg-zinc-850 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/30 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-350"
              }`}
            >
              <span className="flex items-center gap-3">
                <Plus className="size-4 text-emerald-500 animate-pulse" />
                New Session
              </span>
              <span className="text-[9px] text-zinc-405 font-mono">Alt+N</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("gallery")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-xs rounded-xl transition font-medium ${
                activeSection === "gallery"
                  ? "bg-zinc-200/60 dark:bg-zinc-850 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/30 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-350"
              }`}
            >
              <ImageIcon
                className={`size-4 ${activeSection === "gallery" ? "text-emerald-500" : ""}`}
              />
              Gallery
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("settings")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-xs rounded-xl transition font-medium ${
                activeSection === "settings"
                  ? "bg-zinc-200/60 dark:bg-zinc-855 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/30 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-350"
              }`}
            >
              <Sliders
                className={`size-4 ${activeSection === "settings" ? "text-emerald-500" : ""}`}
              />
              Settings
            </button>
          </div>

          {/* Recent Sessions List */}
          {sessions.length > 0 && (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 border-t border-zinc-150 dark:border-zinc-900 pt-3">
              <div className="px-3.5 text-[10px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider mb-2">
                Recent Sessions
              </div>
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className={`group w-full flex items-center justify-between px-3.5 py-1 text-xs rounded-xl transition font-medium ${
                    currentSessionId === sess.id
                      ? "bg-zinc-200/60 dark:bg-zinc-850 text-zinc-900 dark:text-white"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/30 dark:hover:bg-zinc-900/50 hover:text-zinc-700 dark:hover:text-zinc-350"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-2.5 truncate pr-2 py-1 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                    onClick={() => handleLoadSession(sess)}
                  >
                    {sess.thumbnailUrl ? (
                      <img
                        src={sess.thumbnailUrl}
                        className="size-5 rounded-md object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
                        alt=""
                      />
                    ) : (
                      <ImageIcon className="size-3.5 text-zinc-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {sess.name || "Untitled Session"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(sess.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition shrink-0 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                    title="Delete Session"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Profile Footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/40 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/20 shrink-0">
              U
            </div>
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                Luma User
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                Local Account
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveSection("settings")}
            className="p-1.5 text-zinc-400 hover:text-zinc-660 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Pipeline Settings"
          >
            <Sliders className="size-4" />
          </button>
        </div>
          </>
        )}
        {!sidebarOpen && (
          <div className="flex h-full flex-col items-center px-2 py-4">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setSidebarOpen(true)
              }}
              className="mb-6 flex size-9 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 transition hover:bg-emerald-500/15 dark:text-emerald-400"
              title="Expand sidebar"
            >
              <ChevronRight className="size-4" />
            </button>

            <div className="flex flex-1 flex-col items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  handleClearImage()
                  setActiveSection("studio")
                }}
                className={`flex size-9 items-center justify-center rounded-2xl transition ${
                  activeSection === "studio" && !imageFile
                    ? "bg-zinc-200/80 text-emerald-600 shadow-xs dark:bg-zinc-850 dark:text-emerald-400"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
                title="New Session"
              >
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setActiveSection("gallery")
                }}
                className={`flex size-9 items-center justify-center rounded-2xl transition ${
                  activeSection === "gallery"
                    ? "bg-zinc-200/80 text-emerald-600 shadow-xs dark:bg-zinc-850 dark:text-emerald-400"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
                title="Gallery"
              >
                <ImageIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setActiveSection("settings")
                }}
                className={`flex size-9 items-center justify-center rounded-2xl transition ${
                  activeSection === "settings"
                    ? "bg-zinc-200/80 text-emerald-600 shadow-xs dark:bg-zinc-850 dark:text-emerald-400"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
                title="Settings"
              >
                <Sliders className="size-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setActiveSection("settings")
              }}
              className="flex size-9 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-xs font-bold text-emerald-600 transition hover:bg-emerald-500/15 dark:text-emerald-400"
              title="Local Account"
            >
              U
            </button>
          </div>
        )}
      </div>

      {/* Right Main Pane */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        {/* Section Content */}
        {activeSection === "studio" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            {/* Viewport canvas area */}
            <div className="flex-1 w-full h-full relative flex items-center justify-center p-6 overflow-hidden bg-zinc-100/35 dark:bg-zinc-950">
              {imageUrl ? (
                showComparison && inpaintResult ? (
                  /* Before/After comparison view */
                  <BeforeAfterSlider
                    beforeSrc={imageUrl}
                    afterSrc={`data:image/png;base64,${inpaintResult}`}
                    className="shadow-2xl border border-zinc-200 dark:border-zinc-850 rounded-lg overflow-hidden max-h-[calc(100vh-14rem)] max-w-full"
                  />
                ) : inpaintResult && !showComparison ? (
                  /* Static result view */
                  <div className="relative w-fit h-fit select-none">
                    <img
                      src={`data:image/png;base64,${inpaintResult}`}
                      alt="Object removal result"
                      className="block select-none max-h-[calc(100vh-14rem)] w-auto max-w-full shadow-2xl border border-zinc-200 dark:border-zinc-850 rounded-lg animate-fade-in animate-duration-200"
                      draggable={false}
                    />
                  </div>
                ) : (
                  /* Interactive editor view (drawing/masking) */
                  <div
                    role="application"
                    aria-label="Image editor canvas"
                    className={`relative w-fit h-fit select-none rounded-lg overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-950/10 dark:bg-black/40 ${
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
                /* Welcome Screen */
                <div className="flex flex-col items-center justify-center max-w-2xl px-6 text-center animate-fade-in py-12">
                  <div className="relative size-16 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5 mb-6">
                    <Sparkles className="size-8" />
                  </div>

                  <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight leading-none mb-3">
                    LumaErase Studio
                  </h1>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md leading-relaxed mb-8">
                    Upload an image and specify what you'd like to remove.
                    Choose between drawing a region or typing a simple text
                    description.
                  </p>

                  {/* Suggestion Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl mb-8">
                    <button
                      type="button"
                      onClick={() =>
                        document.getElementById("canvas-image-upload")?.click()
                      }
                      className="flex flex-col items-start text-left p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-xs group"
                    >
                      <Upload className="size-4.5 text-emerald-500 mb-2.5 transition group-hover:scale-110" />
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        Upload Image
                      </span>
                      <span className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-1">
                        Select a PNG, JPG, or WebP to edit
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveSection("gallery")}
                      className="flex flex-col items-start text-left p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-xs group"
                    >
                      <ImageIcon className="size-4.5 text-emerald-500 mb-2.5 transition group-hover:scale-110" />
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        Explore Gallery
                      </span>
                      <span className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-1">
                        View and reload your past edits
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveSection("settings")}
                      className="flex flex-col items-start text-left p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-xs group"
                    >
                      <Sliders className="size-4.5 text-emerald-500 mb-2.5 transition group-hover:scale-110" />
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        Pipeline Settings
                      </span>
                      <span className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-1">
                        Tune diffusion steps and strengths
                      </span>
                    </button>
                  </div>
                </div>
              )}
              <Input
                id="canvas-image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </div>

            {/* Bottom Input Area */}
            <div className="w-full bg-transparent px-6 pb-6 flex flex-col gap-2 items-center shrink-0 z-35">
              <div className="w-full max-w-3xl flex flex-col gap-2.5">
                {/* Active Box Prompt Info (if any) */}
                {boxPrompt && !inpaintResult && (
                  <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl font-semibold animate-fade-in shadow-xs">
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
                      className="font-bold underline hover:text-emerald-500 dark:hover:text-emerald-300"
                    >
                      Reset Area
                    </button>
                  </div>
                )}

                {inpaintResult && (
                  /* Results action toolbar */
                  <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-zinc-200 dark:border-zinc-805 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={showComparison ? "default" : "outline"}
                        onClick={() => setShowComparison((prev) => !prev)}
                        className={
                          showComparison
                            ? "bg-emerald-600 hover:bg-emerald-555 text-white border-0 h-9 font-semibold rounded-xl"
                            : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 h-9 font-semibold rounded-xl"
                        }
                      >
                        <GripVertical className="size-3.5 mr-1" />
                        {showComparison
                          ? "Show Result"
                          : "Compare Before/After"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemoveObject()}
                        disabled={isProcessing}
                        className="border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 h-9 font-semibold rounded-xl"
                      >
                        <RefreshCw className="size-3.5 mr-1" />
                        Retry (New Seed)
                      </Button>
                    </div>

                    <div className="flex items-center gap-3">
                      {inpaintDuration !== null && (
                        <span className="text-[11px] text-zinc-450 dark:text-zinc-500 font-mono">
                          {(inpaintDuration / 1000).toFixed(1)}s · seed:{" "}
                          {inpaintSeed}
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          const link = document.createElement("a")
                          link.href = `data:image/png;base64,${inpaintResult}`
                          link.download = "removed_object.png"
                          link.click()
                        }}
                        className="bg-emerald-650 hover:bg-emerald-600 text-white font-semibold h-9 rounded-xl shadow-xs"
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
                  className="flex gap-3 bg-white dark:bg-zinc-900 p-2 border border-zinc-200 dark:border-zinc-800 rounded-3xl items-center w-full focus-within:border-zinc-350 dark:focus-within:border-zinc-700 shadow-md transition-all"
                >
                  <div className="pl-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        document.getElementById("canvas-image-upload")?.click()
                      }
                      className="text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-250 p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                      title="Upload image"
                    >
                      <Plus className="size-4.5" />
                    </button>
                    <div className="text-zinc-450">
                      <Sparkles className="size-4 text-emerald-500" />
                    </div>
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
                    className="flex-1 text-sm bg-transparent border-none text-zinc-850 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus-visible:ring-0 focus-visible:outline-none"
                  />
                  <Button
                    type="submit"
                    disabled={
                      !imageFile ||
                      isProcessing ||
                      (!promptInput.trim() && !boxPrompt)
                    }
                    className="bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 hover:bg-zinc-755 dark:hover:bg-zinc-100 rounded-full shrink-0 shadow-xs h-9 w-9 p-0 flex items-center justify-center transition-all duration-200"
                  >
                    {isProcessing ? (
                      <Loader2 className="animate-spin size-4" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </form>

                {error && (
                  <div className="rounded-xl border border-red-200 dark:border-red-955/30 bg-red-50 dark:bg-red-955/20 p-2.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-2 animate-fade-in shadow-xs">
                    <span>⚠️</span>
                    <p>{error}</p>
                  </div>
                )}

                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center">
                  LumaErase can make mistakes. Verify important results. Powered
                  by SAM 3.1 &amp; ObjectClear.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === "gallery" && (
          <div className="flex-1 overflow-y-auto scrollbar-thin bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,rgba(244,244,245,0.85),rgba(250,250,250,1))] p-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_32%),linear-gradient(180deg,rgba(9,9,11,1),rgba(24,24,27,0.86))] md:p-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
              <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                <div className="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:p-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 shadow-lg shadow-emerald-500/10 dark:text-emerald-400">
                        <History className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                          Erasure Gallery
                        </h2>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Review, reload, and download your previous object removals.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                      <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 shadow-xs dark:border-zinc-800 dark:bg-zinc-950/60">
                        {historyList.length} total edits
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 shadow-xs dark:border-zinc-800 dark:bg-zinc-950/60">
                        {filteredHistory.length} shown
                      </span>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
                    <div className="relative flex-1 md:w-72 md:flex-none">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search edits..."
                        value={gallerySearch}
                        onChange={(e) => setGallerySearch(e.target.value)}
                        className="h-10 w-full rounded-2xl border border-zinc-200 bg-white/90 pl-10 pr-3 text-sm font-medium text-zinc-800 shadow-xs outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-100 dark:placeholder-zinc-500"
                      />
                    </div>
                    {historyList.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (
                            confirm(
                              "Are you sure you want to clear all history items?",
                            )
                          ) {
                            setHistoryList([])
                            localStorage.removeItem("lumaerase_history")
                          }
                        }}
                        className="h-10 rounded-2xl border-red-200 bg-white/90 px-4 text-xs font-bold text-red-650 shadow-xs hover:bg-red-50 dark:border-red-955/30 dark:bg-zinc-950/70 dark:text-red-400 dark:hover:bg-red-955/10"
                      >
                        <Trash2 className="mr-1.5 size-3.5" />
                        Clear Gallery
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="flex min-h-[380px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-250 bg-white/75 p-10 text-center shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="mb-5 flex size-16 items-center justify-center rounded-3xl border border-zinc-200 bg-zinc-50 text-zinc-350 shadow-inner dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-700">
                    <ImageIcon className="size-8" />
                  </div>
                  <p className="text-base font-extrabold text-zinc-800 dark:text-zinc-200">
                    No matching edits yet
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Finished images from the studio will appear here with their original preview, seed, and render time.
                  </p>
                  <Button
                    onClick={() => {
                      setGallerySearch("")
                      setActiveSection("studio")
                    }}
                    className="mt-6 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-555"
                  >
                    Go to Studio
                  </Button>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      className="group overflow-hidden rounded-3xl border border-white/80 bg-white/85 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-950/10 dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:hover:border-emerald-500/25"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,rgba(244,244,245,1),rgba(228,228,231,0.8))] dark:bg-[linear-gradient(135deg,rgba(9,9,11,1),rgba(39,39,42,0.8))]">
                        <img
                          src={item.resultBase64}
                          alt="result"
                          className="absolute inset-0 h-full w-full object-contain p-3 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-0"
                        />
                        <img
                          src={item.originalBase64}
                          alt="original"
                          className="absolute inset-0 h-full w-full object-contain p-3 opacity-0 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
                        />
                        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-md">
                            Result
                          </span>
                          <span className="rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold text-zinc-700 opacity-0 shadow-sm backdrop-blur-md transition group-hover:opacity-100 dark:bg-zinc-950/80 dark:text-zinc-200">
                            Original preview
                          </span>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent opacity-80" />
                      </div>

                      <div className="flex flex-1 flex-col gap-4 p-4">
                        <div className="space-y-1.5">
                          <p className="line-clamp-1 text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                            {item.title}
                          </p>
                          <p className="text-[11px] font-medium text-zinc-450 dark:text-zinc-500">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                            <span className="block text-[9px] uppercase tracking-wide text-zinc-400">
                              Render
                            </span>
                            {(item.duration / 1000).toFixed(1)}s
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                            <span className="block text-[9px] uppercase tracking-wide text-zinc-400">
                              Seed
                            </span>
                            {item.seed}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleLoadHistoryItem(item)}
                            className="h-10 flex-1 rounded-2xl bg-zinc-900 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-755 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                          >
                            Load in Studio
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              const link = document.createElement("a")
                              link.href = item.resultBase64
                              link.download = "removed_object.png"
                              link.click()
                            }}
                            className="h-10 rounded-2xl bg-emerald-600 px-4 text-white shadow-xs transition hover:bg-emerald-555"
                            title="Download result"
                          >
                            <Download className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === "settings" && (
          <div className="flex-1 overflow-y-auto scrollbar-thin bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,rgba(244,244,245,0.85),rgba(250,250,250,1))] p-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_32%),linear-gradient(180deg,rgba(9,9,11,1),rgba(24,24,27,0.86))] md:p-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
              <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                <div className="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 shadow-lg shadow-emerald-500/10 dark:text-emerald-400">
                      <Sliders className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                        Pipeline Settings
                      </h2>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Saved automatically and used by the next object removal run.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshServiceStatus}
                      disabled={serviceStatus.loading}
                      className="h-10 rounded-2xl border-zinc-200 bg-white/90 px-4 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      <RefreshCw
                        className={`mr-1.5 size-3.5 ${serviceStatus.loading ? "animate-spin" : ""}`}
                      />
                      Refresh Status
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettings(DEFAULT_PIPELINE_SETTINGS)}
                      className="h-10 rounded-2xl border-zinc-200 bg-white/90 px-4 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Reset Defaults
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-5">
                  <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                          Runtime Status
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {settingsStatusText}
                        </p>
                      </div>
                      <span
                        className={`size-2.5 rounded-full ${
                          serviceStatus.inpainting?.loaded &&
                          serviceStatus.segmentation?.loaded
                            ? "bg-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.7)]"
                            : "bg-zinc-300 dark:bg-zinc-700"
                        }`}
                      />
                    </div>
                    {serviceStatus.error ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-955/30 dark:bg-red-955/20 dark:text-red-400">
                        {serviceStatus.error}
                      </div>
                    ) : (
                      <div className="grid gap-3 text-xs">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                            Segmentation
                          </span>
                          <span className="mt-1 block truncate font-semibold text-zinc-800 dark:text-zinc-200">
                            {serviceStatus.segmentation?.model || "SAM service"}
                          </span>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                            Inpainting
                          </span>
                          <span className="mt-1 block truncate font-semibold text-zinc-800 dark:text-zinc-200">
                            {serviceStatus.inpainting?.model || "ObjectClear"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                              Device
                            </span>
                            <span className="mt-1 block font-semibold text-zinc-800 dark:text-zinc-200">
                              {serviceStatus.inpainting?.device || "-"}
                            </span>
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                              CUDA
                            </span>
                            <span className="mt-1 block font-semibold text-zinc-800 dark:text-zinc-200">
                              {serviceStatus.inpainting?.cuda_available
                                ? "Available"
                                : "Unknown"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                      Apply Settings
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Changes are saved immediately. Use this button to rerun the current selection with the updated values.
                    </p>
                    <Button
                      onClick={() => {
                        setActiveSection("studio")
                        if (result) {
                          void handleRemoveObject()
                          return
                        }
                        if (imageFile && (boxPrompt || textPrompt)) {
                          void handleRunSegmentation(textPrompt, boxPrompt)
                        }
                      }}
                      disabled={!hasRunnableSelection || isProcessing}
                      className="mt-4 h-11 w-full rounded-2xl bg-emerald-600 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-555 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {result ? "Re-run Inpainting" : "Run Current Selection"}
                    </Button>
                    {!hasRunnableSelection && (
                      <p className="mt-3 text-[11px] font-medium text-zinc-450 dark:text-zinc-500">
                        Upload an image and draw or prompt a target before applying settings.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                          Inpainting Steps
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          Higher values improve detail but take longer.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {settings.steps}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="50"
                      value={settings.steps}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          steps: Number.parseInt(e.target.value, 10),
                        }))
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-500 dark:bg-zinc-800"
                    />
                  </div>

                  <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                          Guidance Scale
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          Controls how strongly the prompt guides the result.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {settings.guidanceScale}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={settings.guidanceScale}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          guidanceScale: Number.parseFloat(e.target.value),
                        }))
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-500 dark:bg-zinc-800"
                    />
                  </div>

                  <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                          Strength
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          How much the masked region is replaced.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {settings.strength.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={settings.strength}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          strength: Number.parseFloat(e.target.value),
                        }))
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-500 dark:bg-zinc-800"
                    />
                  </div>

                  <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                          Mask Dilation
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          Expands the mask edge for cleaner blending.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {settings.maskDilation}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={settings.maskDilation}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          maskDilation: Number.parseInt(e.target.value, 10),
                        }))
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-500 dark:bg-zinc-800"
                    />
                  </div>

                  <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                          Mask Feather
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          Softens the mask edge transition.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {settings.maskFeather.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={settings.maskFeather}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          maskFeather: Number.parseFloat(e.target.value),
                        }))
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-500 dark:bg-zinc-800"
                    />
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl transition hover:border-emerald-500/30 dark:border-zinc-800/80 dark:bg-zinc-900/70">
                    <div>
                      <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                        Prefill Latents
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        Uses fast prefill before diffusion for large removed areas.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.prefill}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          prefill: e.target.checked,
                        }))
                      }
                      className="size-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
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

function appendInpaintingParams(
  formData: FormData,
  settings: {
    steps: number
    guidanceScale: number
    strength: number
    maskDilation: number
    maskFeather: number
    prefill: boolean
  },
) {
  formData.append("steps", String(settings.steps))
  formData.append("guidance_scale", String(settings.guidanceScale))
  formData.append("strength", String(settings.strength))
  formData.append("mask_dilation", String(settings.maskDilation))
  formData.append("mask_feather", String(settings.maskFeather))
  formData.append("prefill", String(settings.prefill))
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
