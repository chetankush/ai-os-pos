/**
 * A diner's AI-waiter conversation, remembered on THIS device per cafe so the
 * chat (and its context) survives reloads without any login — same zero-friction
 * pattern as the diner's order history. The server is stateless for the waiter;
 * the client replays this transcript as context on each turn.
 */
export interface DinerChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestedItemIds?: string[];
}

const KEY = (slug: string) => `sangam:diner-chat:${slug}`;
const MAX = 50;

export function getDinerChat(slug: string): DinerChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DinerChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function setDinerChat(slug: string, messages: DinerChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(messages.slice(-MAX)));
  } catch {
    // storage full / disabled — non-fatal, the chat still works in-session.
  }
}

export function clearDinerChat(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY(slug));
  } catch {
    // ignore
  }
}
