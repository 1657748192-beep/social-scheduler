import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {getBaseline,createRuleSnapshot,validateBundle,baselineBundle} from '@social-scheduler/timezone-rules';

test('built-in policy data resolves the five stale-browser regions independently of Intl',()=>{
  const original=Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat=function(){throw Error('old browser');} as unknown as typeof Intl.DateTimeFormat;
    for(const [zone,instant] of [
      ['America/Winnipeg','2026-11-06T01:00:00.000Z'],
      ['America/Edmonton','2026-11-06T02:00:00.000Z'],
      ['America/Inuvik','2026-11-06T02:00:00.000Z'],
      ['Africa/Casablanca','2026-11-05T20:00:00.000Z'],
      ['Africa/El_Aaiun','2026-11-05T20:00:00.000Z'],
    ]) assert.deepEqual(getBaseline().resolve(zone,'2026-11-05T20:00'),{kind:'resolved',candidate:{instant,offsetMinutes:zone.startsWith('Africa')?0:zone==='America/Winnipeg'?-300:-360}});
  } finally {Intl.DateTimeFormat=original;}
});
test('strict solver exposes duplicate times and never normalizes nonexistent calendar times',()=>{
 const rules=getBaseline();
 assert.deepEqual(rules.resolve('America/New_York','2026-11-01T01:30'),{kind:'ambiguous',candidates:[{instant:'2026-11-01T05:30:00.000Z',offsetMinutes:-240},{instant:'2026-11-01T06:30:00.000Z',offsetMinutes:-300}]});
 for(const [zone,local] of [['America/New_York','2026-03-08T02:30'],['Australia/Lord_Howe','2026-10-04T02:15'],['Pacific/Apia','2011-12-30T12:00']])assert.deepEqual(rules.resolve(zone,local),{kind:'invalid',reason:'gap'});
 assert.deepEqual(rules.resolve('Asia/Kathmandu','2026-10-20T20:00'),{kind:'resolved',candidate:{instant:'2026-10-20T14:15:00.000Z',offsetMinutes:345}});
 for(const local of ['2026-02-30T12:00','2026-01-01T24:00','1899-12-31T12:00','2500-01-01T00:00'])assert.equal(rules.resolve('Asia/Shanghai',local).kind,'invalid');
});
function changedBundle(edit:(data:any)=>void){
 const bundle=structuredClone(baselineBundle);edit(bundle.data);
 const bytes=Buffer.from(JSON.stringify(bundle.data));bundle.sourceBytes=bytes.toString('base64');bundle.sha256=createHash('sha256').update(bytes).digest('hex');return bundle;
}
test('bad digests, oversized envelopes and cyclic or missing aliases fail validation',()=>{
 assert.throws(()=>validateBundle({...baselineBundle,sha256:'0'.repeat(64)}));
 assert.throws(()=>validateBundle({...baselineBundle,sourceBytes:'A'.repeat(5*1024*1024)}));
 assert.throws(()=>validateBundle(changedBundle(data=>data.links.push('Fake/A|Fake/B','Fake/B|Fake/A'))));
 assert.throws(()=>validateBundle(changedBundle(data=>data.links.push('Missing/Zone|Fake/A'))));
 assert.throws(()=>validateBundle(changedBundle(data=>data.zones[0]='Fake/Zone|BAD')));
});
test('independent snapshots cannot mutate each other and aliases resolve to controlled identities',()=>{
 const before=getBaseline();
 const bundle=changedBundle(data=>data.zones.push('Test/Fixed|FIX|-20|0||'));
 const after=createRuleSnapshot(bundle);
 assert.equal(before.canonicalZone('Test/Fixed'),null);
 assert.equal(after.offsetAt('Test/Fixed',Date.parse('2026-01-01T00:00Z')),120);
 assert.equal(before.offsetAt('Asia/Shanghai',Date.parse('2026-01-01T00:00Z')),480);
 assert.equal(before.canonicalZone('CST'),null);
 assert.ok(before.canonicalZone('Asia/Katmandu'));
 assert.ok(Object.isFrozen(before));
});
