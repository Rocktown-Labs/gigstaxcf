import { Label, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";

interface MonthlyPlatformDonutDatum {
  colorHex: string;
  name: string;
  value: number;
}

interface MonthlyPlatformDonutProps {
  data: MonthlyPlatformDonutDatum[];
  monthlyTotal: number;
}

const chartConfig = {
  earnings: {
    label: "Earnings",
  },
} satisfies ChartConfig;

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;

export const MonthlyPlatformDonut = ({
  data,
  monthlyTotal,
}: MonthlyPlatformDonutProps) => {
  const hasData = data.length > 0 && monthlyTotal > 0;
  const chartData = hasData
    ? data.map((item) => ({
        fill: item.colorHex,
        name: item.name,
        value: item.value,
      }))
    : [
        {
          fill: "hsl(var(--muted))",
          name: "No data",
          value: 1,
        },
      ];

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square h-[220px] w-full max-w-[260px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, name) => {
                if (!hasData) {
                  return (
                    <span className="font-medium">No monthly data yet</span>
                  );
                }

                return (
                  <span className="font-medium">
                    {name}: {formatCurrency(Number(value))}
                  </span>
                );
              }}
            />
          }
        />
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={62}
          outerRadius={84}
          strokeWidth={5}
          isAnimationActive={false}
        >
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                return null;
              }

              return (
                <text
                  x={viewBox.cx}
                  y={viewBox.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  <tspan
                    x={viewBox.cx}
                    y={viewBox.cy}
                    className="fill-foreground text-lg font-bold"
                  >
                    {formatCurrency(monthlyTotal)}
                  </tspan>
                  <tspan
                    x={viewBox.cx}
                    y={(viewBox.cy || 0) + 22}
                    className="fill-muted-foreground text-xs"
                  >
                    This month
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
};
