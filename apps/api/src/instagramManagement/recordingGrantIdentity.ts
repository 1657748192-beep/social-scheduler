import {createHash} from 'node:crypto';
export type Rec3IncomingIdentity={workspaceId:string;appId:string;providerAccountId:string;providerEventId:string};
export const REC3_MAX_AGE_MS=86400000;
export const REC3_MARKER='SS-IG-DM-1023-REC3';
export const REC3_TEXT='Social Scheduler Instagram messaging reply test REC3. This reply is for app review demonstration only.';
export function instagramRecordingIncomingKey(value:Rec3IncomingIdentity){
 if(!/^[a-f0-9-]{36}$/i.test(value.workspaceId)||!/^\d{1,256}$/.test(value.appId)||!/^\d{1,256}$/.test(value.providerAccountId)||!/^[-a-zA-Z0-9_:.]{1,256}$/.test(value.providerEventId))throw Error('Invalid Instagram recording identity');
 return createHash('sha256').update(JSON.stringify(['ig-recording-message-grant-v1',value.workspaceId,value.appId,value.providerAccountId,value.providerEventId])).digest('hex');
}
