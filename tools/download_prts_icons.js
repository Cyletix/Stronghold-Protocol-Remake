'use strict';
// 慢速从 PRTS 抓取缺的 5 个盟约图标 + 道具图标 URL（带重试 + 延迟，避免频繁访问被限速）
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArknightsResearch/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(u, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(u, { headers: UA, signal: ctl.signal }); clearTimeout(tm);
      if (r.ok) return await r.text();
      if (r.status === 403 || r.status === 429) { await sleep(4000 * (i + 1)); continue; }
    } catch (e) {}
    await sleep(3000 * (i + 1));
  }
  throw new Error('获取失败 ' + u);
}
async function dl(url, outPath) {
  for (let i = 0; i < 4; i++) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(url, { headers: UA, signal: ctl.signal }); clearTimeout(tm);
      if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, buf); return buf.length; }
      if (r.status === 403 || r.status === 429) { await sleep(4000 * (i + 1)); continue; }
    } catch (e) {}
    await sleep(3000 * (i + 1));
  }
  throw new Error('下载失败 ' + url);
}
function mediaUrls(html) { return [...new Set((html.match(/media\.prts\.wiki\/[^"'\s]+\.(?:png|jpg)/g) || []))]; }

(async () => {
  const bondDir = path.join(ROOT, 'web', 'bond_avatars');
  const equipDir = path.join(ROOT, 'web', 'equip_icons');
  // 1) 缺的 5 个盟约图标（URL 已从 API 确认）
  const bondUrls = {
    siracusaShip: 'https://media.prts.wiki/b/b6/%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%EF%BC%9A%E7%9B%9F%E7%BA%A6_icon_siracusaShip.png',
    kazimierzShip: 'https://media.prts.wiki/0/0d/%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%EF%BC%9A%E7%9B%9F%E7%BA%A6_icon_kazimierzShip.png',
    arcaneShip: 'https://media.prts.wiki/f/f5/%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%EF%BC%9A%E7%9B%9F%E7%BA%A6_icon_arcaneShip.png',
    soloShip: 'https://media.prts.wiki/e/e0/%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%EF%BC%9A%E7%9B%9F%E7%BA%A6_icon_soloShip.png',
    suntShip: 'https://media.prts.wiki/d/dc/%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%EF%BC%9A%E7%9B%9F%E7%BA%A6_icon_suntShip.png',
  };
  for (const [bondId, url] of Object.entries(bondUrls)) {
    const name = 'icon_' + bondId + '.png';
    if (fs.existsSync(path.join(bondDir, name))) { console.log('已存在', name); continue; }
    try { const sz = await dl(url, path.join(bondDir, name)); console.log('下载', name, sz, 'bytes'); await sleep(300); }
    catch (e) { console.log('失败', name, e.message); }
  }
  // 2) 道具图标：从 API 拿 URL 列表
  const apiItem = await get('https://prts.wiki/api.php?action=query&format=json&list=allimages&aiprefix=' + encodeURIComponent('卫戍协议_道具') + '&ailimit=200');
  const itemList = JSON.parse(apiItem).query.allimages || [];
  console.log('=== 道具图标共', itemList.length, '个 ===');
  for (const f of itemList) {
    const m = f.name.match(/^卫戍协议_道具_(.+)\.png$/);
    if (!m) continue;
    const name = m[1] + '.png';
    if (fs.existsSync(path.join(equipDir, name))) { console.log('已存在', name); continue; }
    try { const sz = await dl(f.url, path.join(equipDir, name)); console.log('下载', name, sz, 'bytes'); await sleep(250); }
    catch (e) { console.log('失败', name, e.message); }
  }
})();



