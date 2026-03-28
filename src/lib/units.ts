export const MS_TO_KNOTS = 1.94384;
export const MS_TO_MPH = 2.23694;

export function msToKnots(ms: number): number {
  return ms * MS_TO_KNOTS;
}

export function beaufortScale(knots: number): { force: number; description: string } {
  if (knots < 1) return { force: 0, description: 'Calm' };
  if (knots <= 3) return { force: 1, description: 'Light air' };
  if (knots <= 6) return { force: 2, description: 'Light breeze' };
  if (knots <= 10) return { force: 3, description: 'Gentle breeze' };
  if (knots <= 16) return { force: 4, description: 'Moderate breeze' };
  if (knots <= 21) return { force: 5, description: 'Fresh breeze' };
  if (knots <= 27) return { force: 6, description: 'Strong breeze' };
  if (knots <= 33) return { force: 7, description: 'Near gale' };
  if (knots <= 40) return { force: 8, description: 'Gale' };
  if (knots <= 47) return { force: 9, description: 'Severe gale' };
  if (knots <= 55) return { force: 10, description: 'Storm' };
  if (knots <= 63) return { force: 11, description: 'Violent storm' };
  return { force: 12, description: 'Hurricane' };
}

export function beaufortColor(force: number): string {
  if (force <= 3) return 'text-emerald-400';
  if (force <= 5) return 'text-yellow-400';
  if (force <= 7) return 'text-orange-400';
  return 'text-red-500';
}

export function beaufortBg(force: number): string {
  if (force <= 3) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (force <= 5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  if (force <= 7) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

export function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
