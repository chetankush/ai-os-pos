import { Card } from '@/components/ui/card';

export default function CafeDetailLoading() {
  return (
    <div className="space-y-8">
      {/* Back link placeholder */}
      <div className="h-3 w-28 bg-subtle rounded-md animate-pulse" />

      {/* Title block */}
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-subtle rounded-md animate-pulse" />
          <div className="h-4 w-40 bg-subtle rounded-md animate-pulse" />
        </div>
        <div className="h-6 w-24 bg-subtle rounded-full animate-pulse" />
      </div>

      {/* 4-card stats grid (action buttons row of 3 + 1 extra stat card pattern) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div className="size-9 rounded-md bg-subtle animate-pulse" />
            <div className="mt-4 h-4 w-2/3 bg-subtle rounded-md animate-pulse" />
            <div className="mt-2 h-3 w-1/2 bg-subtle rounded-md animate-pulse" />
          </Card>
        ))}
      </div>

      {/* Action buttons row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-32 bg-subtle rounded-md animate-pulse" />
        <div className="h-9 w-28 bg-subtle rounded-md animate-pulse" />
        <div className="h-9 w-36 bg-subtle rounded-md animate-pulse" />
      </div>

      {/* Large card (recent orders) */}
      <Card className="p-6">
        <div className="h-3 w-28 bg-subtle rounded-md animate-pulse" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0"
            >
              <div className="space-y-2 flex-1">
                <div className="h-4 w-1/3 bg-subtle rounded-md animate-pulse" />
                <div className="h-3 w-1/4 bg-subtle rounded-md animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-subtle rounded-md animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
