import { PROV1_CONSTRUCTION, PROV1X_CONSTRUCTION, type Construction } from './construction';

export type Pattern = 'tetrahedral' | 'octahedral' | 'icosahedral' | 'fibonacci';
export type DimpleShape = 'spherical' | 'conical' | 'dual' | 'raised' | 'hex' | 'flat';
export type PaintProcess = 'spray' | 'microcoat';
export type Asymmetry = 'none' | 'polara' | 'hemispheric';

export interface DesignParams {
  count: number;
  pattern: Pattern;
  shape: DimpleShape;
  /** mean dimple diameter, inches */
  diameter: number;
  /** dimple depth below the land surface, inches */
  depth: number;
  /** 0..0.4 – spread of dimple diameters around the mean */
  sizeVariation: number;
  /** 0..1 – rim/wall steepness for spherical and flat profiles */
  wallSteepness: number;
  /** dual dimple: inner diameter as a fraction of the outer diameter */
  innerRatio: number;
  /** raised center: island diameter as a fraction of the dimple diameter */
  islandRatio: number;
  /** add micro-dimples in the land area between primary dimples */
  microDimples: boolean;
  /** hex layouts: width of the raised ridge between neighboring cells, inches */
  ridgeWidth: number;
  /** hex layouts: fraction of dimples that are round instead of hexagonal */
  roundMix: number;
  /** micro-dimple diameter as a fraction of the mean primary diameter */
  microSize: number;
  /** paint layer thickness, inches */
  paintThickness: number;
  paintProcess: PaintProcess;
  /** none = spherically symmetric; polara = deep equatorial band + shallow poles;
   *  hemispheric = deeper dimples on one hemisphere than the other */
  asymmetry: Asymmetry;
  /** core / mantle / cover layers */
  construction: Construction;
}

export interface LaunchParams {
  ballSpeed: number; // mph
  launchAngle: number; // deg
  spin: number; // rpm
  spinAxis: number; // deg, + curves right
  windSpeed: number; // mph
  windDir: number; // deg, direction wind blows FROM, 0 = headwind, 90 = from the right
  tempF: number;
  altitudeFt: number;
  humidity: number; // %
  ground: 'soft' | 'medium' | 'firm';
}

export const PROV1: DesignParams = {
  count: 388,
  pattern: 'tetrahedral',
  shape: 'spherical',
  diameter: 0.155,
  depth: 0.0082,
  sizeVariation: 0.12,
  wallSteepness: 0.25,
  innerRatio: 0.5,
  islandRatio: 0.35,
  microDimples: false,
  microSize: 0.3,
  roundMix: 0,
  ridgeWidth: 0.004,
  paintThickness: 0.0005,
  paintProcess: 'spray',
  asymmetry: 'none',
  construction: PROV1_CONSTRUCTION,
};

export interface DesignPreset {
  id: string;
  name: string;
  note: string;
  params: DesignParams;
}

export const DESIGN_PRESETS: DesignPreset[] = [
  { id: 'prov1', name: 'Titleist Pro V1 (baseline)', note: '388 tetrahedral, multi-diameter spherical dimples. Penetrating mid flight.', params: PROV1 },
  {
    id: 'prov1x', name: 'Titleist Pro V1x', note: '348 shallower dimples on a 4-piece dual core — higher flight and more spin than the Pro V1.',
    params: { ...PROV1, count: 348, diameter: 0.163, depth: 0.0076, construction: PROV1X_CONSTRUCTION },
  },
  {
    id: 'tp5x', name: 'TaylorMade TP5x', note: '322 shallow, steep-walled dimples with microcoat paint.',
    params: { ...PROV1, count: 322, pattern: 'icosahedral', shape: 'flat', diameter: 0.168, depth: 0.0068, wallSteepness: 0.8, sizeVariation: 0.08, paintProcess: 'microcoat' },
  },
  {
    id: 'tourbxs', name: 'Bridgestone Tour B XS', note: '330 Dual Dimple: deep inner cavity nested in a shallow outer one.',
    params: { ...PROV1, count: 330, pattern: 'icosahedral', shape: 'dual', diameter: 0.166, depth: 0.0095, innerRatio: 0.5, sizeVariation: 0.08 },
  },
  {
    id: 'rbtour', name: 'Mizuno RB Tour', note: '360 C-Dimple: flat conical walls act as vortex triggers.',
    params: { ...PROV1, count: 360, pattern: 'icosahedral', shape: 'conical', diameter: 0.160, depth: 0.0105, sizeVariation: 0.06 },
  },
  {
    id: 'rb566', name: 'Mizuno RB 566', note: '566 dimple cluster with micro-dimples in the land area.',
    params: { ...PROV1, count: 566, pattern: 'fibonacci', diameter: 0.122, depth: 0.0068, microDimples: true, microSize: 0.35, sizeVariation: 0.15 },
  },
  {
    id: 'e12', name: 'Bridgestone e12 CONTACT', note: '326 Contact Force dimples with a raised central island.',
    params: { ...PROV1, count: 326, pattern: 'icosahedral', shape: 'raised', diameter: 0.168, depth: 0.0092, islandRatio: 0.38, sizeVariation: 0.06 },
  },
  {
    id: 'hex', name: 'Hexagonal (HEX-style)', note: '332 hexagonal dimples tessellate with almost no land area.',
    params: { ...PROV1, count: 332, pattern: 'icosahedral', shape: 'hex', diameter: 0.165, depth: 0.0072, sizeVariation: 0 },
  },
  {
    id: 'chromesoft', name: 'Callaway Chrome Soft (2024-style)', note: 'Hexagons + 12 pentagons mixed with round dimples for flight stability (312 here; Callaway uses 332, which no icosahedral lattice produces).',
    params: { ...PROV1, count: 312, pattern: 'icosahedral', shape: 'hex', diameter: 0.172, depth: 0.0072, sizeVariation: 0, roundMix: 0.18 },
  },
  {
    id: 'chrometourx', name: 'Callaway Chrome Tour X-style', note: 'Mixed-size hexagons tessellated edge to edge, smaller ones tucked between larger ones, a few round dimples and thin ridges.',
    params: { ...PROV1, count: 362, pattern: 'icosahedral', shape: 'hex', diameter: 0.16, depth: 0.0074, sizeVariation: 0.3, roundMix: 0.06, ridgeWidth: 0.004 },
  },
  {
    id: 'polara', name: 'Polara (non-conforming)', note: 'Deep equatorial band, shallow poles — damps hooks and slices.',
    params: { ...PROV1, count: 392, pattern: 'octahedral', diameter: 0.150, asymmetry: 'polara', sizeVariation: 0 },
  },
  {
    id: 'smooth', name: 'Smooth sphere', note: 'No dimples — early laminar separation and a huge wake.',
    params: { ...PROV1, depth: 0 },
  },
];

export interface PatentPreset {
  id: string;
  number: string;
  title: string;
  year: string;
  holder: string;
  summary: string;
  url: string;
  params: DesignParams;
}

/** Patents whose number and content were checked against USPTO / Google Patents listings.
 *  Each preset is an approximation of the disclosed layout using this app's generator. */
export const PATENT_PRESETS: PatentPreset[] = [
  {
    id: 'taylor', number: 'US 878,254', title: 'Golf ball', year: '1908', holder: 'William Taylor',
    summary: 'Foundational patent for regularly spaced, uniform recessed markings instead of the raised brambles of the day.',
    url: 'https://patents.google.com/patent/US878254',
    params: { ...PROV1, count: 332, pattern: 'fibonacci', diameter: 0.14, depth: 0.010, sizeVariation: 0, wallSteepness: 0 },
  },
  {
    id: 'uniroyal', number: 'US 4,090,716', title: 'Golf ball', year: '1978 (filed 1976)', holder: 'Uniroyal — Martin & Pietraszek',
    summary: '252 depressions: 240 hexagonal-based and 12 pentagonal-based, the pentagons forming vertices of spherical triangles that divide the surface.',
    url: 'https://patents.google.com/patent/US4090716',
    params: { ...PROV1, count: 252, pattern: 'icosahedral', shape: 'hex', diameter: 0.19, depth: 0.0095, sizeVariation: 0 },
  },
  {
    id: 'nepela', number: 'US 3,819,190', title: 'Golf ball (Polara type)', year: '1970s', holder: 'Nepela et al.',
    summary: 'Non-conforming ball with enlarged, shallower dimples along one axis and smaller, deeper dimples along another — the basis of the Polara.',
    url: 'https://patents.google.com/patent/US3819190',
    params: { ...PROV1, count: 392, pattern: 'octahedral', diameter: 0.15, sizeVariation: 0, asymmetry: 'polara' },
  },
  {
    id: 'shaw', number: 'US 4,142,727', title: 'Golf ball', year: '1970s', holder: 'Shaw et al.',
    summary: 'Achieves symmetry with multiple dimple-free great circles on the sphere (an octahedral-style partition).',
    url: 'https://patents.google.com/patent/US4142727',
    params: { ...PROV1, count: 336, pattern: 'octahedral', diameter: 0.155, sizeVariation: 0.05 },
  },
  {
    id: 'lisco', number: 'US 5,149,100', title: 'Golf ball', year: '1990s', holder: 'Lisco (now Topgolf Callaway) — Melvin & Stiefel',
    summary: 'Modified Pugh icosahedral pattern: a dimple at each pole, a hexagonal group around it, pentagonal groups down to the equator, mirrored hemispheres.',
    url: 'https://patents.google.com/patent/US5149100',
    params: { ...PROV1, count: 362, pattern: 'icosahedral', diameter: 0.155, sizeVariation: 0.1 },
  },
  {
    id: '1220', number: 'US 5,700,209', title: 'Golf ball', year: '1990s', holder: 'see patent record',
    summary: 'Surface divided into 12 spherical pentagons and 20 spherical triangles — the facets of the 12-20 hedron (icosidodecahedron).',
    url: 'https://patents.google.com/patent/US5700209',
    params: { ...PROV1, count: 392, pattern: 'icosahedral', diameter: 0.15, sizeVariation: 0.18 },
  },
  {
    id: 'hexecontahedron', number: 'US 6,527,653', title: 'Golf ball (pentagonal hexecontahedron)', year: '2000s', holder: 'see patent record',
    summary: 'Dimple pattern based on a pentagonal hexecontahedron — a 60-faced solid with icosahedral symmetry and many diameter gradations.',
    url: 'https://patents.google.com/patent/US6527653',
    params: { ...PROV1, count: 482, pattern: 'icosahedral', diameter: 0.135, sizeVariation: 0.3 },
  },
];

export interface LaunchPreset {
  id: string;
  name: string;
  params: Partial<LaunchParams>;
}

export const DEFAULT_LAUNCH: LaunchParams = {
  ballSpeed: 167,
  launchAngle: 10.9,
  spin: 2686,
  spinAxis: 0,
  windSpeed: 0,
  windDir: 0,
  tempF: 70,
  altitudeFt: 0,
  humidity: 50,
  ground: 'medium',
};

export const LAUNCH_PRESETS: LaunchPreset[] = [
  { id: 'driver-tour', name: 'Driver — Tour avg', params: { ballSpeed: 167, launchAngle: 10.9, spin: 2686 } },
  { id: 'driver-am', name: 'Driver — amateur', params: { ballSpeed: 140, launchAngle: 12.5, spin: 3100 } },
  { id: 'driver-slow', name: 'Driver — slow swing', params: { ballSpeed: 115, launchAngle: 14, spin: 3200 } },
  { id: '7iron', name: '7-iron — Tour avg', params: { ballSpeed: 120, launchAngle: 16.3, spin: 7097 } },
  { id: 'pw', name: 'Pitching wedge — Tour', params: { ballSpeed: 102, launchAngle: 24.2, spin: 9304 } },
  { id: 'ods2028', name: 'USGA ODS 2028 test', params: { ballSpeed: 125 * 1.49, launchAngle: 11, spin: 2220, spinAxis: 0, windSpeed: 0 } },
];

export const BALL_DIAMETER_IN = 1.68;
/** narrowest ridge between dimples that can be molded and painted reliably */
export const MIN_RIDGE_IN = 0.003;
export const BALL_RADIUS_IN = BALL_DIAMETER_IN / 2;
