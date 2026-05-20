import type { SettleStatement } from '@mehfil/types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { analyzeStatement } from '../settle/analyzer.js';
import { parseDeductionsCsv } from '../settle/classifier.js';

const analyzeBodySchema = z.object({
  platform: z.enum(['zomato', 'swiggy']),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  orderCount: z.number().int().min(0),
  grossSalesRupees: z.number().min(0),
  netPayoutRupees: z.number().min(0).optional(),
  deductionsCsv: z.string().min(1, 'paste at least one deduction line'),
  config: z
    .object({
      contractedCommissionRatePct: z.number().min(0).max(100).optional(),
      adsConsented: z.boolean().optional(),
      discountsApproved: z.boolean().optional(),
    })
    .optional(),
});

const toPaise = (rupees: number): number => Math.round(rupees * 100);

export async function settleRoutes(app: FastifyInstance): Promise<void> {
  app.post('/settle/analyze', { preHandler: app.authenticate }, async (request, reply) => {
    const body = analyzeBodySchema.parse(request.body);

    const deductions = parseDeductionsCsv(body.deductionsCsv);
    if (deductions.length === 0) {
      return reply.status(400).send({
        error: {
          code: 'NO_DEDUCTIONS',
          message: 'Could not read any deduction lines from the input',
        },
      });
    }

    const statement: SettleStatement = {
      platform: body.platform,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      orderCount: body.orderCount,
      grossSalesPaise: toPaise(body.grossSalesRupees),
      deductions,
      netPayoutPaise:
        body.netPayoutRupees != null ? toPaise(body.netPayoutRupees) : undefined,
    };

    const report = analyzeStatement(statement, body.config ?? {});
    return { report };
  });
}
