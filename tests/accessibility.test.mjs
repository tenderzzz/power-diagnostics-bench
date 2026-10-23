import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const css=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const token=name=>css.match(new RegExp('--'+name+':(#[a-f0-9]{6})','i'))[1];
function luminance(hex){
  const c=hex.slice(1).match(/../g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('primary, secondary and action text meet normal-text contrast on both surfaces',()=>{
  for(const foreground of ['ink','muted','deep-teal'])for(const background of ['paper','panel']){
    const ratio=contrast(token(foreground),token(background));
    assert.ok(ratio>=4.5,`${foreground} on ${background}: ${ratio}`);
  }
});
