// 生成37测试文件
const fs = require('fs');
const outDir = __dirname;
for (let i = 1; i <= 37; i++) {
  const game = {
    title: `测试游戏${i}`,
    pubDate: `2025-01-${String(i).padStart(2, '0')}`,
    brief: `这是编号为${i}的测试短介绍`,
    play: `这里是测试游戏${i}的玩法说明`,
    cover: `/Games/mock/game${i}.jpg`,
    dir: `testgame${i}`
  };
  fs.writeFileSync(`${outDir}/game-${i}.json`, JSON.stringify(game, null, 2), 'utf-8');
}
console.log('111');
