import type { HourlyForecast, LiveWindHistoryPoint, WindForecastPoint } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind } from 'lucide-react';
import { WindChart } from '@/components/charts';
import type { ForecastChartInput } from '@/lib/windChartData';

interface WindChartCardProps {
  title: string;
  forecasts: HourlyForecast[];
  historyForecasts?: WindForecastPoint[];
  comparisonForecasts?: ForecastChartInput[];
  startRefLine?: number;
  liveWindHistory?: LiveWindHistoryPoint[];
  includePastHours?: number;
}

export default function WindChartCard({
  title,
  forecasts,
  historyForecasts = [],
  comparisonForecasts,
  startRefLine,
  liveWindHistory = [],
  includePastHours = 0,
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
          comparisonForecasts={comparisonForecasts}
          startRefLine={startRefLine}
          liveHistory={liveWindHistory}
          includePastHours={includePastHours}
        />
      </CardContent>
    </Card>
  );
}
