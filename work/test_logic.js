const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync('D:/OneDrive/Project/卫戍协议私服/web/mode_data.json', 'utf8'));
const PROF = { WARRIOR:2, SNIPER:3, TANK:4, MEDIC:1, SUPPORT:2, CASTER:4, SPECIAL:3, PIONEER:2 };
function opPower(o){ return o.rarity*8 + (PROF[o.profession]||2); }
function activeBonds(squad) {
  const nat=new Set(), grp=new Set(), tm=new Set();
  squad.forEach(o=>{ if(o.nationId)nat.add(o.nationId); if(o.groupId)grp.add(o.groupId); if(o.teamId)tm.add(o.teamId); });
  const res=[];
  for(const b of DATA.bonds){ let c=0; for(const p of b.powerIdList) if(nat.has(p)||grp.has(p)||tm.has(p)) c++; if(c>=2) res.push({bond:b, covered:c}); }
  return res;
}
console.log('operators:', DATA.operators.length, 'bonds:', DATA.bonds.length, 'bands:', DATA.bands.length, 'bosses:', DATA.bosses.length);
const yanShip = DATA.bonds.find(b=>b.bondId==='yanShip');
console.log('yanShip powerIdList:', JSON.stringify(yanShip.powerIdList));
// build a squad spanning 3 of yanShip's powers
const powers = ['yan','sui','lungmen','lee','lgd'];
const squad = [];
for (const p of powers) { const o = DATA.operators.find(x=>x.nationId===p||x.groupId===p||x.teamId===p); if(o) squad.push(o); }
console.log('test squad size:', squad.length, '->', squad.map(o=>o.charId+'@'+o.nationId).join(', '));
const ab = activeBonds(squad);
console.log('active bonds:', ab.map(x=>x.bond.bondId+'(covered='+x.covered+')').join(' | '));
console.log('squad power (with bonds):', Math.round(squad.reduce((s,o)=>s+opPower(o),0) * ab.reduce((m,x)=>m*(1+x.covered*0.05),1)));