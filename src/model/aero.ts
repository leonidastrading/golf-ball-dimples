import { buildLayout, features, type DesignFeatures } from './layout';
import { PROV1, type DesignParams } from './types';

/**
 * Semi-empirical aerodynamic model.
 *
 * The functional form follows the classic golf-ball fits (Smits & Smits:
 * Cd ≈ c0 + c1·S, Cl ≈ a·S^0.4) blended with a drag-crisis transition in Reynolds
 * number (smooth-sphere-like Cd ≈ 0.5 below the critical Re). Every coefficient is
 * scaled by the design's surface features relative to the Pro V1 baseline, so the
 * baseline reproduces Tour driver numbers and changes follow published trends:
 *  - more coverage / sharper rims / deeper dimples trip the boundary layer at lower Re
 *  - dimple volume ratio above the optimum → lower lift (ballistic, "knuckling")
 *  - volume ratio below the optimum → more lift and more drag (ballooning)
 *  - shape-specific mechanisms (dual cavity, cone walls, raised island, micro-dimples…)
 */

export interface AeroModel {
  reCrit: number;
  cd0: number;
  cdSpin: number;
  cdReSlope: number;
  clA: number;
  clMult: number;
  lowLift: number;
  lowDrag: number;
  sideMult: number;
  spinTau: number; // s
  speedMult: number; // impact effects on launch ball speed
  spinMult: number; // impact effects on launch spin
}

// calibrated so the Pro V1 baseline matches PGA Tour driver, 7-iron and PW averages (carry, apex, descent)
export const CAL = { CD0: 0.2, CL_A: 0.43, CD_SPIN: 0.33, RE_C0: 4.2e4 };

let baseFeat: DesignFeatures | null = null;
export function baselineFeatures(): DesignFeatures {
  if (!baseFeat) baseFeat = features(PROV1, buildLayout(PROV1));
  return baseFeat;
}

export function buildAero(d: DesignParams, f: DesignFeatures, orientation: 'A' | 'B' = 'A'): AeroModel {
  const b = baselineFeatures();
  const kd = f.depthRatio / b.depthRatio;
  const cov = f.coverage;
  const x = f.volumeRatio / b.volumeRatio; // volume ratio relative to baseline
  const edge = Math.max(0.05, f.edgeAngle / b.edgeAngle);

  // --- boundary-layer trip strength → critical Reynolds number
  const shapeTrip: Record<DesignParams['shape'], number> = {
    spherical: 1, conical: 1.25, dual: 1.15, raised: 1.0, hex: 1.08, flat: 1.1,
  };
  let trip = kd * Math.pow(cov / b.coverage, 0.8) * Math.pow(edge, 0.3) * shapeTrip[d.shape];
  if (d.microDimples) trip *= 1.12;
  const reCrit = trip <= 1e-4 ? 3.2e5 : Math.min(3.2e5, Math.max(2.5e4, CAL.RE_C0 / Math.pow(trip, 0.9)));

  // --- post-critical drag
  let cd0 = CAL.CD0;
  const dc = cov - b.coverage;
  cd0 += dc < 0 ? -0.2 * dc + 0.25 * dc * dc : -0.1 * dc; // diminishing returns above baseline
  cd0 += 0.045 * (x - 1) * (x - 1) + 0.012 * (x - 1);
  const meanD = f.meanDiameter;
  if (meanD < 0.12) cd0 += 0.03 * ((0.12 - meanD) / 0.05) ** 2; // very small dimples trip poorly
  if (f.count > 450) cd0 += 0.00003 * (f.count - 450); // skin friction from dense arrays
  const shapeCd: Record<DesignParams['shape'], number> = {
    spherical: 0, conical: -0.003, dual: -0.002, raised: 0.003, hex: -0.006, flat: 0.002,
  };
  cd0 += shapeCd[d.shape];
  if (d.microDimples) cd0 += 0.002;
  if (d.asymmetry === 'polara') cd0 += 0.012;
  if (d.asymmetry === 'hemispheric') cd0 += 0.004;

  // transcritical rise of Cd with Re (rougher surfaces rise faster)
  let cdReSlope = 0.02 * Math.sqrt(Math.max(0, kd));
  if (d.shape === 'dual') cdReSlope *= 0.4; // inner cavity suppresses high-speed drag

  // --- lift
  let clMult = Math.pow(Math.max(0.2, x), -0.45) * Math.pow(Math.max(0.05, cov) / b.coverage, 0.3);
  const shapeCl: Record<DesignParams['shape'], number> = {
    spherical: 1, conical: 0.98, dual: 1.0, raised: 0.97, hex: 1.0, flat: 0.97,
  };
  clMult *= shapeCl[d.shape];
  if (d.asymmetry === 'polara') clMult *= 0.95;

  // late-flight (low Re) behavior
  let lowLift = 0, lowDrag = 0;
  if (d.shape === 'dual') lowLift += 0.1;
  if (d.shape === 'flat') { lowLift += 0.05; lowDrag -= 0.004; }
  if (d.microDimples) { lowLift += 0.08; lowDrag -= 0.005; }

  // lateral (side-spin) Magnus response
  let sideMult = 1;
  if (d.shape === 'conical') sideMult *= 0.9;
  if (d.shape === 'raised') sideMult *= 0.92;
  if (d.asymmetry === 'polara') sideMult *= 0.3;

  // orientation-dependent behavior (USGA symmetry test)
  // band-coverage anisotropy has a ~0.03 sampling floor even for symmetric layouts
  const a = Math.min(0.5, Math.max(0, f.anisotropy - 0.03));
  const sgn = orientation === 'A' ? 1 : -1;
  clMult *= 1 + sgn * 0.12 * a;
  cd0 *= 1 - sgn * 0.04 * a;
  if (orientation === 'B' && d.asymmetry === 'polara') { clMult *= 0.82; cd0 += 0.018; sideMult = 1; }
  if (orientation === 'B' && d.asymmetry === 'hemispheric') { clMult *= 0.92; cd0 += 0.006; }

  // spin decay: deeper / micro-textured surfaces shed spin faster
  let spinTau = 25 / (1 + 0.3 * (x - 1));
  if (d.microDimples) spinTau /= 1.05;

  // impact: raised-center dimples increase face contact area
  const speedMult = d.shape === 'raised' ? 1.004 : 1;
  const spinMult = d.shape === 'raised' ? 0.96 : 1;

  return { reCrit, cd0, cdSpin: CAL.CD_SPIN, cdReSlope, clA: CAL.CL_A, clMult, lowLift, lowDrag, sideMult, spinTau, speedMult, spinMult };
}

function transition(m: AeroModel, re: number) {
  // a sharp transition: dimpled balls sit on the post-critical plateau until Re falls near Re_crit
  return 1 / (1 + Math.exp(-(Math.log(re) - Math.log(m.reCrit)) / 0.08));
}

function lowFactor(re: number) {
  return Math.min(1, Math.max(0, (1.2e5 - re) / 6e4));
}

export function dragCoef(m: AeroModel, re: number, S: number): number {
  const T = transition(m, re);
  const post =
    m.cd0 + m.cdSpin * S * Math.min(1.6, m.clMult) + m.cdReSlope * Math.log(re / 1.5e5) + m.lowDrag * lowFactor(re);
  const sub = 0.5 + 0.1 * S;
  return sub + (post - sub) * T;
}

export function liftCoef(m: AeroModel, re: number, S: number): number {
  const T = transition(m, re);
  const post = Math.min(0.45, m.clA * Math.pow(Math.max(0, S), 0.4) * m.clMult * (1 + m.lowLift * lowFactor(re)));
  const sub = 0.12 * S; // weak Magnus with a laminar boundary layer
  return sub + (post - sub) * T;
}
