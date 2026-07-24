// Shrink a photo in the browser BEFORE uploading, so full-resolution phone
// pictures (often 3–6 MB) become small JPEGs (~200–400 KB) that are still clear
// enough to read a CNIC. This keeps database storage small and uploads fast.
// Non-image files (e.g. PDFs) are returned untouched.
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // never make it bigger
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // if anything goes wrong, upload the original
  }
}
