'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const modeData = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'mode_data.json'), 'utf8'));
const avatarDir = path.join(ROOT, 'web', 'enemy_avatars');
const ids = new Set();
for (const item of modeData.enemyPool || []) {
  if (typeof item === 'string') ids.add(item);
  else if (item) {
    if (item.enemyId || item.id) ids.add(item.enemyId || item.id);
    for (const extra of item.extraEnemyKeyList || []) if (extra) ids.add(extra);
  }
}

const missing = [];
const invalid = [];
for (const id of ids) {
  const file = path.join(avatarDir, id + '.png');
  if (!fs.existsSync(file)) { missing.push(id); continue; }
  const head = fs.readFileSync(file).subarray(0, 8);
  if (head.length < 8 || head.toString('hex') !== '89504e470d0a1a0a') invalid.push(id);
}

if (missing.length || invalid.length) {
  console.error('ENEMY AVATAR SMOKE FAIL', { pool: ids.size, missing: missing.length, invalid: invalid.length, missingSample: missing.slice(0, 20), invalidSample: invalid.slice(0, 20) });
  process.exit(1);
}
console.log('ENEMY AVATAR SMOKE OK pool=' + ids.size + ' missing=0 invalid=0');
