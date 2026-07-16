# 🚀 Deploy the app online (get a real link)

This guide takes you from "code on GitHub" to a **live URL anyone can open** on any
phone or laptop. It uses two free services:

- **Supabase** → your database (PostgreSQL)
- **Render** → hosts *both* the backend API and the website, using the included
  `render.yaml` blueprint so most of the setup is automatic

Total time: ~15–20 minutes. No coding required — just clicking and pasting one value.

> Prefer **Vercel** for the website? See [Alternative: Vercel](#alternative-use-vercel-for-the-frontend) at the bottom.

---

## Step 1 — Create the database (Supabase)

1. Go to **https://supabase.com** → sign in with GitHub → **New project**.
2. Give it a name (e.g. `hostel`), set a **database password** (save it somewhere), pick the
   region closest to Pakistan (e.g. *Singapore* or *Frankfurt*), and click **Create**.
3. Wait ~2 minutes for it to finish provisioning.
4. Click **Connect** (top of the page) → choose the **ORM / Prisma** or **Direct connection**
   tab → copy the **connection string**. It looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.abcdxyz.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the database password you set in step 2.
   Keep this final string handy — you'll paste it into Render in Step 2.

> Use the **direct connection** (port **5432**), not the pooled one — the app needs it to
> create its tables on first deploy.

---

## Step 2 — Deploy everything (Render)

1. Go to **https://render.com** → sign in with GitHub.
2. Click **New +** → **Blueprint**.
3. Select your **`Hostel-Management-app`** repository and click **Connect / Apply**.
4. Render reads the `render.yaml` file and shows two services it will create:
   **`hostel-api`** (backend) and **`hostel-web`** (website). Approve it.
5. It will ask you to fill in the one value marked *"sync: false"* — **`DATABASE_URL`**.
   Paste the Supabase connection string from Step 1. Click **Apply / Create**.
6. Render now builds both services (first build takes ~3–5 minutes). It automatically:
   - creates all database tables,
   - loads demo data so you can log in immediately,
   - generates secure login secrets,
   - connects the website to the API.

When it finishes, open the **`hostel-web`** service in Render — its URL (e.g.
`https://hostel-web.onrender.com`) is **your live app**. 🎉

### Log in
| Role | Email | Password |
|------|-------|----------|
| Owner | `owner@xyzhostel.com` | `Password123` |
| Manager | `manager@xyzhostel.com` | `Password123` |
| Resident | `resident@xyzhostel.com` | `Password123` |

---

## Step 3 — Make it yours (important before real use)

The demo data and passwords are just to show it works. Before you run your real hostel on it:

1. **Log in as Owner** → **Settings** → change your password.
2. Go to **Users** and change (or remove) the other demo accounts, and create real accounts
   for your managers/staff with proper hostel access.
3. Delete the demo hostels/residents and add your own via **Hostels** → **Rooms & Beds** →
   **Residents** → **Admissions**.

> Want to start with a completely empty database instead of demo data? In Supabase → **Table
> Editor**, or tell me and I'll add a one-command "create just my owner account" script.

---

## How the pieces fit together

```
   Your browser / phone
          │
          ▼
  hostel-web  (Render static site)  ──calls──►  hostel-api  (Render web service)
   your live URL                                        │
                                                        ▼
                                              Supabase PostgreSQL
```

- Push a change to GitHub → Render **auto-redeploys** both services. Your data is safe:
  the seed only runs on an empty database, so redeploys never wipe real data.
- The **free** Render API "sleeps" after 15 minutes of no use and takes ~30 seconds to wake
  on the next visit. Upgrading the `hostel-api` service to a paid instance (~$7/mo) keeps it
  always-on. The website itself is always fast.

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Build fails on "Can't reach database" | Check `DATABASE_URL` in the `hostel-api` service → **Environment**. Make sure the password is correct and you used the **direct** (5432) Supabase string. |
| Website loads but login says "Network error" | Open the `hostel-api` URL + `/api/health` in a browser — it should show `{"status":"ok"}`. If it's asleep, wait 30s and retry. |
| Blank page after deploy | Confirm `hostel-web` finished building and its **Publish directory** is `web/dist`. |
| Want to reset demo data | Set env var `FORCE_SEED=1` on `hostel-api`, redeploy once, then remove it. (This wipes and reloads demo data.) |

---

## Alternative: use Vercel for the frontend

If you'd rather host the website on **Vercel** (and keep the API on Render):

1. Deploy only the **API** on Render (or Railway): use the `hostel-api` part — set
   `DATABASE_URL` and note its URL, e.g. `https://hostel-api.onrender.com`.
2. On **https://vercel.com** → **Add New → Project** → import the repo.
   The included `vercel.json` sets the build automatically.
3. In Vercel → **Settings → Environment Variables**, add:
   ```
   VITE_API_URL = https://hostel-api.onrender.com/api
   ```
4. **Deploy**. Vercel gives you a `your-app.vercel.app` link.

That's it — same app, website on Vercel instead of Render.
