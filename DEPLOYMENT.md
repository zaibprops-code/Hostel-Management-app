# 🌐 Put the app online (plain-English guide)

This gets your app onto the internet with a real web link **and** a working backend that
the phone app connects to. It uses **one free account (Render)** which hosts the database,
the backend, and the website together — all set up automatically. **You don't copy or paste
any technical values.**

Time: ~10 minutes, mostly waiting.

---

## Step 1 — Make a Render account
1. Go to **https://render.com**.
2. Click **Get Started** → **Sign in with GitHub** (use the same GitHub account that has
   your `Hostel-Management-app` code). Approve access when asked.

## Step 2 — Deploy with one click
1. In the project's **README on GitHub**, click the **"Deploy to Render"** button.
   *(Or in Render: click **New +** → **Blueprint** → pick your `Hostel-Management-app` repo.)*
2. Render reads the setup file and shows what it will create:
   a **database**, the **backend** (`hostel-api`), and the **website** (`hostel-web`).
3. Click **Apply** / **Create**. That's it — Render now builds everything automatically
   (first build takes ~5 minutes). No values to enter.

## Step 3 — Open your app
- When it's done, open the **`hostel-web`** service in Render — its link
  (like `https://hostel-web.onrender.com`) is **your live website**. Open it on any device.
- The backend link is the **`hostel-api`** service (like `https://hostel-api.onrender.com`).
  **You'll type this one into the phone app** on first launch (see `MOBILE.md`).

### Log in
| Role | Email | Password |
|------|-------|----------|
| Owner | `owner@xyzhostel.com` | `Password123` |
| Manager | `manager@xyzhostel.com` | `Password123` |
| Resident | `resident@xyzhostel.com` | `Password123` |

---

## Step 4 — Make it yours (before real use)
1. Log in as **Owner** → **Settings** → change your password.
2. Go to **Users** → change/remove the demo accounts and add real ones for your staff.
3. Remove the demo hostels/residents and add your own (Hostels → Rooms & Beds → Residents →
   Admissions). *Or ask me to switch it to "start empty" so there's no demo data at all.*

---

## Good to know (honest notes on cost)

- **Free is for trying it.** On Render's free plan:
  - the backend **"sleeps" after 15 minutes** of no use and takes ~30 seconds to wake up on
    the next visit;
  - the **free database is time-limited** (Render deletes free databases after their free
    window). **To run this for your real business, upgrade the database and backend to a paid
    plan (about $7–14/month total).** That keeps it always-on and your data permanent.
- Prefer a **longer-lasting free database**? I can switch the setup to use **Supabase** (free
  database that doesn't expire) instead — just ask. It adds one small copy-paste step.

---

## 📧 Password-reset email (so "Forgot password?" works)

By default the app can **generate** a reset link but has no way to **send** it — so if
you (or a manager) forget a password, the "Forgot password?" button can't help. Turn on
email once and it works for everyone, forever.

> Staff lockouts don't strictly need this — as the **Owner** you can always reset any
> staff member's password from **Users → (person) → Reset password**. Email mainly protects
> **you**, since no one is above the owner to reset your login.

### Easiest option — use your Gmail (free)

**1. Create a Gmail "App Password"** (a one-time 16-character key just for this app):
   - Your Google account must have **2-Step Verification** turned on
     (Google Account → **Security** → **2-Step Verification**).
   - Then go to **https://myaccount.google.com/apppasswords**, type a name like
     `Hostel Manager`, and click **Create**. Google shows a 16-character password
     (e.g. `abcd efgh ijkl mnop`) — copy it (remove the spaces).

**2. Add these values in Render** → open the **`hostel-api`** service → **Environment** →
   add each key, then click **Save** (the service redeploys automatically):

   | Key | Value |
   |-----|-------|
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | your full Gmail address, e.g. `you@gmail.com` |
   | `SMTP_PASS` | the 16-character app password (no spaces) |
   | `MAIL_FROM` | `Hostel Manager <you@gmail.com>` |
   | `WEB_APP_URL` | your website link, e.g. `https://hostel-web-us71.onrender.com` |

**3. Test it:** on the login screen tap **Forgot password?**, enter your owner email, and
   check your inbox (and spam) for the reset link. Done.

*(Any SMTP provider works — Resend, SendGrid, Mailgun, etc. — just use their host, port,
username and password in the same five fields. Leave the `SMTP_*` fields empty to keep email
turned off; the app runs fine without it.)*

---

## 👥 Multiple hostel owners (self-service sign-up)

The app is **multi-tenant**: any number of hostel owners can use the same website/app, and
each one gets their own **completely private space** — one owner can never see another
owner's hostels, residents or money.

- **New owner signs up themselves:** on the login screen they tap **"Create a business
  account"**, enter their business name, name, email and a password, and they're in — no
  action needed from you. This is also the easiest way to **start fresh yourself**: just
  create a new business account with a new email.
- **Want to keep it private to you?** In Render → `hostel-api` → **Environment**, set
  `ALLOW_SIGNUP` to `false`. Then the "Create a business account" option disappears and only
  existing owners can sign in. (You can turn it back on anytime.)

---

## 🔄 Start completely over (forgot your login / want a clean slate)

> **Easiest option now:** since anyone can self-register, if you're locked out you can simply
> tap **"Create a business account"** on the login screen and start a brand-new business with
> a new email — no server access needed. The steps below are only for when you want to
> *erase the old data entirely*.

If you can't get back in — you've forgotten your owner email **and** password — or you just
want to wipe everything and set up fresh, you can reset the whole app to its "brand new"
state. After this, the next time you open the app it shows **"Set up your business"** again,
and you create a new owner account from scratch.

> ⚠️ This **erases everything** — all hostels, residents, payments, staff and users. Only do
> it when you're sure (e.g. before you've entered real data, or you truly want to start over).

1. In **Render**, open the **`hostel-api`** service → **Environment**.
2. Add a new variable: key `RESET_DATA`, value `reset-1` (any short word works).
3. Click **Save** — the service redeploys, and on start-up it wipes the data.
4. Open your app → you'll see **"Set up your business"** → create your new owner account.
5. **Important:** go back to Render → **Environment** → **delete the `RESET_DATA` variable**
   (tidy-up). *You don't have to rush — it's built to run only once, so it will not wipe your
   new data on the next redeploy. If you ever want to reset again later, change the value to a
   new word like `reset-2`.*

That's your safety net: even if you forget your owner login, you're never permanently locked
out — you can always start fresh from your own Render dashboard, which only you control.

---

## If something looks wrong
| What you see | What to do |
|--------------|-----------|
| Website loads but login fails with "Network error" | The backend may be asleep — wait ~30s and try again. Or open the `hostel-api` link + `/api/health`; it should say `{"status":"ok"}`. |
| A build shows "failed" in Render | Open it → **Logs**, copy the red lines, and send them to me — I'll fix it. |
| Want to wipe demo data and reload it | On `hostel-api` → **Environment**, add `FORCE_SEED` = `1`, redeploy once, then remove it. |
