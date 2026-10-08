'use strict';
// 检查当前入口的本地 Markdown 文件链接；归档保留历史相对路径，不作为现行入口扫描。
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function markdownFiles(folder) {
  return fs.readdirSync(path.join(root, folder), {withFileTypes:true}).flatMap(item => {
    const name = folder + '/' + item.name;
    if (item.isSymbolicLink() || name === 'docs/archive') return [];
    return item.isDirectory() ? markdownFiles(name) : item.name.endsWith('.md') ? [name] : [];
  });
}
const currentDocs = markdownFiles('docs');
const files = ['README.md', 'AGENTS.md', 'assets/task/README.md', ...currentDocs,
  'docs/archive/README.md', 'docs/archive/20260913-cleanup/README.md',
  ...markdownFiles('.agents/skills')];
const graph = new Map(), anchorCache = new Map();
let links = 0;
const errors = [];
for (const file of files) {
  graph.set(path.resolve(root,file), []);
  const body = fs.readFileSync(path.join(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].trim().replace(/^<|>$/g, '');
    if (/^[a-z][a-z\d+.-]*:/i.test(href)) continue;
    const [name, fragment] = href.split('#');
    const target = path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(name || path.basename(file)));
    graph.get(path.resolve(root,file)).push(target);
    links++;
    if (!fs.existsSync(target)) { errors.push(file + ': missing ' + href); continue; }
    if (fragment && target.endsWith('.md')) {
      if (!anchorCache.has(target)) {
        const text = fs.readFileSync(target, 'utf8');
        const headings = [...text.matchAll(/^#+\s+(.+)$/gm)].map(m => m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-'));
        const anchors = [...text.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
        anchorCache.set(target, new Set([...headings, ...anchors]));
      }
      if (!anchorCache.get(target).has(decodeURIComponent(fragment))) errors.push(file + ': missing anchor ' + href);
    }
  }
}
// Every current document must be discoverable from the main navigation.
const reached = new Set(), pending = [path.resolve(root,'docs/README.md')];
while (pending.length) {
  const file = pending.pop();
  if (reached.has(file)) continue;
  reached.add(file);
  pending.push(...(graph.get(file)||[]));
}
for (const file of currentDocs) if (!reached.has(path.resolve(root,file))) errors.push(file + ': unreachable from docs/README.md');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('PASS ' + files.length + ' current documents, ' + links + ' local links (including anchors)');
