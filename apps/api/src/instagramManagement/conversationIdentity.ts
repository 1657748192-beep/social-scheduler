import {createHash} from 'node:crypto';
/** One verified one-to-one participant within an immutable independent grant. */
export function instagramConversationIdentity(connectionId:string,version:number,actorId:string){
 return 'local:'+createHash('sha256').update(JSON.stringify([connectionId,version,actorId])).digest('hex');
}
