const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const ejs = require('ejs');
const beautify = require('js-beautify').html;
const RUNDIR = process.cwd();
const SRC = path.join(RUNDIR, 'source');
const DATA_DIR = path.join(SRC, 'Game-data');
const PUB = path.join(RUNDIR, 'public');
const TPL = path.join(__dirname, 'layout');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
}
function loadGames() {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }
  const all = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const games = all.map(fn => {
      const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fn), 'utf-8'));
      if (!g.files || g.files.length === 0) {
          console.warn(`WARN: Game data for ${g.dir} is missing 'files'. Creating default structure.`);
          g.files = [];
          g.files.push({
              name: "汉化版",
              path: `/swf/${g.dir}/${g.dir}汉化版.swf`
          });
          g.files.push({
              name: "原版",
              path: `/swf/${g.dir}/${g.dir}.swf`
          });
      }
      if (!g.cover) {
          g.cover = `//Games/mock/${g.dir}.jpg`;
      }
      return g;
  });
  games.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  return games;
}
function renderTpl(tpl, data) {
    const tplPath = path.join(TPL, tpl + '.ejs');
    // 初步渲染
    const rawHtml = ejs.render(fs.readFileSync(tplPath, 'utf-8'), data, { filename: tplPath });
    // 格式化HTML
    const formattedHtml = beautify(rawHtml, {
      indent_size: 4, // 4空缩进
      space_in_empty_tag: true,
      preserve_newlines: false // 多余换行符
    });
    // 返回
    return formattedHtml;
  }
function genHomePages(games) {
  const PAGE_SIZE = 18;
  const totalPages = Math.ceil(games.length / PAGE_SIZE);
  if (totalPages === 0) totalPages = 1;
  for (let p = 1; p <= totalPages; p++) {
    const pageGames = games.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    const html = renderTpl('home', { games: pageGames, page: p, totalPages: totalPages }); // 传递给模板
    const file = path.join(PUB, p === 1 ? 'index.html' : `${p}.html`);
    ensureDir(PUB);
    fs.writeFileSync(file, html, 'utf-8');
  }
}
function genGamePages(games) {
  games.forEach(game => {
    const html = renderTpl('game', { game });
    const gameDir = path.join(PUB, game.dir);
    ensureDir(gameDir);
    fs.writeFileSync(path.join(gameDir, 'index.html'), html, 'utf-8');
  });
}
function copyAssets() {
  const ignore = new Set(['Game-data']);
  fs.readdirSync(SRC).forEach(entry => {
    if (!ignore.has(entry)) {
      const srcPath = path.join(SRC, entry);
      const outPath = path.join(PUB, entry);
      fse.copySync(srcPath, outPath, { overwrite: true });
    }
  });
}
function main() {
  if (!fs.existsSync(DATA_DIR)) throw new Error('未找到 source/Game-data/');
  fse.removeSync(PUB);
  ensureDir(PUB);
  copyAssets();
  const games = loadGames();
  genHomePages(games);
  genGamePages(games);
  console.log('生成完成：public 目录下。');
}

main();