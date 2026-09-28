# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# ClassHub - single image, single origin
#
# ONE container serves both the API and the built React app, because the auth
# cookie is `sameSite: 'lax'`. On a platform that gives each service its own
# *.onrender.com domain, hosting the SPA and the API separately makes them
# cross-site, the browser refuses to send the cookie, and every student is
# bounced back to the login page. One origin is the only arrangement that
# works without weakening the cookie to `sameSite: 'none'`.
#
# This also keeps the app to one service, which matters on a free tier that
# meters instance hours per service.
#
# The build context is the REPOSITORY ROOT, not ./server: this is an npm
# workspaces monorepo with a single package-lock.json at the root, so a
# context of ./server would have no lockfile and `npm ci` would fail.
# ---------------------------------------------------------------------------

# ---- Stage 1: install build-time dependencies ------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# The lockfile plus BOTH workspace manifests. npm refuses to run `ci` unless
# every workspace referenced by the lockfile is present in the context.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci

# ---- Stage 2: build the web app -------------------------------------------
FROM node:20-alpine AS client-build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY client/package.json ./client/
COPY client/tsconfig.json ./client/
COPY client/tsconfig.node.json ./client/
COPY client/vite.config.ts ./client/
COPY client/tailwind.config.js ./client/
COPY client/postcss.config.js ./client/
COPY client/index.html ./client/
COPY client/src ./client/src

# Same-origin, so the API base stays a relative path.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# NOTE: client/.env is excluded by .dockerignore, so this ARG - not the local
# development .env - is what the image is built with.
WORKDIR /app/client
RUN npm run build

# ---- Stage 3: compile the API ----------------------------------------------
FROM node:20-alpine AS server-build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json ./server/
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY prisma ./prisma

WORKDIR /app/server
RUN npm run build

# Prisma Client is generated here, where the `prisma` devDependency exists,
# then copied into the runtime stage. Generating it in the runner would mean
# shipping the whole TypeScript toolchain.
RUN npx prisma generate --schema=/app/prisma/schema.prisma

# ---- Stage 4: production dependencies --------------------------------------
FROM node:20-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci --omit=dev --workspace server --include-workspace-root \
    && npm cache clean --force

# The Prisma CLI is a root devDependency, so `--omit=dev` above removed it.
# Schema migrations run on every container start (see docker-entrypoint.sh),
# so the CLI has to exist at runtime. Installed explicitly, pinned to the same
# major as @prisma/client, and deliberately not saved to any manifest.
ARG PRISMA_VERSION=6.19.3
RUN npm install --no-save --omit=dev "prisma@${PRISMA_VERSION}" \
    && npm cache clean --force

# ---- Stage 5: runtime ------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# PORT is supplied by the platform at runtime (Render sets it). Defaulting
# here keeps `docker run` working without extra arguments.
ENV NODE_ENV=production \
    PORT=10000 \
    UPLOAD_DIR=/app/uploads

# curl backs the healthcheck.
RUN apk add --no-cache curl

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/dist ./client/dist
COPY package.json ./package.json
COPY server/package.json ./server/package.json
COPY prisma ./prisma
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh

# Uploads are written to disk at runtime, so the unprivileged `node` user
# (uid 1000) must own the directory. On a platform with a persistent disk
# mount, the mount must be chowned to match - see RENDER.md.
RUN chmod +x ./docker-entrypoint.sh \
    && mkdir -p /app/uploads \
    && chown -R node:node /app/uploads

USER node
WORKDIR /app/server

EXPOSE 10000

# Unhealthy if the process is up but the API stops answering. The path is the
# API health endpoint, not "/", so a broken API is caught even if the static
# shell still serves.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://localhost:${PORT:-10000}/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
