importScripts('utils.js');

let currentSession = null;
let studyDayStart  = null;
let startTimer     = null;
let pendingStart   = null;  // { url, type, scheduledAt } — persisted so grace period survives restart

// Defaults — overridden by values saved in storage
let START_DELAY    = 5000;  // ms  (grace period before distraction counts)
let IDLE_THRESHOLD = 60;    // seconds

// ─── Persistence helpers ─────────────────────────────────────────────────────

const STATE_KEY = '_liveState';

async function persistState() {
  const state = {
    currentSession,
    studyDayStart,
    pendingStart
  };
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

async function restoreState() {
  const result = await chrome.storage.local.get([STATE_KEY, 'graceperiod', 'idleThreshold']);

  // Restore settings
  if (result.graceperiod)   START_DELAY    = result.graceperiod * 1000;
  if (result.idleThreshold) IDLE_THRESHOLD = result.idleThreshold;
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD);

  // Restore live state
  const saved = result[STATE_KEY];
  if (!saved) return;

  studyDayStart  = saved.studyDayStart  || null;
  currentSession = saved.currentSession || null;

  // If there was a pending grace-period start, check if the delay has elapsed
  if (saved.pendingStart) {
    const elapsed = Date.now() - saved.pendingStart.scheduledAt;
    const remaining = START_DELAY - elapsed;

    if (remaining <= 0) {
      // Grace period already passed while we were asleep — start the segment now
      if (!currentSession) {
        startSegment(saved.pendingStart.url, saved.pendingStart.type);
      }
    } else {
      // Still waiting — reschedule the remainder
      pendingStart = saved.pendingStart;
      startTimer = setTimeout(() => {
        if (!currentSession) startSegment(pendingStart.url, pendingStart.type);
        pendingStart = null;
        persistState();
      }, remaining);
    }
  }

  console.log('Service worker restored state:', {
    hasSession: !!currentSession,
    studyDayStart,
    hadPending: !!saved.pendingStart
  });
}

// Restore immediately on startup
restoreState();

// ─── Whitelist helpers ────────────────────────────────────────────────────────

async function isWhitelisted(url) {
  if (!url) return false;
  const hostname = extractHostname(url);
  if (!hostname) return false;
  return new Promise((resolve) => {
    chrome.storage.local.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      resolve(whitelist.some(item => {
        const normalizedItem = item.toLowerCase();
        return hostname === normalizedItem || hostname.endsWith('.' + normalizedItem);
      }));
    });
  });
}

// ─── Segment tracking ─────────────────────────────────────────────────────────

function attemptStartSegment(url, type) {
  clearTimeout(startTimer);
  const delay = type === 'distraction' ? START_DELAY : 0;

  if (delay === 0) {
    pendingStart = null;
    if (!currentSession) startSegment(url, type);
    return;
  }

  // Persist when the grace period started so we can resume after restart
  pendingStart = { url, type, scheduledAt: Date.now() };
  persistState();

  startTimer = setTimeout(() => {
    if (!currentSession) startSegment(url, type);
    pendingStart = null;
    persistState();
  }, delay);
}

function startSegment(url, type) {
  if (currentSession) return;
  if (!studyDayStart) studyDayStart = Date.now();

  currentSession = { type, url, startTime: Date.now() };
  pendingStart   = null;
  persistState();
  console.log(`Segment started [${type}]:`, url);
  chrome.runtime.sendMessage({ action: 'statusUpdate', status: type }).catch(() => {});
}

async function endSegment() {
  clearTimeout(startTimer);
  pendingStart = null;
  if (!currentSession) { await persistState(); return; }

  const endTime  = Date.now();
  const duration = Math.floor((endTime - currentSession.startTime) / 1000);
  const segment  = {
    type:      currentSession.type,
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
  await persistState();
  chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'idle' }).catch(() => {});
}

// ─── Tab monitoring (debounced) ──────────────────────────────────────────────

let checkTabTimer = null;
const CHECK_TAB_DEBOUNCE = 300; // ms

async function checkCurrentTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
    if (tabs.length === 0) { await endSegment(); return; }

    const tab = tabs[0];

    // Ignore browser-internal pages — they're not study or distraction
    if (isInternalUrl(tab.url)) return;

    const whitelisted = await isWhitelisted(tab.url);
    const newType    = whitelisted ? 'study' : 'distraction';

    if (!currentSession) {
      attemptStartSegment(tab.url, newType);
    } else if (currentSession.type !== newType || currentSession.url !== tab.url) {
      await endSegment();
      attemptStartSegment(tab.url, newType);
    }
  });
}

function debouncedCheckCurrentTab() {
  clearTimeout(checkTabTimer);
  checkTabTimer = setTimeout(checkCurrentTab, CHECK_TAB_DEBOUNCE);
}

chrome.tabs.onActivated.addListener(debouncedCheckCurrentTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') debouncedCheckCurrentTab();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) endSegment();
  else debouncedCheckCurrentTab();
});

chrome.idle.setDetectionInterval(IDLE_THRESHOLD);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') endSegment();
});

// ─── Report generation ────────────────────────────────────────────────────────

async function generateReport() {
  await endSegment();

  const dateKey = new Date().toISOString().split('T')[0];

  return new Promise((resolve) => {
    chrome.storage.local.get(['segments'], (result) => {
      const rawSegments     = ((result.segments || {})[dateKey]) || [];
      const segments        = Array.isArray(rawSegments)
        ? rawSegments.filter(s => validateSegment(s) !== null)
        : [];
      const studySegs       = segments.filter(s => s.type === 'study');
      const distractionSegs = segments.filter(s => s.type === 'distraction');
      const totalStudy      = studySegs.reduce((a, s) => a + s.duration, 0);
      const totalDistraction = distractionSegs.reduce((a, s) => a + s.duration, 0);
      const totalTracked    = totalStudy + totalDistraction;

      const byDomain = {};
      distractionSegs.forEach(s => {
        const domain = extractHostname(s.url);
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
        studySegments:       studySegs,
        distractionSegments: distractionSegs,
        distractionByDomain: byDomain,
        recommendations:     buildRecommendations(productivityPct, byDomain, totalDistraction)
      };

      studyDayStart = null;
      persistState();

      // Store report in chrome.storage so popup can read it
      // (MV3 service workers can't reliably send async message responses)
      chrome.storage.local.set({ lastReport: report }, () => resolve(report));
    });
  });
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
    tips.push(`Your biggest distraction was ${topDomain[0]} (${formatDuration(topDomain[1])}). Try scheduling it as a reward after studying.`);
  }
  if (totalDistraction > 3600) {
    tips.push('You spent over an hour off-task. Try setting a visible countdown timer to stay accountable.');
  }

  return tips;
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'stopSession') {
    endSegment();

  } else if (message.action === 'getStatus') {
    sendResponse({
      active:    !!currentSession,
      type:      currentSession?.type      ?? null,
      startTime: currentSession?.startTime ?? null,
      url:       currentSession?.url       ?? null,
      studyDayStart
    });

  } else if (message.action === 'endStudyDay') {
    generateReport().then(() => sendResponse({ ok: true }));
    return true;

  } else if (message.action === 'updateSettings') {
    // Apply new grace period and idle threshold immediately
    if (message.graceperiod)   START_DELAY    = message.graceperiod * 1000;
    if (message.idleThreshold) {
      IDLE_THRESHOLD = message.idleThreshold;
      chrome.idle.setDetectionInterval(IDLE_THRESHOLD);
    }
    sendResponse({ ok: true });

  } else if (message.action === 'clearDay') {
    const dateKey = new Date().toISOString().split('T')[0];
    chrome.storage.local.get(['segments'], (result) => {
      const segments = result.segments || {};
      delete segments[dateKey];
      chrome.storage.local.set({ segments });
    });
    studyDayStart = null;
    persistState();
  }
});
