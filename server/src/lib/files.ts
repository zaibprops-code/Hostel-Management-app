import multer from "multer";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "./prisma";
import { env } from "./env";
import { ApiError } from "./http";

// Shared file helpers. Files can live in one of two places:
//   • Cloudflare R2 (S3-compatible, PRIVATE bucket) — when the R2_* env vars are
//     set. Bytes never pass through a public URL; every read goes through the
//     authenticated, per-file-authorized /files/r2/<key> route. A FileObject row
//     records the owning company/hostel/resident so access can be RBAC-checked.
//   • The database (StoredFile) — the zero-config local-dev fallback, served
//     from the public-by-unguessable-id /files/<id> route.

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};

export function isAllowedMime(mime: string | null | undefined): boolean {
  return !!mime && ALLOWED.has(mime);
}

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

// A single shared uploader used by the legacy (through-API) upload routes.
export const upload = makeUpload();

// ---- Cloudflare R2 (S3-compatible) backend ------------------------------

export function r2Configured(): boolean {
  const r = env.r2;
  return !!(r.accountId && r.accessKeyId && r.secretAccessKey && r.bucket);
}

let client: S3Client | null = null;
function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.r2.accessKeyId, secretAccessKey: env.r2.secretAccessKey },
      forcePathStyle: true,
      // Cloudflare R2 does not accept the CRC32 integrity checksums that recent
      // AWS SDK versions add to uploads by default (it rejects the request).
      // Only compute a checksum when the operation actually requires one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}
const BUCKET = () => env.r2.bucket;

const REF_PREFIX = "/files/r2/";
export function isR2Ref(ref: string | null | undefined): boolean {
  return !!ref && ref.startsWith(REF_PREFIX);
}
export function keyFromRef(ref: string): string {
  return ref.slice(REF_PREFIX.length);
}
export function refForKey(key: string): string {
  return `${REF_PREFIX}${key}`;
}

// A random, unguessable object key partitioned by year/month for easy browsing.
export function makeKey(originalName: string | undefined, mime?: string): string {
  let ext = path.extname(originalName || "").toLowerCase();
  if (!ext) ext = mime === "application/pdf" ? ".pdf" : mime === "image/png" ? ".png" : ".jpg";
  const id = crypto.randomBytes(16).toString("hex");
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${id}${ext}`;
}

// Presigned URL for the browser to upload (PUT) bytes straight to R2. The
// Content-Type is bound into the signature, so the client must send the same
// header — nothing else can be uploaded under this URL.
export async function presignPut(key: string, mime: string): Promise<string> {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: mime }), {
    expiresIn: env.r2.urlTtl,
  });
}

// Short-lived presigned URL for reading (GET) an object. Optionally forces a
// download with a given filename via Content-Disposition.
export async function presignGet(key: string, opts?: { download?: boolean; fileName?: string | null }): Promise<string> {
  const disposition = opts?.download
    ? `attachment; filename="${(opts.fileName || "file").replace(/["\r\n]/g, "")}"`
    : undefined;
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: BUCKET(), Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: env.r2.urlTtl }
  );
}

// Confirm an object exists (after a direct upload) and read its size. Returns
// null when the object is missing.
export async function headObject(key: string): Promise<{ size: number | null } | null> {
  try {
    const out = await r2().send(new HeadObjectCommand({ Bucket: BUCKET(), Key: key }));
    return { size: out.ContentLength ?? null };
  } catch {
    return null;
  }
}

// ---- Public API ---------------------------------------------------------

export interface FileMeta {
  companyId: string;
  hostelId?: string | null;
  residentId?: string | null;
  paymentId?: string | null;
  kind: string;
  uploadedById?: string | null;
}

// Persist an uploaded file's bytes and return a reference for it. Used by the
// legacy through-API upload routes and the public intake form. Uses R2 (with a
// FileObject authorization record) when configured, otherwise the database.
export async function storeFile(file: Express.Multer.File, meta: FileMeta): Promise<string> {
  const mime = resolveType(file) ?? file.mimetype;
  if (r2Configured()) {
    const key = makeKey(file.originalname, mime);
    try {
      await r2().send(new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: file.buffer, ContentType: mime }));
    } catch (err) {
      // Turn a raw S3/R2 failure into a clear, actionable message (shown to the
      // user and logged in full) instead of a generic 500. The short code names
      // the cause: NoSuchBucket → wrong R2_BUCKET; SignatureDoesNotMatch/
      // InvalidAccessKeyId → wrong key/secret; EPROTO → wrong R2_ACCOUNT_ID.
      const e = err as { name?: string; code?: string; message?: string };
      const code = e.name || e.code || "UnknownError";
      // eslint-disable-next-line no-console
      console.error("R2 upload failed:", { code, bucket: BUCKET(), message: e.message });
      throw new ApiError(502, `Could not save the uploaded file to storage (${code}). Please check the R2 settings.`);
    }
    await prisma.fileObject.create({
      data: {
        key,
        companyId: meta.companyId,
        hostelId: meta.hostelId ?? null,
        residentId: meta.residentId ?? null,
        paymentId: meta.paymentId ?? null,
        kind: meta.kind,
        mimeType: mime,
        fileName: file.originalname,
        size: file.size,
        status: "ACTIVE",
        uploadedById: meta.uploadedById ?? null,
      },
    });
    return refForKey(key);
  }
  const blob = await prisma.storedFile.create({ data: { data: file.buffer, mimeType: mime, fileName: file.originalname } });
  return `/files/${blob.id}`;
}

// Delete the backing file for a reference, wherever it lives, and its metadata.
// No-op for anything unrecognised.
export async function removeStoredFile(ref: string | null | undefined): Promise<void> {
  if (!ref) return;
  if (isR2Ref(ref)) {
    const key = keyFromRef(ref);
    try {
      await r2().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
    } catch {
      /* best effort — still drop the metadata row below */
    }
    await prisma.fileObject.deleteMany({ where: { key } });
    return;
  }
  const m = ref.match(/^\/files\/([^/]+)$/);
  if (m) await prisma.storedFile.deleteMany({ where: { id: m[1] } });
}
