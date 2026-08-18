// Shrink an image in the browser before uploading. Profile photos are squeezed
// harder (they only ever show small); documents like CNIC keep more resolution
// and quality so the text stays crisp. Non-images (PDFs) are left untouched.
// iPhones save photos as HEIC, which Chrome/most browsers can't decode (so they
// won't preview, compress, or display). Detect and convert those to JPEG.
export function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

// Convert a HEIC/HEIF file to a JPEG File (leaving anything else untouched). The
// heic2any decoder is heavy (WASM), so it's only loaded when actually needed.
export async function normalizeImage(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file; // conversion failed — fall back to the original
  }
}

async function compress(file: File, maxDim: number, quality: number): Promise<File> {
  // Skip PDFs; try to compress everything else. Don't gate on file.type —
  // phone/desktop captures often report a blank MIME type; the canvas below
  // decodes by content and simply falls back to the original if it can't.
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return file;
  file = await normalizeImage(file); // HEIC → JPEG so the canvas can decode it
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { URL.revokeObjectURL(url); return file; }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // never make it bigger
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // if anything goes wrong, upload the original
  }
}

// Profile / passport-size picture — small on screen, so shrink more.
export const compressPhoto = (file: File) => compress(file, 1400, 0.8);

// Documents (CNIC, passport, etc.) — keep high resolution & quality so the text
// remains sharp; still far smaller than a raw multi-MB camera photo.
export const compressDocument = (file: File) => compress(file, 2200, 0.9);
