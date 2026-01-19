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
const chokidar = require('chokidar');
const http = require('http');
const handler = require('serve-handler');

const IS_MIN = argv.min || false;
let fileCount = 0;
let totalOriginalSize = 0;
let totalMinifiedSize = 0;
let compressedFileCount = 0;
let GLOBAL_CONFIG = {};

// 统计数据缓存
let CACHED_STATS = {
    totalCount: 0, totalSize: '0 B', maxFileSize: '0 B', avgSize: '0 B',
    authors: 0, translators: 0
};

// 模板影响范围映射
const TEMPLATE_AFFECT = {
    'game.ejs': 'game',
    'home.ejs': 'home',
    'about.ejs': 'about',
    '404.ejs': '404',
    'friend.ejs': 'friend',
    'author.ejs': 'author',
    'author-games.ejs': 'author-games'
};


function updateSwfStats(SRC_DIR) {
    const swfRoot = path.join(SRC_DIR, 'swf');
    let totalBytes = 0, swfFileCount = 0, maxBytes = 0;

    if (fs.existsSync(swfRoot)) {
        const scanDir = (dir) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) scanDir(fullPath);
                else if (file.toLowerCase().endsWith('.swf')) {
                    swfFileCount++;
                    totalBytes += stat.size;
                    if (stat.size > maxBytes) maxBytes = stat.size;
                }
            });
        };
        scanDir(swfRoot);
    }
    CACHED_STATS.totalCount = swfFileCount;
    CACHED_STATS.totalSize = formatSize(totalBytes);
    CACHED_STATS.maxFileSize = formatSize(maxBytes);
    CACHED_STATS.avgSize = formatSize(swfFileCount > 0 ? totalBytes / swfFileCount : 0);
}

function updateAuthorStats(games) {
    const authors = new Set();
    const cnAuthors = new Set();
    
    const ignoreList = ['无'];

    games.forEach(g => {
        if (g['Author']) {
            g['Author'].split(',').forEach(a => {
                const name = a.trim();
                if (name && !ignoreList.includes(name)) {
                    authors.add(name);
                }
            });
        }
        
        if (g['CN-Author']) {
            g['CN-Author'].split(',').forEach(a => {
                const name = a.trim();
                if (name && !ignoreList.includes(name)) {
                    cnAuthors.add(name);
                }
            });
        }
    });

    CACHED_STATS.authors = authors.size;
    CACHED_STATS.translators = cnAuthors.size;
}

function formatSize(bytes) {
    if (bytes === 0) return { value: '0', unit: 'B' };
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return {
        value: parseFloat((bytes / Math.pow(k, i)).toFixed(2)),
        unit: sizes[i]
    };
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
        const fullPath = path.join(dir, entry);
        
        const stat = fs.lstatSync(fullPath); 
        if (stat.isSymbolicLink()) {
            fs.unlinkSync(fullPath);
        } else if (stat.isDirectory()) {
            fse.removeSync(fullPath);
        } else {
            fs.unlinkSync(fullPath);
        }
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

                    const oldS = formatSize(originalSize);
                    const newS = formatSize(minSize);
                    console.log(colors.info(`已压缩: ${path.relative(PUB_DIR, fullPath)}  ${oldS.value}${oldS.unit} → ${colors.time(`${newS.value}${newS.unit}`)}`));
                }
            } catch (e) {
                console.error(colors.error(`压缩失败: ${path.relative(PUB_DIR, fullPath)} | ${e.message}`));
            }
        }
    }
}

async function main() {
    const startTime = process.hrtime();
    GLOBAL_CONFIG = loadConfig();
    const IS_WATCH = argv.s || argv.serve;
    const MUST_MIN = argv.min || argv.m || false;

    const RUNDIR = process.cwd();
    const SRC = path.join(RUNDIR, GLOBAL_CONFIG.src);
    const DATA_DIR = path.join(SRC, 'Game-data');
    const PUB = path.join(RUNDIR, GLOBAL_CONFIG.public);
    const TPL = path.join(__dirname, GLOBAL_CONFIG.template);
    const API_DIR = path.join(PUB, 'api');
    const DOMAIN = GLOBAL_CONFIG.domain.replace(/^https?:\/\//, '');

    console.log(colors.info('开始处理'));

    ensureDir(PUB);
    cleanDirExceptGit(PUB);

    const IGNORE_LIST = new Set([...(GLOBAL_CONFIG.ignore || []), 'Game-data']);
    fs.readdirSync(SRC).forEach(entry => {
        if (IGNORE_LIST.has(entry)) return;

        const srcPath = path.join(SRC, entry);
        const destPath = path.join(PUB, entry);

        if (entry === 'swf') {
            if (fs.existsSync(destPath)) {
                const dStat = fs.lstatSync(destPath);
                if (dStat.isSymbolicLink() || (process.platform === 'win32' && dStat.isDirectory())) {
                    fse.removeSync(destPath); 
                }
            }
            
            const type = process.platform === "win32" ? 'junction' : 'dir';
            try {
                fs.symlinkSync(srcPath, destPath, type);
                console.log(colors.info(`已建立软链接: ${entry} -> ${srcPath}`));
            } catch (e) {
                console.error(colors.error(`软链接建立失败: ${e.message}`));
            }
        } else {
            fse.copySync(srcPath, destPath, { overwrite: true });
            
            if (fs.statSync(destPath).isFile()) {
                fileCount++;
            } else {
                const countFiles = (dir) => {
                    fs.readdirSync(dir).forEach(f => {
                        const p = path.join(dir, f);
                        if (fs.statSync(p).isFile()) fileCount++;
                        else countFiles(p);
                    });
                };
                countFiles(destPath);
            }
        }
    });

    const loadStart = process.hrtime();
    const games = loadGames(DATA_DIR);
    updateSwfStats(SRC);
    updateAuthorStats(games);
    const loadMs = (process.hrtime(loadStart)[0] * 1e3 + process.hrtime(loadStart)[1] / 1e6).toFixed(2);
    console.log(colors.info(`文件加载耗时 ${colors.time(loadMs + ' ms')}`));

    genHomePages(TPL, PUB, games, DOMAIN);
    games.forEach(g => genGamePages(TPL, PUB, g, DOMAIN));
    gen404Page(TPL, PUB, DOMAIN);
    genAboutPage(TPL, PUB, DOMAIN);
    genFriendPage(TPL, PUB, DOMAIN);
    genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'author');
    genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'translator');
    genGamesNameJson(DATA_DIR, API_DIR, PUB);
    genSearchJson(DATA_DIR, API_DIR, PUB);
    genSitemapXml(PUB, DOMAIN, games);
    genRssXml(PUB, DOMAIN, games);


    const genSec = (process.hrtime(startTime)[0] + process.hrtime(startTime)[1] / 1e9).toFixed(2);
    console.log(colors.info(`已生成 ${colors.time(fileCount)} 个文件 ${colors.time(genSec + ' s')}`));

    if (MUST_MIN) {
        const compressStart = process.hrtime();
        console.log(colors.info('执行压缩中...'));
        await minifyAssets(PUB, PUB);
    
        const compressDiff = process.hrtime(compressStart);
        const compressSec = (compressDiff[0] + compressDiff[1] / 1e9).toFixed(2);
        const ratio = totalOriginalSize > 0 ? ((totalMinifiedSize / totalOriginalSize) * 100).toFixed(2) : 100;
        const oldTotal = formatSize(totalOriginalSize);
        const newTotal = formatSize(totalMinifiedSize);
        console.log(colors.info(`已压缩 ${colors.time(compressedFileCount)} 个文件，用时 ${colors.time(compressSec + ' s')}`));
        console.log(colors.info(`原大小: ${oldTotal.value}${oldTotal.unit}, 压缩后: ${colors.time(`${newTotal.value}${newTotal.unit}`)}, 压缩率: ${colors.time(ratio + '%')}`));
    }

    if (IS_WATCH) {
        const port = GLOBAL_CONFIG.port || 3000;
        const server = http.createServer((request, response) => {
            return handler(request, response, {
                public: PUB,
                cleanUrls: true,
                directoryListing: false,
                index: ['index.html']
            });
        });

        server.listen(port, '::', () => {
            console.log(colors.info(`Server is running at ${colors.time(`http://localhost:${port}/`)}`));
        });

        const watcher = chokidar.watch([SRC, TPL], {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });
        watcher.on('all', async (event, filePath) => {
            try {
                function findGamePageIndex(games, gameDir, pageSize) {
                    const index = games.findIndex(g => g.dir === gameDir);
                    if (index === -1) return null;
                    return Math.floor(index / pageSize) + 1;
                }

                // JSON更新
                if (filePath.endsWith('.json') && filePath.includes('Game-data')) {
                    const game = loadSingleGame(filePath);
                    genGamePages(TPL, PUB, game, DOMAIN);
                    const games = loadGames(DATA_DIR);
                    updateAuthorStats(games);
                    genSitemapXml(PUB, DOMAIN, games);
                    genRssXml(PUB, DOMAIN, games);
                    const PAGE_SIZE = 20;
                    const page = findGamePageIndex(games, game.dir, PAGE_SIZE);
                    if (page !== null) {
                        const pageGames = games.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
                        const html = renderTpl(TPL, 'home', {
                            games: pageGames,
                            page: page,
                            totalPages: Math.ceil(games.length / PAGE_SIZE),
                            domain: DOMAIN
                        });
                        const dest = path.join(PUB, page === 1 ? 'index.html' : `${page}.html`);
                        writeFile(dest, html, PUB);
                    }
                    return;
                }

                // 模板
                if (filePath.endsWith('.ejs')) {
                    const tplName = path.basename(filePath);
                    const affect = TEMPLATE_AFFECT[tplName];
                    const games = loadGames(DATA_DIR);

                    if (affect === 'game') {
                        games.forEach(g => genGamePages(TPL, PUB, g, DOMAIN));
                    } 
                    else if (affect === 'home') {
                        genHomePages(TPL, PUB, games, DOMAIN);
                    } 
                    else if (affect === 'about') {
                        updateSwfStats(SRC);
                        genAboutPage(TPL, PUB, DOMAIN);
                    }
                    else if (affect === 'friend') {
                        genFriendPage(TPL, PUB, DOMAIN);
                    }
                    else if (affect === 'author' || affect === 'author-games') {
                        genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'author');
                        genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'translator');
                    }
                    return;
                }

                // swf 变更
                if (filePath.includes(path.join('swf'))) {
                    updateSwfStats(SRC);
                    genAboutPage(TPL, PUB, DOMAIN);
                }
            } catch (err) {
                console.error(colors.error(`热更新失败: ${err.message}`));
            }
        });
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

function genGamePages(TPL, PUB, game, DOMAIN) {
    let ruffleBase = game.base || "/swf/" + (game.title || '').replace(/[\/\\]/g, '') + "/";
    const html = renderTpl(TPL, 'game', { game, ruffleBase, domain: DOMAIN });
    const gameDir = path.join(PUB, game.dir);
    ensureDir(gameDir);
    writeFile(path.join(gameDir, 'index.html'), html, PUB);
}

function loadSingleGame(jsonPath) {
    const g = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    if (!g.files || g.files.length === 0) {
        g.files = [
            { name: "汉化版", path: `/swf/${g.dir}/${g.dir}汉化版.swf` },
            { name: "原版", path: `/swf/${g.dir}/${g.dir}.swf` }
        ];
    }
    if (!g.DownFiles || g.DownFiles.length === 0) g.DownFiles = g.files;
    if (!g.cover) g.cover = `/images/${g.dir}/${g.dir}.webp`;
    return g;
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

function gen404Page(TPL, PUB, DOMAIN) {
    const html = renderTpl(TPL, '404', { domain: DOMAIN, pageType: '404' });
    writeFile(path.join(PUB, '404.html'), html, PUB);
}

function genAboutPage(TPL, PUB, DOMAIN) {
    const html = renderTpl(TPL, 'about', { 
        domain: DOMAIN, 
        pageType: 'about',
        stats: CACHED_STATS 
    });
    
    const aboutDir = path.join(PUB, 'about');
    ensureDir(aboutDir);
    writeFile(path.join(aboutDir, 'index.html'), html, PUB);
}

function getCleanNames(str) {
    const ignoreList = ['无', '未知'];
    if (!str) return [];
    return str.split(',')
        .map(a => a.trim())
        .filter(name => name && !ignoreList.includes(name));
}

function genPeopleIndexPage(TPL, PUB, games, DOMAIN, type) {
    const isAuthor = type === 'author';
    const folder = isAuthor ? 'authors' : 'translators';
    const titlePrefix = isAuthor ? '游戏作者' : '汉化者';
    const PAGE_SIZE = 20;

    const peopleMap = {};
    games.forEach(g => {
        const names = isAuthor ? getCleanNames(g['Author']) : getCleanNames(g['CN-Author']);
        names.forEach(name => {
            if (!peopleMap[name]) peopleMap[name] = [];
            peopleMap[name].push(g);
        });
    });

    const allNames = Object.keys(peopleMap).sort((a, b) => 
        peopleMap[b].length - peopleMap[a].length || a.localeCompare(b, 'zh-Hans-CN')
    );

    const indexList = allNames.map(name => ({ name, count: peopleMap[name].length }));
    const indexHtml = renderTpl(TPL, 'author', {
        list: indexList,
        type: type,
        title: `${titlePrefix}列表`,
        domain: DOMAIN,
        pageType: folder,
        personName: "",
        personType: type
    });
    const indexDir = path.join(PUB, folder);
    ensureDir(indexDir);
    writeFile(path.join(indexDir, 'index.html'), indexHtml, PUB);

    allNames.forEach(name => {
        const personGames = peopleMap[name];
        const totalPages = Math.ceil(personGames.length / PAGE_SIZE) || 1;
        const personDir = path.join(indexDir, name);
        ensureDir(personDir);

        for (let p = 1; p <= totalPages; p++) {
            const pageGames = personGames.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
            
            const html = renderTpl(TPL, 'author-games', { 
                games: pageGames, 
                page: p, 
                totalPages: totalPages, 
                domain: DOMAIN,
                title: `${name} 的作品`,
                pageType: 'author-games', 
                personName: name,
                personType: type
            });

            const dest = path.join(personDir, p === 1 ? 'index.html' : `${p}.html`);
            writeFile(dest, html, PUB);
        }
    });
}

function genFriendPage(TPL, PUB, DOMAIN) {
    const RUNDIR = process.cwd();
    const friendsPath = path.join(RUNDIR, 'friends.yml');
    let friendsData = { MySite: [], others: [] };
    
    if (fs.existsSync(friendsPath)) {
        try {
            const loaded = yaml.load(fs.readFileSync(friendsPath, 'utf8'));
            if (loaded) friendsData = loaded;
        } catch (e) {
            console.error(colors.error(`friends.yml 解析失败: ${e.message}`));
        }
    }

    const html = renderTpl(TPL, 'friend', { 
        domain: DOMAIN,
        site: {
            data: {
                friends: friendsData
            }
        },
        page: {
            content: "" 
        },
        '__': function(key) {
            const trans = { 'friends': '友情链接' };
            return trans[key] || key;
        }
    });
    
    const friendDir = path.join(PUB, 'friend');
    ensureDir(friendDir);
    writeFile(path.join(friendDir, 'index.html'), html, PUB);
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

function formatDate(timeString, type) {
    if (!timeString) return '';
    const d = new Date(timeString.replace(/-/g, '/'));
    if (type === 'rss') return d.toUTCString();
    if (type === 'sitemap') return d.toISOString().replace('.000', '').replace('Z', '+00:00');
}

function genSitemapXml(PUB, DOMAIN, games) {
    const n = IS_MIN ? "" : "\n";
    const s = IS_MIN ? "" : "  ";

    let xml = `<?xml version="1.0" encoding="UTF-8"?>${n}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${n}`;
    games.forEach(g => {
        const url = `https://${DOMAIN}/${g.dir}/`;
        const lastmod = formatDate(g.pubDate);
        xml += `${s}<url>${n}${s}${s}<loc>${url}</loc>${n}${s}${s}<lastmod>${lastmod}</lastmod>${n}${s}</url>${n}`;
    });
    xml += `</urlset>${n}`;
    writeFile(path.join(PUB, 'sitemap.xml'), xml, PUB);
}

function genRssXml(PUB, DOMAIN, games) {
    const now = new Date().toUTCString();
    const n = IS_MIN ? "" : "\n";
    const s = IS_MIN ? "" : "  ";

    let xml = `<?xml version="1.0" encoding="UTF-8" ?>${n}<rss version="2.0">${n}${s}<channel>${n}`;
    xml += `${s}${s}<title>Flash收藏站</title>${n}`;
    xml += `${s}${s}<link>https://${DOMAIN}/</link>${n}`;
    xml += `${s}${s}<description>最新Flash游戏列表 RSS 订阅</description>${n}`;
    xml += `${s}${s}<lastBuildDate>${now}</lastBuildDate>${n}`;

    games.forEach(g => {
        const link = `https://${DOMAIN}/${g.dir}/`;
        const pubDate = g.pubDate ? formatDate(g.pubDate) : now;
        xml += `${s}${s}<item>${n}`;
        xml += `${s}${s}${s}<title>${g.title}</title>${n}`;
        xml += `${s}${s}${s}<link>${link}</link>${n}`;
        xml += `${s}${s}${s}<description>${g.brief || ""}</description>${n}`;
        xml += `${s}${s}${s}<pubDate>${pubDate}</pubDate>${n}`;
        xml += `${s}${s}</item>${n}`;
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