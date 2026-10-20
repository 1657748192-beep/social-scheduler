import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTimeZoneRules } from '../lib/timeZoneCompatibility';
const provider=(offset:number)=>(zone:string)=>zone==='America/Asuncion'?-180:zone==='Asia/Almaty'?300:zone==='America/Vancouver'?-420:offset;

test('stale Manitoba rules reject new selections instead of silently scheduling one hour late', () => {
  // External boundary: a browser may carry outdated ICU. Independent IANA 2026e expectation is -300.
  assert.equal(checkTimeZoneRules('America/Winnipeg', provider(-360)).supported, false);
  assert.equal(checkTimeZoneRules('America/Winnipeg', provider(-300)).supported, true);
  for(const id of ['Canada/Central','america/winnipeg','CANADA/CENTRAL'])assert.equal(checkTimeZoneRules(id, provider(-360)).supported, false);
});

test('unsupported Intl zones and throwing rule providers fail closed', () => {
  assert.equal(checkTimeZoneRules('Unknown/Zone').supported, false);
  assert.equal(checkTimeZoneRules('America/Winnipeg', () => { throw Error('Intl unavailable'); }).supported, false);
  assert.equal(checkTimeZoneRules('Asia/Shanghai').supported, true);
});

test('other Canadian 2026 policy changes also reject stale runtime offsets', () => {
  for(const zone of ['America/Edmonton','America/Inuvik']){
    assert.equal(checkTimeZoneRules(zone,provider(-420)).supported,false);
    assert.equal(checkTimeZoneRules(zone,provider(-360)).supported,true);
  }
  for(const zone of ['Africa/Casablanca','Africa/El_Aaiun']){
    assert.equal(checkTimeZoneRules(zone,provider(60)).supported,false);
    assert.equal(checkTimeZoneRules(zone,provider(0)).supported,true);
  }
});

test('an older browser cannot admit an Asuncion time or claim any zone meets the minimum rule baseline',()=>{
 const oldBrowser=(zone:string)=>zone==='America/Asuncion'?-240:provider(-300)(zone);
 assert.equal(checkTimeZoneRules('America/Asuncion',oldBrowser).supported,false);
 assert.equal(checkTimeZoneRules('America/New_York',oldBrowser).supported,false);
 const currentBrowser=(zone:string)=>zone==='America/Asuncion'?-180:provider(-300)(zone);
 assert.equal(checkTimeZoneRules('America/Asuncion',currentBrowser).supported,true);
});
