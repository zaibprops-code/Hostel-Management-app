import multer from "multer";
import path from "path";
import crypto from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "./prisma";
import { env } from "./env";

// Shared file helpers. Files can live in one of two places:
//   • Supabase Storage — when SUPABASE_URL + SUPABASE_SERVICE_KEY are set, so
//     the database stays tiny and file space is effectively unlimited.
//   • The database (StoredFile) — the zero-config default, served from
//     /files/<id>. Existing DB-stored files keep working either way.

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};

// Some WebViews report a picked file with a generic mime type, so fall back to
// the extension. Returns the resolved mime type, or null if unsupported.
export function resolveType(file: Express.Multer.File): string | null {
  if (ALLOWED.has(file.mimetype)) return file.mimetype;
  const ext = path.extname(file.originalname || "").toLowerCase();
  return EXT_MIME[ext] ?? null;
}

// A memory-storage multer configured with the app's size limit and type filter.
export function makeUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (resolveType(file)) return cb(null, true);
      cb(new Error("Unsupported file type — please choose an image or a PDF"));
    },
  });
}

// A single shared uploader used by every route that accepts files.
export const upload = makeUpload();

// ---- Supabase Storage backend (optional) --------------------------------

let supabase: SupabaseClient | null = null;
function storageClient(): SupabaseClient | null {
  if (!env.supabase.url || !env.supabase.serviceKey) return null;
  if (!supabase) {
    supabase = createClient(env.supabase.url, env.supabase.serviceKey, { auth: { persistSession: false } });
  }
  return supabase;
}
const BUCKET = env.supabase.bucket;
const publicMarker = `/storage/v1/object/public/${BUCKET}/`;

function objectKey(originalName: string): string {
  const ext = path.extname(originalName || "").toLowerCase();
  const id = crypto.randomBytes(16).toString("hex");
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${id}${ext}`;
}

// ---- Public API ---------------------------------------------------------

// Persist an uploaded file's bytes and return a URL for it. Uses Supabase
// Storage when configured, otherwise the database.
export async function storeFile(file: Express.Multer.File): Promise<string> {
  const mime = resolveType(file) ?? file.mimetype;
  const sb = storageClient();
  if (sb) {
    const key = objectKey(file.originalname);
    const { error } = await sb.storage.from(BUCKET).upload(key, file.buffer, { contentType: mime, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }
  const blob = await prisma.storedFile.create({ data: { data: file.buffer, mimeType: mime, fileName: file.originalname } });
  return `/files/${blob.id}`;
}

// Delete the backing file for a URL, wherever it lives. No-op for anything else.
export async function removeStoredFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const sb = storageClient();
  const idx = url.indexOf(publicMarker);
  if (sb && idx !== -1) {
    const key = decodeURIComponent(url.slice(idx + publicMarker.length));
    await sb.storage.from(BUCKET).remove([key]);
    return;
  }
  const m = url.match(/^\/files\/([^/]+)$/);
  if (m) await prisma.storedFile.deleteMany({ where: { id: m[1] } });
}
