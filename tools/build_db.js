'use strict';
// 构建 web/data.db（SQLite，node:sqlite 内置，无需依赖）：把「随手改」的数值收口到单一数据源。
// 表：operators(干员) / enemies(怪物) / bonds(盟约) / bands(策略) / constants(零碎常数)
// 数据源：web/battle_data.json、web/bond_data.json、web/band_data.json、以及本仓库当前硬编码常数。
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const WEB = path.join(__dirname, '..', 'web');
const DB_PATH = path.join(WEB, 'data.db');
const load = n => JSON.parse(fs.readFileSync(path.join(WEB, n), 'utf8'));

const battle = load('battle_data.json');
const bond = load('bond_data.json');
const band = load('band_data.json');

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE operators(
  charId TEXT PRIMARY KEY, name TEXT, rarity INTEGER, profession TEXT, subProfession TEXT,
  position TEXT, nationId TEXT, groupId TEXT, teamId TEXT,
  maxHp INTEGER, atk INTEGER, def INTEGER, magicRes REAL, cost INTEGER,
  blockCnt INTEGER, attackTime REAL, epRes REAL
);
CREATE TABLE enemies(
  enemyId TEXT PRIMARY KEY, name TEXT, maxHp INTEGER, atk INTEGER, def INTEGER, magicRes REAL,
  moveSpeed REAL, attackTime REAL, massLevel INTEGER, lifePointReduce INTEGER, blockCnt INTEGER,
  cost INTEGER, rangeRadius REAL, motion TEXT, flying INTEGER, epRes REAL, atkType TEXT
);
CREATE TABLE bonds(
  bondId TEXT PRIMARY KEY, name TEXT, type TEXT, ord INTEGER, isPower INTEGER,
  activeCount INTEGER, activeCondition TEXT, powerIdList TEXT, desc TEXT
);
CREATE TABLE bands(name TEXT PRIMARY KEY, bandId TEXT, strategy TEXT, hp INTEGER, effect TEXT);
CREATE TABLE constants(key TEXT PRIMARY KEY, value TEXT, num REAL);
`);

const insOp = db.prepare(`INSERT INTO operators VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const o of (battle.operators || [])) {
  insOp.run(o.charId, o.name, o.rarity, o.profession, o.subProfession, o.position, o.nationId, o.groupId, o.teamId,
    o.maxHp, o.atk, o.def, o.magicRes, o.cost, o.blockCnt, o.attackTime, o.epRes == null ? 0 : o.epRes);
}
const insEn = db.prepare(`INSERT INTO enemies VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const e of Object.values(battle.enemies || {})) {
  insEn.run(e.enemyId, e.name, e.maxHp, e.atk, e.def, e.magicRes == null ? 0 : e.magicRes,
    e.moveSpeed, e.attackTime, e.massLevel, e.lifePointReduce, e.blockCnt, e.cost, e.rangeRadius,
    e.motion, e.flying ? 1 : 0, e.epRes == null ? 0 : e.epRes, e.atkType || 'phys');
}
const insBond = db.prepare(`INSERT INTO bonds VALUES(?,?,?,?,?,?,?,?,?)`);
for (const b of (bond.bonds || [])) {
  insBond.run(b.bondId, b.name, b.type, b.order == null ? 0 : b.order, b.isPower ? 1 : 0,
    b.activeCount == null ? 0 : b.activeCount, b.activeCondition || '', JSON.stringify(b.powerIdList || []), b.desc || '');
}
const insBand = db.prepare(`INSERT INTO bands VALUES(?,?,?,?,?)`);
for (const [name, b] of Object.entries(band)) {
  insBand.run(name, `band_${name}`, b.策略 || '', b.血量 == null ? 0 : b.血量, b.效果 || '');
}
const insConst = db.prepare(`INSERT INTO constants VALUES(?,?,?)`);
const consts = [
  ['NORMAL_ROUNDS', 13], ['BUY_COST', 3], ['SELL_REFUND', 1], ['REFRESH_COST', 1],
  ['MAX_LEVEL', 6], ['SHOP_SLOTS', 6], ['ENEMY_HP0', 140], ['LIFE0', 20],
  ['UPGRADE_COST_INIT', 5], ['ROUND_LIMIT', 60], ['PROJECTILE_SPEED', 10],
];
for (const [k, v] of consts) insConst.run(k, String(v), v);

db.exec(`CREATE INDEX idx_operators_prof ON operators(profession);`);
db.exec(`CREATE INDEX idx_enemies_name ON enemies(name);`);

db.close();

// 自检
const chk = new DatabaseSync(DB_PATH);
const count = t => chk.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log('data.db 建成:',
  'operators=' + count('operators'),
  'enemies=' + count('enemies'),
  'bonds=' + count('bonds'),
  'bands=' + count('bands'),
  'constants=' + count('constants'));
const one = chk.prepare(`SELECT name,maxHp,atk,def FROM enemies WHERE enemyId='enemy_10001_trslim'`).get();
console.log('样例敌人: ', JSON.stringify(one));
chk.close();
