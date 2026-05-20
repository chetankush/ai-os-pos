'use client';

import type { MenuCategoryWithItems, MenuItem } from '@sangam/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChatMarkdown } from '@/components/ui/chat-markdown';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  cafeId: string;
  menu: MenuCategoryWithItems[];
}

type Role = 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  content: string;
  suggestedItemIds?: string[];
}

interface AiWaiterResponse {
  reply: string;
  suggestedItemIds: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// How many prior turns to send back to the model with each request.
const HISTORY_LIMIT = 10;

const EXAMPLE_PROMPTS = [
  "What's good and cheap?",
  'Suggest a veg combo',
  'Kuch teekha batao',
];

export function WaiterChat({ cafeId, menu }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flat id -> item map so suggestion chips can resolve names + prices.
  const itemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const cat of menu) {
      for (const item of cat.items) map.set(item.id, item);
    }
    return map;
  }, [menu]);

  // Keep the latest message in view as the conversation grows / typing shows.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || sending) return;

    setError(null);
    setInput('');

    // Snapshot the running history (capped) BEFORE appending the new turn.
    const history = messages
      .slice(-HISTORY_LIMIT)
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setSending(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`${API_URL}/cafes/${cafeId}/ai-waiter`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session
            ? { authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ message, history }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `Request failed (${res.status})`,
        );
      }

      const data = (await res.json()) as AiWaiterResponse;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          suggestedItemIds: data.suggestedItemIds ?? [],
        },
      ]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to reach the AI waiter';
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const isEmpty = messages.length === 0;

  return (
    <Card className="flex h-[70vh] max-h-[640px] flex-col overflow-hidden">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isEmpty ? (
          <EmptyState onPick={(p) => void send(p)} disabled={sending} />
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only log, index is stable
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Bubble message={m} itemsById={itemsById} />
                </motion.div>
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {sending && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <TypingIndicator />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-border bg-danger/5 px-4 py-2 text-xs text-danger sm:px-6"
        >
          {error}
        </p>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-border bg-subtle/30 p-3 sm:p-4"
      >
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the waiter anything…"
          aria-label="Message the AI waiter"
          disabled={sending}
          autoComplete="off"
        />
        <Button
          type="submit"
          size="lg"
          loading={sending}
          disabled={!input.trim()}
          className="size-11 shrink-0 px-0"
          aria-label="Send message"
        >
          {!sending && <Send className="size-4" />}
        </Button>
      </form>
    </Card>
  );
}

function Bubble({
  message,
  itemsById,
}: {
  message: ChatMessage;
  itemsById: Map<string, MenuItem>;
}) {
  const isUser = message.role === 'user';
  const suggestions = (message.suggestedItemIds ?? [])
    .map((id) => itemsById.get(id))
    .filter((item): item is MenuItem => Boolean(item));

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'whitespace-pre-wrap rounded-br-sm bg-accent text-accent-fg'
              : 'rounded-bl-sm border border-border bg-subtle text-fg',
          )}
        >
          {isUser ? message.content : <ChatMarkdown text={message.content} />}
        </div>

        {!isUser && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2.5 py-1 text-xs"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2 rounded-full',
                    item.isVegetarian ? 'bg-success' : 'bg-danger',
                  )}
                />
                <span className="font-medium">{item.name}</span>
                <span className="font-mono tabular-nums text-muted">
                  ₹{(item.basePricePaise / 100).toFixed(0)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm border border-border bg-subtle px-3.5 py-3">
        <span className="flex items-center gap-1" aria-label="AI waiter is typing">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-bounce rounded-full bg-muted"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="grid size-12 place-items-center rounded-xl border border-border bg-subtle">
        <Sparkles className="size-5 text-accent" />
      </div>
      <h3 className="mt-4 font-medium">Say hello to your AI waiter</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">
        It knows your full menu and answers in Hinglish or English. Tap a prompt
        to start.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border border-border bg-bg px-4 text-sm',
              'transition-colors hover:border-border-strong hover:bg-subtle',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'disabled:opacity-50 disabled:pointer-events-none touch-manipulation',
            )}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
