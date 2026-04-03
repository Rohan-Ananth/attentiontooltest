/* ════════════════════════════════════════════════════════════════════
   TideTrack — Focus Rooms (rooms.js)
   All logic for room list, active room, chat, timer, and summary.
   No inline scripts — Manifest V3 compliant.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────
  const AVATAR_COLORS = [
    '#5badee', '#e57373', '#f59e0b', '#52b788',
    '#a78bfa', '#f472b6', '#38bdf8', '#fb923c',
  ];

  const FIRST_NAMES = [
    'Alex', 'Jordan', 'Sam', 'Riley', 'Priya',
    'Kai', 'Morgan', 'Taylor', 'Jamie', 'Avery',
    'Mina', 'Leo', 'Dani', 'Rowan', 'Sage',
    'Quinn', 'Ellis', 'Nico', 'Zara', 'Dev',
  ];

  const TOPICS = [
    'Derivatives', 'Binary Trees', 'Thesis intro', 'Organic Chem',
    'Essay outline', 'Physics problems', 'Spanish vocab',
    'Data Structures', 'Art History', 'Statistics HW',
    'Econ midterm', 'Python project', 'Lab report',
  ];

  const KAI_SUGGESTIONS = [
    'Review integration techniques — you missed a few last session.',
    'Practice Big-O analysis problems to strengthen your weak spots.',
    'Try outlining your argument before writing the full essay.',
    'Focus on thermodynamics — your quiz scores were lower there.',
    'Review recursion examples before moving to dynamic programming.',
    'Revisit the French Revolution timeline — you flagged it earlier.',
    'Work through the practice problems in Chapter 7.',
    'Try summarizing each paragraph in your own words.',
  ];

  // ── Demo Rooms ─────────────────────────────────────────────────────
  function generateDemoRooms() {
    return [
      {
        id: 'room-1',
        name: 'Calculus Sprint',
        type: 'sprint',
        duration: 5,
        subject: 'Math',
        tags: ['Calculus', 'Derivatives'],
        participants: generateParticipants(4),
        maxParticipants: 10,
      },
      {
        id: 'room-2',
        name: 'CS Study Hall',
        type: 'focus',
        duration: 25,
        subject: 'Computer Science',
        tags: ['Algorithms', 'Data Structures'],
        participants: generateParticipants(7),
        maxParticipants: 15,
      },
      {
        id: 'room-3',
        name: 'Essay Writing',
        type: 'free',
        duration: 0,
        subject: 'English',
        tags: ['Writing', 'Research'],
        participants: generateParticipants(3),
        maxParticipants: 8,
      },
      {
        id: 'room-4',
        name: 'Organic Chem Grind',
        type: 'focus',
        duration: 50,
        subject: 'Chemistry',
        tags: ['Orgo', 'Reactions'],
        participants: generateParticipants(6),
        maxParticipants: 12,
      },
      {
        id: 'room-5',
        name: 'Physics Blitz',
        type: 'sprint',
        duration: 15,
        subject: 'Physics',
        tags: ['Mechanics', 'Problems'],
        participants: generateParticipants(5),
        maxParticipants: 10,
      },
    ];
  }

  function generateParticipants(count) {
    var shuffled = FIRST_NAMES.slice().sort(function () {
      return 0.5 - Math.random();
    });
    var result = [];
    for (var i = 0; i < count; i++) {
      result.push({
        name: shuffled[i] || 'Student',
        color: AVATAR_COLORS[i % AVATAR_COLORS.length],
        status: Math.random() > 0.25 ? 'active' : 'idle',
        topic: TOPICS[Math.floor(Math.random() * TOPICS.length)],
        focusTime: Math.floor(Math.random() * 20) + 3,
      });
    }
    return result;
  }

  // ── State ──────────────────────────────────────────────────────────
  var rooms = generateDemoRooms();
  var currentFilter = 'all';
  var activeRoom = null;
  var timerInterval = null;
  var timerSeconds = 0;
  var timerTotal = 0;
  var distractionCount = 0;
  var userName = 'You';

  // ── DOM refs ───────────────────────────────────────────────────────
  var screenList = document.getElementById('screenList');
  var screenRoom = document.getElementById('screenRoom');
  var screenSummary = document.getElementById('screenSummary');
  var roomsGrid = document.getElementById('roomsGrid');
  var globalCount = document.getElementById('globalCount');
  var createModal = document.getElementById('createModal');

  // Create modal inputs
  var roomNameInput = document.getElementById('roomNameInput');
  var roomSubjectInput = document.getElementById('roomSubjectInput');
  var durationOptions = document.getElementById('durationOptions');
  var typeOptions = document.getElementById('typeOptions');
  var maxPartSlider = document.getElementById('maxPartSlider');
  var maxPartVal = document.getElementById('maxPartVal');

  // Active room
  var activeRoomName = document.getElementById('activeRoomName');
  var activeRoomType = document.getElementById('activeRoomType');
  var participantsList = document.getElementById('participantsList');
  var timerCircle = document.getElementById('timerCircle');
  var timerDigits = document.getElementById('timerDigits');
  var yourTopic = document.getElementById('yourTopic');
  var kaiText = document.getElementById('kaiText');
  var chatMessages = document.getElementById('chatMessages');
  var chatInput = document.getElementById('chatInput');

  // Summary
  var summaryFocus = document.getElementById('summaryFocus');
  var summaryDistractions = document.getElementById('summaryDistractions');
  var summaryDuration = document.getElementById('summaryDuration');
  var summaryParticipants = document.getElementById('summaryParticipants');
  var leaderboardItems = document.getElementById('leaderboardItems');

  // ── Theme toggle ───────────────────────────────────────────────────
  document.getElementById('themeToggle').addEventListener('click', function () {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    try {
      chrome.storage.local.set({ theme: html.getAttribute('data-theme') });
    } catch (e) { /* not in extension context */ }
  });

  // Load saved theme
  try {
    chrome.storage.local.get('theme', function (d) {
      if (d.theme) document.documentElement.setAttribute('data-theme', d.theme);
    });
  } catch (e) { /* not in extension context */ }

  // ── Helpers ────────────────────────────────────────────────────────
  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function typeLabel(type) {
    if (type === 'sprint') return '5-min Sprint';
    if (type === 'focus') return '25-min Focus';
    return 'Free Study';
  }

  function typeBadgeClass(type) {
    if (type === 'sprint') return 'badge-sprint';
    if (type === 'focus') return 'badge-focus';
    return 'badge-free';
  }

  function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ── Render Room Cards ──────────────────────────────────────────────
  function renderRooms() {
    roomsGrid.innerHTML = '';

    var totalStudents = 0;
    rooms.forEach(function (r) { totalStudents += r.participants.length; });
    animateCounter(totalStudents);

    var filtered = rooms.filter(function (r) {
      if (currentFilter === 'all') return true;
      return r.type === currentFilter;
    });

    filtered.forEach(function (room) {
      var card = document.createElement('div');
      card.className = 'room-card fade-in';

      // Avatars HTML (show up to 4)
      var avatarsHTML = '';
      var shown = Math.min(room.participants.length, 4);
      for (var i = 0; i < shown; i++) {
        var p = room.participants[i];
        avatarsHTML += '<div class="avatar-circle" style="background:' + p.color + '">' +
          p.name.charAt(0) + '</div>';
      }

      // Tags
      var tagsHTML = '';
      room.tags.forEach(function (t) {
        tagsHTML += '<span class="tag">' + t + '</span>';
      });

      var durationText = room.duration > 0 ? room.duration + ' min' : 'Unlimited';

      card.innerHTML =
        '<div class="room-card-header">' +
          '<span class="room-name">' + room.name + '</span>' +
          '<span class="room-type-badge ' + typeBadgeClass(room.type) + '">' + typeLabel(room.type) + '</span>' +
        '</div>' +
        '<div class="room-meta">' +
          '<div class="participant-avatars">' + avatarsHTML + '</div>' +
          '<span>' + room.participants.length + '/' + room.maxParticipants + ' students</span>' +
          '<span>&middot;</span>' +
          '<span>' + durationText + '</span>' +
        '</div>' +
        '<div class="room-tags">' + tagsHTML + '</div>' +
        '<button class="btn-join" data-room="' + room.id + '">Join Room</button>';

      roomsGrid.appendChild(card);
    });

    // Attach join buttons
    roomsGrid.querySelectorAll('.btn-join').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var roomId = this.getAttribute('data-room');
        joinRoom(roomId);
      });
    });
  }

  // Animate counter
  var counterTarget = 0;
  var counterCurrent = 0;
  var counterTimer = null;
  function animateCounter(target) {
    counterTarget = target;
    if (counterTimer) clearInterval(counterTimer);
    counterTimer = setInterval(function () {
      if (counterCurrent < counterTarget) {
        counterCurrent++;
      } else if (counterCurrent > counterTarget) {
        counterCurrent--;
      } else {
        clearInterval(counterTimer);
        counterTimer = null;
        return;
      }
      globalCount.textContent = counterCurrent + ' students studying now';
    }, 60);
  }

  // ── Filters ────────────────────────────────────────────────────────
  document.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      this.classList.add('active');
      currentFilter = this.getAttribute('data-filter');
      if (currentFilter === 'free') currentFilter = 'free';
      renderRooms();
    });
  });

  // ── Create Room Modal ──────────────────────────────────────────────
  document.getElementById('btnCreateRoom').addEventListener('click', function () {
    createModal.classList.add('active');
  });

  document.getElementById('btnCancelCreate').addEventListener('click', function () {
    createModal.classList.remove('active');
  });

  createModal.addEventListener('click', function (e) {
    if (e.target === createModal) createModal.classList.remove('active');
  });

  // Duration option buttons
  durationOptions.querySelectorAll('.option-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      durationOptions.querySelectorAll('.option-btn').forEach(function (b) {
        b.classList.remove('selected');
      });
      this.classList.add('selected');
    });
  });

  // Type option buttons
  typeOptions.querySelectorAll('.option-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      typeOptions.querySelectorAll('.option-btn').forEach(function (b) {
        b.classList.remove('selected');
      });
      this.classList.add('selected');
    });
  });

  // Max participants slider
  maxPartSlider.addEventListener('input', function () {
    maxPartVal.textContent = this.value;
  });

  // Create & Start
  document.getElementById('btnCreateStart').addEventListener('click', function () {
    var name = roomNameInput.value.trim() || 'My Study Room';
    var subject = roomSubjectInput.value.trim() || 'General';
    var durBtn = durationOptions.querySelector('.option-btn.selected');
    var duration = durBtn ? parseInt(durBtn.getAttribute('data-dur'), 10) : 25;
    var typeBtn = typeOptions.querySelector('.option-btn.selected');
    var type = typeBtn ? typeBtn.getAttribute('data-type') : 'focus';
    var maxPart = parseInt(maxPartSlider.value, 10);

    var newRoom = {
      id: 'room-' + Date.now(),
      name: name,
      type: type,
      duration: duration,
      subject: subject,
      tags: subject.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      participants: generateParticipants(Math.floor(Math.random() * 3) + 1),
      maxParticipants: maxPart,
    };

    rooms.unshift(newRoom);
    createModal.classList.remove('active');
    roomNameInput.value = '';
    roomSubjectInput.value = '';
    renderRooms();
    joinRoom(newRoom.id);
  });

  // ── Join Room ──────────────────────────────────────────────────────
  function joinRoom(roomId) {
    var room = rooms.find(function (r) { return r.id === roomId; });
    if (!room) return;

    activeRoom = room;
    distractionCount = Math.floor(Math.random() * 4);

    // Add "You" as a participant
    var youParticipant = {
      name: userName,
      color: '#5badee',
      status: 'active',
      topic: room.subject || 'General',
      focusTime: 0,
      isYou: true,
    };
    activeRoom.participants = [youParticipant].concat(activeRoom.participants);

    switchScreen('room');
    setupActiveRoom();
    saveRoomHistory(room);
  }

  function setupActiveRoom() {
    var room = activeRoom;
    activeRoomName.textContent = room.name;
    activeRoomType.textContent = typeLabel(room.type) + (room.duration > 0 ? ' \u00B7 ' + room.duration + ' min' : '');

    yourTopic.textContent = room.subject || 'General';

    // Kai suggestion
    kaiText.textContent = randomPick(KAI_SUGGESTIONS);

    // Timer setup
    if (room.duration > 0) {
      timerTotal = room.duration * 60;
      timerSeconds = timerTotal;
    } else {
      // Free study — count up
      timerTotal = 0;
      timerSeconds = 0;
    }
    updateTimerDisplay();
    startTimer();

    // Render participants
    renderParticipants();

    // Load demo chat
    loadDemoChat();
  }

  // ── Participants ───────────────────────────────────────────────────
  function renderParticipants() {
    participantsList.innerHTML = '';
    activeRoom.participants.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'participant-item';

      var statusClass = p.status === 'active' ? 'status-active' : 'status-idle';
      var youTag = p.isYou ? ' (You)' : '';

      item.innerHTML =
        '<div class="participant-avatar" style="background:' + p.color + '">' +
          p.name.charAt(0) + '</div>' +
        '<div class="participant-info">' +
          '<div class="participant-name">' + p.name + youTag +
            ' <span class="status-indicator ' + statusClass + '"></span></div>' +
          '<div class="participant-topic">' + p.topic + '</div>' +
        '</div>' +
        '<span class="participant-time">' + p.focusTime + 'm</span>';

      participantsList.appendChild(item);
    });
  }

  // Periodically update participant focus times
  setInterval(function () {
    if (!activeRoom) return;
    activeRoom.participants.forEach(function (p) {
      if (!p.isYou) {
        p.focusTime += 1;
        // Occasionally toggle status
        if (Math.random() < 0.05) {
          p.status = p.status === 'active' ? 'idle' : 'active';
        }
      }
    });
    renderParticipants();
  }, 60000); // every minute

  // ── Timer ──────────────────────────────────────────────────────────
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);

    var circumference = 2 * Math.PI * 100;
    timerCircle.style.strokeDasharray = circumference;

    timerInterval = setInterval(function () {
      if (timerTotal > 0) {
        // Countdown
        timerSeconds--;
        if (timerSeconds <= 0) {
          timerSeconds = 0;
          clearInterval(timerInterval);
          timerInterval = null;
          endSession();
          return;
        }
        var progress = timerSeconds / timerTotal;
        timerCircle.style.strokeDashoffset = circumference * (1 - progress);
      } else {
        // Count up (free study)
        timerSeconds++;
        // No ring progress for free study — just show elapsed
        timerCircle.style.strokeDashoffset = 0;
      }
      updateTimerDisplay();

      // Update your focus time
      var you = activeRoom.participants.find(function (p) { return p.isYou; });
      if (you) you.focusTime = Math.floor((timerTotal > 0 ? timerTotal - timerSeconds : timerSeconds) / 60);
    }, 1000);
  }

  function updateTimerDisplay() {
    var displaySec = timerTotal > 0 ? timerSeconds : timerSeconds;
    timerDigits.textContent = formatTime(displaySec);

    if (timerTotal > 0) {
      var circumference = 2 * Math.PI * 100;
      var progress = timerSeconds / timerTotal;
      timerCircle.style.strokeDasharray = circumference;
      timerCircle.style.strokeDashoffset = circumference * (1 - progress);
    }
  }

  // ── Chat ───────────────────────────────────────────────────────────
  var demoChatMessages = [
    { author: 'Kai', text: 'Good luck everyone! Stay focused.', time: '2 min ago' },
    { author: 'Priya', text: 'Working on derivatives today. This room is great motivation!', time: '1 min ago' },
    { author: 'Sam', text: 'Just finished a problem set. Feeling productive.', time: 'Just now' },
  ];

  function loadDemoChat() {
    chatMessages.innerHTML = '';
    demoChatMessages.forEach(function (msg) {
      appendChatMessage(msg.author, msg.text, msg.time);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendChatMessage(author, text, time) {
    var div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML =
      '<div class="chat-msg-author">' + escapeHtml(author) + '</div>' +
      '<div class="chat-msg-text">' + escapeHtml(text) + '</div>' +
      '<div class="chat-msg-time">' + escapeHtml(time) + '</div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById('btnSend').addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendChatMessage();
  });

  function sendChatMessage() {
    var text = chatInput.value.trim();
    if (!text) return;
    appendChatMessage(userName, text, 'Just now');
    chatInput.value = '';

    // Simulate a reply after a short delay
    setTimeout(function () {
      var replies = [
        'Nice, keep it up!',
        'Same here, grinding away.',
        'Almost done with my section!',
        'This room is so productive.',
        'Let\'s go! We got this.',
        'Great focus energy today.',
      ];
      var responder = randomPick(FIRST_NAMES.slice(0, 8));
      appendChatMessage(responder, randomPick(replies), 'Just now');
    }, 2000 + Math.random() * 3000);
  }

  // ── Leave Room ─────────────────────────────────────────────────────
  document.getElementById('btnLeave').addEventListener('click', function () {
    endSession();
  });

  function endSession() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    var elapsed = timerTotal > 0 ? timerTotal - timerSeconds : timerSeconds;

    // Build summary data
    summaryFocus.textContent = formatTime(elapsed);
    summaryDistractions.textContent = distractionCount;
    summaryDuration.textContent = timerTotal > 0 ? Math.floor(timerTotal / 60) + ' min' : formatTime(elapsed);
    summaryParticipants.textContent = activeRoom.participants.length;

    // Build leaderboard
    var sorted = activeRoom.participants.slice().sort(function (a, b) {
      return b.focusTime - a.focusTime;
    });

    leaderboardItems.innerHTML = '';
    sorted.forEach(function (p, i) {
      var item = document.createElement('div');
      item.className = 'leaderboard-item';
      var rankClass = i === 0 ? 'gold' : '';
      var youBadge = p.isYou ? '<span class="you-badge">(you)</span>' : '';

      item.innerHTML =
        '<span class="leaderboard-rank ' + rankClass + '">' + (i + 1) + '</span>' +
        '<div class="leaderboard-avatar" style="background:' + p.color + '">' +
          p.name.charAt(0) + '</div>' +
        '<span class="leaderboard-name">' + p.name + youBadge + '</span>' +
        '<span class="leaderboard-time">' + p.focusTime + ' min</span>';

      leaderboardItems.appendChild(item);
    });

    // Remove "You" from the room participants for future joins
    if (activeRoom) {
      activeRoom.participants = activeRoom.participants.filter(function (p) {
        return !p.isYou;
      });
    }

    switchScreen('summary');
  }

  // ── Summary actions ────────────────────────────────────────────────
  document.getElementById('btnStudyAgain').addEventListener('click', function () {
    if (activeRoom) {
      joinRoom(activeRoom.id);
    } else {
      switchScreen('list');
      renderRooms();
    }
  });

  document.getElementById('btnLeaveSummary').addEventListener('click', function () {
    activeRoom = null;
    switchScreen('list');
    renderRooms();
  });

  // ── Screen Switching ───────────────────────────────────────────────
  function switchScreen(name) {
    screenList.classList.remove('active');
    screenRoom.classList.remove('active');
    screenSummary.classList.remove('active');

    if (name === 'list') screenList.classList.add('active');
    else if (name === 'room') screenRoom.classList.add('active');
    else if (name === 'summary') screenSummary.classList.add('active');
  }

  // ── Storage ────────────────────────────────────────────────────────
  function saveRoomHistory(room) {
    try {
      chrome.storage.local.get('roomData', function (d) {
        var history = d.roomData || { sessions: [] };
        history.sessions.push({
          roomName: room.name,
          type: room.type,
          subject: room.subject,
          joinedAt: new Date().toISOString(),
          duration: room.duration,
        });
        // Keep last 50 entries
        if (history.sessions.length > 50) {
          history.sessions = history.sessions.slice(-50);
        }
        chrome.storage.local.set({ roomData: history });
      });
    } catch (e) {
      // Not in extension context — use localStorage fallback
      try {
        var history = JSON.parse(localStorage.getItem('roomData') || '{"sessions":[]}');
        history.sessions.push({
          roomName: room.name,
          type: room.type,
          subject: room.subject,
          joinedAt: new Date().toISOString(),
          duration: room.duration,
        });
        if (history.sessions.length > 50) {
          history.sessions = history.sessions.slice(-50);
        }
        localStorage.setItem('roomData', JSON.stringify(history));
      } catch (e2) { /* silent */ }
    }
  }

  // Load tideData for Kai suggestions
  function loadTideDataForKai() {
    try {
      chrome.storage.local.get('tideData', function (d) {
        if (d.tideData && d.tideData.weakTopics && d.tideData.weakTopics.length > 0) {
          kaiText.textContent = 'Work on ' + d.tideData.weakTopics[0] +
            ' — your recent sessions suggest it needs attention.';
        }
      });
    } catch (e) { /* not in extension context */ }
  }

  // ── Initialize ─────────────────────────────────────────────────────
  renderRooms();
  loadTideDataForKai();

  // Simulate participant count fluctuation
  setInterval(function () {
    if (activeRoom) return; // don't update while in a room
    rooms.forEach(function (room) {
      if (Math.random() < 0.3) {
        if (Math.random() < 0.5 && room.participants.length < room.maxParticipants) {
          room.participants.push(generateParticipants(1)[0]);
        } else if (room.participants.length > 1) {
          room.participants.pop();
        }
      }
    });
    renderRooms();
  }, 8000);

})();
