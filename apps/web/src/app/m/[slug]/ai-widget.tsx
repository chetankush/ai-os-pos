'use client';

import type { MenuItem } from '@sangam/types';
import { Plus, Send, ShoppingBag, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChatMarkdown } from '@/components/ui/chat-markdown';
import { cn } from '@/lib/cn';
import { formatRupees } from './diner-order';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestedItemIds?: string[];
}

interface AiReply {
  reply: string;
  suggestedItemIds?: string[];
}

interface Props {
  slug: string;
  cafeName: string;
  itemsById: Map<string, MenuItem>;
  /** Hide the floating button while the cart sheet is open. */
  cartHidden: boolean;
  onAdd: (menuItemId: string) => void;
  /** Live cart so diners can see what they added without leaving the chat. */
  itemCount: number;
  subtotalPaise: number;
  /** Open the full cart/order sheet (closes this chat first). */
  onViewCart: () => void;
}

export function AiWidget({
  slug,
  cafeName,
  itemsById,
  cartHidden,
  onAdd,
  itemCount,
  subtotalPaise,
  onViewCart,
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, loading]);

  async function send() {
    const message = input.trim();
    if (!message || loading) return;

    // History sent to the API: prior turns only (role + content).
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(
        `${API_URL}/public/cafes/${encodeURIComponent(slug)}/ai-waiter`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, history }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? `The waiter is unavailable (${res.status})`);
      }
      const data = (await res.json()) as AiReply;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          suggestedItemIds: data.suggestedItemIds,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The waiter is unavailable right now.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger */}
      {!open && !cartHidden && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'fixed bottom-20 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full px-4',
            'border border-border bg-bg text-sm font-medium shadow-lg shadow-black/10',
            'transition-transform active:scale-[0.97] touch-manipulation',
          )}
        >
          <Sparkles className="size-4 text-accent" />
          Ask the waiter
        </button>
      )}

      {/* Chat sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end">
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative mx-auto flex h-[80dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border-t border-border bg-bg">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
                <Sparkles className="size-4 text-accent" />
                Ask the waiter
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-11 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted">
                    Ask me anything about {cafeName}&apos;s menu — what&apos;s
                    spicy, what&apos;s vegan, or what to try.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: chat log is append-only
                  key={i}
                  className={cn(
                    'flex',
                    m.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] space-y-2 rounded-2xl px-3.5 py-2.5 text-sm',
                      m.role === 'user'
                        ? 'bg-accent text-accent-fg'
                        : 'border border-border bg-subtle/50 text-fg',
                    )}
                  >
                    {m.role === 'user' ? (
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </p>
                    ) : (
                      <ChatMarkdown text={m.content} />
                    )}
                    {m.role === 'assistant' &&
                      m.suggestedItemIds &&
                      m.suggestedItemIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {m.suggestedItemIds
                            .map((id) => itemsById.get(id))
                            .filter((it): it is MenuItem => Boolean(it))
                            .map((it) => (
                              <button
                                key={it.id}
                                type="button"
                                onClick={() => {
                                  onAdd(it.id);
                                  toast.success(`Added ${it.name}`);
                                }}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium',
                                  'hover:bg-subtle hover:border-border-strong active:scale-95 touch-manipulation',
                                )}
                              >
                                <Plus className="size-3" />
                                {it.name}
                                <span className="text-muted tabular-nums">
                                  {formatRupees(it.basePricePaise)}
                                </span>
                              </button>
                            ))}
                        </div>
                      )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-border bg-subtle/50 px-3.5 py-2.5">
                    <span className="flex gap-1">
                      <Dot /> <Dot /> <Dot />
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="text-center text-xs text-danger">
                  {error}
                </p>
              )}
            </div>

            {/* Live cart — so diners see what they've added without leaving chat */}
            {itemCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onViewCart();
                }}
                className={cn(
                  'flex items-center justify-between gap-2 border-t border-border bg-accent px-4 py-3 text-accent-fg',
                  'transition-transform active:scale-[0.99] touch-manipulation',
                )}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <ShoppingBag className="size-4" />
                  {itemCount} {itemCount === 1 ? 'item' : 'items'} added
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatRupees(subtotalPaise)} · View order
                </span>
              </button>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What do you recommend?"
                aria-label="Message the waiter"
                className={cn(
                  'h-11 flex-1 rounded-lg border border-border bg-bg px-3.5 text-base',
                  'placeholder:text-muted focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg focus:ring-offset-2 focus:ring-offset-bg',
                )}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send"
                className={cn(
                  'grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg',
                  'transition-transform active:scale-95 touch-manipulation',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Dot() {
  return (
    <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-duration:0.8s]" />
  );
}
