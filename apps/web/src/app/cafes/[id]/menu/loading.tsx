import { Card } from '@/components/ui/card';

export default function MenuLoading() {
  return (
    <div className="space-y-8">
      {/* Back link + title block */}
      <div>
        <div className="h-3 w-32 bg-subtle rounded-md animate-pulse" />
        <div className="mt-3 flex items-end justify-between">
          <div className="space-y-2">
            <div className="h-3 w-16 bg-subtle rounded-md animate-pulse" />
            <div className="h-8 w-64 bg-subtle rounded-md animate-pulse" />
          </div>
        </div>
      </div>

      {/* 2 category cards with 3 rows each */}
      <div className="space-y-4">
        {[0, 1].map((c) => (
          <Card key={c} className="p-6">
            <div className="flex items-center justify-between">
              <div className="h-5 w-40 bg-subtle rounded-md animate-pulse" />
              <div className="h-8 w-24 bg-subtle rounded-md animate-pulse" />
            </div>

            <div className="mt-6 space-y-3">
              {[0, 1, 2].map((r) => (
                <div
                  key={r}
                  className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0"
                >
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-1/3 bg-subtle rounded-md animate-pulse" />
                    <div className="h-3 w-1/2 bg-subtle rounded-md animate-pulse" />
                  </div>
                  <div className="h-4 w-16 bg-subtle rounded-md animate-pulse" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
