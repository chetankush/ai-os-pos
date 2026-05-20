import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// GST regime the cafe operates under. Drives the rate charged on the bill —
// see apps/api/src/orders/build.ts. Per India's Sept-2025 GST reform, the AC
// vs non-AC distinction no longer determines the slab; the cafe's declared
// mode does.
//   regular_5    → 5% GST on the invoice (standard restaurant service).
//   regular_18   → 18% GST (e.g. restaurant inside a hotel with room tariff
//                  above ₹7,500/day).
//   composition  → composition-scheme dealer: charges NO GST on the bill and
//                  instead pays a flat % on turnover themselves.
//   exempt       → not registered / exempt: no GST on the bill.
export const gstModeValues = ['regular_5', 'regular_18', 'composition', 'exempt'] as const;
export type GstMode = (typeof gstModeValues)[number];

export const cafes = pgTable(
  'cafes',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    // Supabase auth user id of the owner. No hard FK to auth.users so this
    // schema is portable; application code enforces the link via JWT claims.
    ownerId: uuid().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    gstin: text(),
    fssai: text(),
    addressLine1: text().notNull(),
    addressLine2: text(),
    city: text().notNull(),
    state: text().notNull(),
    pincode: text().notNull(),
    // Kept for informational/display purposes only — NO LONGER drives the GST
    // slab (see gstMode below).
    isAirConditioned: boolean().notNull().default(false),
    // GST regime — determines the rate charged on the bill.
    gstMode: text({ enum: gstModeValues }).notNull().default('regular_5'),
    primaryColor: text(),
    logoUrl: text(),
    // QR online payments (Razorpay). Master switch + whether QR orders must be
    // prepaid (true) or can run as a pay-later tab / pay-at-counter (false).
    onlinePaymentEnabled: boolean().notNull().default(false),
    qrPrepaidRequired: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex('cafes_slug_idx').on(table.slug),
    index('cafes_owner_id_idx').on(table.ownerId),
  ],
);

export type CafeRow = typeof cafes.$inferSelect;
export type CafeInsert = typeof cafes.$inferInsert;
