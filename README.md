# 静水深流 | Flash的收藏站

此为Flash收藏站的构建源代码仓库，该站点用于发布我制作的汉化游戏、汉化补丁。
该仓库包含了 SSG 生成器、游戏JSON信息，用于构建站点文件，本仓库不包含 swf 游戏文件，如果想要获取 swf 游戏文件请参考[获取文件](#获取文件)

Flash收藏站地址：https://flash.hcyhub.com

博客：https://hcyhub.com
Page页面：https://page.hcyhub.com
音乐空间：https://music.hcyhub.com

## 如何使用

在项目根目录运行：

```
node index.js
```

public目录为生成好的站点文件。

## 获取文件

游戏元信息：https://flash.hcyhub.com/api/games_name.json

SWF 文件: https://flash.hcyhub.com/{name}.swf

截图文件: https://flash.hcyhub.com/{name}.png

## 结构说明

```
Flash-web-Ethaniel
├── layout
│   ├── .keep
│   ├── 404.ejs
│   ├── GamesList.ejs
│   ├── about.ejs
│   ├── author-games.ejs
│   ├── author.ejs
│   ├── categories.ejs
│   ├── footer.ejs
│   ├── friend.ejs
│   ├── game.ejs
│   ├── head.ejs
│   ├── header.ejs
│   ├── home.ejs
│   ├── post.ejs
│   ├── search.ejs
│   ├── tags.ejs
│   └── twikoo.ejs
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
│   ├── SolEditor.exe
│   └── robots.txt
├── _config.yml
├── friends.yml
├── authors.json
├── translators.json
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

authors.json

此文件为设置作者元信息的，作用是储存 `name` 对应的作者的链接、介绍信息。

```
[
    { "name": "", "link": "", "info": "" }
]
```

translators.json

作用同 `authors.json`

```
[
    { "name": "", "link": "", "info": "" }
]
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
    "markdown-it": "^14.2.0",
    "minimist": "^1.2.8",
    "serve-handler": "^6.1.6",
    "sharp": "^0.34.5",
    "terser": "^5.44.1"
  }
}
```