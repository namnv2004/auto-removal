import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/object-removal")({
  component: ObjectRemoval,
  head: () => ({
    meta: [
      {
        title: "Object Removal - Demo",
      },
    ],
  }),
})

function ObjectRemoval() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Object Removal</h1>
        <p className="text-muted-foreground">
          Base screen for upload, segmentation preview, mask editing, and high-quality inpainting.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <p className="text-sm font-medium text-muted-foreground">Step 1</p>
          <h2 className="mt-2 text-lg font-semibold">Upload image</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Validate size, format, EXIF orientation, and generate preview.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <p className="text-sm font-medium text-muted-foreground">Step 2</p>
          <h2 className="mt-2 text-lg font-semibold">Select object</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use point, box, or brush input before routing to SAM segmentation.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <p className="text-sm font-medium text-muted-foreground">Step 3</p>
          <h2 className="mt-2 text-lg font-semibold">Inpaint result</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Run BrushNet-SDXL or PowerPaint-SDXL, then blend the final crop.
          </p>
        </div>
      </div>
    </div>
  )
}
