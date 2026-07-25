// Render a DOM element to a PNG data URL (used to save/share the payment
// receipt as an image — window.print() doesn't work in the Android WebView).
// html2canvas is lazy-loaded so it doesn't weigh down the main bundle.
export async function elementToPng(el: HTMLElement): Promise<string> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, logging: false, useCORS: true });
  return canvas.toDataURL("image/png");
}
