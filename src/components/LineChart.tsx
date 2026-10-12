import { useMemo, useRef, useState } from 'react';

export interface Series {
  id: string;
  label: string;
  color: string;
  dashed?: boolean;
  points: { x: number; y: number }[];
}

interface Props {
  title: string;
  series: Series[];
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  height?: number;
  /** keep 1:1 data aspect (e.g. trajectories); otherwise fill */
  equalAspect?: boolean;
  xDomain?: [number, number];
  yDomain?: [number, number];
  yDecimals?: number;
  xDecimals?: number;
  symmetricY?: boolean;
  markers?: { x: number; label: string }[];
}

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v);
  return out;
}

export function LineChart({
  title, series, xLabel, yLabel, xUnit = '', yUnit = '', height = 220, xDomain, yDomain,
  yDecimals = 1, xDecimals = 0, symmetricY, markers,
}: Props) {
  const W = 560;
  const H = height;
  const m = { l: 44, r: 14, t: 10, b: 34 };
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const dom = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) for (const p of s.points) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (!isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
    if (xDomain) [x0, x1] = xDomain;
    if (yDomain) [y0, y1] = yDomain;
    else {
      const pad = (y1 - y0) * 0.08 || 1;
      y1 += pad;
      if (y0 >= 0 && y0 < (y1 - y0) * 0.6) y0 = 0; else y0 -= pad;
      if (symmetricY) { const a = Math.max(Math.abs(y0), Math.abs(y1), 1); y0 = -a; y1 = a; }
    }
    return { x0, x1, y0, y1 };
  }, [series, xDomain, yDomain, symmetricY]);

  const sx = (x: number) => m.l + ((x - dom.x0) / (dom.x1 - dom.x0 || 1)) * (W - m.l - m.r);
  const sy = (y: number) => H - m.b - ((y - dom.y0) / (dom.y1 - dom.y0 || 1)) * (H - m.t - m.b);
  const xt = niceTicks(dom.x0, dom.x1, 6);
  const yt = niceTicks(dom.y0, dom.y1, 4);

  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const x = dom.x0 + ((px - m.l) / (W - m.l - m.r)) * (dom.x1 - dom.x0);
    setHover(Math.min(dom.x1, Math.max(dom.x0, x)));
  };

  const nearest = (s: Series, x: number) => {
    let best: { x: number; y: number } | null = null;
    for (const p of s.points) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    if (!best) return null;
    const last = s.points[s.points.length - 1];
    if (x > last.x + (dom.x1 - dom.x0) * 0.01) return null;
    return best;
  };

  const tip = hover !== null ? series.map((s) => ({ s, p: nearest(s, hover) })).filter((t) => t.p) : [];

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">{title}</span>
        {series.length > 1 && (
          <span className="legend">
            {series.map((s) => (
              <span key={s.id} className="legend-item">
                <svg width="18" height="8" aria-hidden>
                  <line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinecap="round" />
                </svg>
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="chart-body">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}: ${yLabel} versus ${xLabel}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} className={v === 0 ? 'axis-zero' : 'grid'} />
              <text x={m.l - 6} y={sy(v)} className="tick" textAnchor="end" dominantBaseline="middle">{+v.toFixed(3)}</text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={`x${v}`} x={sx(v)} y={H - m.b + 14} className="tick" textAnchor="middle">{+v.toFixed(3)}</text>
          ))}
          <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} className="axis" />
          <text x={W - m.r} y={H - 4} className="axis-label" textAnchor="end">{xLabel}{xUnit && ` (${xUnit})`}</text>
          <text x={m.l + 6} y={m.t + 2} className="axis-label" dominantBaseline="hanging">{yLabel}{yUnit && ` (${yUnit})`}</text>
          {markers?.map((mk) => (
            <g key={mk.label}>
              <line x1={sx(mk.x)} x2={sx(mk.x)} y1={m.t} y2={H - m.b} className="marker" />
              <text x={sx(mk.x) + 4} y={m.t + 10} className="tick">{mk.label}</text>
            </g>
          ))}
          {[...series].reverse().map((s) => (
            <polyline
              key={s.id}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '6 4' : undefined}
              points={s.points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
            />
          ))}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={sx(hover)} x2={sx(hover)} y1={m.t} y2={H - m.b} className="crosshair" />
              {tip.map(({ s, p }) => (
                <circle key={s.id} cx={sx(p!.x)} cy={sy(p!.y)} r={4.5} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" />
        </svg>
        {hover !== null && tip.length > 0 && (
          <div className="tooltip" style={{ left: `${(sx(hover) / W) * 100}%` }}>
            <div className="tooltip-head">{xLabel} {hover.toFixed(xDecimals)}{xUnit && ` ${xUnit}`}</div>
            {tip.map(({ s, p }) => (
              <div key={s.id} className="tooltip-row">
                <span className="swatch" style={{ background: s.color }} />
                <span className="tooltip-label">{s.label}</span>
                <span className="tooltip-val">{p!.y.toFixed(yDecimals)}{yUnit && ` ${yUnit}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
