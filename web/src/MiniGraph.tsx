import type { Graph } from './types';
export function MiniGraph({
  graph,
  maximum,
  selected,
  onPoint,
}: {
  graph: Graph;
  maximum?: number;
  selected?: number;
  onPoint?: (point: number) => void;
}) {
  if (!graph.points.length)
    return (
      <div className="empty-graph">
        <svg viewBox="0 0 280 110" aria-hidden="true">
          <path d="M10 25H270M10 60H270M10 95H270" stroke="currentColor" strokeDasharray="3 5" />
        </svg>
        <span>A little practice goes here.</span>
      </div>
    );
  const values = graph.points.flatMap((p) => [p.primary, p.secondary ?? 0]);
  const max = maximum ?? Math.max(1, ...values) * 1.12;
  const x = (i: number) => 20 + (i * 240) / Math.max(1, graph.points.length - 1);
  const y = (v: number) => 100 - (v / max) * 84;
  return (
    <div className="chart-wrap">
      <svg
        viewBox="0 0 280 116"
        role="img"
        aria-label={`${graph.title}, ${graph.points.length} actual points`}
      >
        <path
          d="M20 16H266M20 58H266M20 100H266"
          stroke="var(--chart-grid, #dfe5da)"
          strokeDasharray="3 5"
        />
        <text x="2" y="18">
          {Math.round(max)}
        </text>
        <text x="7" y="103">
          0
        </text>
        {graph.points.map((p, i) => (
          <g key={i}>
            {p.secondary !== null && (
              <circle cx={x(i)} cy={y(p.secondary)} r="3" fill="var(--chart-secondary, #c19641)" />
            )}
            <circle
              cx={x(i)}
              cy={y(p.primary)}
              r={selected === i ? 5 : 3.5}
              fill={
                selected === i ? 'var(--chart-selected, #173d38)' : 'var(--chart-primary, #729078)'
              }
              onClick={() => onPoint?.(i)}
              style={{ cursor: onPoint ? 'pointer' : 'default' }}
            >
              <title>
                {p.detail[0]} · {p.primary.toFixed(1)}
              </title>
            </circle>
            {p.milestone && (
              <path
                d={`M${x(i)} ${y(p.secondary ?? p.primary) - 8}l-4 -6h8Z`}
                fill="var(--chart-selected, #173d38)"
              />
            )}
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i />
          {graph.primary_label}
        </span>
        {graph.secondary_label && (
          <span>
            <i className="amber" />
            {graph.secondary_label}
          </span>
        )}
      </div>
    </div>
  );
}
