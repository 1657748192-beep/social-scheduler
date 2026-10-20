import assert from 'node:assert/strict';import test from 'node:test';import {spawnSync} from 'node:child_process';
test('server compose passes the dedicated import config to API only without changing publishing config',()=>{
 const result=spawnSync('docker',['compose','-f','docker-compose.yml','-f','docker-compose.server.yml','config','--format','json'],{encoding:'utf8',env:{...process.env,POSTGRES_PASSWORD:'synthetic-only',JWT_SECRET:'synthetic-only',TOKEN_ENCRYPTION_KEY:'0'.repeat(64),PUBLIC_API_URL:'https://app.example.test',PUBLIC_WEB_URL:'https://app.example.test',FACEBOOK_LOGIN_CONFIG_ID:'1748083276619458',FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID:'1659564855841697'}});
 assert.equal(result.status,0);const services=JSON.parse(result.stdout).services;
 assert.equal(services.api.environment.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID,'1659564855841697');assert.equal(services.worker.environment.FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID,undefined);
 assert.equal(services.api.environment.FACEBOOK_LOGIN_CONFIG_ID,'1748083276619458');assert.equal(services.worker.environment.FACEBOOK_LOGIN_CONFIG_ID,'1748083276619458');
});
