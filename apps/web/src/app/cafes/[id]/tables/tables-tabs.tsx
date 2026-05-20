'use client';

import type { FloorResponse } from '@sangam/types';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { FloorView } from './floor-view';
import { HistoryView } from './history-view';

type Tab = 'floor' | 'history';

interface Props {
  cafeId: string;
  initialFloor: FloorResponse;
}

export function TablesTabs({ cafeId, initialFloor }: Props) {
  const [tab, setTab] = useState<Tab>('floor');
  // Mount history lazily on first open, then keep it alive (preserves fetched
  // data + scroll) and just toggle visibility.
  const [historyMounted, setHistoryMounted] = useState(false);

  useEffect(() => {
    if (tab === 'history') setHistoryMounted(true);
  }, [tab]);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Tables view"
        className="inline-flex rounded-lg border border-border bg-subtle p-0.5"
      >
        <TabButton active={tab === 'floor'} onClick={() => setTab('floor')}>
          Floor
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          History
        </TabButton>
      </div>

      <div hidden={tab !== 'floor'}>
        <FloorView cafeId={cafeId} initialFloor={initialFloor} />
      </div>

      {historyMounted && (
        <div hidden={tab !== 'history'}>
          <HistoryView cafeId={cafeId} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-md px-4 text-sm font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg',
        active ? 'bg-bg text-fg shadow-sm' : 'text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
