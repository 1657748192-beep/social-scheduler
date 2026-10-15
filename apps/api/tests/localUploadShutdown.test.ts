import assert from 'node:assert/strict';
import {request} from 'node:http';
import {once} from 'node:events';
import test from 'node:test';
import {beginUploadOperation,abortLocalUploads} from '../src/uploads/local/operations';
import * as httpServer from '../src/httpServer';

test('API shutdown aborts an incomplete upload before waiting for connections to close',async t=>{
 const close=(httpServer as any).closeApiServer;assert.equal(typeof close,'function');
 let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
 const server=httpServer.createApiServer((req,res)=>{
  const operation=beginUploadOperation('shutdown-test');
  operation.signal.addEventListener('abort',()=>{res.statusCode=410;res.end();operation.done();},{once:true});entered();
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close();});
 const response=new Promise<number>((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port:(server.address() as any).port,method:'PUT',headers:{'Content-Length':2}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode!));});
  req.on('error',reject);req.write('a');
 });
 await started;let disconnected=false;
 await close(server,()=>abortLocalUploads('shutdown-test'),async()=>{disconnected=true;});
 assert.equal(await response,410);assert.equal(disconnected,true);
});
