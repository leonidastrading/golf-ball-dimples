import { cellPlanes, cellPolygon, profile, KIND_PENT, KIND_ROUND, type CellPlane, type DimpleLayout, type ProfileOpts } from '../model/layout';
import { BALL_RADIUS_IN } from '../model/types';


/**
 * CAD-style wireframe of the dimples: iso-depth contour rings plus radial spokes
 * for every dimple, lifted onto the same displaced surface the mesh uses.
 * Returns line-segment vertex pairs (x,y,z per vertex).
 */
export function buildWireframe(L: DimpleLayout, opts: ProfileOpts, exaggeration: number, detail: 'normal' | 'fine' = 'normal'): Float32Array {
  const rings = detail === 'fine' ? 9 : 6;
  const spokes = detail === 'fine' ? 24 : 16;
  const seg = 48;
  const spokeSeg = 8;
  const out: number[] = [];
  const hexOpts: ProfileOpts = { ...opts, shape: 'hex' };
  const microOpts: ProfileOpts = { ...opts, shape: 'spherical', wallSteepness: 0.2 };

  for (let d = 0; d < L.total; d++) {
    const cx = L.centers[d * 3], cy = L.centers[d * 3 + 1], cz = L.centers[d * 3 + 2];
    const ex = L.axes[d * 3], ey = L.axes[d * 3 + 1], ez = L.axes[d * 3 + 2];
    const fx = cy * ez - cz * ey, fy = cz * ex - cx * ez, fz = cx * ey - cy * ex;
    const micro = L.isMicro[d] === 1;
    const hexLayout = opts.shape === 'hex' && !micro;
    const kind = L.kinds[d];
    const planes: CellPlane[] | null = L.cells && !micro && kind !== KIND_ROUND ? cellPlanes(L, d) : null;
    const poly = hexLayout && kind !== KIND_ROUND ? (kind === KIND_PENT ? 5 : 6) : 0;
    const po = micro || (hexLayout && kind === KIND_ROUND) ? microOpts : poly ? hexOpts : opts;
    const tr = Math.tan(L.radii[d]);
    const depth = (L.depths[d] / BALL_RADIUS_IN) * exaggeration;

    // polygon metric of a unit direction (1 for circles): distance scale to the rim at angle th
    const metric = (th: number) => {
      if (planes) {
        // rho of the unit direction th inside this cell (scaled to the dimple's inradius)
        let m = 0;
        const ux = Math.cos(th), uy = Math.sin(th);
        for (const q of planes) { const v = ((ux * q.ux + uy * q.uy) * tr) / q.h; if (v > m) m = v; }
        return m;
      }
      if (poly === 6) return Math.max(Math.abs(Math.cos(th)), Math.abs(Math.cos(th - Math.PI / 3)), Math.abs(Math.cos(th + Math.PI / 3)));
      if (poly === 5) {
        let m = -Infinity;
        for (let q = 0; q < 5; q++) m = Math.max(m, Math.cos(th - (2 * Math.PI * q) / 5));
        return m;
      }
      return 1;
    };
    const point = (rho: number, th: number) => {
      const rad = (rho * tr) / metric(th);
      const x = rad * Math.cos(th), y = rad * Math.sin(th);
      let px = cx + x * ex + y * fx, py = cy + x * ey + y * fy, pz = cz + x * ez + y * fz;
      const l = Math.hypot(px, py, pz);
      // lift slightly off the surface so lines don't z-fight with the mesh
      const s = (1 - profile(Math.min(0.999, rho), po) * depth + 0.0015) / l;
      px *= s; py *= s; pz *= s;
      return [px, py, pz];
    };
    const push = (a: number[], b: number[]) => out.push(a[0], a[1], a[2], b[0], b[1], b[2]);

    for (let k = 1; k <= rings; k++) {
      const rho = k / rings;
      let prev = point(rho, 0);
      for (let i = 1; i <= seg; i++) {
        const cur = point(rho, (2 * Math.PI * i) / seg);
        push(prev, cur);
        prev = cur;
      }
    }
    // spokes: for cells, run to every corner and edge midpoint (like a CAD mesh); otherwise evenly spaced
    let angles: number[];
    if (planes) {
      const pg = cellPolygon(planes, 4 * tr);
      angles = [];
      for (let k = 0; k < pg.length; k++) {
        const a = pg[k], b = pg[(k + 1) % pg.length];
        angles.push(Math.atan2(a[1], a[0]), Math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2));
      }
    } else {
      const nSp = poly === 5 ? Math.round(spokes / 6) * 5 : spokes;
      angles = Array.from({ length: nSp }, (_, s) => (2 * Math.PI * s) / nSp);
    }
    for (const th of angles) {
      let prev = point(0, th);
      for (let i = 1; i <= spokeSeg; i++) {
        const cur = point(i / spokeSeg, th);
        push(prev, cur);
        prev = cur;
      }
    }
  }
  return Float32Array.from(out);
}

