import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout")({
  component: Layout,
})

function Layout() {
  return (
    <main className="w-full min-h-screen overflow-x-hidden bg-zinc-50 dark:bg-zinc-950">
      <Outlet />
    </main>
  )
}

export default Layout
