document.addEventListener('DOMContentLoaded', () => {
  const whitelistUrlInput = document.getElementById('whitelistUrl');
  const addWhitelistBtn   = document.getElementById('addWhitelist');
  const whitelistItemsDiv = document.getElementById('whitelistItems');
  const reportContent     = document.getElementById('reportContent');
  const feedbackPill      = document.getElementById('feedback');

  // ── Feedback helper ──────────────────────────────────────────────────────────
  // NOTE: CSS variables (var(--x)) do NOT work via element.style in JS.
  // Using real hex values here instead.
  function showFeedback(msg, isError = false) {
    feedbackPill.textContent       = msg;
    feedbackPill.style.background  = isError ? '#fdf0ee' : '#e8f5e2';
    feedbackPill.style.color       = isError ? '#c0392b' : '#2d6a4f';
    feedbackPill.style.opacity     = '1';
    clearTimeout(feedbackPill._timer);
    feedbackPill._timer = setTimeout(() => {
      feedbackPill.style.opacity = '0';
    }, 2000);
  }

  // ── Whitelist ────────────────────────────────────────────────────────────────
  async function loadWhitelist() {
    const result   = await chrome.storage.local.get(['whitelist']);
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
  }

  addWhitelistBtn.addEventListener('click', async () => {
    const url = whitelistUrlInput.value.trim();

    if (!url) {
      showFeedback('Type a domain first', true);
      return;
    }

    try {
      const result    = await chrome.storage.local.get(['whitelist']);
      const whitelist = result.whitelist || [];

      if (whitelist.includes(url)) {
        showFeedback('Already added');
        return;
      }

      whitelist.push(url);
      await chrome.storage.local.set({ whitelist });

      whitelistUrlInput.value = '';
      showFeedback('Added ✓');
      await loadWhitelist();

    } catch (err) {
      console.error('Whitelist save error:', err);
      showFeedback('Error: ' + err.message, true);
    }
  });

  // Press Enter to add
  whitelistUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWhitelistBtn.click();
  });

  // Remove items
  whitelistItemsDiv.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('wl-remove')) return;
    const index = parseInt(e.target.getAttribute('data-index'));

    try {
      const result    = await chrome.storage.local.get(['whitelist']);
      const whitelist = result.whitelist || [];
      whitelist.splice(index, 1);
      await chrome.storage.local.set({ whitelist });
      showFeedback('Removed');
      await loadWhitelist();
    } catch (err) {
      console.error('Whitelist remove error:', err);
    }
  });

  // ── Reports ──────────────────────────────────────────────────────────────────
  async function loadReports() {
    const result         = await chrome.storage.local.get(['segments']);
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

      // Real hex colors — CSS vars don't work in inline JS styles
      const barColor = pct >= 70 ? '#2d6a4f'
                     : pct >= 40 ? '#d97706'
                     : '#c0392b';

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
        <td style="font-family:monospace;font-size:12px;color:#6b6760">
          ${studySegs.length + distractionSegs.length}
        </td>
      `;
      reportContent.appendChild(row);
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
