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
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10),
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
