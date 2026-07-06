"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartDatum = { label: string; value: number; color?: string };

const DEFAULT_COLOR = "#6366f1";

function allZero(data: ChartDatum[]): boolean {
  return data.length === 0 || data.every((d) => d.value === 0);
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-slate-400"
      style={{ height }}
    >
      No data for the selected filters.
    </div>
  );
}

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e2e8f0",
} as const;

/**
 * Bar chart. `orientation="horizontal"` grows bars rightward (best for long
 * category labels); `"vertical"` grows them upward (best for time series).
 */
export function BarChartCard({
  data,
  orientation = "horizontal",
  height = 260,
}: {
  data: ChartDatum[];
  orientation?: "horizontal" | "vertical";
  height?: number;
}) {
  if (allZero(data)) return <EmptyChart height={height} />;

  const barsGrowRight = orientation === "horizontal";

  return (
    <div style={{ width: "100%", height, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={barsGrowRight ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          {barsGrowRight ? (
            <>
              <XAxis
                type="number"
                allowDecimals={false}
                stroke="#94a3b8"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                stroke="#94a3b8"
                fontSize={12}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
              <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
            </>
          )}
          <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={tooltipStyle} />
          <Bar dataKey="value" name="Count" radius={4} maxBarSize={40}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? DEFAULT_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
