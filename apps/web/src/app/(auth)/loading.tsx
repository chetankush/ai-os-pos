export default function AuthLoading() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: form skeleton */}
      <main className="flex flex-col items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo placeholder */}
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-subtle animate-pulse" />
            <div className="h-4 w-20 bg-subtle rounded-md animate-pulse" />
          </div>

          {/* Title placeholder */}
          <div className="space-y-2 pt-2">
            <div className="h-7 w-2/3 bg-subtle rounded-md animate-pulse" />
            <div className="h-4 w-full bg-subtle rounded-md animate-pulse" />
          </div>

          {/* 3 input-shaped blocks */}
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="h-3 w-16 bg-subtle rounded-md animate-pulse" />
              <div className="h-9 w-full bg-subtle rounded-md animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-20 bg-subtle rounded-md animate-pulse" />
              <div className="h-9 w-full bg-subtle rounded-md animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-24 bg-subtle rounded-md animate-pulse" />
              <div className="h-9 w-full bg-subtle rounded-md animate-pulse" />
            </div>
          </div>

          {/* Button-shaped block */}
          <div className="h-9 w-full bg-subtle rounded-md animate-pulse" />
        </div>
      </main>

      {/* Right: marketing aside */}
      <aside className="hidden lg:flex flex-col justify-between border-l border-border bg-subtle/40 p-12">
        <div className="h-4 w-24 bg-subtle rounded-md animate-pulse" />
        <div className="space-y-4 max-w-md">
          <div className="h-8 w-5/6 bg-subtle rounded-md animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-subtle rounded-md animate-pulse" />
            <div className="h-4 w-4/5 bg-subtle rounded-md animate-pulse" />
          </div>
        </div>
        <div className="h-3 w-32 bg-subtle rounded-md animate-pulse" />
      </aside>
    </div>
  );
}
