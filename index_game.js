document.addEventListener("DOMContentLoaded", function () {
    fetch("./api/Games_name.json")
        .then(response => response.json())
        .then(games => {
            shuffleArray(games);
            renderGames(games);
        })
        .catch(error => console.error("无法加载游戏数据:", error));
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function renderGames(games) {
    let container = document.getElementById("game-list");
    container.innerHTML = "";

    games.forEach(game => {
        let gameFolder = game.name;
        let cardHTML = `
            <div class="card">
                <a href="./${gameFolder}/">
                    <img src="./${gameFolder}/${gameFolder}.webp" alt="${game.name}" loading="lazy">
                    <h3>${game.name}</h3>
                    <p>${game.desc}</p>
                </a>
            </div>
        `;
        container.innerHTML += cardHTML;
    });
}
