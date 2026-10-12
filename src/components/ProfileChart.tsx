import { profile, type ProfileOpts } from '../model/layout';

interface Props {
  opts: ProfileOpts;
  diameter: number; // in
  depth: number; // in (effective)
  compare?: { opts: ProfileOpts; diameter: number; depth: number; label: string };
  label: string;
}

/** Dimple cross-section, drawn at true horizontal scale with vertical exaggeration. */
export function ProfileChart({ opts, diameter, depth, compare, label }: Props) {
  const W = 560, H = 170;
  const m = { l: 44, r: 14, t: 26, b: 30 };
  const maxD = Math.max(diameter, compare?.diameter ?? 0) * 1.15;
  const maxDepth = Math.max(depth, compare?.depth ?? 0, 0.002) * 1.25;
  const sx = (x: number) => m.l + ((x + maxD / 2) / maxD) * (W - m.l - m.r);
  const sy = (y: number) => m.t + (y / maxDepth) * (H - m.t - m.b);
  const path = (o: ProfileOpts, dia: number, dep: number) => {
    const pts: string[] = [];
    const R = dia / 2;
    pts.push(`${sx(-maxD / 2)},${sy(0)}`);
    for (let i = 0; i <= 160; i++) {
      const x = -R + (2 * R * i) / 160;
      const rho = Math.abs(x) / R;
      pts.push(`${sx(x).toFixed(1)},${sy(profile(rho, o) * dep).toFixed(1)}`);
    }
    pts.push(`${sx(maxD / 2)},${sy(0)}`);
    return pts.join(' ');
  };
  const exag = (W - m.l - m.r) / maxD / ((H - m.t - m.b) / maxDepth);
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">Dimple cross-section</span>
        <span className="legend">
          <span className="legend-item"><svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke="var(--series-1)" strokeWidth="2" /></svg>{label}</span>
          {compare && <span className="legend-item"><svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke="var(--series-2)" strokeWidth="2" strokeDasharray="4 3" /></svg>{compare.label}</span>}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dimple cross-section profile">
        <line x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} className="axis" />
        <text x={W - m.r} y={H - 6} className="axis-label" textAnchor="end">width (in) · vertical ×{(1 / exag).toFixed(0)}</text>
        {[-0.08, -0.04, 0, 0.04, 0.08].filter((v) => Math.abs(v) < maxD / 2).map((v) => (
          <text key={v} x={sx(v)} y={H - m.b + 14} className="tick" textAnchor="middle">{v.toFixed(2)}</text>
        ))}
        <text x={m.l - 6} y={sy(0)} className="tick" textAnchor="end" dominantBaseline="middle">0</text>
        <text x={m.l - 6} y={sy(depth)} className="tick" textAnchor="end" dominantBaseline="middle">{depth.toFixed(4)}</text>
        <line x1={m.l} x2={W - m.r} y1={sy(depth)} y2={sy(depth)} className="grid" />
        {compare && <polyline points={path(compare.opts, compare.diameter, compare.depth)} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="6 4" />}
        <polyline points={path(opts, diameter, depth)} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
      </svg>
    </figure>
  );
}
