document.addEventListener("DOMContentLoaded", function () {
    const commentDiv = document.createElement('div');
    commentDiv.id = 'tcomment';

    document.getElementById('twikoo').appendChild(commentDiv);

    const twikooScript = document.createElement('script');
    twikooScript.src = 'https://cdn.jsdelivr.net/npm/twikoo@1.6.41/dist/twikoo.all.min.js';

    twikooScript.onload = function () {
        twikoo.init({
            envId: 'https://twikoo.100713.xyz/.netlify/functions/twikoo',
            el: '#tcomment',
            lang: 'zh-CN',
        });
    };

    document.body.appendChild(twikooScript);
});