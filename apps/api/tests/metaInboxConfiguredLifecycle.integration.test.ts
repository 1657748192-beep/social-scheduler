import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createConfiguredInstagramManagementRuntime} from '../src/instagramManagement/defaultRuntime';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';

test('configuredIndependentRuntimeActuallyAdmitsDisconnectCleanup',async()=>withMetaInboxFixture(async f=>{
 const env={INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-configured-secret',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',API_PUBLIC_URL:'https://example.test',INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_manage_messages'};
 const runtime=createConfiguredInstagramManagementRuntime({db:f.db,env,encrypt:encryptToken,decrypt:decryptToken}),before=await f.publishingSnapshot();
 assert.equal(runtime.receptionEnabled,false);await runtime.disconnect(f.adminCtx,f.instagramConnectionIds[0]);assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('configuredRuntimeDoesNotEnableReceptionFromMissingOrMalformedFlags',async()=>withMetaInboxFixture(async f=>{
 const input={db:f.db,encrypt:encryptToken,decrypt:decryptToken};assert.equal(createConfiguredInstagramManagementRuntime({...input,env:{}}).receptionEnabled,false);
 assert.throws(()=>createConfiguredInstagramManagementRuntime({...input,env:{INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED:'yes'}}));assert.throws(()=>createConfiguredInstagramManagementRuntime({...input,env:{INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED:'true'}}));
}));
