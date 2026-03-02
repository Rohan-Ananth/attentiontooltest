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

  let activeStartTime = null;
  let activeType      = null;

  // ── Options link ─────────────────────────────────────────────────────────────
  optionsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
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

  // ── Live ticker ───────────────────────────────────────────────────────────────
  function applyStatus(session, dayStart) {
    activeStartTime = session ? session.startTime : null;
    activeType      = session ? session.type      : null;
    setStatus(session ? session.type : null);
  }

  function updateUI() {
    const today = new Date().toISOString().split('T')[0];

    chrome.storage.local.get(['segments', '_liveState'], (result) => {
      const segments = ((result.segments || {})[today]) || [];

      const savedStudy  = segments.filter(s => s.type === 'study')
                                  .reduce((a, s) => a + s.duration, 0);
      const savedDist   = segments.filter(s => s.type === 'distraction')
                                  .reduce((a, s) => a + s.duration, 0);

      const liveSecs = activeStartTime
        ? Math.floor((Date.now() - activeStartTime) / 1000)
        : 0;

      studyTimeEl.textContent    = fmt(savedStudy + (activeType === 'study'       ? liveSecs : 0));
      distractTimeEl.textContent = fmt(savedDist  + (activeType === 'distraction' ? liveSecs : 0));

      // Use persisted _liveState as immediate source of truth
      // (available even when the service worker is asleep)
      const live = result._liveState;
      if (live) {
        applyStatus(live.currentSession, live.studyDayStart);
      }
    });

    // Also try messaging the background for the freshest state —
    // this will wake the service worker if it's asleep
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      // Background is awake and responded — use its authoritative state
      activeStartTime = response.active ? response.startTime : null;
      activeType      = response.active ? response.type      : null;
      setStatus(response.type);
    });
  }

  // ── Done Studying ─────────────────────────────────────────────────────────────
  // FIX: MV3 service workers unreliably keep message channels open for async
  // responses. Instead, we tell the background to generate + STORE the report,
  // then read it directly from chrome.storage.local.
  doneBtn.addEventListener('click', () => {
    doneBtn.disabled    = true;
    doneBtn.textContent = 'Generating…';

    chrome.runtime.sendMessage({ action: 'endStudyDay' }, () => {
      // Background has stored the report in storage under 'lastReport'.
      // Poll until it appears (handles service worker wake-up delay).
      pollForReport(0);
    });
  });

  function pollForReport(attempts) {
    if (attempts > 20) {
      // Gave up after ~4s — show a fallback error state
      doneBtn.disabled    = false;
      doneBtn.textContent = 'Try again';
      return;
    }

    chrome.storage.local.get(['lastReport'], (result) => {
      if (result.lastReport) {
        renderReport(result.lastReport);
        // Clear it so a fresh session starts clean
        chrome.storage.local.remove('lastReport');
        doneBtn.textContent = 'Session ended';
      } else {
        setTimeout(() => pollForReport(attempts + 1), 200);
      }
    });
  }

  // ── Report rendering ──────────────────────────────────────────────────────────
  function renderReport(r) {
    const pct = r.productivityPct;
    const color = pct >= 70 ? '#2d6a4f' : pct >= 40 ? '#d97706' : '#c0392b';

    pctHero.textContent  = `${pct}%`;
    pctHero.style.color  = color;
    pctSub.textContent   = pct >= 70 ? 'Great session.'
                         : pct >= 40 ? 'Room to improve.'
                         : 'Lots to work on.';

    reportRows.innerHTML = `
      <div class="report-row">
        <span class="report-row-label">Session duration</span>
        <span class="report-row-val">${fmt(r.sessionDuration)}</span>
      </div>
      <div class="report-row">
        <span class="report-row-label">Study time</span>
        <span class="report-row-val" style="color:#2d6a4f">${fmt(r.totalStudy)}</span>
      </div>
      <div class="report-row">
        <span class="report-row-label">Distraction time</span>
        <span class="report-row-val" style="color:#c0392b">${fmt(r.totalDistraction)}</span>
      </div>
    `;

    const domains = Object.entries(r.distractionByDomain).sort((a, b) => b[1] - a[1]);
    if (domains.length > 0) {
      distractionItems.innerHTML = domains.map(([domain, secs]) => `
        <div class="distraction-item">
          <span class="distraction-domain">${domain}</span>
          <span class="distraction-dur">${fmt(secs)}</span>
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

  // ── Format duration ───────────────────────────────────────────────────────────
  function fmt(seconds) {
    if (!seconds || seconds < 1) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  // ── Background status push ────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statusUpdate') updateUI();
  });

  updateUI();
  setInterval(updateUI, 1000);
});
