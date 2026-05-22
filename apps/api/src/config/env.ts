import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url().optional(),
  // Supabase project URL — enables ES256/RS256 token verification via JWKS.
  SUPABASE_URL: z.string().url().optional(),
  // Legacy HS256 shared secret — used for HS256 tokens (tests / older projects).
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  // Service (secret) key — server-side only; used to upload to Supabase Storage.
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  // AI provider — any OpenAI-compatible chat-completions endpoint.
  // Default is OpenRouter (NOT the China-hosted DeepSeek API): customer/financial
  // data must not transit api.deepseek.com (data sovereignty + India regulatory
  // risk; see docs/market-analysis.md §5). Point DEEPSEEK_BASE_URL at
  // OpenRouter / Together / Gemini-compat / a self-host to choose your provider.
  // NOTE: Settle never calls an LLM, so settlement data is unaffected regardless.
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek/deepseek-chat'),
  DEEPSEEK_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  GEMINI_API_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
