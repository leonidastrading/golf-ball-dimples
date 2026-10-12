import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BallViewer } from './components/BallViewer';
import { Section, Segmented, Slider, Toggle } from './components/Controls';
import { LineChart } from './components/LineChart';
import { Optimizer } from './components/Optimizer';
import { ConstructionPanel } from './components/ConstructionPanel';
import { constructionEffects } from './model/construction';
import { ProfileChart } from './components/ProfileChart';
import { buildAero } from './model/aero';
import { air, coefficientSweep, simulate } from './model/flight';
import { achievableCounts, buildLayout, coverageAt, diameterForCoverage, features, snapCount } from './model/layout';
import {
  DEFAULT_LAUNCH, DESIGN_PRESETS, LAUNCH_PRESETS, PATENT_PRESETS, PROV1,
  type DesignParams, type DimpleShape, type LaunchParams, type Pattern,
} from './model/types';

const C1 = 'var(--series-1)';
const C2 = 'var(--series-2)';

const ALL_PRESETS = [
  ...DESIGN_PRESETS.map((p) => ({ id: p.id, name: p.name, params: p.params })),
  ...PATENT_PRESETS.map((p) => ({ id: p.id, name: `${p.number} — ${p.title}`, params: p.params })),
];

const SHAPES: { value: DimpleShape; label: string; title: string }[] = [
  { value: 'spherical', label: 'Spherical', title: 'Classic concave spherical dish' },
  { value: 'flat', label: 'Steep-wall', title: 'Shallow flat floor with steep walls (TP5 style)' },
  { value: 'conical', label: 'Conical', title: 'Flat conical walls — Mizuno C-Dimple' },
  { value: 'dual', label: 'Dual', title: 'Deep inner dimple nested in a shallow outer one — Bridgestone Dual Dimple' },
  { value: 'raised', label: 'Raised center', title: 'Central island — Bridgestone Contact Force' },
  { value: 'hex', label: 'Hexagonal', title: 'Hexagonal dimples that tessellate — HEX style' },
];

const PATTERNS: { value: Pattern; label: string; title: string }[] = [
  { value: 'tetrahedral', label: 'Tetrahedral', title: '4-face geodesic tiling (Pro V1 style)' },
  { value: 'octahedral', label: 'Octahedral', title: '8-face geodesic tiling' },
  { value: 'icosahedral', label: 'Icosahedral', title: '20-face geodesic tiling (Pugh / Uniroyal)' },
  { value: 'fibonacci', label: 'Spiral', title: 'Fibonacci spiral — any exact count' },
];

function loadInitial(): { design: DesignParams; launch: LaunchParams } {
  try {
    const h = window.location.hash.slice(1);
    if (h) {
      const j = JSON.parse(decodeURIComponent(atob(h)));
      return { design: { ...PROV1, ...j.d }, launch: { ...DEFAULT_LAUNCH, ...j.l } };
    }
  } catch { /* ignore malformed links */ }
  return { design: PROV1, launch: DEFAULT_LAUNCH };
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const signed = (v: number, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? '±0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`);

export default function App() {
  const init = useMemo(loadInitial, []);
  const [design, setDesign] = useState<DesignParams>(init.design);
  const [launch, setLaunch] = useState<LaunchParams>(init.launch);
  const [compareId, setCompareId] = useState<string>('prov1');
  const [pinned, setPinned] = useState<DesignParams | null>(null);
  const [res, setRes] = useState(256);
  const [exag, setExag] = useState(1);
  const [colorMode, setColorMode] = useState<'white' | 'depth'>('white');
  const [autoRotate, setAutoRotate] = useState(true);
  const [showAxis, setShowAxis] = useState(false);
  const [smoothEdges, setSmoothEdges] = useState(false);
  const [matte, setMatte] = useState(false);
  const [wire, setWire] = useState(false);
  const [presetId, setPresetId] = useState<string>(() => (window.location.hash.length > 1 ? '' : 'prov1'));
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof DesignParams>(k: K, v: DesignParams[K]) => { setDesign((d) => ({ ...d, [k]: v })); setPresetId(''); };
  const setL = <K extends keyof LaunchParams>(k: K, v: LaunchParams[K]) => setLaunch((l) => ({ ...l, [k]: v }));

  const d = useDeferredValue(design);
  const L = useDeferredValue(launch);

  const layout = useMemo(() => buildLayout(d), [d]);
  const feat = useMemo(() => features(d, layout), [d, layout]);
  const aero = useMemo(() => buildAero(d, feat, 'A'), [d, feat]);
  const aeroB = useMemo(() => buildAero(d, feat, 'B'), [d, feat]);

  const compare = useMemo(() => {
    if (compareId === 'pinned' && pinned) return { name: 'Pinned design', params: pinned };
    const p = ALL_PRESETS.find((x) => x.id === compareId) ?? ALL_PRESETS[0];
    return { name: p.name.replace(' (baseline)', ''), params: p.params };
  }, [compareId, pinned]);
  const cLayout = useMemo(() => buildLayout(compare.params), [compare]);
  const cFeat = useMemo(() => features(compare.params, cLayout), [compare, cLayout]);
  const cAero = useMemo(() => buildAero(compare.params, cFeat, 'A'), [compare, cFeat]);

  const a = useMemo(() => air(L), [L]);
  const flight = useMemo(() => simulate(aero, L, a), [aero, L, a]);
  const cFlight = useMemo(() => simulate(cAero, L, a), [cAero, L, a]);

  // USGA-style checks, run at standard conditions
  const checks = useMemo(() => {
    const std: LaunchParams = { ...DEFAULT_LAUNCH, tempF: 75, humidity: 50, altitudeFt: 0, windSpeed: 0 };
    const ods28 = { ...std, ballSpeed: 125 * 1.49, launchAngle: 11, spin: 2220 };
    const odsNow = { ...std, ballSpeed: 120 * 1.49, launchAngle: 10, spin: 2520 };
    const symL = { ...std, ballSpeed: 160, launchAngle: 10, spin: 2800 };
    const sa = simulate(aero, symL), sb = simulate(aeroB, symL);
    return {
      symCarry: Math.abs(sa.carry - sb.carry),
      symTime: Math.abs(sa.hang - sb.hang),
      ods28: simulate(aero, ods28).total,
      odsNow: simulate(aero, odsNow).total,
    };
  }, [aero, aeroB]);

  const sweep = useMemo(() => coefficientSweep(aero, L.spin, a), [aero, L.spin, a]);
  const cSweep = useMemo(() => coefficientSweep(cAero, L.spin, a), [cAero, L.spin, a]);

  const designLabel = presetId ? (ALL_PRESETS.find((p) => p.id === presetId)?.name.replace(' (baseline)', '') ?? 'Your design') : 'Your design';
  const coverage = feat.coverage * 100;
  const maxCoverage = useMemo(() => coverageAt(d, 0.4) * 100, [d.pattern, d.count, d.sizeVariation, d.shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = achievableCounts(design.pattern);
  const symPass = checks.symCarry < 3 && checks.symTime < 0.2;
  const ce = useMemo(() => constructionEffects(d.construction), [d.construction]);
  const cce = useMemo(() => constructionEffects(compare.params.construction), [compare]);
  const weightOk = ce.massG <= 45.93 + 1e-6;
  const ivOk = ce.speedMult <= 1.015;
  const conforming = symPass && design.asymmetry === 'none' && weightOk && ivOk && ce.valid;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const h = btoa(encodeURIComponent(JSON.stringify({ d: design, l: launch })));
        window.history.replaceState(null, '', `#${h}`);
      } catch { /* history may be unavailable in embedded previews */ }
    }, 400);
    return () => clearTimeout(t);
  }, [design, launch]);

  const loadPreset = (id: string) => {
    const p = ALL_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setDesign(p.params);
    setPresetId(id);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  // flight path plus the bounce-and-roll run along the ground to the resting point
  const traj = (f: typeof flight, key: 'z' | 'y') => [
    ...f.points.map((p) => ({ x: p.x, y: p[key] })),
    { x: f.total, y: key === 'z' ? 0 : f.lateral },
  ];
  const maxX = Math.max(flight.total, cFlight.total) * 1.03;
  const maxApex = Math.max(flight.apex, cFlight.apex, 1);
  // plot area is 516 × 176 SVG units (see LineChart); y domain pads the apex by 8%
  const vScale = Math.max(1, Math.round((maxX / 516) / ((maxApex * 1.08) / 176)));

  const rows: { label: string; v: number; c: number; unit: string; d?: number; hint?: string }[] = [
    { label: 'Ball speed (launch)', v: flight.launchSpeed, c: cFlight.launchSpeed, unit: 'mph' },
    { label: 'Launch angle', v: flight.launchAngle, c: cFlight.launchAngle, unit: '°' },
    { label: 'Launch spin', v: flight.launchSpin, c: cFlight.launchSpin, unit: 'rpm', d: 0 },
    { label: 'Carry', v: flight.carry, c: cFlight.carry, unit: 'yd' },
    { label: 'Roll', v: flight.roll, c: cFlight.roll, unit: 'yd' },
    { label: 'Total', v: flight.total, c: cFlight.total, unit: 'yd' },
    { label: 'Apex height', v: flight.apex, c: cFlight.apex, unit: 'yd' },
    { label: 'Hang time', v: flight.hang, c: cFlight.hang, unit: 's', d: 2 },
    { label: 'Descent angle', v: flight.descent, c: cFlight.descent, unit: '°' },
    { label: 'Landing speed', v: flight.landSpeed, c: cFlight.landSpeed, unit: 'mph' },
    { label: 'Spin at landing', v: flight.points[flight.points.length - 1].spin, c: cFlight.points[cFlight.points.length - 1].spin, unit: 'rpm', d: 0 },
    { label: 'Offline at landing', v: flight.carryLateral, c: cFlight.carryLateral, unit: 'yd' },
    { label: 'Offline at rest', v: flight.lateral, c: cFlight.lateral, unit: 'yd' },
    { label: 'Launch Cd', v: flight.launchCd, c: cFlight.launchCd, unit: '', d: 3 },
    { label: 'Launch Cl', v: flight.launchCl, c: cFlight.launchCl, unit: '', d: 3 },
  ];

  const metrics: { label: string; v: number; c: number; unit: string; d?: number }[] = [
    { label: 'Carry', v: flight.carry, c: cFlight.carry, unit: 'yd' },
    { label: 'Total', v: flight.total, c: cFlight.total, unit: 'yd' },
    { label: 'Apex height', v: flight.apex, c: cFlight.apex, unit: 'yd' },
    { label: 'Hang time', v: flight.hang, c: cFlight.hang, unit: 's', d: 2 },
    { label: 'Descent angle', v: flight.descent, c: cFlight.descent, unit: '°' },
    { label: 'Offline', v: flight.lateral, c: cFlight.lateral, unit: 'yd' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="14" fill="#f4f4f2" /><g fill="#bdbdb6"><circle cx="11" cy="11" r="2" /><circle cx="17" cy="9" r="2" /><circle cx="22" cy="13" r="2" /><circle cx="12" cy="17" r="2" /><circle cx="18" cy="15" r="2" /><circle cx="21" cy="20" r="2" /><circle cx="14" cy="23" r="2" /></g></svg>
          <div>
            <h1>Dimple Lab</h1>
            <p>Golf ball dimple design &amp; flight simulator</p>
          </div>
        </div>
        <div className="topbar-controls">
          <label>
            <span>Design</span>
            <select value={presetId} onChange={(e) => loadPreset(e.target.value)}>
              {!presetId && <option value="">Custom design</option>}
              <optgroup label="Commercial">
                {DESIGN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
              <optgroup label="Patents">
                {PATENT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
              </optgroup>
            </select>
          </label>
          <label>
            <span>Compare with</span>
            <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
              {pinned && <option value="pinned">Pinned design</option>}
              <optgroup label="Commercial">
                {DESIGN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
              <optgroup label="Patents">
                {PATENT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
              </optgroup>
            </select>
          </label>
          <button type="button" className="btn" onClick={() => { setPinned(design); setCompareId('pinned'); }}>Pin as comparison</button>
          <button type="button" className="btn" onClick={() => { setDesign(PROV1); setPresetId('prov1'); }}>Reset to Pro V1</button>
          <button type="button" className="btn" onClick={share}>{copied ? 'Link copied' : 'Copy share link'}</button>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <Optimizer
            design={design}
            launch={launch}
            onApply={(best) => { setPinned(design); setCompareId('pinned'); setDesign(best); setPresetId(''); }}
          />
          <Section title="Layout">
            <Segmented
              label="Symmetry pattern"
              value={design.pattern}
              options={PATTERNS}
              onChange={(v) => { setDesign((x) => ({ ...x, pattern: v, count: snapCount(v, x.count) })); setPresetId(''); }}
            />
            <Slider
              label="Number of dimples"
              value={design.count}
              min={150}
              max={700}
              step={1}
              onChange={(v) => set('count', snapCount(design.pattern, v))}
              hint={design.pattern === 'fibonacci'
                ? 'Spiral layouts accept any count.'
                : `Geodesic ${design.pattern} lattices snap to: ${counts.filter((c) => Math.abs(c - design.count) < 120).join(', ')}`}
            />
            <Slider label="Size variation" value={design.sizeVariation * 100} min={0} max={40} step={1} unit="%" onChange={(v) => set('sizeVariation', v / 100)} hint="Spread of diameters around the mean, assigned symmetrically (multi-diameter layouts)." />
          </Section>

          <Section title="Dimple geometry">
            <Segmented label="Shape" value={design.shape} options={SHAPES} onChange={(v) => set('shape', v)} hint={SHAPES.find((s) => s.value === design.shape)?.title} />
            {design.shape === 'hex' ? (
              <>
                <Slider
                  label="Ridge width"
                  value={design.ridgeWidth * 1000}
                  min={1}
                  max={25}
                  step={0.5}
                  decimals={1}
                  unit="thou"
                  display={`${(design.ridgeWidth * 25.4).toFixed(2)} mm`}
                  onChange={(v) => set('ridgeWidth', v / 1000)}
                  hint={`Hex cells tile the ball edge to edge; only the raised ridges between them are flat land. Coverage ${coverage.toFixed(1)}% · cells ${feat.minDiameter.toFixed(3)}–${feat.maxDiameter.toFixed(3)} in across flats (set by the dimple count and size variation).`}
                />
              </>
            ) : (
              <>
              <Slider
                label="Mean diameter"
                value={design.diameter}
                min={0.06}
                max={0.26}
                step={0.001}
                decimals={3}
                unit="in"
                display={`${(design.diameter * 25.4).toFixed(2)} mm`}
                onChange={(v) => set('diameter', v)}
              />
              <Slider
                label="Surface coverage"
                value={coverage}
                min={30}
                max={90}
                step={0.5}
                decimals={1}
                unit="%"
                onChange={(v) => set('diameter', diameterForCoverage(design, v / 100))}
                hint={feat.clampedFraction > 0.05 ? `${Math.round(feat.clampedFraction * 100)}% of dimples are trimmed to avoid overlapping neighbors — max ≈ ${maxCoverage.toFixed(0)}%.` : 'Linked to diameter: changing one updates the other.'}
              />
              </>
            )}
            <Slider
              label="Depth"
              value={design.depth}
              min={0}
              max={0.02}
              step={0.0001}
              decimals={4}
              unit="in"
              display={`${(design.depth * 25.4 * 1000).toFixed(0)} µm`}
              onChange={(v) => set('depth', v)}
            />
            {design.shape === 'hex' && (
              <Slider
                label="Round dimples mixed in"
                value={design.roundMix * 100}
                min={0}
                max={50}
                step={1}
                unit="%"
                onChange={(v) => set('roundMix', v / 100)}
                hint="Callaway-style mix: hexagons, 12 pentagons at the 5-neighbor sites, and round dimples placed symmetrically. Round ones leave a little land around them."
              />
            )}
            {(design.shape === 'spherical' || design.shape === 'flat') && (
              <Slider label="Wall steepness" value={design.wallSteepness * 100} min={0} max={100} step={1} unit="%" onChange={(v) => set('wallSteepness', v / 100)} hint="0% = parabolic dish, 100% = flat floor with steep walls." />
            )}
            {design.shape === 'dual' && (
              <Slider label="Inner dimple diameter" value={design.innerRatio * 100} min={25} max={75} step={1} unit="% of outer" onChange={(v) => set('innerRatio', v / 100)} />
            )}
            {design.shape === 'raised' && (
              <Slider label="Island diameter" value={design.islandRatio * 100} min={15} max={60} step={1} unit="% of dimple" onChange={(v) => set('islandRatio', v / 100)} />
            )}
          </Section>

          <Section title="Surface & symmetry">
            <Toggle label="Micro-dimples in land area" checked={design.microDimples} onChange={(v) => set('microDimples', v)} hint="Small dimples in the gaps between primaries (dimple-cluster) — energize the boundary layer late in flight." />
            {design.microDimples && (
              <Slider
                label="Micro-dimple size"
                value={design.microSize * 100}
                min={20}
                max={60}
                step={1}
                unit="% of primary"
                onChange={(v) => set('microSize', v / 100)}
                hint={`${feat.microCount} micro-dimples placed. Primary dimples are trimmed where needed to make room.`}
              />
            )}
            <Segmented
              label="Paint process"
              value={design.paintProcess}
              options={[{ value: 'spray', label: 'Spray' }, { value: 'microcoat', label: 'Microcoat' }]}
              onChange={(v) => set('paintProcess', v)}
              hint="Spray paint pools in the dimple floor and reduces effective depth; microcoat stays uniform."
            />
            <Slider label="Paint thickness" value={design.paintThickness * 1000} min={0} max={2} step={0.05} decimals={2} unit="thou" onChange={(v) => set('paintThickness', v / 1000)} />
            <Segmented
              label="Asymmetry"
              value={design.asymmetry}
              options={[
                { value: 'none', label: 'Symmetric' },
                { value: 'polara', label: 'Polara band', title: 'Deep equatorial band, shallow poles' },
                { value: 'hemispheric', label: 'Hemispheric', title: 'Deeper dimples on one hemisphere' },
              ]}
              onChange={(v) => set('asymmetry', v)}
              hint={design.asymmetry !== 'none' ? 'Breaks USGA/R&A spherical symmetry (Rule 4.4) — non-conforming.' : undefined}
            />
          </Section>

          <ConstructionPanel value={design.construction} onChange={(c) => set('construction', c)} />

          <Section title="Launch">
            <div className="chips">
              {LAUNCH_PRESETS.map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => setLaunch((l) => ({ ...l, ...p.params }))}>{p.name}</button>
              ))}
            </div>
            <Slider label="Ball speed" value={launch.ballSpeed} min={60} max={200} step={0.5} decimals={1} unit="mph" onChange={(v) => setL('ballSpeed', v)} />
            <Slider label="Launch angle" value={launch.launchAngle} min={0} max={40} step={0.1} decimals={1} unit="°" onChange={(v) => setL('launchAngle', v)} />
            <Slider label="Backspin" value={launch.spin} min={0} max={12000} step={10} unit="rpm" onChange={(v) => setL('spin', v)} />
            <Slider label="Spin axis tilt" value={launch.spinAxis} min={-30} max={30} step={0.5} decimals={1} unit="°" onChange={(v) => setL('spinAxis', v)} hint="+ curves right (fade/slice for a right-hander), − curves left." />
          </Section>

          <Section title="Conditions" defaultOpen={false}>
            <Slider label="Wind speed" value={launch.windSpeed} min={0} max={40} step={0.5} decimals={1} unit="mph" onChange={(v) => setL('windSpeed', v)} />
            <Slider label="Wind from" value={launch.windDir} min={0} max={359} step={1} unit="°" onChange={(v) => setL('windDir', v)} hint="0° = headwind, 90° = from the right, 180° = tailwind." />
            <Slider label="Temperature" value={launch.tempF} min={20} max={110} step={1} unit="°F" onChange={(v) => setL('tempF', v)} />
            <Slider label="Altitude" value={launch.altitudeFt} min={0} max={10000} step={50} unit="ft" onChange={(v) => setL('altitudeFt', v)} />
            <Slider label="Humidity" value={launch.humidity} min={0} max={100} step={1} unit="%" onChange={(v) => setL('humidity', v)} />
            <Segmented label="Fairway" value={launch.ground} options={[{ value: 'soft', label: 'Soft' }, { value: 'medium', label: 'Medium' }, { value: 'firm', label: 'Firm' }]} onChange={(v) => setL('ground', v)} />
            <div className="hint">Air density {a.rho.toFixed(3)} kg/m³</div>
          </Section>
        </aside>

        <main className="main">
          <section className="hero">
            <div className="viewer-wrap">
              <BallViewer layout={layout} opts={d} resolution={res} exaggeration={exag} colorMode={colorMode} autoRotate={autoRotate} showAxis={showAxis} spinAxisDeg={launch.spinAxis} smooth={smoothEdges} matte={matte} wireframe={wire} />
              <div className="viewer-tools">
                <Segmented label="Mesh" value={String(res)} options={[{ value: '160', label: 'Draft' }, { value: '256', label: 'Standard' }, { value: '384', label: 'High' }]} onChange={(v) => setRes(+v)} />
                <Segmented label="Color" value={colorMode} options={[{ value: 'white', label: 'Ball' }, { value: 'depth', label: 'Depth map' }]} onChange={setColorMode} />
                <Slider label="Depth exaggeration" value={exag} min={1} max={6} step={0.5} decimals={1} unit="×" onChange={setExag} />
                <Toggle label="Auto-rotate" checked={autoRotate} onChange={setAutoRotate} />
                <Toggle label="Show spin axis" checked={showAxis} onChange={setShowAxis} />
                <Toggle label="Smooth dimple edges" checked={smoothEdges} onChange={setSmoothEdges} hint="Softens sharp ridges so they don't stair-step on the mesh grid." />
                <Toggle label="Matte (no reflections)" checked={matte} onChange={setMatte} hint="Turns off the glossy coat — best with the depth map." />
                <Toggle label="Wireframe (CAD) view" checked={wire} onChange={setWire} hint="Depth contour rings and spokes for every dimple, drawn like a CAD model." />
              </div>
              <LineChart
                title="Trajectory — side view (flight + roll)"
                xLabel="Distance" xUnit="yd" yLabel={`Height (yd) · vertical scale ×${vScale}`}
                xDomain={[0, maxX]}
                series={[
                  { id: 'd', label: designLabel, color: C1, points: traj(flight, 'z') },
                  { id: 'c', label: compare.name, color: C2, dashed: true, points: traj(cFlight, 'z') },
                ]}
              />
              <LineChart
                title="Trajectory — top view"
                xLabel="Distance" xUnit="yd" yLabel="Offline (+ right)" yUnit="yd"
                xDomain={[0, maxX]}
                symmetricY
                series={[
                  { id: 'd', label: designLabel, color: C1, points: traj(flight, 'y') },
                  { id: 'c', label: compare.name, color: C2, dashed: true, points: traj(cFlight, 'y') },
                ]}
              />
            </div>

            <div className="readouts">
              <div className="compare-note">
                <span className="swatch" style={{ background: C1 }} /> {designLabel}
                <span className="vs">vs</span>
                <span className="swatch dashed" style={{ borderColor: C2 }} /> {compare.name}
              </div>
              <div className="metrics">
                {metrics.map((m) => (
                  <div className="metric" key={m.label}>
                    <div className="metric-label">{m.label}</div>
                    <div className="metric-val">{fmt(m.v, m.d ?? 1)}<span className="metric-unit">{m.unit}</span></div>
                    <div className="metric-delta">{signed(m.v - m.c, m.d ?? 1)} vs {fmt(m.c, m.d ?? 1)}</div>
                  </div>
                ))}
              </div>

              <table className="spec flight-table">
                <caption>Flight comparison</caption>
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col"><span className="swatch" style={{ background: C1 }} /> {designLabel}</th>
                    <th scope="col"><span className="swatch dashed" style={{ borderColor: C2 }} /> {compare.name}</th>
                    <th scope="col">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dd = r.d ?? 1;
                    const diff = r.v - r.c;
                    const pct = Math.abs(r.c) > 1e-6 && r.unit !== '°' ? ` (${signed((diff / Math.abs(r.c)) * 100, 1)}%)` : '';
                    return (
                      <tr key={r.label}>
                        <th scope="row">{r.label}</th>
                        <td>{fmt(r.v, dd)} {r.unit}</td>
                        <td>{fmt(r.c, dd)} {r.unit}</td>
                        <td className={Math.abs(diff) < 0.5 * 10 ** -dd ? 'diff-zero' : ''}>{signed(diff, dd)} {r.unit}{Math.abs(diff) >= 0.5 * 10 ** -dd ? pct : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <table className="spec">
                <caption>Design readout</caption>
                <thead><tr><th scope="col" /><th scope="col">Design</th><th scope="col">Compare</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Construction</th><td>{ce.pieces}-piece · {ce.massG.toFixed(2)} g</td><td>{cce.pieces}-piece · {cce.massG.toFixed(2)} g</td></tr>
                  <tr><th scope="row">Compression (est.)</th><td>{ce.compression.toFixed(0)}</td><td>{cce.compression.toFixed(0)}</td></tr>
                  <tr><th scope="row">Weight distribution (MOI)</th><td>{ce.moiIndex.toFixed(3)}</td><td>{cce.moiIndex.toFixed(3)}</td></tr>
                  <tr><th scope="row">Dimples</th><td>{feat.count}{feat.microCount ? ` + ${feat.microCount} micro` : ''}</td><td>{cFeat.count}{cFeat.microCount ? ` + ${cFeat.microCount} micro` : ''}</td></tr>
                  <tr><th scope="row">Coverage</th><td>{fmt(feat.coverage * 100)}%</td><td>{fmt(cFeat.coverage * 100)}%</td></tr>
                  <tr><th scope="row">Diameter range</th><td>{feat.minDiameter.toFixed(3)}–{feat.maxDiameter.toFixed(3)} in</td><td>{cFeat.minDiameter.toFixed(3)}–{cFeat.maxDiameter.toFixed(3)} in</td></tr>
                  <tr><th scope="row">Effective depth</th><td>{feat.effDepth.toFixed(4)} in</td><td>{cFeat.effDepth.toFixed(4)} in</td></tr>
                  <tr><th scope="row">Volume ratio</th><td>{fmt(feat.volumeRatio * 100, 2)}%</td><td>{fmt(cFeat.volumeRatio * 100, 2)}%</td></tr>
                  <tr><th scope="row">Rim edge angle</th><td>{fmt(feat.edgeAngle)}°</td><td>{fmt(cFeat.edgeAngle)}°</td></tr>
                  <tr><th scope="row">Critical Re (drag crisis)</th><td>{(aero.reCrit / 1000).toFixed(0)}k</td><td>{(cAero.reCrit / 1000).toFixed(0)}k</td></tr>
                  <tr><th scope="row">Launch Cd / Cl</th><td>{flight.launchCd.toFixed(3)} / {flight.launchCl.toFixed(3)}</td><td>{cFlight.launchCd.toFixed(3)} / {cFlight.launchCl.toFixed(3)}</td></tr>
                  <tr><th scope="row">Reynolds range in flight</th><td colSpan={2}>{(flight.minRe / 1000).toFixed(0)}k – {(flight.maxRe / 1000).toFixed(0)}k</td></tr>
                </tbody>
              </table>

              <div className="checks">
                <div className={`check ${symPass && design.asymmetry === 'none' ? 'ok' : 'bad'}`}>
                  <span className="check-icon" aria-hidden>{symPass && design.asymmetry === 'none' ? '✓' : '✕'}</span>
                  <div>
                    <strong>Symmetry test {symPass && design.asymmetry === 'none' ? 'pass' : 'fail'}</strong>
                    <span>Δcarry {checks.symCarry.toFixed(2)} yd (limit 3.0) · Δtime {checks.symTime.toFixed(2)} s (limit 0.2)</span>
                  </div>
                </div>
                <div className={`check ${checks.ods28 <= 317 ? 'ok' : 'warn'}`}>
                  <span className="check-icon" aria-hidden>{checks.ods28 <= 317 ? '✓' : '!'}</span>
                  <div>
                    <strong>ODS 2028: {fmt(checks.ods28)} yd</strong>
                    <span>125 mph club, 11°, 2220 rpm · limit 317 yd · current-test estimate {fmt(checks.odsNow)} yd</span>
                  </div>
                </div>
                <div className={`check ${conforming ? 'ok' : 'bad'}`}>
                  <span className="check-icon" aria-hidden>{conforming ? '✓' : '✕'}</span>
                  <div>
                    <strong>{conforming ? 'Conforming layout' : 'Non-conforming'}</strong>
                    <span>
                      {conforming
                        ? `Symmetric · ${ce.massG.toFixed(2)} g · initial velocity ${signed((ce.speedMult - 1) * 100, 1)}% vs Pro V1`
                        : [
                            design.asymmetry !== 'none' || !symPass ? 'asymmetric flight breaches Rule 4.4' : '',
                            !weightOk ? `weighs ${ce.massG.toFixed(2)} g (max 45.93)` : '',
                            !ivOk ? `ball speed ${signed((ce.speedMult - 1) * 100, 1)}% vs Pro V1 likely exceeds the initial-velocity limit` : '',
                            !ce.valid ? ce.problem ?? '' : '',
                          ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="charts">
            <LineChart
              title={`Drag coefficient vs air speed (at ${Math.round(L.spin)} rpm)`}
              xLabel="Air speed" xUnit="mph" yLabel="Cd" yDecimals={3}
              markers={[{ x: L.ballSpeed, label: 'launch' }]}
              series={[
                { id: 'd', label: designLabel, color: C1, points: sweep.map((s) => ({ x: s.mph, y: s.cd })) },
                { id: 'c', label: compare.name, color: C2, dashed: true, points: cSweep.map((s) => ({ x: s.mph, y: s.cd })) },
              ]}
            />
            <LineChart
              title={`Lift coefficient vs air speed (at ${Math.round(L.spin)} rpm)`}
              xLabel="Air speed" xUnit="mph" yLabel="Cl" yDecimals={3}
              markers={[{ x: L.ballSpeed, label: 'launch' }]}
              series={[
                { id: 'd', label: designLabel, color: C1, points: sweep.map((s) => ({ x: s.mph, y: s.cl })) },
                { id: 'c', label: compare.name, color: C2, dashed: true, points: cSweep.map((s) => ({ x: s.mph, y: s.cl })) },
              ]}
            />
            <LineChart
              title="Air speed through the flight"
              xLabel="Distance" xUnit="yd" yLabel="Speed" yUnit="mph"
              xDomain={[0, maxX]}
              series={[
                { id: 'd', label: designLabel, color: C1, points: flight.points.map((p) => ({ x: p.x, y: p.v })) },
                { id: 'c', label: compare.name, color: C2, dashed: true, points: cFlight.points.map((p) => ({ x: p.x, y: p.v })) },
              ]}
            />
            <ProfileChart
              opts={d}
              diameter={feat.meanDiameter}
              depth={feat.effDepth}
              label={designLabel}
              compare={{ opts: compare.params, diameter: cFeat.meanDiameter, depth: cFeat.effDepth, label: compare.name }}
            />
          </section>

          <section className="patents">
            <h2>Patent library</h2>
            <p className="sub">Load an approximation of a patented layout into the designer. The app generates each one from its symmetry, count and dimple type, so they aren't exact reproductions of the patent drawings.</p>
            <div className="patent-grid">
              {PATENT_PRESETS.map((p) => (
                <article className="patent" key={p.id}>
                  <div className="patent-num">{p.number}</div>
                  <h3>{p.title}</h3>
                  <div className="patent-meta">{p.holder} · {p.year}</div>
                  <p>{p.summary}</p>
                  <div className="patent-actions">
                    <button type="button" className="btn" onClick={() => loadPreset(p.id)}>Load design</button>
                    <button type="button" className="btn ghost" onClick={() => setCompareId(p.id)}>Compare</button>
                    <a href={p.url} target="_blank" rel="noreferrer">Patent record ↗</a>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <footer className="notes">
            <h2>How the model works</h2>
            <p>
              Flight is a 3-DOF point-mass simulation (RK4, 5 ms steps) with drag, Magnus lift, spin decay, wind and air density from temperature, altitude and humidity.
              Cd and Cl follow the classic golf-ball fits (Cd ≈ c₀ + c₁S, Cl ≈ a·S^0.4) blended with a drag-crisis transition in Reynolds number.
              Their coefficients scale from the design's measured surface features: coverage, dimple volume ratio, depth/diameter, rim edge angle, count and shape, relative to a Pro V1 baseline calibrated to PGA Tour driver averages
              (167 mph, 10.9°, 2686 rpm → ≈275 yd carry, 32–34 yd apex).
              Directional trends follow published wind-tunnel results and patent claims. Absolute numbers for exotic designs are estimates, not measurements.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
