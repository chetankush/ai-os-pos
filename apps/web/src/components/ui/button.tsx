import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-all duration-150 ease-out outline-none whitespace-nowrap ' +
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-fg ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ' +
  'active:scale-[0.98] select-none';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90 shadow-sm shadow-black/5',
  secondary:
    'bg-bg text-fg border border-border hover:bg-subtle hover:border-border-strong',
  ghost: 'bg-transparent text-fg hover:bg-subtle',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm shadow-black/5',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export function buttonClasses(
  options: { variant?: Variant; size?: Size; className?: string } = {},
): string {
  const { variant = 'primary', size = 'md', className } = options;
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="size-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
