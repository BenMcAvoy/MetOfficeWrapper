import type { HourlyForecast, LiveWindHistoryPoint } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind } from 'lucide-react';
import { WindChart } from '@/components/charts';

interface WindChartCardProps {
  title: string;
  forecasts: HourlyForecast[];
  startRefLine?: number;
  liveWindHistory?: LiveWindHistoryPoint[];
  includePastHours?: number;
}

export default function WindChartCard({
  title,
  forecasts,
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
          startRefLine={startRefLine}
          liveHistory={liveWindHistory}
          includePastHours={includePastHours}
        />
      </CardContent>
    </Card>
  );
}
