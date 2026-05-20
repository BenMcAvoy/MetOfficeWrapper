// Lightweight haptic feedback. Uses the Vibration API where available
// (Android Chrome / installed PWAs on Android). iOS Safari does not expose
// vibration, but installed iOS PWAs still benefit from the visual press
// feedback elsewhere; this is a no-op there.

type HapticKind = 'light' | 'medium' | 'success' | 'warn';

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 14,
  success: [8, 40, 8],
  warn: [16, 60, 16],
};

export function haptic(kind: HapticKind = 'light') {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (!nav.vibrate) return;
  try { nav.vibrate(PATTERNS[kind]); } catch { /* ignore */ }
}
