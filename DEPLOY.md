# Deploying ClassHub with Docker

This guide assumes you have **never used Docker before**. Every command is
written out in full, with what to expect when it works.

If you just want to run it locally on your own machine, keep using
`npm run dev` — Docker is only worth the setup when you want the app running
permanently, or on a server.

---

## 1. What Docker is, in 30 seconds

Docker packages an app together with everything it needs to run, so it starts
the same way on your laptop and on a server. A **container** is a running copy
of that package. A **volume** is storage that survives when the container is
deleted — your database and uploaded files live in volumes.

This project ships three containers:

| Container | Job | Reachable from the internet? |
|---|---|---|
| `db` | PostgreSQL 16, stores everything | **No** |
| `server` | The Express API | **No** |
| `client` | nginx: serves the web page and forwards API calls | **Yes** |

Only the `client` container is exposed to the outside world. The database and
the API stay on a private network that nothing else can reach. That is the
single most important security property of this setup, and it is already
handled for you.

---

## 2. Install Docker Desktop

1. Go to <https://www.docker.com/products/docker-desktop/>
2. Download the version for your system (Windows / Mac / Linux).
3. Install it and **start it**. On Windows and Mac you must log out and back
   in (or restart) before Docker works.
4. Open a terminal and check:

   ```powershell
   docker --version
   docker compose version
   ```

   Both should print a version number. If you see *"not recognised"*,
   Docker is not running or not on your PATH — restart your terminal.

> On a Linux server use Docker Engine plus the Compose plugin rather than
> Desktop. The commands are identical.

---

## 3. Configure the environment

The app reads its settings from environment variables. Docker Compose reads
them from a file called `.env` in the project root.

```powershell
copy .env.docker.example .env
notepad .env
```

You must change these four values:

| Variable | What to put |
|---|---|
| `POSTGRES_PASSWORD` | A long random password **you invent**. Example: `k7Qm2xR9vT4pL8nB6wZ3` |
| `JWT_SECRET` | A different long random string. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `CLIENT_URL` | The address students will type. Use `http://localhost` for now; change it to your real domain later. |
| `POSTGRES_DB` | `classhub` is fine. |

Leave `EMAIL_HOST` and `EMAIL_USER` **empty** for now. The app then runs in
*capture mode*: it renders every email, stores it in the database, and prints
it to the logs instead of sending it. Nothing breaks, and you can turn real
email on later without changing any code.

`.env` contains secrets. It is already listed in `.gitignore` — never commit it.

---

## 4. First run

From the project root (`E:\Project\CODE\BuddyWork`):

```powershell
docker compose up -d --build
```

The first run downloads Node, nginx and PostgreSQL and compiles both apps, so
expect **3–8 minutes**. Nothing appearing on screen for a while is normal.

Watch it happen with:

```powershell
docker compose logs -f
```

You are looking for three things:

```
==> applying database migrations
All migrations have been successfully applied.
==> starting ClassHub API
  ClassHub API
    environment : production
    listening   : http://localhost:5000
```

Press `Ctrl+C` to stop watching. That does **not** stop the app.

When it finishes in the background, open <http://localhost>.

---

## 5. Check it is actually working

```powershell
docker compose ps
```

Every row should say `Up` and none should say `unhealthy` or `restarting`.

```powershell
curl http://localhost/api/health
```

Expected:

```json
{ "data": { "status": "ok", "environment": "production", "emailMode": "capture" } }
```

If that returns JSON, the web tier, nginx, the API and the database are all
connected.

---

## 6. Create your admin account

A fresh install has **no users at all** — no admin, no students. Create the
admin first:

```powershell
docker compose exec server node dist/scripts/createAdmin.js --email "you@college.edu" --name "Your Name" --password "a-password-of-at-least-12-characters"
```

Sign in at <http://localhost> with those details.

Then create your students from **Admin → Students → Add student**. Do not run
`npm run seed` on a deployed server: it wipes resources and creates accounts
with publicly documented demo passwords.

**Lost the admin password?** Run the same command again with the same email.
It resets the password and re-promotes the account to admin.

---

## 7. Everyday commands

Run all of these from the project root.

```powershell
docker compose up -d          # start (no rebuild)
docker compose stop           # stop, keep everything
docker compose start          # start again
docker compose restart        # restart
docker compose down           # stop and remove containers (data is kept)
docker compose ps             # what is running
docker compose logs -f        # follow all logs
docker compose logs -f server # follow just the API
```

> `down` deletes containers but **not** your data, because the data lives in
> volumes. Adding `-v` (`docker compose down -v`) **deletes the database and
> every uploaded file.** Never type that unless you mean it.

---

## 8. Deploying an update

```powershell
git pull
docker compose up -d --build
```

That rebuilds the images, recreates the containers, and applies any new
migrations on startup. There is no separate migration step and no downtime
beyond the few seconds the containers take to restart.

Your `.env` and your volumes are untouched by this.

---

## 9. Backups — please read this one

Everything worth keeping is in two volumes: `db-data` (the database) and
`uploads-data` (uploaded question and answer files). If the disk dies and you
have no backup, the data is gone.

**Back up the database:**

```powershell
docker compose exec -T db pg_dump -U postgres -d classhub --clean --if-exists > backup.sql
```

**Restore it:**

```powershell
Get-Content backup.sql | docker compose exec -T db psql -U postgres -d classhub
```

`psql` is inside the database container, so these commands need no extra tools
installed on your machine.

**Back up uploaded files:**

```powershell
docker run --rm -v classhub_uploads-data:/data -v ${PWD}:/backup alpine tar czf /backup/uploads.tar.gz -C /data .
```

Put both on a schedule (Task Scheduler on Windows, cron on Linux) and copy them
somewhere off the machine. A backup on the same disk is not a backup.

---

## 10. Turning on real email

Reminder emails only get delivered once SMTP is configured. Until then they are
captured, not sent.

In `.env`:

```ini
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=you@gmail.com
EMAIL_PASSWORD=your-16-character-app-password
EMAIL_FROM=ClassHub <no-reply@yourdomain.com>
```

| Provider | Host | Port | `EMAIL_SECURE` |
|---|---|---|---|
| Gmail | `smtp.gmail.com` | 587 | `false` |
| Gmail (SSL) | `smtp.gmail.com` | 465 | `true` |
| Outlook / Office 365 | `smtp.office365.com` | 587 | `false` |
| SendGrid | `smtp.sendgrid.net` | 587 | `false` |

Gmail requires an **App Password**, not your account password: enable 2-Step
Verification, then Google Account → Security → App passwords.

Apply the change with `docker compose up -d` (the app reads its environment
once, at startup, so a plain `restart` is not enough).

Then confirm it worked:

```powershell
docker compose exec server node -e "console.log('check the dashboard Test email button')"
```

Or simply press **Test email** on the admin dashboard. If delivery fails the
reason is in `docker compose logs server`.

---

## 11. Putting it on a real domain with HTTPS

`http://localhost` is fine for testing, but a real deployment needs HTTPS —
without it, passwords travel in plain text.

The cleanest setup: let nginx handle the certificate, and set `WEB_PORT=8080`
in `.env` so the host's port 80 and 443 stay free for your reverse proxy or
load balancer.

`CLIENT_URL` must then be your public address, e.g.
`https://classhub.yourcollege.edu`, because reminder emails deep-link to it.
Change it before going live, or students will get broken links.

Also consider a `docker-compose.override.yml` for HTTPS via the
`nginx-proxy/acme-companion` images, or terminate TLS at your cloud provider
(most managed load balancers do this for you) and point it at port 8080.

---

## 12. Troubleshooting

### `POSTGRES_PASSWORD is not set` / `JWT_SECRET is not set`

You skipped step 3. Run `copy .env.docker.example .env` and fill it in.

### The API exits immediately with "Invalid environment configuration"

A required variable is missing or too short. The message names each one:

```powershell
docker compose logs server | Select-Object -Last 20
```

Note that the server refuses to start on bad configuration rather than
half-working, so a misconfigured deploy fails loudly. That is deliberate.

### `P3005: The database schema is not empty`

You pointed `DATABASE_URL` at a database that already has tables but was never
created by Prisma migrations. This is what happens if you reuse a development
database.

Fix it by pointing the containers at an **empty** database. Change
`POSTGRES_DB` in `.env` to a new name, then:

```powershell
docker compose down
docker compose up -d
```

### `@prisma/client did not initialize yet`

The generated Prisma Client is missing from the image. With the supplied
Dockerfiles this cannot happen, because the build stage generates it and the
runtime stage copies it in. If you see it, you are running an image built
before this Dockerfile existed — rebuild:

```powershell
docker compose build --no-cache server
```

### Uploads fail with `EACCES: permission denied`

The API runs as the unprivileged `node` user (uid 1000), but a volume created
by an older run may be owned by root. Fix it once:

```powershell
docker compose exec -u root server chown -R node:node /app/uploads
```

A freshly created `uploads-data` volume inherits the correct ownership from
the image, so this is only needed after an upgrade.

### The site loads but every API call fails

Check that nginx is talking to the API:

```powershell
docker compose logs client | Select-Object -Last 20
docker compose logs server | Select-Object -Last 20
```

`connection refused` from `client` means the `server` container is not healthy.
`docker compose ps` will show which one is failing its healthcheck.

### Reminder emails never arrive

Check `emailMode` in `/api/health`. If it says `capture`, SMTP is not
configured — see step 10. If it says `smtp`, delivery was attempted and the
failure reason is in the server logs. Also confirm `CLIENT_URL` is correct,
because every reminder links to it.

---

## 13. Security checklist before you go live

- [ ] `POSTGRES_PASSWORD` and `JWT_SECRET` are long, random and not reused anywhere else
- [ ] Your admin password is your own — not `Admin@12345`
- [ ] You did **not** run `npm run seed` on the server
- [ ] `CLIENT_URL` is your real HTTPS address
- [ ] HTTPS is working
- [ ] Port 5432 and 5000 are **not** open to the internet (they are not, unless you changed the compose file)
- [ ] Backups are running and you have restored one at least once to prove it works

---

## 14. How this was verified

Docker was not available in the environment where these files were written, so
the images themselves have not been built here. Everything that could be
tested without Docker was, using the exact commands the Dockerfiles run:

- `npm ci --omit=dev --workspace server --include-workspace-root` and the same
  for the client — both exit 0 against the real lockfile
- `npm install --no-save --omit=dev prisma@6.19.3` — succeeds and leaves the
  lockfile unchanged
- `prisma generate` then `prisma migrate deploy` against an **empty** PostgreSQL
  database — schema created from scratch
- `node dist/index.js` booted in production mode with **environment variables
  only and no `.env` file**, connected to that database, and served
  `/api/health`
- Registration, login and an authenticated dashboard call all succeeded
  through that production build
- `npm run build` in the client from a clean copy of only the files the
  Dockerfile copies — produced a byte-identical bundle, confirming the
  container gets the same output, and confirmed the bundle requests
  `baseURL: "/api"` so nginx proxies it on the same origin
- `createAdmin.js` was run against a real database: it creates an admin, that
  admin signed in and reached an admin-only route, and it rejects demo
  passwords, short passwords and malformed emails without needing a database
  connection
- The existing suite still passes (4/4 files, exit 0)

What remains unverified is the part only Docker can do: pulling the base
images, the layer caching, and the healthcheck timing on your specific
machine. Expect to spend a few minutes on the first `up --build`.
