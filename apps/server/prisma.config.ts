import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration. The datasource URL lives here (not in schema.prisma),
 * because Prisma 7 requires a driver adapter and no longer auto-loads .env.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./data/zaidkhan.db',
  },
});
