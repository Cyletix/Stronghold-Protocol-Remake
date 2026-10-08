'use strict';
const fs=require('fs'),assert=require('assert/strict'),{checks,runChecks}=require('../tools/check_game');
const list=checks.filter(([n])=>!['implementation checklist','content coverage','docs'].includes(n)).slice(0,62);
const log=fs.readFileSync('work/heal-event-checks-a.txt','utf8'),passed=new Set([...log.matchAll(/^PASS (.+)$/gm)].map(m=>m[1]));
assert.equal(passed.size,27);const remaining=list.filter(([n])=>!passed.has(n));assert.equal(remaining.length,35);
const path='work/heal-event-checks-a-resume.txt';fs.writeFileSync(path,'');
process.exitCode=runChecks(remaining,{report:line=>{fs.appendFileSync(path,line+'\n');console.log(line);}});
