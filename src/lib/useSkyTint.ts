import { useEffect } from 'react';
import type { SunInfo } from '@/lib/api';

type Sky = 'dawn' | 'day' | 'dusk' | 'night';

const TWILIGHT_MS = 60 * 60 * 1000;

function classify(now: number, sun: SunInfo | null): Sky {
  if (!sun) return 'day';
  const sunrise = sun.sunrise.getTime();
  const sunset = sun.sunset.getTime();
  if (now < sunrise - TWILIGHT_MS) return 'night';
  if (now < sunrise + TWILIGHT_MS) return 'dawn';
  if (now < sunset - TWILIGHT_MS) return 'day';
  if (now < sunset + TWILIGHT_MS) return 'dusk';
  return 'night';
}

export function useSkyTint(sun: SunInfo | null): void {
  useEffect(() => {
    const apply = () => {
      const sky = classify(Date.now(), sun);
      document.documentElement.setAttribute('data-sky', sky);
    };
    apply();
    const id = window.setInterval(apply, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [sun]);
}
