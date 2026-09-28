import path from 'node:path';
import fs from 'node:fs';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * ---------------------------------------------------------------------------
 * Serving the web app from the API process
 * ---------------------------------------------------------------------------
 * On a single-hosting platform (one container, one port) the Express server
 * also serves the built React app. That matters for more than tidiness:
 *
 *   The auth cookie is set `sameSite: 'lax'`, so a browser refuses to send it
 *   on a cross-site request. Hosting the SPA and the API on two different
 *   *.onrender.com domains makes them cross-site, and every student would be
 *   bounced back to the login page. One origin is the only arrangement that
 *   works without weakening the cookie to `sameSite: 'none'`.
 *
 * Everything is a no-op outside production, so `npm run dev` and the test suite
 * are unaffected: Vite serves the client there, not this module.
 */

const clientDist = path.resolve(env.paths.serverRoot, '..', 'client', 'dist');

export function hasBuiltClient(): boolean {
  return fs.existsSync(path.join(clientDist, 'index.html'));
}

/**
 * Installs static hosting for the built client.
 *
 * Mount order matters:
 *   1. /assets  - served from disk with long-lived cache headers
 *   2. /*        - SPA fallback, so a refresh on /admin/resources works
 *
 * This must be registered AFTER the API routes and BEFORE the 404 handler, so
 * that an unknown API path still returns JSON 404 rather than the HTML shell.
 */
export function serveClient(app: Application): void {
  if (!env.isProd || !hasBuiltClient()) return;

  app.use(
    '/assets',
    express.static(path.join(clientDist, 'assets'), {
      maxAge: '1y',
      immutable: true,
      // Hashed filenames, so a missing file is a real 404, not an SPA route.
      fallthrough: false,
    }),
  );

  // Files a student or admin downloads (question/answer uploads) live under
  // /files and are already served by the filesRouter; anything else at the
  // root that exists on disk is served here.
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));

  const indexHtml = path.join(clientDist, 'index.html');

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Never answer an API call with HTML. A client hitting a wrong API URL
    // should see a JSON error, not a page of markup that fails to parse.
    if (req.path.startsWith('/api/')) return next();

    // index.html must not be cached, or a deploy would keep serving the old
    // asset filenames to returning students.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });
}
