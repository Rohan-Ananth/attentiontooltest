/**
 * agent-ui.js — Chat UI for the TideTrack AI Study Coach
 *
 * Renders a conversational interface inside popup.html or options.html.
 * Depends on tidetrack-agent.js being loaded first.
 */

document.addEventListener('DOMContentLoaded', () => {

  const chatContainer = document.getElementById('agentChat');
  if (!chatContainer) return; // Agent UI not present on this page

  // ── State ───────────────────────────────────────────────────────────────────
  let isLoading = false;

  // ── Render chat UI ──────────────────────────────────────────────────────────
  chatContainer.innerHTML = `
    <div class="agent-header">
      <div class="agent-avatar">🌊</div>
      <div>
        <p class="agent-name">Kai</p>
        <p class="agent-role">AI Study Coach</p>
      </div>
    </div>

    <div class="agent-quick-actions">
      <button class="agent-quick-btn" data-action="reviewToday">📊 Review today</button>
      <button class="agent-quick-btn" data-action="reviewWeek">📅 Weekly summary</button>
      <button class="agent-quick-btn" data-action="getStudyPlan">📋 Study plan</button>
      <button class="agent-quick-btn" data-action="getPatternInsights">🔍 My patterns</button>
    </div>

    <div class="agent-messages" id="agentMessages">
      <div class="agent-msg kai">
        <p class="agent-msg-text">Hey! I'm <strong>Kai</strong>, your TideTrack study coach. I can analyze your sessions, spot patterns in your habits, and help you build a study plan that actually works. What would you like to know?</p>
      </div>
    </div>

    <div class="agent-input-row">
      <input type="text" id="agentInput" placeholder="Ask Kai anything about your study habits..." autocomplete="off" />
      <button id="agentSendBtn" class="agent-send-btn">→</button>
    </div>

    <div class="agent-followups" id="agentFollowups" style="display:none"></div>
  `;

  // ── Elements ────────────────────────────────────────────────────────────────
  const messagesDiv  = document.getElementById('agentMessages');
  const inputEl      = document.getElementById('agentInput');
  const sendBtn      = document.getElementById('agentSendBtn');
  const followupsDiv = document.getElementById('agentFollowups');

  // ── Send message ────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (isLoading || !text.trim()) return;
    isLoading = true;

    // Show user message
    appendMessage('user', text);
    inputEl.value = '';
    followupsDiv.style.display = 'none';

    // Show typing indicator
    const typingEl = appendMessage('kai', '<span class="agent-typing"><span></span><span></span><span></span></span>', true);

    try {
      const response = await TideTrackAgent.chat(text);
      typingEl.remove();
      renderAgentResponse(response);
    } catch (err) {
      typingEl.remove();
      appendMessage('kai', "Something went wrong — I couldn't process that. Try again in a moment.");
    }

    isLoading = false;
    scrollToBottom();
  }

  // ── Quick actions ───────────────────────────────────────────────────────────
  chatContainer.querySelectorAll('.agent-quick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (isLoading) return;
      isLoading = true;

      const action = btn.dataset.action;
      const labels = {
        reviewToday:       'Review my session today',
        reviewWeek:        'Give me a weekly summary',
        getStudyPlan:      'Create a study plan for me',
        getPatternInsights: 'What patterns do you see?',
      };

      appendMessage('user', labels[action] || action);
      const typingEl = appendMessage('kai', '<span class="agent-typing"><span></span><span></span><span></span></span>', true);

      try {
        const response = await TideTrackAgent[action]();
        typingEl.remove();
        renderAgentResponse(response);
      } catch (err) {
        typingEl.remove();
        appendMessage('kai', "I ran into an issue. Try again in a moment.");
      }

      isLoading = false;
      scrollToBottom();
    });
  });

  // ── Render structured agent response ────────────────────────────────────────
  function renderAgentResponse(r) {
    let html = '';

    // Greeting
    if (r.greeting) {
      html += `<p class="agent-msg-greeting">${escHtml(r.greeting)}</p>`;
    }

    // Highlights
    if (r.highlights && r.highlights.length > 0) {
      html += '<div class="agent-highlights">';
      r.highlights.forEach(h => {
        html += `<div class="agent-highlight">✓ ${escHtml(h)}</div>`;
      });
      html += '</div>';
    }

    // Analysis
    if (r.analysis) {
      html += `<p class="agent-msg-text">${escHtml(r.analysis)}</p>`;
    }

    // Recommendations
    if (r.recommendations && r.recommendations.length > 0) {
      html += '<div class="agent-recs">';
      r.recommendations.forEach((rec, i) => {
        html += `
          <div class="agent-rec">
            <span class="agent-rec-num">${i + 1}</span>
            <div>
              <p class="agent-rec-action">${escHtml(rec.action)}</p>
              <p class="agent-rec-reason">${escHtml(rec.reason)}</p>
              ${rec.timeframe ? `<span class="agent-rec-time">${escHtml(rec.timeframe)}</span>` : ''}
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Encouragement
    if (r.encouragement) {
      html += `<p class="agent-msg-encourage">${escHtml(r.encouragement)}</p>`;
    }

    appendMessage('kai', html, true);

    // Suggested follow-ups
    if (r.suggested_followups && r.suggested_followups.length > 0) {
      followupsDiv.innerHTML = '';
      r.suggested_followups.forEach(q => {
        const btn = document.createElement('button');
        btn.className = 'agent-followup-btn';
        btn.textContent = q;
        btn.addEventListener('click', () => sendMessage(q));
        followupsDiv.appendChild(btn);
      });
      followupsDiv.style.display = 'flex';
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function appendMessage(sender, content, isHtml = false) {
    const msg = document.createElement('div');
    msg.className = `agent-msg ${sender}`;
    if (isHtml) {
      msg.innerHTML = content;
    } else {
      msg.innerHTML = `<p class="agent-msg-text">${escHtml(content)}</p>`;
    }
    messagesDiv.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Input handlers ──────────────────────────────────────────────────────────
  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage(inputEl.value);
  });
});
