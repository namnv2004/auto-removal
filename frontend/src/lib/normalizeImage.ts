export type NormalizedImage = {
  file: File
  previewUrl: string
  width: number
  height: number
}

const MAX_LONG_EDGE = 4096

/** Apply EXIF orientation, cap resolution, and re-encode for upload. */
export async function normalizeImageFile(file: File): Promise<NormalizedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  })
  let width = bitmap.width
  let height = bitmap.height
  const longEdge = Math.max(width, height)
  if (longEdge > MAX_LONG_EDGE) {
    const scale = MAX_LONG_EDGE / longEdge
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bitmap.close()
    throw new Error("Canvas is not available")
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const useJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)
  const mime = useJpeg ? "image/jpeg" : "image/png"
  const ext = useJpeg ? "jpg" : "png"

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error("Failed to encode image"))
      },
      mime,
      useJpeg ? 0.92 : undefined,
    )
  })

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image"
  const normalizedFile = new File([blob], `${baseName}.${ext}`, { type: mime })

  return {
    file: normalizedFile,
    previewUrl: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  }
}
