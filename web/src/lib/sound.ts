// Subtle UI sounds generated with the Web Audio API — no audio files, works
// offline, and respects a persisted mute preference. All tones are short and
// quiet so they feel like polish, never noise.

let ctx: AudioContext | null = null;
const KEY = "riwaqSoundMuted";

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setMuted(muted: boolean): void {
  try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* ignore */ }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Play one short tone with a soft attack + exponential decay.
function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05, delay = 0): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const sound = {
  // A soft tick when choosing an option.
  tap() { if (isMuted()) return; tone(430, 0.07, "sine", 0.035); },
  // A gentle two-note confirm when a photo/file is attached.
  pick() { if (isMuted()) return; tone(587, 0.08, "sine", 0.04); tone(880, 0.1, "sine", 0.03, 0.06); },
  // A low, brief buzz when something needs fixing.
  error() { if (isMuted()) return; tone(196, 0.16, "triangle", 0.05); tone(155, 0.2, "triangle", 0.04, 0.05); },
  // A pleasant rising arpeggio (C–E–G–C) on successful submission.
  success() {
    if (isMuted()) return;
    ([[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.32]] as const)
      .forEach(([f, d]) => tone(f, 0.3, "sine", 0.05, d));
  },
};
