import net from 'node:net';
const originalInterval=globalThis.setInterval;
// Accelerate only the injected fixture's two-second API maintenance clock.
globalThis.setInterval=((fn:any,ms:number,...args:any[])=>originalInterval(fn,ms===2000?20:ms,...args)) as typeof setInterval;
globalThis.fetch=async()=>{throw Error('Provider I/O is forbidden in this fixture');};
async function start(){
 const probe=net.createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',()=>resolve()));const port=(probe.address() as net.AddressInfo).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 process.env.API_PORT=String(port);process.on('message',message=>{if(message==='stop')process.emit('SIGTERM');});
 await import('../../src/server');process.send?.({port});
}
void start().catch(()=>process.exit(1));
