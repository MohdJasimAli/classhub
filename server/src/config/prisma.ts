import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * A single PrismaClient instance for the whole process.
 *
 * - `datasources.db.url` lets the test-suite point at a throwaway schema via
 *   DATABASE_URL without touching application code.
 * - Logging is only enabled outside production to keep output readable.
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
   
  console.log('[db] connected to PostgreSQL');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export type { Prisma } from '@prisma/client';
