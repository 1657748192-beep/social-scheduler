// Development-time generation only. No downloaded executable is run.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const root=path.resolve(__dirname,'../packages/timezone-rules');
const tag='0.6.5';
const source=`https://raw.githubusercontent.com/moment/moment-timezone/${tag}/data/packed/latest.json`;
async function main(){
 if(require('moment-timezone/package.json').version!==tag)throw Error('Pinned package changed');
 // npm integrity pins the same publisher data. Local generation/check does not require network availability.
 const bytes=fs.readFileSync(require.resolve('moment-timezone/data/packed/latest.json'));if(bytes.length>4*1024*1024)throw Error('Rules too large');
 const data=JSON.parse(bytes.toString('utf8'));if(data.version!=='2026e')throw Error('Pinned data changed');
 const bundle={schemaVersion:1,engineCompatibility:1,tzdbVersion:data.version,source,generatedAt:'2026-10-20T00:00:00.000Z',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceBytes:bytes.toString('base64'),data};
 const outputs={'baseline.json':JSON.stringify(bundle)+'\n','sources.json':JSON.stringify({source,tzdbVersion:data.version,sha256:bundle.sha256,momentTimezone:tag,moment:'2.31.0'},null,2)+'\n'};
 for(const [name,value]of Object.entries(outputs)){
  const dest=path.join(root,name);
  if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8')!==value)throw Error(`Generated mismatch: ${name}`);}
  else fs.writeFileSync(dest,value);
 }
 const licenses=['moment/LICENSE','moment-timezone/LICENSE','js-sha256/LICENSE.txt'].map(name=>`${name}\n${fs.readFileSync(name.startsWith('js-sha256/')?path.resolve(path.dirname(require.resolve('js-sha256')),'../LICENSE.txt'):require.resolve(name),'utf8')}`).join('\n\n');
 const notice='IANA tz database: public domain (https://data.iana.org/time-zones/tzdb/LICENSE).\n\n'+licenses+'\n';
 if(process.argv.includes('--check')){if(fs.readFileSync(path.join(root,'LICENSES.txt'),'utf8')!==notice)throw Error('License mismatch');}
 else fs.writeFileSync(path.join(root,'LICENSES.txt'),notice);
 console.log(`Rules ${data.version}: ${data.zones.length} zones, ${data.links.length} links; envelope ${Buffer.byteLength(outputs['baseline.json'])} bytes, gzip ${zlib.gzipSync(outputs['baseline.json']).length} bytes; SHA256 ${bundle.sha256}`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
