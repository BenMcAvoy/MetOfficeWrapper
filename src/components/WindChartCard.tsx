import type { HourlyForecast, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind } from 'lucide-react';
import { WindChart, type ChartEvent } from '@/components/charts';

interface WindChartCardProps {
  title: string;
  forecasts: HourlyForecast[];
  historyForecasts?: WindForecastPoint[];
  startRefLine?: number;
  liveWindHistory?: LiveWindHistoryPoint[];
  includePastHours?: number;
  events?: ChartEvent[];
}

export default function WindChartCard({
  title,
  forecasts,
  historyForecasts = [],
  startRefLine,
  liveWindHistory = [],
  includePastHours = 0,
  events = [],
}: WindChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wind className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <WindChart
          forecasts={forecasts}
          historyForecasts={historyForecasts}
          startRefLine={startRefLine}
          liveHistory={liveWindHistory}
          includePastHours={includePastHours}
          events={events}
        />
      </CardContent>
    </Card>
  );
}
