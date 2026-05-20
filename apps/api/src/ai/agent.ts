/**
 * Provider-agnostic tool-calling (function-calling) loop. Mirrors the OpenAI /
 * DeepSeek chat-completions wire format used by waiter.ts, generalised to run a
 * multi-step conversation where the model can call tools we expose against the
 * database and then summarise the results for the owner.
 */

export interface AgentConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Runs a single named tool with already-parsed arguments. */
export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface AgentResult {
  reply: string;
  toolsUsed: string[];
}

/** Hard ceiling on the request/response round-trips so the loop can't run away. */
const MAX_ITERATIONS = 6;

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | AssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string };

interface ChatResponse {
  choices?: { message?: AssistantMessage }[];
}

/**
 * One chat-completions round-trip. Exported so tests can stub `globalThis.fetch`
 * (and so the call site stays mirror-able with waiter.ts's `chatComplete`).
 */
export async function chatCompleteWithTools(
  config: AgentConfig,
  messages: ChatMessage[],
  tools: ToolSpec[],
): Promise<AssistantMessage> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: tools.map((t) => ({ type: 'function', function: t })),
      tool_choice: 'auto',
      temperature: 0.2,
      stream: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as ChatResponse;
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('AI provider returned an empty response');
  return message;
}

/**
 * Drive the tool-calling loop:
 *  1. Send the conversation (system + history + user) plus the tool catalogue.
 *  2. If the assistant asks for tool_calls, run each via `executor`, append a
 *     `tool` message per call, and loop.
 *  3. Stop when the assistant returns plain content (no tool_calls) or after
 *     MAX_ITERATIONS round-trips — whichever comes first.
 * A tool that throws does NOT crash the request: its error is serialised and
 * fed back as the tool result so the model can apologise or try another path.
 */
export async function runAgent(
  config: AgentConfig,
  systemPrompt: string,
  tools: ToolSpec[],
  executor: ToolExecutor,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const toolsUsed: string[] = [];
  let lastContent = '';

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const assistant = await chatCompleteWithTools(config, messages, tools);
    lastContent = assistant.content?.trim() ?? lastContent;

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { reply: lastContent, toolsUsed };
    }

    // Echo the assistant's tool-call message back into the transcript before we
    // answer it — the provider requires the matching assistant turn to precede
    // the tool results.
    messages.push(assistant);

    for (const call of toolCalls) {
      toolsUsed.push(call.function.name);
      let result: unknown;
      try {
        const args = parseArgs(call.function.arguments);
        result = await executor(call.function.name, args);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Iteration cap reached: return whatever text we last have (may be empty).
  return { reply: lastContent, toolsUsed };
}

/** Defensive JSON.parse — providers occasionally emit `""` for no-arg tools. */
function parseArgs(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  const parsed = JSON.parse(raw);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}
