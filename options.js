document.addEventListener('DOMContentLoaded', () => {
  const whitelistUrlInput = document.getElementById('whitelistUrl');
  const addWhitelistBtn = document.getElementById('addWhitelist');
  const whitelistItemsDiv = document.getElementById('whitelistItems');
  const reportContent = document.getElementById('reportContent');

  // Load Whitelist
  function loadWhitelist() {
    chrome.storage.local.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      whitelistItemsDiv.innerHTML = '';
      whitelist.forEach((url, index) => {
        const item = document.createElement('div');
        item.innerHTML = `
          <span>${url}</span>
          <button class="remove" data-index="${index}">Remove</button>
        `;
        whitelistItemsDiv.appendChild(item);
      });
    });
  }

  // Add to Whitelist
  addWhitelistBtn.addEventListener('click', () => {
    const url = whitelistUrlInput.value.trim();
    if (url) {
      chrome.storage.local.get(['whitelist'], (result) => {
        const whitelist = result.whitelist || [];
        if (!whitelist.includes(url)) {
          whitelist.push(url);
          chrome.storage.local.set({ whitelist }, () => {
            whitelistUrlInput.value = '';
            loadWhitelist();
          });
        }
      });
    }
  });

  // Remove from Whitelist
  whitelistItemsDiv.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      chrome.storage.local.get(['whitelist'], (result) => {
        const whitelist = result.whitelist || [];
        whitelist.splice(index, 1);
        chrome.storage.local.set({ whitelist }, loadWhitelist);
      });
    }
  });

  // Load Reports
  function loadReports() {
    chrome.storage.local.get(['sessions'], (result) => {
      const sessionsByDate = result.sessions || {};
      reportContent.innerHTML = '';
      
      const dates = Object.keys(sessionsByDate).sort().reverse();
      dates.forEach(date => {
        const segments = sessionsByDate[date];
        const totalDuration = segments.reduce((acc, seg) => acc + (seg.duration || 0), 0);
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${date}</td>
          <td>${segments.length}</td>
          <td>${formatDuration(totalDuration)}</td>
        `;
        reportContent.appendChild(row);
      });
    });
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  loadWhitelist();
  loadReports();
});
