import { buildAero } from './aero';
import { simulate } from './flight';
import { buildLayout, features, snapCount } from './layout';
import { DEFAULT_LAUNCH, type DesignParams, type DimpleShape, type LaunchParams, type Pattern } from './types';

export interface OptimizeRequest {
  start: DesignParams;
  launch: LaunchParams;
  objective: 'carry' | 'total';
  /** reject designs whose USGA ODS 2028 projection exceeds 317 yd */
  odsLimit: boolean;
  /** restrict the search to this dimple shape (null = search all shapes) */
  shape: DimpleShape | null;
  budget: number; // number of design evaluations
}

export interface Candidate {
  params: DesignParams;
  score: number;
  carry: number;
  total: number;
  apex: number;
  ods: number;
}

export type OptimizeMessage =
  | { type: 'progress'; done: number; budget: number; best: Candidate | null }
  | { type: 'done'; best: Candidate | null; baseline: Candidate; evaluated: number };

const PATTERNS: Pattern[] = ['tetrahedral', 'octahedral', 'icosahedral', 'fibonacci'];
const SHAPES: DimpleShape[] = ['spherical', 'flat', 'conical', 'dual', 'raised', 'hex'];
const SIZE_VAR = [0, 0.06, 0.12, 0.2, 0.3]; // discrete so dimple positions can be cached

// Realistic manufacturing ranges, so the search stays among plausible balls
const RANGE = {
  count: [280, 520],
  diameter: [0.11, 0.2],
  depth: [0.0055, 0.0125],
  wallSteepness: [0, 1],
  innerRatio: [0.3, 0.7],
  islandRatio: [0.2, 0.5],
  microSize: [0.2, 0.45],
} as const;

type NumKey = 'diameter' | 'depth' | 'wallSteepness' | 'innerRatio' | 'islandRatio' | 'microSize';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

export function evaluate(d: DesignParams, req: OptimizeRequest): Candidate | null {
  if (d.depth <= 0) return null;
  const L = buildLayout(d);
  const f = features(d, L);
  const a = buildAero(d, f, 'A');
  const r = simulate(a, req.launch);
  const std: LaunchParams = { ...DEFAULT_LAUNCH, tempF: 75, humidity: 50, altitudeFt: 0, windSpeed: 0 };
  const ods = simulate(a, { ...std, ballSpeed: 125 * 1.49, launchAngle: 11, spin: 2220 }).total;
  // must pass the USGA symmetry test
  const b = buildAero(d, f, 'B');
  const symL = { ...std, ballSpeed: 160, launchAngle: 10, spin: 2800 };
  const sa = simulate(a, symL), sb = simulate(b, symL);
  if (Math.abs(sa.carry - sb.carry) >= 3 || Math.abs(sa.hang - sb.hang) >= 0.2) return null;
  if (req.odsLimit && ods > 317) return null;
  // avoid degenerate layouts where most dimples are trimmed into each other
  if (f.clampedFraction > 0.6 && f.coverage < 0.55) return null;
  const score = req.objective === 'carry' ? r.carry : r.total;
  return { params: d, score, carry: r.carry, total: r.total, apex: r.apex, ods };
}

/**
 * Two-stage search: a broad random sweep across layout, shape and geometry,
 * then coordinate-wise refinement of the best few designs with shrinking steps.
 */
export function* optimize(req: OptimizeRequest): Generator<OptimizeMessage, void, void> {
  const rand = rng(1234567);
  const base: DesignParams = { ...req.start, asymmetry: 'none' };
  const baseline = evaluate(req.start, { ...req, odsLimit: false }) ?? { params: req.start, score: 0, carry: 0, total: 0, apex: 0, ods: 0 };
  let best: Candidate | null = null;
  let done = 0;
  const pool: Candidate[] = [];
  const consider = (d: DesignParams) => {
    done++;
    const c = evaluate(d, req);
    if (c) {
      pool.push(c);
      if (!best || c.score > best.score) best = c;
    }
    return c;
  };

  const startCand = consider(base);
  void startCand;

  // --- stage 1: random exploration
  const explore = Math.round(req.budget * 0.55);
  const shapes = req.shape ? [req.shape] : SHAPES;
  for (let i = 0; i < explore; i++) {
    const pattern = PATTERNS[Math.floor(rand() * PATTERNS.length)];
    const shape = shapes[i % shapes.length];
    const lerp = (k: keyof typeof RANGE) => RANGE[k][0] + rand() * (RANGE[k][1] - RANGE[k][0]);
    const d: DesignParams = {
      ...base,
      pattern,
      shape,
      count: snapCount(pattern, Math.round(lerp('count'))),
      diameter: lerp('diameter'),
      depth: lerp('depth'),
      sizeVariation: SIZE_VAR[Math.floor(rand() * SIZE_VAR.length)],
      wallSteepness: lerp('wallSteepness'),
      innerRatio: lerp('innerRatio'),
      islandRatio: lerp('islandRatio'),
      microDimples: rand() < 0.3,
      microSize: lerp('microSize'),
      paintProcess: rand() < 0.5 ? 'spray' : 'microcoat',
    };
    consider(d);
    if (i % 4 === 0) yield { type: 'progress', done, budget: req.budget, best };
  }

  // --- stage 2: coordinate refinement around the top designs
  pool.sort((a, b) => b.score - a.score);
  const seeds = pool.slice(0, 3);
  const perSeed = Math.max(10, Math.floor((req.budget - done) / Math.max(1, seeds.length)));
  for (const seed of seeds) {
    let cur = seed;
    const steps: Record<NumKey, number> = {
      diameter: 0.02, depth: 0.0012, wallSteepness: 0.25, innerRatio: 0.1, islandRatio: 0.08, microSize: 0.08,
    };
    let used = 0;
    while (used < perSeed) {
      let improved = false;
      const keys: (NumKey | 'count' | 'sizeVariation' | 'micro' | 'paint')[] = ['diameter', 'depth', 'count', 'sizeVariation', 'paint'];
      if (cur.params.shape === 'spherical' || cur.params.shape === 'flat') keys.push('wallSteepness');
      if (cur.params.shape === 'dual') keys.push('innerRatio');
      if (cur.params.shape === 'raised') keys.push('islandRatio');
      keys.push('micro');
      if (cur.params.microDimples) keys.push('microSize');
      for (const k of keys) {
        const tries: DesignParams[] = [];
        const p = cur.params;
        if (k === 'count') {
          for (const dir of [-1, 1]) {
            const target = p.count + dir * (p.pattern === 'fibonacci' ? 24 : 30);
            const c = snapCount(p.pattern, clamp(target, RANGE.count));
            if (c !== p.count) tries.push({ ...p, count: c });
          }
        } else if (k === 'sizeVariation') {
          const i = SIZE_VAR.indexOf(p.sizeVariation);
          for (const j of [i - 1, i + 1]) if (j >= 0 && j < SIZE_VAR.length) tries.push({ ...p, sizeVariation: SIZE_VAR[j] });
        } else if (k === 'micro') {
          tries.push({ ...p, microDimples: !p.microDimples });
        } else if (k === 'paint') {
          tries.push({ ...p, paintProcess: p.paintProcess === 'spray' ? 'microcoat' : 'spray' });
        } else {
          for (const dir of [-1, 1]) tries.push({ ...p, [k]: clamp(p[k] + dir * steps[k], RANGE[k]) });
        }
        for (const t of tries) {
          if (used >= perSeed) break;
          used++;
          const c = consider(t);
          if (c && c.score > cur.score + 0.05) { cur = c; improved = true; }
        }
        yield { type: 'progress', done, budget: req.budget, best };
      }
      if (!improved) {
        let tiny = true;
        for (const k of Object.keys(steps) as NumKey[]) { steps[k] /= 2; if (steps[k] > (RANGE[k][1] - RANGE[k][0]) / 80) tiny = false; }
        if (tiny) break;
      }
    }
  }
  const finalBest = best as Candidate | null;
  if (finalBest) {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const q = finalBest.params;
    finalBest.params = {
      ...q,
      diameter: Math.round(q.diameter * 1000) / 1000,
      depth: Math.round(q.depth * 10000) / 10000,
      wallSteepness: r2(q.wallSteepness), innerRatio: r2(q.innerRatio), islandRatio: r2(q.islandRatio), microSize: r2(q.microSize),
    };
  }
  yield { type: 'done', best: finalBest, baseline, evaluated: done };
}
