let currentSession = null;      // active distraction or study segment
let studyDayStart = null;       // when the user started studying today
let startTimer = null;
const START_DELAY = 5000;
const IDLE_THRESHOLD = 60;

// ─── Whitelist helpers ────────────────────────────────────────────────────────

async function isWhitelisted(url) {
  if (!url) return false;
  return new Promise((resolve) => {
    chrome.storage.local.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      resolve(whitelist.some(item => url.includes(item)));
    });
  });
}

// ─── Segment tracking ─────────────────────────────────────────────────────────
// Each segment: { type: 'study'|'distraction', startTime, url }

function attemptStartSegment(url, type) {
  clearTimeout(startTimer);
  // Distractions wait 5s (soft timer); study pages start immediately
  const delay = type === 'distraction' ? START_DELAY : 0;
  startTimer = setTimeout(() => {
    if (!currentSession) startSegment(url, type);
  }, delay);
}

function startSegment(url, type) {
  if (currentSession) return;

  // Record overall study day start on first activity
  if (!studyDayStart) studyDayStart = Date.now();

  currentSession = { type, url, startTime: Date.now() };
  console.log(`Segment started [${type}]:`, url);
  chrome.runtime.sendMessage({ action: 'statusUpdate', status: type }).catch(() => {});
}

async function endSegment() {
  clearTimeout(startTimer);
  if (!currentSession) return;

  const endTime = Date.now();
  const duration = Math.floor((endTime - currentSession.startTime) / 1000);
  const segment = {
    type: currentSession.type,
    startTime: currentSession.startTime,
    endTime,
    duration,
    url: currentSession.url
  };

  const dateKey = new Date(currentSession.startTime).toISOString().split('T')[0];

  await new Promise((resolve) => {
    chrome.storage.local.get(['segments'], (result) => {
      const segments = result.segments || {};
      if (!segments[dateKey]) segments[dateKey] = [];
      segments[dateKey].push(segment);
      chrome.storage.local.set({ segments }, resolve);
    });
  });

  console.log('Segment saved:', segment);
  currentSession = null;
  chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'idle' }).catch(() => {});
}

// ─── Tab monitoring ───────────────────────────────────────────────────────────

async function checkCurrentTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
    if (tabs.length === 0) { await endSegment(); return; }

    const tab = tabs[0];
    const whitelisted = await isWhitelisted(tab.url);
    const newType = whitelisted ? 'study' : 'distraction';

    if (!currentSession) {
      attemptStartSegment(tab.url, newType);
    } else if (currentSession.type !== newType || currentSession.url !== tab.url) {
      // Switched study ↔ distraction, or navigated to a different URL
      await endSegment();
      attemptStartSegment(tab.url, newType);
    }
    // Same type + same URL → keep counting
  });
}

chrome.tabs.onActivated.addListener(checkCurrentTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') checkCurrentTab();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) endSegment();
  else checkCurrentTab();
});

chrome.idle.setDetectionInterval(IDLE_THRESHOLD);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') endSegment();
});

// ─── Report generation ────────────────────────────────────────────────────────

async function generateReport() {
  await endSegment(); // save any in-progress segment first

  const dateKey = new Date().toISOString().split('T')[0];

  return new Promise((resolve) => {
    chrome.storage.local.get(['segments'], (result) => {
      const segments = (result.segments || {})[dateKey] || [];

      const studySegs       = segments.filter(s => s.type === 'study');
      const distractionSegs = segments.filter(s => s.type === 'distraction');

      const totalStudy       = studySegs.reduce((a, s) => a + s.duration, 0);
      const totalDistraction = distractionSegs.reduce((a, s) => a + s.duration, 0);
      const totalTracked     = totalStudy + totalDistraction;

      // Group distractions by domain
      const byDomain = {};
      distractionSegs.forEach(s => {
        const domain = extractDomain(s.url);
        byDomain[domain] = (byDomain[domain] || 0) + s.duration;
      });

      const productivityPct = totalTracked > 0
        ? Math.round((totalStudy / totalTracked) * 100)
        : 0;

      const sessionDuration = studyDayStart
        ? Math.floor((Date.now() - studyDayStart) / 1000)
        : totalTracked;

      const report = {
        date: dateKey,
        sessionDuration,
        totalStudy,
        totalDistraction,
        productivityPct,
        studySegments: studySegs,
        distractionSegments: distractionSegs,
        distractionByDomain: byDomain,
        recommendations: buildRecommendations(productivityPct, byDomain, totalDistraction)
      };

      studyDayStart = null; // reset for next session
      resolve(report);
    });
  });
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function buildRecommendations(pct, byDomain, totalDistraction) {
  const tips = [];

  if (pct >= 80) {
    tips.push('Excellent focus! You stayed on task for most of your session.');
  } else if (pct >= 60) {
    tips.push('Good effort — you were productive for most of your session, but there is room to improve.');
  } else if (pct >= 40) {
    tips.push('You spent roughly as much time distracted as studying. Try the Pomodoro technique: 25 min focused, 5 min break.');
  } else {
    tips.push('Most of your session was spent off-task. Consider using a site blocker during your study blocks.');
  }

  const topDomain = Object.entries(byDomain).sort((a, b) => b[1] - a[1])[0];
  if (topDomain && topDomain[1] > 60) {
    tips.push(`Your biggest distraction was ${topDomain[0]} (${formatDuration(topDomain[1])}). Consider adding it to your whitelist or scheduling it as a reward after studying.`);
  }

  if (totalDistraction > 3600) {
    tips.push('You spent over an hour off-task. Try setting a visible countdown timer to stay accountable.');
  }

  return tips;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stopSession') {
    endSegment();

  } else if (message.action === 'getStatus') {
    sendResponse({
      active: !!currentSession,
      type: currentSession?.type ?? null,
      startTime: currentSession?.startTime ?? null,
      url: currentSession?.url ?? null,
      studyDayStart
    });

  } else if (message.action === 'endStudyDay') {
    generateReport().then(report => sendResponse({ report }));
    return true; // keep message channel open for async response

  } else if (message.action === 'clearDay') {
    const dateKey = new Date().toISOString().split('T')[0];
    chrome.storage.local.get(['segments'], (result) => {
      const segments = result.segments || {};
      delete segments[dateKey];
      chrome.storage.local.set({ segments });
    });
    studyDayStart = null;
  }
});
