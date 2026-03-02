document.addEventListener('DOMContentLoaded', async () => {

  // ── Element refs ────────────────────────────────────────────────────────────
  const whitelistUrlInput  = document.getElementById('whitelistUrl');
  const addWhitelistBtn    = document.getElementById('addWhitelist');
  const whitelistItemsDiv  = document.getElementById('whitelistItems');
  const feedbackPill       = document.getElementById('feedback');
  const settingsFeedback   = document.getElementById('settingsFeedback');
  const graceInput         = document.getElementById('graceInput');
  const idleInput          = document.getElementById('idleInput');
  const saveSettingsBtn    = document.getElementById('saveSettings');
  const exportBtn          = document.getElementById('exportBtn');
  const clearTodayBtn      = document.getElementById('clearTodayBtn');
  const clearAllBtn        = document.getElementById('clearAllBtn');
  const themeToggle        = document.getElementById('themeToggle');
  const themeLabel         = document.getElementById('themeLabel');
  const lightBtn           = document.getElementById('lightBtn');
  const darkBtn            = document.getElementById('darkBtn');
  const openTimerBtn       = document.getElementById('openTimerBtn');

  // ── Feedback helper ─────────────────────────────────────────────────────────
  function showFeedback(pill, msg, isError = false) {
    pill.textContent      = msg;
    pill.style.background = isError ? '#fdf0ee' : '#e8f5e2';
    pill.style.color      = isError ? '#c0392b' : '#2d6a4f';
    pill.style.opacity    = '1';
    clearTimeout(pill._t);
    pill._t = setTimeout(() => { pill.style.opacity = '0'; }, 2000);
  }

  // ── Theme ───────────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
    lightBtn.style.borderColor = theme === 'light' ? '#2d6a4f' : '';
    lightBtn.style.color       = theme === 'light' ? '#2d6a4f' : '';
    darkBtn.style.borderColor  = theme === 'dark'  ? '#52b788' : '';
    darkBtn.style.color        = theme === 'dark'  ? '#52b788' : '';
  }

  async function setTheme(theme) {
    applyTheme(theme);
    await chrome.storage.local.set({ theme });
  }

  themeToggle.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme');
    await setTheme(current === 'dark' ? 'light' : 'dark');
  });
  lightBtn.addEventListener('click', () => setTheme('light'));
  darkBtn.addEventListener('click',  () => setTheme('dark'));

  // ── Open Timer ──────────────────────────────────────────────────────────────
  // Opens popup.html as a small standalone window
  openTimerBtn.addEventListener('click', () => {
    const url = chrome.runtime.getURL('popup.html');
    window.open(url, 'study-timer', 'width=310,height=520,resizable=no');
  });

  // ── Whitelist ───────────────────────────────────────────────────────────────
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
    if (!url) { showFeedback(feedbackPill, 'Type a domain first', true); return; }

    try {
      const result   = await chrome.storage.local.get(['whitelist']);
      const whitelist = result.whitelist || [];
      if (whitelist.includes(url)) { showFeedback(feedbackPill, 'Already added'); return; }

      whitelist.push(url);
      await chrome.storage.local.set({ whitelist });
      whitelistUrlInput.value = '';
      showFeedback(feedbackPill, 'Added ✓');
      await loadWhitelist();
    } catch (err) {
      showFeedback(feedbackPill, 'Error: ' + err.message, true);
    }
  });

  whitelistUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWhitelistBtn.click();
  });

  whitelistItemsDiv.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('wl-remove')) return;
    const index = parseInt(e.target.getAttribute('data-index'));
    const result = await chrome.storage.local.get(['whitelist']);
    const whitelist = result.whitelist || [];
    whitelist.splice(index, 1);
    await chrome.storage.local.set({ whitelist });
    showFeedback(feedbackPill, 'Removed');
    await loadWhitelist();
  });

  // ── Settings load / save ────────────────────────────────────────────────────
  async function loadSettings() {
    const result = await chrome.storage.local.get([
      'graceperiod',
      'gracePeriod',
      'idleThreshold',
      'theme',
    ]);
    const savedGrace = result.graceperiod ?? result.gracePeriod;
    if (savedGrace) graceInput.value = savedGrace;
    if (result.idleThreshold) idleInput.value = result.idleThreshold;
    const theme = result.theme || 'light';
    applyTheme(theme);
  }

  saveSettingsBtn.addEventListener('click', async () => {
    const grace = Math.max(1,   Math.min(60,  parseInt(graceInput.value) || 5));
    const idle  = Math.max(10,  Math.min(300, parseInt(idleInput.value)  || 60));
    graceInput.value = grace;
    idleInput.value  = idle;

    await chrome.storage.local.set({ graceperiod: grace, idleThreshold: idle });

    // Tell background.js to pick up the new values
    chrome.runtime.sendMessage({ action: 'updateSettings', graceperiod: grace, idleThreshold: idle })
      .catch(() => {}); // background may not be awake yet — that's fine, it reads on next start

    showFeedback(settingsFeedback, 'Saved ✓');
  });

  // ── Data management ─────────────────────────────────────────────────────────
  exportBtn.addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['segments']);
    const segsByDate = result.segments || {};
    const lines = [['date', 'type', 'start', 'end', 'duration_s', 'url']];

    Object.entries(segsByDate).sort().forEach(([date, segs]) => {
      segs.forEach(s => {
        lines.push([
          date,
          s.type,
          new Date(s.startTime).toISOString(),
          new Date(s.endTime).toISOString(),
          s.duration,
          s.url
        ]);
      });
    });

    const csv = lines.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `study-sessions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  clearTodayBtn.addEventListener('click', async () => {
    if (!confirm('Clear all of today\'s session data? This cannot be undone.')) return;
    const dateKey = new Date().toISOString().split('T')[0];
    const result  = await chrome.storage.local.get(['segments']);
    const segs    = result.segments || {};
    delete segs[dateKey];
    await chrome.storage.local.set({ segments: segs });
    chrome.runtime.sendMessage({ action: 'clearDay' }).catch(() => {});
    await loadReports();
    showFeedback(settingsFeedback, 'Today cleared');
  });

  clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Delete ALL session history? This cannot be undone.')) return;
    await chrome.storage.local.remove('segments');
    chrome.runtime.sendMessage({ action: 'clearDay' }).catch(() => {});
    await loadReports();
    showFeedback(settingsFeedback, 'All history cleared');
  });

  // ── History table with expandable rows ─────────────────────────────────────
  async function loadReports() {
    const result = await chrome.storage.local.get(['segments']);
    const segsByDate = result.segments || {};
    const table = document.querySelector('.history-table');
    if (!table) return;

    while (table.tBodies.length > 0) {
      table.removeChild(table.tBodies[0]);
    }

    const dates = Object.keys(segsByDate).sort().reverse();
    if (dates.length === 0) {
      const emptyBody = document.createElement('tbody');
      emptyBody.id = 'reportContent';
      emptyBody.innerHTML = `
        <tr><td colspan="5" class="history-empty">
          No sessions recorded yet. Start studying to see your history here.
        </td></tr>`;
      table.appendChild(emptyBody);
      return;
    }

    dates.forEach((date, index) => {
      const segs = segsByDate[date];
      const studySegs = segs.filter(s => s.type === 'study');
      const distSegs  = segs.filter(s => s.type === 'distraction');
      const totalStudy = studySegs.reduce((a, s) => a + s.duration, 0);
      const totalDist  = distSegs.reduce((a, s) => a + s.duration, 0);
      const total = totalStudy + totalDist;
      const pct   = total > 0 ? Math.round((totalStudy / total) * 100) : 0;
      const color = pct >= 70 ? '#2d6a4f' : pct >= 40 ? '#d97706' : '#c0392b';

      // tbody for the summary row
      const summaryBody = document.createElement('tbody');
      if (index === 0) summaryBody.id = 'reportContent';
      const summaryRow  = document.createElement('tr');
      summaryRow.className = 'summary-row';
      summaryRow.innerHTML = `
        <td class="date-cell">
          <span class="expand-icon">▶</span>${date}
        </td>
        <td class="dur-study">${fmt(totalStudy)}</td>
        <td class="dur-dist">${totalDist > 0 ? fmt(totalDist) : '—'}</td>
        <td>
          <div class="pct-wrap">
            <div class="pct-bar-bg">
              <div class="pct-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="pct-label" style="color:${color}">${pct}%</span>
          </div>
        </td>
        <td style="font-family:monospace;font-size:12px;color:var(--ink-2)">${segs.length}</td>
      `;
      summaryBody.appendChild(summaryRow);
      table.appendChild(summaryBody);

      // tbody for the detail rows
      const detailBody = document.createElement('tbody');
      detailBody.className = 'segment-rows';

      segs.forEach(s => {
        const segRow = document.createElement('tr');
        segRow.className = 'segment-row';
        const start = new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const end   = new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const typeClass = s.type === 'study' ? 'seg-study' : 'seg-dist';
        const domain = (() => { try { return new URL(s.url).hostname.replace('www.',''); } catch { return s.url; } })();
        segRow.innerHTML = `
          <td class="${typeClass}">${s.type}</td>
          <td>${start} – ${end}</td>
          <td>${fmt(s.duration)}</td>
          <td colspan="2" style="color:var(--ink-3);font-size:11px">${domain}</td>
        `;
        detailBody.appendChild(segRow);
      });
      table.appendChild(detailBody);

      // Toggle expand on summary row click
      summaryRow.addEventListener('click', () => {
        const open = detailBody.classList.toggle('open');
        summaryRow.querySelector('.date-cell').classList.toggle('open', open);
      });
    });
  }

  function fmt(seconds) {
    if (!seconds || seconds < 1) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  await loadSettings();
  await loadWhitelist();
  await loadReports();
});
