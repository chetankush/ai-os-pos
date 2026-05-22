import { cn } from '@/lib/cn';

/**
 * Sangam mark — a triquetra (three interlocking arcs). It mirrors the meaning of
 * "Sangam" (संगम, confluence): three things meeting as one. Drawn with
 * `currentColor` so it inherits text color (use `text-accent` for the brand coral).
 */
export function TriquetraMark({
  className,
  decorative = false,
}: {
  className?: string;
  /** When the mark sits next to the visible "Sangam" wordmark, mark it
   *  decorative so screen readers / the a11y tree don't read "Sangam" twice. */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': 'Sangam' })}
    >
      <g
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M24 6 C11 11 11 25 24 30 C37 25 37 11 24 6 Z" />
        <path
          d="M24 6 C11 11 11 25 24 30 C37 25 37 11 24 6 Z"
          transform="rotate(120 24 24)"
        />
        <path
          d="M24 6 C11 11 11 25 24 30 C37 25 37 11 24 6 Z"
          transform="rotate(240 24 24)"
        />
      </g>
    </svg>
  );
}

/** Mark + "Sangam" wordmark. The mark is coral by default. */
export function Logo({
  className,
  markClassName,
  showWord = true,
}: {
  className?: string;
  markClassName?: string;
  showWord?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <TriquetraMark
        className={cn('size-7 text-accent', markClassName)}
        decorative={showWord}
      />
      {showWord && (
        <span className="text-base font-semibold tracking-tight">Sangam</span>
      )}
    </span>
  );
}
