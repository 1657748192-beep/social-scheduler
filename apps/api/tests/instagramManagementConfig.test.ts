import test from 'node:test';import assert from 'node:assert/strict';
import {getInstagramManagementConfig} from '../src/instagramManagement/config';
const env={INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'private-no-echo',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',API_PUBLIC_URL:'https://app.example.test',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://app.example.test/api/v1/integrations/instagram-management/oauth/callback',INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages'};
test('disabledIndependentConfigNeedsNoPublishingSecrets',()=>{assert.equal(getInstagramManagementConfig({}).enabled,false);assert.equal(getInstagramManagementConfig({INSTAGRAM_MANAGEMENT_ENABLED:'false'}).appId,'');});
test('independentCallbackStrictlySameOriginAndNoPublishScope',()=>{
 assert.equal(getInstagramManagementConfig(env).appId,'456');
 for(const patch of [{INSTAGRAM_MANAGEMENT_ENABLED:'yes'},{INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'latest'},{INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://evil.test/api/v1/integrations/instagram-management/oauth/callback'},{INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://app.example.test/api/v1/integrations/instagram/oauth/callback'},{INSTAGRAM_MANAGEMENT_CALLBACK_URL:env.INSTAGRAM_MANAGEMENT_CALLBACK_URL+'?next=private-no-echo'},{INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_content_publish'},{INSTAGRAM_MANAGEMENT_SCOPES:''}])assert.throws(()=>getInstagramManagementConfig({...env,...patch}),e=>!String(e).includes('private-no-echo'));
});
export const syntheticInstagramConfig=getInstagramManagementConfig(env);
