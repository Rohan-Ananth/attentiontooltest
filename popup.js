document.addEventListener('DOMContentLoaded', () => {
  const statusEl      = document.getElementById('status');
  const studyTimeEl   = document.getElementById('studyTime');
  const distractTimeEl = document.getElementById('distractTime');
  const doneBtn       = document.getElementById('doneBtn');
  const reportSection = document.getElementById('reportSection');
  const reportEl      = document.getElementById('report');

  let activeStartTime = null;
  let activeType = null;

  // ─── Live ticker ───────────────────────────────────────────────────────────

  function updateUI() {
    const today = new Date().toISOString().split('T')[0];

    chrome.storage.local.get(['segments'], (result) => {
      const segments = ((result.segments || {})[today]) || [];

      const savedStudy       = segments.filter(s => s.type === 'study')
                                       .reduce((a, s) => a + s.duration, 0);
      const savedDistraction = segments.filter(s => s.type === 'distraction')
                                       .reduce((a, s) => a + s.duration, 0);

      // Add live time from the currently active segment
      const liveSeconds = activeStartTime
        ? Math.floor((Date.now() - activeStartTime) / 1000)
        : 0;

      const studyTotal       = savedStudy       + (activeType === 'study'       ? liveSeconds : 0);
      const distractionTotal = savedDistraction + (activeType === 'distraction' ? liveSeconds : 0);

      studyTimeEl.textContent    = formatDuration(studyTotal);
      distractTimeEl.textContent = formatDuration(distractionTotal);
    });

    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      activeStartTime = response.active ? response.startTime : null;
      activeType      = response.active ? response.type : null;

      if (response.type === 'study') {
        statusEl.textContent = '📖 Studying';
        statusEl.style.color = '#16a34a';
      } else if (response.type === 'distraction') {
        statusEl.textContent = '⚠️ Off-task';
        statusEl.style.color = '#dc2626';
      } else {
        statusEl.textContent = '⏸ Idle';
        statusEl.style.color = '#6b7280';
      }
    });
  }

  // ─── Done Studying → generate report ───────────────────────────────────────

  doneBtn.addEventListener('click', () => {
    doneBtn.disabled = true;
    doneBtn.textContent = 'Generating…';

    chrome.runtime.sendMessage({ action: 'endStudyDay' }, (response) => {
      if (!response?.report) {
        doneBtn.disabled = false;
        doneBtn.textContent = 'Done Studying';
        return;
      }
      renderReport(response.report);
      doneBtn.textContent = 'Session Ended';
    });
  });

  function renderReport(r) {
    const pctColor = r.productivityPct >= 70 ? '#16a34a'
                   : r.productivityPct >= 40 ? '#d97706'
                   : '#dc2626';

    const domainRows = Object.entries(r.distractionByDomain)
      .sort((a, b) => b[1] - a[1])
      .map(([domain, secs]) =>
        `  • ${domain}: ${formatDuration(secs)}`
      ).join('\n') || '  None';

    const tips = r.recommendations.map(t => `  💡 ${t}`).join('\n');

    reportEl.innerHTML = `
<span style="font-size:22px;font-weight:bold;color:${pctColor}">${r.productivityPct}% productive</span>

🕐 Session duration:   ${formatDuration(r.sessionDuration)}
📖 Study time:         ${formatDuration(r.totalStudy)}
📺 Distraction time:   ${formatDuration(r.totalDistraction)}

Top distractions:
${domainRows}

Recommendations:
${tips}
    `.trim();

    reportSection.style.display = 'block';
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  // ─── Listen for background pushes ──────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statusUpdate') updateUI();
  });

  updateUI();
  setInterval(updateUI, 1000);
});
