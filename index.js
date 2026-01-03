const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const ejs = require('ejs');
const beautify = require('js-beautify').html;
const yaml = require('js-yaml');
const minifyHtml = require('html-minifier').minify;
const CleanCSS = require('clean-css');
const Terser = require('terser');
const argv = require('minimist')(process.argv.slice(2));

const IS_MIN = argv.min || false;
let fileCount = 0;
let totalOriginalSize = 0;
let totalMinifiedSize = 0;
let compressedFileCount = 0;

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const colors = {
    info: (msg) => `\x1b[38;2;28;168;0mINFO\x1b[0m  ${msg}`,      // #1CA800
    time: (msg) => `\x1b[38;2;0;168;154m${msg}\x1b[0m`,          // #00A89A
    error: (msg) => `\x1b[38;2;162;30;41mERROR\x1b[0m ${msg}`,    // #A21E29
};

function writeFile(dest, content, PUB_DIR) {
    fs.writeFileSync(dest, content, 'utf8');
    const relPath = path.relative(PUB_DIR, dest);
    console.log(colors.info(`已生成: ${relPath}`));
    fileCount++;
}

function loadConfig() {
    console.log(colors.info('读取 Config'));
    const RUNDIR = process.cwd();
    const configPath = path.join(RUNDIR, '_config.yml');
    if (!fs.existsSync(configPath)) {
        throw new Error('未找到 _config.yml');
    }
    let cfg = yaml.load(fs.readFileSync(configPath, 'utf8'));
    if (!cfg.src || !cfg.public || !cfg.template || !cfg.domain) throw new Error('配置项不全');
    if (!cfg.ignore) cfg.ignore = [];
    return cfg;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cleanDirExceptGit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
        if (entry === '.git' || entry === '.gitignore') continue;
        fse.removeSync(path.join(dir, entry));
    }
}

async function minifyAssets(dir, PUB_DIR) {
    const files = fse.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            await minifyAssets(fullPath, PUB_DIR);
        } else {
            const ext = path.extname(file);
            if (!['.js', '.css', '.html'].includes(ext)) continue;

            const originalContent = fs.readFileSync(fullPath, 'utf8');
            const originalSize = Buffer.byteLength(originalContent);
            
            try {
                let minified = null;
                if (ext === '.js') {
                    const res = await Terser.minify(originalContent);
                    minified = res.code;
                } else if (ext === '.css') {
                    minified = new CleanCSS().minify(originalContent).styles;
                } else if (ext === '.html') {
                    minified = minifyHtml(originalContent, {
                        removeComments: true,
                        collapseWhitespace: true,
                        minifyJS: true,
                        minifyCSS: true
                    });
                }

                if (minified) {
                    const minSize = Buffer.byteLength(minified);
                    fs.writeFileSync(fullPath, minified);
                    
                    totalOriginalSize += originalSize;
                    totalMinifiedSize += minSize;
                    compressedFileCount++;

                    console.log(colors.info(`已压缩: ${path.relative(PUB_DIR, fullPath)}  ${formatSize(originalSize)} → ${colors.time(formatSize(minSize))}`));
                }
            } catch (e) {
                console.error(colors.error(`压缩失败: ${path.relative(PUB_DIR, fullPath)} | ${e.message}`));
            }
        }
    }
}

async function main() {
    const startTime = process.hrtime();
    const config = loadConfig();
    console.log(colors.info('开始处理'));
    
    const RUNDIR = process.cwd();
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
            const dest = path.join(PUB, entry);
            fse.copySync(path.join(SRC, entry), dest, { overwrite: true });
            if (fs.statSync(dest).isFile()) {
                console.log(colors.info(`已复制: ${entry}`));
                fileCount++;
            }
        }
    });

    const loadStart = process.hrtime();
    const games = loadGames(DATA_DIR);
    const loadDiff = process.hrtime(loadStart);
    const loadMs = (loadDiff[0] * 1e3 + loadDiff[1] / 1e6).toFixed(2);
    console.log(colors.info(`文件加载耗时 ${colors.time(loadMs + ' ms')}`));

    genHomePages(TPL, PUB, games, DOMAIN);
    genGamePages(TPL, PUB, games, DOMAIN);
    genGamesNameJson(DATA_DIR, API_DIR, PUB);
    genSearchJson(DATA_DIR, API_DIR, PUB);
    genSitemapXmlFromApi(API_DIR, PUB, DOMAIN);
    genRssXmlFromApi(API_DIR, PUB, DOMAIN);

    const genDiff = process.hrtime(startTime);
    const genSec = (genDiff[0] + genDiff[1] / 1e9).toFixed(2);
    console.log(colors.info(`已生成 ${colors.time(fileCount)} 个文件 ${colors.time(genSec + ' s')}`));

    if (IS_MIN) {
        console.log(colors.info('执行压缩中...'));
        const compressStart = process.hrtime();
        
        await minifyAssets(PUB, PUB);
        
        const compressDiff = process.hrtime(compressStart);
        const compressSec = (compressDiff[0] + compressDiff[1] / 1e9).toFixed(2);
        const ratio = totalOriginalSize > 0 ? ((totalMinifiedSize / totalOriginalSize) * 100).toFixed(2) : 100;

        console.log(colors.info(`已压缩 ${colors.time(compressedFileCount)} 个文件，用时 ${colors.time(compressSec + ' s')}`));
        console.log(colors.info(`原大小: ${formatSize(totalOriginalSize)}, 压缩后: ${colors.time(formatSize(totalMinifiedSize))}, 压缩率: ${colors.time(ratio + '%')}`));
    }
}

function loadGames(DATA_DIR) {
    if (!fs.existsSync(DATA_DIR)) return [];
    const games = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json'))
        .map(fn => {
            const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fn), 'utf-8'));
            if (!g.files || g.files.length === 0) {
                g.files = [
                    { name: "汉化版", path: `/swf/${g.dir}/${g.dir}汉化版.swf` },
                    { name: "原版", path: `/swf/${g.dir}/${g.dir}.swf` }
                ];
            }
            if (!g.DownFiles || g.DownFiles.length === 0) g.DownFiles = g.files;
            if (!g.cover) g.cover = `/images/${g.dir}/${g.dir}.webp`;
            return g;
        });
    games.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
    return games;
}

function renderTpl(tplDir, name, data) {
    const tplPath = path.join(tplDir, name + '.ejs');
    const rawHtml = ejs.render(fs.readFileSync(tplPath, 'utf-8'), data, { filename: tplPath });
    if (IS_MIN) return rawHtml;
    return beautify(rawHtml, { indent_size: 4, space_in_empty_tag: true, preserve_newlines: false });
}

function genHomePages(TPL, PUB, games, DOMAIN) {
    const PAGE_SIZE = 20;
    const totalPages = Math.ceil(games.length / PAGE_SIZE) || 1;
    for (let p = 1; p <= totalPages; p++) {
        const pageGames = games.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
        const html = renderTpl(TPL, 'home', { games: pageGames, page: p, totalPages: totalPages, domain: DOMAIN });
        const dest = path.join(PUB, p === 1 ? 'index.html' : `${p}.html`);
        writeFile(dest, html, PUB);
    }
}

function genGamePages(TPL, PUB, games, DOMAIN) {
    games.forEach(game => {
        let ruffleBase = game.base || "/swf/" + (game.title || '').replace(/[\/\\]/g, '') + "/";
        const html = renderTpl(TPL, 'game', { game, ruffleBase, domain: DOMAIN });
        const gameDir = path.join(PUB, game.dir);
        ensureDir(gameDir);
        writeFile(path.join(gameDir, 'index.html'), html, PUB);
    });
}

function genGamesNameJson(DATA_DIR, API_DIR, PUB) {
    ensureDir(API_DIR);
    const arr = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json'))
        .map(fn => {
            const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fn), 'utf-8'));
            return { id: g.id || "", name: g.title || "", desc: g.brief || "", time: g.pubDate || "" };
        });
    arr.sort((a, b) => Number(a.id) - Number(b.id));
    writeFile(path.join(API_DIR, 'games_name.json'), JSON.stringify(arr, null, IS_MIN ? 0 : 4), PUB);
}

function genSearchJson(DATA_DIR, API_DIR, PUB) {
    ensureDir(API_DIR);
    const arr = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json'))
        .map(fn => {
            const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fn), 'utf-8'));
            return { id: g.id || "", title: g.title || "", brief: g.brief || "", pubDate: g.pubDate || "", play: g.dir || "" };
        });
    arr.sort((a, b) => Number(a.id) - Number(b.id));
    writeFile(path.join(API_DIR, 'search.json'), JSON.stringify(arr, null, IS_MIN ? 0 : 4), PUB);
}

function convertToSitemapTime(timeString) {
    if (!timeString) return '';
    let d = new Date(timeString.replace(/-/g, '/'));
    return d.toISOString().replace('.000', '').replace('Z', '+00:00');
}

function genSitemapXmlFromApi(API_DIR, PUB, DOMAIN) {
    const dataPath = path.join(API_DIR, 'games_name.json');
    if(!fs.existsSync(dataPath)) return;
    const arr = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const n = IS_MIN ? "" : "\n";
    const s = IS_MIN ? "" : "  ";
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>${n}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${n}`;
    arr.forEach(item => {
        const url = `https://${DOMAIN}/Games/${encodeURIComponent(item.name)}`;
        const sitemapTime = convertToSitemapTime(item.time);
        xml += `${s}<url>${n}${s}${s}<loc>${url}</loc>${n}${s}${s}<lastmod>${sitemapTime}</lastmod>${n}${s}</url>${n}`;
    });
    xml += `</urlset>${n}`;
    writeFile(path.join(PUB, 'sitemap.xml'), xml, PUB);
}

function formatRssDate(timeString) {
    if (!timeString) return '';
    let d = new Date(timeString.replace(/-/g, '/'));
    return d.toUTCString();
}

function genRssXmlFromApi(API_DIR, PUB, DOMAIN) {
    const dataPath = path.join(API_DIR, 'games_name.json');
    if(!fs.existsSync(dataPath)) return;
    const arr = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const now = new Date().toUTCString();
    const n = IS_MIN ? "" : "\n";
    const s = IS_MIN ? "" : "  ";

    let xml = `<?xml version="1.0" encoding="UTF-8" ?>${n}<rss version="2.0">${n}${s}<channel>${n}`;
    xml += `${s}${s}<title>Flash收藏站</title>${n}${s}${s}<link>https://${DOMAIN}/</link>${n}`;
    xml += `${s}${s}<description>最新Flash游戏列表 RSS 订阅</description>${n}${s}${s}<language>zh-CN</language>${n}`;
    xml += `${s}${s}<lastBuildDate>${now}</lastBuildDate>${n}`;
    
    arr.forEach(item => {
        const link = `https://${DOMAIN}/Games/${encodeURIComponent(item.name)}`;
        const pubDate = item.time ? formatRssDate(item.time) : now;
        xml += `${s}${s}<item>${n}${s}${s}${s}<title>${item.title || item.name}</title>${n}`;
        xml += `${s}${s}${s}<link>${link}</link>${n}${s}${s}${s}<description>${item.desc || ""}</description>${n}`;
        xml += `${s}${s}${s}<pubDate>${pubDate}</pubDate>${n}${s}${s}</item>${n}`;
    });
    xml += `${s}</channel>${n}</rss>`;
    writeFile(path.join(PUB, 'rss.xml'), xml, PUB);
}

if (require.main === module) {
    main().catch(e => {
        console.error(colors.error(e && e.message || e));
        process.exit(1);
    });
}