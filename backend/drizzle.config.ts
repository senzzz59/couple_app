import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { databaseUrlFrom } from './src/databaseConfig.ts';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL || (process.env.DB_PASSWORD ? databaseUrlFrom(process.env) : '') },
});
