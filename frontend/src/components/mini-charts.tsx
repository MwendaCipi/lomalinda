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

type TrendLineChartProps = {
  /** One entry per period, each holding one value per series. */
  points: { label: string; values: number[] }[];
  series: ChartSeries[];
  formatValue: (value: number) => string;
  emptyLabel?: string;
  height?: number;
};

/**
 * Two trends over time, as lines rather than columns.
 *
 * A year of giving and spending as 24 columns is unreadable at phone width,
 * while two lines keep the shape — and the gap between them — visible. Each
 * point carries a <title> for the exact figure.
 */
export function TrendLineChart({
  points,
  series,
  formatValue,
  emptyLabel = "Nothing recorded for this period yet.",
  height = 220,
}: TrendLineChartProps) {
  const values = points.flatMap((point) => point.values);
  const max = Math.max(0, ...values);
  if (points.length === 0 || max <= 0) {
    return <p className="rounded-xl bg-[#faf9f5] px-4 py-8 text-center text-xs text-[#617068]">{emptyLabel}</p>;
  }

  const plotWidth = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xAt = (index: number) => (points.length > 1 ? PAD_LEFT + index * step : PAD_LEFT + plotWidth / 2);
  const yAt = (value: number) => PAD_TOP + plotHeight - (value / max) * plotHeight;
  // Twelve month labels do not fit on a phone; show every other one.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const showDots = points.length <= 14;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${VB_WIDTH} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${series.map((entry) => entry.label).join(" and ")} per period, from ${points[0].label} to ${points[points.length - 1].label}`}
      >
        {[0, 0.5, 1].map((fraction) => {
          const y = PAD_TOP + plotHeight - plotHeight * fraction;
          return (
            <g key={fraction}>
              <line x1={PAD_LEFT} x2={VB_WIDTH - PAD_RIGHT} y1={y} y2={y} stroke={GRID_LINE} strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {formatValue(max * fraction)}
              </text>
            </g>
          );
        })}

        {series.map((entry, seriesIndex) => {
          const coordinates = points.map((point, index) => [xAt(index), yAt(point.values[seriesIndex] ?? 0)]);
          const line = coordinates.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          const area = `M ${coordinates[0][0].toFixed(1)},${PAD_TOP + plotHeight} L ${line.replace(/ /g, " L ")} L ${coordinates[coordinates.length - 1][0].toFixed(1)},${PAD_TOP + plotHeight} Z`;
          return (
            <g key={entry.label}>
              <path d={area} fill={entry.color} opacity={0.12} />
              <polyline points={line} fill="none" stroke={entry.color} strokeWidth={2.5} strokeLinejoin="round" />
              {showDots &&
                coordinates.map(([x, y], index) => (
                  <circle key={index} cx={x} cy={y} r={3} fill="#fff" stroke={entry.color} strokeWidth={2}>
                    <title>{`${points[index].label} — ${entry.label}: ${formatValue(points[index].values[seriesIndex] ?? 0)}`}</title>
                  </circle>
                ))}
            </g>
          );
        })}

        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <text
              key={`${point.label}-${index}`}
              x={xAt(index)}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill={AXIS_TEXT}
            >
              {point.label}
            </text>
          ) : null,
        )}
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

const COMPOSITION_COLORS = ["#26352f", "#5f8067", "#b36b3c", "#8a7a5c", "#4d6d55", "#96552c"];

type CompositionBarProps = {
  items: { label: string; total: number; count?: number }[];
  formatValue: (value: number) => string;
  emptyLabel?: string;
};

/** One bar split by share, with the amounts beside it — where the money sits. */
export function CompositionBar({ items, formatValue, emptyLabel = "Nothing to show yet." }: CompositionBarProps) {
  const positive = items.filter((item) => item.total > 0);
  const total = positive.reduce((sum, item) => sum + item.total, 0);
  if (positive.length === 0 || total <= 0) {
    return <p className="rounded-xl bg-[#faf9f5] px-4 py-6 text-center text-xs text-[#617068]">{emptyLabel}</p>;
  }

  const share = (value: number) => (value / total) * 100;

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-[#f2efe8]"
        role="img"
        aria-label={positive
          .map((item) => `${item.label}: ${formatValue(item.total)} (${share(item.total).toFixed(0)}%)`)
          .join(", ")}
      >
        {positive.map((item, index) => (
          <span
            key={item.label}
            className="h-full"
            style={{ width: `${share(item.total)}%`, backgroundColor: COMPOSITION_COLORS[index % COMPOSITION_COLORS.length] }}
            title={`${item.label}: ${formatValue(item.total)}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {positive.map((item, index) => (
          <li key={item.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-[#617068]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: COMPOSITION_COLORS[index % COMPOSITION_COLORS.length] }}
              />
              <span className="truncate font-semibold text-[#26352f]">{item.label}</span>
              {typeof item.count === "number" && <span className="shrink-0">{item.count}</span>}
            </span>
            <span className="shrink-0 font-bold text-[#26352f]">
              {formatValue(item.total)} <span className="font-semibold text-[#617068]">{share(item.total).toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type DonutChartProps = {
  items: { label: string; value: number; color: string }[];
  /** Value at the centre of the ring; formatted by the caller. */
  centerLabel: string;
  centerValue: string;
  emptyLabel?: string;
};

/** A donut: one ring slice per item, remainder to 100% shown as neutral. */
export function DonutChart({ items, centerLabel, centerValue, emptyLabel = "Nothing to show yet." }: DonutChartProps) {
  const positive = items.filter((item) => item.value > 0);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (positive.length === 0 || total <= 0) {
    return <p className="rounded-xl bg-[#faf9f5] px-4 py-6 text-center text-xs text-[#617068]">{emptyLabel}</p>;
  }

  const radius = 15.915; // circumference = 100, so a stroke dash is a percentage
  const circumference = 2 * Math.PI * radius;
  let offset = 25; // start at 12 o'clock
  const segments = positive.map((item) => {
    const share = (item.value / total) * 100;
    const seg = { ...item, share, dash: `${share} ${100 - share}`, offset };
    offset -= share;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 42 42" className="h-36 w-36 shrink-0 -rotate-0" role="img" aria-label={positive.map((i) => `${i.label}: ${i.value.toFixed(0)}%`).join(", ")}>
        {/* The neutral remainder — the part not yet given of the whole. */}
        <circle cx="21" cy="21" r={radius} fill="none" stroke="#eeeae2" strokeWidth="5" />
        {segments.map((seg) => (
          <circle
            key={seg.label}
            cx="21"
            cy="21"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="5"
            strokeDasharray={seg.dash}
            strokeDashoffset={seg.offset}
          >
            <title>{`${seg.label}: ${seg.share.toFixed(1)}%`}</title>
          </circle>
        ))}
        <text x="21" y="20" textAnchor="middle" dominantBaseline="middle" className="fill-[#26352f]" style={{ fontSize: 5, fontWeight: 700 }}>
          {centerValue}
        </text>
        <text x="21" y="26.5" textAnchor="middle" dominantBaseline="middle" className="fill-[#617068]" style={{ fontSize: 2.6 }}>
          {centerLabel}
        </text>
      </svg>
      <ul className="w-full space-y-2">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-[#617068]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="truncate font-semibold text-[#26352f]">{seg.label}</span>
            </span>
            <span className="shrink-0 font-bold text-[#26352f]">{seg.share.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
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
