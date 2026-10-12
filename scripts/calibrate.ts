import { buildAero, CAL, baselineFeatures } from '../src/model/aero';
import { buildLayout, features } from '../src/model/layout';
import { simulate, air } from '../src/model/flight';
import { DESIGN_PRESETS, PATENT_PRESETS, DEFAULT_LAUNCH, LAUNCH_PRESETS, PROV1 } from '../src/model/types';

const args = process.argv.slice(2);
if (args[0]) CAL.CD0 = +args[0];
if (args[1]) CAL.CL_A = +args[1];
const t0 = Date.now();
console.log('baseline features', baselineFeatures(), Date.now() - t0, 'ms');
const a = air(DEFAULT_LAUNCH);
console.log('air', a);
for (const lp of LAUNCH_PRESETS) {
  const L = { ...DEFAULT_LAUNCH, ...lp.params };
  const f = features(PROV1, buildLayout(PROV1));
  const r = simulate(buildAero(PROV1, f), L);
  console.log(lp.name.padEnd(24), `carry ${r.carry.toFixed(1)} total ${r.total.toFixed(1)} apex ${r.apex.toFixed(1)} hang ${r.hang.toFixed(2)} desc ${r.descent.toFixed(1)} Cd ${r.launchCd.toFixed(3)} Cl ${r.launchCl.toFixed(3)} Re ${r.maxRe.toFixed(0)}`);
}
for (const p of [...DESIGN_PRESETS, ...PATENT_PRESETS]) {
  const t1 = Date.now();
  const L = buildLayout(p.params);
  const f = features(p.params, L);
  const mA = buildAero(p.params, f, 'A'), mB = buildAero(p.params, f, 'B');
  const r = simulate(mA, DEFAULT_LAUNCH);
  const rB = simulate(mB, DEFAULT_LAUNCH);
  const sl = simulate(mA, { ...DEFAULT_LAUNCH, spinAxis: 10 });
  console.log(('name' in p ? p.name : p.number).padEnd(30), `n=${f.count}+${f.microCount} cov ${(f.coverage*100).toFixed(1)} VR ${(f.volumeRatio*100).toFixed(2)} edge ${f.edgeAngle.toFixed(1)} aniso ${f.anisotropy.toFixed(3)} ReC ${mA.reCrit.toFixed(0)} | carry ${r.carry.toFixed(1)} apex ${r.apex.toFixed(1)} sym dY ${(r.carry-rB.carry).toFixed(2)} slice ${sl.carryLateral.toFixed(1)}  ${Date.now()-t1}ms`);
}
