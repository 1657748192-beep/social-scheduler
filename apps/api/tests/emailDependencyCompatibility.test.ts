import assert from 'node:assert/strict';
import {once} from 'node:events';
import net from 'node:net';
import test from 'node:test';

test('password reset email still sends through the configured SMTP transport after dependency upgrades',{timeout:10000},async()=>{
  process.env.DATABASE_URL??='postgresql://test:test@127.0.0.1:5432/test';
  process.env.REDIS_URL??='redis://127.0.0.1:6379';
  process.env.JWT_SECRET??='local-test-only-secret-at-least-32-characters';
  const {config}=await import('../src/config');
  const {sendPasswordResetEmail}=await import('../src/services/emailService');
  const original={SMTP_HOST:config.SMTP_HOST,SMTP_PORT:config.SMTP_PORT,SMTP_SECURE:config.SMTP_SECURE,SMTP_FROM:config.SMTP_FROM,SMTP_USER:config.SMTP_USER,SMTP_PASS:config.SMTP_PASS};
  const sockets=new Set<net.Socket>();let message='',recipient='',sender='';
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');
    let buffer='',data=false;
    socket.on('data',chunk=>{
      buffer+=chunk;
      while(buffer.includes('\r\n')){
        const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(data){if(line==='.') {data=false;socket.write('250 accepted\r\n');}else message+=line+'\r\n';continue;}
        if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');
        else if(/^MAIL FROM:/.test(line)){sender=line;socket.write('250 OK\r\n');}
        else if(/^RCPT TO:/.test(line)){recipient=line;socket.write('250 OK\r\n');}
        else if(line==='DATA'){data=true;socket.write('354 send message\r\n');}
        else if(line==='QUIT')socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address && typeof address!=='string');
  Object.assign(config,{SMTP_HOST:'127.0.0.1',SMTP_PORT:address.port,SMTP_SECURE:false,SMTP_FROM:'sender@example.test',SMTP_USER:'',SMTP_PASS:''});
  try{
    assert.deepEqual(await sendPasswordResetEmail({to:'customer@example.test',resetUrl:'https://example.test/reset/test-token',expiresInMinutes:30}),{sent:true,reason:null});
    assert.match(sender,/<sender@example\.test>/);assert.match(recipient,/<customer@example\.test>/);
    assert.match(message,/https:\/\/example\.test\/reset\/test-token/);assert.match(message,/Content-Type: multipart\/alternative/);
  }finally{Object.assign(config,original);for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
