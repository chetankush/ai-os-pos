import type {
  SettleCategory,
  SettleConfig,
  SettleFinding,
  SettlePlatform,
  SettleReport,
  SettleStatement,
} from '@mehfil/types';

const COMMISSION_TOLERANCE_PP = 0.5; // percentage points
const HIGH_TAKE_RATE_PCT = 35;
const TAX_DEVIATION_THRESHOLD = 0.25; // 25%

// Deductions that are contractual / statutory and not realistically recoverable.
const MANDATORY_CATEGORIES: ReadonlySet<SettleCategory> = new Set<SettleCategory>([
  'commission',
  'service_fee',
  'payment_gateway',
  'gst',
  'tcs',
  'tds',
  'packaging',
  'delivery',
]);

function platformName(p: SettlePlatform): string {
  return p === 'zomato' ? 'Zomato' : 'Swiggy';
}

function rupees(paise: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.round(paise / 100),
  )}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sumCategory(stmt: SettleStatement, category: SettleCategory): number {
  return stmt.deductions
    .filter((d) => d.category === category)
    .reduce((acc, d) => acc + d.amountPaise, 0);
}

export function analyzeStatement(
  stmt: SettleStatement,
  config: SettleConfig = {},
): SettleReport {
  const totalDeductionsPaise = stmt.deductions.reduce(
    (acc, d) => acc + d.amountPaise,
    0,
  );
  const netPayoutPaise =
    stmt.netPayoutPaise ?? stmt.grossSalesPaise - totalDeductionsPaise;
  const effectiveTakeRatePct =
    stmt.grossSalesPaise > 0
      ? round1((totalDeductionsPaise / stmt.grossSalesPaise) * 100)
      : 0;

  const findings: SettleFinding[] = [];

  // 1. Unauthorized ads — the highest-leverage dispute (Swiggy reverses when
  //    there is no consent trail; MediaNama Apr 2026).
  const ads = sumCategory(stmt, 'ads');
  if (ads > 0 && config.adsConsented !== true) {
    findings.push({
      code: 'UNAUTHORIZED_ADS',
      title: 'Ad charges without confirmed consent',
      detail:
        `${rupees(ads)} was deducted for ads/marketing. If you did not approve ` +
        `these (or they auto-renewed past the agreed window), platforms reverse ` +
        `the amount when there is no consent trail. Confirm consent or dispute.`,
      amountPaise: ads,
      severity: 'high',
      disputable: true,
    });
  }

  // 2. Commission charged above the contracted rate.
  const commission = sumCategory(stmt, 'commission');
  if (
    config.contractedCommissionRatePct != null &&
    stmt.grossSalesPaise > 0 &&
    commission > 0
  ) {
    const impliedPct = (commission / stmt.grossSalesPaise) * 100;
    if (impliedPct > config.contractedCommissionRatePct + COMMISSION_TOLERANCE_PP) {
      const expected = Math.round(
        (stmt.grossSalesPaise * config.contractedCommissionRatePct) / 100,
      );
      const excess = commission - expected;
      findings.push({
        code: 'COMMISSION_OVERCHARGE',
        title: 'Commission above contracted rate',
        detail:
          `Commission works out to ${round1(impliedPct)}% of gross, but your ` +
          `contracted rate is ${config.contractedCommissionRatePct}%. Excess: ${rupees(excess)}.`,
        amountPaise: excess,
        severity: 'high',
        disputable: true,
      });
    }
  }

  // 3. Restaurant-funded discounts the owner may not have approved.
  const discount = sumCategory(stmt, 'discount');
  if (discount > 0 && config.discountsApproved !== true) {
    findings.push({
      code: 'DISCOUNT_REVIEW',
      title: 'Restaurant-funded discounts to verify',
      detail:
        `${rupees(discount)} of discounts were funded by you. Verify each was ` +
        `approved — discounts are routinely applied wider or longer than agreed.`,
      amountPaise: discount,
      severity: 'medium',
      disputable: true,
    });
  }

  // 4. Refund / compensation deductions (customer-fault refunds shouldn't hit you).
  const refund = sumCategory(stmt, 'refund') + sumCategory(stmt, 'cancellation');
  if (refund > 0) {
    findings.push({
      code: 'REFUND_DEDUCTION',
      title: 'Refund / compensation charged to you',
      detail:
        `${rupees(refund)} was recovered as customer refunds/compensation. ` +
        `Refunds for platform- or delivery-fault issues should not be charged ` +
        `to the restaurant — dispute these.`,
      amountPaise: refund,
      severity: 'medium',
      disputable: true,
    });
  }

  // 5. Informational: take rate above the typical 25-35% band.
  if (effectiveTakeRatePct > HIGH_TAKE_RATE_PCT) {
    findings.push({
      code: 'HIGH_TAKE_RATE',
      title: 'Effective take rate above typical',
      detail:
        `Total deductions are ${effectiveTakeRatePct}% of gross — above the ` +
        `typical 25-35% band. Worth investigating which line items drove it.`,
      amountPaise: 0,
      severity: 'low',
      disputable: false,
    });
  }

  // 6. TCS / TDS sanity (should be ~1% of platform service fee). Informational.
  const serviceFeeBase = commission + sumCategory(stmt, 'service_fee');
  if (serviceFeeBase > 0) {
    const expectedTax = Math.round(serviceFeeBase * 0.01);
    for (const [cat, code] of [
      ['tcs', 'TCS_MISMATCH'],
      ['tds', 'TDS_MISMATCH'],
    ] as const) {
      const actual = sumCategory(stmt, cat);
      if (actual > 0 && expectedTax > 0) {
        const deviation = Math.abs(actual - expectedTax) / expectedTax;
        if (deviation > TAX_DEVIATION_THRESHOLD) {
          findings.push({
            code,
            title: `${cat.toUpperCase()} looks off`,
            detail:
              `${cat.toUpperCase()} is ${rupees(actual)}, but ~1% of service fees ` +
              `would be ${rupees(expectedTax)}. Worth a check.`,
            amountPaise: Math.abs(actual - expectedTax),
            severity: 'low',
            disputable: false,
          });
        }
      }
    }
  }

  const mandatoryDeductionsPaise = stmt.deductions
    .filter((d) => MANDATORY_CATEGORIES.has(d.category))
    .reduce((acc, d) => acc + d.amountPaise, 0);

  const disputablePaise = findings
    .filter((f) => f.disputable)
    .reduce((acc, f) => acc + f.amountPaise, 0);

  const whatsappSummary = buildWhatsappSummary(stmt, {
    totalDeductionsPaise,
    netPayoutPaise,
    effectiveTakeRatePct,
    mandatoryDeductionsPaise,
    disputablePaise,
    findings,
  });

  return {
    platform: stmt.platform,
    periodStart: stmt.periodStart,
    periodEnd: stmt.periodEnd,
    orderCount: stmt.orderCount,
    grossSalesPaise: stmt.grossSalesPaise,
    totalDeductionsPaise,
    netPayoutPaise,
    effectiveTakeRatePct,
    mandatoryDeductionsPaise,
    disputablePaise,
    findings,
    whatsappSummary,
  };
}

function buildWhatsappSummary(
  stmt: SettleStatement,
  r: {
    totalDeductionsPaise: number;
    netPayoutPaise: number;
    effectiveTakeRatePct: number;
    mandatoryDeductionsPaise: number;
    disputablePaise: number;
    findings: SettleFinding[];
  },
): string {
  const lines: string[] = [];
  lines.push(
    `*${platformName(stmt.platform)} settlement — ${stmt.periodStart} to ${stmt.periodEnd}*`,
  );
  lines.push(
    `${stmt.orderCount} orders · Gross ${rupees(stmt.grossSalesPaise)}`,
  );
  lines.push(
    `Deducted: ${rupees(r.totalDeductionsPaise)} (${r.effectiveTakeRatePct}% effective take)`,
  );
  lines.push('');

  const disputableFindings = r.findings.filter((f) => f.disputable);
  if (r.disputablePaise > 0) {
    lines.push(`⚠️ Looks disputable: ${rupees(r.disputablePaise)}`);
    for (const f of disputableFindings) {
      lines.push(`• ${f.title}: ${rupees(f.amountPaise)}`);
    }
  } else {
    lines.push('✅ No obvious disputable deductions this period.');
  }
  lines.push('');
  lines.push(`Mandatory (not recoverable): ${rupees(r.mandatoryDeductionsPaise)}`);
  lines.push(`Net you received: ${rupees(r.netPayoutPaise)}`);

  if (r.disputablePaise > 0) {
    lines.push('');
    lines.push('Want me to file these disputes for you?');
  }

  return lines.join('\n');
}
