/* ═══════════════════════════════════════════════════════════════════════════
   TideTrack — Tide Loop Learning System
   External JS for tide.html (Chrome MV3 compliant — no inline scripts)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────────────────
let tideData = {
  topics: [],
  momentum: 0,
  streak: 0,
  totalSessions: 0,
  sessionsToday: 0,
  lastSessionDate: null,
  weeklyChart: [0, 0, 0, 0, 0, 0, 0]
};

let currentTopic = null;
let currentAnalysis = null;
let currentFixSession = null;
let fixTimerInterval = null;
let fixTimerSeconds = 300;
let isRetry = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const screens = {
  feed:     $('screen-feed'),
  explain:  $('screen-explain'),
  feedback: $('screen-feedback'),
  fix:      $('screen-fix'),
  result:   $('screen-result'),
  progress: $('screen-progress')
};

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadTideData();
  createParticles();
  bindEvents();
  renderFeed();
  renderProgress();
  showScreen('feed');
});

// ── Data persistence ─────────────────────────────────────────────────────────
async function loadTideData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tideData'], (result) => {
      if (result.tideData) {
        tideData = { ...tideData, ...result.tideData };
      }
      updateStreak();
      resolve();
    });
  });
}

function saveTideData() {
  chrome.storage.local.set({ tideData });
}

function updateStreak() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (tideData.lastSessionDate === today) return;

  if (tideData.lastSessionDate === yesterday) {
    // streak continues
  } else if (tideData.lastSessionDate !== today) {
    tideData.streak = 0;
    tideData.sessionsToday = 0;
  }
}

// ── Screen navigation ────────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach((s) => {
    s.classList.remove('visible', 'slide-out');
    if (s.classList.contains('active')) {
      s.classList.add('slide-out');
      setTimeout(() => {
        s.classList.remove('active', 'slide-out');
      }, 350);
    }
  });

  const target = screens[name];
  setTimeout(() => {
    target.classList.add('active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.classList.add('visible');
      });
    });
  }, name === 'feed' || name === 'progress' ? 0 : 50);

  // Update nav
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.screen === name);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Event binding ────────────────────────────────────────────────────────────
function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      showScreen(tab.dataset.screen);
      if (tab.dataset.screen === 'progress') renderProgress();
      if (tab.dataset.screen === 'feed') renderFeed();
    });
  });

  // Feed
  $('startNewBtn').addEventListener('click', () => showScreen('explain'));
  $('fixNowBtn').addEventListener('click', () => {
    const weakest = getWeakestTopic();
    if (weakest) {
      currentTopic = weakest.name;
      currentAnalysis = {
        missing: weakest.gaps || [],
        misconceptions: [],
        confidence: weakest.confidence
      };
      startFixSession();
    }
  });

  // Explain
  $('explainBackBtn').addEventListener('click', () => showScreen('feed'));

  const topicInput = $('topicInput');
  const explanationInput = $('explanationInput');
  const analyzeBtn = $('analyzeBtn');

  function checkExplainReady() {
    analyzeBtn.disabled = !(topicInput.value.trim() && explanationInput.value.trim().length >= 10);
  }
  topicInput.addEventListener('input', checkExplainReady);
  explanationInput.addEventListener('input', checkExplainReady);

  analyzeBtn.addEventListener('click', () => {
    currentTopic = topicInput.value.trim();
    analyzeUnderstanding(currentTopic, explanationInput.value.trim());
  });

  // Feedback
  $('feedbackBackBtn').addEventListener('click', () => showScreen('explain'));
  $('startFixBtn').addEventListener('click', () => startFixSession());

  // Fix session
  $('fixBackBtn').addEventListener('click', () => {
    clearInterval(fixTimerInterval);
    showScreen('feedback');
  });

  const answerInput = $('answerInput');
  const checkAnswerBtn = $('checkAnswerBtn');

  answerInput.addEventListener('input', () => {
    checkAnswerBtn.disabled = !answerInput.value.trim();
  });

  checkAnswerBtn.addEventListener('click', () => {
    checkAnswer(answerInput.value.trim());
  });

  // Allow Enter key on answer input
  answerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !checkAnswerBtn.disabled) {
      checkAnswer(answerInput.value.trim());
    }
  });
}

// ── Render: Feed ─────────────────────────────────────────────────────────────
function renderFeed() {
  const weakest = getWeakestTopic();

  if (weakest) {
    $('weakTopicCard').style.display = '';
    $('feedEmpty').style.display = 'none';
    $('weakTopicName').textContent = weakest.name;
    $('weakTopicScore').innerHTML = weakest.confidence + '<span>%</span>';
    $('weakTopicDetail').textContent = weakest.gaps && weakest.gaps.length > 0
      ? 'Gaps: ' + weakest.gaps.slice(0, 2).join(', ')
      : 'Needs more practice';
  } else {
    $('weakTopicCard').style.display = 'none';
    $('feedEmpty').style.display = '';
  }

  // Momentum ring
  animateRing($('momentumCircle'), tideData.momentum, 50, 120);
  $('momentumValue').textContent = tideData.momentum;

  // Recent progress
  const recentTopics = [...tideData.topics]
    .sort((a, b) => new Date(b.lastStudied) - new Date(a.lastStudied))
    .slice(0, 5);

  if (recentTopics.length > 0) {
    $('recentCard').style.display = '';
    const list = $('recentList');
    list.innerHTML = '';
    recentTopics.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'recent-item';
      const scoreClass = t.confidence < 40 ? 'low' : t.confidence < 70 ? 'mid' : 'high';
      li.innerHTML =
        '<span class="recent-topic">' + escapeHtml(t.name) + '</span>' +
        '<span class="recent-score ' + scoreClass + '">' + t.confidence + '%</span>';
      list.appendChild(li);
    });
  } else {
    $('recentCard').style.display = 'none';
  }
}

// ── Render: Progress ─────────────────────────────────────────────────────────
function renderProgress() {
  $('progMomentum').textContent = tideData.momentum;
  $('progStreak').textContent = tideData.streak;
  $('progSessions').textContent = tideData.totalSessions;
  $('progToday').textContent = tideData.sessionsToday;

  // Weekly chart
  const chart = $('weeklyChart');
  chart.innerHTML = '';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxVal = Math.max(...tideData.weeklyChart, 1);

  tideData.weeklyChart.forEach((val, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'chart-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = '0px';
    const label = document.createElement('span');
    label.className = 'chart-day';
    label.textContent = days[i];
    wrap.appendChild(bar);
    wrap.appendChild(label);
    chart.appendChild(wrap);

    // Animate bars
    setTimeout(() => {
      bar.style.height = Math.max(2, (val / maxVal) * 80) + 'px';
    }, 100 + i * 80);
  });

  // Mastered topics
  const mastered = tideData.topics.filter((t) => t.confidence >= 80);
  const weak = tideData.topics.filter((t) => t.confidence < 80);

  if (mastered.length > 0) {
    $('masteredCard').style.display = '';
    const list = $('masteredList');
    list.innerHTML = '';
    mastered.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'mastered-item';
      li.innerHTML =
        '<span class="mastered-name">' + escapeHtml(t.name) + '</span>' +
        '<div class="mastered-bar-bg"><div class="mastered-bar-fill" style="width:' + t.confidence + '%"></div></div>' +
        '<span class="mastered-pct">' + t.confidence + '%</span>';
      list.appendChild(li);
    });
  } else {
    $('masteredCard').style.display = 'none';
  }

  if (weak.length > 0) {
    $('weakCard').style.display = '';
    const list = $('weakList');
    list.innerHTML = '';
    weak.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'weak-item';
      li.innerHTML =
        '<span class="weak-name">' + escapeHtml(t.name) + '</span>' +
        '<div class="weak-bar-bg"><div class="weak-bar-fill" style="width:' + t.confidence + '%"></div></div>' +
        '<span class="weak-pct">' + t.confidence + '%</span>';
      list.appendChild(li);
    });
  } else {
    $('weakCard').style.display = 'none';
  }
}

// ── AI: Analyze Understanding ────────────────────────────────────────────────
async function analyzeUnderstanding(topic, explanation) {
  showScreen('feedback');
  $('feedbackLoading').style.display = '';
  $('feedbackResults').style.display = 'none';
  $('feedbackError').style.display = 'none';

  const systemPrompt =
    'You are an expert tutor. A student is explaining a concept. Your job:\n' +
    '1. Identify what they understand correctly\n' +
    '2. Identify missing key concepts\n' +
    '3. Identify misconceptions\n' +
    '4. Give a confidence score (0-100)\n' +
    'Keep response SHORT and structured.\n' +
    'Output ONLY valid JSON, no markdown fences.';

  const userMsg =
    'Concept: ' + topic + '\n' +
    'Student Explanation: ' + explanation + '\n' +
    'Output as JSON: {"summary":"...","correct":["..."],"missing":["..."],"misconceptions":["..."],"confidence":42}';

  try {
    const response = await callAI(systemPrompt, userMsg);
    const parsed = parseAIJson(response);

    currentAnalysis = parsed;
    renderFeedbackResults(parsed);
  } catch (err) {
    $('feedbackLoading').style.display = 'none';
    $('feedbackError').style.display = '';
    $('feedbackError').textContent = 'Analysis failed: ' + err.message;
  }
}

function renderFeedbackResults(data) {
  $('feedbackLoading').style.display = 'none';
  $('feedbackResults').style.display = '';

  // Summary
  const conf = data.confidence || 0;
  let emoji = '';
  let summaryText = data.summary || '';
  if (conf >= 80) {
    emoji = '\u2705';
    if (!summaryText) summaryText = 'You have a strong understanding!';
  } else if (conf >= 50) {
    emoji = '\uD83E\uDD14';
    if (!summaryText) summaryText = 'You partially understand this';
  } else {
    emoji = '\u274C';
    if (!summaryText) summaryText = 'There are significant gaps in your understanding';
  }
  $('feedbackSummary').textContent = emoji + ' ' + summaryText;

  // Confidence bar
  const barClass = conf < 40 ? 'low' : conf < 70 ? 'mid' : 'high';
  const bar = $('confidenceBar');
  bar.className = 'confidence-bar-fill ' + barClass;
  setTimeout(() => { bar.style.width = conf + '%'; }, 100);
  $('confidenceValue').textContent = conf + '%';

  // Correct
  renderGapList($('correctList'), $('correctSection'), data.correct || [], 'correct', '\u2713');
  // Missing
  renderGapList($('missingList'), $('missingSection'), data.missing || [], 'missing', '\u2717');
  // Misconceptions
  renderGapList($('misconceptionsList'), $('misconceptionsSection'), data.misconceptions || [], 'unclear', '!');

  // Save/update topic
  saveTopic(currentTopic, conf, data.missing || []);
}

function renderGapList(listEl, sectionEl, items, iconClass, iconText) {
  listEl.innerHTML = '';
  if (items.length === 0) {
    sectionEl.style.display = 'none';
    return;
  }
  sectionEl.style.display = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'gap-item';
    li.innerHTML =
      '<span class="gap-icon ' + iconClass + '">' + iconText + '</span>' +
      '<span>' + escapeHtml(item) + '</span>';
    listEl.appendChild(li);
  });
}

// ── AI: Fix Session ──────────────────────────────────────────────────────────
async function startFixSession() {
  isRetry = false;
  showScreen('fix');
  $('fixLoading').style.display = '';
  $('fixContent').style.display = 'none';
  $('fixError').style.display = 'none';
  $('answerInput').value = '';
  $('checkAnswerBtn').disabled = true;

  const gaps = (currentAnalysis && currentAnalysis.missing) || [];
  const misconceptions = (currentAnalysis && currentAnalysis.misconceptions) || [];
  const allGaps = [...gaps, ...misconceptions].slice(0, 4);

  fixTimerSeconds = 300;
  renderTimer();

  const systemPrompt =
    'You are a tutor helping a student quickly fix their understanding. Based on the gaps below, generate:\n' +
    '1. A very simple explanation (2-3 sentences)\n' +
    '2. One clear example\n' +
    '3. One practice question with expected answer\n' +
    'Keep it concise and easy.\n' +
    'Output ONLY valid JSON, no markdown fences.';

  const userMsg =
    'Topic: ' + currentTopic + '\n' +
    'Gaps: ' + (allGaps.length > 0 ? allGaps.join(', ') : 'General understanding') + '\n' +
    'Output as JSON: {"explanation":"...","example":"...","question":"...","expectedAnswer":"..."}';

  try {
    const response = await callAI(systemPrompt, userMsg);
    currentFixSession = parseAIJson(response);
    renderFixSession();
    startTimer();
  } catch (err) {
    $('fixLoading').style.display = 'none';
    $('fixError').style.display = '';
    $('fixError').textContent = 'Failed to generate fix session: ' + err.message;
  }
}

function renderFixSession() {
  $('fixLoading').style.display = 'none';
  $('fixContent').style.display = '';
  $('fixSessionCard').classList.add('pulsing');

  $('fixExplanation').textContent = currentFixSession.explanation || '';
  $('fixExample').textContent = currentFixSession.example || '';
  $('fixQuestion').textContent = currentFixSession.question || '';
}

// ── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  clearInterval(fixTimerInterval);
  const totalSeconds = fixTimerSeconds;
  const circumference = 2 * Math.PI * 70;
  const circle = $('timerCircle');
  circle.style.strokeDasharray = circumference;

  fixTimerInterval = setInterval(() => {
    fixTimerSeconds--;
    if (fixTimerSeconds <= 0) {
      fixTimerSeconds = 0;
      clearInterval(fixTimerInterval);
      $('fixSessionCard').classList.remove('pulsing');
    }
    renderTimer();

    // Update ring
    const progress = fixTimerSeconds / totalSeconds;
    circle.style.strokeDashoffset = circumference * (1 - progress);
  }, 1000);
}

function renderTimer() {
  const m = Math.floor(fixTimerSeconds / 60);
  const s = fixTimerSeconds % 60;
  $('timerDigits').textContent = m + ':' + (s < 10 ? '0' : '') + s;
}

// ── AI: Check Answer ─────────────────────────────────────────────────────────
async function checkAnswer(answer) {
  clearInterval(fixTimerInterval);
  $('checkAnswerBtn').disabled = true;
  $('checkAnswerBtn').textContent = 'Checking...';

  const systemPrompt =
    'You are grading a student\'s answer. Determine:\n' +
    '1. Is it correct?\n' +
    '2. If incorrect, give a short hint (not full answer)\n' +
    '3. If correct, give brief encouragement\n' +
    'Output ONLY valid JSON, no markdown fences.';

  const userMsg =
    'Question: ' + (currentFixSession ? currentFixSession.question : '') + '\n' +
    'Expected Answer: ' + (currentFixSession ? currentFixSession.expectedAnswer : '') + '\n' +
    'Student Answer: ' + answer + '\n' +
    'Output as JSON: {"correct":true,"feedback":"..."}';

  try {
    const response = await callAI(systemPrompt, userMsg);
    const result = parseAIJson(response);
    showResult(result);
  } catch (err) {
    $('checkAnswerBtn').disabled = false;
    $('checkAnswerBtn').textContent = 'Check Answer';
    $('fixError').style.display = '';
    $('fixError').textContent = 'Error checking answer: ' + err.message;
  }
}

// ── Result Screen ────────────────────────────────────────────────────────────
function showResult(result) {
  showScreen('result');

  const icon = $('resultIcon');
  const actions = $('resultActions');
  actions.innerHTML = '';

  if (result.correct) {
    // Success
    icon.className = 'result-icon success';
    icon.textContent = '\u2713';
    $('resultTitle').textContent = 'You got it!';

    // Improve confidence
    const oldConf = currentAnalysis ? currentAnalysis.confidence : 50;
    const boost = isRetry ? 8 : 15;
    const newConf = Math.min(100, oldConf + boost);
    $('resultSub').textContent = 'Understanding improved: ' + oldConf + '% \u2192 ' + newConf + '%';

    // Update topic confidence
    updateTopicConfidence(currentTopic, newConf);
    recordSession();

    if (result.feedback) {
      $('resultFeedback').style.display = '';
      $('resultFeedbackText').textContent = result.feedback;
    } else {
      $('resultFeedback').style.display = 'none';
    }

    // Confetti
    launchConfetti();

    const doneBtn = document.createElement('button');
    doneBtn.className = 'btn-primary btn-green';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => {
      renderFeed();
      showScreen('feed');
      resetInputs();
    });
    actions.appendChild(doneBtn);

  } else {
    // Incorrect
    icon.className = 'result-icon fail';
    icon.textContent = '\u2717';
    $('resultTitle').textContent = 'Not quite \u2014 try again';
    $('resultSub').textContent = 'Don\'t worry, you\'re getting closer!';

    if (result.feedback) {
      $('resultFeedback').style.display = '';
      $('resultFeedbackText').textContent = 'Hint: ' + result.feedback;
    } else {
      $('resultFeedback').style.display = 'none';
    }

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-primary btn-warn';
    retryBtn.textContent = 'Retry (2 min)';
    retryBtn.addEventListener('click', () => {
      isRetry = true;
      fixTimerSeconds = 120;
      showScreen('fix');
      $('fixContent').style.display = '';
      $('fixLoading').style.display = 'none';
      $('answerInput').value = '';
      $('checkAnswerBtn').disabled = true;
      $('checkAnswerBtn').textContent = 'Check Answer';
      $('fixSessionCard').classList.add('pulsing');
      renderTimer();
      startTimer();
    });
    actions.appendChild(retryBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-secondary';
    skipBtn.textContent = 'Back to Feed';
    skipBtn.addEventListener('click', () => {
      renderFeed();
      showScreen('feed');
      resetInputs();
    });
    actions.appendChild(skipBtn);
  }
}

// ── Topic management ─────────────────────────────────────────────────────────
function saveTopic(name, confidence, gaps) {
  const existing = tideData.topics.find((t) => t.name.toLowerCase() === name.toLowerCase());
  const today = new Date().toISOString().split('T')[0];

  if (existing) {
    existing.confidence = confidence;
    existing.gaps = gaps;
    existing.lastStudied = today;
    existing.sessions++;
    existing.mastered = confidence >= 80;
  } else {
    tideData.topics.push({
      name: name,
      confidence: confidence,
      sessions: 1,
      lastStudied: today,
      gaps: gaps,
      mastered: confidence >= 80
    });
  }
  saveTideData();
}

function updateTopicConfidence(name, newConf) {
  const topic = tideData.topics.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (topic) {
    topic.confidence = newConf;
    topic.mastered = newConf >= 80;
    topic.lastStudied = new Date().toISOString().split('T')[0];

    // Remove fixed gaps if confidence is high enough
    if (newConf >= 70 && topic.gaps.length > 0) {
      topic.gaps = topic.gaps.slice(1); // remove first gap as "fixed"
    }
  }
  saveTideData();
}

function recordSession() {
  const today = new Date().toISOString().split('T')[0];

  if (tideData.lastSessionDate !== today) {
    if (tideData.lastSessionDate === getYesterday()) {
      tideData.streak++;
    } else {
      tideData.streak = 1;
    }
    tideData.sessionsToday = 0;
  }

  tideData.totalSessions++;
  tideData.sessionsToday++;
  tideData.lastSessionDate = today;

  // Update momentum (weighted average of recent activity)
  const topicAvg = tideData.topics.length > 0
    ? Math.round(tideData.topics.reduce((a, t) => a + t.confidence, 0) / tideData.topics.length)
    : 0;
  const streakBonus = Math.min(tideData.streak * 3, 20);
  tideData.momentum = Math.min(100, topicAvg + streakBonus);

  // Update weekly chart (today's day of week)
  const dayIdx = (new Date().getDay() + 6) % 7; // Mon=0
  tideData.weeklyChart[dayIdx] = tideData.sessionsToday;

  saveTideData();
}

function getWeakestTopic() {
  if (tideData.topics.length === 0) return null;
  return tideData.topics
    .filter((t) => !t.mastered)
    .sort((a, b) => a.confidence - b.confidence)[0] || null;
}

function getYesterday() {
  return new Date(Date.now() - 86400000).toISOString().split('T')[0];
}

// ── AI helper ────────────────────────────────────────────────────────────────
async function callAI(systemPrompt, userMessage) {
  // Use the background script proxy (askKai) which handles API key
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'askKai',
        systemPrompt: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || !response.ok) {
          const errMsg = (response && response.error) || 'AI request failed';
          if (errMsg === 'INVALID_API_KEY') {
            return reject(new Error('Invalid API key. Please check your settings.'));
          }
          if (errMsg === 'NO_CREDITS') {
            return reject(new Error('No API credits remaining.'));
          }
          return reject(new Error(errMsg));
        }
        // Extract text from response
        const data = response.data;
        if (data && data.content && data.content.length > 0) {
          resolve(data.content[0].text);
        } else {
          reject(new Error('Empty response from AI'));
        }
      }
    );
  });
}

function parseAIJson(text) {
  // Strip markdown code fences if present
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Try to extract JSON from the text
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Could not parse AI response as JSON');
  }
}

// ── Ring animation helper ────────────────────────────────────────────────────
function animateRing(circleEl, value, radius, svgSize) {
  const circumference = 2 * Math.PI * radius;
  circleEl.style.strokeDasharray = circumference;
  const offset = circumference * (1 - value / 100);
  setTimeout(() => {
    circleEl.style.strokeDashoffset = offset;
  }, 100);
}

// ── Particles ────────────────────────────────────────────────────────────────
function createParticles() {
  const container = $('particles');
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = 60 + Math.random() * 40 + '%';
    p.style.setProperty('--dur', (6 + Math.random() * 8) + 's');
    p.style.setProperty('--delay', (Math.random() * 10) + 's');
    p.style.width = (1 + Math.random() * 2) + 'px';
    p.style.height = p.style.width;
    container.appendChild(p);
  }
}

// ── Confetti ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#5badee', '#34d399', '#f59e0b', '#e57373', '#a78bfa', '#fb923c'];

  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty('--fall-dur', (2 + Math.random() * 2) + 's');
    piece.style.setProperty('--fall-delay', Math.random() * 0.5 + 's');
    piece.style.width = (5 + Math.random() * 6) + 'px';
    piece.style.height = (5 + Math.random() * 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 4000);
}

// ── Reset ────────────────────────────────────────────────────────────────────
function resetInputs() {
  $('topicInput').value = '';
  $('explanationInput').value = '';
  $('analyzeBtn').disabled = true;
  $('answerInput').value = '';
  $('checkAnswerBtn').disabled = true;
  $('checkAnswerBtn').textContent = 'Check Answer';
  currentTopic = null;
  currentAnalysis = null;
  currentFixSession = null;
  clearInterval(fixTimerInterval);
}

// ── Escape HTML ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
