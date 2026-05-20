'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/40',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in data-[state=closed]:fade-out',
          )}
        />
        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm',
            '-translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border bg-bg p-6 shadow-lg shadow-black/10',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in data-[state=closed]:fade-out',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
        >
          <AlertDialog.Title className="text-base font-semibold tracking-tight">
            {title}
          </AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-1.5 text-sm text-muted leading-relaxed">
              {description}
            </AlertDialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel className={buttonClasses({ variant: 'ghost' })}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className={buttonClasses({ variant: destructive ? 'danger' : 'primary' })}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
