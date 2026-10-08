'use strict';
// 从 data.db 导出运行时 JSON：web/constants.json（零碎常数，浏览器读取）+ web/db_export.json（全表投影）
// 目的：让「随手改」的数值以 data.db 为唯一数据源，浏览器只消费其投影。
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const WEB = path.join(__dirname, '..', 'web');
const DB_PATH = path.join(WEB, 'data.db');
if (!fs.existsSync(DB_PATH)) { console.error('缺少 data.db，请先运行 node tools/build_db.js'); process.exit(1); }
const db = new DatabaseSync(DB_PATH);

// 零碎常数 → 对象（num 优先，其次 value）
const constants = {};
for (const r of db.prepare(`SELECT key,value,num FROM constants`).all()) {
  constants[r.key] = (r.num != null) ? r.num : r.value;
}
fs.writeFileSync(path.join(WEB, 'constants.json'), JSON.stringify(constants, null, 1), 'utf8');

// 全表投影 → db_export.json（数组形式）
const dump = (table, colMap) => db.prepare(`SELECT * FROM ${table}`).all().map(row => {
  const o = {};
  for (const [src, dst] of Object.entries(colMap)) o[dst] = row[src];
  return o;
});
const exportData = {
  source: 'data.db',
  operators: dump('operators', { charId:'charId', name:'name', rarity:'rarity', profession:'profession',
    subProfession:'subProfession', position:'position', nationId:'nationId', groupId:'groupId', teamId:'teamId',
    maxHp:'maxHp', atk:'atk', def:'def', magicRes:'magicRes', cost:'cost', blockCnt:'blockCnt', attackTime:'attackTime', epRes:'epRes' }),
  enemies: dump('enemies', { enemyId:'enemyId', name:'name', maxHp:'maxHp', atk:'atk', def:'def', magicRes:'magicRes',
    moveSpeed:'moveSpeed', attackTime:'attackTime', lifePointReduce:'lifePointReduce', flying:'flying', epRes:'epRes', atkType:'atkType' }),
  bonds: dump('bonds', { bondId:'bondId', name:'name', type:'type', ord:'order', isPower:'isPower',
    activeCount:'activeCount', activeCondition:'activeCondition', powerIdList:'powerIdList', desc:'desc' }),
  bands: dump('bands', { name:'name', bandId:'bandId', strategy:'strategy', hp:'hp', effect:'effect' }),
};
fs.writeFileSync(path.join(WEB, 'db_export.json'), JSON.stringify(exportData, null, 1), 'utf8');
db.close();
console.log('导出:', 'constants=' + Object.keys(constants).length, 'operators=' + exportData.operators.length,
  'enemies=' + exportData.enemies.length, 'bonds=' + exportData.bonds.length, 'bands=' + exportData.bands.length);
