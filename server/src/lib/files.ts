import multer from "multer";
import path from "path";
import { prisma } from "./prisma";
import { env } from "./env";

// Shared file helpers so both the authenticated uploads router and the public
// resident-intake form store files the same way: bytes kept in the database
// (StoredFile) and served from /files/<id>, no separate storage service.

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

// Persist an uploaded file's bytes and return its public URL ("/files/<id>").
export async function storeFile(file: Express.Multer.File): Promise<string> {
  const blob = await prisma.storedFile.create({
    data: { data: file.buffer, mimeType: resolveType(file) ?? file.mimetype, fileName: file.originalname },
  });
  return `/files/${blob.id}`;
}
