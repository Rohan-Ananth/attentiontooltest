// Mocking Chrome Extension APIs for testing
const chromeMock = {
  storage: {
    local: {
      data: {},
      get: (keys, cb) => {
        const result = {};
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => result[k] = chromeMock.storage.local.data[k]);
        // Support both callback and promise patterns (like real MV3 API)
        if (cb) {
          setTimeout(() => cb(result), 0);
        }
        return Promise.resolve(result);
      },
      set: (obj, cb) => {
        Object.assign(chromeMock.storage.local.data, obj);
        if (cb) setTimeout(cb, 0);
        return Promise.resolve();
      },
      remove: (keys, cb) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => delete chromeMock.storage.local.data[k]);
        if (cb) setTimeout(cb, 0);
        return Promise.resolve();
      }
    }
  },
  runtime: {
    sendMessage: (msg, cb) => { if(cb) setTimeout(() => cb({}), 0); return Promise.resolve(); },
    onMessage: { addListener: () => {} }
  },
  tabs: {
    query: (query, cb) => setTimeout(() => cb([]), 0),
    onActivated: { addListener: () => {} },
    onUpdated: { addListener: () => {} }
  },
  windows: {
    onFocusChanged: { addListener: () => {} }
  },
  idle: {
    setDetectionInterval: () => {},
    onStateChanged: { addListener: () => {} }
  }
};

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backgroundCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');

// Using a proper context for VM
const sandbox = {
  chrome: chromeMock,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Date: Date,
  Promise: Promise
};
vm.createContext(sandbox);
vm.runInContext(backgroundCode, sandbox);

// Wait for restoreState() to complete (it's async and runs on load)
async function waitForRestore() {
  await new Promise(r => setTimeout(r, 200));
}

async function testSessionTiming() {
  await waitForRestore();
  console.log('Running Test: Session Timing');
  
  chromeMock.storage.local.data.whitelist = ['google.com'];

  // Call the function in the VM — study.com is NOT whitelisted, so type is 'distraction'
  vm.runInContext("attemptStartSegment('study.com', 'distraction')", sandbox);
  
  // Wait 6 seconds (START_DELAY is 5s)
  await new Promise(r => setTimeout(r, 6000));
  
  // Check sandbox state
  const currentSession = vm.runInContext('currentSession', sandbox);
  if (currentSession && currentSession.url === 'study.com') {
    console.log('✅ Segment started correctly after 5s');
  } else {
    console.error('❌ Segment failed to start after 5s');
    console.log('currentSession from VM:', currentSession);
    process.exit(1);
  }

  // End segment
  vm.runInContext('endSegment()', sandbox);
  await new Promise(r => setTimeout(r, 500));
  
  const currentSessionAfter = vm.runInContext('currentSession', sandbox);
  if (!currentSessionAfter) {
    console.log('✅ Segment ended correctly');
  } else {
    console.error('❌ Segment failed to end');
    process.exit(1);
  }

  const segments = chromeMock.storage.local.data.segments;
  const dateKey = new Date().toISOString().split('T')[0];
  if (segments && segments[dateKey] && segments[dateKey].length > 0) {
    console.log('✅ Segment saved to storage correctly');
  } else {
    console.error('❌ Segment not found in storage');
    process.exit(1);
  }
}

async function testWhitelist() {
  console.log('Running Test: Whitelist');
  vm.runInContext('currentSession = null', sandbox);
  
  chromeMock.storage.local.data.whitelist = ['google.com'];
  // google.com IS whitelisted — type is 'study', which has 0ms delay
  vm.runInContext("attemptStartSegment('google.com', 'study')", sandbox);
  
  await new Promise(r => setTimeout(r, 1000));
  
  const currentSession = vm.runInContext('currentSession', sandbox);
  if (currentSession && currentSession.type === 'study') {
    console.log('✅ Whitelisted URL started a study segment (not distraction)');
  } else if (!currentSession) {
    console.error('❌ Whitelisted URL did not start any segment');
    process.exit(1);
  } else {
    console.error('❌ Whitelisted URL started wrong segment type:', currentSession.type);
    process.exit(1);
  }

  // Clean up
  vm.runInContext('endSegment()', sandbox);
  await new Promise(r => setTimeout(r, 500));
}

async function testPersistence() {
  console.log('Running Test: Service Worker Persistence');
  vm.runInContext('currentSession = null', sandbox);
  
  chromeMock.storage.local.data.whitelist = ['google.com'];

  // Start a distraction segment
  vm.runInContext("attemptStartSegment('reddit.com', 'distraction')", sandbox);
  await new Promise(r => setTimeout(r, 6000));

  // Verify segment started
  const session = vm.runInContext('currentSession', sandbox);
  if (!session || session.url !== 'reddit.com') {
    console.error('❌ Segment did not start for persistence test');
    process.exit(1);
  }

  // Check that _liveState was persisted to storage
  const liveState = chromeMock.storage.local.data._liveState;
  if (!liveState) {
    console.error('❌ _liveState not found in storage');
    process.exit(1);
  }
  if (!liveState.currentSession || liveState.currentSession.url !== 'reddit.com') {
    console.error('❌ _liveState.currentSession does not match active session');
    process.exit(1);
  }
  if (!liveState.studyDayStart) {
    console.error('❌ _liveState.studyDayStart not persisted');
    process.exit(1);
  }
  console.log('✅ Live state persisted to storage correctly');

  // Simulate service worker restart: clear in-memory state, then restore
  vm.runInContext('currentSession = null; studyDayStart = null;', sandbox);
  vm.runInContext('restoreState()', sandbox);
  await new Promise(r => setTimeout(r, 500));

  const restored = vm.runInContext('currentSession', sandbox);
  if (restored && restored.url === 'reddit.com' && restored.type === 'distraction') {
    console.log('✅ Session restored after simulated service worker restart');
  } else {
    console.error('❌ Session not restored correctly:', restored);
    process.exit(1);
  }

  const restoredDayStart = vm.runInContext('studyDayStart', sandbox);
  if (restoredDayStart) {
    console.log('✅ studyDayStart restored correctly');
  } else {
    console.error('❌ studyDayStart not restored');
    process.exit(1);
  }

  // Clean up
  vm.runInContext('endSegment()', sandbox);
  await new Promise(r => setTimeout(r, 500));

  // After ending, _liveState should have null currentSession
  const clearedState = chromeMock.storage.local.data._liveState;
  if (clearedState && !clearedState.currentSession) {
    console.log('✅ Live state cleared after segment end');
  } else {
    console.error('❌ Live state not cleared after segment end');
    process.exit(1);
  }
}

async function runTests() {
  await testSessionTiming();
  await testWhitelist();
  await testPersistence();
  console.log('All tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
