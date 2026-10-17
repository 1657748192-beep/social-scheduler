import {createInboxAccess} from '../../src/interactionInbox/access';
import type {InboxFixture} from './interactionInboxFixture';
export function inboxTestAccess(f:InboxFixture){return createInboxAccess({db:f.db,facebookEnabled:true,verifyFacebook:async()=>({readComments:{status:'available'},readMessages:{status:'available'},replyComments:{status:'available'},replyMessages:{status:'available'}})});}
