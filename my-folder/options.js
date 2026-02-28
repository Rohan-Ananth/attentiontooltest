document.addEventListener('DOMContentLoaded', () => {
  const whitelistUrlInput = document.getElementById('whitelistUrl');
  const addWhitelistBtn   = document.getElementById('addWhitelist');
  const whitelistItemsDiv = document.getElementById('whitelistItems');
  const reportContent     = document.getElementById('reportContent');

  // ─── Whitelist ──────────────────────────────────────────────────────────────

  function loadWhitelist() {
    chrome.storage.local.get('whitelist', (result) => {
      const whitelist = result.whitelist || [];
      whitelistItemsDiv.innerHTML = '';
      if (whitelist.length === 0) {
        whitelistItemsDiv.innerHTML = '<p style="color:#9ca3af;font-size:13px">No sites added yet.</p>';
        return;
      }
      whitelist.forEach((url, index) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px';
        item.innerHTML = `
          <span style="flex:1;font-size:14px">${url}</span>
          <button class="remove" data-index="${index}" style="color:red;background:none;border:1px solid red;border-radius:4px;padding:2px 8px;cursor:pointer">Remove</button>
        `;
        whitelistItemsDiv.appendChild(item);
      });
    });
  }

  addWhitelistBtn.addEventListener('click', () => {
    const url = whitelistUrlInput.value.trim();
    if (!url) {
      addWhitelistBtn.textContent = 'Type a URL first';
      setTimeout(() => { addWhitelistBtn.textContent = 'Add'; }, 1500);
      return;
    }

    chrome.storage.local.get('whitelist', (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        return;
      }
      const whitelist = result.whitelist || [];

      if (whitelist.includes(url)) {
        addWhitelistBtn.textContent = 'Already added!';
        setTimeout(() => { addWhitelistBtn.textContent = 'Add'; }, 1500);
        return;
      }

      whitelist.push(url);
      chrome.storage.local.set({ whitelist }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage set error:', chrome.runtime.lastError);
          return;
        }
        whitelistUrlInput.value = '';
        addWhitelistBtn.textContent = 'Added ✓';
        setTimeout(() => { addWhitelistBtn.textContent = 'Add'; }, 1500);
        loadWhitelist();
      });
    });
  });

  whitelistItemsDiv.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      chrome.storage.local.get('whitelist', (result) => {
        const whitelist = result.whitelist || [];
        whitelist.splice(index, 1);
        chrome.storage.local.set({ whitelist }, loadWhitelist);
      });
    }
  });

  // ─── Reports ────────────────────────────────────────────────────────────────

  function loadReports() {
    chrome.storage.local.get(['segments'], (result) => {
      const segmentsByDate = result.segments || {};
      reportContent.innerHTML = '';

      const dates = Object.keys(segmentsByDate).sort().reverse();
      if (dates.length === 0) {
        reportContent.innerHTML = '<tr><td colspan="5">No sessions recorded yet.</td></tr>';
        return;
      }

      dates.forEach(date => {
        const segs = segmentsByDate[date];

        const studySegs       = segs.filter(s => s.type === 'study');
        const distractionSegs = segs.filter(s => s.type === 'distraction');

        const totalStudy       = studySegs.reduce((a, s) => a + s.duration, 0);
        const totalDistraction = distractionSegs.reduce((a, s) => a + s.duration, 0);
        const totalTracked     = totalStudy + totalDistraction;
        const pct = totalTracked > 0 ? Math.round((totalStudy / totalTracked) * 100) : 0;

        const pctColor = pct >= 70 ? 'green' : pct >= 40 ? 'orange' : 'red';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${date}</td>
          <td style="color:green">${formatDuration(totalStudy)}</td>
          <td style="color:${distractionSegs.length > 0 ? 'red' : 'inherit'}">${formatDuration(totalDistraction)}</td>
          <td style="color:${pctColor};font-weight:bold">${pct}%</td>
          <td>${studySegs.length + distractionSegs.length}</td>
        `;
        reportContent.appendChild(row);
      });
    });
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  loadWhitelist();
  loadReports();
});
