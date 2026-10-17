import {z} from 'zod';
import {HttpError} from '../utils/errors';

export type MetaPlatform='facebook'|'instagram';
export type LiveAssetKey={workspaceId:string;platform:MetaPlatform;appId:string;providerAssetId:string};
export type LivePolicyEvidence={product:string;graphVersion:string;checkedAt:string;sources:string[];rawRetentionDays:number;contentRetentionDays:number;replyWindowMs:number;reviewed:boolean};
export type LiveAssetRule=LiveAssetKey&{readEnabled:boolean;sendEnabled:boolean;policy:LivePolicyEvidence};
const official=z.string().url().max(2048).refine(value=>{
 const u=new URL(value);
 return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='developers.facebook.com'||u.hostname==='www.postman.com'&&u.pathname.startsWith('/meta/'));
});
const ruleSchema=z.object({
 workspaceId:z.string().uuid(),platform:z.enum(['facebook','instagram']),appId:z.string().regex(/^\d{1,256}$/),providerAssetId:z.string().regex(/^\d{1,256}$/),
 readEnabled:z.boolean(),sendEnabled:z.boolean(),policy:z.object({product:z.string().trim().min(1).max(100),graphVersion:z.string().regex(/^v[1-9]\d?\.0$/),checkedAt:z.string().datetime({offset:true}),sources:z.array(official).min(1).max(10),rawRetentionDays:z.number().int().min(1).max(7),contentRetentionDays:z.number().int().min(1).max(90),replyWindowMs:z.number().int().positive().safe(),reviewed:z.boolean()}).strict()
}).strict();
function parseRules(value:unknown):LiveAssetRule[]{
 try{
  const rules=z.array(ruleSchema).max(50).parse(value),seen=new Set<string>();
  for(const rule of rules){const key=assetKey(rule);if(seen.has(key))throw Error();seen.add(key);}
  return rules;
 }catch{throw new Error('Invalid live inbox configuration');}
}
function assetKey(key:LiveAssetKey){return JSON.stringify([key.workspaceId,key.platform,key.appId,key.providerAssetId]);}
export function parseLiveAssetRules(value:string|undefined):LiveAssetRule[]{
 if(value===undefined||value==='')return[];
 try{if(value.length>100000)throw Error();return parseRules(JSON.parse(value));}catch{throw new Error('Invalid live inbox configuration');}
}
export function createLiveInboxPolicy(input:LiveAssetRule[],now:()=>Date=()=>new Date()){
 const rules=new Map(parseRules(input).map(rule=>[assetKey(rule),rule]));
 return{requireAsset(key:LiveAssetKey,mode:'read'|'send'):LivePolicyEvidence{
  const rule=rules.get(assetKey(key));
  if(!rule||!rule.readEnabled||mode==='send'&&!rule.sendEnabled||!rule.policy.reviewed||Date.parse(rule.policy.checkedAt)>now().getTime())throw new HttpError(409,'Interaction policy or asset access is not enabled');
  // A rule is an operational gate, not a substitute for the recorded official policy review.
  return structuredClone(rule.policy);
 }};
}
export type LiveInboxPolicy=ReturnType<typeof createLiveInboxPolicy>;
