import * as pdfjsLib from "pdfjs-dist";
// Bundle the worker locally (Vite resolves this to a hashed asset served from
// the app's own origin — works in the browser and the Capacitor WebView).
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Render every page of a PDF (fetched from `url`) to JPEG data URLs that can be
// shown with plain <img> tags — i.e. an in-app PDF viewer, no external service.
export async function renderPdf(url: string, scale = 1.6): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load PDF");
  const data = await res.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return pages;
}
