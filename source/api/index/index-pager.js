(function() {
    
  var totalElement = document.getElementById('totalPages');
  var totalPages = totalElement ? parseInt(totalElement.dataset.totalPages, 10) : 1;

  var totalElement = document.getElementById('totalPages');
  var totalPages = parseInt(totalElement.dataset.totalPages, 10) || 1;
  var currentPage = parseInt(totalElement.dataset.currentPage, 10) || 1;

  function jump(p) {
      location.href = p === 1 ? '/' : '/' + p + '.html';
  }

  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var pageNumbersContainer = document.getElementById('pageNumbers');

  if (prevBtn) {
      prevBtn.onclick = function() { 
          if (currentPage > 1) jump(currentPage - 1);
      };
      prevBtn.disabled = currentPage === 1;
  }
  if (nextBtn) {
      nextBtn.onclick = function() { 
          if (currentPage < totalPages) jump(currentPage + 1);
      };
      nextBtn.disabled = currentPage === totalPages;
  }
  
  if (pageNumbersContainer && totalPages > 1) { 
      for(var i = 1; i <= totalPages; i++) {
          var span = document.createElement('span'); 
          span.textContent = i;
          
          span.onclick = (function(p) {
              return function() {
                  jump(p);
              };
          })(i);

          if(i === currentPage) {
              span.style.color = 'rgb(163, 163, 0)'; 
          }
          pageNumbersContainer.appendChild(span);
      }
  }
})();