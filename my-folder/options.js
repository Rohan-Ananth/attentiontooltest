document.addEventListener('DOMContentLoaded', () => {
  const whitelistUrlInput = document.getElementById('whitelistUrl');
  const addWhitelistBtn   = document.getElementById('addWhitelist');
  const whitelistItemsDiv = document.getElementById('whitelistItems');
  const reportContent     = document.getElementById('reportContent');
  const feedbackPill      = document.getElementById('feedback');

  // ── Feedback helper ──────────────────────────────────────────────────────────
  function showFeedback(msg, isError = false) {
    feedbackPill.textContent = msg;
    feedbackPill.style.background = isError ? 'var(--warn-2)' : 'var(--accent-2)';
    feedbackPill.style.color      = isError ? 'var(--warn)'   : 'var(--accent)';
    feedbackPill.classList.add('show');
    setTimeout(() => feedbackPill.classList.remove('show'), 2000);
  }

  // ── Whitelist ────────────────────────────────────────────────────────────────
  function loadWhitelist() {
    chrome.storage.local.get('whitelist', (result) => {
      const whitelist = result.whitelist || [];
      whitelistItemsDiv.innerHTML = '';

      if (whitelist.length === 0) {
        whitelistItemsDiv.innerHTML = '<p class="wl-empty">No study spaces added yet.</p>';
        return;
      }

      whitelist.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'wl-item';
        item.innerHTML = `
          <span class="wl-domain">${url}</span>
          <button class="wl-remove" data-index="${index}">Remove</button>
        `;
        whitelistItemsDiv.appendChild(item);
      });
    });
  }

  addWhitelistBtn.addEventListener('click', () => {
    const url = whitelistUrlInput.value.trim();

    if (!url) {
      showFeedback('Type a domain first', true);
      return;
    }

    chrome.storage.local.get('whitelist', (result) => {
      if (chrome.runtime.lastError) {
        showFeedback('Storage error', true);
        return;
      }

      const whitelist = result.whitelist || [];

      if (whitelist.includes(url)) {
        showFeedback('Already added');
        return;
      }

      whitelist.push(url);
      chrome.storage.local.set({ whitelist }, () => {
        if (chrome.runtime.lastError) {
          showFeedback('Failed to save', true);
          return;
        }
        whitelistUrlInput.value = '';
        showFeedback('Added ✓');
        loadWhitelist();
      });
    });
  });

  // Allow pressing Enter in the input
  whitelistUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWhitelistBtn.click();
  });

  whitelistItemsDiv.addEventListener('click', (e) => {
    if (e.target.classList.contains('wl-remove')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      chrome.storage.local.get('whitelist', (result) => {
        const whitelist = result.whitelist || [];
        whitelist.splice(index, 1);
        chrome.storage.local.set({ whitelist }, () => {
          showFeedback('Removed');
          loadWhitelist();
        });
      });
    }
  });

  // ── Reports ──────────────────────────────────────────────────────────────────
  function loadReports() {
    chrome.storage.local.get('segments', (result) => {
      const segmentsByDate = result.segments || {};
      reportContent.innerHTML = '';

      const dates = Object.keys(segmentsByDate).sort().reverse();

      if (dates.length === 0) {
        reportContent.innerHTML = `
          <tr><td colspan="5" class="history-empty">
            No sessions recorded yet. Start studying to see your history here.
          </td></tr>`;
        return;
      }

      dates.forEach(date => {
        const segs = segmentsByDate[date];

        const studySegs       = segs.filter(s => s.type === 'study');
        const distractionSegs = segs.filter(s => s.type === 'distraction');

        const totalStudy       = studySegs.reduce((a, s) => a + s.duration, 0);
        const totalDistraction = distractionSegs.reduce((a, s) => a + s.duration, 0);
        const totalTracked     = totalStudy + totalDistraction;
        const pct              = totalTracked > 0 ? Math.round((totalStudy / totalTracked) * 100) : 0;

        const barColor = pct >= 70 ? 'var(--accent)'
                       : pct >= 40 ? '#d97706'
                       : 'var(--warn)';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="date-cell">${date}</td>
          <td class="dur-study">${formatDuration(totalStudy)}</td>
          <td class="dur-dist">${totalDistraction > 0 ? formatDuration(totalDistraction) : '—'}</td>
          <td>
            <div class="pct-wrap">
              <div class="pct-bar-bg">
                <div class="pct-bar-fill" style="width:${pct}%;background:${barColor}"></div>
              </div>
              <span class="pct-label" style="color:${barColor}">${pct}%</span>
            </div>
          </td>
          <td style="font-family:var(--mono);font-size:12px;color:var(--ink-2)">
            ${studySegs.length + distractionSegs.length}
          </td>
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
