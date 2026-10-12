import { profile, type ProfileOpts } from '../model/layout';
import { BALL_RADIUS_IN } from '../model/types';

export interface MeshRequest {
  id: number;
  res: number; // grid cells per cube face edge
  total: number;
  centers: Float32Array;
  axes: Float32Array;
  radii: Float32Array;
  depths: Float32Array; // inches
  isMicro: Uint8Array;
  kinds: Uint8Array; // 0 default, 2 round, 3 pentagon
  opts: ProfileOpts;
  exaggeration: number;
  colorMode: 'white' | 'depth';
}

export interface MeshResult {
  id: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  index: Uint32Array;
}

// cube faces: normal axis, u axis, v axis
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

const indexCache = new Map<number, Uint32Array>();
// outward normals of a pentagon's five edges
const PENT_DIRS = Array.from({ length: 5 }, (_, q) => [Math.cos((2 * Math.PI * q) / 5), Math.sin((2 * Math.PI * q) / 5)]);

function faceIndex(res: number): Uint32Array {
  const hit = indexCache.get(res);
  if (hit) return hit;
  const n1 = res + 1;
  const idx = new Uint32Array(6 * res * res * 6);
  let o = 0;
  for (let f = 0; f < 6; f++) {
    const base = f * n1 * n1;
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) {
        const a = base + j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
        idx[o++] = a; idx[o++] = b; idx[o++] = d;
        idx[o++] = a; idx[o++] = d; idx[o++] = c;
      }
  }
  indexCache.set(res, idx);
  return idx;
}

// sequential blue ramp (light → dark) for the depth map
const RAMP = ['#f4f4f1', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'].map((h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
]);

function ramp(t: number): number[] {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function buildMesh(req: MeshRequest): MeshResult {
  const { res, total, centers, axes, radii, depths, isMicro, kinds, opts, exaggeration } = req;
  const n1 = res + 1;
  const g = res + 3; // padded grid for central-difference normals
  const step = Math.PI / 2 / res;
  const positions = new Float32Array(6 * n1 * n1 * 3);
  const normals = new Float32Array(6 * n1 * n1 * 3);
  const colors = new Float32Array(6 * n1 * n1 * 3);
  const P = new Float64Array(g * g * 3); // unit directions
  const H = new Float64Array(g * g); // depth (ball-radius units)
  const maxDepth = depths.reduce((m, x) => Math.max(m, x), 0) || 1;
  const microOpts: ProfileOpts = { ...opts, shape: 'spherical', wallSteepness: 0.2 };
  const COS30 = Math.sqrt(3) / 2;
  const COS36 = Math.cos(Math.PI / 5);

  for (let f = 0; f < 6; f++) {
    const [N, U, V] = FACES[f];
    // sample directions (equal-angle cube mapping), padded by one cell
    for (let j = 0; j < g; j++) {
      const b = Math.tan(-Math.PI / 4 + (j - 1) * step);
      for (let i = 0; i < g; i++) {
        const a = Math.tan(-Math.PI / 4 + (i - 1) * step);
        const x = N[0] + a * U[0] + b * V[0];
        const y = N[1] + a * U[1] + b * V[1];
        const z = N[2] + a * U[2] + b * V[2];
        const l = Math.hypot(x, y, z);
        const k = (j * g + i) * 3;
        P[k] = x / l; P[k + 1] = y / l; P[k + 2] = z / l;
      }
    }
    H.fill(0);
    for (let d = 0; d < total; d++) {
      const cx = centers[d * 3], cy = centers[d * 3 + 1], cz = centers[d * 3 + 2];
      const cn = cx * N[0] + cy * N[1] + cz * N[2];
      const pent = opts.shape === 'hex' && !isMicro[d] && kinds[d] === 3;
      const hex = opts.shape === 'hex' && !isMicro[d] && kinds[d] === 0;
      const round = opts.shape === 'hex' && kinds[d] === 2;
      const rr = radii[d] * (hex ? 1 / COS30 : pent ? 1 / COS36 : 1); // bounding radius
      if (cn < Math.cos(Math.PI / 2 * 0.62 + rr)) continue; // can't reach this face
      if (cn <= 1e-3) continue;
      const ca = (cx * U[0] + cy * U[1] + cz * U[2]) / cn;
      const cb = (cx * V[0] + cy * V[1] + cz * V[2]) / cn;
      const ai = (Math.atan(ca) + Math.PI / 4) / step + 1;
      const bj = (Math.atan(cb) + Math.PI / 4) / step + 1;
      const span = Math.ceil((rr * 1.6) / step) + 2;
      const i0 = Math.max(0, Math.floor(ai - span)), i1 = Math.min(g - 1, Math.ceil(ai + span));
      const j0 = Math.max(0, Math.floor(bj - span)), j1 = Math.min(g - 1, Math.ceil(bj + span));
      if (i0 > i1 || j0 > j1) continue;
      const ex = axes[d * 3], ey = axes[d * 3 + 1], ez = axes[d * 3 + 2];
      // e2 = c × e1
      const fx = cy * ez - cz * ey, fy = cz * ex - cx * ez, fz = cx * ey - cy * ex;
      const r = radii[d];
      const depth = (depths[d] / BALL_RADIUS_IN) * exaggeration;
      const po = isMicro[d] || round ? microOpts : opts;
      const cosR = Math.cos(rr);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * g + i;
          const px = P[k * 3], py = P[k * 3 + 1], pz = P[k * 3 + 2];
          const dot = px * cx + py * cy + pz * cz;
          if (dot < cosR) continue;
          // gnomonic tangent-plane coordinates around the dimple center
          const tx = (px / dot - cx), ty = (py / dot - cy), tz = (pz / dot - cz);
          const x = tx * ex + ty * ey + tz * ez;
          const y = tx * fx + ty * fy + tz * fz;
          let rho: number;
          let h: number;
          if (hex || pent) {
            // smooth spherical bowl (measured to the corners) cut by a crisp, steep polygon wall
            let m = -Infinity;
            if (hex) m = Math.max(Math.abs(x), Math.abs(0.5 * x + COS30 * y), Math.abs(-0.5 * x + COS30 * y));
            else for (let q = 0; q < 5; q++) m = Math.max(m, x * PENT_DIRS[q][0] + y * PENT_DIRS[q][1]);
            rho = m / Math.tan(r);
            if (rho >= 1) continue;
            const re = Math.hypot(x, y) / (Math.tan(r) / (hex ? COS30 : COS36));
            const bowl = 0.35 + 0.65 * (1 - re * re);
            const wall = Math.min(1, (1 - rho) / 0.1);
            h = Math.max(0, Math.min(bowl, wall * bowl)) * depth;
          } else {
            rho = Math.hypot(x, y) / Math.tan(r);
            if (rho >= 1) continue;
            h = profile(rho, po) * depth;
          }
          if (h > H[k]) H[k] = h;
        }
    }
    // displaced positions in the padded grid (reuse P in place)
    for (let k = 0; k < g * g; k++) {
      const s = 1 - H[k];
      P[k * 3] *= s; P[k * 3 + 1] *= s; P[k * 3 + 2] *= s;
    }
    const base = f * n1 * n1;
    for (let j = 1; j <= res + 1; j++)
      for (let i = 1; i <= res + 1; i++) {
        const k = j * g + i;
        const o = (base + (j - 1) * n1 + (i - 1)) * 3;
        positions[o] = P[k * 3]; positions[o + 1] = P[k * 3 + 1]; positions[o + 2] = P[k * 3 + 2];
        const kl = k - 1, kr = k + 1, kd = k - g, ku = k + g;
        const ux = P[kr * 3] - P[kl * 3], uy = P[kr * 3 + 1] - P[kl * 3 + 1], uz = P[kr * 3 + 2] - P[kl * 3 + 2];
        const vx = P[ku * 3] - P[kd * 3], vy = P[ku * 3 + 1] - P[kd * 3 + 1], vz = P[ku * 3 + 2] - P[kd * 3 + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        // orient outward
        if (nx * P[k * 3] + ny * P[k * 3 + 1] + nz * P[k * 3 + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const nl = Math.hypot(nx, ny, nz) || 1;
        normals[o] = nx / nl; normals[o + 1] = ny / nl; normals[o + 2] = nz / nl;
        if (req.colorMode === 'depth') {
          const c = H[k] > 0 ? ramp(0.12 + 0.88 * (H[k] / ((maxDepth / BALL_RADIUS_IN) * exaggeration))) : RAMP[0];
          colors[o] = c[0]; colors[o + 1] = c[1]; colors[o + 2] = c[2];
        } else {
          colors[o] = 0.96; colors[o + 1] = 0.96; colors[o + 2] = 0.945;
        }
      }
  }
  // FACES are chosen so U × V = N, so the shared index buffer winds counter-clockwise outward
  const index = faceIndex(res);
  return { id: req.id, positions, normals, colors, index };
}
