import dotenv from "dotenv";

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Accept the R2 Account ID however it was pasted and return just the bare id:
//   "abc123"                                        → "abc123"
//   "abc123.r2.cloudflarestorage.com"               → "abc123"
//   "https://abc123.r2.cloudflarestorage.com/"      → "abc123"
// This avoids a TLS "handshake failure" caused by a stray newline or a full
// endpoint URL ending up in the S3 client's hostname.
function normalizeR2Account(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^(?:https?:\/\/)?([^./\s]+)\.r2\.cloudflarestorage\.com/i);
  if (m) return m[1];
  return s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret"),
    refreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret"),
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "7d",
  },
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  // Optional one-time "wipe everything and start fresh" switch. Set RESET_DATA
  // to any non-empty value in the environment to erase all data on the next
  // start-up (so the app returns to first-run setup). It runs at most once per
  // distinct value, so leaving it set does NOT wipe data again on later
  // redeploys — but you should still remove it afterwards. See DEPLOYMENT.md.
  resetDataToken: process.env.RESET_DATA ?? "",
  // Whether new hostel owners may self-register their own business account from
  // the login screen (multi-tenant SaaS mode). Secure by default: OFF unless
  // ALLOW_SIGNUP=true is set explicitly, so a private admin-only deployment can
  // never be left open by a missing env var. The very first business can always
  // be created (first-run bootstrap), even when sign-ups are disabled.
  allowSignup: process.env.ALLOW_SIGNUP === "true",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  // Storage budget shown in the app's Storage screen (MB). Files are kept in
  // the database, whose free Render tier is ~1 GB. Override with STORAGE_LIMIT_MB
  // if you upgrade the database.
  storageLimitMb: Number(process.env.STORAGE_LIMIT_MB ?? 1024),
  // Cloudflare R2 object storage (S3-compatible). When all of R2_ACCOUNT_ID,
  // R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are set, uploaded files
  // live in a PRIVATE R2 bucket and are served only through the authenticated,
  // per-file-authorized /files/r2/<key> route (never a public URL). Leave blank
  // to fall back to storing files in the database (local dev convenience).
  // NOTE: this is file storage only — the Postgres database (DATABASE_URL /
  // DIRECT_URL, on Supabase) is entirely separate and unaffected.
  r2: {
    // The Cloudflare Account ID (a 32-char hex string). Be forgiving about how
    // it's pasted: strip surrounding whitespace/newlines, a leading "https://",
    // and — if the whole S3 endpoint was pasted — extract just the account id
    // subdomain. A malformed value here points the S3 client at a non-existent
    // host and fails with a TLS "handshake failure" (SSL alert 40).
    accountId: normalizeR2Account(process.env.R2_ACCOUNT_ID ?? ""),
    accessKeyId: (process.env.R2_ACCESS_KEY_ID ?? "").trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY ?? "").trim(),
    bucket: (process.env.R2_BUCKET ?? "").trim(),
    // How long a presigned upload/download URL stays valid (seconds).
    urlTtl: Number(process.env.R2_URL_TTL ?? 300),
  },
  // Public address of the web app, used to build links in emails (e.g. the
  // password-reset link). Falls back to the CORS origin, then localhost.
  webAppUrl: process.env.WEB_APP_URL ?? process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // Outgoing email (SMTP). Optional — if not configured, emails are skipped and
  // a warning is logged instead of crashing. Works with any SMTP provider
  // (Gmail app password, Resend, SendGrid, Mailgun, …).
  mail: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    // true for port 465 (implicit TLS), false for 587 (STARTTLS).
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : Number(process.env.SMTP_PORT ?? 587) === 465,
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    // The "From" address shown to recipients. Defaults to the SMTP user.
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "",
  },
};

export const isProd = env.nodeEnv === "production";
