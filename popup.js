document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const totalTimeEl = document.getElementById('totalTime');
  const stopBtn = document.getElementById('stopBtn');

  function updateUI() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
      if (response) {
        statusEl.textContent = response.active ? 'Active' : 'Idle';
        stopBtn.disabled = !response.active;
      }
    });

    const today = new Date().toISOString().split('T')[0];
    chrome.storage.local.get(['sessions'], (result) => {
      const sessions = result.sessions || {};
      const todaySessions = sessions[today] || [];
      const totalSeconds = todaySessions.reduce((acc, seg) => acc + (seg.duration || 0), 0);
      totalTimeEl.textContent = formatDuration(totalSeconds);
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
      updateUI();
    });
  });

  // Listen for updates from background
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
  if (response?.active && response.startTime) {
    const liveSeconds = Math.floor((Date.now() - response.startTime) / 1000);
    totalTimeEl.textContent = formatDuration(totalSeconds + liveSeconds); // add live time
  }
});

  updateUI();
  // Update UI every second if active? Maybe just when opened is enough.
  setInterval(updateUI, 1000);
});
