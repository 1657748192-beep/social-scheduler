import test from 'node:test';import assert from 'node:assert/strict';
import {getMetaInboxLifecycleConfig} from '../src/interactionInbox/lifecycleConfig';
const input={META_INBOX_DELETION_ENABLED:'true',API_PUBLIC_URL:'https://example.test',FACEBOOK_CLIENT_ID:'123',FACEBOOK_CLIENT_SECRET:'synthetic-facebook-secret',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-instagram-secret'};
test('deletionCallbacksRemainClosedUntilExplicitlyEnabled',()=>{assert.deepEqual(getMetaInboxLifecycleConfig({}),{enabled:false,bindings:[]});assert.deepEqual(getMetaInboxLifecycleConfig({...input,META_INBOX_DELETION_ENABLED:'false'}),{enabled:false,bindings:[]});});
test('deletionBindingsUseIndependentPlatformNamespaceAndFixedPublicPaths',()=>{
 const c=getMetaInboxLifecycleConfig(input);assert.equal(c.enabled,true);assert.equal(c.bindings.length,2);
 assert.deepEqual(c.bindings.map(v=>({namespace:v.namespace,prefix:v.prefix,statusBaseUrl:v.statusBaseUrl})),[{namespace:{platform:'facebook',appId:'123'},prefix:'/api/v1/meta-lifecycle/facebook',statusBaseUrl:'https://example.test/api/v1/meta-lifecycle/facebook/status'},{namespace:{platform:'instagram',appId:'456'},prefix:'/api/v1/meta-lifecycle/instagram',statusBaseUrl:'https://example.test/api/v1/meta-lifecycle/instagram/status'}]);
});
test('invalidEnabledBindingsFailWithoutReflectingConfigurationOrSecrets',()=>{
 for(const patch of [{META_INBOX_DELETION_ENABLED:'yes'},{FACEBOOK_CLIENT_ID:'private-invalid-id'},{INSTAGRAM_CLIENT_SECRET:''},{API_PUBLIC_URL:'http://example.test'},{API_PUBLIC_URL:'https://private-user:private-password@example.test'},{API_PUBLIC_URL:'https://example.test/?private=query'}])assert.throws(()=>getMetaInboxLifecycleConfig({...input,...patch}),e=>e instanceof Error&&!/private|synthetic/.test(e.message));
});
