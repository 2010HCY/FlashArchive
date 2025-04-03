let games = []; // 存储游戏数据
let currentPage = 0; // 当前页码
const gamesPerPage = 18; // 每页显示的卡片数量（6个每行 * 3行）

document.addEventListener("DOMContentLoaded", function () {
    fetch("./api/games_name.json")
        .then(response => response.json())
        .then(data => {
            games = data;
            renderGames(); 
        })
        .catch(error => console.error("无法加载游戏数据:", error));
});

function renderGames() {
    const container = document.getElementById("game-list");
    container.innerHTML = ""; // 清空之前的卡片

    // 计算当前页要显示的游戏
    const start = currentPage * gamesPerPage;
    const end = start + gamesPerPage;
    const pageGames = games.slice(start, end); // 提取当前页的卡片数据

    pageGames.forEach(game => {
        let gameFolder = game.name;
        let cardHTML = `
            <div class="card">
                <a href="/Games/${gameFolder}/">
                    <img src="/Games/${gameFolder}/${gameFolder}.webp" alt="${game.name}" loading="lazy">
                    <h3>${game.name}</h3>
                    <p>${game.desc}</p>
                </a>
            </div>
        `;
        container.innerHTML += cardHTML; // 渲染卡片到容器中
    });

    // 更新分页按钮
    updatePagination(); 
}

function updatePagination() {
    const totalPages = Math.ceil(games.length / gamesPerPage);
    const pageNumbersContainer = document.getElementById("pageNumbers");
    pageNumbersContainer.innerHTML = ""; // 清空之前的页码

    const maxVisiblePages = 10; // 最大显示的页码数量
    const ellipsis = '…'; // 省略符号
    const isOnFirstPage = currentPage === 0;
    const isOnLastPage = currentPage === totalPages - 1;

    let startPage, endPage;
    
    if (totalPages <= maxVisiblePages) {
        // 如果总页数少于或等于最大显示页码
        startPage = 0;
        endPage = totalPages - 1;
    } else {
        // 超过最大显示页码
        startPage = Math.max(0, currentPage - Math.floor(maxVisiblePages / 2));
        endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);

        if (endPage - startPage >= maxVisiblePages - 1) {
            // 有多余的页码需要省略
            if (startPage > 0) {
                startPage = Math.max(0, endPage - maxVisiblePages + 1);
            }
        }
    }

    // 添加第一页
    if (startPage > 0) {
        const firstPage = document.createElement("span");
        firstPage.textContent = 1; // 第一页
        firstPage.onclick = function() {
            currentPage = 0;
            renderGames();
        };
        pageNumbersContainer.appendChild(firstPage);

        if (startPage > 1) {
            const startEllipsis = document.createElement("span");
            startEllipsis.textContent = ellipsis;
            startEllipsis.onclick = function() {
                currentPage = 0; // 点击省略符号返回第一页
                renderGames();
            };
            pageNumbersContainer.appendChild(startEllipsis);
        }
    }

    // 添加具体页码
    for (let i = startPage; i <= endPage; i++) {
        const pageNumber = document.createElement("span");
        pageNumber.textContent = (i + 1); // 显示为 1-indexed
        pageNumber.onclick = function() {
            currentPage = i;
            renderGames(); // 重新渲染
        };

        // 如果是当前页码，则更改颜色
        if (i === currentPage) {
            pageNumber.style.color = '#a3a300'; // 当前页码的颜色
        } else {
            pageNumber.style.color = 'inherit'; // 其他分页数字颜色
        }

        pageNumbersContainer.appendChild(pageNumber);
    }

    // 添加最后一页
    if (endPage < totalPages - 1) {
        if (endPage < totalPages - 2) {
            const endEllipsis = document.createElement("span");
            endEllipsis.textContent = ellipsis;
            endEllipsis.onclick = function () {
                currentPage = totalPages - 1; // 点击省略符号返回最后一页
                renderGames();
            };
            pageNumbersContainer.appendChild(endEllipsis);
        }

        const lastPage = document.createElement("span");
        lastPage.textContent = totalPages; // 最后一页
        lastPage.onclick = function() {
            currentPage = totalPages - 1;
            renderGames();
        };
        pageNumbersContainer.appendChild(lastPage);
    }

    // 更新按钮状态
    document.getElementById("prevBtn").disabled = currentPage === 0;
    document.getElementById("nextBtn").disabled = currentPage >= totalPages - 1;
}

document.getElementById("prevBtn").addEventListener("click", function() {
    if (currentPage > 0) {
        currentPage--;
        renderGames(); // 重新渲染卡片
    }
});

document.getElementById("nextBtn").addEventListener("click", function() {
    if ((currentPage + 1) * gamesPerPage < games.length) {
        currentPage++;
        renderGames(); // 重新渲染卡片
    }
});