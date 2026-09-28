import express, {
  type Application,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { ensureUploadDirs } from './middleware/upload.js';
import { hasBuiltClient, serveClient } from './middleware/staticClient.js';
import authRoutes from './routes/auth.routes.js';
import resourceRoutes, { filesRouter } from './routes/resource.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import adminRoutes from './routes/admin.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';

export function createApp(): Application {
  const app = express();

  // Required for correct `req.ip` (and therefore rate limiting) behind a proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // -------------------------------------------------------------------------
  // Security headers
  // -------------------------------------------------------------------------
  // Two policies, because the API and the SPA have genuinely different needs.
  //
  // The API only ever returns JSON and file downloads, never HTML, so it can
  // lock everything down. The SPA is HTML, so it must be allowed to load its
  // own same-origin scripts and styles. Both remain strict: the SPA policy
  // allows 'self' and nothing else - no CDN, no third-party origin, no inline
  // script - so even a successful XSS has nowhere to exfiltrate to.
  const isApiOnly = !hasBuiltClient();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...(isApiOnly
            ? {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'none'"],
                formAction: ["'none'"],
              }
            : {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind injects a style tag
                imgSrc: ["'self'", 'data:'],
                fontSrc: ["'self'"],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
              }),
          // Helmet enables this by default. It is switched off deliberately:
          // it rewrites every http:// subresource request to https://, so on a
          // plain-HTTP deployment (the local Docker setup on http://localhost:8080)
          // it would point the browser at a TLS port that is not serving TLS
          // and every asset would fail to load. Render already terminates TLS
          // and redirects to https, so the directive buys nothing there.
          upgradeInsecureRequests: null,
        },
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // -------------------------------------------------------------------------
  // CORS - restricted to the configured client origin(s).
  // -------------------------------------------------------------------------
  const allowedOrigins = new Set(
    env.CLIENT_URL.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  // In development the Vite dev server may run on a neighbouring port.
  if (!env.isProd) allowedOrigins.add('http://localhost:5173').add('http://127.0.0.1:5173');

  /**
   * Decides whether a request's Origin header is acceptable.
   *
   * A request whose Origin host equals the Host it was sent to is *same-origin*
   * by definition, so CORS does not apply to it and there is no reason to
   * reject it. Allowing it explicitly is not a loosening of policy - it removes
   * a failure mode instead.
   *
   * That matters in production, where the app serves both the API and the web
   * page from one host. If CLIENT_URL were missing or stale, the allowlist
   * would reject the app's own requests and every login would fail with an
   * opaque "not allowed by CORS" in the log, with no hint that the cause was a
   * missing environment variable. CLIENT_URL is still needed for the links in
   * reminder emails, but a mistake in it can no longer lock anyone out of the
   * app they are already using.
   */
  const isSameOrigin = (req: Request, origin: string): boolean => {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };

  // cors() is invoked per request rather than mounted once, because the
  // same-origin check needs the request's Host header, which the static
  // `origin` option does not receive.
  const corsMiddleware = cors({
    origin(origin, callback) {
      // Same-origin/non-browser requests (curl, server-to-server) have no
      // Origin header and are allowed.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true, // required for the httpOnly auth cookie
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    // A same-origin request needs no CORS permission at all. Skipping the
    // check here means a stale CLIENT_URL cannot break the app serving itself.
    if (origin && isSameOrigin(req, origin) && !allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      return next();
    }
    return corsMiddleware(req, res, next);
  });

  // -------------------------------------------------------------------------
  // Body parsing
  // -------------------------------------------------------------------------
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (!env.isTest) {
    app.use(morgan(env.isProd ? 'combined' : 'dev'));
  }

  // Uploads are written to disk; make sure the directories exist before any
  // request is served.
  ensureUploadDirs();

  // Global rate limit, then the stricter per-route auth limit.
  app.use('/api', generalLimiter);

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        environment: env.NODE_ENV,
        emailMode: env.emailEnabled ? 'smtp' : 'capture',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------
  app.use('/api/auth', authRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/files', filesRouter);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  // Serve the built web app from the same origin. Registered after the API
  // routes and before the 404 handler, so /api/* keeps returning JSON errors
  // while client-side routes like /admin/resources resolve to the SPA shell.
  serveClient(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
