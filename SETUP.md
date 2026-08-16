# Setup — Render + Supabase + Cloudflare R2 (all free)

One Render service runs the whole app (API + website). Supabase holds the
database. Cloudflare R2 holds uploaded files. Everything here is free tier.

Total time: ~15 minutes. You only paste a handful of values — no build settings
to configure.

---

## 1. Database — Supabase (free)

1. Go to <https://supabase.com> → **New project**. Pick a name and a strong
   database password (save it). Region: closest to you.
2. Wait ~2 minutes for it to provision.
3. Open **Connect** (top bar) → **ORMs** (or **Session pooler**).
4. Copy the **Session pooler** connection string. It looks like:

   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-xx.pooler.supabase.com:5432/postgres
   ```

   Replace `[YOUR-PASSWORD]` with the password you set in step 1.

   > Use the **Session pooler (port 5432)** string — not the direct one and not
   > the 6543 transaction one. The session pooler works from Render (IPv4) and
   > lets the app create its tables on first deploy.

Keep this string for step 3. That's the whole database setup — the app creates
all its tables automatically on first deploy.

---

## 2. File storage — Cloudflare R2 (free, private)

Follow **[R2_SETUP.md](./R2_SETUP.md)**. At the end you'll have four values:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

Keep them for step 3.

---

## 3. Deploy the app — Render (free)

1. Go to <https://render.com> → **New +** → **Blueprint**.
2. Connect this GitHub repo and select the branch to deploy.
3. Render reads `render.yaml` and shows the values it needs. Paste:
   - **DATABASE_URL** → the Supabase session-pooler string from step 1.
   - **R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET**
     → the four values from step 2.
   - Leave the `WEB_APP_URL` and `SMTP_*` fields blank (they're only for
     optional password-reset emails).
4. Click **Apply**. Render installs, builds the website + API, creates the
   database tables, and starts the service.

When it's live, open the service URL. You'll land on the first-run setup screen
to create your business and the first owner login.

---

## 4. After it's live

- **Add the site URL to R2 CORS.** Once you know your Render URL
  (e.g. `https://hostel-app.onrender.com`), add it to the bucket's CORS rule in
  R2_SETUP.md so browser uploads work. (You can use `*` while testing.)
- **Custom domain (optional).** In Render → your service → **Settings** →
  **Custom Domains**, add `app.riwaqhostels.com` and follow the DNS steps.
- **First visit is slow.** On the free tier the service sleeps after 15 min
  idle; the first request then takes ~30s to wake. The app pings itself every
  10 min to reduce this — no action needed.

---

## What changed vs. the old setup

- The website is now served by the **same** service as the API (one URL, no
  separate static site, no CORS to configure).
- The database is **Supabase**, not Render's Postgres (Supabase's free tier
  doesn't expire).
- Files live in **Cloudflare R2** (private), not the database — so the database
  stays small and free.
- Vercel is not used. If you had a Vercel project connected, you can delete it.
