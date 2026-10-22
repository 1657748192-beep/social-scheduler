import test from 'node:test';
import assert from 'node:assert/strict';
import {facebookManagementSendNotice} from '../lib/facebookManagement';

test('legacy management notice distinguishes a reused historical receipt from a fresh send in both languages',()=>{
 const prior={status:'sent',providerId:'old-receipt',replayed:true} as any;
 assert.equal(facebookManagementSendNotice(prior,false),'此前已发送，本次未重发。');
 assert.equal(facebookManagementSendNotice(prior,true),'Previously sent. Nothing was resent this time.');
 assert.equal(facebookManagementSendNotice({status:'sent',providerId:'new-receipt'},true),'Reply sent.');
});
