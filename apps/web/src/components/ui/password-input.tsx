'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(
            'h-11 w-full rounded-lg border border-border bg-bg pl-3.5 pr-11 text-base',
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
        {/* P2 touch-target: size-11 (44px) hit area. P1 aria: pressed state + dynamic
            label announce visibility. tabIndex=-1 keeps tab order on the field itself. */}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={-1}
          className={cn(
            'absolute right-0 top-0 grid size-11 place-items-center rounded-lg text-muted',
            'transition-colors touch-manipulation outline-none',
            'hover:text-fg',
            'focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
