document.addEventListener("DOMContentLoaded", function () {
    const bottomText = document.querySelector(".bottom-text");
    if (!bottomText) return;

    const content = `
        <h2>说明</h2>
        <p>这是flash游戏，2025年了，支持flash的浏览器一个巴掌也数的过来，我已经在网站上部署了Ruffle，如果还是无法游玩，试试以下方法</p>
        <p>安装插件，安装这个叫<a target="_blank" rel="noopener" href="https://ruffle.rs/">Ruffle</a>的浏览器插件就好了<a target="_blank" rel="noopener" href="https://microsoftedge.microsoft.com/addons/detail/ruffle-flash-emulator/pipjjbgofgieknlpefmcckdmgaaegban">点击跳转</a></p>
        <p>下载游戏，然后将swf游戏文件用flash播放器打开</p>
    `;

    bottomText.innerHTML = content;
});