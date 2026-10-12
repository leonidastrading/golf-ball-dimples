import { dragCoef, liftCoef, type AeroModel } from './aero';
import type { LaunchParams } from './types';

const MPH = 0.44704;
const YD = 0.9144;
const BALL_MASS = 0.04593; // kg
const BALL_D = 0.04267; // m
const BALL_R = BALL_D / 2;
const AREA = (Math.PI * BALL_D * BALL_D) / 4;
const G = 9.80665;

export interface Air {
  rho: number;
  mu: number;
}

export function air(l: Pick<LaunchParams, 'tempF' | 'altitudeFt' | 'humidity'>): Air {
  const T = ((l.tempF - 32) * 5) / 9 + 273.15;
  const h = l.altitudeFt * 0.3048;
  const P = 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
  // Tetens saturation vapour pressure
  const tc = T - 273.15;
  const psat = 610.78 * Math.exp((17.27 * tc) / (tc + 237.3));
  const pv = (Math.min(100, Math.max(0, l.humidity)) / 100) * psat;
  const rho = (P - pv) / (287.058 * T) + pv / (461.495 * T);
  const mu = (1.458e-6 * Math.pow(T, 1.5)) / (T + 110.4); // Sutherland
  return { rho, mu };
}

export interface TrajPoint {
  t: number;
  x: number; // yd downrange
  y: number; // yd lateral (+ right)
  z: number; // yd height
  v: number; // mph
  re: number;
  cd: number;
  cl: number;
  spin: number; // rpm
}

export interface FlightResult {
  points: TrajPoint[];
  carry: number;
  total: number;
  lateral: number; // at rest, yd
  carryLateral: number;
  apex: number;
  hang: number;
  descent: number; // deg
  landSpeed: number; // mph
  maxRe: number;
  minRe: number;
  launchCd: number;
  launchCl: number;
  roll: number;
}

type Vec = [number, number, number];

/**
 * 3-DOF point-mass flight with drag, Magnus lift and exponential spin decay, RK4 at 5 ms.
 * Frame: x downrange, y LEFT, z up (right-handed). Reported lateral is + right.
 */
export function simulate(m: AeroModel, l: LaunchParams, a: Air = air(l)): FlightResult {
  const v0 = l.ballSpeed * MPH * m.speedMult;
  const la = (l.launchAngle * Math.PI) / 180;
  let pos: Vec = [0, 0, 0];
  let vel: Vec = [v0 * Math.cos(la), 0, v0 * Math.sin(la)];
  const omega0 = (l.spin * m.spinMult * 2 * Math.PI) / 60;
  const tilt = (l.spinAxis * Math.PI) / 180;
  // backspin axis points to the golfer's right (-y); tilting it makes the ball curve right for + tilt
  const axis: Vec = [0, -Math.cos(tilt), -Math.sin(tilt)];
  const wd = (l.windDir * Math.PI) / 180;
  const ws = l.windSpeed * MPH;
  // wind blows FROM windDir: 0 = from target (headwind), 90 = from the right
  const wind: Vec = [-ws * Math.cos(wd), ws * Math.sin(wd), 0];

  const k = (0.5 * a.rho * AREA) / BALL_MASS;

  const accel = (p: Vec, v: Vec, t: number): { acc: Vec; re: number; cd: number; cl: number } => {
    const wf = p[2] < 0 ? 0 : Math.min(1, 0.6 + 0.4 * Math.pow(Math.max(p[2], 0.01) / 10, 0.15)); // wind gradient
    const vr: Vec = [v[0] - wind[0] * wf, v[1] - wind[1] * wf, v[2]];
    const sp = Math.hypot(vr[0], vr[1], vr[2]) || 1e-9;
    const om = omega0 * Math.exp(-t / m.spinTau);
    const S = (om * BALL_R) / sp;
    const re = (a.rho * sp * BALL_D) / a.mu;
    const cd = dragCoef(m, re, S);
    const cl = liftCoef(m, re, S);
    // lift direction = axis × v̂
    const ux = vr[0] / sp, uy = vr[1] / sp, uz = vr[2] / sp;
    let lx = axis[1] * uz - axis[2] * uy;
    let ly = axis[2] * ux - axis[0] * uz;
    let lz = axis[0] * uy - axis[1] * ux;
    const ln = Math.hypot(lx, ly, lz) || 1;
    lx /= ln; ly /= ln; lz /= ln;
    // damp the lateral (horizontal, cross-track) component of the Magnus force
    const hx = -uy, hy = ux; // horizontal unit vector perpendicular to travel
    const hn = Math.hypot(hx, hy) || 1;
    const side = (lx * hx + ly * hy) / hn;
    lx -= (1 - m.sideMult) * side * (hx / hn);
    ly -= (1 - m.sideMult) * side * (hy / hn);
    const q = k * sp * sp;
    return {
      acc: [
        -k * cd * sp * vr[0] + q * cl * lx,
        -k * cd * sp * vr[1] + q * cl * ly,
        -k * cd * sp * vr[2] + q * cl * lz - G,
      ],
      re, cd, cl,
    };
  };

  const dt = 0.005;
  let t = 0;
  const pts: TrajPoint[] = [];
  let apex = 0, maxRe = 0, minRe = Infinity;
  const first = accel(pos, vel, 0);
  const push = (info: { re: number; cd: number; cl: number }) => {
    pts.push({
      t, x: pos[0] / YD, y: -pos[1] / YD, z: pos[2] / YD,
      v: Math.hypot(vel[0], vel[1], vel[2]) / MPH,
      re: info.re, cd: info.cd, cl: info.cl, spin: (omega0 * Math.exp(-t / m.spinTau) * 60) / (2 * Math.PI),
    });
  };
  push(first);
  let step = 0;
  while (t < 20) {
    const add = (p: Vec, d: Vec, s: number): Vec => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];
    const a1 = accel(pos, vel, t);
    const k1v = a1.acc, k1p = vel;
    const a2 = accel(add(pos, k1p, dt / 2), add(vel, k1v, dt / 2), t + dt / 2);
    const k2v = a2.acc, k2p = add(vel, k1v, dt / 2);
    const a3 = accel(add(pos, k2p, dt / 2), add(vel, k2v, dt / 2), t + dt / 2);
    const k3v = a3.acc, k3p = add(vel, k2v, dt / 2);
    const a4 = accel(add(pos, k3p, dt), add(vel, k3v, dt), t + dt);
    const k4v = a4.acc, k4p = add(vel, k3v, dt);
    const prevPos = pos, prevVel = vel;
    pos = [0, 1, 2].map((i) => pos[i] + (dt / 6) * (k1p[i] + 2 * k2p[i] + 2 * k3p[i] + k4p[i])) as Vec;
    vel = [0, 1, 2].map((i) => vel[i] + (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i])) as Vec;
    t += dt;
    step++;
    maxRe = Math.max(maxRe, a1.re);
    minRe = Math.min(minRe, a1.re);
    if (pos[2] > apex) apex = pos[2];
    if (pos[2] < 0) {
      // interpolate to ground
      const f = prevPos[2] / (prevPos[2] - pos[2]);
      pos = [0, 1, 2].map((i) => prevPos[i] + (pos[i] - prevPos[i]) * f) as Vec;
      vel = [0, 1, 2].map((i) => prevVel[i] + (vel[i] - prevVel[i]) * f) as Vec;
      t -= dt * (1 - f);
      push(a1);
      break;
    }
    if (step % 4 === 0) push(a1);
  }

  const carryX = pos[0], carryY = pos[1];
  const vh = Math.hypot(vel[0], vel[1]);
  const vz = vel[2];
  const descent = (Math.atan2(-vz, vh) * 180) / Math.PI;
  const landSpin = omega0 * Math.exp(-t / m.spinTau);

  // --- bounce & roll
  const g = { soft: { e: 0.2, mu: 0.5, roll: 0.75 }, medium: { e: 0.3, mu: 0.4, roll: 0.45 }, firm: { e: 0.4, mu: 0.3, roll: 0.25 } }[l.ground];
  let h = vh, v = Math.abs(vz), spinNow = landSpin, dist = 0;
  for (let i = 0; i < 6 && v > 0.8; i++) {
    h = Math.max(0, h - g.mu * (1 + g.e) * v - 0.0035 * spinNow * BALL_R * 4);
    spinNow *= 0.4;
    v *= g.e;
    dist += (2 * v * h) / G;
  }
  dist += (h * h) / (2 * G * g.roll);
  const dirx = vh > 1e-6 ? vel[0] / vh : 1, diry = vh > 1e-6 ? vel[1] / vh : 0;
  const restX = carryX + dirx * dist, restY = carryY + diry * dist;

  return {
    points: pts,
    carry: carryX / YD,
    total: restX / YD,
    roll: dist / YD,
    lateral: -restY / YD,
    carryLateral: -carryY / YD,
    apex: apex / YD,
    hang: t,
    descent,
    landSpeed: Math.hypot(vel[0], vel[1], vel[2]) / MPH,
    maxRe,
    minRe,
    launchCd: first.cd,
    launchCl: first.cl,
  };
}

/** Cd and Cl across a range of air speeds at a fixed spin rate (for the coefficient charts). */
export function coefficientSweep(m: AeroModel, spinRpm: number, a: Air, from = 40, to = 200, n = 60) {
  const out: { mph: number; re: number; cd: number; cl: number }[] = [];
  const om = (spinRpm * 2 * Math.PI) / 60;
  for (let i = 0; i <= n; i++) {
    const mph = from + ((to - from) * i) / n;
    const v = mph * MPH;
    const re = (a.rho * v * BALL_D) / a.mu;
    const S = (om * BALL_R) / v;
    out.push({ mph, re, cd: dragCoef(m, re, S), cl: liftCoef(m, re, S) });
  }
  return out;
}
