import type { Cafe, MenuCategoryWithItems } from '@sangam/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WaiterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface WaiterReply {
  reply: string;
  /** Menu item ids the reply mentions — the UI can render quick-add chips. */
  suggestedItemIds: string[];
}

function rupees(paise: number): string {
  return `₹${Math.round(paise / 100)}`;
}

/**
 * Stable, cache-friendly system prompt: persona + the cafe's live menu + hard
 * rules. Keeping the menu in a stable prefix lets DeepSeek's prompt cache kick
 * in across turns, so repeat calls are near-free.
 */
export function buildWaiterSystemPrompt(
  cafe: Pick<Cafe, 'name'>,
  menu: MenuCategoryWithItems[],
): string {
  const lines: string[] = [];
  for (const cat of menu) {
    for (const item of cat.items) {
      if (!item.isAvailable) continue;
      const tags = [
        item.isVegetarian ? 'veg' : 'non-veg',
        item.isVegan ? 'vegan' : null,
        item.containsEgg ? 'egg' : null,
        item.spiceLevel >= 2 ? 'spicy' : null,
      ]
        .filter(Boolean)
        .join('/');
      lines.push(
        `- [${item.id}] ${item.name} — ${rupees(item.basePricePaise)} (${cat.name}; ${tags})${
          item.description ? ` — ${item.description}` : ''
        }`,
      );
    }
  }

  return [
    `You are the AI waiter for "${cafe.name}", an Indian cafe. You are warm, efficient, and a little cheeky — like a favourite local server.`,
    `Mirror the customer's language: reply in Hindi-English (Roman script) if they do, else English. Keep replies to 1-3 short sentences.`,
    ``,
    `RULES:`,
    `- Only ever recommend items from the MENU below. Never invent items or prices.`,
    `- Suggest pairings and a tasteful upsell (a drink/side/dessert) when natural — never pushy.`,
    `- Respect dietary needs (veg/vegan/egg/spice). If asked for something not on the menu, say so and offer the closest item.`,
    `- When you recommend specific items, mention them by their exact name.`,
    ``,
    `MENU:`,
    ...lines,
  ].join('\n');
}

/** OpenAI-compatible chat completion (DeepSeek today; swap baseUrl/model for others). */
export async function chatComplete(
  config: WaiterConfig,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.4,
      max_tokens: 400,
      stream: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI provider returned an empty response');
  return content.trim();
}

/** Find menu items the reply names (case-insensitive whole-name match). */
export function matchSuggestedItems(
  reply: string,
  menu: MenuCategoryWithItems[],
): string[] {
  const lower = reply.toLowerCase();
  const ids: string[] = [];
  for (const cat of menu) {
    for (const item of cat.items) {
      if (item.isAvailable && lower.includes(item.name.toLowerCase())) {
        ids.push(item.id);
      }
    }
  }
  return ids;
}

export async function askWaiter(
  config: WaiterConfig,
  cafe: Pick<Cafe, 'name'>,
  menu: MenuCategoryWithItems[],
  userMessage: string,
  history: ChatMessage[] = [],
): Promise<WaiterReply> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildWaiterSystemPrompt(cafe, menu) },
    ...history,
    { role: 'user', content: userMessage },
  ];
  const reply = await chatComplete(config, messages);
  return { reply, suggestedItemIds: matchSuggestedItems(reply, menu) };
}
