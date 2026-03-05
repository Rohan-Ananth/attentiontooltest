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
  const showMoreBtn        = document.getElementById('showMoreBtn');
  const showMoreWrap       = document.getElementById('showMoreWrap');

  // Auth elements
  const authStatusEl       = document.getElementById('authStatus');
  const authUserEl         = document.getElementById('authUser');
  const signOutBtn         = document.getElementById('signOutBtn');
  const signInLink         = document.getElementById('signInLink');

  // History pagination
  const HISTORY_PAGE_SIZE = 15;
  let historyVisibleCount = HISTORY_PAGE_SIZE;

  // ── Auth check ──────────────────────────────────────────────────────────────
  async function checkAuth() {
    try {
      const user = await StudyAuth.getCurrentUser();
      if (user) {
        authUserEl.textContent     = user.displayName || user.email;
        authStatusEl.style.display = 'inline';
        signInLink.style.display   = 'none';
      } else {
        authStatusEl.style.display = 'none';
        signInLink.style.display   = 'inline';
      }
    } catch {
      // Auth not configured yet — hide both, extension works without auth
      authStatusEl.style.display = 'none';
      signInLink.style.display   = 'none';
    }
  }

  signOutBtn.addEventListener('click', async () => {
    await StudyAuth.signOut();
    authStatusEl.style.display = 'none';
    signInLink.style.display   = 'inline';
  });

  signInLink.addEventListener('click', (e) => {
    e.preventDefault();
    const loginUrl = chrome.runtime.getURL('login.html');
    window.open(loginUrl, 'study-login', 'width=900,height=600');
  });

  // Listen for successful auth from login window
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'AUTH_SUCCESS') {
      checkAuth();
    }
  });

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
    themeToggle.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
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
    window.open(url, 'study-timer', 'width=700,height=600');
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
        <button class="wl-remove" data-index="${index}" aria-label="Remove ${url}">Remove</button>
      `;
      whitelistItemsDiv.appendChild(item);
    });
  }

  // ── Whitelist helpers ─────────────────────────────────────────────────────────
  function sanitizeDomain(input) {
    let cleaned = input.trim().toLowerCase();

    // Strip protocols
    cleaned = cleaned.replace(/^(https?:\/\/)/, '');
    // Strip www.
    cleaned = cleaned.replace(/^www\./, '');
    // Strip trailing slashes and paths
    cleaned = cleaned.replace(/\/.*$/, '');
    // Strip port numbers
    cleaned = cleaned.replace(/:\d+$/, '');
    // Strip leading/trailing dots
    cleaned = cleaned.replace(/^\.+|\.+$/g, '');

    return cleaned;
  }

  function isValidDomain(domain) {
    if (!domain || domain.length < 3) return false;
    if (!domain.includes('.')) return false;
    // Basic domain pattern: alphanumeric, hyphens, dots
    const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
    return pattern.test(domain);
  }

  addWhitelistBtn.addEventListener('click', async () => {
    const raw = whitelistUrlInput.value.trim();
    if (!raw) { showFeedback(feedbackPill, 'Type a domain first', true); return; }

    const domain = sanitizeDomain(raw);

    if (!isValidDomain(domain)) {
      showFeedback(feedbackPill, `"${raw}" doesn't look like a valid domain`, true);
      return;
    }

    try {
      const result   = await chrome.storage.local.get(['whitelist']);
      const whitelist = result.whitelist || [];
      // Case-insensitive duplicate check
      if (whitelist.some(w => w.toLowerCase() === domain)) {
        showFeedback(feedbackPill, 'Already added');
        return;
      }

      whitelist.push(domain);
      await chrome.storage.local.set({ whitelist });
      whitelistUrlInput.value = '';
      showFeedback(feedbackPill, `Added ${domain}`);
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

    // Theme: explicit setting > system preference > light
    const savedTheme = result.theme;
    if (savedTheme) {
      applyTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
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

    showFeedback(settingsFeedback, 'Saved');
  });

  // ── Data management ─────────────────────────────────────────────────────────
  exportBtn.addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['segments']);
    const segsByDate = result.segments || {};
    const lines = [['date', 'type', 'start', 'end', 'duration_s', 'url']];

    Object.entries(segsByDate).sort().forEach(([date, segs]) => {
      if (!Array.isArray(segs)) return;
      segs.forEach(s => {
        if (!validateSegment(s)) return;
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
    await loadStreakAndWeekly();
    await loadReports();
    showFeedback(settingsFeedback, 'Today cleared');
  });

  clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Delete ALL session history? This cannot be undone.')) return;
    await chrome.storage.local.remove('segments');
    chrome.runtime.sendMessage({ action: 'clearDay' }).catch(() => {});
    await loadStreakAndWeekly();
    await loadReports();
    showFeedback(settingsFeedback, 'All history cleared');
  });

  // ── History table with expandable rows & pagination ─────────────────────────
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
      showMoreWrap.style.display = 'none';
      return;
    }

    const visibleDates = dates.slice(0, historyVisibleCount);

    visibleDates.forEach((date, index) => {
      const rawSegs = segsByDate[date];
      const segs = Array.isArray(rawSegs)
        ? rawSegs.filter(s => validateSegment(s) !== null)
        : [];
      if (segs.length === 0) return;

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
      summaryRow.setAttribute('tabindex', '0');
      summaryRow.setAttribute('role', 'button');
      summaryRow.setAttribute('aria-expanded', 'false');
      summaryRow.setAttribute('aria-label', `${date}: ${formatDuration(totalStudy)} study, ${pct}% focus. Click to expand.`);
      summaryRow.innerHTML = `
        <td class="date-cell">
          <span class="expand-icon" aria-hidden="true">&#9654;</span>${date}
        </td>
        <td class="dur-study">${formatDuration(totalStudy)}</td>
        <td class="dur-dist">${totalDist > 0 ? formatDuration(totalDist) : '—'}</td>
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
        const domain = extractHostname(s.url) || s.url;
        segRow.innerHTML = `
          <td class="${typeClass}">${s.type}</td>
          <td>${start} – ${end}</td>
          <td>${formatDuration(s.duration)}</td>
          <td colspan="2" style="color:var(--ink-3);font-size:11px">${domain}</td>
        `;
        detailBody.appendChild(segRow);
      });
      table.appendChild(detailBody);

      // Toggle expand on summary row click or keyboard
      function toggleExpand() {
        const open = detailBody.classList.toggle('open');
        summaryRow.querySelector('.date-cell').classList.toggle('open', open);
        summaryRow.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      summaryRow.addEventListener('click', toggleExpand);
      summaryRow.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); }
      });
    });

    // Show/hide "Show more" button
    if (dates.length > historyVisibleCount) {
      showMoreWrap.style.display = 'block';
    } else {
      showMoreWrap.style.display = 'none';
    }
  }

  showMoreBtn.addEventListener('click', () => {
    historyVisibleCount += HISTORY_PAGE_SIZE;
    loadReports();
  });

  // ── Streak & Weekly Summary ──────────────────────────────────────────────────
  async function loadStreakAndWeekly() {
    const result     = await chrome.storage.local.get(['segments']);
    const segsByDate = result.segments || {};
    const allDates   = Object.keys(segsByDate).sort();

    // ── Streak calculation ──────────────────────────────────────────────────
    const today    = new Date();
    const todayKey = today.toISOString().split('T')[0];

    function dateKey(d) { return d.toISOString().split('T')[0]; }
    function prevDay(d) {
      const p = new Date(d);
      p.setDate(p.getDate() - 1);
      return p;
    }

    // Current streak: count backwards from today (or yesterday if no session today yet)
    let currentStreak = 0;
    let cursor = new Date(today);
    // If today has data, start counting from today; otherwise from yesterday
    if (!segsByDate[dateKey(cursor)]) {
      cursor = prevDay(cursor);
    }
    while (segsByDate[dateKey(cursor)]) {
      currentStreak++;
      cursor = prevDay(cursor);
    }

    // Longest streak
    let longestStreak = 0;
    let tempStreak    = 0;
    let prevDate      = null;
    allDates.forEach(d => {
      if (prevDate) {
        const expected = new Date(prevDate);
        expected.setDate(expected.getDate() + 1);
        if (dateKey(expected) === d) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDate = d;
    });

    document.getElementById('currentStreak').textContent = currentStreak;
    document.getElementById('currentStreakUnit').textContent = currentStreak === 1 ? 'day' : 'days';
    document.getElementById('longestStreak').textContent = longestStreak;
    document.getElementById('longestStreakUnit').textContent = longestStreak === 1 ? 'day' : 'days';

    // ── This week's data ────────────────────────────────────────────────────
    // Get Monday of current week
    const monday = new Date(today);
    const dayOfWeek = monday.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // adjust so Monday = 0
    monday.setDate(monday.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      weekDays.push(dateKey(d));
    }
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    let weekStudyTotal = 0;
    let weekDistTotal  = 0;
    let weekDaysWithData = 0;
    const weekDayStudy = [];

    weekDays.forEach(dk => {
      const rawSegs = segsByDate[dk] || [];
      const segs = Array.isArray(rawSegs) ? rawSegs.filter(s => validateSegment(s) !== null) : [];
      const study = segs.filter(s => s.type === 'study').reduce((a, s) => a + s.duration, 0);
      const dist  = segs.filter(s => s.type === 'distraction').reduce((a, s) => a + s.duration, 0);
      weekStudyTotal += study;
      weekDistTotal  += dist;
      weekDayStudy.push(study);
      if (segs.length > 0) weekDaysWithData++;
    });

    const weekTotal   = weekStudyTotal + weekDistTotal;
    const weekAvgPct  = weekTotal > 0 ? Math.round((weekStudyTotal / weekTotal) * 100) : 0;

    document.getElementById('weekStudy').textContent = formatDuration(weekStudyTotal);
    document.getElementById('weekAvgFocus').textContent = weekAvgPct + '%';

    // ── Heatmap ─────────────────────────────────────────────────────────────
    const heatmapRow = document.getElementById('heatmapRow');
    heatmapRow.innerHTML = '';

    const maxStudy = Math.max(...weekDayStudy, 1); // avoid div by zero

    weekDays.forEach((dk, i) => {
      const study   = weekDayStudy[i];
      const ratio   = study / maxStudy;
      // Map to opacity: no data = 0.08, some data = 0.15–1.0
      const opacity = study === 0 ? 0.08 : 0.15 + ratio * 0.85;

      const isToday = dk === todayKey;
      const hours   = study >= 3600
        ? (study / 3600).toFixed(1) + 'h'
        : study >= 60
          ? Math.floor(study / 60) + 'm'
          : study > 0
            ? study + 's'
            : '';

      const cell = document.createElement('div');
      cell.className = 'heatmap-day' + (isToday ? ' today' : '') + (opacity < 0.4 ? ' low' : '');
      cell.style.opacity = opacity;
      cell.innerHTML = `
        <span class="heatmap-day-label">${dayLabels[i]}</span>
        <span class="heatmap-day-hours">${hours}</span>
      `;
      cell.title = `${dk}: ${hours || 'No study'}`;
      heatmapRow.appendChild(cell);
    });
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  await checkAuth();
  await loadSettings();
  await loadWhitelist();
  await loadStreakAndWeekly();
  await loadReports();
});
