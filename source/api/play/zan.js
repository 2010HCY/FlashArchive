(function(){
  // === 配置项 BEGIN ===
  var BLOG_LIKE_CONFIG = {
    enable: true,
    Backend: "PHP",
    PHPBackend: "/api/like",
    GoogleAnalytics: true,
    GAEventCategory: "Engagement",
    GAEventAction: "Like"
  };
  // === 配置项 END ===
  if (!BLOG_LIKE_CONFIG.enable) return;

  var alertBox = null;
  var alertTimer = null;
  function showAlert(msg) {
    if (!alertBox) {
      alertBox = document.createElement("div");
      alertBox.style.position = "fixed";
      alertBox.style.top = "20%";
      alertBox.style.left = "50%";
      alertBox.style.transform = "translate(-50%, -50%)";
      alertBox.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
      alertBox.style.color = "white";
      alertBox.style.padding = "15px 30px";
      alertBox.style.borderRadius = "8px";
      alertBox.style.zIndex = "1000";
      alertBox.style.fontSize = "16px";
      alertBox.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.2)";
      document.body.appendChild(alertBox);
    }
    alertBox.innerText = msg;
    if (alertTimer) clearTimeout(alertTimer);
    alertTimer = setTimeout(function () {
      if (alertBox && alertBox.parentNode) {
        alertBox.parentNode.removeChild(alertBox);
      }
      alertBox = null;
      alertTimer = null;
    }, 1800);
  }
  function heartAnimation() {
    var heart = document.querySelector('.heart');
    if (!heart) return;
    heart.classList.remove('heartAnimation');
    void heart.offsetWidth;
    heart.classList.add('heartAnimation');
    setTimeout(function(){
      heart.classList.remove('heartAnimation');
    },800);
  }

  function getCookie(name) {
    var cookieArr = document.cookie.split(";");
    for (var i = 0; i < cookieArr.length; i++) {
      var cookie = cookieArr[i].trim();
      if (cookie.startsWith(name + "=")) {
        return cookie.substring(name.length + 1);
      }
    }
    return null;
  }

  function setCookie(name, value, days) {
    var date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    var expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
  }

  function deleteCookie(name) {
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/";
  }

  function getVisitorLiked(url) {
    var liked = getCookie("likes_" + url);
    return liked === "1";
  }

  function setVisitorLiked(url, liked) {
    if (liked) {
      setCookie("likes_" + url, "1", 30);
    } else {
      deleteCookie("likes_" + url);
    }
  }

  function setHeartLiked(liked) {
    var heart = document.querySelector('.heart');
    if (!heart) return;
    if (liked) {
      heart.classList.add('liked');
    } else {
      heart.classList.remove('liked');
      heart.classList.remove('heartAnimation');
    }
  }

  function updateZanText(num) {
    var el = document.getElementById("zan_text");
    if (el) el.innerHTML = num;
  }

  function sendGAEvent() {
    if (BLOG_LIKE_CONFIG.GoogleAnalytics && typeof window.gtag === 'function') {
      gtag('event', BLOG_LIKE_CONFIG.GAEventAction || 'Like', {
        'event_category': BLOG_LIKE_CONFIG.GAEventCategory || 'Engagement',
        'event_label': window.url
      });
    }
  }

  // =============== PHP 后端 ===============
  function mainPHP() {
    window.flag = 0;
    window.url = location.host + location.pathname;
    var url = window.url;
    var flag = window.flag;
    var isRequesting = false;

    function getPHPApiUrl() {
      var backend = BLOG_LIKE_CONFIG.PHPBackend;
      if (!backend) return null;
      return /^https?:\/\//.test(backend) ? backend.replace(/\/$/, '') : backend;
    }

    function phpLike(delta, done) {
      var apiUrl = getPHPApiUrl();
      if (!apiUrl) {
        showAlert("PHP 后端未配置");
        console.error('PHP 后端地址未配置！');
        if (done) done();
        return;
      }

      var bodyData = {
        Url: url,
        Add: delta
      };

      var xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try {
              var response = JSON.parse(xhr.responseText);
              if (typeof response.likes !== "undefined") {
                updateZanText(response.likes);
                if (delta > 0) {
                  setVisitorLiked(url, true);
                  setHeartLiked(true);
                  heartAnimation();
                  showAlert("点赞成功");
                } else if (delta < 0) {
                  setVisitorLiked(url, false);
                  setHeartLiked(false);
                  showAlert("取消点赞");
                }
              } else {
                showAlert("后端请求失败,请稍后再试");
              }
            } catch (e) {
              showAlert("解析 JSON 失败");
              console.error("解析 PHP 后端返回失败：", e);
            }
          } else {
            showAlert("请求失败, 状态码: " + xhr.status);
          }
          if (done) done();
        }
      };
      xhr.send(JSON.stringify(bodyData));
    }

    function likeBackend(delta, done) {
      phpLike(delta, done);
    }

    window.goodplus = function(u, f) {
      if (isRequesting) return;
      var targetLiked = !getVisitorLiked(url);
      var delta = targetLiked ? 1 : -1;
      if (targetLiked) sendGAEvent();
      isRequesting = true;
      likeBackend(delta, function(){
        isRequesting = false;
      });
    };

    document.addEventListener('DOMContentLoaded', function() {
      setHeartLiked(getVisitorLiked(url));
      likeBackend(0);
    });
  }

  // =============== 主入口 ===============
  if (BLOG_LIKE_CONFIG.Backend === "Leancloud") {
    var s = document.createElement('script');
    s.src = "/Blog-Like/av-min.js";
    s.onload = mainLeancloud;
    s.onerror = function() {
      showAlert("LeanCloud SDK 文件加载失败，请检查 av-min.js 是否存在且未损坏！");
      console.error("LeanCloud SDK 加载失败: /Blog-Like/av-min.js");
    };
    document.head.appendChild(s);
  } else if (BLOG_LIKE_CONFIG.Backend === "PHP") {
    mainPHP();
  } else {
    mainCloudflare();
  }
})();