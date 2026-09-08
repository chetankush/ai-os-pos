import type { OrderStatus, PaymentMethod } from '@sangam/types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type AgentResult, type ToolExecutor, type ToolSpec, runAgent } from '../ai/agent.js';
import {
  type AiConsoleMessagesRepository,
  createDrizzleAiConsoleMessagesRepo,
} from '../repositories/ai-console-messages.js';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import { type MenuRepository, createDrizzleMenuRepo } from '../repositories/menu.js';
import { type OrdersRepository, createDrizzleOrdersRepo } from '../repositories/orders.js';

type RunAgentFn = typeof runAgent;

// How many prior turns to prime the agent with as context.
const HISTORY_LIMIT = 10;

export interface AiConsoleRoutesOptions {
  cafesRepository?: CafesRepository;
  ordersRepository?: OrdersRepository;
  menuRepository?: MenuRepository;
  messagesRepository?: AiConsoleMessagesRepository;
  /** Injectable for tests; defaults to the real tool-calling loop. */
  runAgent?: RunAgentFn;
}

const paramsSchema = z.object({ cafeId: z.string().uuid() });
const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(10)
    .optional(),
});

/** JSON-Schema tool catalogue advertised to the model. */
const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'get_today_stats',
    description:
      "Today's revenue, order count, GST collected, order counts by status, and revenue split by payment method. Use for any 'how much / how many orders' question.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_top_items',
    description: "Today's best-selling menu items by quantity sold.",
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 25,
          description: 'How many to return (default 5).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_item_sales',
    description:
      'How much of a specific item sold today (quantity + revenue). Matches the name loosely.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Item name to look up, e.g. "samosa".' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_out_of_stock',
    description: 'Menu items that are currently marked unavailable / out of stock.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_recent_orders',
    description: 'Recent orders, newest first. Optionally filter by status.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled'],
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'How many to return (default 10).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'set_item_availability',
    description:
      'Mark a menu item in or out of stock by name. If the name is ambiguous or unknown the call returns an error so you can ask the owner to clarify.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name to change.' },
        available: { type: 'boolean', description: 'true = back in stock, false = out of stock.' },
      },
      required: ['name', 'available'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_order_status',
    description:
      'Advance an order to a new status by its order number. When completing, optionally record the payment method.',
    parameters: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled'],
        },
        paymentMethod: { type: 'string', enum: ['cash', 'upi', 'card', 'online'] },
      },
      required: ['orderNumber', 'status'],
      additionalProperties: false,
    },
  },
];

const ORDER_STATUSES: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'online'];

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Build the executor closure bound to one cafe + the repos. */
function buildExecutor(
  cafeId: string,
  ordersRepo: OrdersRepository,
  menuRepo: MenuRepository,
): ToolExecutor {
  return async (name, args) => {
    switch (name) {
      case 'get_today_stats':
        return ordersRepo.todayStats(cafeId);

      case 'get_top_items': {
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        return ordersRepo.topItemsToday(cafeId, limit);
      }

      case 'get_item_sales': {
        const itemName = asString(args.name);
        if (!itemName) return { error: 'name is required' };
        return ordersRepo.itemSalesToday(cafeId, itemName);
      }

      case 'list_out_of_stock': {
        const menu = await menuRepo.getFullMenu(cafeId);
        const oos: { name: string; category: string }[] = [];
        for (const cat of menu) {
          for (const item of cat.items) {
            if (!item.isAvailable) oos.push({ name: item.name, category: cat.name });
          }
        }
        return oos;
      }

      case 'list_recent_orders': {
        const limit = typeof args.limit === 'number' ? args.limit : 10;
        const statusFilter = asString(args.status) as OrderStatus | undefined;
        const orders = await ordersRepo.listByCafe(cafeId, limit);
        return orders
          .filter((o) => !statusFilter || o.status === statusFilter)
          .map((o) => ({
            orderNumber: o.orderNumber,
            status: o.status,
            paymentStatus: o.paymentStatus,
            totalPaise: o.totalPaise,
            tableLabel: o.tableLabel,
            source: o.source,
            createdAt: o.createdAt,
          }));
      }

      case 'set_item_availability': {
        const itemName = asString(args.name);
        const available = typeof args.available === 'boolean' ? args.available : undefined;
        if (!itemName || available === undefined) {
          return { error: 'name and available are required' };
        }
        const menu = await menuRepo.getFullMenu(cafeId);
        const matches = menu
          .flatMap((cat) => cat.items)
          .filter((item) => item.name.toLowerCase() === itemName.toLowerCase());
        if (matches.length === 0) {
          return { error: `No item named "${itemName}" found. Ask the owner for the exact name.` };
        }
        if (matches.length > 1) {
          return {
            error: `Multiple items match "${itemName}". Ask the owner which one.`,
          };
        }
        const target = matches[0];
        if (!target) return { error: `No item named "${itemName}" found.` };
        const updated = await menuRepo.updateItem(target.id, cafeId, { isAvailable: available });
        if (!updated) return { error: 'Failed to update the item.' };
        return { name: updated.name, isAvailable: updated.isAvailable };
      }

      case 'update_order_status': {
        const orderNumber = asString(args.orderNumber);
        const status = asString(args.status) as OrderStatus | undefined;
        const paymentMethod = asString(args.paymentMethod) as PaymentMethod | undefined;
        if (!orderNumber || !status || !ORDER_STATUSES.includes(status)) {
          return { error: 'orderNumber and a valid status are required' };
        }
        if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
          return { error: `Invalid payment method "${paymentMethod}".` };
        }
        const order = await ordersRepo.findByOrderNumber(orderNumber, cafeId);
        if (!order) return { error: `No order "${orderNumber}" found.` };
        const updated = await ordersRepo.updateStatus(order.id, cafeId, status, paymentMethod);
        if (!updated) return { error: 'Failed to update the order.' };
        return {
          orderNumber: updated.orderNumber,
          status: updated.status,
          paymentStatus: updated.paymentStatus,
        };
      }

      default:
        return { error: `Unknown tool "${name}"` };
    }
  };
}

export async function aiConsoleRoutes(
  app: FastifyInstance,
  opts: AiConsoleRoutesOptions = {},
): Promise<void> {
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);
  const ordersRepo = opts.ordersRepository ?? createDrizzleOrdersRepo(app.db);
  const menuRepo = opts.menuRepository ?? createDrizzleMenuRepo(app.db);
  const messagesRepo = opts.messagesRepository ?? createDrizzleAiConsoleMessagesRepo(app.db);
  const agent: RunAgentFn = opts.runAgent ?? runAgent;

  async function ensureOwner(cafeId: string, ownerId: string) {
    return cafesRepo.findByIdAndOwner(cafeId, ownerId);
  }

  // ─── GET /cafes/:cafeId/ai-console/messages — persisted transcript ──────────
  app.get(
    '/cafes/:cafeId/ai-console/messages',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = paramsSchema.parse(request.params);
      if (!(await ensureOwner(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const messages = await messagesRepo.listRecent(cafeId, 50);
      return { messages };
    },
  );

  // ─── DELETE /cafes/:cafeId/ai-console/messages — clear the transcript ────────
  app.delete(
    '/cafes/:cafeId/ai-console/messages',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = paramsSchema.parse(request.params);
      if (!(await ensureOwner(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      await messagesRepo.clear(cafeId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/cafes/:cafeId/ai-console',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId } = paramsSchema.parse(request.params);
      const cafe = await ensureOwner(cafeId, request.user.id);
      if (!cafe) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Cafe not found' },
        });
      }

      const apiKey = app.config.DEEPSEEK_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({
          error: { code: 'AI_UNCONFIGURED', message: 'AI console is not configured' },
        });
      }

      const body = bodySchema.parse(request.body);

      // Context comes from the persisted transcript (survives reloads/sessions),
      // not the client — the client only sends the new message.
      const recent = await messagesRepo.listRecent(cafeId, HISTORY_LIMIT);
      const history = recent.map(({ role, content }) => ({ role, content }));

      const systemPrompt = [
        `You are the AI manager for "${cafe.name}". Help the owner understand and run their cafe.`,
        `ALWAYS use a tool to get real data — never invent numbers.`,
        `Money is in paise; present it as ₹ (divide by 100).`,
        // "Be concise" alone still produced multi-paragraph answers. A cafe owner
        // reads this between orders on a counter tablet, so the cap is explicit.
        `Answer in 3 sentences or fewer, or up to 5 short bullets when listing figures.`,
        `Lead with the number the owner asked for. No preamble, no restating the question, no closing offer of further help.`,
        `Only add context or caveats if they change what the owner should do.`,
        `Confirm before destructive actions.`,
        // The product uses lucide icons everywhere; emoji bullets/checkmarks
        // look amateur next to that and were flagged by an audit. Hard rule.
        `NEVER use emojis (no 📦/✅/📃/🚀/etc.). Use plain bullets ("- ") and "Yes"/"No"/"Done" instead.`,
      ].join(' ');

      const executor = buildExecutor(cafeId, ordersRepo, menuRepo);

      let result: AgentResult;
      try {
        result = await agent(
          {
            apiKey,
            baseUrl: app.config.DEEPSEEK_BASE_URL,
            model: app.config.DEEPSEEK_MODEL,
          },
          systemPrompt,
          TOOL_SPECS,
          executor,
          body.message,
          history,
        );
      } catch (err) {
        app.log.error({ err }, 'ai-console provider error');
        return reply.status(502).send({
          error: {
            code: 'AI_UPSTREAM_ERROR',
            message: 'The AI manager is temporarily unavailable. Please try again in a moment.',
          },
        });
      }

      // Persist the turn only after a successful reply (no dangling user msg).
      await messagesRepo.append(cafeId, { role: 'user', content: body.message });
      await messagesRepo.append(cafeId, {
        role: 'assistant',
        content: result.reply,
        toolsUsed: result.toolsUsed,
      });

      return { reply: result.reply, toolsUsed: result.toolsUsed };
    },
  );
}
