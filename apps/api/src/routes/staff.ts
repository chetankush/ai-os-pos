import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPin } from '../lib/pin.js';
import { type CafesRepository, createDrizzleCafesRepo } from '../repositories/cafes.js';
import {
  type NewStaff,
  type StaffRepository,
  type UpdateStaff,
  createDrizzleStaffRepo,
} from '../repositories/staff.js';

export interface StaffRoutesOptions {
  repository?: StaffRepository;
  cafesRepository?: CafesRepository;
}

const cafeParamsSchema = z.object({ cafeId: z.string().uuid() });
const staffParamsSchema = z.object({
  cafeId: z.string().uuid(),
  staffId: z.string().uuid(),
});

const roleSchema = z.enum(['owner', 'manager', 'cashier', 'waiter']);
const pinSchema = z.string().regex(/^[0-9]{4,8}$/, 'PIN must be 4–8 digits');

const createStaffBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  role: roleSchema,
  pin: pinSchema.optional(),
  isActive: z.boolean().optional(),
});

const updateStaffBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    role: roleSchema,
    // null clears the PIN; a string sets a new one; absent leaves it unchanged.
    pin: pinSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial();

export async function staffRoutes(
  app: FastifyInstance,
  opts: StaffRoutesOptions = {},
): Promise<void> {
  const staffRepo = opts.repository ?? createDrizzleStaffRepo(app.db);
  const cafesRepo = opts.cafesRepository ?? createDrizzleCafesRepo(app.db);

  async function ownsCafe(cafeId: string, ownerId: string): Promise<boolean> {
    return Boolean(await cafesRepo.findByIdAndOwner(cafeId, ownerId));
  }

  // ─── GET /cafes/:cafeId/staff ───────────────────────────────────────────────
  app.get('/cafes/:cafeId/staff', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const staff = await staffRepo.list(cafeId);
    return { staff };
  });

  // ─── POST /cafes/:cafeId/staff ──────────────────────────────────────────────
  app.post('/cafes/:cafeId/staff', { preHandler: app.authenticate }, async (request, reply) => {
    const { cafeId } = cafeParamsSchema.parse(request.params);
    if (!(await ownsCafe(cafeId, request.user.id))) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
    }
    const body = createStaffBodySchema.parse(request.body);
    const data: NewStaff = {
      name: body.name,
      role: body.role,
      pinHash: body.pin ? hashPin(body.pin) : null,
      isActive: body.isActive ?? true,
    };

    try {
      const staff = await staffRepo.create(cafeId, data);
      return reply.status(201).send({ staff });
    } catch (err) {
      const errCode = (err as { code?: string } | null)?.code;
      if (errCode === '23505') {
        return reply.status(409).send({
          error: {
            code: 'STAFF_NAME_TAKEN',
            message: `A staff member named "${body.name}" already exists`,
          },
        });
      }
      throw err;
    }
  });

  // ─── PATCH /cafes/:cafeId/staff/:staffId ────────────────────────────────────
  app.patch(
    '/cafes/:cafeId/staff/:staffId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, staffId } = staffParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const body = updateStaffBodySchema.parse(request.body);

      const patch: UpdateStaff = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.role !== undefined) patch.role = body.role;
      if (body.isActive !== undefined) patch.isActive = body.isActive;
      // pin: null → clear, string → hash, undefined → leave unchanged
      if (body.pin !== undefined) patch.pinHash = body.pin === null ? null : hashPin(body.pin);

      try {
        const staff = await staffRepo.update(staffId, cafeId, patch);
        if (!staff) {
          return reply
            .status(404)
            .send({ error: { code: 'NOT_FOUND', message: 'Staff member not found' } });
        }
        return { staff };
      } catch (err) {
        const errCode = (err as { code?: string } | null)?.code;
        if (errCode === '23505') {
          return reply.status(409).send({
            error: {
              code: 'STAFF_NAME_TAKEN',
              message: 'A staff member with that name already exists',
            },
          });
        }
        throw err;
      }
    },
  );

  // ─── DELETE /cafes/:cafeId/staff/:staffId ───────────────────────────────────
  app.delete(
    '/cafes/:cafeId/staff/:staffId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { cafeId, staffId } = staffParamsSchema.parse(request.params);
      if (!(await ownsCafe(cafeId, request.user.id))) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Cafe not found' } });
      }
      const deleted = await staffRepo.delete(staffId, cafeId);
      if (!deleted) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Staff member not found' } });
      }
      return reply.status(204).send();
    },
  );
}
