import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentConfig,
  type ToolExecutor,
  type ToolSpec,
  runAgent,
} from './agent.js';

const CONFIG: AgentConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
};

const TOOLS: ToolSpec[] = [
  {
    name: 'get_today_stats',
    description: 'Get the stats for today',
    parameters: { type: 'object', properties: {} },
  },
];

/** Build an OpenAI-style assistant message that requests a single tool call. */
function toolCallResponse(name: string, args: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: `call_${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

/** Build a plain final assistant message (no tool calls). */
function finalResponse(content: string) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

function mockFetchSequence(responses: unknown[]) {
  let call = 0;
  return vi.fn(async () => {
    const body = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
}

describe('runAgent', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('runs a tool call then returns the final assistant reply', async () => {
    const fetchMock = mockFetchSequence([
      toolCallResponse('get_today_stats', { foo: 'bar' }),
      finalResponse('You earned ₹2500 today.'),
    ]);
    globalThis.fetch = fetchMock;

    const executor: ToolExecutor = vi.fn(async () => ({ todayRevenuePaise: 250000 }));

    const result = await runAgent(
      CONFIG,
      'system',
      TOOLS,
      executor,
      'how much today?',
    );

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith('get_today_stats', { foo: 'bar' });
    expect(result.toolsUsed).toContain('get_today_stats');
    expect(result.reply).toBe('You earned ₹2500 today.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes the configured request shape to the provider', async () => {
    const fetchMock = mockFetchSequence([finalResponse('hi')]);
    globalThis.fetch = fetchMock;

    await runAgent(CONFIG, 'sys', TOOLS, vi.fn(), 'hello', [
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'reply' },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.tool_choice).toBe('auto');
    expect(body.temperature).toBe(0.2);
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: TOOLS[0],
    });
    // system + history(2) + user
    expect(body.messages).toHaveLength(4);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[3]).toEqual({ role: 'user', content: 'hello' });
  });

  it('honours the 6-iteration cap when the model never stops calling tools', async () => {
    // Always return a tool call → the loop must stop on its own.
    const fetchMock = mockFetchSequence([
      toolCallResponse('get_today_stats', {}),
    ]);
    globalThis.fetch = fetchMock;

    const executor: ToolExecutor = vi.fn(async () => ({ ok: true }));

    const result = await runAgent(CONFIG, 'sys', TOOLS, executor, 'loop');

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(executor).toHaveBeenCalledTimes(6);
    expect(result.toolsUsed.length).toBe(6);
  });

  it('recovers when a tool throws (feeds the error back, keeps going)', async () => {
    const fetchMock = mockFetchSequence([
      toolCallResponse('get_today_stats', {}),
      finalResponse('Sorry, I hit an error fetching that.'),
    ]);
    globalThis.fetch = fetchMock;

    const executor: ToolExecutor = vi.fn(async () => {
      throw new Error('db down');
    });

    const result = await runAgent(CONFIG, 'sys', TOOLS, executor, 'stats?');

    expect(result.reply).toBe('Sorry, I hit an error fetching that.');
    expect(result.toolsUsed).toContain('get_today_stats');
    // The error must have been fed back as a tool message in the 2nd request.
    const secondCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const body = JSON.parse(secondCall[1].body as string);
    const toolMsg = body.messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMsg).toBeTruthy();
    expect(JSON.parse(toolMsg.content)).toHaveProperty('error');
  });
});
