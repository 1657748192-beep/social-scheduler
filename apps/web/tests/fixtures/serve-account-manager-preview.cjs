const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../../..'),output=path.join(root,'output/account-manager-preview');
fs.mkdirSync(output,{recursive:true});
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'account-manager-preview.tsx')],outfile:path.join(output,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_API_URL':'"http://127.0.0.1:4319/api/v1"'}});
http.createServer((req,res)=>{
  if(req.url==='/'||req.url==='/social-accounts'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>Social accounts · local read-only preview</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/theme.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
  let file=({'/style.css':path.join(root,'apps/web/app/globals.css'),'/theme.css':path.join(root,'apps/web/app/workspace-theme.css'),'/fixture.js':path.join(output,'fixture.js')})[req.url];
  if(/^\/platform-logos\/[a-z]+\.(png|svg)$/.test(req.url))file=path.join(root,'apps/web/public',req.url);
  if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'image/png');fs.createReadStream(file).pipe(res);
}).listen(4319,'127.0.0.1',()=>console.log('Read-only account preview http://127.0.0.1:4319; no real credentials, API, or platform calls.'));
