'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChatMarkdown } from '@/components/ui/chat-markdown';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  cafeId: string;
}

type Role = 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  content: string;
  toolsUsed?: string[];
}

interface AiConsoleResponse {
  reply: string;
  toolsUsed: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? { authorization: `Bearer ${session.access_token}` } : {};
}

// Showcase both Q&A (read) and actions (write) the manager can perform.
const EXAMPLE_PROMPTS = [
  "What's today's revenue?",
  'Top selling items today',
  "What's out of stock?",
  'How many Samosa sold today?',
  'Mark Cold Coffee out of stock',
];

export function ManagerChat({ cafeId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the persisted transcript on mount so context survives reloads/sessions.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/cafes/${cafeId}/ai-console/messages`, {
          headers: await authHeaders(),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: { role: Role; content: string; toolsUsed: string[] | null }[];
        };
        if (!cancelled) {
          setMessages(
            data.messages.map((m) => ({
              role: m.role,
              content: m.content,
              toolsUsed: m.toolsUsed ?? undefined,
            })),
          );
        }
      } catch {
        // non-fatal — start with an empty chat
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  // Keep the latest message in view as the conversation grows / typing shows.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  async function clearChat() {
    if (sending || messages.length === 0) return;
    setMessages([]);
    try {
      await fetch(`${API_URL}/cafes/${cafeId}/ai-console/messages`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
    } catch {
      // ignore — UI already cleared
    }
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || sending) return;

    setError(null);
    setInput('');

    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setSending(true);

    try {
      // The server primes the model from the persisted transcript, so the
      // client only sends the new message.
      const res = await fetch(`${API_URL}/cafes/${cafeId}/ai-console`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await authHeaders()),
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `Request failed (${res.status})`,
        );
      }

      const data = (await res.json()) as AiConsoleResponse;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          toolsUsed: data.toolsUsed ?? [],
        },
      ]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to reach the AI manager';
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
      {/* Header — title + clear */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 sm:px-6">
        <span className="text-sm font-medium">AI manager</span>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => void clearChat()}
            disabled={sending}
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        aria-live="polite"
        aria-label="Conversation with your AI manager"
        className="flex-1 overflow-y-auto p-4 sm:p-6"
      >
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
                  <Bubble message={m} />
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
          placeholder="Ask about sales, stock, or orders…"
          aria-label="Message the AI manager"
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

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const tools = message.toolsUsed ?? [];

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

        {!isUser && tools.length > 0 && (
          <p className="mt-1.5 px-1 text-[11px] text-muted">
            checked: {tools.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm border border-border bg-subtle px-3.5 py-3">
        <span
          className="flex items-center gap-1"
          aria-label="AI manager is typing"
        >
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
        <BarChart3 className="size-5 text-accent" />
      </div>
      <h3 className="mt-4 font-medium">Your AI operations manager</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">
        Ask about sales, stock, and orders — or tell it to take an action. Tap a
        prompt to start.
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
