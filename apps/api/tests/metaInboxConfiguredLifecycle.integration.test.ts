import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createConfiguredInstagramManagementRuntime} from '../src/instagramManagement/defaultRuntime';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
import {createMetaInboxLifecycleRuntime} from '../src/interactionInbox/lifecycleRuntime';

test('sharedAppInstructionsModeKeepsPublicCallbacksClosedAndDisconnectCleanupWorking',async()=>withMetaInboxFixture(async f=>{
 const env={META_INBOX_DELETION_ENABLED:'false',INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-configured-secret',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',API_PUBLIC_URL:'https://example.test',INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_manage_messages',INSTAGRAM_MANAGEMENT_LIFECYCLE_MODE:'existing_app_instructions',INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL:'https://example.test/data-deletion'};
 const before=await f.publishingSnapshot();
 const runtime=createConfiguredInstagramManagementRuntime({db:f.db,env,encrypt:encryptToken,decrypt:decryptToken});
 const lifecycle=createMetaInboxLifecycleRuntime({db:f.db,env,encrypt:encryptToken,decrypt:decryptToken});
 assert.equal(lifecycle.enabled,false);assert.equal(lifecycle.routes.length,0);assert.equal(lifecycle.maintenanceEnabled,true);assert.deepEqual(lifecycle.namespaces,[{platform:'instagram',appId:'456'}]);
 assert.equal(runtime.receptionEnabled,false);await runtime.disconnect(f.adminCtx,f.instagramConnectionIds[0]);
 assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('sharedAppInstructionsModeRejectsUnreviewedOrForeignInstructions',async()=>withMetaInboxFixture(async f=>{
 const env={META_INBOX_DELETION_ENABLED:'false',INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-configured-secret',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',API_PUBLIC_URL:'https://example.test',INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_manage_messages',INSTAGRAM_MANAGEMENT_LIFECYCLE_MODE:'existing_app_instructions',INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL:'https://example.test/data-deletion'};
 for(const patch of [{INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL:undefined},{INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL:'https://evil.test/data-deletion'},{INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL:'http://example.test/data-deletion'},{INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL:'https://example.test/data-deletion?private=secret'},{INSTAGRAM_MANAGEMENT_DELETION_INSTRUCTIONS_URL:'https://private-user:private-password@example.test/data-deletion'},{INSTAGRAM_MANAGEMENT_LIFECYCLE_MODE:'unknown'},{META_INBOX_DELETION_ENABLED:'true'}])assert.throws(()=>createConfiguredInstagramManagementRuntime({db:f.db,env:{...env,...patch},encrypt:encryptToken,decrypt:decryptToken}),e=>!String(e).includes('private'));
}));

test('configuredIndependentRuntimeActuallyAdmitsDisconnectCleanup',async()=>withMetaInboxFixture(async f=>{
 const env={META_INBOX_DELETION_ENABLED:'true',INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-configured-secret',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',API_PUBLIC_URL:'https://example.test',INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_manage_messages'};
 const runtime=createConfiguredInstagramManagementRuntime({db:f.db,env,encrypt:encryptToken,decrypt:decryptToken}),before=await f.publishingSnapshot();
 assert.equal(runtime.receptionEnabled,false);await runtime.disconnect(f.adminCtx,f.instagramConnectionIds[0]);assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('independentInstagramCannotStartBeforeItsCleanupLifecycleIsConfigured',async()=>withMetaInboxFixture(async f=>{
 const env={INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-configured-secret',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',API_PUBLIC_URL:'https://example.test',INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_manage_messages'};
 for(const flag of [undefined,'false'])assert.throws(()=>createConfiguredInstagramManagementRuntime({db:f.db,env:{...env,META_INBOX_DELETION_ENABLED:flag},encrypt:encryptToken,decrypt:decryptToken}));
}));

test('configuredRuntimeDoesNotEnableReceptionFromMissingOrMalformedFlags',async()=>withMetaInboxFixture(async f=>{
 const input={db:f.db,encrypt:encryptToken,decrypt:decryptToken};assert.equal(createConfiguredInstagramManagementRuntime({...input,env:{}}).receptionEnabled,false);
 assert.throws(()=>createConfiguredInstagramManagementRuntime({...input,env:{INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED:'yes'}}));assert.throws(()=>createConfiguredInstagramManagementRuntime({...input,env:{INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED:'true'}}));
}));
