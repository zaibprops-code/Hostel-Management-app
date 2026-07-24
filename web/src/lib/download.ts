import { isNativeApp } from "./api";

// Download / share a server file. In the Android app we use native Capacitor
// plugins (the browser's blob-download and Web Share APIs don't work inside the
// WebView); in a normal browser we use the standard web APIs.

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load file");
  return res.blob();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function safeName(name: string): string {
  return (name || "file").replace(/[/\\:*?"<>|]+/g, "_").slice(0, 120) || "file";
}

// Share is available in the native app always, and in browsers that support it.
export function canShareFiles(): boolean {
  return isNativeApp() || (typeof navigator !== "undefined" && !!navigator.share);
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  const name = safeName(filename);

  if (isNativeApp()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const data = await blobToBase64(await fetchBlob(url));
    // Try the most user-visible locations first; never silently open Share.
    const targets: { dir: any; label: string }[] = [
      { dir: Directory.Documents, label: "Documents" },
      { dir: Directory.External, label: "app storage" },
      { dir: Directory.Data, label: "app storage" },
    ];
    for (const t of targets) {
      try {
        await Filesystem.writeFile({ path: name, data, directory: t.dir, recursive: true });
        alert(`Saved "${name}" to your ${t.label} folder.`);
        return;
      } catch { /* try the next location */ }
    }
    alert("Couldn't save the file to storage. Use the Share button to save it to Files, Drive, etc.");
    return;
  }

  // Browser: trigger a normal file download.
  try {
    const objUrl = URL.createObjectURL(await fetchBlob(url));
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
  } catch {
    window.open(url, "_blank");
  }
}

export async function shareFile(url: string, filename: string): Promise<void> {
  const name = safeName(filename);

  if (isNativeApp()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = await blobToBase64(await fetchBlob(url));
    // Write to the cache, then hand the file URI to the OS share sheet
    // (WhatsApp, Gmail, Save to Files/Drive, etc.).
    const written = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: name, files: [written.uri] });
    } catch (e: any) {
      if (typeof e?.message === "string" && /cancel/i.test(e.message)) return; // user dismissed
      throw e;
    }
    return;
  }

  // Browser: Web Share API when available, else fall back to download.
  try {
    const blob = await fetchBlob(url);
    const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
    const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: name, url });
      return;
    }
    await downloadFile(url, name);
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return;
    await downloadFile(url, name);
  }
}
