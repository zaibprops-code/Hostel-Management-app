import { useEffect, useState } from "react";
import { downloadFile, shareFile, canShareFiles } from "../lib/download";

interface Props {
  open: boolean;
  onClose: () => void;
  url: string; // absolute URL (already resolved via assetUrl)
  name: string; // download filename / caption
  mime?: string | null; // used to decide how to render
  onDelete?: () => void; // shown as a Delete button when provided
}

// Renders a PDF's pages as images, entirely in-app (no external viewer).
function PdfPages({ url }: { url: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPages(null); setError(false);
    (async () => {
      try {
        const { renderPdf } = await import("../lib/pdf");
        const imgs = await renderPdf(url);
        if (!cancelled) setPages(imgs);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return <p className="text-slate-300 text-sm">Couldn't preview this PDF. Use Download or Share below to open it.</p>;
  }
  if (!pages) {
    return <p className="text-slate-300 text-sm animate-pulse">Loading document…</p>;
  }
  return (
    <div className="w-full max-w-3xl mx-auto space-y-3">
      {pages.map((src, i) => (
        <img key={i} src={src} alt={`Page ${i + 1}`} className="w-full rounded-lg bg-white shadow" />
      ))}
    </div>
  );
}

// A full-screen viewer for a resident's photo or document. Renders images and
// PDFs inline and offers Download / Share (and optional Delete).
export default function FileViewer({ open, onClose, url, name, mime, onDelete }: Props) {
  const [busy, setBusy] = useState<"" | "download" | "share">("");
  if (!open) return null;

  const isImage = (mime?.startsWith("image/") ?? false) || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(name) || /\.(jpe?g|png|webp|gif)$/i.test(url);
  const isPdf = (mime === "application/pdf") || /\.pdf$/i.test(name) || /\.pdf$/i.test(url);

  async function doDownload() { setBusy("download"); try { await downloadFile(url, name); } finally { setBusy(""); } }
  async function doShare() { setBusy("share"); try { await shareFile(url, name); } finally { setBusy(""); } }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/95 safe-top safe-bottom" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
        <p className="font-medium truncate">{name}</p>
        <button onClick={onClose} className="text-3xl leading-none px-2 -mt-1">&times;</button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img src={url} alt={name} className="max-h-full max-w-full object-contain rounded-lg" />
        ) : isPdf ? (
          <PdfPages url={url} />
        ) : (
          <div className="text-center text-slate-200">
            <p className="mb-3">Preview isn't available for this file type.</p>
            <button onClick={doDownload} className="btn-primary">Download to open</button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 px-4 py-3 flex gap-2 justify-center flex-wrap" onClick={(e) => e.stopPropagation()}>
        <button onClick={doDownload} disabled={!!busy} className="btn-secondary bg-white/10 text-white border-white/20 hover:bg-white/20">
          {busy === "download" ? "Downloading…" : "⬇ Download"}
        </button>
        {canShareFiles() && (
          <button onClick={doShare} disabled={!!busy} className="btn-secondary bg-white/10 text-white border-white/20 hover:bg-white/20">
            {busy === "share" ? "Sharing…" : "↗ Share"}
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="btn-secondary bg-rose-500/20 text-rose-100 border-rose-400/30 hover:bg-rose-500/30">🗑 Delete</button>
        )}
      </div>
    </div>
  );
}
