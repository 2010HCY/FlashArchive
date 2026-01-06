(function() {
  var totalElement = document.getElementById('totalPages');
  if (!totalElement) return;

  var totalPages = parseInt(totalElement.dataset.totalPages, 10) || 1;
  var currentPage = parseInt(totalElement.dataset.currentPage, 10) || 1;

  function jump(p) {
    var segments = window.location.pathname.split('/').filter(Boolean);
    
    if (segments.length > 0) {
      var lastSegment = segments[segments.length - 1];
      if (/^(index|\d+)\.html$/.test(lastSegment) || /^\d+$/.test(lastSegment)) {
        segments.pop();
      }
    }
    var basePath = '/' + segments.join('/');
    if (!basePath.endsWith('/')) basePath += '/';

    if (p === 1) {
      window.location.href = basePath;
    } else {
      window.location.href = basePath + p + '.html';
    }
  }

  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var pageNumbersContainer = document.getElementById('pageNumbers');

  if (prevBtn) {
    prevBtn.onclick = function() { if (currentPage > 1) jump(currentPage - 1); };
    prevBtn.disabled = (currentPage === 1);
  }
  if (nextBtn) {
    nextBtn.onclick = function() { if (currentPage < totalPages) jump(currentPage + 1); };
    nextBtn.disabled = (currentPage === totalPages);
  }
  
  if (pageNumbersContainer && totalPages > 1) {
    pageNumbersContainer.innerHTML = '';
    for(var i = 1; i <= totalPages; i++) {
      (function(p) {
        var span = document.createElement('span'); 
        span.textContent = i;
        span.style.cursor = 'pointer';
        span.style.margin = '0 8px';
        if(i === currentPage) {
          span.style.color = 'rgb(163, 163, 0)';
          span.style.fontWeight = 'bold';
        }
        span.onclick = function() { jump(p); };
        pageNumbersContainer.appendChild(span);
      })(i);
    }
  }
})();