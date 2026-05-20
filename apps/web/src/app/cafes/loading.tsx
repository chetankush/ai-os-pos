import { Card } from '@/components/ui/card';

export default function CafesLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-subtle rounded-md animate-pulse" />
          <div className="h-8 w-48 bg-subtle rounded-md animate-pulse" />
        </div>
        <div className="h-9 w-28 bg-subtle rounded-md animate-pulse" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="h-full p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="size-10 rounded-md bg-subtle animate-pulse" />
              <div className="size-4 bg-subtle rounded animate-pulse" />
            </div>

            <div className="mt-4 space-y-2">
              <div className="h-4 w-3/4 bg-subtle rounded-md animate-pulse" />
              <div className="h-3 w-1/2 bg-subtle rounded-md animate-pulse" />
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
              <div className="h-3 w-16 bg-subtle rounded-md animate-pulse" />
              <div className="h-3 w-12 bg-subtle rounded-md animate-pulse" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
