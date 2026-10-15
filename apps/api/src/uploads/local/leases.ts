import {randomUUID} from 'node:crypto';
import type Redis from 'ioredis';
export type UploadLease={sessionId:string;index:number;token:string;expiresAtMs:number};
export type LeaseOutcome={ok:true;lease:UploadLease}|{ok:false;reason:'part_busy'|'session_busy'|'server_busy'|'unavailable'};
export type UploadLeaseManager={acquire(sessionId:string,index:number):Promise<LeaseOutcome>;release(lease:UploadLease):Promise<void>;active(sessionId:string):Promise<boolean>};
const prune = `
local time=redis.call('TIME')
local now=time[1]*1000+math.floor(time[2]/1000)
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now)
local members=redis.call('ZRANGE',KEYS[1],0,-1)
`;
export function createUploadLeases(redis:Redis,prefix:string):UploadLeaseManager {
  const key=`${prefix}:receivers`;
  return {
    async acquire(sessionId,index) {
      const token=randomUUID();
      if(redis.status!=='ready') return {ok:false,reason:'unavailable'};
      try {
        const result=await redis.eval(`${prune}
local count=0
for _,member in ipairs(members) do
 if string.sub(member,1,#ARGV[1]+1)==ARGV[1]..':' then
  count=count+1
  if string.sub(member,1,#ARGV[2]+1)==ARGV[2]..':' then return {'part_busy'} end
 end
end
if count>=2 then return {'session_busy'} end
if #members>=8 then return {'server_busy'} end
local expires=now+420000
redis.call('ZADD',KEYS[1],expires,ARGV[3])
redis.call('PEXPIRE',KEYS[1],420000)
return {'ok',tostring(expires)}
`,1,key,sessionId,`${sessionId}:${index}`,`${sessionId}:${index}:${token}`) as string[];
        return result[0]==='ok'?{ok:true,lease:{sessionId,index,token,expiresAtMs:Number(result[1])}}:
          {ok:false,reason:result[0] as 'part_busy'|'session_busy'|'server_busy'};
      } catch {return {ok:false,reason:'unavailable'};}
    },
    async release(lease) {
      if(redis.status!=='ready') throw new Error('Upload lease store unavailable');
      // A different token has a different member, so stale releases are harmless.
      await redis.zrem(key,`${lease.sessionId}:${lease.index}:${lease.token}`);
    },
    async active(sessionId) {
      if(redis.status!=='ready') throw new Error('Upload lease store unavailable');
      return Number(await redis.eval(`${prune}
for _,member in ipairs(members) do
 if string.sub(member,1,#ARGV[1]+1)==ARGV[1]..':' then return 1 end
end
return 0`,1,key,sessionId))===1;
    }
  };
}
