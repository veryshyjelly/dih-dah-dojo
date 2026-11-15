import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { MiniGraph } from './MiniGraph';
import type { Graph } from './types';

export function ProgressStats({ values }: { values: [string | number, string][] }) {
  return (
    <div className="progress-stat-row lp-stats">
      {values.map(([value, label]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
export function ProgressRange({
  value,
  onChange,
  label = 'Independent answer range',
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={30}>Latest 30</option>
        <option value={100}>Latest 100</option>
        <option value={0}>All history</option>
      </select>
    </label>
  );
}
export function ProgressPagination({
  page,
  count,
  size = 10,
  onChange,
  label,
}: {
  page: number;
  count: number;
  size?: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(count / size)),
    current = Math.min(page, pages - 1);
  if (count <= size)
    return (
      <p className="lp-list-count">
        {count} {label.toLowerCase()}
      </p>
    );
  return (
    <nav className="lp-pagination" aria-label={`${label} pagination`}>
      <span>
        {current * size + 1}–{Math.min(count, (current + 1) * size)} of {count}
      </span>
      <div>
        <button
          className="button secondary"
          disabled={current === 0}
          onClick={() => onChange(current - 1)}
        >
          <ArrowLeft size={15} />
          Previous<span className="sr-only"> {label.toLowerCase()}</span>
        </button>
        <button
          className="button secondary"
          disabled={current + 1 >= pages}
          onClick={() => onChange(current + 1)}
        >
          Next<span className="sr-only"> {label.toLowerCase()}</span>
          <ArrowRight size={15} />
        </button>
      </div>
    </nav>
  );
}
export function ProgressChart({ graph }: { graph: Graph }) {
  const [open, setOpen] = useState(false),
    [point, setPoint] = useState(0);
  const current = Math.min(point, Math.max(0, graph.points.length - 1));
  return (
    <article className="graph-card lp-chart">
      <h3>{graph.title}</h3>
      <p>{graph.context}</p>
      <MiniGraph
        maximum={graph.title.toLowerCase().includes('accuracy') ? 100 : undefined}
        graph={graph}
        selected={open ? current : undefined}
        onPoint={(i) => {
          setOpen(true);
          setPoint(i);
        }}
      />
      <button className="text-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Inspect <ArrowUpRight size={14} />
      </button>
      {open && (
        <div
          className="lp-point-detail"
          tabIndex={0}
          aria-label={`${graph.title} point details`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              setPoint(
                Math.max(
                  0,
                  Math.min(graph.points.length - 1, current + (e.key === 'ArrowRight' ? 1 : -1)),
                ),
              );
            }
          }}
        >
          {graph.points.length ? (
            <>
              <label>
                Recorded point
                <input
                  aria-label={`${graph.title} point`}
                  type="range"
                  min={0}
                  max={Math.max(0, graph.points.length - 1)}
                  value={current}
                  onChange={(e) => setPoint(Number(e.target.value))}
                />
              </label>
              <p>
                {graph.primary_label}: {graph.points[current].primary.toFixed(1)}
                {graph.points[current].secondary !== null
                  ? ` · ${graph.secondary_label}: ${graph.points[current].secondary!.toFixed(1)}`
                  : ''}
              </p>
              {graph.points[current].detail.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </>
          ) : (
            <p>No eligible activity yet.</p>
          )}
        </div>
      )}
    </article>
  );
}
export function FocusedProgressDetail({
  identity,
  children,
  label,
}: {
  identity: string;
  children: React.ReactNode;
  label: string;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    element.current?.focus({ preventScroll: true });
    element.current?.scrollIntoView({
      block: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [identity]);
  return (
    <section ref={element} tabIndex={-1} className="lp-focused-detail" aria-label={label}>
      {children}
    </section>
  );
}
