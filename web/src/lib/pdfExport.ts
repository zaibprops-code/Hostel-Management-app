// Build a real, multi-page PDF from a DOM element — no external service and no
// heavy PDF dependency, so it works in a normal browser and inside the
// Capacitor Android WebView alike (window.print() does not). html2canvas
// renders the element, we slice the tall bitmap into A4-proportioned pages and
// embed each slice as a JPEG. The result is a base64 data URL that flows
// through downloadFile / shareFile exactly like the receipt PNG does.

const A4_W = 595.28; // A4 width in PDF points
const A4_RATIO = Math.SQRT2; // A4 height / width ≈ 1.4142

export async function elementToPdf(el: HTMLElement): Promise<string> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, logging: false, useCORS: true });

  const cw = canvas.width;
  const pageHpx = Math.max(1, Math.floor(cw * A4_RATIO)); // full-page slice height (px)

  // Slice the tall render into page-sized JPEGs (the last page may be shorter).
  const slices: { bytes: Uint8Array; hpx: number }[] = [];
  for (let y = 0; y < canvas.height; y += pageHpx) {
    const hpx = Math.min(pageHpx, canvas.height - y);
    const slice = document.createElement("canvas");
    slice.width = cw;
    slice.height = hpx;
    const ctx = slice.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, hpx);
    ctx.drawImage(canvas, 0, y, cw, hpx, 0, 0, cw, hpx);
    const b64 = slice.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
    slices.push({ bytes: b64ToBytes(b64), hpx });
  }
  if (!slices.length) throw new Error("Nothing to export");

  return buildPdf(slices, cw);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Assemble a minimal but valid PDF: one Image XObject + content stream + Page
// per slice, then a correct cross-reference table and trailer.
function buildPdf(slices: { bytes: Uint8Array; hpx: number }[], cw: number): string {
  const parts: Uint8Array[] = [];
  const enc = (s: string) => new TextEncoder().encode(s);
  let offset = 0;
  const offsets: number[] = []; // offsets[objNumber] = byte offset

  const push = (u: Uint8Array) => { parts.push(u); offset += u.length; };
  const pushStr = (s: string) => push(enc(s));
  const obj = (num: number, body: string) => { offsets[num] = offset; pushStr(`${num} 0 obj\n${body}\nendobj\n`); };

  const n = slices.length;
  const objCount = 2 + n * 3; // catalog + pages + (page, content, image) per slice

  // Header (with a binary comment so tools treat the file as binary).
  pushStr("%PDF-1.3\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1: Catalog, 2: Pages.
  const kids = slices.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);

  slices.forEach((s, i) => {
    const pageNum = 3 + i * 3;
    const contentNum = 4 + i * 3;
    const imageNum = 5 + i * 3;
    const pageW = A4_W;
    const pageH = +(A4_W * (s.hpx / cw)).toFixed(2);

    obj(
      pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH}] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>`
    );

    const stream = `q ${pageW.toFixed(2)} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    obj(contentNum, `<< /Length ${enc(stream).length} >>\nstream\n${stream}\nendstream`);

    // Image object holds raw JPEG bytes → write header, bytes, then trailer.
    offsets[imageNum] = offset;
    pushStr(
      `${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cw} /Height ${s.hpx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${s.bytes.length} >>\nstream\n`
    );
    push(s.bytes);
    pushStr("\nendstream\nendobj\n");
  });

  // Cross-reference table.
  const xrefOffset = offset;
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objCount; i++) {
    xref += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  // Concatenate and encode as a base64 data URL.
  const total = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return "data:application/pdf;base64," + btoa(bin);
}
