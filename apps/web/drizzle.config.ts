import { defineConfig } from 'drizzle-kit';

// db:generate / db:migrate read the same .env.local as `pnpm dev`. A value
// already in the shell (CI, a one-off override) wins: loadEnvFile never overwrites.
try { process.loadEnvFile('.env.local'); } catch {}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  schemaFilter: ['rekod'],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
