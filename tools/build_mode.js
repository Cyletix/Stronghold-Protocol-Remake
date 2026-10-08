'use strict';
// 拼接 web/mode/*.js → web/mode.js（源码按 web/mode/ 分文件维护，此脚本生成运行期 bundle）
// 顺序必须与文件依赖顺序一致；拼接结果应与拆分前字节一致。
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web');
const MODE_DIR = path.join(WEB, 'mode');
const ORDER = ['data.js', 'rules.js', 'garrison.js', 'strategy.js', 'decision.js', 'tactical.js', 'equip.js', 'battle.js', 'save.js', 'settlement.js', 'ui.js', 'roster.js', 'debug.js'];
const out = ORDER.map(f => fs.readFileSync(path.join(MODE_DIR, f), 'utf8')).join('');
const target = path.join(WEB, 'mode.js');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== out) {
    console.error('mode.js differs from web/mode/*.js; run node tools/build_mode.js');
    process.exitCode = 1;
  } else console.log('PASS mode.js matches all ' + ORDER.length + ' source modules');
} else {
  fs.writeFileSync(target, out);
  console.log('mode.js rebuilt from ' + ORDER.length + ' files (' + out.length + ' chars)');
}
