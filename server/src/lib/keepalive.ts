import http from "http";
import https from "https";

// Free-tier hosts (e.g. Render) put a service to sleep after ~15 minutes with no
// inbound traffic — which is what causes the 30–60s "waking up" delay. This makes
// the API quietly request its OWN public URL every few minutes, so there's always
// recent inbound traffic and the host never sleeps. No external service, no cost.
export function startKeepAlive(): void {
  const base = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
  if (!base) return; // no public URL (e.g. local dev) → nothing to keep awake
  const url = `${base}/api/health`;
  const client = url.startsWith("https") ? https : http;

  const ping = () => {
    try {
      const req = client.get(url, (res) => res.resume());
      req.on("error", () => {});
      req.setTimeout(30_000, () => req.destroy());
    } catch {
      /* ignore — best effort */
    }
  };

  // Every 10 minutes (comfortably under the ~15-minute idle sleep window).
  setInterval(ping, 10 * 60 * 1000).unref();
  // eslint-disable-next-line no-console
  console.log(`⏰ Keep-alive enabled → ${url}`);
}
