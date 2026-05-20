'use client';

import {
  BarChart3,
  LayoutDashboard,
  Menu as MenuIcon,
  MessageSquareText,
  Pencil,
  QrCode,
  ReceiptText,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  exact?: boolean;
}

export function CafeShell({
  cafeId,
  cafeName,
  userEmail,
  children,
}: {
  cafeId: string;
  cafeName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  const base = `/cafes/${cafeId}`;
  const items: NavItem[] = [
    { label: 'Dashboard', href: base, icon: <LayoutDashboard className="size-4" />, exact: true },
    { label: 'New order', href: `${base}/orders/new`, icon: <ShoppingBag className="size-4" /> },
    { label: 'Orders', href: `${base}/orders`, icon: <ReceiptText className="size-4" /> },
    { label: 'Menu', href: `${base}/menu`, icon: <UtensilsCrossed className="size-4" /> },
    { label: 'Tables & QR', href: `${base}/tables`, icon: <QrCode className="size-4" /> },
    { label: 'AI Manager', href: `${base}/manager`, icon: <BarChart3 className="size-4" /> },
    { label: 'AI Waiter', href: `${base}/ai-waiter`, icon: <MessageSquareText className="size-4" /> },
  ];

  // Longest matching href wins, so /orders/new highlights "New order", not "Orders".
  const activeHref = items
    .filter((it) =>
      it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Cafe navigation">
      {items.map((it) => {
        const active = it.href === activeHref;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors touch-manipulation',
              active
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:bg-subtle hover:text-fg',
            )}
          >
            {it.icon}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );

  // The "edit profile" card — owner identity + a shortcut to edit cafe details.
  const profile = (
    <Link
      href={`${base}/edit`}
      className="group mt-3 flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:bg-subtle"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
        {(cafeName || userEmail || 'S').slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{cafeName}</span>
        <span className="block truncate text-xs text-muted">
          {userEmail || 'Edit profile'}
        </span>
      </span>
      <Pencil className="size-3.5 shrink-0 text-muted group-hover:text-fg" />
    </Link>
  );

  return (
    <div className="lg:flex lg:gap-8">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:sticky lg:top-6 lg:h-[calc(100dvh-7rem)] lg:w-56 lg:shrink-0 lg:flex-col">
        {nav}
        {profile}
      </aside>

      {/* Mobile top bar */}
      <div className="mb-4 flex items-center gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-fg hover:bg-subtle touch-manipulation"
        >
          <MenuIcon className="size-5" />
        </button>
        <span className="truncate text-sm font-semibold">{cafeName}</span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-border bg-bg p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="truncate text-sm font-semibold">{cafeName}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-10 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {profile}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
