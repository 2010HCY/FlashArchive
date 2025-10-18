// 模块
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const ejs = require('ejs');
const beautify = require('js-beautify').html;

// 目录
const RUNDIR = process.cwd();
const SRC = path.join(RUNDIR, 'source');
const DATA_DIR = path.join(SRC, 'Game-data');
const PUB = path.join(RUNDIR, 'public');
const TPL = path.join(__dirname, 'layout');
const API_DIR = path.join(PUB, 'api');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
}

// 加载JSON
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
          g.cover = `//images/${g.dir}/${g.dir}.webp`;
      }
      return g;
  });
  games.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  return games;
}

// 渲染
function renderTpl(tpl, data) {
    const tplPath = path.join(TPL, tpl + '.ejs');
    // 渲染
    const rawHtml = ejs.render(fs.readFileSync(tplPath, 'utf-8'), data, { filename: tplPath });
    // 格式化
    const formattedHtml = beautify(rawHtml, {
      indent_size: 4,
      space_in_empty_tag: true,
      preserve_newlines: false
    });
    return formattedHtml;
}

// 首页、分页
function genHomePages(games) {
  const PAGE_SIZE = 18;
  const totalPages = Math.ceil(games.length / PAGE_SIZE);
  if (totalPages === 0) totalPages = 1;
  for (let p = 1; p <= totalPages; p++) {
    const pageGames = games.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    const html = renderTpl('home', { games: pageGames, page: p, totalPages: totalPages });
    const file = path.join(PUB, p === 1 ? 'index.html' : `${p}.html`);
    ensureDir(PUB);
    fs.writeFileSync(file, html, 'utf-8');
  }
}

// 为每个游戏生成游戏详情页
function genGamePages(games) {
  games.forEach(game => {
    const html = renderTpl('game', { game });
    const gameDir = path.join(PUB, game.dir);
    ensureDir(gameDir);
    fs.writeFileSync(path.join(gameDir, 'index.html'), html, 'utf-8');
  });
}

// 静态资源拷贝
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

// games_name.json
function genGamesNameJson() {
  ensureDir(API_DIR);
  const allFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const arr = allFiles.map(fn => {
      const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fn),'utf-8'));
      return {
          id: g.id || "",
          name: g.title || "",
          desc: g.brief || "",
          time: g.pubDate || ""
      };
  });
  arr.sort((a, b) => Number(a.id) - Number(b.id));
  fs.writeFileSync(path.join(API_DIR, 'games_name.json'), JSON.stringify(arr, null, 4), 'utf8');
}

// sitemap.xml
function convertToSitemapTime(timeString) {
    if (!timeString) return '';
    let d = new Date(timeString.replace(/-/g, '/'));
    return d.toISOString().replace('.000', '').replace('Z', '+00:00');
}
function genSitemapXmlFromApi() {
    ensureDir(PUB);
    const arr = JSON.parse(fs.readFileSync(path.join(API_DIR, 'games_name.json'), 'utf-8'));
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    arr.forEach(item => {
        const name = item.name;
        const time = item.time;
        const url = "https://flash.hcyhub.com/Games/" + name;
        const sitemapTime = convertToSitemapTime(time);
        xml += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${sitemapTime}</lastmod>\n  </url>\n`;
    });
    xml += '</urlset>\n';
    fs.writeFileSync(path.join(PUB, 'sitemap.xml'), xml, 'utf8');
}

// rss.xml
function formatRssDate(timeString) {
    if (!timeString) return '';
    let d = new Date(timeString.replace(/-/g, '/'));
    return d.toUTCString();
}
function genRssXmlFromApi() {
    ensureDir(PUB);
    const arr = JSON.parse(fs.readFileSync(path.join(API_DIR, 'games_name.json'), 'utf-8'));
    function getCurrentTime() {
        return new Date().toUTCString();
    }
    let xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0">\n  <channel>\n`;
    xml += `    <title>Flash收藏站</title>\n`;
    xml += `    <link>https://flash.hcyhub.com/</link>\n`;
    xml += `    <description>最新Flash游戏列表 RSS 订阅</description>\n`;
    xml += `    <language>zh-CN</language>\n`;
    xml += `    <lastBuildDate>${getCurrentTime()}</lastBuildDate>\n`;
    arr.forEach(item => {
        const name = item.name;
        const desc = item.desc;
        const link = "https://flash.hcyhub.com/Games/" + name;
        const pubDate = item.time ? formatRssDate(item.time) : getCurrentTime();
        xml += `    <item>\n`;
        xml += `      <title>${name}</title>\n`;
        xml += `      <link>${link}</link>\n`;
        xml += `      <description>${desc}</description>\n`;
        xml += `      <pubDate>${pubDate}</pubDate>\n`;
        xml += `    </item>\n`;
    });
    xml += `  </channel>\n</rss>\n`;
    fs.writeFileSync(path.join(PUB, 'rss.xml'), xml, 'utf8');
}

// 主流程
function main() {
  if (!fs.existsSync(DATA_DIR)) throw new Error('未找到 source/Game-data/');
  fse.removeSync(PUB);
  ensureDir(PUB);

  copyAssets();                  // 静态资源
  const games = loadGames();     // 游戏完整数据
  genHomePages(games);           // 首页/分页
  genGamePages(games);           // 游戏详情页
  genGamesNameJson();            // games_name.json
  genSitemapXmlFromApi();        // sitemap.xml
  genRssXmlFromApi();            // rss.xml

  console.log('已输出至public');
}
main();