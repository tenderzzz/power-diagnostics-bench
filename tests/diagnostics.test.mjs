import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig, simulate, diagnose, observationFor } from '../src/core.js';
import { messages } from '../src/i18n.js';

test('output alone never completes a diagnosis',()=>{
  for(const kind of ['input','load','capacitor']){
    const r=simulate(createConfig(kind));
    const d=diagnose({vout:observationFor(r,'vout')});
    assert.equal(d.sufficient,false);assert.deepEqual(d.missing,['vin','iout']);
  }
});

test('both cross-checks support each included fault without access to its parameters',()=>{
  for(const kind of ['input','load','capacitor']){
    const r=simulate(createConfig(kind));
    const observations=Object.fromEntries(['vout','vin','iout'].map(p=>[p,observationFor(r,p)]));
    const d=diagnose(observations);assert.equal(d.supported,kind);assert.equal(d.sufficient,true);
  }
});

test('one suggestive measurement still requests a cross-check',()=>{
  assert.equal(diagnose({vin:{minimum:9}}).sufficient,false);
  assert.equal(diagnose({iout:{peak:2}}).sufficient,false);
  const baseline=simulate(createConfig());
  assert.equal(diagnose(Object.fromEntries(['vout','vin','iout'].map(p=>[p,observationFor(baseline,p)]))).sufficient,false);
});

function flatten(value,prefix=''){
  if(typeof value==='string')return {[prefix]:value};
  return Object.assign({},...Object.entries(value).map(([k,v])=>flatten(v,prefix+'.'+k)));
}
test('all interface copy has complete Chinese and English counterparts',()=>{
  const zh=flatten(messages.zh),en=flatten(messages.en);
  assert.deepEqual(Object.keys(zh).sort(),Object.keys(en).sort());
  for(const [key,value] of Object.entries(en)){assert.ok(value.trim(),key);assert.ok(!/[\u4e00-\u9fff]/u.test(value),key);}
});
