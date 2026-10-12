import { BALL_DIAMETER_IN, BALL_RADIUS_IN, type DesignParams, type DimpleShape, type Pattern } from './types';

type V3 = [number, number, number];

const PHI = (1 + Math.sqrt(5)) / 2;
const HEX_AREA_FACTOR = (2 * Math.sqrt(3)) / Math.PI; // hexagon area / inscribed-circle area
const PENT_AREA_FACTOR = (5 * Math.tan(Math.PI / 5)) / Math.PI; // pentagon area / inscribed-circle area

/** per-dimple outline for hex layouts */
export const KIND_DEFAULT = 0, KIND_ROUND = 2, KIND_PENT = 3;

function areaFactor(shape: DesignParams['shape'], kind: number, micro: boolean) {
  if (micro || shape !== 'hex' || kind === KIND_ROUND) return 1;
  return kind === KIND_PENT ? PENT_AREA_FACTOR : HEX_AREA_FACTOR;
}

// ---------------------------------------------------------------------------
// Dimple cross-section profiles. rho is the normalized radial coordinate
// (0 = dimple center, 1 = rim). Returns depth as a fraction of max depth.
// ---------------------------------------------------------------------------

export interface ProfileOpts {
  shape: DimpleShape;
  wallSteepness: number;
  innerRatio: number;
  islandRatio: number;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function profile(rho: number, o: ProfileOpts): number {
  if (rho >= 1) return 0;
  switch (o.shape) {
    case 'spherical': {
      const p = 2 + 3 * o.wallSteepness;
      return 1 - Math.pow(rho, p);
    }
    case 'hex':
      return 1 - Math.pow(rho, 2.4);
    case 'flat': {
      const p = 4 + 8 * o.wallSteepness;
      return 1 - Math.pow(rho, p);
    }
    case 'conical':
      return Math.min(1, (1 - rho) / 0.9);
    case 'dual': {
      const a = 0.45;
      const ri = o.innerRatio;
      let h = a * (1 - rho * rho);
      if (rho < ri) h += (1 - a) * (1 - (rho / ri) * (rho / ri));
      return h;
    }
    case 'raised': {
      const c = o.islandRatio;
      const isl = 0.15;
      const m = c + (1 - c) * 0.45;
      if (rho <= m) return isl + (1 - isl) * smoothstep(c * 0.75, m, rho);
      const t = (rho - m) / (1 - m);
      return 1 - t * t;
    }
  }
}

/** 2 * ∫ h(ρ) ρ dρ – ratio of dimple volume to a flat-bottomed cylinder of the same depth */
export function volumeFactor(o: ProfileOpts): number {
  const n = 400;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const r = (i + 0.5) / n;
    s += profile(r, o) * r;
  }
  return (2 * s) / n;
}

/** rim slope dh/dρ (in units of depth per radius) */
export function rimSlope(o: ProfileOpts): number {
  return (profile(0.97, o) - profile(0.999, o)) / 0.029;
}

// ---------------------------------------------------------------------------
// Point generation
// ---------------------------------------------------------------------------

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

function polyhedron(p: Exclude<Pattern, 'fibonacci'>): { verts: V3[]; faces: [number, number, number][] } {
  if (p === 'tetrahedral') {
    return {
      verts: [norm([1, 1, 1]), norm([1, -1, -1]), norm([-1, 1, -1]), norm([-1, -1, 1])],
      faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    };
  }
  if (p === 'octahedral') {
    return {
      verts: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      faces: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]],
    };
  }
  const v: V3[] = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ].map((x) => norm(x as V3));
  const faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { verts: v, faces };
}

/** Geodesic (Goldberg–Coxeter) lattice: triangulation number T = h² + hk + k². */
interface Lattice { h: number; k: number; count: number }

function faceCount(p: Exclude<Pattern, 'fibonacci'>) {
  return p === 'tetrahedral' ? 4 : p === 'octahedral' ? 8 : 20;
}

function lattices(p: Exclude<Pattern, 'fibonacci'>): Lattice[] {
  const out: Lattice[] = [];
  const F = faceCount(p);
  for (let h = 1; h < 40; h++)
    for (let k = 0; k <= h; k++) {
      const count = (F / 2) * (h * h + h * k + k * k) + 2;
      if (count <= 800) out.push({ h, k, count });
    }
  return out;
}

/** All dimple counts a polyhedral layout can produce in the slider range. */
export function achievableCounts(p: Pattern): number[] {
  if (p === 'fibonacci') return [];
  return [...new Set(lattices(p).map((l) => l.count).filter((c) => c >= 150 && c <= 700))].sort((a, b) => a - b);
}

export function snapCount(p: Pattern, n: number): number {
  const c = achievableCounts(p);
  if (!c.length) return Math.round(n);
  return c.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), c[0]);
}

function polyPoints(p: Exclude<Pattern, 'fibonacci'>, target: number): V3[] {
  const best = lattices(p).reduce((b, l) => (Math.abs(l.count - target) < Math.abs(b.count - target) ? l : b));
  const { h, k } = best;
  const { verts, faces } = polyhedron(p);
  // planar triangular lattice; big triangle A=0, B=h·e1+k·e2, C=B rotated by 60°
  const e1 = [1, 0], e2 = [0.5, Math.sqrt(3) / 2];
  const B = [h * e1[0] + k * e2[0], h * e1[1] + k * e2[1]];
  const c60 = 0.5, s60 = Math.sqrt(3) / 2;
  const C = [B[0] * c60 - B[1] * s60, B[0] * s60 + B[1] * c60];
  const det = B[0] * C[1] - B[1] * C[0];
  const bary: [number, number, number][] = [];
  const M = h + k + 1;
  for (let i = -2 * M; i <= 2 * M; i++)
    for (let j = -2 * M; j <= 2 * M; j++) {
      const x = i * e1[0] + j * e2[0], y = i * e1[1] + j * e2[1];
      const lb = (x * C[1] - y * C[0]) / det;
      const lc = (B[0] * y - B[1] * x) / det;
      const la = 1 - lb - lc;
      if (la > -1e-9 && lb > -1e-9 && lc > -1e-9) bary.push([la, lb, lc]);
    }
  const pts: V3[] = [];
  const seen = new Set<string>();
  for (const [ia, ib, ic] of faces) {
    const A = verts[ia], Bv = verts[ib], Cv = verts[ic];
    for (const [la, lb, lc] of bary) {
      const n = norm([
        la * A[0] + lb * Bv[0] + lc * Cv[0],
        la * A[1] + lb * Bv[1] + lc * Cv[1],
        la * A[2] + lb * Bv[2] + lc * Cv[2],
      ]);
      const key = `${Math.round(n[0] * 2e4)},${Math.round(n[1] * 2e4)},${Math.round(n[2] * 2e4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push(n);
    }
  }
  return pts;
}

function fibonacciPoints(n: number): V3[] {
  const pts: V3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    pts.push([r * Math.cos(ga * i), r * Math.sin(ga * i), z]);
  }
  return pts;
}

/** Symmetric invariant in [-1, 1] used to assign size tiers without breaking symmetry. */
function invariant(p: Pattern, v: V3): number {
  const [x, y, z] = v;
  if (p === 'tetrahedral') return x * y * z * 3 * Math.sqrt(3);
  if (p === 'icosahedral') {
    const a = PHI * PHI;
    return (a * x * x - y * y) * (a * y * y - z * z) * (a * z * z - x * x);
  }
  return x ** 4 + y ** 4 + z ** 4;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface DimpleLayout {
  n: number; // primary dimples
  total: number; // primary + micro
  centers: Float32Array; // 3 * total
  axes: Float32Array; // 3 * total, tangent x axis (towards nearest neighbor)
  radii: Float32Array; // angular radius (rad)
  depths: Float32Array; // effective depth, inches
  isMicro: Uint8Array;
  /** KIND_DEFAULT, KIND_ROUND (round dimple in a hex layout) or KIND_PENT (pentagon at a 5-neighbor site) */
  kinds: Uint8Array;
  clampedFraction: number;
}

function angle(a: V3, b: V3) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, d)));
}

export function effectiveDepth(d: DesignParams): number {
  const pool = d.paintProcess === 'spray' ? 0.6 : 0.15;
  return Math.max(0, d.depth - d.paintThickness * pool);
}

function basePoints(d: DesignParams): V3[] {
  if (d.pattern === 'fibonacci') return fibonacciPoints(Math.max(1, Math.round(d.count)));
  return polyPoints(d.pattern, d.count);
}

/**
 * Positions + size tiers. Cached on (pattern, count, sizeVariation) since relaxation
 * is the expensive part and diameter/depth changes should feel instant.
 */
const posCache = new Map<string, { pts: V3[]; tiers: number[] }>();

function positions(d: DesignParams): { pts: V3[]; tiers: number[] } {
  const key = `${d.pattern}|${d.count}|${d.sizeVariation.toFixed(3)}`;
  const hit = posCache.get(key);
  if (hit) return hit;
  const pts = basePoints(d);
  const n = pts.length;
  // size tiers from a symmetric invariant
  const inv = pts.map((p) => invariant(d.pattern, p));
  const lo = Math.min(...inv), hi = Math.max(...inv);
  const tiers = inv.map((v) => (hi - lo < 1e-9 ? 0 : ((v - lo) / (hi - lo)) * 2 - 1));
  const w = tiers.map((t) => 1 + d.sizeVariation * t);

  // size-weighted repulsion relaxation (preserves the seed's symmetry)
  const spacing = Math.sqrt((4 * Math.PI) / n);
  const iters = 120;
  const F = new Float64Array(n * 3);
  const mag = new Float64Array(n);
  const cut = 2.2 * spacing;
  const cut2 = cut * cut;
  for (let it = 0; it < iters; it++) {
    F.fill(0);
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      for (let j = i + 1; j < n; j++) {
        const b = pts[j];
        const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 > cut2 || r2 < 1e-14) continue;
        const s = ((w[i] + w[j]) / 2) * spacing;
        // short-range repulsion (∝ 1/r^4) with a soft cutoff equalizes neighbor gaps
        const q = (s * s) / r2;
        const fall = 1 - r2 / cut2;
        const f = q * q * fall * fall;
        F[i * 3] += dx * f; F[i * 3 + 1] += dy * f; F[i * 3 + 2] += dz * f;
        F[j * 3] -= dx * f; F[j * 3 + 1] -= dy * f; F[j * 3 + 2] -= dz * f;
      }
    }
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const dot = F[i * 3] * p[0] + F[i * 3 + 1] * p[1] + F[i * 3 + 2] * p[2];
      F[i * 3] -= dot * p[0]; F[i * 3 + 1] -= dot * p[1]; F[i * 3 + 2] -= dot * p[2];
      mag[i] = Math.hypot(F[i * 3], F[i * 3 + 1], F[i * 3 + 2]);
    }
    const sorted = Array.from(mag).sort((x, y) => x - y);
    const med = sorted[n >> 1];
    if (!(med > 1e-14)) break;
    const lim = 0.04 * spacing * (1 - (0.85 * it) / iters);
    for (let i = 0; i < n; i++) {
      if (mag[i] === 0) continue;
      const sc = Math.min(lim / mag[i], (0.5 * lim) / med);
      pts[i] = norm([pts[i][0] + F[i * 3] * sc, pts[i][1] + F[i * 3 + 1] * sc, pts[i][2] + F[i * 3 + 2] * sc]);
    }
  }
  const out = { pts, tiers };
  if (posCache.size > 300) posCache.clear();
  posCache.set(key, out);
  return out;
}

/** depth multiplier for asymmetric layouts (ball polar axis = z) */
function asymFactor(mode: DesignParams['asymmetry'], z: number) {
  if (mode === 'polara') return 0.35 + (1.3 - 0.35) * (1 - smoothstep(0.32, 0.7, Math.abs(z)));
  if (mode === 'hemispheric') return z > 0 ? 1.2 : 0.75;
  return 1;
}

export function buildLayout(d: DesignParams): DimpleLayout {
  const { pts, tiers } = positions(d);
  const n = pts.length;
  const theta0 = d.diameter / 2 / BALL_RADIUS_IN;
  const r = tiers.map((t) => theta0 * (1 + d.sizeVariation * t));

  // neighbor lists + overlap clamp
  const spacing = Math.sqrt((4 * Math.PI) / n);
  const nbr: number[][] = pts.map(() => []);
  const nearest = new Int32Array(n).fill(-1);
  const nearestD = new Float64Array(n).fill(Infinity);
  const dist = new Map<number, number>();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = angle(pts[i], pts[j]);
      if (a < 1.9 * spacing) {
        nbr[i].push(j); nbr[j].push(i);
        dist.set(i * n + j, a); dist.set(j * n + i, a);
      }
      if (a < nearestD[i]) { nearestD[i] = a; nearest[i] = j; }
      if (a < nearestD[j]) { nearestD[j] = a; nearest[j] = i; }
    }
  // allow dimples to just touch; hexes tessellate flat-to-flat
  const allow = d.shape === 'hex' ? 1.0 : 1.02;
  const rc = r.slice();
  let clamped = 0;
  for (let i = 0; i < n; i++) {
    let s = 1;
    for (const j of nbr[i]) s = Math.min(s, (allow * dist.get(i * n + j)!) / (r[i] + r[j]));
    if (s < 0.999) clamped++;
    rc[i] = r[i] * s;
  }

  const de = effectiveDepth(d);
  const centers: V3[] = pts.slice();
  const radii: number[] = rc;
  const depths: number[] = pts.map((p) => de * asymFactor(d.asymmetry, p[2]));
  const micro: boolean[] = pts.map(() => false);

  if (d.microDimples && de > 0) {
    // interstitial sites: centroids of neighboring dimple triangles
    const seen = new Set<string>();
    const meanTheta = theta0;
    const cand: { c: V3; tri: number[] }[] = [];
    for (let i = 0; i < n; i++) {
      const ns = nbr[i];
      for (let a = 0; a < ns.length; a++)
        for (let b = a + 1; b < ns.length; b++) {
          const j = ns[a], k = ns[b];
          if (!dist.has(j * n + k)) continue;
          // only true nearest-neighbor triangles (skip second-ring neighbors)
          const lim = 1.3 * Math.max(nearestD[i], nearestD[j], nearestD[k]);
          if (dist.get(i * n + j)! > lim || dist.get(i * n + k)! > lim || dist.get(j * n + k)! > lim) continue;
          const key = [i, j, k].sort((x, y) => x - y).join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          cand.push({ c: norm([pts[i][0] + pts[j][0] + pts[k][0], pts[i][1] + pts[j][1] + pts[k][1], pts[i][2] + pts[j][2] + pts[k][2]]), tri: [i, j, k] });
        }
    }
    // Dimple-cluster layouts space the primaries to leave room for the micro-dimples:
    // trim each primary so a micro of the requested size fits in every adjacent gap.
    const target = d.microSize * meanTheta;
    const bound = d.shape === 'hex' ? 1 / Math.cos(Math.PI / 6) : 1; // hex corners reach further
    for (const { c, tri } of cand)
      for (const i of tri) {
        const room = (angle(c, pts[i]) - 0.85 * target) / bound;
        if (rc[i] > room) rc[i] = Math.max(0.3 * meanTheta, room);
      }
    const placed: { p: V3; r: number }[] = [];
    for (const { c, tri } of cand) {
      let gap = Infinity;
      for (const m of tri) gap = Math.min(gap, angle(c, pts[m]) - rc[m] * bound);
      for (const m of nbr[tri[0]]) gap = Math.min(gap, angle(c, pts[m]) - rc[m] * bound);
      const mr = Math.min(target, 0.92 * gap);
      if (mr < 0.6 * target) continue;
      if (placed.some((q) => angle(q.p, c) < q.r + mr)) continue;
      placed.push({ p: c, r: mr });
    }
    for (const q of placed) {
      centers.push(q.p); radii.push(q.r); depths.push(de * 0.7); micro.push(true);
    }
  }

  const total = centers.length;
  // Hex layouts: sites with only five neighbors (the 12 icosahedral vertices) become pentagons —
  // a sphere can't be tiled with hexagons alone. A symmetric share of the rest can be round.
  const kinds = new Uint8Array(total);
  if (d.shape === 'hex') {
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (const j of nbr[i]) if (dist.get(i * n + j)! < 1.35 * nearestD[i]) c++;
      if (c <= 5) kinds[i] = KIND_PENT;
    }
    const nRound = Math.round(d.roundMix * n);
    if (nRound > 0) {
      // farthest-point sampling spreads the round dimples evenly over the ball
      const minD = new Float64Array(n).fill(Infinity);
      for (let i = 0; i < n; i++) if (kinds[i] === KIND_PENT) minD[i] = -1;
      let pick = 0;
      for (let i = 0; i < n; i++) if (kinds[i] !== KIND_PENT && pts[i][2] > pts[pick][2]) pick = i;
      for (let c = 0; c < nRound; c++) {
        kinds[pick] = KIND_ROUND;
        minD[pick] = -1;
        let next = -1;
        for (let i = 0; i < n; i++) {
          if (minD[i] < 0) continue;
          minD[i] = Math.min(minD[i], angle(pts[i], pts[pick]));
          if (next < 0 || minD[i] > minD[next]) next = i;
        }
        if (next < 0) break;
        pick = next;
      }
    }
  }
  const C = new Float32Array(total * 3);
  const X = new Float32Array(total * 3);
  for (let i = 0; i < total; i++) {
    const c = centers[i];
    C.set(c, i * 3);
    // tangent axis towards nearest primary neighbor (for hexagon orientation)
    const t = i < n && nearest[i] >= 0 ? pts[nearest[i]] : Math.abs(c[2]) < 0.9 ? ([0, 0, 1] as V3) : ([1, 0, 0] as V3);
    const dot = t[0] * c[0] + t[1] * c[1] + t[2] * c[2];
    const ax = norm([t[0] - dot * c[0], t[1] - dot * c[1], t[2] - dot * c[2]]);
    X.set(ax, i * 3);
  }
  return {
    n, total, centers: C, axes: X,
    radii: Float32Array.from(radii), depths: Float32Array.from(depths), isMicro: Uint8Array.from(micro.map(Number)), kinds,
    clampedFraction: clamped / n,
  };
}

// ---------------------------------------------------------------------------
// Derived design features (feed the aerodynamic model and the readouts)
// ---------------------------------------------------------------------------

export interface DesignFeatures {
  count: number;
  microCount: number;
  coverage: number; // 0..1
  volumeRatio: number; // dimple volume / ball volume (fraction)
  meanDiameter: number; // in
  minDiameter: number;
  maxDiameter: number;
  effDepth: number; // in
  depthRatio: number; // effective depth / ball diameter
  edgeAngle: number; // deg
  anisotropy: number; // 0 = perfectly isotropic surface
  clampedFraction: number;
}

function bandAnisotropy(L: DimpleLayout): number {
  // Depth-weighted fraction of a great-circle band (around several candidate spin axes)
  // that lies inside dimples. A spherically symmetric layout gives nearly equal values.
  const axes: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], norm([1, 1, 0]), norm([1, 0, 1]), norm([0, 1, 1]), norm([1, 1, 1]), norm([1, -2, 0.5])];
  let meanDepth = 0;
  for (let i = 0; i < L.total; i++) meanDepth += L.depths[i];
  meanDepth = meanDepth / Math.max(1, L.total) || 1;
  let rMax = 0;
  for (let i = 0; i < L.total; i++) rMax = Math.max(rMax, L.radii[i]);
  const vals: number[] = [];
  const NA = 540;
  for (const ax of axes) {
    const u = norm(Math.abs(ax[2]) < 0.9 ? [-ax[1], ax[0], 0] : [0, -ax[2], ax[1]]);
    const v: V3 = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
    // dimples near the band, sorted by azimuth
    const near: { az: number; i: number }[] = [];
    for (let i = 0; i < L.total; i++) {
      const cx = L.centers[i * 3], cy = L.centers[i * 3 + 1], cz = L.centers[i * 3 + 2];
      const h = cx * ax[0] + cy * ax[1] + cz * ax[2];
      if (Math.abs(Math.asin(Math.max(-1, Math.min(1, h)))) > 0.5 + rMax) continue;
      near.push({ az: Math.atan2(cx * v[0] + cy * v[1] + cz * v[2], cx * u[0] + cy * u[1] + cz * u[2]), i });
    }
    near.sort((p, q) => p.az - q.az);
    const azs = near.map((n) => n.az);
    let hit = 0, tot = 0;
    for (let li = -6; li <= 6; li++) {
      const lat = li * 0.08;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      const win = rMax / Math.max(0.5, cl) + 1e-3;
      for (let k = 0; k < NA; k++) {
        const t = (k / NA) * Math.PI * 2 - Math.PI;
        const px = cl * (Math.cos(t) * u[0] + Math.sin(t) * v[0]) + sl * ax[0];
        const py = cl * (Math.cos(t) * u[1] + Math.sin(t) * v[1]) + sl * ax[1];
        const pz = cl * (Math.cos(t) * u[2] + Math.sin(t) * v[2]) + sl * ax[2];
        tot++;
        // binary search the azimuth window (with wrap-around)
        for (const off of [0, 2 * Math.PI, -2 * Math.PI]) {
          let lo = 0, hi = azs.length;
          const start = t - win + off;
          while (lo < hi) { const m = (lo + hi) >> 1; if (azs[m] < start) lo = m + 1; else hi = m; }
          let found = false;
          for (let m = lo; m < azs.length && azs[m] <= t + win + off; m++) {
            const i = near[m].i;
            const d = px * L.centers[i * 3] + py * L.centers[i * 3 + 1] + pz * L.centers[i * 3 + 2];
            if (d > Math.cos(L.radii[i])) { hit += L.depths[i] / meanDepth; found = true; break; }
          }
          if (found) break;
        }
      }
    }
    vals.push(hit / tot);
  }
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  if (mean <= 0) return 0;
  return (Math.max(...vals) - Math.min(...vals)) / mean;
}

export function features(d: DesignParams, L: DimpleLayout): DesignFeatures {
  const o: ProfileOpts = d;
  const vf = volumeFactor(o);
  let area = 0, vol = 0, dsum = 0, dmin = Infinity, dmax = 0, depthSum = 0;
  const microVf = volumeFactor({ ...o, shape: 'spherical' });
  for (let i = 0; i < L.total; i++) {
    const th = L.radii[i];
    const cap = 2 * Math.PI * (1 - Math.cos(th));
    const isM = L.isMicro[i] === 1;
    const a = cap * areaFactor(d.shape, L.kinds[i], isM);
    area += a;
    vol += a * BALL_RADIUS_IN * BALL_RADIUS_IN * L.depths[i] * (isM || L.kinds[i] === KIND_ROUND ? microVf : vf);
    if (!isM) {
      const dia = 2 * th * BALL_RADIUS_IN;
      dsum += dia; dmin = Math.min(dmin, dia); dmax = Math.max(dmax, dia);
      depthSum += L.depths[i];
    }
  }
  const ballVol = (4 / 3) * Math.PI * BALL_RADIUS_IN ** 3;
  const meanD = dsum / Math.max(1, L.n);
  const effDepth = depthSum / Math.max(1, L.n);
  const slope = rimSlope(o);
  const edgeAngle = (Math.atan((effDepth * slope) / Math.max(1e-6, meanD / 2)) * 180) / Math.PI;
  return {
    count: L.n,
    microCount: L.total - L.n,
    coverage: Math.min(1, area / (4 * Math.PI)),
    volumeRatio: vol / ballVol,
    meanDiameter: meanD,
    minDiameter: dmin === Infinity ? 0 : dmin,
    maxDiameter: dmax,
    effDepth,
    depthRatio: effDepth / BALL_DIAMETER_IN,
    edgeAngle,
    anisotropy: effDepth > 0 ? bandAnisotropy(L) : 0,
    clampedFraction: L.clampedFraction,
  };
}

/** Coverage for a given mean diameter (used to drive the coverage slider). */
export function coverageAt(d: DesignParams, diameter: number): number {
  const L = buildLayout({ ...d, diameter, microDimples: false });
  let a = 0;
  for (let i = 0; i < L.n; i++) a += 2 * Math.PI * (1 - Math.cos(L.radii[i])) * areaFactor(d.shape, L.kinds[i], false);
  return Math.min(1, a / (4 * Math.PI));
}

/** Smallest mean diameter that reaches the requested primary-dimple coverage. */
export function diameterForCoverage(d: DesignParams, target: number): number {
  let lo = 0.04, hi = 0.4;
  if (coverageAt(d, hi) < target) return hi;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (coverageAt(d, mid) < target) lo = mid; else hi = mid;
  }
  return Math.round(hi * 1000) / 1000;
}
