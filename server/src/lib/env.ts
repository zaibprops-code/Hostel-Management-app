import dotenv from "dotenv";

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
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
  // Supabase Storage (optional). When SUPABASE_URL + SUPABASE_SERVICE_KEY are
  // set, uploads go to the storage bucket instead of the database — so the
  // database stays tiny and file space is effectively unlimited. Leave blank to
  // keep storing files in the database (the default).
  supabase: {
    url: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
    bucket: process.env.SUPABASE_BUCKET ?? "hostel-files",
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
