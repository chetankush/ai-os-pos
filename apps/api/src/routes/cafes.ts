import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createDrizzleCafesRepo,
  type CafesRepository,
  type NewCafe,
} from '../repositories/cafes.js';

export interface CafesRoutesOptions {
  // Allow tests to inject a mock repository.
  repository?: CafesRepository;
}

const createCafeBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, and hyphens only')
    .min(2)
    .max(80)
    .optional(),
  gstin: z.string().trim().length(15).optional(),
  fssai: z.string().trim().min(7).max(14).optional(),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'pincode must be 6 digits'),
  isAirConditioned: z.boolean().optional(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'primaryColor must be a hex color like #ff8800')
    .optional(),
  logoUrl: z.string().trim().url().optional(),
});

const cafeParamsSchema = z.object({
  id: z.string().uuid(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export async function cafesRoutes(
  app: FastifyInstance,
  opts: CafesRoutesOptions = {},
): Promise<void> {
  // Resolve repository at register-time. Tests pass a mock; runtime uses Drizzle.
  const repo = opts.repository ?? createDrizzleCafesRepo(app.db);

  app.post('/cafes', { preHandler: app.authenticate }, async (request, reply) => {
    const body = createCafeBodySchema.parse(request.body);

    const ownerId = request.user.id;
    const slug = body.slug ?? slugify(body.name);

    if (slug.length < 2) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name must contain at least 2 alphanumeric characters for slug generation',
        },
      });
    }

    const newCafe: NewCafe = {
      ownerId,
      name: body.name,
      slug,
      gstin: body.gstin ?? null,
      fssai: body.fssai ?? null,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2 ?? null,
      city: body.city,
      state: body.state,
      pincode: body.pincode,
      isAirConditioned: body.isAirConditioned ?? false,
      primaryColor: body.primaryColor ?? null,
      logoUrl: body.logoUrl ?? null,
    };

    try {
      const cafe = await repo.create(newCafe);
      return reply.status(201).send({ cafe });
    } catch (err) {
      // Postgres unique violation = duplicate slug. postgres-js exposes this
      // as a CODE-based error; checking message + code keeps us portable.
      const errCode = (err as { code?: string } | null)?.code;
      if (errCode === '23505') {
        return reply.status(409).send({
          error: {
            code: 'SLUG_TAKEN',
            message: `A cafe with slug "${slug}" already exists`,
          },
        });
      }
      throw err;
    }
  });

  app.get('/cafes', { preHandler: app.authenticate }, async (request) => {
    const cafes = await repo.listByOwner(request.user.id);
    return { cafes };
  });

  app.get('/cafes/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = cafeParamsSchema.parse(request.params);
    const cafe = await repo.findByIdAndOwner(id, request.user.id);

    if (!cafe) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Cafe not found' },
      });
    }

    return { cafe };
  });
}
