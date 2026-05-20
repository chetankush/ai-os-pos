import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        // h-11 (44px) meets the touch-target minimum; text-base (16px) prevents
        // iOS Safari from auto-zooming the viewport on focus.
        'h-11 w-full rounded-lg border border-border bg-bg px-3.5 text-base',
        'shadow-sm shadow-black/[0.02]',
        'placeholder:text-muted',
        'transition-all duration-150 touch-manipulation',
        'hover:border-border-strong',
        'focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
});
