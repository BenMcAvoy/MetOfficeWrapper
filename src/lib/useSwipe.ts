import { useEffect, useRef } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Distance in px the finger must travel horizontally to count. Default 60. */
  thresholdPx?: number;
  /** Max vertical drift allowed before the gesture is rejected as a scroll. Default 50. */
  maxVerticalDriftPx?: number;
  /** If true, onSwipeRight only fires when the gesture starts within `edgeWidthPx` of the left edge. */
  edgeRightOnly?: boolean;
  /** Edge width for edge-only mode. Default 28. */
  edgeWidthPx?: number;
  /** Set to false to disable temporarily without unmounting. Default true. */
  enabled?: boolean;
}

export function useSwipe<T extends HTMLElement>(opts: SwipeOptions) {
  const ref = useRef<T | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const {
    onSwipeLeft, onSwipeRight,
    thresholdPx = 60, maxVerticalDriftPx = 50,
    edgeRightOnly = false, edgeWidthPx = 28,
    enabled = true,
  } = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (edgeRightOnly && t.clientX > edgeWidthPx) {
        startRef.current = null;
        return;
      }
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      const s = startRef.current;
      startRef.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dy) > maxVerticalDriftPx) return;
      if (Date.now() - s.t > 600) return;
      if (dx <= -thresholdPx) onSwipeLeft?.();
      else if (dx >= thresholdPx) onSwipeRight?.();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [onSwipeLeft, onSwipeRight, thresholdPx, maxVerticalDriftPx, edgeRightOnly, edgeWidthPx, enabled]);

  return ref;
}
