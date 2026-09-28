/**
 * Global test bootstrap.
 *
 * Points the process at a throwaway PostgreSQL schema and pushes the Prisma
 * schema into it once, so a test run can never touch development data.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

// Load server/.env for the real DATABASE_URL, then override with the test DB.
dotenv.config({ path: path.join(serverRoot, '.env') });

/**
 * Derives the test connection string from the development one by swapping only
 * the database name.
 *
 * Done with URL parsing rather than a regex because a password may legally
 * contain "/" or "?", which would make a pattern match the wrong segment and
 * silently point the suite at the development database. Any query string
 * (?schema=public, ?sslmode=require, ...) is preserved.
 */
function deriveTestUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, '');
  url.pathname = `/${name.replace(/[^_a-zA-Z0-9]/g, '')}_test`;
  return url.toString();
}

const testUrl =
  process.env.DATABASE_TEST_URL ??
  (process.env.DATABASE_URL ? deriveTestUrl(process.env.DATABASE_URL) : undefined);

if (!testUrl) {
  throw new Error(
    'No test database configured. Set DATABASE_TEST_URL or DATABASE_URL in server/.env',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'classhub-test-secret-value-0123456789abcdef';
process.env.CLIENT_URL = 'http://localhost:5173';
// Force capture mode so no test ever attempts a real SMTP connection.
process.env.EMAIL_HOST = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';
process.env.UPLOAD_DIR = path.join(serverRoot, 'uploads-test');

const prismaSchema = path.join(repoRoot, 'prisma', 'schema.prisma');
if (!fs.existsSync(prismaSchema)) {
  throw new Error(`Prisma schema not found at ${prismaSchema}`);
}

// Create the schema from scratch. `db push` is used rather than `migrate
// deploy` so the test database is always exactly in sync with the schema file.
execSync(`npx prisma db push --skip-generate --accept-data-loss --schema="${prismaSchema}"`, {
  cwd: repoRoot,
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: 'pipe',
});

console.log(`[test] using database: ${testUrl.replace(/:[^:@/]+@/, ':***@')}`);
