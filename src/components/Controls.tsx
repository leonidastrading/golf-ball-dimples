import type { ReactNode } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  hint?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  display?: string;
}

export function Slider({ label, value, min, max, step, unit, decimals = 0, hint, onChange, disabled, display }: SliderProps) {
  const id = `s-${label.replace(/\W+/g, '-')}`;
  return (
    <div className={`field ${disabled ? 'disabled' : ''}`}>
      <div className="field-row">
        <label htmlFor={id}>{label}</label>
        <span className="field-val">
          <input
            type="number"
            value={Number(value.toFixed(decimals))}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            aria-label={`${label} value`}
          />
          {unit && <span className="unit">{unit}</span>}
          {display && <span className="unit">{display}</span>}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

interface SegProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  hint?: string;
}

export function Segmented<T extends string>({ label, value, options, onChange, hint }: SegProps<T>) {
  return (
    <div className="field">
      <div className="field-row"><span className="label">{label}</span></div>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : ''}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="field">
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
