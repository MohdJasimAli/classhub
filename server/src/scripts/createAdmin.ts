/**
 * ---------------------------------------------------------------------------
 * Create or promote a ClassHub administrator.
 *
 * This exists because the production Docker image installs no dev
 * dependencies, so `npm run seed` (which needs `tsx`) cannot run there. This
 * script is plain compiled JavaScript and only uses runtime dependencies, so
 * it works inside the container:
 *
 *   docker compose exec server node dist/scripts/createAdmin.js \
 *     --email you@college.edu --name "Your Name" --password "a-strong-pass"
 *
 * Values may also come from ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD.
 *
 * Running it against an email that already exists promotes that account to
 * ADMIN and resets its password, which is the supported way to recover from a
 * lost admin login.
 * ---------------------------------------------------------------------------
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Constructed lazily inside main(), after the arguments have been validated.
// A usage mistake should print help and exit without needing a database
// connection or a generated Prisma Client.
let prisma: PrismaClient | null = null;
const db = (): PrismaClient => (prisma ??= new PrismaClient());

/** Passwords that ship in the dev seed. Refused here on purpose. */
const FORBIDDEN_PASSWORDS = new Set(['Password123', 'Admin@12345', 'password123']);

interface Args {
  email: string;
  name: string;
  password: string;
}

function usage(message?: string): never {
  if (message) console.error(`\n[create-admin] ${message}\n`);
  console.error(`
Usage:
  node dist/scripts/createAdmin.js --email <email> --name <name> --password <password>

Or set environment variables and pass no arguments:
  ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... node dist/scripts/createAdmin.js
`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const values: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const eq = token.indexOf('=');
    if (eq !== -1) {
      values[token.slice(2, eq)] = token.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) usage(`${token} needs a value`);
      values[token.slice(2)] = next;
      i += 1;
    }
  }

  const email = (values.email ?? process.env.ADMIN_EMAIL ?? '').trim();
  const name = (values.name ?? process.env.ADMIN_NAME ?? '').trim();
  const password = values.password ?? process.env.ADMIN_PASSWORD ?? '';

  if (!email && !name && !password) usage('no arguments given');
  if (!email) usage('--email is required');
  if (!name) usage('--name is required');
  if (!password) usage('--password is required');

  // Deliberately permissive on shape but strict on real mistakes.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) usage(`"${email}" is not a valid email address`);
  if (name.length < 2) usage('--name must be at least 2 characters');
  // Checked before the length rule so the message names the actual problem:
  // every demo password is shorter than 12 characters, so the reverse order
  // would make this check unreachable.
  if (FORBIDDEN_PASSWORDS.has(password)) {
    usage('that is a known development demo password - choose your own');
  }
  if (password.length < 12) usage('--password must be at least 12 characters');

  return { email: email.toLowerCase(), name, password };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const passwordHash = await bcrypt.hash(args.password, 12);

  const existing = await db().user.findUnique({ where: { email: args.email } });

  const user = existing
    ? await db().user.update({
        where: { email: args.email },
        data: {
          name: args.name,
          passwordHash,
          role: 'ADMIN',
          // Reactivating matters: the usual recovery path is "the account was
          // deactivated", and promoting it should also un-deactivate it.
          isActive: true,
        },
      })
    : await db().user.create({
        data: {
          email: args.email,
          name: args.name,
          passwordHash,
          role: 'ADMIN',
          isActive: true,
        },
      });

  console.log(`\n[create-admin] ${existing ? 'updated' : 'created'} admin account`);
  console.log(`  email  ${user.email}`);
  console.log(`  name   ${user.name}`);
  console.log(`  role   ${user.role}`);
  console.log('\n  Sign in and change nothing else - the password is not stored in plain text.\n');
}

main()
  .catch((error: unknown) => {
    console.error('[create-admin] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
