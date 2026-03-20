## 静水深流 | Flash的收藏站

这里面汇集了我收藏的flash小游戏，全人工汉化，且能够直接切换多版本游玩、下载。
站点自带Ruffle可以免插件游玩

-->体验地址https://flash.hcyhub.com<--

-->博客地址https://hcyhub.com<--

-->Page页面地址https://page.hcyhub.com<--

### 结构说明

```
Flash-web-Ethaniel
├── layout
│   ├── .keep
│   ├── 404.ejs
│   ├── about.ejs
│   ├── author-games.ejs
│   ├── author.ejs
│   ├── footer.ejs
│   ├── friend.ejs
│   ├── game-card.ejs
│   ├── game.ejs
│   ├── head.ejs
│   ├── header.ejs
│   ├── home.ejs
│   └── search.ejs
├── public
|   └── /.......
├── source
│   ├── api/
│   ├── friend/
│   ├── Game-data/
│   ├── images/
│   ├── swf/
│   ├── 模板.json
│   ├── Falsh播放器.exe
│   └── robots.txt
├── _config.yml
├── friends.yml
├── index.js
├── package-lock.json
├── package.json
└── README.md
```

layout存放模板文件，source、public分别是来源、输出目录，可在_config.yml配置。

配置文件说明：
_config.yml

```
src: source                   # 来源目录
public: public                # 输出目录
template: layout              # 模板文件目录
ignore:                       # 忽略列表，生成器将忽略它们不复制倒输出目录
  - Game-data
  - 模板.json
domain: flash.hcyhub.com      # 域名
port: 8080                    # 预览服务器端口
```

friends.yml

```
MySite:                       # 周边站点
  - name: "静水深流"
    url: "https://hcyhub.com"
    avatar: "https://hcyhub.com/medias/avatar.webp"
    introduction: "博客主站"

others:                       # 友链
  - name: "Example Domain"
    url: "https://example.com/"
    avatar: "https://example.com/img.png"
    introduction: "一个示范域名"
```

package.json

```
{
  "dependencies": {
    "chokidar": "^5.0.0",
    "clean-css": "^5.3.3",
    "ejs": "^3.1.10",
    "fs-extra": "^11.3.2",
    "html-minifier": "^4.0.0",
    "js-beautify": "^1.15.4",
    "js-yaml": "^4.1.0",
    "minimist": "^1.2.8",
    "serve-handler": "^6.1.6",
    "terser": "^5.44.1"
  }
}
```

index.js

```
main()
│
├─ loadConfig() → 读取 _config.yml
├─ ensureDir(PUB) → 创建发布目录
├─ cleanDirExceptGit(PUB) → 清理旧文件
├─ 遍历 SRC → copy 文件 / 建立 swf 软链接
│
├─ loadGames(DATA_DIR) → 返回 games[]
│    ├─ 补全 files、DownFiles、cover
│
├─ updateSwfStats(SRC) → 统计 SWF 文件信息
├─ updateAuthorStats(games) → 统计作者/汉化者
│
├─ 页面生成
│    ├─ genHomePages(TPL, PUB, games, DOMAIN)
│    ├─ games.forEach → genGamePages(TPL, PUB, game, DOMAIN)
│    │    ├─ 处理 author/translator/pubTime
│    │    └─ renderTpl → 写 index.html
│    ├─ gen404Page(TPL, PUB, DOMAIN)
│    ├─ genAboutPage(TPL, PUB, DOMAIN) → 使用 CACHED_STATS
│    ├─ genFriendPage(TPL, PUB, DOMAIN)
│    ├─ genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'author')
│    └─ genPeopleIndexPage(TPL, PUB, games, DOMAIN, 'translator')
│
├─ API/数据生成
│    ├─ genGamesNameJson(DATA_DIR, API_DIR, PUB)
│    ├─ genSearchJson(DATA_DIR, API_DIR, PUB)
│    ├─ genSitemapXml(PUB, DOMAIN, games)
│    └─ genRssXml(PUB, DOMAIN, games)
│
├─ (可选) minifyAssets(PUB, PUB) → 压缩 JS/CSS/HTML
│
└─ (可选) watch / serve
     ├─ HTTP server 启动
     └─ chokidar 监听文件变化 → 热更新对应页面或 JSON
```