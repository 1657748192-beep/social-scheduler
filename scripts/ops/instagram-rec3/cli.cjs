'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function privateRead(file){const p=path.resolve(file),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||process.platform!=='win32'&&(s.mode&0o077)||s.size>1048576)throw Error('Private input required');return JSON.parse(fs.readFileSync(p,'utf8'));}
async function main(mode,args=process.argv.slice(2)){
 const options={};for(let i=0;i<args.length;i++){const name=args[i];if(['--allow-provider-read','--apply'].includes(name))options[name]=true;else if(['--input','--output','--evidence'].includes(name)&&args[i+1]&&!args[i+1].startsWith('--'))options[name]=args[++i];else throw Error('Invalid operation arguments');}
 if(mode==='read'&&options['--allow-provider-read']!==true||mode==='prepare'&&options['--apply']!==true||mode==='verify'&&!options['--input']){console.log(JSON.stringify({dryRun:true,requests:0,writes:0}));return;}
 if(!options['--input']||mode==='read'&&!options['--output']||mode==='prepare'&&!options['--evidence'])throw Error('Private operation inputs required');
 const root=path.resolve(__dirname,'../../..'),dist=path.resolve(process.env.SOCIAL_SCHEDULER_API_DIST||path.join(root,'apps/api/dist'));
 const plan=privateRead(options['--input']),{prisma:db}=require(path.join(dist,'prisma'));
 try{
  assert.notEqual(process.env.INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED,'true');
  const {parseInstagramReplyRecording}=require(path.join(dist,'instagramManagement/replyRecording')),{getInstagramManagementConfig}=require(path.join(dist,'instagramManagement/config'));
  const existing=parseInstagramReplyRecording(process.env.INSTAGRAM_MANAGEMENT_REPLY_TEST_JSON),rule=parseInstagramReplyRecording(JSON.stringify(plan.rule));assert.ok(existing&&rule?.messageRec3);
  const omit=v=>{const x={...v};delete x.messageRec3;return x;};assert.deepEqual(omit(existing),omit(rule));if(existing.messageRec3)assert.deepEqual(existing.messageRec3,rule.messageRec3);
  const config=getInstagramManagementConfig(process.env);assert.equal(config.enabled,true);assert.equal(config.appId,rule.appId);
  const {createLiveInboxPolicy,parseLiveAssetRules}=require(path.join(dist,'interactionInbox/livePolicy')),{decryptToken,encryptToken}=require(path.join(dist,'utils/tokenCrypto')),{createMetaInboxDeletion}=require(path.join(dist,'interactionInbox/deletion')),{createInstagramRec3Ops}=require(path.join(dist,'instagramManagement/recordingGrantOps'));
  const deletion=createMetaInboxDeletion({db,encrypt:encryptToken,decrypt:decryptToken});
  const ops=createInstagramRec3Ops({db,ctx:plan.ctx,rule,policy:createLiveInboxPolicy(parseLiveAssetRules(process.env.META_INBOX_LIVE_ASSETS_JSON)),graphVersion:config.graphVersion,decrypt:decryptToken,evidenceKey:process.env.TOKEN_ENCRYPTION_KEY??'',isDeleted:deletion.isDeleted});
  if(mode==='read'){
   const result=await ops.read({allowProviderRead:true}),dest=path.resolve(options['--output']);assert.ok(!fs.existsSync(dest));fs.writeFileSync(dest,JSON.stringify(result),{flag:'wx',mode:0o600});console.log(JSON.stringify({complete:result.complete,privateEvidenceSaved:true,requestsBound:10,sends:0}));
  }else if(mode==='prepare')console.log(JSON.stringify(await ops.prepare({apply:true,evidence:privateRead(options['--evidence'])})));
  else console.log(JSON.stringify(await ops.verify()));
 }finally{await db.$disconnect();}
}
module.exports={main};
