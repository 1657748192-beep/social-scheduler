'use strict';
const tz=require('moment-timezone/moment-timezone').tz;
const {sha256}=require('js-sha256');
const MAX=4*1024*1024;
const MIN=Date.UTC(1900,0,1),MAX_TIME=Date.UTC(2500,0,1);
class InvalidRulesError extends Error{constructor(){super('Invalid timezone rule data');this.name='InvalidRulesError';}}
function fail(){throw new InvalidRulesError();}
function compareVersions(a,b){
 const parse=x=>{const m=/^(\d{4})([a-z]{1,2})$/.exec(x);if(!m)fail();return [+m[1],[...m[2]].reduce((n,c)=>n*26+c.charCodeAt(0)-96,0)];};
 const x=parse(a),y=parse(b);return Math.sign(x[0]-y[0]||x[1]-y[1]);
}
function decode(s){
 if(typeof s!=='string'||s.length>MAX||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))fail();
 const binary=typeof atob==='function'?atob(s):Buffer.from(s,'base64').toString('binary');
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function indexData(data){
 const zones=new Map(),aliases=new Map();
 if(!Array.isArray(data.zones)||!Array.isArray(data.links)||!data.zones.length||data.zones.length>1000||data.links.length>2000)fail();
 const idOk=x=>typeof x==='string'&&x.length<=80&&/^[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(x);
 for(const packed of data.zones){
  if(typeof packed!=='string'||packed.length>100000||packed.split('|').length!==6)fail();
  const fields=packed.split('|');
  if(!idOk(fields[0])||zones.has(fields[0])||!fields[2]||!fields[3]||!/^[0-9a-zA-Z.\s-]+$/.test(fields[2])||!/^[0-9a-zA-Z]+$/.test(fields[3])||!/^[-0-9a-zA-Z.\s]*$/.test(fields[4]))fail();
  let z;try{z=tz.unpack(packed);}catch{fail();}
  if(!z||z.untils.length!==z.offsets.length||z.abbrs.length!==z.offsets.length||z.offsets.length>5000)fail();
  if(z.offsets.some(n=>!Number.isFinite(n)||Math.abs(n)>1440))fail();
  for(let i=0;i<z.untils.length;i++)if(i===z.untils.length-1?z.untils[i]!==Infinity:!Number.isFinite(z.untils[i])||(i>0&&z.untils[i]<=z.untils[i-1]))fail();
  // An unexpanded recurring tail is not a permanent offset. Stop at its last finite transition.
  const recurring=z.offsets.length>2&&new Date(z.untils.at(-2)).getUTCFullYear()>=2400;
  zones.set(z.name,{...z,end:recurring?Math.min(MAX_TIME,z.untils.at(-2)):MAX_TIME});
 }
 for(const link of data.links){
  if(typeof link!=='string')fail();const pair=link.split('|');
  if(pair.length!==2||!pair.every(idOk)||pair[0]===pair[1]||aliases.has(pair[1])||zones.has(pair[1]))fail();
  aliases.set(pair[1],pair[0]);
 }
 for(const id of aliases.keys()){const seen=new Set();let target=id;while(aliases.has(target)){if(seen.has(target))fail();seen.add(target);target=aliases.get(target);}if(!zones.has(target))fail();}
 const names=new Map([...zones.keys(),...aliases.keys()].map(id=>[id.toLowerCase(),id]));
 return {zones,aliases,names};
}
function validateBundle(input){
 try{
  if(!input||typeof input!=='object'||new TextEncoder().encode(JSON.stringify(input)).length>MAX)fail();
  if(input.schemaVersion!==1||input.engineCompatibility!==1||typeof input.source!=='string'||input.source.length>300||!Number.isFinite(Date.parse(input.generatedAt))||!/^[a-f0-9]{64}$/.test(input.sha256))fail();
  compareVersions(input.tzdbVersion,input.tzdbVersion);
  const bytes=decode(input.sourceBytes);if(bytes.length>MAX||sha256(bytes)!==input.sha256)fail();
  const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(JSON.stringify(parsed)!==JSON.stringify(input.data)||parsed.version!==input.tzdbVersion)fail();
  indexData(parsed);
  return JSON.parse(JSON.stringify(input));
 }catch{fail();}
}
function parts(ms){const d=new Date(ms);return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes(),second:d.getUTCSeconds(),millisecond:d.getUTCMilliseconds()};}
function createRuleSnapshot(input){
 const b=validateBundle(input),{zones,aliases,names}=indexData(b.data);
 function canonicalZone(id){if(typeof id!=='string')return null;let name=names.get(id.toLowerCase());if(!name)return null;while(aliases.has(name))name=aliases.get(name);return name;}
 function offsetAt(id,ms){
  const name=canonicalZone(id),z=name&&zones.get(name);if(!z||!Number.isFinite(ms)||ms<MIN||ms>=z.end)throw Error('Unsupported timezone or date');
  let lo=0,hi=z.untils.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(ms<z.untils[mid])hi=mid;else lo=mid+1;}
  return -z.offsets[lo];
 }
 function localParts(id,ms){return parts(ms+offsetAt(id,ms)*60000);}
 function resolve(id,value){
  if(!value)return {kind:'empty'};const name=canonicalZone(id);if(!name)return {kind:'invalid',reason:'zone'};
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);if(!m)return {kind:'invalid',reason:'date'};
  const [y,mo,d,h,mi]=m.slice(1).map(Number),wall=Date.UTC(y,mo-1,d,h,mi),p=parts(wall);
  if(y<1900||y>2499||p.year!==y||p.month!==mo||p.day!==d||p.hour!==h||p.minute!==mi)return {kind:'invalid',reason:'date'};
  const candidates=[];let unsupported=false;
  for(const west of new Set(zones.get(name).offsets)){
   const ms=wall+west*60000;let offset;try{offset=offsetAt(name,ms);}catch{unsupported=true;continue;}
   if(Math.abs(offset+west)<1e-9)candidates.push({instant:new Date(ms).toISOString(),offsetMinutes:offset===0?0:offset});
  }
  candidates.sort((a,b)=>a.instant.localeCompare(b.instant));
  return candidates.length===1?{kind:'resolved',candidate:candidates[0]}:candidates.length===2?{kind:'ambiguous',candidates}:{kind:'invalid',reason:candidates.length>2||unsupported?'unsupported':'gap'};
 }
 return Object.freeze({version:b.tzdbVersion,digest:b.sha256,canonicalZone,offsetAt,localParts,resolve});
}
let baseline;
const baselineBundle=require('./baseline.json');
function getBaseline(){return baseline??=(createRuleSnapshot(baselineBundle));}
module.exports={InvalidRulesError,compareVersions,validateBundle,createRuleSnapshot,getBaseline,baselineBundle};
