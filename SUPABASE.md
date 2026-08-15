# Moving file storage (and optionally the database) to Supabase

The app stores uploaded photos and documents. By default they live **inside the
database**, which fills Render's free 1 GB tier quickly. Point the app at a
**Supabase Storage** bucket instead and files leave the database entirely — the
database stays tiny (just text records) and file space becomes effectively
unlimited on Supabase's free tier.

This is **optional and backwards-compatible**: with the variables unset, files
keep going to the database as before. Set them, and *new* uploads go to
Supabase. Existing database-stored files keep working either way.

---

## Part 1 — Move file storage to Supabase (fixes the space problem)

**1. Create a Supabase project** (free) at <https://supabase.com> → New project.
Pick a region close to you and save the database password.

**2. Create a storage bucket.**
Left sidebar → **Storage** → **New bucket**:
- Name: **`hostel-files`**
- **Public bucket: ON** (the app already serves files by unguessable random
  URLs, the same way it did from the database).
- Create.

**3. Copy two values.**
Left sidebar → **Project Settings** → **API**:
- **Project URL** → this is `SUPABASE_URL` (looks like `https://abcd1234.supabase.co`)
- **`service_role` secret** (under *Project API keys*) → this is
  `SUPABASE_SERVICE_KEY`. Keep it secret — it has full access.

**4. Add them to Render.**
Render dashboard → **hostel-api** → **Environment** → add:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | your Project URL |
| `SUPABASE_SERVICE_KEY` | your `service_role` secret |
| `SUPABASE_BUCKET` | `hostel-files` |

Save. Render redeploys automatically. From now on every uploaded photo/document
goes to Supabase, and the database stops growing.

> Test it: upload a resident photo, then in Supabase → Storage → `hostel-files`
> you should see the file appear.

---

## Part 2 — (Optional) Move the database to Supabase too

Only needed if you also want the database off Render. File storage (Part 1) is
what actually fixes the 1 GB problem, so this part is not required.

**1. Get the connection string.**
Supabase → **Project Settings** → **Database** → **Connection string** →
**URI**. Use the **Session pooler** / direct connection (port `5432`) so Prisma
can create tables. Replace `[YOUR-PASSWORD]` with your database password.

**2. Point the app at it.**
Render → **hostel-api** → **Environment** → set **`DATABASE_URL`** to that
string (this overrides the built-in Render database).

**3. Redeploy.** On start the app runs `prisma db push`, which creates all the
tables in the Supabase database automatically. The app starts empty and asks you
to set up your business again (unless you migrate the old data — see below).

**Moving existing data (only if you already had residents/payments on Render):**
use `pg_dump` from the old Render database and `pg_restore`/`psql` into Supabase,
*or* ask and a migration can be scripted. If your data is minimal, it's easiest
to just re-enter it.

---

## Notes

- **Free-tier sleep:** like Render, a free Supabase project pauses after ~1 week
  of inactivity and resumes on the next request. Fine for a single hostel.
- **Cost beyond free:** Supabase Storage free tier is generous; if you ever
  outgrow it, it's a few dollars a month.
- **Custom domain:** unrelated to storage, but you can point a subdomain like
  `app.yourhostel.com` at the site in Render → **Settings → Custom Domains** for
  a professional address.
