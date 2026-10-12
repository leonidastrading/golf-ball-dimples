// kept local (not imported from ./types) to avoid an import cycle: types.ts imports this module
const BALL_RADIUS_IN = 0.84;

/**
 * Multi-layer ball construction model.
 *
 * Layers go from the center out: a rubber core, 0–3 mantle/casing layers, and a cover.
 * The model derives mass, moment of inertia, an effective COR (ball speed), compression and
 * driver/wedge spin tendencies. Everything is expressed relative to the Pro V1's 3-piece
 * construction, so the Pro V1 launch numbers stay the reference.
 *
 * Trends encoded (from manufacturer literature and the ball-construction patents):
 *  - the core stores most of the impact energy: core resilience drives ball speed
 *  - a soft core under a firm mantle (a large hardness gradient) lowers driver spin
 *  - a soft urethane cover grips the grooves on short, high-spin shots; ionomer spins less
 *  - mass pushed to the outside (dense outer layers) raises MOI, which slows spin decay
 */

export type MaterialId =
  | 'pb-soft' | 'pb-mid' | 'pb-firm'
  | 'hnp' | 'ionomer-soft' | 'ionomer-hard'
  | 'cast-urethane' | 'tpu' | 'ionomer-cover' | 'balata';

export interface Material {
  id: MaterialId;
  name: string;
  kind: 'core' | 'mantle' | 'cover';
  density: number; // g/cm³
  cor: number; // material resilience at driver impact speeds
  shoreD: number; // hardness
  color: string;
  note: string;
}

export const MATERIALS: Record<MaterialId, Material> = {
  'pb-soft': { id: 'pb-soft', name: 'Polybutadiene — soft', kind: 'core', density: 1.15, cor: 0.79, shoreD: 42, color: '#e0a84a', note: 'Low compression, soft feel, low driver spin' },
  'pb-mid': { id: 'pb-mid', name: 'Polybutadiene — medium', kind: 'core', density: 1.15, cor: 0.8, shoreD: 50, color: '#d98a3a', note: 'Tour-ball core' },
  'pb-firm': { id: 'pb-firm', name: 'Polybutadiene — firm', kind: 'core', density: 1.15, cor: 0.81, shoreD: 58, color: '#c96a2c', note: 'High resilience, firm feel' },
  hnp: { id: 'hnp', name: 'HNP (highly neutralized polymer)', kind: 'mantle', density: 0.96, cor: 0.815, shoreD: 52, color: '#5aa9a0', note: 'Resilient yet soft — used as an outer core' },
  'ionomer-soft': { id: 'ionomer-soft', name: 'Ionomer — soft', kind: 'mantle', density: 0.95, cor: 0.76, shoreD: 56, color: '#7f8fd6', note: 'Softer casing layer' },
  'ionomer-hard': { id: 'ionomer-hard', name: 'Ionomer — high-acid', kind: 'mantle', density: 0.95, cor: 0.8, shoreD: 66, color: '#5f6fd0', note: 'Firm, fast casing — lowers driver spin' },
  'cast-urethane': { id: 'cast-urethane', name: 'Cast urethane', kind: 'cover', density: 1.12, cor: 0.66, shoreD: 52, color: '#f2f2ee', note: 'Tour cover: high wedge spin, soft feel' },
  tpu: { id: 'tpu', name: 'Thermoplastic urethane', kind: 'cover', density: 1.15, cor: 0.68, shoreD: 56, color: '#e6e6df', note: 'Cheaper urethane, a little less spin' },
  'ionomer-cover': { id: 'ionomer-cover', name: 'Ionomer (Surlyn)', kind: 'cover', density: 0.95, cor: 0.78, shoreD: 65, color: '#d8dde6', note: 'Durable, fast, low spin' },
  balata: { id: 'balata', name: 'Balata (historic)', kind: 'cover', density: 1.05, cor: 0.62, shoreD: 45, color: '#efe4cf', note: 'Very soft and high-spin, cuts easily' },
};

export interface Layer {
  material: MaterialId;
  /** radial thickness in inches (ignored for the core, which fills what's left) */
  thickness: number;
}

export interface Construction {
  /** layers[0] is the core; the last layer is the cover */
  layers: Layer[];
  /** target ball weight in grams; the core's filler is tuned to reach it */
  weight: number;
}

export const PROV1_CONSTRUCTION: Construction = {
  layers: [
    { material: 'pb-mid', thickness: 0 },
    { material: 'ionomer-hard', thickness: 0.035 },
    { material: 'cast-urethane', thickness: 0.03 },
  ],
  weight: 45.93,
};

export const CONSTRUCTION_PRESETS: { id: string; name: string; note: string; c: Construction }[] = [
  {
    id: '2pc', name: '2-piece distance', note: 'Big firm core + thick ionomer cover. Fast and durable, low spin everywhere.',
    c: { layers: [{ material: 'pb-firm', thickness: 0 }, { material: 'ionomer-cover', thickness: 0.06 }], weight: 45.93 },
  },
  { id: '3pc', name: '3-piece tour (Pro V1)', note: 'Core, firm ionomer casing, cast urethane cover.', c: PROV1_CONSTRUCTION },
  {
    id: '4pc', name: '4-piece dual core', note: 'Soft inner core, resilient HNP outer core, casing, urethane.',
    c: { layers: [{ material: 'pb-soft', thickness: 0 }, { material: 'hnp', thickness: 0.12 }, { material: 'ionomer-hard', thickness: 0.035 }, { material: 'cast-urethane', thickness: 0.03 }], weight: 45.93 },
  },
  {
    id: '5pc', name: '5-piece tour', note: 'Four layers of increasing firmness under a thin urethane cover.',
    c: {
      layers: [
        { material: 'pb-soft', thickness: 0 }, { material: 'hnp', thickness: 0.09 }, { material: 'ionomer-soft', thickness: 0.05 },
        { material: 'ionomer-hard', thickness: 0.035 }, { material: 'cast-urethane', thickness: 0.025 },
      ],
      weight: 45.93,
    },
  },
  {
    id: 'balata', name: 'Balata (1980s style)', note: 'Soft core under a soft balata cover — high spin, short off the tee.',
    c: { layers: [{ material: 'pb-soft', thickness: 0 }, { material: 'balata', thickness: 0.05 }], weight: 45.93 },
  },
];

export interface ConstructionProps {
  pieces: number;
  radii: number[]; // outer radius of each layer, in
  coreDiameter: number; // in
  massG: number;
  coreDensity: number; // g/cm³ after filler tuning
  coreDensityOk: boolean;
  moiIndex: number; // I / (0.4 m R²); 1 = uniform sphere, >1 = mass toward the outside
  cor: number; // effective COR
  compression: number; // PGA-style estimate
  driverSpinMult: number;
  wedgeSpinMult: number;
  speedMult: number; // ball speed vs Pro V1
  launchDelta: number; // deg vs Pro V1 at driver
  valid: boolean;
  problem?: string;
}

const CM = 2.54;
const MIN_CORE = 0.8; // in

function raw(c: Construction) {
  const R = BALL_RADIUS_IN;
  const outer = c.layers.slice(1).reduce((s, l) => s + l.thickness, 0);
  const coreD = 1.68 - 2 * outer;
  const radii: number[] = [];
  let r = coreD / 2;
  radii.push(r);
  for (const l of c.layers.slice(1)) { r += l.thickness; radii.push(r); }
  radii[radii.length - 1] = R;
  // shell volumes (cm³) and moments of inertia, before core filler tuning
  const shells = c.layers.map((l, i) => {
    const ro = radii[i] * CM, ri = i === 0 ? 0 : radii[i - 1] * CM;
    return { m: MATERIALS[l.material], vol: (4 / 3) * Math.PI * (ro ** 3 - ri ** 3), i5: (8 * Math.PI / 15) * (ro ** 5 - ri ** 5), t: radii[i] - (i === 0 ? 0 : radii[i - 1]) };
  });
  return { coreD, radii, shells };
}

export function analyze(c: Construction): ConstructionProps {
  const { coreD, radii, shells } = raw(c);
  const R = BALL_RADIUS_IN * CM;
  const outerMass = shells.slice(1).reduce((s, x) => s + x.vol * x.m.density, 0);
  let coreDensity = (c.weight - outerMass) / shells[0].vol;
  const coreDensityOk = coreDensity >= 0.95 && coreDensity <= 1.6;
  coreDensity = Math.min(1.6, Math.max(0.95, coreDensity));
  const dens = shells.map((x, i) => (i === 0 ? coreDensity : x.m.density));
  const massG = shells.reduce((s, x, i) => s + x.vol * dens[i], 0);
  const I = shells.reduce((s, x, i) => s + x.i5 * dens[i], 0);
  const moiIndex = I / (0.4 * massG * R * R);

  // effective COR: volume-weighted resilience (the whole ball deforms at driver speeds)
  const vol = shells.reduce((s, x) => s + x.vol, 0);
  const cor = shells.reduce((s, x) => s + (x.vol / vol) * x.m.cor, 0);

  // compression: the core sets it, firm outer layers stiffen it
  const coreComp = 30 + 1.1 * shells[0].m.shoreD;
  const compression = coreComp + shells.slice(1).reduce((s, x) => s + (x.m.shoreD - 50) * (x.t / 0.03) * 0.3, 0) + (1.55 - coreD) * 20;

  // spin: a large hardness step from the core to the layer under the cover lowers driver spin
  const cover = shells[shells.length - 1].m;
  const under = shells.length > 2 ? shells[shells.length - 2].m : cover;
  const gradient = under.shoreD - shells[0].m.shoreD;
  const coverT = c.layers[c.layers.length - 1].thickness;
  const driverSpin = 1 - 0.006 * gradient - 0.008 * (cover.shoreD - 52) + 0.6 * (coverT - 0.03);
  const wedgeSpin = 1 - 0.022 * (cover.shoreD - 52) + 1.5 * (coverT - 0.03);

  let problem: string | undefined;
  if (coreD < MIN_CORE) problem = `Layers are too thick: the core would be only ${coreD.toFixed(2)} in.`;
  else if (!coreDensityOk) problem = `Can't reach ${c.weight.toFixed(2)} g — core would need ${((c.weight - outerMass) / shells[0].vol).toFixed(2)} g/cm³ of filler.`;

  return {
    pieces: c.layers.length, radii, coreDiameter: coreD, massG, coreDensity, coreDensityOk, moiIndex, cor, compression,
    driverSpinMult: driverSpin, wedgeSpinMult: wedgeSpin, speedMult: 1, launchDelta: 0, valid: !problem, problem,
  };
}

const REF = analyze(PROV1_CONSTRUCTION);

/** Construction effects relative to the Pro V1 (so Pro V1 = exactly 1). */
export function constructionEffects(c: Construction) {
  const p = analyze(c);
  const head = 200; // g, driver head mass for the momentum transfer
  const speed = ((1 + p.cor) / (1 + REF.cor)) * ((1 + REF.massG / head) / (1 + p.massG / head));
  const drv = Math.min(1.3, Math.max(0.65, p.driverSpinMult / REF.driverSpinMult));
  const wdg = Math.min(1.3, Math.max(0.5, p.wedgeSpinMult / REF.wedgeSpinMult));
  // lower-spinning, softer balls launch a touch higher
  const launchDelta = -(drv - 1) * 6 - (p.compression - REF.compression) * 0.01;
  return {
    ...p,
    speedMult: speed,
    driverSpinMult: drv,
    wedgeSpinMult: wdg,
    launchDelta,
    massKg: p.massG / 1000,
    // more inertia → slower spin decay
    spinTauMult: p.moiIndex / REF.moiIndex,
    compressionRef: REF.compression,
  };
}

export type ConstructionEffects = ReturnType<typeof constructionEffects>;

/** Spin multiplier for a given launch spin: drivers follow the core/mantle, wedges follow the cover. */
export function spinBlend(e: Pick<ConstructionEffects, 'driverSpinMult' | 'wedgeSpinMult'>, rpm: number) {
  const t = Math.min(1, Math.max(0, (rpm - 3000) / 6000));
  return e.driverSpinMult * (1 - t) + e.wedgeSpinMult * t;
}
