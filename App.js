// Simple study-session timer with whitelist & visibility logic.
// Assumptions documented in README.

const whitelistInput = document.getElementById('whitelist');
const currentUrlInput = document.getElementById('currentUrl');
const applyBtn = document.getElementById('applyConfig');
const endBtn = document.getElementById('endSession');

const timerStateEl = document.getElementById('timerState');
const sessionLengthEl = document.getElementById('sessionLength');
const lastActivityEl = document.getElementById('lastActivity');
const sessionsList = document.getElementById('sessionsList');
const reportArea = document.getElementById('reportArea');

let whitelist = [];
let simulatedUrl = window.location.href;
let lastActivity = Date.now();
let lastVisibilityChange = Date.now();
let sessionActive = false;
let sessionStart = null;
let sessionTimerSeconds = 0;
let sessions = loadSessionsForToday(); // array of {start, end, duration, url}

function parseWhitelist(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isWhitelisted(url) {
  const host = hostFromUrl(url);
  return whitelist.some(w => w === host || host.endsWith('.' + w));
}

function updateUI() {
  timerStateEl.textContent = sessionActive ? 'running' : 'stopped';
  sessionLengthEl.textContent = `${sessionTimerSeconds}s`;
  lastActivityEl.textContent = new Date(lastActivity).toLocaleTimeString();
  renderSessionsList();
}

function renderSessionsList() {
  sessionsList.innerHTML = '';
  sessions.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${new Date(s.start).toLocaleTimeString()} → ${new Date(s.end).toLocaleTimeString()} (${Math.round(s.duration/1000)}s) @ ${s.url}`;
    sessionsList.appendChild(li);
  });
}

function saveSessionsForToday() {
  const key = `study.sessions.${todayKey()}`;
  localStorage.setItem(key, JSON.stringify(sessions));
}

function loadSessionsForToday() {
  const key = `study.sessions.${todayKey()}`;
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function startSession() {
  if (sessionActive) return;
  sessionActive = true;
  sessionStart = Date.now();
  sessionTimerSeconds = 0;
  updateUI();
}

function endSession(reason) {
  if (!sessionActive) return;
  const end = Date.now();
  const duration = end - sessionStart;
  sessions.push({ start: sessionStart, end, duration, url: simulatedUrl });
  saveSessionsForToday();
  sessionActive = false;
  sessionStart = null;
  sessionTimerSeconds = 0;
  updateUI();
  if (reason) console.log('Session ended:', reason);
}

function generateReport() {
  const total = sessions.reduce((acc,s)=>acc + s.duration,0);
  const lines = [];
  lines.push(`Report for ${todayKey()}`);
  lines.push(`Total active time: ${Math.round(total/1000)}s`);
  lines.push('');
  sessions.forEach((s,i) => {
    lines.push(`${i+1}) ${new Date(s.start).toLocaleTimeString()} - ${new Date(s.end).toLocaleTimeString()} : ${Math.round(s.duration/1000)}s @ ${s.url}`);
  });
  reportArea.textContent = lines.join('\n');
  return reportArea.textContent;
}

// Activity detection (user events)
['mousemove','keydown','scroll','touchstart','click'].forEach(evt=>{
  window.addEventListener(evt, () => {
    lastActivity = Date.now();
  }, {passive:true});
});

// Visibility
document.addEventListener('visibilitychange', () => {
  lastVisibilityChange = Date.now();
  if (document.visibilityState === 'hidden') {
    endSession('tab hidden');
  }
});

// Periodic check (1s)
setInterval(() => {
  // Use either the provided simulated URL or actual location if left blank
  simulatedUrl = currentUrlInput.value.trim() || window.location.href;
  // If page is whitelisted => ensure session stopped
  if (isWhitelisted(simulatedUrl)) {
    endSession('whitelisted');
  } else {
    // Condition to start soft timer:
    // - page visible
    // - not whitelisted
    // - tab has been visible for at least 5s since last visibility change
    if (document.visibilityState === 'visible' && (Date.now() - lastVisibilityChange) >= 5000) {
      // start session if not already
      if (!sessionActive) startSession();
    }
  }

  // While active, increment timer only if user has been active recently (within 60s)
  if (sessionActive) {
    if ((Date.now() - lastActivity) <= 60000) {
      sessionTimerSeconds += 1;
    } else {
      // consider user idle: end session automatically after long inactivity
      endSession('idle > 60s');
    }
  }

  updateUI();
}, 1000);

// UI actions
applyBtn.addEventListener('click', () => {
  whitelist = parseWhitelist(whitelistInput.value || '');
  // store whitelist in localStorage for convenience
  localStorage.setItem('study.whitelist', JSON.stringify(whitelist));
  alert('Config applied');
});

endBtn.addEventListener('click', () => {
  endSession('manual end');
  const r = generateReport();
  console.log(r);
});

// Load saved config
try {
  const saved = JSON.parse(localStorage.getItem('study.whitelist') || '[]');
  whitelistInput.value = saved.join(', ');
  whitelist = saved;
} catch {}

// initial UI
updateUI();
renderSessionsList();
