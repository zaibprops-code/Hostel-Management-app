import qrcode from "qrcode-generator";

// Render a string to a self-contained SVG QR code (no network, no image host).
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M"); // auto version, medium error correction
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
