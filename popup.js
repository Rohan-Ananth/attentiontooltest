document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const totalTimeEl = document.getElementById('totalTime');
  const stopBtn = document.getElementById('stopBtn');

  let activeStartTime = null;

  function updateUI() {
    const today = new Date().toISOString().split('T')[0];

    chrome.storage.local.get(['sessions'], (result) => {
      const sessions = result.sessions || {};
      const todaySessions = sessions[today] || [];

      // Sum all saved (completed) sessions for today
      const savedSeconds = todaySessions.reduce((acc, seg) => acc + (seg.duration || 0), 0);

      // Add the live (unsaved) current session time on top
      const liveSeconds = activeStartTime
        ? Math.floor((Date.now() - activeStartTime) / 1000)
        : 0;

      totalTimeEl.textContent = formatDuration(savedSeconds + liveSeconds);
    });

    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) return; // popup opened before background ready

      if (response) {
        const isActive = response.active;
        statusEl.textContent = isActive ? 'Active' : 'Idle';
        stopBtn.disabled = !isActive;

        // Track live start time locally so the ticker works
        activeStartTime = isActive ? response.startTime : null;
      }
    });
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopSession' }, () => {
      activeStartTime = null;
      updateUI();
    });
  });

  // Listen for background status pushes (tab switches, idle, etc.)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statusUpdate') {
      updateUI();
    }
  });

  updateUI();

  // Tick every second so the live timer counts up visually
  setInterval(updateUI, 1000);
});
