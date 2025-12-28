const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const ejs = require('ejs');
const beautify = require('js-beautify').html;
const yaml = require('js-yaml');

function loadConfig() {
    const RUNDIR = process.cwd();
    const configPath = path.join(RUNDIR, '_config.yml');
    if (!fs.existsSync(configPath)) {
        throw new Error('未找到_config.yml');
    }
    let cfg = yaml.load(fs.readFileSync(configPath, 'utf8'));
    if (!cfg.src)         throw new Error('src未配置');
    if (!cfg.public)      throw new Error('public未配置');
    if (!cfg.template)    throw new Error('template未配置');
    if (!cfg.domain)      throw new Error('domain未配置');
    if (!cfg.ignore)      cfg.ignore = [];
    return cfg;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
}
function cleanDirExceptGit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
        if (entry === '.git' || entry === '.gitignore') continue;
        fse.removeSync(path.join(dir, entry));
    }
}

function main() {
    const RUNDIR = process.cwd();
    const config = loadConfig();
    const SRC = path.join(RUNDIR, config.src);
    const DATA_DIR = path.join(SRC, 'Game-data');
    const PUB = path.join(RUNDIR, config.public);
    const TPL = path.join(__dirname, config.template);
    const API_DIR = path.join(PUB, 'api');
    const IGNORE_LIST = new Set([...(config.ignore || []), 'Game-data']);
    const DOMAIN = config.domain.replace(/^https?:\/\//, '');

    if (!fs.existsSync(DATA_DIR)) throw new Error(`未找到 ${config.src}/Game-data/`);

    ensureDir(PUB);
    cleanDirExceptGit(PUB);

    fs.readdirSync(SRC).forEach(entry => {
        if (!IGNORE_LIST.has(entry)) {
            const srcPath = path.join(SRC, entry);
            const outPath = path.join(PUB, entry);
            fse.copySync(srcPath, outPath, { overwrite: true });
        }
    });

    const games = loadGames(DATA_DIR);
    genHomePages(TPL, PUB, games);
    genGamePages(TPL, PUB, games);
    genGamesNameJson(DATA_DIR, API_DIR);
    genSitemapXmlFromApi(API_DIR, PUB, DOMAIN);
    genRssXmlFromApi(API_DIR, PUB, DOMAIN);

    console.log('output', PUB);
}

function loadGames(DATA_DIR) {
    if (!fs.existsSync(DATA_DIR)) return [];
    const all = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const games = all.map(fn => {
        const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fn), 'utf-8'));
        if (!g.files || g.files.length === 0) {
            console.warn(`WARN: Game data for ${g.dir} is missing 'files'. Creating default structure.`);
            g.files = [];
            g.files.push({ name: "汉化版", path: `/swf/${g.dir}/${g.dir}汉化版.swf` });
            g.files.push({ name: "原版", path: `/swf/${g.dir}/${g.dir}.swf` });
        }
        if (!g.DownFiles || g.DownFiles.length === 0) {
            g.DownFiles = g.files;
        }

        if (!g.cover) {
            g.cover = `/images/${g.dir}/${g.dir}.webp`;
        }
        return g;
    });
    games.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
    return games;
}

function renderTpl(tplDir, name, data) {
    const tplPath = path.join(tplDir, name + '.ejs');
    const rawHtml = ejs.render(fs.readFileSync(tplPath, 'utf-8'), data, { filename: tplPath });
    return beautify(rawHtml, {
        indent_size: 4,
        space_in_empty_tag: true,
        preserve_newlines: false
    });
}

function genHomePages(TPL, PUB, games) {
    const PAGE_SIZE = 20;
    const totalPages = Math.ceil(games.length / PAGE_SIZE) || 1;
    for (let p = 1; p <= totalPages; p++) {
        const pageGames = games.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
        const html = renderTpl(TPL, 'home', { games: pageGames, page: p, totalPages: totalPages });
        const file = path.join(PUB, p === 1 ? 'index.html' : `${p}.html`);
        ensureDir(PUB);
        fs.writeFileSync(file, html, 'utf-8');
    }
}

function genGamePages(TPL, PUB, games) {
    games.forEach(game => {
        let ruffleBase = "/swf/" + (game.title || '').replace(/[\/\\]/g, '') + "/";
        if (game.base) ruffleBase = game.base;
        const html = renderTpl(TPL, 'game', { game, ruffleBase });
        const gameDir = path.join(PUB, game.dir);
        ensureDir(gameDir);
        fs.writeFileSync(path.join(gameDir, 'index.html'), html, 'utf-8');
    });
}

function genGamesNameJson(DATA_DIR, API_DIR) {
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

function convertToSitemapTime(timeString) {
    if (!timeString) return '';
    let d = new Date(timeString.replace(/-/g, '/'));
    return d.toISOString().replace('.000', '').replace('Z', '+00:00');
}
function genSitemapXmlFromApi(API_DIR, PUB, DOMAIN) {
    ensureDir(PUB);
    const arr = JSON.parse(fs.readFileSync(path.join(API_DIR, 'games_name.json'), 'utf-8'));
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    arr.forEach(item => {
        const name = item.name;
        const time = item.time;
        const url = `https://${DOMAIN}/Games/${encodeURIComponent(name)}`;
        const sitemapTime = convertToSitemapTime(time);
        xml += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${sitemapTime}</lastmod>\n  </url>\n`;
    });
    xml += '</urlset>\n';
    fs.writeFileSync(path.join(PUB, 'sitemap.xml'), xml, 'utf8');
}

function formatRssDate(timeString) {
    if (!timeString) return '';
    let d = new Date(timeString.replace(/-/g, '/'));
    return d.toUTCString();
}
function genRssXmlFromApi(API_DIR, PUB, DOMAIN) {
    ensureDir(PUB);
    const arr = JSON.parse(fs.readFileSync(path.join(API_DIR, 'games_name.json'), 'utf-8'));
    function getCurrentTime() { return new Date().toUTCString(); }
    let xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0">\n  <channel>\n`;
    xml += `    <title>Flash收藏站</title>\n`;
    xml += `    <link>https://${DOMAIN}/</link>\n`;
    xml += `    <description>最新Flash游戏列表 RSS 订阅</description>\n`;
    xml += `    <language>zh-CN</language>\n`;
    xml += `    <lastBuildDate>${getCurrentTime()}</lastBuildDate>\n`;
    arr.forEach(item => {
        const name = item.name;
        const desc = item.desc;
        const link = `https://${DOMAIN}/Games/${encodeURIComponent(name)}`;
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

if (require.main === module) {
    try {
        main();
    } catch (e) {
        console.error('error:', e && e.message || e);
        process.exit(1);
    }
}