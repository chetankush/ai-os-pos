// Load apps/api/.env into process.env before anything reads it. dotenv is a
// no-op when there's no .env file (e.g. production, where the platform injects
// env) and never overrides vars already present, so this is safe everywhere.
import 'dotenv/config';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function start(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);

  const closeGracefully = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Failed to close server cleanly');
      process.exit(1);
    }
  };

  process.on('SIGINT', closeGracefully);
  process.on('SIGTERM', closeGracefully);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void start();
