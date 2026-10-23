import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { MODEL_VERSION, createConfig, simulate, applyIntervention } from '../src/core.js';
const start=performance.now();
const cases=['healthy','input','load','capacitor'].map(kind=>{
  const r=simulate(createConfig(kind)),fine=simulate({...createConfig(kind),subdivisions:100});
  const repaired=kind==='healthy'?r:simulate(applyIntervention(createConfig(kind),kind));
  return {kind,metrics:r.metrics,samples:r.trace.t.length,minimumRefinementErrorV:Math.abs(r.metrics.minimum-fine.metrics.minimum),repaired:repaired.metrics};
});
const report={modelVersion:MODEL_VERSION,generatedAt:new Date().toISOString(),runtimeMs:performance.now()-start,cases};
const dir=path.resolve(import.meta.dirname,'../evidence');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'numerical-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
