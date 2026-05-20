import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for drizzle-kit. Set it in your shell or .env file.');
}

export default defineConfig({
  // Explicit list (not a glob) so drizzle-kit doesn't try to parse our
  // ESM-style index re-export file, which uses `.js` extensions that its
  // CJS loader can't resolve.
  schema: ['./src/schema/cafes.ts', './src/schema/menu.ts', './src/schema/orders.ts'],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  // snake_case at the DB layer is Postgres convention and matches the
  // `casing: 'snake_case'` setting on the Drizzle client in src/client.ts.
  casing: 'snake_case',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
