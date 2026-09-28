import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Resolve server/ regardless of whether the process was started by tsx
// (src/config) or compiled by tsc (dist/config).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..', '..');

for (const candidate of [
  path.join(serverRoot, '.env'),
  path.resolve(serverRoot, '..', '.env'),
]) {
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate });
}

/** Parse a boolean-ish environment string. */
const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
  );

const intWithDefault = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intWithDefault(5000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  EMAIL_HOST: z.string().default(''),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_SECURE: boolish.default(false),
  EMAIL_USER: z.string().default(''),
  EMAIL_PASSWORD: z.string().default(''),
  EMAIL_FROM: z.string().default('ClassHub <no-reply@classhub.edu>'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),

  RATE_LIMIT_WINDOW_MINUTES: intWithDefault(15),
  AUTH_RATE_LIMIT_MAX: intWithDefault(20),

  REMINDER_CRON: z.string().default('*/10 * * * *'),
  REMINDER_LEAD_HOURS: z.coerce.number().positive().default(24),
  REMINDER_TOLERANCE_MINUTES: z.coerce.number().nonnegative().default(30),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Fail fast and loudly: a misconfigured server must never start silently.
  console.error(`\n[config] Invalid environment configuration:\n${issues}\n`);
  console.error('Copy .env.example to server/.env and fill in the values.\n');
  process.exit(1);
}

const raw = parsed.data;

const isProd = raw.NODE_ENV === 'production';
const uploadDir = path.isAbsolute(raw.UPLOAD_DIR)
  ? raw.UPLOAD_DIR
  : path.join(serverRoot, raw.UPLOAD_DIR);

export const env = {
  ...raw,
  isProd,
  isTest: raw.NODE_ENV === 'test',
  paths: {
    serverRoot,
    uploads: uploadDir,
    prismaSchema: path.resolve(serverRoot, '..', 'prisma', 'schema.prisma'),
  },
  /**
   * When SMTP is not configured we run in "capture" mode: no network calls,
   * every message is logged to EmailLog. Keeps local dev and the test suite
   * fully exercisable without real credentials.
   */
  emailEnabled: Boolean(raw.EMAIL_HOST && raw.EMAIL_USER),
  maxFileSizeBytes: Math.round(raw.MAX_FILE_SIZE_MB * 1024 * 1024),
} as const;

export type Env = typeof env;
