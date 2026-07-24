// Download / share a server file. Works in the browser and in the Android
// (Capacitor) WebView using web-standard APIs — no extra native plugins.

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load file");
  return res.blob();
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const blob = await fetchBlob(url);
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
  } catch {
    // Last resort: open the file in a new tab so the user can save it manually.
    window.open(url, "_blank");
  }
}

export function canShareFiles(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}

export async function shareFile(url: string, filename: string): Promise<void> {
  try {
    const blob = await fetchBlob(url);
    const file = new File([blob], filename || "file", { type: blob.type || "application/octet-stream" });
    // Prefer sharing the actual file (opens WhatsApp, email, etc. on Android).
    const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: filename, url });
      return;
    }
    await downloadFile(url, filename); // no share support → just download
  } catch (e) {
    // Swallow the "user cancelled the share" case; surface real failures.
    if ((e as DOMException)?.name === "AbortError") return;
    await downloadFile(url, filename);
  }
}
