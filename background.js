let currentSession = null;
let startTimer = null;
const START_DELAY = 5000; // 5 seconds
const IDLE_THRESHOLD = 60; // 60 seconds

// Whitelist check helper
async function isWhitelisted(url) {
  if (!url) return true;
  return new Promise((resolve) => {
    chrome.storage.local.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      const whitelisted = whitelist.some(item => url.includes(item));
      resolve(whitelisted);
    });
  });
}

// Start tracking a potential session
function attemptStartSession(url) {
  clearTimeout(startTimer);
  startTimer = setTimeout(async () => {
    if (!currentSession) {
      const whitelisted = await isWhitelisted(url);
      if (!whitelisted) {
        startSession(url);
      }
    }
  }, START_DELAY);
}

function startSession(url) {
  if (currentSession) return;
  console.log('Session started:', url);
  currentSession = {
    startTime: Date.now(),
    url: url
  };
  chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'active' }).catch(() => {});
}

async function endSession() {
  clearTimeout(startTimer);
  if (!currentSession) return;

  const endTime = Date.now();
  const duration = Math.floor((endTime - currentSession.startTime) / 1000);
  const sessionData = {
    startTime: currentSession.startTime,
    endTime: endTime,
    duration: duration,
    url: currentSession.url
  };

  const dateKey = new Date(currentSession.startTime).toISOString().split('T')[0];
  
  chrome.storage.local.get(['sessions'], (result) => {
    const sessions = result.sessions || {};
    if (!sessions[dateKey]) sessions[dateKey] = [];
    sessions[dateKey].push(sessionData);
    chrome.storage.local.set({ sessions }, () => {
      console.log('Session ended and saved:', sessionData);
      currentSession = null;
      chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'idle' }).catch(() => {});
    });
  });
}

// Track active tab
async function checkCurrentTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
    if (tabs.length === 0) {
      endSession();
      return;
    }
    const tab = tabs[0];
    const whitelisted = await isWhitelisted(tab.url);

    if (whitelisted) {
      endSession();
    } else {
      if (!currentSession) {
        attemptStartSession(tab.url);
      } else if (currentSession.url !== tab.url) {
        // Different non-whitelisted URL - maybe restart timer? 
        // For "soft timer", we might just keep the session if it's still non-whitelisted.
        // The requirement says "starts when current page is NOT on whitelist".
        // If we switch from one non-whitelisted to another, let's keep it simple: 
        // continue session or start new one? 
        // "Sessions are stored per-day and a report summarises active segments."
        // Let's just track the fact it's an active segment.
      }
    }
  });
}

chrome.tabs.onActivated.addListener(checkCurrentTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    checkCurrentTab();
  }
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    endSession();
  } else {
    checkCurrentTab();
  }
});

// Idle detection
chrome.idle.setDetectionInterval(IDLE_THRESHOLD);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    endSession();
  }
});

// Manual stop
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stopSession') {
    endSession();
  } else if (message.action === 'getStatus') {
    sendResponse({ 
      active: !!currentSession, 
      startTime: currentSession?.startTime 
    });
  }
});
