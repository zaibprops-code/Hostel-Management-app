# 🌐 Put the app online — free, no credit card (Vercel + Aiven)

This hosts your backend on **Vercel** (free, never sleeps, no card) and your database on
**Aiven** (free PostgreSQL, **no card, no expiry**). Total cost: **$0**.

Time: ~15 minutes, mostly waiting. You only paste a few values once.

---

## Step 1 — Free database on Aiven

1. Go to **https://aiven.io** → **Get started for free** → sign up (GitHub/Google, **no card**).
2. Create a service → choose **PostgreSQL** → the **Free** plan → pick any region → **Create**.
3. Wait until it says **Running** (a few minutes).
4. Open the service → find **Service URI** (a long line starting `postgres://...`). **Copy it.**
   This is your `DATABASE_URL`.

## Step 2 — Deploy the backend on Vercel

1. Go to **https://vercel.com** → **Sign Up** → **Continue with GitHub** (**no card**).
2. **Add New… → Project** → import your **`Hostel-Management-app`** repo.
3. **Important:** set the **Production Branch** to **`claude/apk-build-release-step-5iwips`**
   (the branch that has this setup). *(Settings → Git → Production Branch, or the branch
   selector during import.)*
4. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | *(paste the Aiven Service URI from Step 1)* |
   | `JWT_ACCESS_SECRET` | *(a long random string — ask me and I'll generate one)* |
   | `JWT_REFRESH_SECRET` | *(a different long random string)* |

5. Click **Deploy**. First build takes a few minutes (it creates your database tables and
   loads demo data automatically).

## Step 3 — Get your address & sign in

1. When it finishes, Vercel shows your site URL, like **`https://your-project.vercel.app`**.
2. In the **XYZ Hostel** app, enter that URL as the server address.
3. Log in:
   - **Owner:** `owner@xyzhostel.com` / `Password123`

You can also open that URL in any browser to use the web version.

---

## Notes
- **Free & permanent:** Vercel's backend doesn't sleep; Aiven's free database doesn't expire.
- **Uploads (photos/PDFs)** are not permanently stored on this free setup — everything else
  (residents, rooms, rent, payments, reports) works fully.
- **If a deploy shows an error:** open it in Vercel → copy the red lines → send them to me and
  I'll fix it.
