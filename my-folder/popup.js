document.addEventListener('DOMContentLoaded', () => {
  const statusPill     = document.getElementById('statusPill');
  const statusDot      = document.getElementById('statusDot');
  const statusText     = document.getElementById('statusText');
  const studyTimeEl    = document.getElementById('studyTime');
  const distractTimeEl = document.getElementById('distractTime');
  const doneBtn        = document.getElementById('doneBtn');
  const reportSection  = document.getElementById('reportSection');
  const pctHero        = document.getElementById('pctHero');
  const pctSub         = document.getElementById('pctSub');
  const reportRows     = document.getElementById('reportRows');
  const distractionList  = document.getElementById('distractionList');
  const distractionItems = document.getElementById('distractionItems');
  const tipsList       = document.getElementById('tipsList');
  const tipsItems      = document.getElementById('tipsItems');
  const optionsLink    = document.getElementById('optionsLink');
  const progressRing   = document.getElementById('progressRing');
  const progressCircle = document.getElementById('progressCircle');
  const progressPct    = document.getElementById('progressPct');

  let activeStartTime = null;
  let activeType      = null;

  // Cached segment totals — only re-read from storage every 5 ticks
  let cachedStudy     = 0;
  let cachedDist      = 0;
  let tickCount       = 0;
  const CACHE_REFRESH = 5; // refresh storage cache every 5 seconds

  // ── SVG ring constants ────────────────────────────────────────────────────
  const RING_RADIUS       = 54;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  if (progressCircle) {
    progressCircle.style.strokeDasharray  = RING_CIRCUMFERENCE;
    progressCircle.style.strokeDashoffset = RING_CIRCUMFERENCE;
  }

  function setRingProgress(pct) {
    if (!progressCircle) return;
    const clamped = Math.max(0, Math.min(100, pct));
    const offset  = RING_CIRCUMFERENCE - (clamped / 100) * RING_CIRCUMFERENCE;
    progressCircle.style.strokeDashoffset = offset;

    // Color: blue ≥70%, amber ≥40%, red <40%
    const color = clamped >= 70 ? 'var(--accent)' : clamped >= 40 ? 'var(--amber)' : 'var(--warn)';
    progressCircle.style.stroke = color;
    if (progressPct) {
      progressPct.textContent = `${Math.round(clamped)}%`;
      progressPct.style.color = color;
    }
  }

  // ── Theme sync ──────────────────────────────────────────────────────────────
  chrome.storage.local.get(['theme'], (result) => {
    if (result.theme) {
      document.documentElement.setAttribute('data-theme', result.theme);
    }
  });

  // ── Options link ─────────────────────────────────────────────────────────────
  function openOptions() {
    const optionsUrl = chrome.runtime.getURL('options.html');
    try {
      const result = chrome.runtime.openOptionsPage();
      if (result && result.catch) {
        result.catch(() => window.open(optionsUrl, '_blank'));
      }
    } catch {
      window.open(optionsUrl, '_blank');
    }
  }

  optionsLink.addEventListener('click', openOptions);
  optionsLink.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOptions(); }
  });

  // ── Status UI helper ─────────────────────────────────────────────────────────
  function setStatus(type) {
    statusPill.className = 'status-pill';
    statusDot.className  = 'status-dot';

    if (type === 'study') {
      statusPill.classList.add('studying');
      statusDot.classList.add('pulse');
      statusText.textContent = 'Studying';
    } else if (type === 'distraction') {
      statusPill.classList.add('distracted');
      statusDot.classList.add('pulse');
      statusText.textContent = 'Off-task';
    } else {
      statusPill.classList.add('idle');
      statusText.textContent = 'Idle';
    }
  }

  // ── Live ticker ──────────────────────────────────────────────────────────────
  function applyStatus(session) {
    activeStartTime = session ? session.startTime : null;
    activeType      = session ? session.type      : null;
    setStatus(session ? session.type : null);
  }

  function updateUI() {
    tickCount++;

    // Refresh cached totals from storage periodically (not every tick)
    if (tickCount % CACHE_REFRESH === 1) {
      refreshCachedTotals();
    }

    // Compute live values from cache + active segment
    const liveSecs = activeStartTime
      ? Math.floor((Date.now() - activeStartTime) / 1000)
      : 0;

    const studyTotal    = cachedStudy + (activeType === 'study'       ? liveSecs : 0);
    const distractTotal = cachedDist  + (activeType === 'distraction' ? liveSecs : 0);

    studyTimeEl.textContent    = formatDuration(studyTotal);
    distractTimeEl.textContent = formatDuration(distractTotal);

    // Update progress ring
    const total = studyTotal + distractTotal;
    if (total > 0) {
      setRingProgress(Math.round((studyTotal / total) * 100));
    } else {
      setRingProgress(0);
    }
  }

  function refreshCachedTotals() {
    const today = new Date().toISOString().split('T')[0];

    chrome.storage.local.get(['segments', '_liveState'], (result) => {
      const segments = ((result.segments || {})[today]) || [];

      cachedStudy = segments.filter(s => s.type === 'study')
                            .reduce((a, s) => a + s.duration, 0);
      cachedDist  = segments.filter(s => s.type === 'distraction')
                            .reduce((a, s) => a + s.duration, 0);

      // Use persisted _liveState as immediate source of truth
      const live = result._liveState;
      if (live) {
        applyStatus(live.currentSession);
      }
    });

    // Also wake the service worker for freshest state
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      activeStartTime = response.active ? response.startTime : null;
      activeType      = response.active ? response.type      : null;
      setStatus(response.type);
    });
  }

  // ── Done Studying ───────────────────────────────────────────────────────────
  doneBtn.addEventListener('click', () => {
    doneBtn.disabled    = true;
    doneBtn.textContent = 'Generating…';

    chrome.runtime.sendMessage({ action: 'endStudyDay' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('sendMessage error:', chrome.runtime.lastError.message);
      }
      pollForReport(0);
    });
  });

  function pollForReport(attempts) {
    if (attempts > 20) {
      doneBtn.disabled    = false;
      doneBtn.textContent = 'Try again';
      return;
    }

    chrome.storage.local.get(['lastReport'], (result) => {
      if (result.lastReport) {
        renderReport(result.lastReport);
        chrome.storage.local.remove('lastReport');
        doneBtn.textContent = 'Session ended';
      } else {
        setTimeout(() => pollForReport(attempts + 1), 200);
      }
    });
  }

  // ── Report rendering ────────────────────────────────────────────────────────
  function renderReport(r) {
    const pct = r.productivityPct;
    const color = pct >= 70 ? 'var(--accent)' : pct >= 40 ? 'var(--amber)' : 'var(--warn)';

    pctHero.textContent  = `${pct}%`;
    pctHero.style.color  = color;
    pctSub.textContent   = pct >= 70 ? 'Great session.'
                         : pct >= 40 ? 'Room to improve.'
                         : 'Lots to work on.';

    reportRows.innerHTML = `
      <div class="report-row">
        <span class="report-row-label">Session duration</span>
        <span class="report-row-val">${formatDuration(r.sessionDuration)}</span>
      </div>
      <div class="report-row">
        <span class="report-row-label">Study time</span>
        <span class="report-row-val" style="color:var(--accent)">${formatDuration(r.totalStudy)}</span>
      </div>
      <div class="report-row">
        <span class="report-row-label">Distraction time</span>
        <span class="report-row-val" style="color:var(--warn)">${formatDuration(r.totalDistraction)}</span>
      </div>
    `;

    // Patterns section
    if (r.patterns) {
      let patternHtml = '';
      if (r.patterns.avgStudyBlockMinutes > 0) {
        patternHtml += `
          <div class="report-row">
            <span class="report-row-label">Avg focus block</span>
            <span class="report-row-val">${r.patterns.avgStudyBlockMinutes}m</span>
          </div>`;
      }
      if (r.patterns.distractionCadenceMinutes) {
        patternHtml += `
          <div class="report-row">
            <span class="report-row-label">Distraction every</span>
            <span class="report-row-val" style="color:var(--warn)">~${r.patterns.distractionCadenceMinutes}m</span>
          </div>`;
      }
      if (r.patterns.pomodoroFit) {
        patternHtml += `
          <div class="report-row">
            <span class="report-row-label">Suggested rhythm</span>
            <span class="report-row-val">${r.patterns.pomodoroFit.work}m work / ${r.patterns.pomodoroFit.break}m break</span>
          </div>`;
      }
      if (patternHtml) {
        reportRows.innerHTML += patternHtml;
      }
    }

    const domains = Object.entries(r.distractionByDomain).sort((a, b) => b[1] - a[1]);
    if (domains.length > 0) {
      distractionItems.innerHTML = domains.map(([domain, secs]) => `
        <div class="distraction-item">
          <span class="distraction-domain">${domain}</span>
          <span class="distraction-dur">${formatDuration(secs)}</span>
        </div>
      `).join('');
      distractionList.style.display = 'block';
    }

    if (r.recommendations?.length > 0) {
      tipsItems.innerHTML = r.recommendations.map(t =>
        `<p class="tip">${t}</p>`
      ).join('');
      tipsList.style.display = 'block';
    }

    reportSection.style.display = 'block';
  }

  // ── Background status push ──────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statusUpdate') {
      refreshCachedTotals();
      updateUI();
    }
  });

  // Initial load + start ticker
  refreshCachedTotals();
  updateUI();
  setInterval(updateUI, 1000);
});
