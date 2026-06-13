import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Github,
  ImageUp,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserRound,
  Workflow,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ObjectRemoval } from "./object-removal"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Nam Gaussian - AI Portfolio",
      },
    ],
  }),
})

const CV_URL =
  "https://drive.google.com/file/d/1-xFrllg8LkK9vkMSZ_fz4KjtWUSTwqk8/view?usp=drive_link"

const projects = [
  {
    title: "Object Removal Studio",
    eyebrow: "Computer Vision",
    description:
      "An AI object-removal platform that turns research-grade segmentation and inpainting into a usable editing workspace for high-quality image restoration.",
    href: "https://image.namgaussian-face.site/",
    icon: ImageUp,
    accent: "from-emerald-400/35 via-teal-400/10 to-transparent",
    role: "Full-stack AI Engineer",
    timeline: "Mar 2026 - Present",
    summary:
      "I built the product flow around model constraints: upload normalization, prompt/drawn target selection, mask post-processing, GPU-safe inference, before/after review, local history, and settings that actually affect the backend pipeline.",
    stats: ["SAM 3.1", "ObjectClear", "OpenCV Telea", "GPU inference"],
    features: [
      "Text and drawn-region object selection with advanced mask refinement",
      "Dilation, feathering, crop-focused inpainting, and color correction",
      "Lazy model loading, CPU offloading, and VRAM-aware serialized execution",
    ],
    sections: [
      {
        title: "Pipeline Design",
        items: [
          "SAM 3.1 generates the target mask from text prompts or user-drawn regions.",
          "Mask thresholding, dilation, and feathering make object boundaries cleaner before inpainting.",
          "ObjectClear reconstructs the selected area with crop-focused inference and blending corrections.",
        ],
      },
      {
        title: "Product Workflow",
        items: [
          "A single studio view supports upload, selection, generation, comparison, download, and gallery reload.",
          "Pipeline settings are persisted and exposed as real controls instead of static UI placeholders.",
          "The sidebar, gallery, and settings panels are designed for quick iteration on repeated edits.",
        ],
      },
      {
        title: "Runtime Reliability",
        items: [
          "GPU-heavy requests are serialized to avoid VRAM contention on limited hardware.",
          "Models load lazily and can offload to CPU when not actively used.",
          "Backend status endpoints expose model/device readiness directly in the UI.",
        ],
      },
    ],
  },
  {
    title: "RAG Ops Chat",
    eyebrow: "LLMOps",
    description:
      "An end-to-end RAGOps platform for ingestion, retrieval, streaming generation, observability, caching, and safety policy enforcement.",
    href: "https://chat.namgaussian-face.site/",
    icon: MessageSquareText,
    accent: "from-violet-400/30 via-blue-400/10 to-transparent",
    role: "AI Platform Engineer",
    timeline: "Sep 2025 - Dec 2025",
    summary:
      "I structured the RAG system as an operations platform, not just a chat endpoint: ingestion, vector storage, retrieval tools, streaming responses, semantic cache, tracing, safety policy, and deployment layers work together.",
    stats: ["LangGraph", "FastAPI SSE", "Redis cache", "Langfuse"],
    features: [
      "Airflow and MinIO ingestion with ChromaDB vector storage",
      "Tool-based retrieval through FastAPI and SSE streaming endpoints",
      "Langfuse tracing, Redis semantic caching, and NeMo Guardrails",
    ],
    sections: [
      {
        title: "Data Layer",
        items: [
          "Airflow orchestrates document loading, chunking, embedding, and storage workflows.",
          "MinIO stores intermediate artifacts while ChromaDB provides vector search for retrieval.",
          "Datasets are organized for repeatable ingestion and controlled evaluation cycles.",
        ],
      },
      {
        title: "Inference Layer",
        items: [
          "FastAPI exposes both blocking and SSE streaming retrieval endpoints.",
          "LangGraph coordinates tool-based retrieval and response generation flows.",
          "Redis semantic caching reduces redundant LLM calls and improves response latency.",
        ],
      },
      {
        title: "Ops & Safety",
        items: [
          "Langfuse tracks prompts, traces, token usage, and cost visibility.",
          "NeMo Guardrails enforces safety rules and blocks unsafe conversation paths.",
          "The architecture separates gateway, routing, observability, cache, and storage concerns.",
        ],
      },
    ],
  },
]

const imageComparisons = [
  {
    title: "Shadow removal",
    before:
      "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_09_input.png",
    after:
      "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_09_output.png",
  },
  {
    title: "Reflection cleanup",
    before:
      "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/reflection_09_input.png",
    after:
      "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/reflection_09_output.png",
  },
  {
    title: "Background reconstruction",
    before:
      "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_03_input.jpg",
    after:
      "https://zjx0101.github.io/projects/ObjectClear/assets/images_cleared/shadow_03_output.jpg",
  },
]

const capabilities = [
  {
    icon: BrainCircuit,
    title: "AI product engineering",
    description:
      "Shipping practical interfaces around model pipelines instead of isolated notebooks.",
  },
  {
    icon: TerminalSquare,
    title: "Backend and infra",
    description:
      "FastAPI, Docker, Kubernetes, Cloudflare routing, observability, and deployment workflows.",
  },
  {
    icon: Bot,
    title: "Applied ML systems",
    description:
      "Vision, retrieval, streaming generation, model status, and user-facing quality controls.",
  },
]

function Dashboard() {
  if (
    typeof window !== "undefined" &&
    window.location.hostname.startsWith("image.")
  ) {
    return <ObjectRemoval />
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(255,255,255,0.20),transparent_34%),radial-gradient(circle_at_12%_20%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(99,102,241,0.20),transparent_26%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-size-[48px_48px] opacity-25" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="sticky top-5 z-20 flex items-center justify-between rounded-full border border-white/10 bg-black/45 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <a href="/" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white text-black">
              <Sparkles className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-black tracking-tight">Nam Gaussian</p>
              <p className="hidden text-[11px] font-medium text-zinc-500 sm:block">
                AI Engineer
              </p>
            </div>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-zinc-400 md:flex">
            <a href="#projects" className="transition hover:text-white">
              Projects
            </a>
            <a href="#systems" className="transition hover:text-white">
              Systems
            </a>
            <a href="#contact" className="transition hover:text-white">
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-full border-white/15 bg-white/5 px-4 text-xs font-black text-white hover:bg-white/10 hover:text-white"
            >
              <a href={CV_URL} target="_blank" rel="noreferrer">
                <FileText className="mr-1.5 size-3.5" />
                CV
              </a>
            </Button>
            <Button
              asChild
              className="h-9 rounded-full bg-white px-4 text-xs font-black text-black shadow-[0_0_30px_rgba(255,255,255,0.18)] hover:bg-zinc-200"
            >
              <RouterLink to="/login">
                <LockKeyhole className="mr-1.5 size-3.5" />
                Login
              </RouterLink>
            </Button>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center md:py-24">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.28em] text-zinc-400 shadow-2xl shadow-black/20 backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />
            Nam Gaussian / AI Engineer
          </div>

          <h1 className="max-w-5xl text-balance text-5xl font-black tracking-[-0.06em] text-white sm:text-6xl md:text-7xl lg:text-8xl">
            Building AI products that feel ready to use.
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base font-medium leading-8 text-zinc-400 md:text-lg">
            I design and ship applied AI systems across computer vision, RAG,
            backend APIs, deployment, and user-facing product workflows.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-white px-6 text-sm font-black text-black hover:bg-zinc-200"
            >
              <a href="#projects">
                View Projects
                <ArrowRight className="ml-2 size-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-white/15 bg-white/5 px-6 text-sm font-black text-white hover:bg-white/10 hover:text-white"
            >
              <a href="https://chat.namgaussian-face.site/">
                Open RAG Chat
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          </div>
        </section>

        <section id="projects" className="space-y-6 pb-10">
          <ProjectShowcase project={projects[0]} variant="image" />
          <ProjectShowcase project={projects[1]} variant="chat" />
        </section>

        <section
          id="systems"
          className="grid gap-4 border-y border-white/10 py-10 md:grid-cols-3"
        >
          {capabilities.map((item) => (
            <article
              key={item.title}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl"
            >
              <div className="mb-5 flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-200">
                <item.icon className="size-5" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-white">
                {item.title}
              </h3>
              <p className="mt-3 text-sm font-medium leading-7 text-zinc-500">
                {item.description}
              </p>
            </article>
          ))}
        </section>

        <footer id="contact" className="py-8">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl md:p-7">
            <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-zinc-500">
                  Contact
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">
                  Nguyễn Văn Nam
                </h2>
                <p className="mt-3 max-w-xl text-sm font-medium leading-7 text-zinc-400">
                  AI Engineer focused on production-ready LLM, RAG, computer vision, backend, and deployment systems.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href="mailto:nam.2004.911.313@gmail.com"
                  className="rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <Mail className="mb-3 size-4 text-emerald-300" />
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Email
                  </p>
                  <p className="mt-1 break-all text-sm font-bold text-white">
                    nam.2004.911.313@gmail.com
                  </p>
                </a>
                <a
                  href="tel:0869774995"
                  className="rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <Phone className="mb-3 size-4 text-emerald-300" />
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Phone
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">0869774995</p>
                </a>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <UserRound className="mb-3 size-4 text-emerald-300" />
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Name
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    Nguyễn Văn Nam
                  </p>
                </div>
                <a
                  href="https://github.com/namnv2004"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <Github className="mb-3 size-4 text-emerald-300" />
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    GitHub
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    github.com/namnv2004
                  </p>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}

type Project = (typeof projects)[number]

type ProjectShowcaseProps = {
  project: Project
  variant: "image" | "chat"
}

function ProjectShowcase({ project, variant }: ProjectShowcaseProps) {
  return (
    <article className="group relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl md:p-6 lg:p-8">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${project.accent} opacity-80 transition duration-500 group-hover:opacity-100`}
      />
      <div className="absolute -right-24 -top-24 size-72 rounded-full border border-white/10 bg-white/5 blur-md transition duration-500 group-hover:scale-110" />

      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/25">
        <div className="p-6 md:p-8">
          <div className="relative">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-xl shadow-black/30">
                <project.icon className="size-5" />
              </div>
              <a
                href={project.href}
                className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-zinc-300 transition hover:bg-white hover:text-black"
                title={`Open ${project.title}`}
              >
                <ArrowRight className="size-4 -rotate-45" />
              </a>
            </div>

            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-zinc-500">
                  {project.eyebrow}
                </p>
                <h2 className="text-balance text-4xl font-black tracking-[-0.05em] text-white md:text-6xl">
                  {project.title}
                </h2>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-zinc-300">
                    {project.role}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-zinc-300">
                    {project.timeline}
                  </span>
                </div>
              </div>

              <div>
                <p className="max-w-3xl text-pretty text-base font-medium leading-8 text-zinc-300 md:text-lg md:leading-9">
                  {project.description}
                </p>
                <p className="mt-5 max-w-3xl text-sm font-medium leading-7 text-zinc-500 md:text-base md:leading-8">
                  {project.summary}
                </p>

                <div className="mt-7 grid gap-3 md:grid-cols-3">
                  {project.features.map((feature) => (
                    <div
                      key={feature}
                      className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                    >
                      <CheckCircle2 className="mb-3 size-4 text-emerald-400" />
                      <p className="text-sm font-semibold leading-6 text-zinc-300">
                        {feature}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {project.stats.map((stat) => (
                <span
                  key={stat}
                  className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-bold text-zinc-300"
                >
                  {stat}
                </span>
              ))}
            </div>
            <Button
              asChild
              className="h-10 rounded-full bg-white px-4 text-xs font-black text-black hover:bg-zinc-200"
            >
              <a href={project.href}>
                Open Project
                <ExternalLink className="ml-1.5 size-3.5" />
              </a>
            </Button>
          </div>
        </div>
        </div>

        <div className="grid border-y border-white/10 md:grid-cols-3">
          {project.sections.map((section) => (
            <section
              key={section.title}
              className="border-white/10 p-5 md:border-r md:last:border-r-0 lg:p-6"
            >
              <h3 className="text-lg font-black tracking-tight text-white">
                {section.title}
              </h3>
              <div className="mt-4 space-y-3">
                {section.items.map((item) => (
                  <div key={item} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-300" />
                    <p className="text-sm font-medium leading-6 text-zinc-400">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="p-4 md:p-6 lg:p-8">
          {variant === "image" ? <ImageStudioDemo /> : <RagChatDemo />}
        </div>
      </div>
    </article>
  )
}

function ImageStudioDemo() {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/90">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.24),transparent_28%),radial-gradient(circle_at_80%_90%,rgba(14,165,233,0.18),transparent_30%)]" />
      <div className="relative space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
              Image Comparison Gallery
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              Multiple before / after examples from the restoration pipeline
            </p>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
            Live Studio
          </span>
        </div>

        <div className="space-y-4">
          {imageComparisons.map((item) => (
            <div
              key={item.title}
              className="overflow-hidden rounded-3xl border border-white/10 bg-black/45"
            >
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-sm font-black text-zinc-100">
                  {item.title}
                </p>
              </div>
              <div className="grid gap-px bg-white/10 md:grid-cols-2">
                <figure className="relative min-h-[320px] overflow-hidden bg-black/60 lg:min-h-[420px]">
                  <img
                    src={item.before}
                    alt={`${item.title} before`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <figcaption className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-black text-white backdrop-blur">
                    Before
                  </figcaption>
                </figure>
                <figure className="relative min-h-[320px] overflow-hidden bg-black/60 lg:min-h-[420px]">
                  <img
                    src={item.after}
                    alt={`${item.title} after`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <figcaption className="absolute left-2 top-2 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-black">
                    After
                  </figcaption>
                </figure>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 text-xs font-bold text-zinc-400 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
            <Gauge className="mb-2 size-4 text-emerald-300" />
            Adjustable pipeline settings
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
            <Workflow className="mb-2 size-4 text-emerald-300" />
            Segmentation to inpainting flow
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
            <ShieldCheck className="mb-2 size-4 text-emerald-300" />
            Result history and compare mode
          </div>
        </div>
      </div>
    </div>
  )
}

function RagChatDemo() {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/90">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(124,58,237,0.28),transparent_30%),radial-gradient(circle_at_85%_85%,rgba(59,130,246,0.20),transparent_28%)]" />
      <div className="relative space-y-4 p-4 md:p-6">
        <div className="rounded-3xl border border-white/10 bg-black/35 p-4 backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
            RAG Pipeline
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              {
                icon: Database,
                title: "Ingest docs",
                caption: "Chunk, embed, store",
              },
              {
                icon: BrainCircuit,
                title: "Retrieve",
                caption: "Semantic context lookup",
              },
              { icon: Bot, title: "Generate", caption: "Streaming answer" },
              {
                icon: ShieldCheck,
                title: "Guardrails",
                caption: "Policy and safety checks",
              },
            ].map(({ icon: Icon, title, caption }) => (
              <div
                key={String(title)}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-blue-200">
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">{title}</p>
                  <p className="text-xs font-medium text-zinc-500">{caption}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col rounded-3xl border border-white/10 bg-black/45 p-4 backdrop-blur">
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <p className="text-sm font-black text-white">RAG Ops Chat</p>
              <p className="text-xs font-medium text-zinc-500">
                Streaming answer with citations
              </p>
            </div>
            <span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs font-black text-blue-200">
              Online
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-end gap-3">
            <div className="max-w-[82%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] p-3 text-sm font-medium leading-6 text-zinc-300">
              How does the ingestion pipeline keep retrieval results reliable?
            </div>
            <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-white p-4 text-sm font-semibold leading-6 text-black">
              It separates document loading, chunking, embedding, and storage so each stage can be traced, retried, and evaluated before inference.
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black text-zinc-600">
                <span className="rounded-full bg-zinc-100 px-2.5 py-1">
                  source: ingest_data
                </span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1">
                  trace: Langfuse
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-500">
            Ask about docs, infra, model behavior, or deployment state...
          </div>
        </div>
      </div>
    </div>
  )
}
