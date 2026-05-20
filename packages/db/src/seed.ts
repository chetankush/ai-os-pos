import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import * as schema from './schema/index.js';

/**
 * Seeds a realistic Indian cafe (Noida, Sector 18) with a full menu and a
 * spread of orders in every status, so the whole platform can be exercised
 * as a real user.
 *
 * Owner is the Supabase auth user that the app logs in as. Defaults to the
 * `admin@testpos.com` test user; override with SEED_OWNER_ID.
 *
 * Run: DATABASE_URL=... pnpm --filter @sangam/db db:seed
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required to seed');

const OWNER_ID =
  process.env.SEED_OWNER_ID ?? 'b3d0eee3-3b8a-475d-9f4a-f86394c06cf0';

const CAFE_SLUG = 'tapri-central';
const GST_RATE_BP = 1800; // AC cafe → 18%

// ─── Menu data (prices in paise) ──────────────────────────────────────────────

interface SeedItem {
  name: string;
  pricePaise: number;
  description?: string;
  isVegetarian?: boolean;
  isVegan?: boolean;
  containsEgg?: boolean;
  spiceLevel?: number;
}

const MENU: { category: string; items: SeedItem[] }[] = [
  {
    category: 'Chai & Coffee',
    items: [
      { name: 'Masala Chai', pricePaise: 4000, description: 'Cutting-style, brewed with whole spices' },
      { name: 'Adrak Chai', pricePaise: 4500, description: 'Extra ginger, perfect for Delhi winters' },
      { name: 'Filter Coffee', pricePaise: 6000, description: 'South-Indian style, frothy' },
      { name: 'Cappuccino', pricePaise: 15000, description: 'Double shot with steamed milk' },
      { name: 'Cold Coffee', pricePaise: 18000, description: 'Thick, creamy, with ice cream' },
      { name: 'Hot Chocolate', pricePaise: 17000 },
    ],
  },
  {
    category: 'Snacks & Quick Bites',
    items: [
      { name: 'Veg Maggi', pricePaise: 8000, description: '2-minute classic with veggies' },
      { name: 'Cheese Maggi', pricePaise: 11000, description: 'Loaded with extra cheese' },
      { name: 'Egg Maggi', pricePaise: 10000, isVegetarian: false, containsEgg: true },
      { name: 'Samosa (2 pc)', pricePaise: 4000, spiceLevel: 1, description: 'With imli & pudina chutney' },
      { name: 'Veg Grilled Sandwich', pricePaise: 12000 },
      { name: 'Chicken Tikka Sandwich', pricePaise: 17000, isVegetarian: false, spiceLevel: 2 },
      { name: 'Aloo Tikki Burger', pricePaise: 13000, spiceLevel: 1 },
      { name: 'Masala French Fries', pricePaise: 11000, spiceLevel: 1 },
      { name: 'Paneer Tikka', pricePaise: 22000, spiceLevel: 2, description: 'Tandoor-grilled, 6 pc' },
    ],
  },
  {
    category: 'Mains & Thali',
    items: [
      { name: 'Rajma Chawal', pricePaise: 16000, description: 'Homestyle rajma with steamed rice' },
      { name: 'Chole Bhature', pricePaise: 14000, spiceLevel: 2 },
      { name: 'Veg Thali', pricePaise: 20000, description: 'Dal, sabzi, 3 roti, rice, raita, salad' },
      { name: 'Paneer Butter Masala + 2 Roti', pricePaise: 24000, spiceLevel: 1 },
      { name: 'Dal Makhani + Jeera Rice', pricePaise: 19000 },
      { name: 'Butter Chicken + 2 Roti', pricePaise: 28000, isVegetarian: false, spiceLevel: 2 },
    ],
  },
  {
    category: 'Desserts',
    items: [
      { name: 'Gulab Jamun (2 pc)', pricePaise: 8000 },
      { name: 'Chocolate Brownie', pricePaise: 14000 },
      { name: 'Brownie with Ice Cream', pricePaise: 16000 },
      { name: 'Gajar Halwa', pricePaise: 12000, description: 'Seasonal, ghee-roasted' },
    ],
  },
];

// ─── Orders data ──────────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

type PaymentMethod = 'cash' | 'upi' | 'card' | 'online';

interface SeedOrder {
  status: OrderStatus;
  source: 'counter' | 'qr' | 'phone';
  minutesAgo: number;
  tableLabel?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  lines: { name: string; qty: number }[];
}

const ORDERS: SeedOrder[] = [
  { status: 'completed', source: 'counter', minutesAgo: 320, tableLabel: 'T5', paymentMethod: 'cash', lines: [{ name: 'Masala Chai', qty: 2 }, { name: 'Veg Maggi', qty: 1 }, { name: 'Samosa (2 pc)', qty: 1 }] },
  { status: 'completed', source: 'qr', minutesAgo: 240, customerName: 'Rahul Verma', customerPhone: '9810012345', paymentMethod: 'upi', lines: [{ name: 'Cappuccino', qty: 1 }, { name: 'Chicken Tikka Sandwich', qty: 1 }] },
  { status: 'completed', source: 'counter', minutesAgo: 150, tableLabel: 'T2', paymentMethod: 'card', lines: [{ name: 'Veg Thali', qty: 2 }, { name: 'Gulab Jamun (2 pc)', qty: 1 }] },
  { status: 'completed', source: 'qr', minutesAgo: 95, customerName: 'Sneha Gupta', customerPhone: '9999088776', paymentMethod: 'upi', lines: [{ name: 'Cold Coffee', qty: 2 }, { name: 'Brownie with Ice Cream', qty: 1 }] },
  { status: 'ready', source: 'counter', minutesAgo: 18, tableLabel: 'T7', lines: [{ name: 'Paneer Tikka', qty: 1 }, { name: 'Masala French Fries', qty: 1 }, { name: 'Cold Coffee', qty: 2 }] },
  { status: 'preparing', source: 'counter', minutesAgo: 9, tableLabel: 'T3', notes: 'Less spicy', lines: [{ name: 'Butter Chicken + 2 Roti', qty: 1 }, { name: 'Dal Makhani + Jeera Rice', qty: 1 }] },
  { status: 'preparing', source: 'qr', minutesAgo: 6, customerName: 'Priya Singh', lines: [{ name: 'Cappuccino', qty: 2 }, { name: 'Chocolate Brownie', qty: 1 }] },
  { status: 'pending', source: 'counter', minutesAgo: 2, tableLabel: 'T1', lines: [{ name: 'Masala Chai', qty: 4 }, { name: 'Samosa (2 pc)', qty: 2 }] },
  { status: 'cancelled', source: 'qr', minutesAgo: 60, customerName: 'Walk-in', notes: 'Customer left', lines: [{ name: 'Cold Coffee', qty: 1 }] },
];

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function orderNumber(i: number): string {
  return `S-${String(100001 + i)}`;
}

async function main(): Promise<void> {
  const db = createDb(DATABASE_URL!);
  console.log(`Seeding owner ${OWNER_ID}…`);

  // Idempotent: remove any prior seed cafe (FK cascade clears its menu + orders).
  const prior = await db
    .select({ id: schema.cafes.id })
    .from(schema.cafes)
    .where(eq(schema.cafes.slug, CAFE_SLUG));
  for (const c of prior) {
    await db.delete(schema.cafes).where(eq(schema.cafes.id, c.id));
  }

  const [cafe] = await db
    .insert(schema.cafes)
    .values({
      ownerId: OWNER_ID,
      name: 'Tapri Central',
      slug: CAFE_SLUG,
      gstin: '09AABCT1234A1Z5',
      fssai: '12345678901234',
      addressLine1: 'Shop 12, Sector 18 Market',
      addressLine2: 'Near Atta Market',
      city: 'Noida',
      state: 'Uttar Pradesh',
      pincode: '201301',
      isAirConditioned: true,
      primaryColor: '#C45A1A',
    })
    .returning();
  if (!cafe) throw new Error('Failed to insert cafe');
  console.log(`  cafe: ${cafe.name} (${cafe.id})`);

  // Menu — insert categories then items; build a name → item lookup.
  const itemByName = new Map<string, typeof schema.menuItems.$inferSelect>();
  for (let ci = 0; ci < MENU.length; ci++) {
    const group = MENU[ci]!;
    const [cat] = await db
      .insert(schema.menuCategories)
      .values({ cafeId: cafe.id, name: group.category, sortOrder: ci })
      .returning();
    if (!cat) throw new Error('Failed to insert category');

    for (let ii = 0; ii < group.items.length; ii++) {
      const it = group.items[ii]!;
      const [row] = await db
        .insert(schema.menuItems)
        .values({
          cafeId: cafe.id,
          categoryId: cat.id,
          name: it.name,
          description: it.description ?? null,
          basePricePaise: it.pricePaise,
          isVegetarian: it.isVegetarian ?? true,
          isVegan: it.isVegan ?? false,
          containsEgg: it.containsEgg ?? false,
          spiceLevel: it.spiceLevel ?? 0,
          sortOrder: ii,
        })
        .returning();
      if (row) itemByName.set(it.name, row);
    }
  }
  console.log(`  menu: ${MENU.length} categories, ${itemByName.size} items`);

  // Orders + line items.
  for (let i = 0; i < ORDERS.length; i++) {
    const o = ORDERS[i]!;
    const lines = o.lines.map((l) => {
      const item = itemByName.get(l.name);
      if (!item) throw new Error(`Seed order references unknown item: ${l.name}`);
      return { item, qty: l.qty };
    });
    const subtotal = lines.reduce((s, { item, qty }) => s + item.basePricePaise * qty, 0);
    const tax = Math.round((subtotal * GST_RATE_BP) / 10000);
    const total = subtotal + tax;
    const createdAt = isoMinutesAgo(o.minutesAgo);

    const [order] = await db
      .insert(schema.orders)
      .values({
        cafeId: cafe.id,
        orderNumber: orderNumber(i),
        status: o.status,
        source: o.source,
        tableLabel: o.tableLabel ?? null,
        customerName: o.customerName ?? null,
        customerPhone: o.customerPhone ?? null,
        notes: o.notes ?? null,
        subtotalPaise: subtotal,
        taxPaise: tax,
        totalPaise: total,
        gstRateBp: GST_RATE_BP,
        paymentMethod: o.status === 'completed' ? (o.paymentMethod ?? 'cash') : null,
        createdAt,
        updatedAt: createdAt,
        paidAt: o.status === 'completed' ? createdAt : null,
      })
      .returning();
    if (!order) throw new Error('Failed to insert order');

    await db.insert(schema.orderItems).values(
      lines.map(({ item, qty }) => ({
        orderId: order.id,
        menuItemId: item.id,
        itemNameSnapshot: item.name,
        unitPricePaise: item.basePricePaise,
        quantity: qty,
        lineTotalPaise: item.basePricePaise * qty,
      })),
    );
  }
  console.log(`  orders: ${ORDERS.length} (across all statuses)`);

  console.log('Seed complete ✓');
  await db.$client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
