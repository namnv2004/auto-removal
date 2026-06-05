export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t py-4 px-6">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-muted-foreground text-sm">
          Object Removal - {currentYear}
        </p>
        <p className="text-muted-foreground text-sm">
          Quality-first object removal pipeline
        </p>
      </div>
    </footer>
  )
}
