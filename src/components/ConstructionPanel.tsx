import { CONSTRUCTION_PRESETS, MATERIALS, analyze, type Construction, type MaterialId } from '../model/construction';
import { Section, Slider } from './Controls';

interface Props {
  value: Construction;
  onChange: (c: Construction) => void;
}

const CORE_MATS = Object.values(MATERIALS).filter((m) => m.kind === 'core');
const LAYER_MATS = Object.values(MATERIALS);

function layerName(i: number, n: number) {
  if (i === 0) return n > 3 ? 'Inner core' : 'Core';
  if (i === n - 1) return 'Cover';
  if (n >= 4 && i === 1) return 'Outer core';
  return n - 1 - i === 1 ? 'Casing (mantle)' : `Mantle ${i}`;
}

/** True-scale half cross-section of the layers. */
function CrossSection({ c }: { c: Construction }) {
  const p = analyze(c);
  const S = 240, cx = 8, cy = S / 2, scale = (S / 2 - 6) / 0.84;
  const n = c.layers.length;
  return (
    <svg viewBox={`0 0 ${S + 196} ${S}`} className="xsec" role="img" aria-label="Ball cross-section showing each layer">
      {c.layers.map((_, i) => i).reverse().map((i) => {
        const r = p.radii[i] * scale;
        return <path key={i} d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`} fill={MATERIALS[c.layers[i].material].color} stroke="var(--surface-1)" strokeWidth={0.6} />;
      })}
      {c.layers.map((l, i) => {
        const rIn = i === 0 ? 0 : p.radii[i - 1] * scale;
        const rOut = p.radii[i] * scale;
        const rm = (rIn + rOut) / 2;
        const ang = (-60 + (120 * (i + 0.5)) / n) * (Math.PI / 180);
        const x = cx + rm * Math.cos(ang), y = cy + rm * Math.sin(ang);
        const ly = 22 + ((S - 44) * i) / Math.max(1, n - 1);
        const t = i === 0 ? `⌀ ${p.coreDiameter.toFixed(3)} in` : `${l.thickness.toFixed(3)} in · ${(l.thickness * 25.4).toFixed(2)} mm`;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={2} fill="var(--text-primary)" />
            <polyline points={`${x},${y} ${S - 18},${ly} ${S - 8},${ly}`} fill="none" stroke="var(--text-muted)" strokeWidth={0.8} />
            <text x={S - 4} y={ly - 10} className="xsec-label">{layerName(i, n)}</text>
            <text x={S - 4} y={ly + 4} className="xsec-mat">{MATERIALS[l.material].name}</text>
            <text x={S - 4} y={ly + 18} className="xsec-sub">{t}</text>
          </g>
        );
      })}
    </svg>
  );
}

function sameConstruction(a: Construction, b: Construction) {
  return (
    Math.abs(a.weight - b.weight) < 1e-6 &&
    a.layers.length === b.layers.length &&
    a.layers.every((l, i) => l.material === b.layers[i].material && (i === 0 || Math.abs(l.thickness - b.layers[i].thickness) < 1e-6))
  );
}

export function ConstructionPanel({ value, onChange }: Props) {
  const p = analyze(value);
  const n = value.layers.length;
  const active = CONSTRUCTION_PRESETS.find((cp) => sameConstruction(cp.c, value));
  const setLayer = (i: number, patch: Partial<Construction['layers'][number]>) =>
    onChange({ ...value, layers: value.layers.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const addMantle = () => {
    if (n >= 5) return;
    const layers = [...value.layers];
    layers.splice(n - 1, 0, { material: 'ionomer-soft', thickness: 0.04 });
    onChange({ ...value, layers });
  };
  const removeLayer = (i: number) => onChange({ ...value, layers: value.layers.filter((_, j) => j !== i) });

  return (
    <Section title="Construction (layers)" defaultOpen={false}>
      <div className="hint">
        The core stores most of the impact energy (ball speed). A firm mantle over a soft core cuts driver spin. The cover decides wedge spin: soft urethane grips, ionomer slides.
        Your launch numbers are treated as Pro V1 numbers; construction shifts them.
      </div>
      <div className="chips">
        {CONSTRUCTION_PRESETS.map((cp) => {
          const on = sameConstruction(cp.c, value);
          return (
            <button key={cp.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} title={cp.note} onClick={() => onChange(cp.c)}>
              {on && <span aria-hidden>✓ </span>}{cp.name}
            </button>
          );
        })}
        {!active && <span className="chip on static" aria-label="Custom construction selected">✓ Custom ({n}-piece)</span>}
      </div>
      <div className="hint">{active ? active.note : 'Edited from a preset — pick a preset above to reset.'}</div>
      <CrossSection c={value} />
      {value.layers.map((l, i) => {
        const mats = i === 0 ? CORE_MATS : LAYER_MATS;
        return (
          <div className="layer" key={i}>
            <div className="layer-head">
              <span className="layer-swatch" style={{ background: MATERIALS[l.material].color }} />
              <strong>{layerName(i, n)}</strong>
              {i > 0 && i < n - 1 && <button type="button" className="link-btn" onClick={() => removeLayer(i)}>Remove</button>}
            </div>
            <select value={l.material} onChange={(e) => setLayer(i, { material: e.target.value as MaterialId })} aria-label={`${layerName(i, n)} material`}>
              {mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="hint">{MATERIALS[l.material].note} · {MATERIALS[l.material].shoreD} Shore D</div>
            {i === 0 ? (
              <div className="hint">Diameter {p.coreDiameter.toFixed(3)} in (fills the space inside the other layers) · filler density {p.coreDensity.toFixed(2)} g/cm³</div>
            ) : (
              <Slider
                label="Thickness"
                value={l.thickness}
                min={i === n - 1 ? 0.015 : 0.02}
                max={i === n - 1 ? 0.09 : 0.2}
                step={0.001}
                decimals={3}
                unit="in"
                display={`${(l.thickness * 25.4).toFixed(2)} mm`}
                onChange={(v) => setLayer(i, { thickness: v })}
              />
            )}
          </div>
        );
      })}
      {n < 5 && <button type="button" className="btn" onClick={addMantle}>Add mantle layer ({n}-piece → {n + 1}-piece)</button>}
      <Slider
        label="Ball weight"
        value={value.weight}
        min={42}
        max={48}
        step={0.01}
        decimals={2}
        unit="g"
        onChange={(v) => onChange({ ...value, weight: v })}
        hint={value.weight > 45.93 ? 'Over the 45.93 g USGA limit — non-conforming.' : 'Core filler is tuned to hit this weight (USGA max 45.93 g).'}
      />
      {p.problem && <div className="hint warn-text">{p.problem}</div>}
    </Section>
  );
}
