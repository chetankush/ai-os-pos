'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SheetProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Scrolling body content. */
  children: ReactNode;
  /** Pinned action area at the bottom (does not scroll). */
  footer?: ReactNode;
}

/**
 * Bottom drawer on mobile / centered panel on desktop. Scrim above the floor,
 * body scrolls, footer pinned (flex-shrink-0). Respects reduced motion.
 */
export function Sheet({ title, subtitle, onClose, children, footer }: SheetProps) {
  const reduce = useReducedMotion();

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-black/50"
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          className={cn(
            'relative flex w-full max-h-[88vh] flex-col overflow-hidden',
            'rounded-t-2xl border-t border-border bg-bg shadow-xl',
            'sm:max-w-md sm:max-h-[85vh] sm:rounded-2xl sm:border',
          )}
          initial={reduce ? { opacity: 0 } : { y: '100%' }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: '100%' }}
          transition={{ type: 'tween', duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-4 sm:p-5">
            <div className="min-w-0 space-y-0.5">
              <h2 className="truncate text-base font-semibold tracking-tight">
                {title}
              </h2>
              {subtitle ? (
                <p className="truncate text-xs text-muted">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {children}
          </div>

          {footer ? (
            <div className="shrink-0 border-t border-border bg-bg p-4 sm:p-5">
              {footer}
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
