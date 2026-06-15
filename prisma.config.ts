import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 6 stops auto-loading .env once a config file exists, so load it
// ourselves. .env.local (git-ignored, dev DB) wins over .env when both exist.
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
