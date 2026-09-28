# Deploying ClassHub to Render (free tier)

This guide is for deploying the app so your students can reach it, at no cost.

It assumes you have never used Render or GitHub before. Every step is written
out in full.

---

## What you're building

| Piece | What it is |
|---|---|
| **GitHub repository** | Where your code lives. Render reads from it. |
| **Render web service** | One container running both the API and the web app |
| **Render PostgreSQL database** | Where your data lives |

You get `https://classhub.onrender.com` with a free HTTPS certificate.

### Why only one service, not two

You might expect a service for the API and another for the web app. **That
would not work**, and the reason is worth knowing.

Your login cookie is set `sameSite: 'lax'`. Two Render services get two
different domains (`classhub.onrender.com` and `classhub-api.onrender.com`),
and a browser treats those as different *sites*. It then refuses to send the
cookie, so every student would be silently signed out and bounced back to the
login page — with no error message and no way for you to see why.

So the app serves the web page and the API from **one origin**, on one port.
That also keeps you inside the free tier, which meters usage per service.

---

## 1. Push your code to GitHub

Render deploys from a Git repository, so this comes first. The project is
already initialised as a Git repo with one commit, so you only need to
publish it.

**1. Create the repository on GitHub**

1. Go to <https://github.com> and sign in (create an account if you don't have
   one).
2. Click the **`+`** in the top-right → **New repository**.
3. Name it `classhub`.
4. **Important:** leave *Add a README* **unchecked**. The project already has
   one, and adding another causes a conflict.
5. Set visibility to **Private** if you want. Either works for Render, but
   private is tidier — nobody needs to read your student portal's source.
6. Click **Create repository**.

**2. Connect this folder to it**

GitHub will show you a page with a `https://github.com/<you>/classhub.git`
address. In PowerShell, from the project folder:

```powershell
cd E:\Project\CODE\BuddyWork
git branch -M main
git remote add origin https://github.com/<your-username>/classhub.git
git push -u origin main
```

Git will ask for your username and a **personal access token** as the
password. GitHub stopped accepting account passwords in 2021.

To create a token: GitHub → **Settings** → **Developer settings** →
**Personal access tokens** → **Tokens (classic)** → **Generate new token**.
Select the `repo` scope. Copy the token when it is shown — you cannot see it
again — and paste it when git asks for a password.

Verify it worked:

```powershell
git log --oneline -1
git remote -v
```

---

## 2. Create the Render service

1. Go to <https://render.com> and sign in with GitHub.
2. **New** → **Blueprint**.
3. Connect the `classhub` repository when asked.
4. Render reads `render.yaml` from your repo and shows you a plan:
   - a `classhub` web service
   - a `classhub-db` PostgreSQL database

   **Check that it says "Docker" and points at `server/Dockerfile`.** If it
   shows a native Node runtime instead, the repository is not fully pushed
   yet — go back to step 1.
5. Click **Apply**.

Render starts building. The first build takes **5–10 minutes** because it
installs Node, compiles the web app, compiles the API, and downloads the
PostgreSQL driver. Later builds are much faster.

Watch it under **Events**. You are looking for:

```
==> applying database migrations
All migrations have been successfully applied.
==> starting ClassHub API
  environment : production
  listening   : http://localhost:10000
```

**The database schema is created automatically** on first boot, so there is
nothing to run by hand.

---

## 3. Set your two required values

Render prompts for the values that cannot be automated. Open the service →
**Environment** and fill in:

| Key | Value |
|---|---|
| `CLIENT_URL` | `https://classhub.onrender.com` — **your** service's URL. You find this at the top of the service page. |
| `EMAIL_HOST` | Leave **empty** for now (see step 6) |

`JWT_SECRET` was generated for you by the blueprint — you never need to see
it. `DATABASE_URL` is wired up automatically.

Click **Save**, then **Restart deploy**.

`CLIENT_URL` matters more than it looks: every reminder email contains a link
back to the app, and the server refuses cross-origin requests from any other
address. If it is wrong, students see a blank page and reminder links go
nowhere.

---

## 4. Create your admin account

A fresh install has **no users at all** — not even an admin. Create one:

1. Open the **Shell** tab of your service in the Render dashboard.
2. Run:

   ```sh
   node dist/scripts/createAdmin.js --email "you@college.edu" --name "Your Name" --password "a-password-of-at-least-12-characters"
   ```

You should see `created admin account`. Then sign in at
<https://classhub.onrender.com>.

The script refuses passwords under 12 characters and the known demo
passwords. Running it again with the same email resets that account's
password and re-promotes it to admin — that is the supported way to recover
a lost login.

Create your students from **Admin → Students → Add student**.

> **Do not run `npm run seed` on the server.** It wipes your resources and
> creates accounts with publicly documented demo passwords.

---

## 5. Understand the free tier's one big limitation

**Render's free web service sleeps after about 15 minutes of inactivity.**
A student arriving at a cold site waits 30–60 seconds while it wakes up. That
is the main cost of free, and there is no way around it.

The second effect is on **reminder emails**, and it has already been designed
around:

The reminder sweep originally used a narrow one-hour window centred exactly 24
hours before a last date. If the service happened to be asleep during that
hour, the reminder was **lost permanently** — no retry, ever.

That window has been changed. A sweep now asks *"which published items are
still open and due within 24 hours, and which students have not been
reminded?"* So whenever the service wakes, it sends everything still
outstanding. Because reminders are keyed on
`(item, student, last date)` behind a unique constraint, a student can never
receive the same reminder twice, however many times the service wakes.

The email states the real time remaining ("in about 3 hours"), so a reminder
that fires late is still accurate rather than claiming 24 hours.

The honest summary: **reminders will arrive, but a sleeping service can make
them late.** If punctuality matters, Render's Starter plan is $7/month and
never sleeps.

### Uploads are not persistent on the free tier

Files an admin uploads live on the container's disk. On a free service that
disk is **wiped on every deploy**, so attached question and answer files are
lost whenever you push a change. The database rows survive; the files do not.

A persistent disk is a paid feature. If you need uploads to survive deploys,
that is the $7/month tier, or move the files to object storage (S3, Cloudflare
R2) which both have free tiers.

---

## 6. Turn on real email (optional)

Until SMTP is set, emails are rendered, stored in the database, and printed to
the service log — nothing is delivered. `/api/health` reports
`"emailMode": "capture"` while this is the case.

Add these in **Environment**, then restart:

| Key | Value |
|---|---|
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_SECURE` | `false` |
| `EMAIL_USER` | your email address |
| `EMAIL_PASSWORD` | your **App Password** |
| `EMAIL_FROM` | `ClassHub <no-reply@yourdomain.com>` |

| Provider | Host | Port | `EMAIL_SECURE` |
|---|---|---|---|
| Gmail | `smtp.gmail.com` | 587 | `false` |
| Outlook / Office 365 | `smtp.office365.com` | 587 | `false` |
| SendGrid | `smtp.sendgrid.net` | 587 | `false` |

Gmail needs an **App Password**, not your account password: turn on 2-Step
Verification, then Google Account → Security → App passwords.

Test it with the **Test email** button on the admin dashboard. If delivery
fails, the reason is in the service **Logs**.

---

## 7. Deploying updates

```powershell
git add -A
git commit -m "describe the change"
git push
```

Render detects the push and redeploys automatically. Migrations run on the way
up, so schema changes need no extra step.

Watch progress under the service's **Events** tab.

---

## 8. Backups

Render's free PostgreSQL is a real database that persists, but it is still a
free tier — treat a backup as essential.

In the Render dashboard, open the database → **Backups** → **Create backup**.
Render keeps a few of these on free plans, and you can download one.

To restore: open the database's **Shell** tab and

```sh
psql "$DATABASE_URL" < backup.sql
```

Worth testing once, so you discover a broken restore before you need it.

---

## 9. Troubleshooting

### The build fails

Read the last 20 lines of the build log. Two usual causes:

- **`npm ci` cannot find a lockfile.** The build context is the repository
  root, not `server/`. This project is an npm workspaces monorepo with one
  `package-lock.json` at the root. If your GitHub repo is missing it, you
  pushed the wrong folder.
- **`@prisma/client did not initialize yet`.** The image is stale. Trigger a
  fresh build: **Manual Deploy** → **Clear build cache** → **Deploy**.

### The deploy succeeds but the site is blank

1. Is it just slow? Free services sleep. Wait a minute and reload.
2. Open the **Logs** tab. A `P3005: The database schema is not empty` error
   means the database already has tables from an earlier attempt.
3. Check `CLIENT_URL` matches your service URL exactly, including `https://`.

### Sign-in works, then immediately signs you out

`CLIENT_URL` does not match the address in the browser. The server only
accepts requests from that origin.

### Reminder emails never arrive

Check `/api/health`. If it says `"emailMode": "capture"`, SMTP is not
configured — see step 6. If it says `"smtp"`, delivery was attempted and the
failure reason is in the logs.

### Students get a blank page but you can see them signed in

A stale `index.html` cached in a browser. The app sends `Cache-Control:
no-cache` for it, so a hard refresh (Ctrl+F5) should fix it.

---

## 10. Security checklist before you tell students about it

- [ ] `JWT_SECRET` was generated by Render, not typed by you
- [ ] `CLIENT_URL` is your real `https://...onrender.com` address
- [ ] Your admin password is your own — not `Admin@12345`
- [ ] You did **not** run `npm run seed` on the server
- [ ] Database backups are switched on
- [ ] You understand uploads are lost on redeploy (free tier)

---

## 11. What has and has not been tested

Docker was not available in the environment where this was written, so the
image itself has not been built. Everything that could be verified without
Render was, using the exact commands the Dockerfile runs:

- `npm ci` for both workspaces against the real lockfile
- `prisma generate`, then `prisma migrate deploy` against an **empty**
  PostgreSQL database
- The compiled server booted in production mode with **environment variables
  only and no `.env` file**, and served `/api/health`
- The single-origin build was exercised over HTTP: the web app at `/`, a deep
  link like `/admin/resources` returning the app shell rather than a 404,
  `/assets/*` served with immutable caching, an unknown `/api/*` path still
  returning JSON 404, `index.html` sent `no-cache`, and the auth cookie set
  `HttpOnly; Secure; SameSite=Lax`
- Login and an authenticated API call both succeeded through that same origin
- 76 unit tests, 59 end-to-end smoke assertions, 7 restart-safety assertions

What only Render can confirm is the part you are about to run: the container
build itself, and Render's sleep behaviour. Expect the first build to take
several minutes.
