import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig, simulate, rangeStats, applyIntervention, waveformCSV, validateConfig } from '../src/core.js';
import { envelopeIndices } from '../src/chart.js';
const cases = Object.fromEntries(['healthy','input','load','capacitor'].map(k=>[k,simulate(createConfig(k))]));

test('healthy supply regulates to 5 V before and after a known load pulse',()=>{
  const r=cases.healthy;
  assert.ok(Math.abs(r.metrics.steadyMean-5)<.001);
  assert.ok(r.metrics.minimum>4.75&&r.metrics.minimum<4.95);
  assert.ok(r.metrics.overshoot<.25);
  assert.ok(r.metrics.recovery>0&&r.metrics.recovery<.004);
  assert.equal(r.metrics.loadPeak,1.5);
  assert.equal(r.metrics.inputMinimum,12);
});

test('steady inductor ripple agrees with volt-second balance, including winding loss',()=>{
  const r=cases.healthy, c=r.config;
  const current=rangeStats(r.trace,'il',.0015,.0019), duty=rangeStats(r.cycles,'duty',.0015,.0019).mean;
  const expected=(c.vin-c.target-c.dcr*c.baseLoad)*duty/(c.inductance*c.frequency);
  const measured=current.max-current.min;
  assert.ok(Math.abs(measured/expected-1)<.02,`${measured} vs ${expected}`);
  const rippleUpperBound=measured*(c.esr+1/(8*c.frequency*c.capacitance));
  assert.ok(r.metrics.ripple<=rippleUpperBound*1.05);
  assert.ok(r.metrics.ripple>=measured*c.esr*.95);
});

test('capacitor voltage and inductor current remain continuous at a load edge',()=>{
  for(const r of Object.values(cases)){
    const a=r.trace, i=a.iout.findIndex((v,j)=>j>0&&v!==a.iout[j-1]);
    assert.ok(i>0);
    const deltaLoad=a.iout[i]-a.iout[i-1];
    assert.ok(Math.abs(a.il[i]-a.il[i-1])<1e-8);
    assert.ok(Math.abs((a.vout[i]-a.vout[i-1])+r.config.esr*deltaLoad)<1e-8);
  }
});

test('input energy closes against load, conduction loss and stored energy',()=>{
  for(const r of Object.values(cases)){
    const a=r.trace,c=r.config;
    const vc=i=>a.vout[i]-c.esr*(a.il[i]-a.iout[i]);
    const stored=i=>.5*c.inductance*a.il[i]**2+.5*c.capacitance*vc(i)**2;
    const net=i=>a.sw[i]*a.il[i]-a.vout[i]*a.iout[i]-c.dcr*a.il[i]**2-c.esr*(a.il[i]-a.iout[i])**2;
    let integral=0;for(let i=1;i<a.t.length;i++)integral+=(net(i)+net(i-1))/2*(a.t[i]-a.t[i-1]);
    const residual=Math.abs(integral-(stored(a.t.length-1)-stored(0)));
    assert.ok(residual<2e-6,`Energy residual ${residual} J`);
  }
});

test('each fault has a distinct cross-measurement signature',()=>{
  assert.equal(cases.input.metrics.inputMinimum,9);
  assert.equal(cases.input.metrics.loadPeak,1.5);
  assert.equal(cases.load.metrics.inputMinimum,12);
  assert.equal(cases.load.metrics.loadPeak,2);
  assert.equal(cases.capacitor.metrics.inputMinimum,12);
  assert.equal(cases.capacitor.metrics.loadPeak,1.5);
  assert.ok(cases.capacitor.metrics.ripple>cases.healthy.metrics.ripple*3);
  assert.ok(Math.abs(cases.load.metrics.minimum-cases.capacitor.metrics.minimum)<.1);
});

test('halving the integration step changes minimum output by less than 1 mV',()=>{
  for(const [kind,r] of Object.entries(cases)){
    const fine=simulate({...createConfig(kind),subdivisions:100});
    assert.ok(Math.abs(r.metrics.minimum-fine.metrics.minimum)<.001);
    assert.ok(Math.abs(r.metrics.ripple-fine.metrics.ripple)<.0002);
  }
});

test('a targeted repair returns every fault to the same baseline',()=>{
  const reference=cases.healthy.metrics;
  for(const kind of ['input','load','capacitor']){
    const repaired=simulate(applyIntervention(createConfig(kind),kind));
    assert.equal(repaired.metrics.minimum,reference.minimum);
    assert.equal(repaired.metrics.ripple,reference.ripple);
    for(const wrong of ['input','load','capacitor'].filter(x=>x!==kind)){
      const stillFaulty=simulate(applyIntervention(createConfig(kind),wrong));
      assert.equal(stillFaulty.metrics.minimum,cases[kind].metrics.minimum);
    }
  }
});

test('supported parameter boundaries remain finite and recover',()=>{
  const configs=[{...createConfig('input'),sagVoltage:8},{...createConfig('input'),sagVoltage:12},
    {...createConfig('load'),pulseLoad:1.5},{...createConfig('load'),pulseLoad:3}];
  for(const capacitance of [100e-6,680e-6])for(const esr of [.02,.25])configs.push({...createConfig('capacitor'),capacitance,esr});
  for(const config of configs){const r=simulate(config);assert.ok(r.trace.vout.every(Number.isFinite));assert.ok(Math.abs(r.metrics.steadyMean-5)<.005);assert.ok(r.cycles.duty.every(d=>d>=.02&&d<=.95));}
});

test('unexcited initialization does not silently apply the selected fault',()=>{
  const r=simulate({...createConfig('load'),excitation:false});
  assert.equal(r.metrics.loadPeak,1);assert.ok(Math.abs(r.metrics.minimum-5)<.015);
});

test('waveform CSV preserves all samples, units, and switch-edge timestamps',()=>{
  const r=cases.capacitor,rows=waveformCSV(r).split('\n');
  assert.equal(rows.length,r.trace.t.length+1);
  assert.equal(rows[0],'time_s,vout_V,vin_V,inductor_A,load_A,switch_V,duty_ratio');
  assert.ok(r.trace.t.some((v,i)=>i>0&&v===r.trace.t[i-1]));
});

test('display decimation preserves extrema instead of hiding switching ripple',()=>{
  const r=cases.capacitor,indices=envelopeIndices(r.trace,'vout',0,.012,300);
  const actual=rangeStats(r.trace,'vout',0,.012);
  assert.equal(Math.min(...indices.map(i=>r.trace.vout[i])),actual.min);
  assert.equal(Math.max(...indices.map(i=>r.trace.vout[i])),actual.max);
});

test('invalid and unsupported inputs fail explicitly',()=>{
  for(const value of [NaN,Infinity,-1])assert.throws(()=>validateConfig({capacitance:value}));
  assert.throws(()=>validateConfig({sagVoltage:7}));assert.throws(()=>validateConfig({frequency:200000}));
  assert.throws(()=>createConfig('unknown'));
});
