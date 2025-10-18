document.addEventListener("DOMContentLoaded", function () {
    const bottomText = document.querySelector(".bottom-text");
    if (bottomText) {
        const content = `
            <h2>说明</h2>
            <p>这是flash游戏，2025年了，支持flash的浏览器一个巴掌也数的过来，我已经在网站上部署了Ruffle，如果还是无法游玩，试试以下方法</p>
            <p>安装插件，安装这个叫<a target="_blank" rel="noopener" href="https://ruffle.rs/">Ruffle</a>的浏览器插件就好了<a target="_blank" rel="noopener" href="https://microsoftedge.microsoft.com/addons/detail/ruffle-flash-emulator/pipjjbgofgieknlpefmcckdmgaaegban">点击跳转</a></p>
            <p>下载游戏，然后将swf游戏文件用flash播放器打开</p>
            <p>Ruffle的兼容性不是很好，已知一些3D游戏无法游玩，并且有可能会出现按钮失灵、文字贴图不显示，所以我强烈建议下载下来以获得最佳体验</p>
            <p>评论区在下面，你们遇到问题可以反馈给我，但大概率我也只能建议你们下载到本地游玩...Flash的兼容性安全性真是太差了</p>
        `;
        bottomText.innerHTML = content;
    }

    const textContainer = document.querySelector('.text-container');

    if (textContainer) {
        const zanDiv = document.createElement('div');
        zanDiv.id = 'zan';
        zanDiv.className = 'clearfix';
        zanDiv.innerHTML = `
            <div class="heart" onclick="goodplus(url, flag)"></div>
            <br>
            <div id="zan_text"></div>
        `;

        textContainer.appendChild(zanDiv);

        const pvDiv = document.createElement('div');
        pvDiv.id = 'PageMeter_page_pv1';
        pvDiv.className = 'info-break-policy';
        pvDiv.innerHTML = `
            <i class="far fa-eye fa-fw"></i>总计游玩次数:&nbsp;&nbsp;
            <span class="stats-value" id="PageMeter_page_pv">加载中...</span>
        `;

        const switchButtons = textContainer.querySelector('.switch-buttons');

        const howToPlayH2 = textContainer.querySelector('h2');

        if (switchButtons && howToPlayH2) {
            textContainer.insertBefore(pvDiv, howToPlayH2);
        }
    }
});