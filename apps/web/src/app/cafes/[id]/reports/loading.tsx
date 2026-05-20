import { Card } from '@/components/ui/card';

export default function ReportsLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Back link + title block */}
      <div>
        <div className="h-3 w-28 bg-subtle rounded-md animate-pulse" />
        <div className="mt-3 space-y-2">
          <div className="h-3 w-16 bg-subtle rounded-md animate-pulse" />
          <div className="h-8 w-64 bg-subtle rounded-md animate-pulse" />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-40 bg-subtle rounded-md animate-pulse" />
        <div className="h-9 w-32 bg-subtle rounded-md animate-pulse" />
      </div>

      {/* 4-metric grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div className="h-3 w-2/3 bg-subtle rounded-md animate-pulse" />
            <div className="mt-3 h-7 w-1/2 bg-subtle rounded-md animate-pulse" />
          </Card>
        ))}
      </div>

      {/* Breakdown card */}
      <Card className="p-6">
        <div className="h-3 w-28 bg-subtle rounded-md animate-pulse" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0"
            >
              <div className="h-4 w-1/3 bg-subtle rounded-md animate-pulse" />
              <div className="h-4 w-16 bg-subtle rounded-md animate-pulse" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
