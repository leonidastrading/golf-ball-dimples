import { useEffect, useRef, useState } from 'react';
import type { Candidate, OptimizeMessage, OptimizeRequest } from '../model/optimizer';
import type { DesignParams, LaunchParams } from '../model/types';
import { Section, Segmented, Toggle } from './Controls';

interface Props {
  design: DesignParams;
  launch: LaunchParams;
  onApply: (best: DesignParams) => void;
}

const SHAPE_LABEL: Record<DesignParams['shape'], string> = {
  spherical: 'spherical', flat: 'steep-wall', conical: 'conical', dual: 'dual', raised: 'raised-center', hex: 'hexagonal',
};

export function Optimizer({ design, launch, onApply }: Props) {
  const [objective, setObjective] = useState<'total' | 'carry'>('total');
  const [ods, setOds] = useState(false);
  const [keepShape, setKeepShape] = useState(false);
  const [depthMode, setDepthMode] = useState<'quick' | 'thorough'>('quick');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [best, setBest] = useState<Candidate | null>(null);
  const [baseline, setBaseline] = useState<Candidate | null>(null);
  const [none, setNone] = useState(false);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const run = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('../model/optimizer.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setRunning(true); setProgress(0); setBest(null); setBaseline(null); setNone(false);
    w.onmessage = (e: MessageEvent<OptimizeMessage>) => {
      const m = e.data;
      if (m.type === 'progress') {
        setProgress(m.done / m.budget);
        if (m.best) setBest(m.best);
      } else {
        setRunning(false);
        setProgress(1);
        setBest(m.best);
        setBaseline(m.baseline);
        setNone(!m.best);
        w.terminate();
        worker.current = null;
      }
    };
    const req: OptimizeRequest = {
      start: design, launch, objective, odsLimit: ods, shape: keepShape ? design.shape : null,
      budget: depthMode === 'quick' ? 160 : 420,
    };
    w.postMessage(req);
  };

  const stop = () => { worker.current?.terminate(); worker.current = null; setRunning(false); };

  const unit = objective === 'carry' ? 'carry' : 'total';
  const gain = best && baseline ? (objective === 'carry' ? best.carry - baseline.carry : best.total - baseline.total) : 0;

  return (
    <Section title="Optimizer">
      <div className="hint">Searches dimple count, pattern, shape, diameter, depth, size variation, wall shape, micro-dimples, paint and layer construction for the longest ball at the current launch and conditions. Only USGA-symmetric designs are considered.</div>
      <Segmented label="Maximize" value={objective} options={[{ value: 'total', label: 'Total distance' }, { value: 'carry', label: 'Carry' }]} onChange={setObjective} />
      <Segmented label="Search" value={depthMode} options={[{ value: 'quick', label: 'Quick (~160 designs)' }, { value: 'thorough', label: 'Thorough (~420)' }]} onChange={setDepthMode} />
      <Toggle label={`Keep current shape (${SHAPE_LABEL[design.shape]})`} checked={keepShape} onChange={setKeepShape} />
      <Toggle label="Stay under the ODS 2028 limit (317 yd)" checked={ods} onChange={setOds} hint="In this model even the Pro V1 projects over 317 yd at the 2028 test conditions, so this trades away distance." />
      {running ? (
        <button type="button" className="btn primary" onClick={stop}>Stop ({Math.round(progress * 100)}%)</button>
      ) : (
        <button type="button" className="btn primary" onClick={run}>Find the longest ball</button>
      )}
      {(running || progress > 0) && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {none && <div className="hint">No design met the constraints. Try turning off the ODS limit.</div>}
      {best && (
        <div className="opt-result">
          <div className="opt-head">{running ? 'Best so far' : 'Best design found'}</div>
          <div className="opt-num">{(objective === 'carry' ? best.carry : best.total).toFixed(1)} <span>yd {unit}</span></div>
          {baseline && <div className="opt-gain">{gain >= 0 ? '+' : '−'}{Math.abs(gain).toFixed(1)} yd vs your current design</div>}
          <ul>
            <li>{best.params.count} {SHAPE_LABEL[best.params.shape]} dimples, {best.params.pattern === 'fibonacci' ? 'spiral' : best.params.pattern} layout</li>
            <li>{best.params.diameter.toFixed(3)} in diameter · {best.params.depth.toFixed(4)} in deep</li>
            <li>{best.params.construction.layers.length}-piece construction</li>
            <li>Size variation {Math.round(best.params.sizeVariation * 100)}%{best.params.microDimples ? ` · micro-dimples ${Math.round(best.params.microSize * 100)}%` : ''} · {best.params.paintProcess}</li>
            <li>Carry {best.carry.toFixed(1)} · total {best.total.toFixed(1)} · apex {best.apex.toFixed(1)} yd · ODS 2028 {best.ods.toFixed(0)} yd</li>
          </ul>
          {!running && <button type="button" className="btn primary" onClick={() => onApply(best.params)}>Apply (pins current design for comparison)</button>}
        </div>
      )}
    </Section>
  );
}
