import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import test from 'node:test';

const require=createRequire(import.meta.url);
// Resolve through the actual consumers, not a separate direct test dependency.
test('Express proxy trust does not trust arbitrary IPv4 through a short mapped IPv6 subnet',()=>{
  const proxyaddr=createRequire(require.resolve('express'))('proxy-addr');
  const trust=proxyaddr.compile('::ffff:10.0.0.0/8');
  assert.equal(trust('203.0.113.10',0),false);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('10.1.2.3',0),true);
});
test('Prisma configuration merge handles recursive input without stack exhaustion',()=>{
  const merge=createRequire(require.resolve('@prisma/config'))('deepmerge-ts').deepmerge;
  const left:any={value:1},right:any={value:2};left.self=left;right.self=right;
  const result=merge(left,right);
  assert.equal(result.value,2);
  assert.equal(result.self,result,'recursive config preserves the cycle without exhausting the stack');
  assert.deepEqual(merge({datasource:{url:'test'}},{datasource:{other:true}}),{datasource:{url:'test',other:true}});
});
test('development command quoting cannot execute a newline token after a comment',()=>{
  const quote=createRequire(require.resolve('concurrently'))('shell-quote').quote;
  let command:string;
  try{command=quote(['printf','%s','ok',{comment:'x'},'a\nprintf UNEXPECTED_MARKER;#']);}
  catch(error){assert.ok(error instanceof Error);return;}
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
  const output=execFileSync(bash,['-c',command],{encoding:'utf8',timeout:5000});
  assert.doesNotMatch(output,/UNEXPECTED_MARKER/);
});
