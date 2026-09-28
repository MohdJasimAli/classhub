# ClassHub — Revision Material Portal

A full-stack web application for a college class. A teacher publishes revision
material; students read it.

Each piece of material — a **quiz** or an **assignment** — carries three things:

- the **question** (typed in the browser and/or attached as a file)
- the **answer** (model answers, typed and/or attached)
- a **last date**

Students open any published item and read the question alongside the answer, and
they are emailed (and notified in-app) **24 hours before the last date**.

> Students never take a test, never submit work, and are never graded. This is a
> revision-material portal, not an assessment system.

---

## Table of contents

- [Technology stack](#technology-stack)
- [Quick start](#quick-start)
- [Deploying with Docker](#deploying-with-docker)
- [Demo credentials](#demo-credentials)
- [How it works](#how-it-works)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [The last-date reminder system](#the-last-date-reminder-system)
- [Email system](#email-system)
- [API reference](#api-reference)
- [Security](#security)
- [Testing](#testing)
- [Design notes](#design-notes)
- [Troubleshooting](#troubleshooting)

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 · Vite 8 · TypeScript · Tailwind CSS 3 |
| State / data | TanStack Query 5 · React Router 7 |
| Backend | Node.js · Express 4 · TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Authentication | JWT (httpOnly cookie **and** bearer token) · bcrypt (cost 12) |
| Validation | Zod |
| File uploads | Multer 2 |
| Email | Nodemailer 10 |
| Scheduling | node-cron 4 |
| Testing | Vitest 5 · Supertest |

Frontend and backend are fully separated. The SPA talks to the API over REST only;
it never touches the database.

---

## Quick start

### Prerequisites

- Node.js 20 or newer
- PostgreSQL 14 or newer running locally (or use `docker compose up db`)
- npm 10 or newer

### 1. Install

```bash
cd E:\Project\CODE\BuddyWork
npm install
```

An npm workspace, so one install at the root covers `server/` and `client/`.

### 2. Create the database

```sql
CREATE DATABASE classhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Configure

```bash
copy .env.example server\.env      # Windows
cp .env.example server/.env        # macOS / Linux
```

At minimum set `DATABASE_URL` and `JWT_SECRET`:

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/classhub"
JWT_SECRET="a-long-random-string-at-least-16-characters"
```

> The server validates the whole environment on boot and **refuses to start** on an
> incomplete configuration rather than failing silently later.

### 4. Create the schema

```bash
npm run prisma:migrate     # development
npm run prisma:deploy      # deploy / CI
```

### 5. Load demo data (recommended)

```bash
npm run seed
```

### 6. Run

```bash
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:5000>
- Health: <http://localhost:5000/api/health>

Vite proxies `/api` to the backend, so the SPA and API share an origin and the
auth cookie is sent automatically.

---

## Deploying with Docker

For running the app permanently, or on a server, use Docker. Three containers
come up: PostgreSQL, the API, and nginx serving the web app while proxying `/api`
to the API. Only nginx is exposed to the network.

```bash
copy .env.docker.example .env     # Windows
# cp .env.docker.example .env     # Linux / macOS
$EDITOR .env                      # set POSTGRES_PASSWORD, JWT_SECRET, CLIENT_URL

docker compose up -d --build
```

Then create the first admin account (a fresh install has no users at all):

```bash
docker compose exec server node dist/scripts/createAdmin.js \
  --email "you@college.edu" --name "Your Name" --password "a-password-of-at-least-12-characters"
```

Open <http://localhost>.

**[DEPLOY.md](DEPLOY.md) is the full walkthrough** — written for someone new to
Docker, and covering backups, real email, HTTPS and troubleshooting.

---

## Demo credentials

> **Development only.** Deliberately weak so they are easy to type while testing.
> Never reuse them in a deployed environment, and never run `npm run seed`
> against a real database — it wipes resources and creates these accounts.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@classhub.edu` | `Admin@12345` |
| Student | `jasim@student.classhub.edu` | `Password123` |
| Student | `priya@student.classhub.edu` | `Password123` |
| Student | `daniel@student.classhub.edu` | `Password123` |
| Student | `mei@student.classhub.edu` | `Password123` |
| Student | `lucas@student.classhub.edu` | `Password123` |

These are intentionally **not** shown on the login page. A deployed
installation provisions its admin explicitly instead:

```bash
docker compose exec server node dist/scripts/createAdmin.js \
  --email "you@college.edu" --name "Your Name" --password "a-password-of-at-least-12-characters"
```

`createAdmin` refuses the demo passwords, requires at least 12 characters, and
re-running it for an existing email resets that account's password — which is
the supported way to recover a lost admin login.

The seed creates two published items (a quiz and an assignment), each with a
question, a model answer and a last date, plus one draft so the admin UI has an
unpublished example.

---

## How it works

### Admin

1. **Material → New resource**
2. Pick the type: *Quiz* or *Assignment*
3. Enter the **question** — typed text, an attached file, or both
4. Enter the **answer** — typed text, an attached file, or both
5. Set the **last date**
6. Optionally **publish immediately** — students are notified the moment it is saved

Publishing is reversible. An unpublished item is invisible to students and is
returned as `404` (not `403`), so a student cannot probe for drafts.

### Student

1. Sign in and land on the dashboard
2. See what is open now, and every last date approaching
3. Open an item: the **question is on the left, the answer on the right**, so
   self-assessment is a scroll rather than a navigation
4. Download either file if one is attached
5. Receive a notification when something is published, and again 24 hours before
   the last date

Accepted file types: PDF, DOC, DOCX, PPT, PPTX, ZIP, JPG, PNG. Maximum 10 MB
(configurable via `MAX_FILE_SIZE_MB`).

---

## Environment variables

All configuration lives in environment variables; no secret is hardcoded. See
`.env.example` for the annotated template.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string used by Prisma |
| `JWT_SECRET` | yes | Token signing secret, min. 16 characters |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `7d` |
| `PORT` | no | API port, default `5000` |
| `CLIENT_URL` | yes | Public URL of the SPA; CORS and email deep links |
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `EMAIL_HOST` | no | SMTP host. **Leave empty for capture mode** |
| `EMAIL_PORT` | no | SMTP port, default `587` |
| `EMAIL_SECURE` | no | `true` for implicit TLS (port 465) |
| `EMAIL_USER` | no | SMTP username |
| `EMAIL_PASSWORD` | no | SMTP password |
| `EMAIL_FROM` | no | From header |
| `UPLOAD_DIR` | no | Upload directory, default `uploads` |
| `MAX_FILE_SIZE_MB` | no | Upload size limit, default `10` |
| `RATE_LIMIT_WINDOW_MINUTES` | no | Rate limit window, default `15` |
| `AUTH_RATE_LIMIT_MAX` | no | Failed logins per window, default `20` |
| `REMINDER_CRON` | no | Sweep schedule, default `*/10 * * * *` |
| `REMINDER_LEAD_HOURS` | no | How far ahead to warn, default `24` |
| `REMINDER_TOLERANCE_MINUTES` | no | Window tolerance, default `30` |
| `DATABASE_TEST_URL` | no | Throwaway schema for the test suite |

### Under Docker

`docker-compose.yml` sets the variables above from `.env`, and adds these that
only matter in a container:

| Variable | Default | Description |
| --- | --- | --- |
| `WEB_PORT` | `80` | Host port the site is published on |
| `POSTGRES_PASSWORD` | — | Required. Database password, set in `.env` |
| `POSTGRES_DB` | `classhub` | Database created on first boot |
| `REMINDER_TZ` | `UTC` | Timezone the cron sweep is interpreted in |

Inside the containers the API always listens on port 5000 and reads its whole
configuration from the environment — **no `.env` file is baked into the
image**. Values are validated at startup and the process refuses to start if
any are missing, so a misconfigured deploy fails loudly instead of running
half-working.

### Email capture mode

If `EMAIL_HOST` and `EMAIL_USER` are empty the server runs in **capture mode**:
messages are fully rendered, printed to `server/debug.log`, and persisted to the
`EmailLog` table, but nothing is sent over the network. Local development and the
entire test suite therefore work with no credentials, and the *same* code path
performs real delivery once SMTP is configured.

---

## Project structure

```
BuddyWork/
├── package.json                 npm workspace root
├── package-lock.json            the single lockfile for BOTH workspaces
├── .env.example                 annotated environment template
├── docker-compose.yml           PostgreSQL + API + nginx
├── .dockerignore                keeps the build context small and secrets out
├── .env.docker.example          template for the deployed environment
├── DEPLOY.md                    Docker walkthrough for first-time users
├── prisma/
│   ├── schema.prisma            data model
│   ├── migrations/              versioned SQL migrations
│   └── seed.ts                  development seed data
├── scripts/
│   ├── smoke-test.ps1           end-to-end API test (59 assertions)
│   └── verify-restart.ps1       reminder restart-safety check
├── server/
│   ├── Dockerfile               multi-stage: build -> production runtime
│   ├── docker-entrypoint.sh     applies migrations, then starts the API
│   └── src/
│       ├── config/              env validation, Prisma client
│       ├── controllers/         request handling
│       ├── routes/              route table + middleware composition
│       ├── middleware/          auth, RBAC, validation, uploads, rate limit, errors
│       ├── services/            email, reminders, notifications
│       ├── jobs/                node-cron scheduling
│       ├── scripts/             createAdmin.ts (admin provisioning)
│       ├── utils/               errors, responses, JWT, last-date engine
│       ├── validators/          Zod schemas
│       ├── app.ts               Express app factory
│       ├── index.ts             server entry point
│       └── tests/               Vitest + Supertest specs
└── client/
    ├── Dockerfile               builds the SPA, then serves it with nginx
    ├── nginx.conf               static hosting + /api reverse proxy
    └── src/
        ├── components/          shared UI (modals, cards, states, last-date badges)
        ├── layouts/             authenticated shell (sidebar + topbar)
        ├── pages/               student/** and admin/** screens
        ├── hooks/               auth, data hooks, countdown
        ├── services/            API client
        ├── types/               shared TypeScript types
        └── utils/               helpers, last-date presentation
```

> **Why do both Dockerfiles build from the repository root?** This is an npm
> workspaces monorepo with a single `package-lock.json` at the root and none in
> `server/` or `client/`. A build context of `./server` would have no lockfile
> and `npm ci` would fail immediately. The compose file therefore sets
> `context: .` with `dockerfile: server/Dockerfile`.

### Data model

| Model | Purpose |
| --- | --- |
| `User` | Admin and student accounts (soft-delete via `isActive`) |
| `Resource` | One row per quiz/assignment: question, answer and last date |
| `Notification` | In-app notification centre |
| `DeadlineReminder` | Reminder reservations — the idempotency barrier |
| `EmailLog` | Audit trail of every send attempt |

`Resource` uses a `type` discriminator rather than two separate tables: after
students stopped submitting, a quiz and an assignment became the same shape, so
one model with a discriminator is simpler and halves the controller surface while
keeping the quiz/assignment distinction visible in the UI and in the data.

---

## The last-date reminder system

The most important subsystem, so it is worth explaining in detail.

### Design: a catch-up sweep, not a timer

Rather than registering an in-memory timer per last date (lost on restart, lost
on redeploy), a scheduled job repeatedly asks the database one question:

> *Which published resources have a last date between `now + lead − tolerance`
> and `now + lead + tolerance`?*

Every active student is a recipient — there is nothing to submit, so nobody is
"missing" work.

### Duplicate prevention

Before sending, the sweep reserves a row in `DeadlineReminder` behind a
four-column unique constraint:

```prisma
@@unique([kind, targetId, userId, reminderFor])
```

The insert is attempted first and the email is only sent if it succeeds. A second
sweep, an overlapping process, or a retried request loses the race **at the
database level**, not in application logic. Losing racers are counted and logged
as `duplicatesPrevented`.

`reminderFor` is the last-date instant itself. This is deliberate: if an admin
moves a last date, the new instant is a different key, so a fresh reminder
becomes legitimate while the old one is not re-sent.

### Restart safety

The schedule is not held in memory. After a crash or redeploy the next sweep
re-derives all pending work from persisted state, and a sweep additionally runs
once at boot so anything that came due while the process was down is caught
immediately.

Verified two ways: automatically by the test *"resumes correctly after a simulated
server restart"*, and live by `scripts/verify-restart.ps1` (5 reminders before a
restart → 5 after, and a post-restart sweep creates nothing).

### Recipients get both channels

The in-app record feeds the notification centre (unread badge, deep link); the
email reaches students who are not logged in.

### Tuning

`REMINDER_CRON` and `REMINDER_LEAD_HOURS` control the schedule and lead time.
Because the sweep is idempotent and database-driven, the interval is a liveness
knob rather than a correctness one: running it more or less often can never
produce duplicates or lose a reminder.

An admin can also press **Run sweep** on the dashboard to trigger it on demand —
the same code path the cron job uses.

---

## Email system

`services/email/service.ts` exposes one typed sender, `sendDeadlineReminder`,
used by the reminder job. The template in `services/email/templates.ts` shares a
common `layout()` so branding, spacing and typography stay consistent; it is
table-based with inlined CSS, which is what Outlook and Gmail actually render
reliably.

Every attempt is recorded in `EmailLog` (success or failure), giving an audit
trail of exactly who was told what.

---

## API reference

All responses use one envelope:

```jsonc
// success
{ "success": true, "message": "...", "data": { }, "meta": { } }

// failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { } } }
```

Authentication accepts **either** an `Authorization: Bearer <token>` header **or**
the `classhub_token` httpOnly cookie, so browser clients and scripts both work.

### Auth

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/auth/login` | public (rate limited) |
| POST | `/api/auth/register` | public (rate limited) |
| GET | `/api/auth/me` | any user |
| POST | `/api/auth/logout` | any user |
| PUT | `/api/auth/password` | any user |
| PUT | `/api/auth/profile` | any user |
| POST | `/api/auth/students` | **admin** |

### Resources

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/api/resources` | any user (students see published only) |
| GET | `/api/resources/:id` | any user |
| POST | `/api/resources` | **admin** (multipart) |
| PUT | `/api/resources/:id` | **admin** (multipart) |
| DELETE | `/api/resources/:id` | **admin** |
| PATCH | `/api/resources/:id/publish` | **admin** (JSON) |

`POST` and `PUT` accept `multipart/form-data` with the text fields
`type`, `title`, `description`, `questionText`, `answerText`, `lastDate`,
`isPublished` and the optional files `questionFile` and `answerFile`. Booleans
arriving as multipart strings (`"true"`) are coerced.

### Files

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/api/files/:filename` | any signed-in user, authorised per file |

### Notifications

| Method | Endpoint |
| --- | --- |
| GET | `/api/notifications` |
| GET | `/api/notifications/unread-count` |
| PATCH | `/api/notifications/:id/read` |
| PATCH | `/api/notifications/:id/unread` |
| PATCH | `/api/notifications/read-all` |
| DELETE | `/api/notifications/:id` |

### Dashboard & admin

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/api/dashboard` | any user (role-shaped) |
| GET | `/api/admin/students` | **admin** |
| GET | `/api/admin/students/export` | **admin** (CSV) |
| GET | `/api/admin/students/:id` | **admin** |
| PUT | `/api/admin/students/:id` | **admin** |
| DELETE | `/api/admin/students/:id` | **admin** (soft by default, `?hard=true` to purge) |
| POST | `/api/admin/students/:id/reset-password` | **admin** |
| POST | `/api/admin/reminders/run` | **admin** (run the sweep now) |
| GET | `/api/admin/reminders` | **admin** |

### Status codes

`200` OK · `201` created · `400` bad request / failed upload check ·
`401` not authenticated · `403` forbidden (includes role denial) ·
`404` not found (also used to hide drafts) · `409` conflict · `413` upload too
large · `422` validation failed · `429` rate limited · `500` unexpected error

---

## Security

| Concern | How it is handled |
| --- | --- |
| Password storage | bcrypt cost 12. Hashes are never selected into a response |
| Login timing | A dummy bcrypt comparison runs when the email is unknown, and the error message is identical, so the endpoint cannot enumerate accounts |
| Token storage | Signed JWT in an httpOnly, SameSite=Lax cookie (Secure in production); bearer header also accepted for scripts |
| Token revocation | The user row is re-read on every authenticated request, so deactivating an account revokes access immediately rather than at token expiry |
| Role-based access | `requireRole` middleware; admin routes are additionally sealed with `router.use(requireAdmin)` so there is no per-route gap |
| Privilege escalation | Self-registration hard-codes the `STUDENT` role server-side; a client-supplied `role` is ignored |
| SQL injection | Prisma parameterises all queries; no string-built SQL anywhere |
| Input validation | Every body, query and path parameter is parsed by Zod and the parsed result replaces the raw input |
| Brute force | Rate limiting on `/api/auth/*` keyed by IP **and** submitted email, counting only failed attempts |
| File type | Extension allow-list, MIME/extension cross-check, **and magic-byte sniffing** of the real file signature |
| File size | Enforced by Multer; rejected files are deleted from disk |
| Filenames | The original name is never used on disk. A timestamp + UUID + sanitised extension is generated; the original is kept only as a display label |
| File access | Files live outside the web root and are served through an authenticated route that authorises the caller per file |
| Path traversal | `path.basename` collapses any traversal attempt before resolution, plus an explicit containment check |
| XSS / injection | The API serves JSON and binary downloads only, never HTML, under a strict `default-src 'none'` CSP |
| Secrets | All configuration from the environment; the server refuses to boot on an invalid config. `.env` is git-ignored |
| Error leakage | Stack traces only outside production; 5xx messages are generic |

**Reporting a vulnerability:** do not open a public issue. Contact the course
administrator directly.

---

## Testing

### Automated suite

```bash
npm test
```

74 tests across 4 files, run against a **separate** PostgreSQL database
(`classhub_test`) that is dropped and re-pushed on every run, so development data
is never touched.

| File | Covers |
| --- | --- |
| `auth.test.ts` | login, tokens, deactivation, RBAC, draft visibility |
| `resource.test.ts` | CRUD, question/answer requirements, file upload, file access control |
| `reminders.test.ts` | 24-hour reminders, duplicate prevention, last-date edits, **restart recovery** |
| `notifications.test.ts` | notification centre, ownership isolation, dashboards, student management, error handling |

### End-to-end smoke test

With the API running:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
```

59 assertions covering authentication, RBAC, resource creation with two files,
validation, upload rejection, the student reading view, file access control,
notifications, dashboards and the 24-hour reminder pipeline.

### Restart-safety check

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-restart.ps1
```

Creates a material due in exactly 24 hours, runs the sweep, restarts the API and
confirms the reminder count is unchanged and a further sweep is a no-op.

> This script stops only the process that owns port 5000. Restarting "all node
> processes" would take down the tooling that launched it.

### Other checks

```bash
npm run typecheck      # tsc across both workspaces
npm run lint           # eslint across both workspaces
npm run build          # server tsc build + client production bundle
npm run prisma:validate
npm run prisma:deploy  # apply migrations
```

---

## Design notes

### The last-date engine is the single source of truth

`server/src/utils/deadline.ts` holds every time-based rule. Controllers, the
reminder job and the dashboards all defer to it, so the client can never disagree
with the server about how much time is left. The colour thresholds live in
`client/src/utils/deadline.ts` and mirror the server exactly.

### Async error handling

Every async controller is wrapped in `asyncHandler`. Express 4 does not forward a
rejected promise to the error middleware, so without this a thrown `AppError`
would hang the request until the client timed out. Wrapping at the route boundary
guarantees a proper HTTP response.

### The countdown derives rather than stores

`useCountdown` computes the remaining time during render from a `now` value the
effect keeps fresh, instead of pushing the value into state from an effect body.
This avoids cascading renders and keeps the display consistent with the latest
tick. The granularity adapts (1 s under an hour, 30 s beyond) and re-syncs against
the wall clock each time, so background-tab throttling cannot cause drift.

### Soft-deleted students

`DELETE /api/admin/students/:id` deactivates by default so notification history
stays intact and auditable. Pass `?hard=true` to purge permanently. An active
account must be deactivated before it can be purged, so the destructive step is
never one click away.

### Drafts return 404, not 403

An unpublished resource is invisible to students, and the API answers `404`
rather than `403` so that a student cannot use status codes to discover which
drafts exist.

---

## Troubleshooting

**`Invalid environment configuration` on startup**
One or more required variables are missing or invalid; the message names each
field. Copy `.env.example` to `server/.env` and fill in `DATABASE_URL` and
`JWT_SECRET`.

**`JWT_SECRET must be at least 16 characters`**
Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

**`Can't reach database server`**
Confirm PostgreSQL is running and the credentials and database in `DATABASE_URL` are
correct. The schema must already exist; Prisma creates tables, not databases.

**`P1001: Can't reach database server` during tests**
`DATABASE_TEST_URL` (or the derived `classhub_test` schema) is unreachable. Create
it manually if the test user lacks the `CREATE` privilege.

**No reminder emails arriving**
Check the boot banner. If it says `CAPTURE mode`, SMTP is not configured — set
`EMAIL_HOST` and `EMAIL_USER`. To confirm the pipeline works regardless of
transport, open the admin dashboard and view the **Deadline reminders** log, or
query `EmailLog`.

**A reminder did not fire**
The sweep only considers **published** resources whose last date is inside
`[now + 24h − 30m, now + 24h + 30m]`. Verify the item is published and its last
date is in that window.

**Upload rejected with "contents of the file do not match its extension"**
The magic-byte check rejected the file. Some documents produced by unusual tools
have unexpected signatures; convert to a standard PDF and retry.

**Port already in use**
Change `PORT` in `server/.env` and `VITE_API_PROXY_TARGET` in `client/.env` to
match.

**Reset everything and start over**

```bash
npm run prisma:migrate -- --force-reset
npm run seed
```
