# Cloudflare R2 setup (private file storage)

The app stores uploaded photos and documents in a **private** Cloudflare R2
bucket. Files are never public — they're served only through the app's
authenticated, per-file-authorized route. R2's free tier gives 10 GB of storage
with no egress fees.

You'll end up with four values to paste into Render:
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

---

## 1. Turn on R2

1. Sign in at <https://dash.cloudflare.com>.
2. Left sidebar → **R2**. If prompted, agree to enable R2 (free; a card may be
   required but the free tier isn't charged).

## 2. Create a private bucket

1. **R2** → **Create bucket**.
2. Name it, e.g. `hostel-files`. **Remember this name — it's `R2_BUCKET`.**
3. Location: **Automatic** is fine.
4. Create. **Leave public access OFF** (the default). Do **not** enable a public
   development URL or custom public domain — the bucket must stay private.

## 3. Find your Account ID

- On the **R2** overview page, copy **Account ID** (right side).
- This is **`R2_ACCOUNT_ID`**.

## 4. Create an API token (access key)

1. **R2** → **Manage R2 API Tokens** (or **API** → **Manage API Tokens**).
2. **Create API Token**.
3. Permissions: **Object Read & Write**.
4. Scope: **Apply to specific buckets only** → select your `hostel-files`
   bucket (safer than all-buckets).
5. TTL: leave as **Forever** (or set a long expiry).
6. Create. Cloudflare shows an **Access Key ID** and a **Secret Access Key**
   **once** — copy both now:
   - Access Key ID → **`R2_ACCESS_KEY_ID`**
   - Secret Access Key → **`R2_SECRET_ACCESS_KEY`**

   (You do **not** need the S3 endpoint URL — the app builds it from the
   Account ID.)

## 5. Configure CORS (so browser uploads work)

Uploads go straight from the user's browser to R2 using a short-lived signed
URL, so the bucket must allow the browser's origin.

1. Open your bucket → **Settings** → **CORS Policy** → **Add CORS policy**.
2. Paste this (replace the origin with your real site URL once you have it; you
   can use `"*"` while first testing):

   ```json
   [
     {
       "AllowedOrigins": ["https://your-app.onrender.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

3. Save. When you add a custom domain later (e.g.
   `https://app.riwaqhostels.com`), add it to `AllowedOrigins` too.

---

## The four values for Render

| Variable | Where it came from |
|---|---|
| `R2_ACCOUNT_ID` | R2 overview → Account ID (step 3) |
| `R2_ACCESS_KEY_ID` | API token → Access Key ID (step 4) |
| `R2_SECRET_ACCESS_KEY` | API token → Secret Access Key (step 4) |
| `R2_BUCKET` | your bucket name, e.g. `hostel-files` (step 2) |

Paste all four into Render (either when the Blueprint prompts you, or later in
**Render → your service → Environment**). After saving them, redeploy so the
app picks them up.

> If these four are left blank, the app falls back to storing files in the
> database — handy for local testing, but set R2 for production so the free
> database doesn't fill up.
