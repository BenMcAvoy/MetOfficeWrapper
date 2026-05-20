import type { LucideIcon } from 'lucide-react';
import {
  Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudDrizzle,
  CloudSnow, CloudLightning, CloudHail, Snowflake
} from 'lucide-react';

export interface WeatherInfo {
  description: string;
  Icon: LucideIcon;
  isRainy: boolean;
}

const WEATHER_CODES: Record<number, WeatherInfo> = {
  0:  { description: 'Clear night',          Icon: Sun,            isRainy: false },
  1:  { description: 'Sunny',                Icon: Sun,            isRainy: false },
  2:  { description: 'Partly cloudy',        Icon: CloudSun,       isRainy: false },
  3:  { description: 'Partly cloudy',        Icon: CloudSun,       isRainy: false },
  5:  { description: 'Mist',                 Icon: CloudFog,       isRainy: false },
  6:  { description: 'Fog',                  Icon: CloudFog,       isRainy: false },
  7:  { description: 'Cloudy',               Icon: Cloud,          isRainy: false },
  8:  { description: 'Overcast',             Icon: Cloud,          isRainy: false },
  9:  { description: 'Light rain shower',    Icon: CloudDrizzle,   isRainy: true  },
  10: { description: 'Light rain shower',    Icon: CloudDrizzle,   isRainy: true  },
  11: { description: 'Drizzle',              Icon: CloudDrizzle,   isRainy: true  },
  12: { description: 'Light rain',           Icon: CloudRain,      isRainy: true  },
  13: { description: 'Heavy rain shower',    Icon: CloudRain,      isRainy: true  },
  14: { description: 'Heavy rain shower',    Icon: CloudRain,      isRainy: true  },
  15: { description: 'Heavy rain',           Icon: CloudRain,      isRainy: true  },
  16: { description: 'Sleet shower',         Icon: CloudSnow,      isRainy: true  },
  17: { description: 'Sleet shower',         Icon: CloudSnow,      isRainy: true  },
  18: { description: 'Sleet',               Icon: CloudSnow,      isRainy: true  },
  19: { description: 'Hail shower',          Icon: CloudHail,      isRainy: true  },
  20: { description: 'Hail shower',          Icon: CloudHail,      isRainy: true  },
  21: { description: 'Hail',                 Icon: CloudHail,      isRainy: true  },
  22: { description: 'Light snow shower',    Icon: CloudSnow,      isRainy: false },
  23: { description: 'Light snow shower',    Icon: CloudSnow,      isRainy: false },
  24: { description: 'Light snow',           Icon: Snowflake,      isRainy: false },
  25: { description: 'Heavy snow shower',    Icon: CloudSnow,      isRainy: false },
  26: { description: 'Heavy snow shower',    Icon: CloudSnow,      isRainy: false },
  27: { description: 'Heavy snow',           Icon: Snowflake,      isRainy: false },
  28: { description: 'Thunderstorm',         Icon: CloudLightning, isRainy: true  },
  29: { description: 'Thunderstorm',         Icon: CloudLightning, isRainy: true  },
  30: { description: 'Thunder',              Icon: CloudLightning, isRainy: true  },
};

const FALLBACK: WeatherInfo = { description: 'Unknown', Icon: Cloud, isRainy: false };

export function getWeatherInfo(code: number): WeatherInfo {
  return WEATHER_CODES[code] ?? FALLBACK;
}

// Returns a CSS color (a var()) for a weather icon, mapped to themed accents
// so the forecast strip glance-reads at a distance.
export function getWeatherIconColor(code: number): string {
  if (code === 0 || code === 1) return 'var(--accent-gold)';        // clear / sunny
  if (code === 2 || code === 3) return 'var(--warn)';               // partly cloudy
  if (code === 5 || code === 6) return 'var(--muted-foreground)';   // mist / fog
  if (code === 7 || code === 8) return 'var(--muted-foreground)';   // cloudy / overcast
  if (code >= 9 && code <= 18) return 'var(--primary)';             // rain / sleet
  if (code >= 19 && code <= 21) return 'var(--destructive)';        // hail
  if (code >= 22 && code <= 27) return 'var(--accent-offshore)';    // snow
  if (code >= 28) return 'var(--destructive)';                      // thunder
  return 'var(--primary)';
}

export function visibilityLabel(metres: number): string {
  if (metres < 1000) return `Poor (${metres}m)`;
  if (metres < 4000) return `Moderate (${(metres / 1000).toFixed(1)}km)`;
  if (metres < 10000) return `Good (${(metres / 1000).toFixed(0)}km)`;
  return `Excellent (${(metres / 1000).toFixed(0)}km)`;
}
