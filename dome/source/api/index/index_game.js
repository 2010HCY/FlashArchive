let games = [];
const noChineseSet = new Set();
let currentPage = 0;
const gamesPerPage = 18;

//处理游戏数据，标记未汉化部分
document.addEventListener("DOMContentLoaded", function () {
    Promise.all([
        fetch("./api/games_name.json").then(res => res.json()),
        fetch("./api/nochinese_name.json").then(res => res.json()).catch(e => {
            console.warn("加载nochinese_name.json失败，所有游戏视为已汉化。");
            return [];
        })
    ])
    .then(([allGames, noChinese]) => {
        if (!Array.isArray(allGames)) allGames = [];
        if (!Array.isArray(noChinese)) noChinese = [];
        noChinese.forEach(g => {
            if (g.name) noChineseSet.add(g.name);
        });
        games = allGames;
        renderGames();
    })
    .catch(e => {
        console.error("加载数据出错，将视作所有游戏已汉化。", e);
        games = [];
        renderGames();
    });
}); 

// 渲染游戏卡片
function renderGames() {
    const container = document.getElementById("game-list");
    container.innerHTML = "";

    const start = currentPage * gamesPerPage;
    const end = start + gamesPerPage;
    const pageGames = games.slice(start, end);

    pageGames.forEach(game => {
        const isUnChinese = noChineseSet.has(game.name);

        // 设置data-chinese状态
        const dataChineseAttr = isUnChinese ? 'no' : 'yes';

        const gameFolder = game.name;

        const labelHTML = `<div class="chinese-label">${isUnChinese ? '未汉化' : '已汉化'}</div>`;

        const cardHTML = `
            <div class="card" data-chinese="${dataChineseAttr}">
                <a href="/Games/${gameFolder}/">
                    <img src="/Games/${gameFolder}/${gameFolder}.webp" alt="${game.name}" loading="lazy">
                    ${labelHTML}
                    <h3>${game.name}</h3>
                    <p>${game.desc}</p>
                </a>
            </div>
        `;
        container.innerHTML += cardHTML;
    });

    updatePagination();
}

function updatePagination() {
    const totalPages = Math.ceil(games.length / gamesPerPage);
    const pageNumbersContainer = document.getElementById("pageNumbers");
    pageNumbersContainer.innerHTML = "";

    const maxVisiblePages = 10;
    const ellipsis = '…';

    let startPage, endPage;

    if (totalPages <= maxVisiblePages) {
        startPage = 0;
        endPage = totalPages - 1;
    } else {
        startPage = Math.max(0, currentPage - Math.floor(maxVisiblePages / 2));
        endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);
        if (endPage - startPage >= maxVisiblePages - 1) {
            if (startPage > 0) {
                startPage = Math.max(0, endPage - maxVisiblePages + 1);
            }
        }
    }

    // 首页
    if (startPage > 0) {
        const firstPage = document.createElement("span");
        firstPage.textContent = 1;
        firstPage.onclick = () => { currentPage = 0; renderGames(); };
        pageNumbersContainer.appendChild(firstPage);
        if (startPage > 1) {
            const startEllipsis = document.createElement("span");
            startEllipsis.textContent = ellipsis;
            startEllipsis.onclick = () => { currentPage = 0; renderGames(); };
            pageNumbersContainer.appendChild(startEllipsis);
        }
    }

    // 中间页码
    for (let i = startPage; i <= endPage; i++) {
        const pageNumber = document.createElement("span");
        pageNumber.textContent = (i + 1);
        pageNumber.onclick = () => { currentPage = i; renderGames(); };
        if (i === currentPage) {
            pageNumber.style.color = '#a3a300';
        }
        pageNumbersContainer.appendChild(pageNumber);
    }

    // 最后一页
    if (endPage < totalPages - 1) {
        if (endPage < totalPages - 2) {
            const endEllipsis = document.createElement("span");
            endEllipsis.textContent = ellipsis;
            endEllipsis.onclick = () => { currentPage = totalPages - 1; renderGames(); };
            pageNumbersContainer.appendChild(endEllipsis);
        }
        const lastPage = document.createElement("span");
        lastPage.textContent = totalPages;
        lastPage.onclick = () => { currentPage = totalPages - 1; renderGames(); };
        pageNumbersContainer.appendChild(lastPage);
    }

    // 更新按钮状态
    document.getElementById("prevBtn").disabled = currentPage === 0;
    document.getElementById("nextBtn").disabled = currentPage >= totalPages - 1;
}

document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentPage > 0) {
        currentPage--;
        renderGames();
    }
});

document.getElementById("nextBtn").addEventListener("click", () => {
    if ((currentPage + 1) * gamesPerPage < games.length) {
        currentPage++;
        renderGames();
    }
});