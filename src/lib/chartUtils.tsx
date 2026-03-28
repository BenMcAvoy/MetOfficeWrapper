interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  textAnchor?: 'inherit' | 'end' | 'middle' | 'start';
  unit?: string;
}

export function XAxisTick({ x = 0, y = 0, payload, textAnchor = 'middle' }: TickProps) {
  return (
    <text x={x} y={y + 4} textAnchor={textAnchor} className="fill-muted-foreground" fontSize={10}>
      {payload?.value}
    </text>
  );
}

export function YAxisTick({ x = 0, y = 0, payload, unit = '' }: TickProps) {
  return (
    <text x={x} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
      {payload?.value}{unit}
    </text>
  );
}

export const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--card-foreground)',
  },
  labelStyle: { color: 'var(--muted-foreground)' },
  itemStyle: { color: 'var(--foreground)' },
};
