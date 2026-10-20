import type Redis from 'ioredis';
import {randomBytes} from 'node:crypto';
import {HttpError} from '../utils/errors';
import {digestSecret} from './repository';
const prefix='facebook-page-import:v1:',random=()=>randomBytes(32).toString('base64url');
const valid=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
export type InvitationFlow={invitationId:string;version:number;state:string;cookieHash:string;startedAt:number;expiresAt:number};
export const invitationFlowCookie={name:'__Secure-fbpi-flow',path:'/api/v1/',maxAge:600};
export function createInvitationFlows(redis:Redis){
 const unavailable=()=>new HttpError(409,'Authorization flow unavailable');
 const stateKey=(state:string)=>prefix+'state:'+state,inviteKey=(id:string)=>prefix+'invite:'+id,cookieKey=(hash:string)=>prefix+'cookie:'+hash;
 return{
  async begin(input:{invitationId:string;version:number},cookie?:string,at=new Date()){
   if(cookie&&(!valid(cookie)||await redis.exists(cookieKey(digestSecret(cookie)))))throw unavailable();
   const value=random(),flow:InvitationFlow={...input,state:'fbpi_'+random(),cookieHash:digestSecret(value),startedAt:at.getTime(),expiresAt:at.getTime()+600000};
   const ok=await redis.eval("if redis.call('EXISTS',KEYS[1])==1 then return 0 end;redis.call('SET',KEYS[1],ARGV[1],'EX',600);redis.call('SET',KEYS[2],ARGV[2],'EX',600);redis.call('SET',KEYS[3],ARGV[1],'EX',600);return 1",3,inviteKey(input.invitationId),stateKey(flow.state),cookieKey(flow.cookieHash),flow.state,JSON.stringify(flow));
   if(Number(ok)!==1)throw unavailable();return{...flow,cookie:{...invitationFlowCookie,value}};
  },
  async consume(state:string,cookie?:string,at=new Date()):Promise<InvitationFlow>{
   if(!/^fbpi_[A-Za-z0-9_-]{43}$/.test(state)||!valid(cookie))throw unavailable();
   const raw=await redis.eval("local v=redis.call('GET',KEYS[1]);if not v then return '' end;local f=cjson.decode(v);if f.cookieHash~=ARGV[1] or f.expiresAt<=tonumber(ARGV[2]) or f.consumed then return '' end;f.consumed=true;redis.call('SET',KEYS[1],cjson.encode(f),'KEEPTTL');return v",1,stateKey(state),digestSecret(cookie),at.getTime());
   if(typeof raw!=='string'||!raw)throw unavailable();return JSON.parse(raw);
  },
  async active(flow:InvitationFlow){return flow.expiresAt>Date.now()&&await redis.get(inviteKey(flow.invitationId))===flow.state;},
  async release(flow:InvitationFlow){await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) end;redis.call('DEL',KEYS[2],KEYS[3]);return 1",3,inviteKey(flow.invitationId),stateKey(flow.state),cookieKey(flow.cookieHash),flow.state);},
  async rateLimit(key:string,limit:number){const count=Number(await redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],600) end;return n",1,prefix+'limit:'+digestSecret(key)));if(count>limit)throw new HttpError(429,'Too many authorization attempts');}
 };
}
