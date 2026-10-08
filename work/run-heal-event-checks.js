'use strict';
const fs=require('fs'),assert=require('assert/strict'),{checks,runChecks}=require('../tools/check_game');
assert.equal(checks.length,127);
const list=checks.filter(([n])=>!['implementation checklist','content coverage','docs'].includes(n));assert.equal(list.length,124);
const part=process.argv[2];assert.ok(['a','b'].includes(part));
const path=`work/heal-event-checks-${part}.txt`;fs.writeFileSync(path,'');
process.exitCode=runChecks(part==='a'?list.slice(0,62):list.slice(62),{report:line=>{fs.appendFileSync(path,line+'\n');console.log(line);}});
