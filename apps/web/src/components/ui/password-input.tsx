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
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute right-0 top-0 grid place-items-center size-11 text-muted hover:text-fg transition-colors"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
