'use strict';
if(require.main===module)require('./cli.cjs').main('prepare').catch(()=>{console.error('Controlled REC3 preparation stopped; no send or reset performed');process.exitCode=1;});
