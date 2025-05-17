(function () {
  async function fetchVisitorStats() {
    const hostname = window.location.hostname;
    const target = hostname + window.location.pathname;
    const baseUrl = `https://teahush.link/visitor-count?target=${encodeURIComponent(target)}`;
    try {
      await fetch(baseUrl, { method: 'POST', credentials: 'include' });
      const visitorTracked = getCookie('visitorTracked');
      if (!visitorTracked) {
        await fetch(`${baseUrl}&newVisitor=true`, { method: 'POST', credentials: 'include' });
      }
      const response = await fetch(baseUrl, { method: 'GET', credentials: 'include' });
      if (!response.ok) {
        if (response.status === 429 && (response.statusText === "Too Many Requests" || response.statusText === "TOO MANY REQUESTS")) {
          console.error('已达到速率限制，获取失败：429 (Too Many Requests)');
        } else {
          console.error('获取统计数据失败，状态码：' + response.status);
        }
        throw new Error();
      }
      const data = await response.json();
      updateStatistics(data);
      if (!visitorTracked) setCookie('visitorTracked', 'true', 365);
    } catch (error) {
    }
  }
  function updateStatistics(data) {
    const updateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value || 0;
      }
    };
    updateElement('PageMeter_site_uv', data.site?.visitor_count);
    updateElement('PageMeter_site_pv', data.site?.visit_count);
    updateElement('PageMeter_page_uv', data.page?.visitor_count);
    updateElement('PageMeter_page_pv', data.page?.visit_count);
  }
  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  }
  function getCookie(name) {
    const cookies = document.cookie.split(';');
    for (let c of cookies) {
      const trimmed = c.trim();
      if (trimmed.startsWith(`${name}=`)) return trimmed.substring(name.length + 1);
    }
    return null;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchVisitorStats);
  } else {
    fetchVisitorStats();
  }
  // setInterval(fetchVisitorStats, 60000); // 可选，每 60 秒刷新统计数据
})();