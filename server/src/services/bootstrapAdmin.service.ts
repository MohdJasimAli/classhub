import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

/**
 * ---------------------------------------------------------------------------
 * First-run administrator bootstrap
 * ---------------------------------------------------------------------------
 * Why this exists: creating the first admin is normally done with
 *
 *   docker compose exec server node dist/scripts/createAdmin.js ...
 *
 * but that needs a shell inside the running container, and Render's Shell tab
 * is a paid feature. On the free tier there is no way to execute a command
 * against a live service, so a fresh deployment would have no way to obtain an
 * administrator at all.
 *
 * This closes that gap: when ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD
 * are set in the environment and the database contains NO administrator, the
 * account is created on boot and the fact is written to the log.
 *
 * Safety properties, each deliberate:
 *
 *   * It only ever runs when there are zero ADMIN accounts. Once one exists the
 *     variables are ignored, so a redeploy cannot resurrect or reset an admin.
 *   * It cannot be triggered by a visitor. Registration stays open to anyone,
 *     but that only ever creates STUDENT accounts.
 *   * The password is validated with the same rules as the interactive script,
 *     so a weak or known demo password is refused rather than silently applied.
 *
 * After the first successful boot the operator should delete both variables and
 * redeploy, so the credentials are not sitting in the environment forever.
 * ---------------------------------------------------------------------------
 */

/** Kept in step with scripts/createAdmin.ts. */
const FORBIDDEN_PASSWORDS = new Set(['Password123', 'Admin@12345', 'password123']);
const MIN_PASSWORD_LENGTH = 12;

export interface BootstrapResult {
  created: boolean;
  reason: string;
  email?: string;
}

export async function ensureBootstrapAdmin(): Promise<BootstrapResult> {
  const email = (env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  const name = (env.ADMIN_BOOTSTRAP_NAME ?? 'Administrator').trim();

  if (!email || !password) {
    return { created: false, reason: 'not configured' };
  }

  // Never override or resurrect an existing administrator.
  const existingAdmins = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (existingAdmins > 0) {
    return { created: false, reason: 'an admin already exists' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { created: false, reason: `ADMIN_BOOTSTRAP_EMAIL "${email}" is not a valid email` };
  }
  if (FORBIDDEN_PASSWORDS.has(password)) {
    return { created: false, reason: 'refusing a known development demo password' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      created: false,
      reason: `ADMIN_BOOTSTRAP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // upsert rather than create: the email may already exist as a student who
  // signed up before the bootstrap was configured.
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: 'ADMIN', isActive: true },
    create: { email, name, passwordHash, role: 'ADMIN', isActive: true },
  });

  return { created: true, reason: 'created', email: user.email };
}

/** Called once during startup. Never throws - a bad value must not stop boot. */
export async function runBootstrapAdmin(): Promise<void> {
  try {
    const result = await ensureBootstrapAdmin();
    if (result.created) {
      console.log(
        `[bootstrap] created the first admin account: ${result.email}\n` +
          '[bootstrap] delete ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD now, then redeploy.',
      );
    } else if (result.reason === 'not configured') {
      // Normal on every deploy after the first; not worth logging.
    } else {
      console.log(`[bootstrap] skipped: ${result.reason}`);
    }
  } catch (error) {
    console.error('[bootstrap] failed:', error instanceof Error ? error.message : error);
  }
}
