const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'../../../..');
const output=path.join(root,'output/playwright');fs.mkdirSync(output,{recursive:true});
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'social-preview-fixture.tsx')],outfile:path.join(output,'social-preview-fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');return;}
 const files={'/style.css':path.join(root,'apps/web/app/globals.css'),'/fixture.js':path.join(output,'social-preview-fixture.js')};
 let file=files[req.url];if(req.url.startsWith('/platform-logos/')&&/^\/platform-logos\/[a-z]+\.(png|svg)$/.test(req.url))file=path.join(root,'apps/web/public',req.url);
 if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'image/png');fs.createReadStream(file).pipe(res);
});server.listen(4317,'127.0.0.1',()=>console.log('Local preview fixture http://127.0.0.1:4317; no API or platform connection'));
