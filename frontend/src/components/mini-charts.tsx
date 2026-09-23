/**
 * The dashboard's charts, without a charting dependency.
 *
 * This project ships no chart library (Leaflet is there for maps, nothing for
 * graphs), and a dashboard needs a few bars — so the geometry is a little SVG
 * and CSS instead of a new runtime. Both components draw into a fixed viewBox
 * (or a percentage width) and let the browser scale the result, so they stay
 * readable at phone widths without measuring anything in JavaScript. Every bar
 * carries a <title>, which is the tooltip and the accessible name at once.
 */

export type ChartSeries = {
  label: string;
  color: string;
};

export type ChartGroup = {
  label: string;
  /** One value per series, in the same order as the `series` prop. */
  values: number[];
};

const AXIS_TEXT = "#617068";
const GRID_LINE = "#eeeae2";

type GroupedBarChartProps = {
  groups: ChartGroup[];
  series: ChartSeries[];
  formatValue: (value: number) => string;
  /** Shown instead of the plot when every value is zero. */
  emptyLabel?: string;
  height?: number;
};

const VB_WIDTH = 640;
const PAD_LEFT = 58;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;

/** Grouped columns: one column per series per group, with value gridlines. */
export function GroupedBarChart({
  groups,
  series,
  formatValue,
  emptyLabel = "Nothing recorded for this period yet.",
  height = 200,
}: GroupedBarChartProps) {
  const values = groups.flatMap((group) => group.values);
  const max = Math.max(0, ...values);
  if (groups.length === 0 || max <= 0) {
    return (
      <p className="rounded-xl bg-[#faf9f5] px-4 py-8 text-center text-xs text-[#617068]">{emptyLabel}</p>
    );
  }

  const plotWidth = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const groupWidth = plotWidth / groups.length;
  // A small gap keeps neighbouring groups apart without wasting the plot.
  const barWidth = Math.max(2, (groupWidth * 0.72) / series.length);
  // Phone widths cannot show 12 x-labels; thin them out as the series grows.
  const labelEvery = Math.max(1, Math.ceil(groups.length / 7));
  const gridSteps = [0, 0.5, 1];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${series.map((entry) => entry.label).join(" and ")} per period, from ${groups[0].label} to ${groups[groups.length - 1].label}`}
      >
        {gridSteps.map((step) => {
          const y = PAD_TOP + plotHeight - plotHeight * step;
          return (
            <g key={step}>
              <line x1={PAD_LEFT} x2={VB_WIDTH - PAD_RIGHT} y1={y} y2={y} stroke={GRID_LINE} strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {formatValue(max * step)}
              </text>
            </g>
          );
        })}

        {groups.map((group, groupIndex) => {
          const groupX = PAD_LEFT + groupIndex * groupWidth;
          const slotWidth = groupWidth * 0.72;
          const offset = (groupWidth - slotWidth) / 2;
          return (
            <g key={`${group.label}-${groupIndex}`}>
              {group.values.map((value, seriesIndex) => {
                const barHeight = Math.max(0, (value / max) * plotHeight);
                const x = groupX + offset + seriesIndex * barWidth;
                return (
                  <rect
                    key={seriesIndex}
                    x={x}
                    y={PAD_TOP + plotHeight - barHeight}
                    width={Math.max(1, barWidth - 1)}
                    height={barHeight}
                    rx={2}
                    fill={series[seriesIndex]?.color ?? "#26352f"}
                  >
                    <title>{`${group.label} — ${series[seriesIndex]?.label ?? ""}: ${formatValue(value)}`}</title>
                  </rect>
                );
              })}
              {groupIndex % labelEvery === 0 && (
                <text
                  x={groupX + groupWidth / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={AXIS_TEXT}
                >
                  {group.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((entry) => (
          <span key={entry.label} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#617068]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type HorizontalBarsProps = {
  items: { label: string; value: number }[];
  formatValue: (value: number) => string;
  emptyLabel?: string;
  color?: string;
  /** How many rows to show; the rest are summarised. */
  limit?: number;
};

/** Ranked bars — accounts, categories — as plain rows of label, value, bar. */
export function HorizontalBars({
  items,
  formatValue,
  emptyLabel = "Nothing recorded for this period yet.",
  color = "#b36b3c",
  limit,
}: HorizontalBarsProps) {
  const ranked = [...items].sort((a, b) => b.value - a.value);
  const shown = limit ? ranked.slice(0, limit) : ranked;
  const hidden = ranked.length - shown.length;
  const max = Math.max(0, ...shown.map((item) => item.value));

  if (shown.length === 0 || max <= 0) {
    return (
      <p className="rounded-xl bg-[#faf9f5] px-4 py-8 text-center text-xs text-[#617068]">{emptyLabel}</p>
    );
  }

  return (
    <ul className="space-y-3">
      {shown.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-xs font-semibold text-[#26352f]">{item.label}</span>
            <span className="shrink-0 text-xs font-bold text-[#26352f]">{formatValue(item.value)}</span>
          </div>
          <div
            className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#f2efe8]"
            role="img"
            aria-label={`${item.label}: ${formatValue(item.value)}`}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
      {hidden > 0 && (
        <li className="pt-1 text-[11px] text-[#617068]">
          +{hidden} more not shown
        </li>
      )}
    </ul>
  );
}
