import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content = (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark variant={variant} />
      {(variant === "full" || variant === "responsive") && (
        <span className="text-xl font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          LumaErase
        </span>
      )}
    </div>
  )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}

function LogoMark({ variant }: { variant?: "full" | "icon" | "responsive" }) {
  const size =
    variant === "full"
      ? "size-12"
      : variant === "responsive"
        ? "size-9"
        : "size-8"
  return (
    <img
      src="/assets/images/lumaerase_logo.png?v=3"
      alt="LumaErase Logo"
      className={cn("shrink-0 object-contain", size)}
    />
  )
}
