import {createLiveInboxPolicy} from '../../src/interactionInbox/livePolicy';
import {createInstagramManagementReceptionStore} from '../../src/instagramManagement/receptionStore';
import type {MetaInboxFixture} from './metaInboxFixture';
export const syntheticInstagramEvent=(patch:Record<string,unknown>={})=>({accountId:'100',field:'messages',eventId:'mid-1',senderId:'300',recipientId:'100',timestamp:Date.now(),isEcho:false,deleted:false,text:'Synthetic incoming',...patch}) as any;
export async function instagramReceptionFixture(f:MetaInboxFixture,options:{appId?:string;bothWorkspaces?:boolean;disabled?:boolean;isDeleted?:any}={}){
 await f.db.instagramManagementConnection.updateMany({where:{workspaceId:{in:f.workspaceIds}},data:{notificationsEnabled:true,subscribedFields:['comments','messages']}});
 const policy=createLiveInboxPolicy((options.disabled?[]:options.bothWorkspaces?f.workspaceIds:[f.adminCtx.workspaceId]).map(workspaceId=>({workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}})));
 return createInstagramManagementReceptionStore({db:f.db,appId:options.appId??'456',enabled:true,policy,isDeleted:options.isDeleted??(async()=>false)});
}
