// Tiny WebAudio alert for critical events (driven by Settings → Sound).
// No assets, no permissions — just a short synthesized two-tone chime.
let ctx: AudioContext | null = null;

export function playAlert(kind: "critical" | "info" = "info") {
  try {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "critical" ? 620 : 440, t);
    osc.frequency.setValueAtTime(kind === "critical" ? 880 : 540, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.34);
  } catch {
    // audio unavailable — ignore
  }
}
