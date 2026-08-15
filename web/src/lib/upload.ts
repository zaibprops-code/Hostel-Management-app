import { api } from "./api";

// Upload a file straight to the private Cloudflare R2 bucket using a presigned
// URL, then attach it to its resource. Because the bytes go browser → R2, large
// files never pass through the API and never hit Vercel's request-size limit.
//
// If the server reports R2 isn't configured (501), we transparently fall back to
// the legacy multipart upload (used in local dev, where files go to the DB).

export type UploadScope = "resident.photo" | "resident.document" | "payment.proof";

export interface UploadOptions {
  scope: UploadScope;
  file: File | Blob;
  residentId?: string;
  paymentId?: string;
  documentType?: string; // required for scope "resident.document"
}

function fileNameOf(file: File | Blob): string {
  return (file as File).name || "upload";
}

export async function uploadFile(opts: UploadOptions): Promise<any> {
  const { file } = opts;
  const fileName = fileNameOf(file);
  const mimeType = file.type || "application/octet-stream";

  // 1) Authorize + get a presigned PUT URL (or a 501 telling us to fall back).
  let presign: { fileId: string; uploadUrl: string; ref: string };
  try {
    const { data } = await api.post("/uploads/presign", {
      scope: opts.scope,
      residentId: opts.residentId,
      paymentId: opts.paymentId,
      fileName,
      mimeType,
    });
    presign = data;
  } catch (err: any) {
    if (err?.response?.status === 501) return legacyUpload(opts); // R2 not configured
    throw err;
  }

  // 2) Send the bytes directly to R2. Content-Type must match what was signed.
  const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
  if (!put.ok) throw new Error("Upload to storage failed. Please try again.");

  // 3) Confirm the object landed and wire the reference onto the resource.
  const { data } = await api.post("/uploads/attach", { fileId: presign.fileId, documentType: opts.documentType });
  return data;
}

// Legacy multipart upload through the API — the local-dev / R2-disabled path.
async function legacyUpload(opts: UploadOptions): Promise<any> {
  const fd = new FormData();
  fd.append("file", opts.file);
  if (opts.scope === "resident.photo") {
    const { data } = await api.post(`/uploads/resident/${opts.residentId}/photo`, fd);
    return data;
  }
  if (opts.scope === "resident.document") {
    fd.append("type", opts.documentType || "OTHER");
    const { data } = await api.post(`/uploads/resident/${opts.residentId}/document`, fd);
    return data;
  }
  // payment.proof
  const { data } = await api.post(`/uploads/payment/${opts.paymentId}/proof`, fd);
  return data;
}
