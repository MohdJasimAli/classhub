import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { AUTH_COOKIE, authCookieOptions, signAccessToken } from '../utils/jwt.js';
import { conflict, forbidden, unauthorized, badRequest } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';
import { currentUser } from '../middleware/auth.js';
import type {
  ChangePasswordInput,
  CreateStudentInput,
  LoginInput,
  RegisterInput,
} from '../validators/auth.validator.js';

const BCRYPT_ROUNDS = 12;

/** Never leak the password hash. */
export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  studentCode?: string | null;
  createdAt?: Date;
  lastLoginAt?: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    studentCode: user.studentCode ?? null,
    createdAt: user.createdAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

function issueSession(res: Response, user: { id: string; email: string; name: string; role: 'ADMIN' | 'STUDENT' }) {
  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  res.cookie(AUTH_COOKIE, token, authCookieOptions);
  return token;
}

/**
 * The standard projection. Deliberately excludes `passwordHash` so that a
 * controller cannot leak a hash by spreading this object into a response.
 */
const authSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  studentCode: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

/** Opt-in projection for the two flows that must read the hash. */
const authSelectWithHash = { ...authSelect, passwordHash: true } as const;

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({ where: { email }, select: authSelectWithHash });

  // Uniform error for "no such user" and "wrong password" so the endpoint
  // cannot be used to enumerate which email addresses have accounts.
  const invalid = unauthorized('Incorrect email or password');
  if (!user) {
    // Burn a comparable amount of time to keep the response time constant.
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu');
    throw invalid;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw invalid;

  if (!user.isActive) {
    throw forbidden('This account has been deactivated. Please contact your administrator.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = issueSession(res, user);
  return sendSuccess(
    res,
    { user: publicUser(user), token },
    200,
    `Welcome back, ${user.name}`,
  );
}

// ---------------------------------------------------------------------------
// POST /api/auth/register  (public self-registration for students only)
// ---------------------------------------------------------------------------
export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body as RegisterInput;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict('An account with this email already exists');

  // The role is hard-coded. There is deliberately no way to self-register as
  // an admin through the public API.
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: 'STUDENT',
      isActive: true,
    },
    select: authSelect,
  });

  const token = issueSession(res, user);
  return sendSuccess(res, { user: publicUser(user), token }, 201, 'Account created successfully');
}

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
export async function me(req: Request, res: Response) {
  const auth = currentUser(req);
  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: authSelect });
  if (!user) throw unauthorized('Your account no longer exists');
  return sendSuccess(res, { user: publicUser(user) });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
export async function logout(_req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions, maxAge: undefined });
  return sendSuccess(res, null, 200, 'Signed out');
}

// ---------------------------------------------------------------------------
// PUT /api/auth/password  (any signed-in user)
// ---------------------------------------------------------------------------
export async function changePassword(req: Request, res: Response) {
  const auth = currentUser(req);
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: authSelectWithHash });
  if (!user) throw unauthorized();

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw badRequest('Your current password is incorrect');

  await prisma.user.update({
    where: { id: auth.id },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
  });

  return sendSuccess(res, null, 200, 'Password updated');
}

// ---------------------------------------------------------------------------
// PUT /api/auth/profile
// ---------------------------------------------------------------------------
export async function updateProfile(req: Request, res: Response) {
  const auth = currentUser(req);
  const name = (req.body as { name?: string }).name;
  if (!name) throw badRequest('A name is required');

  const user = await prisma.user.update({
    where: { id: auth.id },
    data: { name },
    select: authSelect,
  });
  return sendSuccess(res, { user: publicUser(user) }, 200, 'Profile updated');
}

// ---------------------------------------------------------------------------
// POST /api/auth/students  (admin) - create a student
// ---------------------------------------------------------------------------
export async function createStudent(req: Request, res: Response) {
  const admin = currentUser(req);
  const { name, email, password, studentCode } = req.body as CreateStudentInput;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict('A user with this email already exists');

  if (studentCode) {
    const clash = await prisma.user.findUnique({ where: { studentCode }, select: { id: true } });
    if (clash) throw conflict('This student code is already in use');
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: 'STUDENT',
      isActive: true,
      studentCode: studentCode ?? null,
    },
    select: authSelect,
  });

  return sendSuccess(
    res,
    { student: publicUser(user), createdBy: admin.id },
    201,
    'Student created',
  );
}
