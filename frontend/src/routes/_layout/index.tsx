import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import {
  ArrowRight,
  Cpu,
  ImageUp,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "LumaErase",
      },
    ],
  }),
})

function Dashboard() {
  const resultExamples: ResultExample[] = [
    {
      title: "Shadow removal",
      beforeSrc:
        "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_09_input.png",
      afterSrc:
        "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_09_output.png",
    },
    {
      title: "Reflection cleanup",
      beforeSrc:
        "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/reflection_09_input.png",
      afterSrc:
        "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/reflection_09_output.png",
    },
    {
      title: "Background reconstruction",
      beforeSrc:
        "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_03_input.jpg",
      afterSrc:
        "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_03_output.jpg",
    },
  ]

  const highlights = [
    {
      icon: ShieldCheck,
      title: "Public review flow",
      description:
        "No sign-in is required for the demo, while account and admin screens stay protected.",
    },
    {
      icon: Layers3,
      title: "SAM 3.1 segmentation",
      description:
        "Select an object with a text prompt or a drawn region, then preview the generated mask.",
    },
    {
      icon: Cpu,
      title: "GPU inpainting",
      description:
        "ObjectClear reconstructs the removed area with mask dilation, feathering, and comparison output.",
    },
  ]

  const pipeline = [
    "Upload and normalize image",
    "Prompt or circle the target object",
    "Generate and refine the segmentation mask",
    "Inpaint, compare, and download the result",
  ]

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border bg-zinc-950 px-6 py-10 text-white shadow-2xl md:px-10 lg:px-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.32),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.24),transparent_30%),linear-gradient(135deg,rgba(24,24,27,0.9),rgba(9,9,11,1))]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-zinc-200">
              <Sparkles className="size-3.5" />
              Public AI Image Editing Demo
            </div>

            <div className="max-w-3xl space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                LumaErase removes unwanted objects with an end-to-end AI
                pipeline.
              </h1>
              <p className="text-base leading-8 text-zinc-300 md:text-lg">
                LumaErase showcases a quality-first image cleanup workflow:
                upload an image, guide the segmentation, preview the mask, then
                reconstruct a natural background with GPU inpainting.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-fit" size="lg">
                <RouterLink to="/object-removal">
                  Try the demo
                  <ArrowRight />
                </RouterLink>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <ImageUp className="size-5 text-blue-200" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Demo pipeline</p>
                <h2 className="font-medium">From upload to restored image</h2>
              </div>
            </div>
            <div className="space-y-3">
              {pipeline.map((step, index) => (
                <div
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3"
                  key={step}
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-400/15 text-sm font-semibold text-blue-100">
                    {index + 1}
                  </div>
                  <p className="text-sm text-zinc-200">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
              Result evidence
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              Real before and after examples from ObjectClear.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The public demo is powered by the ObjectClear inpainting model.
              These reference results show the type of object and effect removal
              the workflow is designed to demonstrate before reviewers upload
              their own image.
            </p>
          </div>
          <Button asChild className="w-fit" variant="outline">
            <RouterLink to="/object-removal">
              Generate your own result
            </RouterLink>
          </Button>
        </div>

        <div className="space-y-6">
          {resultExamples.map((example) => (
            <article
              className="overflow-hidden rounded-3xl border bg-background shadow-sm"
              key={example.title}
            >
              <div className="border-b px-5 py-4">
                <h3 className="text-xl font-semibold tracking-tight">
                  {example.title}
                </h3>
              </div>
              <div className="grid grid-cols-2 bg-muted/20 lg:min-h-[460px]">
                <ResultImage
                  alt={`${example.title} before`}
                  label="Before"
                  src={example.beforeSrc}
                />
                <ResultImage
                  alt={`${example.title} after`}
                  label="After"
                  src={example.afterSrc}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {highlights.map((item) => (
          <article
            className="rounded-2xl border bg-card p-6 shadow-sm transition-colors hover:border-primary/40"
            key={item.title}
          >
            <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="size-5" />
            </div>
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {item.description}
            </p>
          </article>
        ))}
      </section>
    </div>
  )
}

type ResultExample = {
  title: string
  beforeSrc: string
  afterSrc: string
}

type ResultImageProps = {
  alt: string
  label: string
  src: string
}

function ResultImage({ alt, label, src }: ResultImageProps) {
  return (
    <figure className="relative min-h-[280px] overflow-hidden border-r last:border-r-0 sm:min-h-[380px] lg:min-h-[460px]">
      <img
        alt={alt}
        className="size-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={src}
      />
      <figcaption className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
        {label}
      </figcaption>
    </figure>
  )
}
