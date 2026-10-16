// Explicit local-only UI verification. No credentials or external API proxy.
const esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs');
async function main(){
  const result=await esbuild.build({entryPoints:['apps/web/tests/fixtures/facebook-management-fixture.tsx'],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NEXT_PUBLIC_API_URL':JSON.stringify('http://127.0.0.1:4197/api/v1'),'process.env.NODE_ENV':JSON.stringify('development')}});
  http.createServer((req,res)=>{
    if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].contents);}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync('apps/web/app/globals.css'));}
    else if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');}
    else{res.statusCode=404;res.end('Fixture route not found');}
  }).listen(4197,'127.0.0.1',()=>console.log('Synthetic UI fixture: http://127.0.0.1:4197'));
}
main().catch(()=>{console.error('Could not start synthetic UI fixture');process.exitCode=1;});
