let currentSession = null;
let studyDayStart  = null;
let startTimer     = null;
let pendingStart   = null;  // { url, hostname, type, scheduledAt }

// Defaults — overridden by values saved in storage
let START_DELAY    = 5000;  // ms  (grace period before distraction counts)
let IDLE_THRESHOLD = 60;    // seconds

// Camera bridge polling
let cameraCheckTimer = null;
let cameraPresent    = true; // assume present until told otherwise

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
  const result = await chrome.storage.local.get([STATE_KEY, 'graceperiod', 'idleThreshold', 'cameraEnabled']);

  // Restore settings
  if (result.graceperiod)   START_DELAY    = result.graceperiod * 1000;
  if (result.idleThreshold) IDLE_THRESHOLD = result.idleThreshold;
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD);

  // Camera bridge
  if (result.cameraEnabled) startCameraPolling();

  // Restore live state
  const saved = result[STATE_KEY];
  if (!saved) return;

  studyDayStart  = saved.studyDayStart  || null;
  currentSession = saved.currentSession || null;

  // If there was a pending grace-period start, check if the delay has elapsed
  if (saved.pendingStart) {
    const elapsed   = Date.now() - saved.pendingStart.scheduledAt;
    const remaining = START_DELAY - elapsed;

    if (remaining <= 0) {
      if (!currentSession) {
        startSegment(saved.pendingStart.url, saved.pendingStart.hostname, saved.pendingStart.type);
      }
    } else {
      pendingStart = saved.pendingStart;
      startTimer = setTimeout(() => {
        if (!currentSession) startSegment(pendingStart.url, pendingStart.hostname, pendingStart.type);
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

function extractHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function isInternalUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|about|edge|brave|opera|vivaldi|file):/.test(url);
}

async function isWhitelisted(url) {
  if (!url) return false;
  const hostname = extractHostname(url).toLowerCase();
  if (!hostname) return false;
  return new Promise((resolve) => {
    chrome.storage.local.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      resolve(whitelist.some(item => {
        const wl = item.toLowerCase();
        return hostname === wl || hostname.endsWith('.' + wl);
      }));
    });
  });
}

// ─── Segment tracking ─────────────────────────────────────────────────────────

function attemptStartSegment(url, hostname, type) {
  clearTimeout(startTimer);
  const delay = type === 'distraction' ? START_DELAY : 0;

  if (delay === 0) {
    pendingStart = null;
    if (!currentSession) startSegment(url, hostname, type);
    return;
  }

  // Persist when the grace period started so we can resume after restart
  pendingStart = { url, hostname, type, scheduledAt: Date.now() };
  persistState();

  startTimer = setTimeout(() => {
    if (!currentSession) startSegment(url, hostname, type);
    pendingStart = null;
    persistState();
  }, delay);
}

function startSegment(url, hostname, type) {
  if (currentSession) return;
  if (!studyDayStart) studyDayStart = Date.now();

  currentSession = { type, url, hostname: hostname || extractHostname(url), startTime: Date.now() };
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

  // Skip segments shorter than 1 second (noise)
  if (duration < 1) {
    currentSession = null;
    await persistState();
    chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'idle' }).catch(() => {});
    return;
  }

  const segment  = {
    type:      currentSession.type,
    startTime: currentSession.startTime,
    endTime,
    duration,
    url:      currentSession.url,
    hostname: currentSession.hostname || extractHostname(currentSession.url)
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

// ─── Tab monitoring ───────────────────────────────────────────────────────────

async function checkCurrentTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
    if (tabs.length === 0) { await endSegment(); return; }

    const tab = tabs[0];

    // Ignore browser-internal pages — they're not study or distraction
    if (isInternalUrl(tab.url)) return;

    const hostname   = extractHostname(tab.url);
    const whitelisted = await isWhitelisted(tab.url);
    const newType    = whitelisted ? 'study' : 'distraction';

    if (!currentSession) {
      attemptStartSegment(tab.url, hostname, newType);
    } else {
      // FIX: Compare by hostname, not full URL — navigating within the same
      // domain (e.g. two Google Docs pages) should NOT create new segments.
      const hostChanged = currentSession.hostname !== hostname;
      const typeChanged = currentSession.type !== newType;

      if (typeChanged || hostChanged) {
        // FIX: await endSegment so currentSession is cleared before we start a new one
        await endSegment();
        attemptStartSegment(tab.url, hostname, newType);
      } else {
        // Same host, same type — update the URL silently (for report accuracy)
        currentSession.url = tab.url;
      }
    }
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

// ─── Camera bridge ────────────────────────────────────────────────────────────
// Polls the Python Flask camera app at localhost:5000/status.
// When the camera reports "user not present", we end the current segment.

function startCameraPolling() {
  if (cameraCheckTimer) return;
  cameraCheckTimer = setInterval(pollCamera, 3000);
  console.log('Camera bridge: polling started');
}

function stopCameraPolling() {
  if (cameraCheckTimer) {
    clearInterval(cameraCheckTimer);
    cameraCheckTimer = null;
  }
  cameraPresent = true;
  console.log('Camera bridge: polling stopped');
}

async function pollCamera() {
  try {
    const resp = await fetch('http://localhost:5000/status', { signal: AbortSignal.timeout(2000) });
    const data = await resp.json();
    const wasPresent = cameraPresent;
    cameraPresent = !data.tracking_bad;

    if (wasPresent && !cameraPresent) {
      // User just left — end the active segment
      console.log('Camera bridge: user left desk, ending segment');
      await endSegment();
    }
  } catch {
    // Flask app not running or unreachable — silently ignore
  }
}

// ─── Report generation ────────────────────────────────────────────────────────

async function generateReport() {
  await endSegment();

  const dateKey = new Date().toISOString().split('T')[0];

  return new Promise((resolve) => {
    chrome.storage.local.get(['segments'], (result) => {
      const raw             = (result.segments || {})[dateKey];
      const segments        = Array.isArray(raw) ? raw.filter(s => s != null && typeof s === 'object' && (s.type === 'study' || s.type === 'distraction')) : [];
      const studySegs       = segments.filter(s => s.type === 'study');
      const distractionSegs = segments.filter(s => s.type === 'distraction');
      const totalStudy      = studySegs.reduce((a, s) => a + s.duration, 0);
      const totalDistraction = distractionSegs.reduce((a, s) => a + s.duration, 0);
      const totalTracked    = totalStudy + totalDistraction;

      const byDomain = {};
      distractionSegs.forEach(s => {
        const domain = s.hostname || extractDomain(s.url);
        byDomain[domain] = (byDomain[domain] || 0) + s.duration;
      });

      const productivityPct = totalTracked > 0
        ? Math.round((totalStudy / totalTracked) * 100)
        : 0;

      const sessionDuration = studyDayStart
        ? Math.floor((Date.now() - studyDayStart) / 1000)
        : totalTracked;

      // Pattern detection — find distraction cadence
      const patterns = detectPatterns(segments);

      const report = {
        date: dateKey,
        sessionDuration,
        totalStudy,
        totalDistraction,
        productivityPct,
        studySegments:       studySegs,
        distractionSegments: distractionSegs,
        distractionByDomain: byDomain,
        patterns,
        recommendations:     buildRecommendations(productivityPct, byDomain, totalDistraction, totalStudy, patterns)
      };

      studyDayStart = null;
      persistState();

      chrome.storage.local.set({ lastReport: report }, () => resolve(report));
    });
  });
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

// ─── Pattern detection ────────────────────────────────────────────────────────

function detectPatterns(segments) {
  const patterns = {
    avgStudyBlockMinutes: 0,
    avgDistractionBlockMinutes: 0,
    distractionCadenceMinutes: null, // avg time between distraction starts
    longestStudyBlock: 0,
    studyBlockCount: 0,
    distractionBlockCount: 0,
    pomodoroFit: null, // suggested work interval
  };

  const studySegs = segments.filter(s => s.type === 'study' && s.duration > 0);
  const distSegs  = segments.filter(s => s.type === 'distraction' && s.duration > 0);

  if (studySegs.length > 0) {
    const totalStudySecs = studySegs.reduce((a, s) => a + s.duration, 0);
    patterns.avgStudyBlockMinutes = Math.round(totalStudySecs / studySegs.length / 60);
    patterns.longestStudyBlock    = Math.max(...studySegs.map(s => s.duration));
    patterns.studyBlockCount      = studySegs.length;
  }

  if (distSegs.length > 0) {
    const totalDistSecs = distSegs.reduce((a, s) => a + s.duration, 0);
    patterns.avgDistractionBlockMinutes = Math.round(totalDistSecs / distSegs.length / 60);
    patterns.distractionBlockCount      = distSegs.length;
  }

  // Distraction cadence: average gap between distraction start times
  if (distSegs.length >= 2) {
    const starts = distSegs.map(s => s.startTime).sort((a, b) => a - b);
    let totalGap = 0;
    for (let i = 1; i < starts.length; i++) {
      totalGap += starts[i] - starts[i - 1];
    }
    patterns.distractionCadenceMinutes = Math.round(totalGap / (starts.length - 1) / 60000);
  }

  // Suggest Pomodoro-style interval based on average study block
  if (patterns.avgStudyBlockMinutes > 0) {
    if (patterns.avgStudyBlockMinutes < 15) {
      patterns.pomodoroFit = { work: 15, break: 5 };
    } else if (patterns.avgStudyBlockMinutes < 30) {
      patterns.pomodoroFit = { work: 25, break: 5 };
    } else if (patterns.avgStudyBlockMinutes < 50) {
      patterns.pomodoroFit = { work: 45, break: 10 };
    } else {
      patterns.pomodoroFit = { work: 50, break: 15 };
    }
  }

  return patterns;
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function buildRecommendations(pct, byDomain, totalDistraction, totalStudy, patterns) {
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

  // Pattern-based recommendations
  if (patterns.distractionCadenceMinutes && patterns.distractionCadenceMinutes < 20) {
    tips.push(`You tend to get distracted every ~${patterns.distractionCadenceMinutes} minutes. Try setting a timer for ${patterns.distractionCadenceMinutes + 10} minutes of uninterrupted focus.`);
  }

  if (patterns.pomodoroFit) {
    const { work, break: brk } = patterns.pomodoroFit;
    tips.push(`Based on your natural rhythm, try ${work}-minute work blocks with ${brk}-minute breaks.`);
  }

  if (patterns.longestStudyBlock > 0 && patterns.studyBlockCount > 1) {
    tips.push(`Your longest focus block was ${formatDuration(patterns.longestStudyBlock)}. Try to beat that next session.`);
  }

  return tips;
}

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '0s';
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
      active:    !!currentSession,
      type:      currentSession?.type      ?? null,
      startTime: currentSession?.startTime ?? null,
      url:       currentSession?.url       ?? null,
      hostname:  currentSession?.hostname  ?? null,
      studyDayStart
    });

  } else if (message.action === 'endStudyDay') {
    generateReport().then(() => sendResponse({ ok: true }));
    return true;

  } else if (message.action === 'updateSettings') {
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

  } else if (message.action === 'toggleCamera') {
    if (message.enabled) {
      chrome.storage.local.set({ cameraEnabled: true });
      startCameraPolling();
    } else {
      chrome.storage.local.set({ cameraEnabled: false });
      stopCameraPolling();
    }
    sendResponse({ ok: true });

  } else if (message.action === 'askKai') {
    handleKaiRequest(message.systemPrompt, message.messages)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ─── AI Study Coach proxy ─────────────────────────────────────────────────────

async function handleKaiRequest(systemPrompt, messages) {
  const result = await chrome.storage.local.get(['anthropicApiKey']);
  const apiKey = result.anthropicApiKey;

  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData?.error?.message || `API returned ${response.status}`;
    if (response.status === 401) throw new Error('INVALID_API_KEY');
    throw new Error(msg);
  }

  return await response.json();
}
