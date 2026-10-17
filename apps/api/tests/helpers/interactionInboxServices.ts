import {createInboxAccess} from '../../src/interactionInbox/access';
import type {InboxFixture} from './interactionInboxFixture';
import {createLiveInboxPolicy} from '../../src/interactionInbox/livePolicy';
export function inboxTestPolicy(f:InboxFixture){return createLiveInboxPolicy(f.workspaceIds.map((workspaceId,index)=>({workspaceId,platform:'facebook',appId:f.connections[index].appId,providerAssetId:f.pages[index].pageId,readEnabled:true,sendEnabled:true,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}})));}
export function inboxTestAccess(f:InboxFixture){return createInboxAccess({db:f.db,facebookEnabled:true,policy:inboxTestPolicy(f),verifyFacebook:async()=>({readComments:{status:'available'},readMessages:{status:'available'},replyComments:{status:'available'},replyMessages:{status:'available'}})});}
