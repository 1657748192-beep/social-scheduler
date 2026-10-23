'use strict';
if(require.main===module)require('./cli.cjs').main('verify').catch(()=>{console.error('Controlled REC3 verification stopped; no send or reset performed');process.exitCode=1;});
