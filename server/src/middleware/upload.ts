import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';

/**
 * ---------------------------------------------------------------------------
 * Secure file uploads
//
// Defence in depth, because an upload endpoint is one of the riskiest things
 * to expose:
 *
 *  1. Extension allow-list  - the stored extension must be on the list.
 *  2. MIME allow-list       - the client-declared type must match the category
 *                             of the extension (defeats `evil.php` renamed to
 *                             `evil.pdf` with a forged type).
 *  3. Magic-byte sniffing   - the real file signature must be consistent with
 *                             the extension. This is the strongest check.
 *  4. Size limit            - enforced by multer.
 *  5. Safe naming           - the original filename is never used on disk; a
 *                             random UUID plus a sanitised extension is.
 *  6. Private storage       - files are served through an authenticated
 *                             route, never as a public static directory.
 * ---------------------------------------------------------------------------
 */

export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_MIME_TYPES);

/** File signature (magic bytes) -> extensions it legitimately belongs to. */
const MAGIC_SIGNATURES: Array<{ label: string; bytes: number[]; exts: string[] }> = [
  { label: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46], exts: ['.pdf'] }, // %PDF
  { label: 'ZIP container (docx/pptx/xlsx/zip)', bytes: [0x50, 0x4b, 0x03, 0x04], exts: ['.zip', '.docx', '.pptx'] },
  { label: 'ZIP container (legacy)', bytes: [0x50, 0x4b, 0x05, 0x06], exts: ['.zip', '.docx', '.pptx'] },
  { label: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47], exts: ['.png'] },
  { label: 'JPEG', bytes: [0xff, 0xd8, 0xff], exts: ['.jpg', '.jpeg'] },
  // Compound Document File Binary: legacy .doc and .ppt
  { label: 'Legacy MS Office', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], exts: ['.doc', '.ppt'] },
];

function sniffExtension(header: Buffer): string[] | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.bytes.every((byte, index) => header[index] === byte)) return sig.exts;
  }
  return null;
}

/** Strips directory components and anything dangerous from a display name. */
export function sanitizeDisplayName(original: string): string {
  const base = path.basename(original).replace(/[\\/]/g, '');
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, '').replace(/^\.+/, '').trim();
  return (cleaned || 'upload').slice(0, 120);
}

export function getExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export function buildSafeStoredName(original: string): string {
  const ext = getExtension(original);
  const id = crypto.randomUUID();
  return `${Date.now()}-${id}${ALLOWED_EXTENSIONS.includes(ext) ? ext : '.bin'}`;
}

export function ensureUploadDirs(): void {
  for (const dir of [
    env.paths.uploads,
    path.join(env.paths.uploads, 'attachments'),
    path.join(env.paths.uploads, 'submissions'),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Rejects an upload whose real content does not match its extension. */
function verifyMagicBytes(file: Express.Multer.File): void {
  const handle = fs.openSync(file.path, 'r');
  try {
    const header = Buffer.alloc(8);
    const bytesRead = fs.readSync(handle, header, 0, 8, 0);
    if (bytesRead === 0) throw badRequest('The uploaded file is empty');
    const ext = getExtension(file.originalname);
    const sniffed = sniffExtension(header.subarray(0, bytesRead));
    if (!sniffed || !sniffed.includes(ext)) {
      throw badRequest(
        'The contents of the file do not match its extension. The upload was rejected.',
      );
    }
  } finally {
    fs.closeSync(handle);
  }
}

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const ext = getExtension(file.originalname);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    cb(
      badRequest(
        `File type "${ext || 'unknown'}" is not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      ),
    );
    return;
  }

  const allowedMimes = ALLOWED_MIME_TYPES[ext] ?? [];
  if (allowedMimes.length > 0 && !allowedMimes.includes(file.mimetype)) {
    cb(badRequest(`The file's content type (${file.mimetype}) does not match the "${ext}" extension`));
    return;
  }

  cb(null, true);
}

/**
 * Builds an upload middleware for the given field names, all sharing one
 * destination folder.
 *
 * A dedicated multer instance is created per folder rather than mutating a
 * shared one, so the destination is a closed-over constant. This is both
 * thread-safe and far easier to reason about.
 *
 * Usage: `uploads('attachments', ['questionFile', 'answerFile'])`
 */
function uploads(folder: 'attachments' | 'submissions', fields: string[]) {
  const destinationDir = path.join(env.paths.uploads, folder);

  const instance = multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        ensureUploadDirs();
        cb(null, destinationDir);
      },
      filename(_req, file, cb) {
        // The original filename is never trusted or reused verbatim.
        cb(null, buildSafeStoredName(file.originalname));
      },
    }),
    fileFilter,
    limits: {
      fileSize: env.maxFileSizeBytes,
      // One file per expected field name, and no extras.
      files: fields.length,
      // Headroom above the files for the accompanying text fields.
      parts: fields.length + 20,
    },
  });

  // Declaring the expected field names means a file under an unexpected name
  // is a LIMIT_UNEXPECTED_FILE error rather than being silently dropped.
  const handler = instance.fields(fields.map((name) => ({ name, maxCount: 1 })));

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (err) return next(err);
      const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      try {
        // Every uploaded file is magic-byte checked before it reaches a handler.
        for (const name of fields) {
          for (const file of files[name] ?? []) verifyMagicBytes(file);
        }
      } catch (verificationError) {
        // Remove the rejected files from disk before surfacing the error.
        for (const name of fields) {
          for (const file of files[name] ?? []) {
            void fs.promises.unlink(file.path).catch(() => undefined);
          }
        }
        return next(verificationError);
      }
      return next();
    });
  };
}

/** Two optional attachments: the question and the answer. */
export const resourceUpload = uploads('attachments', ['questionFile', 'answerFile']);

/**
 * Deletes a stored file, tolerating a missing path. Searches every upload
 * folder so it works regardless of which one the file landed in.
 */
export async function removeStoredFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  try {
    const absolute = resolveUploadPath(relativePath);
    await fs.promises.unlink(absolute).catch(() => undefined);
  } catch {
    // An invalid path is simply ignored; there is nothing safe to delete.
  }
}

/**
 * Resolves a stored filename to an absolute path on disk.
 *
 * Stored files live in the `uploads/` root and in the `assignments/` and
 * `submissions/` sub-folders, so all three are searched. `path.basename` is
 * applied first, which makes any traversal attempt (`../../.env`, absolute
 * paths, mixed separators) collapse to a bare filename before it can escape
 * the uploads directory.
 */
export function resolveUploadPath(relativePath: string): string {
  const base = path.basename(relativePath);
  if (!base || base === '.' || base === '..') {
    throw badRequest('Invalid file path');
  }

  const root = path.resolve(env.paths.uploads);
  const candidates = [
    path.join(root, base),
    path.join(root, 'attachments', base),
    path.join(root, 'submissions', base),
  ];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    // Defence in depth: confirm the resolved path really is under uploads/.
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw badRequest('Invalid file path');
    }
    if (fs.existsSync(resolved)) return resolved;
  }

  // Nothing matched. Return the canonical location so the caller reports 404.
  return path.join(root, 'attachments', base);
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
