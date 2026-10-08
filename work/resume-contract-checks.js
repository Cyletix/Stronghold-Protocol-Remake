'use strict';
const fs=require('fs'),assert=require('node:assert/strict'),{checks,runChecks}=require('../tools/check_game');
const source=fs.readFileSync('work/contract-batch-checks-a.txt','utf8'),passed=new Set([...source.matchAll(/^PASS (.+)$/gm)].map(m=>m[1]));
const skip=new Set(['implementation checklist','content coverage','docs']);
const remaining=checks.filter(([n])=>!skip.has(n)).filter((_,i)=>i%2===0).filter(([n])=>!passed.has(n));
assert.equal(remaining[0][0],'rest_save');assert.equal(passed.size+remaining.length,60);
const log='work/contract-batch-checks-a-resume.txt';fs.writeFileSync(log,'');
process.exitCode=runChecks(remaining,{report:s=>{fs.appendFileSync(log,s+'\n');console.log(s);}});
