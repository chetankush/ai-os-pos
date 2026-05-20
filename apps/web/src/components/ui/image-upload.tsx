'use client';

import { ImagePlus, Loader2, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const MAX_BYTES = 5 * 1024 * 1024;

interface ImageUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  /** 'square' for logos/avatars, 'wide' for item photos. */
  shape?: 'square' | 'wide';
  className?: string;
}

/**
 * Uploads an image to the backend (which stores it in Supabase Storage and
 * returns a public URL), shows a preview, and allows removal. The URL is what
 * the caller persists (cafe.logoUrl / menuItem.imageUrl).
 */
export function ImageUpload({ value, onChange, shape = 'square', className }: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('Image must be 5 MB or smaller');
      return;
    }

    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const form = new FormData();
      form.append('file', file);

      const res = await fetch(`${API_URL}/uploads`, {
        method: 'POST',
        headers: session ? { authorization: `Bearer ${session.access_token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Upload failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const box = shape === 'square' ? 'size-24' : 'h-32 w-full';

  return (
    <div className={cn('space-y-1.5', className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div className={cn('relative overflow-hidden rounded-xl border border-border', box)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Uploaded preview" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove image"
            className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md bg-black/55 text-white hover:bg-black/75"
          >
            <X className="size-3.5" />
          </button>
          <label
            htmlFor={inputId}
            className="absolute inset-x-0 bottom-0 cursor-pointer bg-black/55 py-1 text-center text-[11px] font-medium text-white"
          >
            {uploading ? 'Uploading…' : 'Replace'}
          </label>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-muted',
            'hover:border-fg hover:text-fg transition-colors',
            box,
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="size-5" />
              <span className="text-[11px] font-medium">Upload</span>
            </>
          )}
        </label>
      )}

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
