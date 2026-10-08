'use strict';
const fs=require('fs'),{execFileSync}=require('child_process');
const p='web/mode/save.js';let s=fs.readFileSync(p,'utf8');
if(!s.includes("'1023c11cf435e1a4':"))s=s.replace('const REST_CATALOG_MIGRATIONS={',"// Timed client stat graphs, permanent enemy flags and act1 training data rebind derived rest state.\nconst REST_CATALOG_MIGRATIONS={'1023c11cf435e1a4':'8e3af03c5c2f0554','9bf896ee0fd666e6':'8e3af03c5c2f0554',");
s=s.replaceAll(":'1023c11cf435e1a4'",":'8e3af03c5c2f0554'");fs.writeFileSync(p,s);
process.stdout.write(execFileSync(process.execPath,['tools/build_mode.js'],{encoding:'utf8'}));
