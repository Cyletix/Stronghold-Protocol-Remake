'use strict';
// 富文本解析器 richText 冒烟测试：验证方舟标记 → 高亮词条
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const modeSrc = fs.readFileSync(path.join(WEB, 'mode.js'), 'utf8');
// 加载官方词条数据（RICHTERM），验证带官方释义的解析
const richterm = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_richterm.json'), 'utf8'));
const sandbox = { console, failed: false };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(modeSrc, sandbox);
// 运行 mode.js 后再注入 RICHTERM（mode.js 用 let 声明，提前声明会冲突）
vm.runInContext('RICHTERM = ' + JSON.stringify(richterm) + ';', sandbox);

// 在 vm 上下文里只做计算并写入 window.__results；断言在外部做
const test = `
(() => {
  const cases = [
    ['<$ba.stun>晕眩</>', '状态-晕眩', '/ba-tag/'],
    ['令其获得8秒10%的<$ba.fragile>脆弱</>效果', '状态-脆弱', '/ba-tag/'],
    ['部署经过3秒后造成<$ba.dt.neural2>神经损伤</>', '状态-神经损伤', '/ba-tag/'],
    ['对<$ba.sleep>沉睡</>目标生效', '状态-沉睡', '/ba-tag/'],
    ['造成<@ba.kw>法术伤害</>', '关键词-法术伤害', '/ba-kw/'],
    ['攻击力<$ba.vup>提升</>，防御<$ba.vdown>下降</>', '数值-升降', '/ba-tag/'],
    ['在<树丛>中埋伏，临近<城防屏障>', '地形-中文关键词', '/ba-kw/'],
    ['造成<$ba.aiProtect>庇护</>，<宝刺金属箱>阻挡', '混合', '/ba-tag/'],
    ['无标签普通文本：攻击力300%物理伤害', '无标签', '/无标签/'],
  ];
  const rs = [];
  for (const [input, label] of cases) {
    const out = richText(input);
    const hasBare = /<\\$ba\\.|<@ba\\.|<\\/>/.test(out);
    rs.push({ label, input, out, hasBare });
    console.log('['+label+']');
    console.log('  IN :', input);
    console.log('  OUT:', out);
  }
  window.__results = rs;
})();
`;
vm.runInContext(test, sandbox);
// 断言
const rs = sandbox.window.__results;
let failed = false;
const assert = (cond, msg) => { if (!cond) { console.log('ASSERT FAIL:', msg); failed = true; } else console.log('assert ok:', msg); };
const stun = sandbox.window.richText ? sandbox.window.richText('<$ba.stun>晕眩</>') : null;
assert(rs[0].out.indexOf('ba-tag') >= 0, 'stun 转高亮词条');
assert(rs[0].out.indexOf('晕眩') >= 0, '保留中文名');
assert(rs[0].out.indexOf('$ba') < 0, '无原始 $ba 标记');
assert(rs[4].out.indexOf('ba-kw') >= 0, 'kw 用 ba-kw 类');
assert(rs[6].out.indexOf('ba-kw') >= 0, '中文关键词转 ba-kw');
assert(rs[8].out.indexOf('无标签普通文本') >= 0, '无标签文本保留');
assert(rs.every(r => !r.hasBare), '所有用例无残留原始标记');
console.log('RICH SMOKE ' + (failed ? 'FAIL' : 'OK'));
if (failed) process.exitCode = 1;
