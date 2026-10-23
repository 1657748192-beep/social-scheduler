'use strict';
if(require.main===module)require('./cli.cjs').main('read').catch(()=>{console.error('Controlled REC3 read stopped; no send or reset performed');process.exitCode=1;});
