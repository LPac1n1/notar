/**
 * Tiny dependency-free sparkline. Receives N pairs of (a, b) values and
 * draws each pair as two stacked vertical bars — left bar is `a`
 * (e.g. abatement), right bar is `b` (e.g. credit). Color comes from
 * `aTone`/`bTone` so consumers can match the surrounding palette.
 *
 * Empty values (both 0) still render as faint placeholders so the
 * horizontal width communicates "history of the relationship" even when
 * a month was silent — see comment in donorHistory.js for the UX
 * rationale.
 */
export default function Sparkline({
  data = [],
  width = 168,
  height = 36,
  aTone = "var(--accent)",
  bTone = "var(--success)",
  aLabel = "Série A",
  bLabel = "Série B",
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const max = data.reduce(
    (acc, item) => Math.max(acc, item.a ?? 0, item.b ?? 0),
    0,
  );
  const slotWidth = width / data.length;
  const barWidth = Math.max(2, slotWidth / 2.6);
  const gap = (slotWidth - barWidth * 2) / 3;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Mini-gráfico: ${aLabel} em ${aTone}, ${bLabel} em ${bTone}`}
      className="block"
    >
      {data.map((item, index) => {
        const slotX = index * slotWidth;
        const a = Number(item.a ?? 0);
        const b = Number(item.b ?? 0);
        const aHeight = max > 0 ? (a / max) * height : 0;
        const bHeight = max > 0 ? (b / max) * height : 0;

        // Sub-pixel floors used so 0-value bars still draw a faint
        // 1px marker — keeps the rhythm of the X axis visible.
        const safeAHeight = Math.max(aHeight, a === 0 ? 1 : 2);
        const safeBHeight = Math.max(bHeight, b === 0 ? 1 : 2);

        return (
          <g key={index}>
            <rect
              x={slotX + gap}
              y={height - safeAHeight}
              width={barWidth}
              height={safeAHeight}
              rx={1}
              fill={aTone}
              fillOpacity={a === 0 ? 0.22 : 0.85}
            />
            <rect
              x={slotX + gap * 2 + barWidth}
              y={height - safeBHeight}
              width={barWidth}
              height={safeBHeight}
              rx={1}
              fill={bTone}
              fillOpacity={b === 0 ? 0.22 : 0.85}
            />
          </g>
        );
      })}
    </svg>
  );
}
