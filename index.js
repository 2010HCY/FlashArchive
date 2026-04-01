const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const ejs = require('ejs');
const beautify = require('js-beautify').html;
const yaml = require('js-yaml');
const minifyHtml = require('html-minifier').minify;
const CleanCSS = require('clean-css');
const Terser = require('terser');
const rawArgs = process.argv.slice(2);
const argv = require('minimist')(rawArgs, { boolean: ['debug', 's', 'serve', 'm', 'min'] });
const DEBUG_MODE = argv.debug || argv.d || rawArgs.includes('-debug') || rawArgs.includes('--debug');
const chokidar = require('chokidar');
const http = require('http');
const handler = require('serve-handler');
const crypto = require('crypto');
const sharp = require('sharp');

const RUNDIR = process.cwd();
const IS_MIN = argv.min || argv.m || false;
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
let TEMPLATE_AFFECT = {};
let IGNORE_LIST = new Set();

// ============ 首页缩略图模块 ============

// 图片文件扩展名
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif']);

// 检查是否为图片文件
function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
}

// 加载或初始化数据库
function loadImageDB(RUNDIR) {
    const dbPath = path.join(RUNDIR, 'db.json');
    if (!fs.existsSync(dbPath)) {
        return { sourceHashes: {}, imageHashes: {}, miniHashes: {} };
    }
    try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return {
            sourceHashes: data.sourceHashes || {},
            imageHashes: data.imageHashes || {},
            miniHashes: data.miniHashes || {}
        };
    } catch (e) {
        console.error(colors.error(`读取 db.json 失败: ${e.message}`));
        return { sourceHashes: {}, imageHashes: {}, miniHashes: {} };
    }
}

// 保存数据库
function saveImageDB(RUNDIR, db) {
    const dbPath = path.join(RUNDIR, 'db.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

// 计算文件哈希值
function getFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (e) {
        return null;
    }
}

// 获取目录下文件的哈希映射
// onlyImages=false: 返回所有文件（除 Game-data 目录）；true：仅返回图片文件
function getDirectoryHashes(dir, onlyImages = false) {
    const hashes = {};
    if (!fs.existsSync(dir)) return hashes;
    
    const scanDir = (currentDir, relativePath = '') => {
        try {
            const files = fs.readdirSync(currentDir);
            files.forEach(file => {
                const fullPath = path.join(currentDir, file);
                const relPath = relativePath ? path.join(relativePath, file) : file;
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    scanDir(fullPath, relPath);
                } else {
                    if (onlyImages && !isImageFile(file)) return;
                    if (!onlyImages && relPath.startsWith('Game-data')) return;

                    const hash = getFileHash(fullPath);
                    if (hash) hashes[relPath.replace(/\\/g, '/')] = hash;
                }
            });
        } catch (e) {
            console.error(colors.error(`扫描目录失败 ${currentDir}: ${e.message}`));
        }
    };
    
    scanDir(dir);
    return hashes;
}

// 处理单个图片
async function processImage(sourcePath, outputPath, miniPath) {
    try {
        const metadata = await sharp(sourcePath).metadata();
        const { width, height } = metadata;
        
        // 确保输出目录存在
        ensureDir(path.dirname(outputPath));
        ensureDir(path.dirname(miniPath));
        
        // 复制原图到 public/images（保持原格式）
        await fse.copy(sourcePath, outputPath);
        
        // 处理缩略图：统一输出为 webp
        if (width > 660 || height > 390) {
            // 大于 660×390 的图片：缩放到 660×390 后输出 webp（不缩放）
            await sharp(sourcePath)
                .resize(660, 390, {
                    fit: 'cover',
                    position: 'center',
                    kernel: sharp.kernel.lanczos3,
                    withoutEnlargement: true
                })
                .webp({ quality: 80, effort: 6 })
                .toFile(miniPath);
        } else {
            // 小于等于 660×390 的图片：直接转为 webp（不缩放）
            await sharp(sourcePath)
                .webp({ quality: 80, effort: 6 })
                .toFile(miniPath);
        }
        
        return true;
    } catch (e) {
        console.error(colors.error(`处理图片失败 ${path.basename(sourcePath)}: ${e.message}`));
        return false;
    }
}

// 处理所有图片
async function processAllImages(RUNDIR, SRC, PUB, db = null) {
    const startTime = process.hrtime();
    const sourceDir = path.join(SRC, 'images');
    const outputDir = path.join(PUB, 'images');
    const miniDir = path.join(outputDir, 'mini');
    
    if (!fs.existsSync(sourceDir)) {
        console.log(colors.info('未找到 source/images 目录，跳过图片处理'));
        return;
    }
    
    console.log(colors.info('开始处理图片...'));
    
    if (!db) db = loadImageDB(RUNDIR);
    
    // 获取源目录的文件哈希（仅图片）
    const newSourceHashes = getDirectoryHashes(sourceDir, true);
    const oldSourceHashes = db.imageHashes || {};

    if (Object.keys(newSourceHashes).length === 0) {
        console.log(colors.info('未找到任何图片文件'));
        return;
    }
    
    // 获取旧的 mini 哈希（用于检查 mini 文件是否存在）
    const oldMiniHashes = db.miniHashes || {};
    
    // 标记要处理的文件
    let filesToProcess = [];
    let deletedFiles = [];
    
    // 检查源文件变化
    Object.keys(newSourceHashes).forEach(relativePath => {
        const newHash = newSourceHashes[relativePath];
        const oldHash = oldSourceHashes[relativePath];
        
        // 源文件新增或修改
        if (!oldHash || oldHash !== newHash) {
            filesToProcess.push(relativePath);
        } else {
            // 源文件未修改，但检查对应的 mini 文件是否存在
            const ext = path.extname(relativePath);
            const basenameWithoutExt = path.basename(relativePath, ext);
            const dir = path.dirname(relativePath);
            const miniRelPath = (dir && dir !== '.' ? dir + '/' : '') + basenameWithoutExt + '.webp';
            const miniPath = path.join(miniDir, miniRelPath.replace(/\//g, path.sep));
            
            if (!oldMiniHashes[miniRelPath] || !fs.existsSync(miniPath)) {
                // mini 文件在上次缓存中不存在或物理文件已被删除，需要创建
                filesToProcess.push(relativePath);
            }
        }
    });
    
    // 检查删除的源文件
    Object.keys(oldSourceHashes).forEach(relativePath => {
        if (!newSourceHashes[relativePath]) {
            deletedFiles.push(relativePath);
        }
    });
    
    // 处理文件
    if (filesToProcess.length === 0) {
        console.log(colors.info('没有图片需要更新'));
    } else {
        let processedCount = 0;
        for (const relativePath of filesToProcess) {
            const sourcePath = path.join(sourceDir, relativePath);
            const ext = path.extname(sourcePath);
            const basenameWithoutExt = path.basename(sourcePath, ext);
            const dir = path.dirname(relativePath);
            
            // 输出路径保持原格式，mini 路径统一为 webp
            const relDirParts = dir && dir !== '.' ? dir.split('/') : [];
            const outputPath = path.join(outputDir, dir, path.basename(sourcePath));
            const miniFileName = basenameWithoutExt + '.webp';
            const miniPath = path.join(miniDir, ...relDirParts, miniFileName);
            
            if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile()) {
                try {
                    const success = await processImage(sourcePath, outputPath, miniPath);
                    if (success) {
                        processedCount++;
                        console.log(colors.info(`已处理图片: ${relativePath}`));
                    }
                } catch (e) {
                    console.error(colors.error(`处理图片异常 ${relativePath}: ${e.message}`));
                }
            }
        }
        console.log(colors.info(`图片处理完成，共处理 ${colors.time(processedCount)} 个文件`));
    }
    
    // 更新数据库 - 保存图片相关哈希值
    db.imageHashes = newSourceHashes;
    db.miniHashes = getDirectoryHashes(miniDir, true);
    saveImageDB(RUNDIR, db);
    
    // 输出耗时
    const diff = process.hrtime(startTime);
    const timeSec = (diff[0] + diff[1] / 1e9).toFixed(2);
    console.log(colors.info(`图片处理耗时 ${colors.time(timeSec + ' s')}`));
}

// 统计SWF文件信息
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

// 统计作者和汉化者人数
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

// 格式化字节大小
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

// 终端颜色
const colors = {
    info: (msg) => `\x1b[38;2;28;168;0mINFO\x1b[0m  ${msg}`,      // #1CA800
    time: (msg) => `\x1b[38;2;0;168;154m${msg}\x1b[0m`,          // #00A89A
    error: (msg) => `\x1b[38;2;162;30;41mERROR\x1b[0m ${msg}`,    // #A21E29
};

// 写入文件并输出日志
function writeFile(dest, content, PUB_DIR) {
    const relPath = path.relative(PUB_DIR, dest);
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, content, 'utf8');
    console.log(colors.info(`已生成: ${relPath}`));
    fileCount++;
    return true;
}

// 加载配置文件
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

// 读取作者、汉化者JSON数据
let EXTRA_PEOPLE_DATA = { author: {}, translator: {} };

try {
    const authorsPath = path.join(RUNDIR, 'authors.json');
    const transPath = path.join(RUNDIR, 'translators.json');
    
    if (fs.existsSync(authorsPath)) {
        const authorsArr = JSON.parse(fs.readFileSync(authorsPath, 'utf8'));
        authorsArr.forEach(item => { EXTRA_PEOPLE_DATA.author[item.name] = item; });
    }
    if (fs.existsSync(transPath)) {
        const transArr = JSON.parse(fs.readFileSync(transPath, 'utf8'));
        transArr.forEach(item => { EXTRA_PEOPLE_DATA.translator[item.name] = item; });
    }
} catch (e) {
    console.error(colors.error(`读取作者/汉化者 JSON 失败: ${e.message}`));
}

// 确保目录存在
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 同步源目录到公共目录（增量复制）
function syncSourceFiles(SRC, PUB, db) {
    const newSourceHashes = getDirectoryHashes(SRC, false);

    // 复制或更新源文件
    Object.keys(newSourceHashes).forEach(relPath => {
        if (relPath === 'Game-data' || relPath.startsWith('Game-data/')) return;
        if (relPath === 'images' || relPath.startsWith('images/')) return;
        if (relPath === 'swf' || relPath.startsWith('swf/')) return;

        const srcPath = path.join(SRC, relPath);
        const destPath = path.join(PUB, relPath);

        if (relPath.startsWith('images/') && isImageFile(srcPath)) return; // 仅images用processAllImages处理

        if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) return;

        const sourceHash = newSourceHashes[relPath];
        let destHash = null;
        if (fs.existsSync(destPath) && fs.statSync(destPath).isFile()) {
            destHash = getFileHash(destPath);
        }

        if (destHash && destHash === sourceHash) {
            // 跳过未修改文件
            if (DEBUG_MODE) console.log(colors.info(`文件未修改: ${relPath}`));
        } else {
            ensureDir(path.dirname(destPath));
            fse.copySync(srcPath, destPath, { overwrite: true });
            console.log(colors.info(`已复制文件: ${relPath}`));
        }

        db.sourceHashes = db.sourceHashes || {};
        db.sourceHashes[relPath] = sourceHash;
    });

    // 现有源写DB
    db.sourceHashes = newSourceHashes;
}

// 递归压缩文件
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

// 显示的页码列表
function getPagination(current, total) {
    const delta = 2;   // 桌面端
    const mDelta = 1;  // 移动端
    const rangeWithDots = [];
    let pages = [];
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
            pages.push({
                value: i,
                isMHide: !(i === 1 || i === total || (i >= current - mDelta && i <= current + mDelta))
            });
        }
    }
    for (let i = 0; i < pages.length; i++) {
        if (i > 0) {
            const prevValue = pages[i - 1].value;
            const currValue = pages[i].value;
            if (currValue - prevValue > 1) {
                rangeWithDots.push({ isDot: true });
            }
        }
        rangeWithDots.push(pages[i]);
    }
    return rangeWithDots;
}

// 主函数
async function main() {
    const startTime = process.hrtime();
    GLOBAL_CONFIG = loadConfig();
    TEMPLATE_AFFECT = GLOBAL_CONFIG.templateAffect || {};
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

    // 读取缓存数据
    let db = loadImageDB(RUNDIR);

    // 源目录增量复制
    syncSourceFiles(SRC, PUB, db);

    // 保证 swf 软链接存在
    const swfSrc = path.join(SRC, 'swf');
    const swfDest = path.join(PUB, 'swf');
    if (fs.existsSync(swfSrc)) {
        let shouldCreateLink = true;

        if (fs.existsSync(swfDest)) {
            try {
                const dStat = fs.lstatSync(swfDest);
                if (dStat.isSymbolicLink()) {
                    const currentTarget = fs.readlinkSync(swfDest);
                    if (currentTarget === swfSrc) {
                        shouldCreateLink = false;
                        if (DEBUG_MODE) console.log(colors.info('软连接已存在且目标一致，跳过'));                        
                    } else {
                        fse.removeSync(swfDest);
                    }
                } else if (process.platform === 'win32' && dStat.isDirectory()) {
                    const realPath = fs.realpathSync(swfDest);
                    if (realPath === swfSrc) {
                        shouldCreateLink = false;
                        if (DEBUG_MODE) console.log(colors.info('SWF 目录已存在，且与源一致，跳过'));
                    } else {
                        fse.removeSync(swfDest);
                    }
                } else {
                    fse.removeSync(swfDest);
                }
            } catch (e) {
                // 读取链接失败时重建
                fse.removeSync(swfDest);
            }
        }

        if (shouldCreateLink) {
            const type = process.platform === 'win32' ? 'junction' : 'dir';
            try {
                fs.symlinkSync(swfSrc, swfDest, type);
                console.log(colors.info(`已建立软链接: swf -> ${swfSrc}`));
            } catch (e) {
                console.error(colors.error(`软链接建立失败: ${e.message}`));
            }
        }
    }

    // 加载数据
    const loadStart = process.hrtime();
    const games = loadGames(DATA_DIR);
    updateSwfStats(SRC);
    updateAuthorStats(games);
    const loadMs = (process.hrtime(loadStart)[0] * 1e3 + process.hrtime(loadStart)[1] / 1e6).toFixed(2);
    console.log(colors.info(`文件加载耗时 ${colors.time(loadMs + ' ms')}`));

    // 处理图片（保留缓存，仅处理修改的）
    await processAllImages(RUNDIR, SRC, PUB, db);

    // 生成所有页面
    regenerateAllGamePages(TPL, PUB, DATA_DIR, API_DIR, SRC, DOMAIN);

    // 生成不受元信息影响的页面
    gen404Page(TPL, PUB, DOMAIN);
    genAboutPage(TPL, PUB, DOMAIN);
    genFriendPage(TPL, PUB, DOMAIN);

    // 统计数据
    const genSec = (process.hrtime(startTime)[0] + process.hrtime(startTime)[1] / 1e9).toFixed(2);
    console.log(colors.info(`已生成 ${colors.time(fileCount)} 个文件 ${colors.time(genSec + ' s')}`));

    // 压缩资源
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

    // 实时预览
    if (IS_WATCH) {
        // 启动服务器，默认端口3000
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

        // 监听文件变化
        const watcher = chokidar.watch([SRC, TPL, path.join(RUNDIR, 'authors.json'), path.join(RUNDIR, 'translators.json')], {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });
        watcher.on('all', async (event, filePath) => {
            try {
                const relPath = path.relative(SRC, filePath);
                const ext = path.extname(filePath);
                const fileName = path.basename(filePath);
                function findGamePageIndex(games, gameDir, pageSize) {
                    const index = games.findIndex(g => g.dir === gameDir);
                    if (index === -1) return null;
                    return Math.floor(index / pageSize) + 1;
                }

                // 图片处理
                const isImagesDir = filePath.includes(path.join('images')) && filePath.startsWith(path.join(SRC, 'images'));
                if (isImagesDir) {
                    await processAllImages(RUNDIR, SRC, PUB);
                    return;
                }

                // JSON更新
                if (filePath.endsWith('.json') && filePath.includes('Game-data')) {
                    regenerateAllGamePages(TPL, PUB, DATA_DIR, API_DIR, SRC, DOMAIN);
                    return;
                }

                // 模板
                if (filePath.endsWith('.ejs')) {
                    const tplName = path.basename(filePath);
                    const affect = TEMPLATE_AFFECT[tplName];

                    if (affect === 'all') {
                        regenerateAllGamePages(TPL, PUB, DATA_DIR, API_DIR, SRC, DOMAIN);
                        gen404Page(TPL, PUB, DOMAIN);
                        genAboutPage(TPL, PUB, DOMAIN);
                        genFriendPage(TPL, PUB, DOMAIN);
                    } else {
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
                        else if (affect === 'gameslist') {
                            genGamesListPage(TPL, PUB, games, DOMAIN);
                        }
                        else if (affect === 'author' || affect === 'author-games') {
                            genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'author');
                            genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'translator');
                        }
                    }
                    return;
                }

                // swf 变更
                if (filePath.includes(path.join('swf'))) {
                    updateSwfStats(SRC);
                    genAboutPage(TPL, PUB, DOMAIN);
                }

                // 作者、汉化者数据变更
                if (fileName === 'authors.json' || fileName === 'translators.json') {
                    if (fs.existsSync(filePath)) {
                        const type = fileName.startsWith('authors') ? 'author' : 'translator';
                        const newData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        EXTRA_PEOPLE_DATA[type] = {};
                        newData.forEach(item => { EXTRA_PEOPLE_DATA[type][item.name] = item; });
                        
                        const games = loadGames(DATA_DIR);
                        genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'author');
                        genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'translator');
                    }
                    return;
                }
                const isIgnored = [...IGNORE_LIST].some(dir => relPath.startsWith(dir));
                if (!isIgnored) {
                    const destPath = path.join(PUB, relPath);
                    
                    if (event === 'unlink' || event === 'unlinkDir') {
                        fse.removeSync(destPath);
                        console.log(colors.info(`已删除文件: ${relPath}`));
                    } else {
                        ensureDir(path.dirname(destPath));
                        fse.copySync(filePath, destPath);
                        console.log(colors.info(`静态文件同步: ${relPath}`));
                        
                        if (MUST_MIN && (ext === '.css' || ext === '.js')) {
                        }
                    }
                }
            } catch (err) {
                console.error(colors.error(`热更新失败: ${err.message}`));
            }
        });
    }
}

// 加载JSON数据
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

// 生成游玩页
function genGamePages(TPL, PUB, game, DOMAIN) {
    let ruffleBase = game.base || "/swf/" + (game.title || '').replace(/[\/\\]/g, '') + "/";

    // 版本关键词
    let versionKeywords = [];
    if (game.files && Array.isArray(game.files)) {
        versionKeywords = game.files.map(file => {
            // 如果文件名里已经包含了标题，就直接用；否则拼接 标题 + 版本名
            if (file.name && game.title && file.name.includes(game.title)) {
                return file.name;
            }
            return `${game.title}${file.name}`;
        });
    }
    // 去重，防止出现重复的关键词
    versionKeywords = [...new Set(versionKeywords)];

    // 计算文件大小（与files顺序一致）
    let fileSizes = [];
    if (game.files && Array.isArray(game.files)) {
        fileSizes = game.files.map(file => {
            const relativeSwfPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
            const srcPath = path.join(RUNDIR, GLOBAL_CONFIG.src, relativeSwfPath);
            if (fs.existsSync(srcPath)) {
                const stat = fs.statSync(srcPath);
                return formatSize(stat.size);
            }
            return formatSize(0);
        });
    }

    // 作者
    const authorName = (game['Author'] || '').trim();
    const author =
        !authorName || authorName === '未知'
            ? { text: '未知', link: null }
            : { text: authorName, link: `/authors/${authorName}/` };

    // 汉化者
    const cnAuthorName = (game['CN-Author'] || '').trim();
    let translators = null;
    let translator = null;

    if (cnAuthorName && cnAuthorName !== '无') {
        translators = cnAuthorName.split(/\s*,\s*/).map(name => ({
            text: name,
            link: `/translators/${name}/`
        }));
        if (translators.length === 1) {
            translator = translators[0];
        }
    }

    // \n分段
    const playContent = (game.play || "")
        .split('\n')
        .filter(p => p.trim())
        .map(p => `<p>${p.trim()}</p>`)
        .join('');
        
    // 发布时间
    const pubTime = formatDisplayTime(game.pubDate);
    const html = renderTpl(TPL, 'game', { game: { ...game, play: playContent }, ruffleBase, domain: DOMAIN, author, translators, translator, pubTime, versionKeywords, fileSizes });

    const gameDir = path.join(PUB, game.dir);
    ensureDir(gameDir);
    writeFile(path.join(gameDir, 'index.html'), html, PUB);
}

// 加载单游戏JSON
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

// 渲染美化
function renderTpl(tplDir, name, data) {
    const tplPath = path.join(tplDir, name + '.ejs');
    const rawHtml = ejs.render(fs.readFileSync(tplPath, 'utf-8'), data, { filename: tplPath });
    if (IS_MIN) return rawHtml;
    return beautify(rawHtml, { indent_size: 4, space_in_empty_tag: true, preserve_newlines: false });
}

// 生成所有游戏相关页面（首页、列表、作者页、RSS等）
function regenerateAllGamePages(TPL, PUB, DATA_DIR, API_DIR, SRC, DOMAIN) {
    const games = loadGames(DATA_DIR);
    updateAuthorStats(games);
    updateSwfStats(SRC);
    
    genHomePages(TPL, PUB, games, DOMAIN);
    games.forEach(g => genGamePages(TPL, PUB, g, DOMAIN));
    genGamesListPage(TPL, PUB, games, DOMAIN);
    genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'author');
    genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'translator');
    genGamesNameJson(DATA_DIR, API_DIR, PUB);
    genSearchJson(DATA_DIR, API_DIR, PUB);
    genSitemapXml(PUB, DOMAIN, games);
    genRssXml(PUB, DOMAIN, games);
}

// 生成首页及分页
function genHomePages(TPL, PUB, games, DOMAIN) {
    const PAGE_SIZE = 20;
    // 过滤掉HideIn包含"Home"的游戏
    const filteredGames = games.filter(g => {
        if (!g.HideIn || !Array.isArray(g.HideIn)) return true;
        return !g.HideIn.includes('Home');
    });
    
    const totalPages = Math.ceil(filteredGames.length / PAGE_SIZE) || 1;
    for (let p = 1; p <= totalPages; p++) {
        const pageGames = filteredGames.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

        // 首页使用 mini 缩略图
        const pageGamesWithMiniCover = pageGames.map(g => {
            const cover = g.cover || '';
            if (cover.startsWith('/images/')) {
                const miniCover = cover.replace('/images/', '/images/mini/');
                return Object.assign({}, g, { cover: miniCover });
            }
            return g;
        });

        const pagination = getPagination(p, totalPages);
        const html = renderTpl(TPL, 'home', { 
            games: pageGamesWithMiniCover, 
            page: p, 
            totalPages: totalPages, 
            pagination: pagination,
            domain: DOMAIN,
            currentPage: p
        });
        const dest = path.join(PUB, p === 1 ? 'index.html' : `${p}.html`);
        writeFile(dest, html, PUB);
    }
}

// 404
function gen404Page(TPL, PUB, DOMAIN) {
    const html = renderTpl(TPL, '404', { domain: DOMAIN, pageType: '404' });
    writeFile(path.join(PUB, '404.html'), html, PUB);
}

// 关于
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

// 剔除无效作者、汉化者名称
function getCleanNames(str) {
    const ignoreList = ['无', '未知'];
    if (!str) return [];
    return str.split(',')
        .map(a => a.trim())
        .filter(name => name && !ignoreList.includes(name));
}

// 作者汉化者索引页及个人页
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

        const extraInfo = EXTRA_PEOPLE_DATA[type][name] || {};
        const personLink = extraInfo.link || null;
        const personInfo = extraInfo.info || "";

        for (let p = 1; p <= totalPages; p++) {
            const pageGames = personGames.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
            const pagination = getPagination(p, totalPages);

            const pageGamesWithMiniCover = pageGames.map(g => {
                const cover = g.cover || '';
                if (cover.startsWith('/images/')) {
                    const miniCover = cover.replace('/images/', '/images/mini/');
                    return Object.assign({}, g, { cover: miniCover });
                }
                return g;
            });

            const html = renderTpl(TPL, 'author-games', { 
                games: pageGamesWithMiniCover,
                page: p, 
                totalPages: totalPages, 
                domain: DOMAIN,
                title: `${name} 的作品`,
                pageType: 'author-games', 
                personName: name,
                personLink: personLink,
                personInfo: personInfo,
                pagination: pagination,
                personType: type
            });

            const dest = path.join(personDir, p === 1 ? 'index.html' : `${p}.html`);
            writeFile(dest, html, PUB);
        }
    });
}

// 友链
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

// 生成游戏列表页
function genGamesListPage(TPL, PUB, games, DOMAIN) {
    // 过滤掉HideIn包含"List"的游戏
    const filteredGames = games.filter(g => {
        if (!g.HideIn || !Array.isArray(g.HideIn)) return true;
        return !g.HideIn.includes('List');
    });

    // 格式化发布日期
    const pubDateFormatted = {};
    filteredGames.forEach(g => {
        pubDateFormatted[g.id] = formatDisplayTime(g.pubDate).text;
    });

    const html = renderTpl(TPL, 'GamesList', {
        games: filteredGames,
        domain: DOMAIN,
        pageType: 'gameslist',
        pubDateFormatted: pubDateFormatted
    });

    const gamesDir = path.join(PUB, 'Games');
    ensureDir(gamesDir);
    writeFile(path.join(gamesDir, 'index.html'), html, PUB);
}

// 游戏元信息大合集
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

// 搜索JSON
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

// 格式化显示时间
function formatDisplayTime(timeString) {
    if (!timeString) {
        return { text: '----.--.-- --:--', valid: false };
    }

    const d = new Date(timeString.replace(/-/g, '/'));
    if (isNaN(d.getTime())) {
        return { text: '----.--.-- --:--', valid: false };
    }

    const pad = n => String(n).padStart(2, '0');
    return {
        text: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
        valid: true
    };
}

// RSS、Sitemap时间格式化
function formatDate(timeString, type) {
    if (!timeString) return '';
    const d = new Date(timeString.replace(/-/g, '/'));
    if (type === 'rss') return d.toUTCString();
    if (type === 'sitemap') return d.toISOString().replace('.000', '').replace('Z', '+00:00');
}

// Sitemap.xml
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

// RSS.xml
function genRssXml(PUB, DOMAIN, games) {
    const now = new Date().toUTCString();
    const n = IS_MIN ? "" : "\n";
    const s = IS_MIN ? "" : "  ";

    let xml = `<?xml version="1.0" encoding="UTF-8" ?>${n}<rss version="2.0">${n}${s}<channel>${n}`;
    xml += `${s}${s}<title>Flash收藏站</title>${n}`;
    xml += `${s}${s}<link>https://${DOMAIN}/</link>${n}`;
    xml += `${s}${s}<description>最新Flash游戏列表 RSS 订阅</description>${n}`;
    xml += `${s}${s}<lastBuildDate>${now}</lastBuildDate>${n}`;

    // 过滤掉HideIn包含"Rss"的游戏
    const filteredGames = games.filter(g => {
        if (!g.HideIn || !Array.isArray(g.HideIn)) return true;
        return !g.HideIn.includes('Rss');
    });

    filteredGames.forEach(g => {
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