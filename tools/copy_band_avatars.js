'use strict';
// 从 PRTS 页面的 _files 把「卫戍协议：盟约_策略发起人_<名>.png」复制为 web/band_avatars/<bandId>.png（ASCII 名，避免中文/特殊字符 src）。
// 依据：策略阶段使用卫戍协议专用头像（策略发起人立绘），不使用干员头像。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'reference', 'prts', '卫戍协议：盟约下半_files');
const OUT = path.join(ROOT, 'web', 'band_avatars');
const bands = (JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'mode_data.json'), 'utf8')).bands || []);

if (!fs.existsSync(SRC)) { console.error('缺少 PRTS _files 目录:', SRC); process.exit(1); }
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const files = new Set(fs.readdirSync(SRC));
let wrote = 0, miss = [];
for (const b of bands) {
  const name = '卫戍协议：盟约_策略发起人_' + b.name + '.png';
  if (!files.has(name)) { miss.push(b.bandId + ' : ' + b.name); continue; }
  const src = path.join(SRC, name);
  const dst = path.join(OUT, b.bandId + '.png');
  const st = fs.statSync(src);
  if (st.size <= 0) { miss.push(b.bandId + ' : ' + b.name + ' (0字节)'); continue; }
  fs.copyFileSync(src, dst);
  wrote++;
  console.log('OK  ', b.bandId, '->', dst);
}
console.log('---');
console.log('复制', wrote, '张', '缺失', miss.length);
if (miss.length) console.log('缺失:', JSON.stringify(miss));
