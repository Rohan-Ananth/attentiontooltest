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
    onMessage: { addListener: () => {} },
    lastError: null
  },
  tabs: {
    query: (query, cb) => setTimeout(() => cb([]), 0),
    onActivated: { addListener: () => {} },
    onUpdated: { addListener: () => {} }
  },
  windows: {
    WINDOW_ID_NONE: -1,
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

// Load utils.js first
const utilsCode = fs.readFileSync(path.join(__dirname, 'my-folder', 'utils.js'), 'utf8');
const backgroundCode = fs.readFileSync(path.join(__dirname, 'my-folder', 'background.js'), 'utf8');

// Using a proper context for VM
const sandbox = {
  chrome: chromeMock,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Date: Date,
  Promise: Promise,
  URL: URL,
  Array: Array,
  Math: Math,
  Object: Object,
  // Mock importScripts to be a no-op (we load utils.js manually)
  importScripts: () => {}
};
vm.createContext(sandbox);

// Load utils.js into the sandbox first
vm.runInContext(utilsCode, sandbox);
// Then load background.js
vm.runInContext(backgroundCode, sandbox);

// Wait for restoreState() to complete (it's async and runs on load)
async function waitForRestore() {
  await new Promise(r => setTimeout(r, 200));
}

// ── Test helpers ──────────────────────────────────────────────────────────────
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ ${message}`);
    testsFailed++;
  }
}

// ── Utils tests ───────────────────────────────────────────────────────────────

function testFormatDuration() {
  console.log('\nRunning Test: formatDuration');

  const fmt = sandbox.formatDuration;
  assert(fmt(0) === '0s', 'Zero seconds returns "0s"');
  assert(fmt(null) === '0s', 'Null returns "0s"');
  assert(fmt(undefined) === '0s', 'Undefined returns "0s"');
  assert(fmt(30) === '30s', '30 seconds returns "30s"');
  assert(fmt(59) === '59s', '59 seconds returns "59s"');
  assert(fmt(60) === '1m 0s', '60 seconds returns "1m 0s"');
  assert(fmt(90) === '1m 30s', '90 seconds returns "1m 30s"');
  assert(fmt(3600) === '1h 0m', '3600 seconds returns "1h 0m"');
  assert(fmt(3661) === '1h 1m', '3661 seconds returns "1h 1m"');
  assert(fmt(7200) === '2h 0m', '7200 seconds returns "2h 0m"');
}

function testExtractHostname() {
  console.log('\nRunning Test: extractHostname');

  const extract = sandbox.extractHostname;
  assert(extract('https://www.google.com/search') === 'google.com', 'Strips www and path');
  assert(extract('https://Google.COM') === 'google.com', 'Lowercases hostname');
  assert(extract('http://mail.google.com') === 'mail.google.com', 'Preserves subdomains');
  assert(extract('https://docs.google.com:8080/doc') === 'docs.google.com', 'Strips port and path');
  assert(extract('not-a-url') === '', 'Returns empty for invalid URLs');
  assert(extract('') === '', 'Returns empty for empty string');
  assert(extract(null) === '', 'Returns empty for null');
}

function testIsInternalUrl() {
  console.log('\nRunning Test: isInternalUrl');

  const isInternal = sandbox.isInternalUrl;
  assert(isInternal('chrome://extensions') === true, 'chrome:// is internal');
  assert(isInternal('chrome-extension://abc123') === true, 'chrome-extension:// is internal');
  assert(isInternal('about:blank') === true, 'about: is internal');
  assert(isInternal('file:///home/user') === true, 'file:// is internal');
  assert(isInternal('https://google.com') === false, 'https:// is not internal');
  assert(isInternal('http://localhost') === false, 'http:// is not internal');
  assert(isInternal(null) === true, 'null is treated as internal');
  assert(isInternal('') === true, 'empty string is treated as internal');
}

function testValidateSegment() {
  console.log('\nRunning Test: validateSegment');

  const validate = sandbox.validateSegment;

  const validSeg = {
    type: 'study',
    startTime: Date.now() - 60000,
    endTime: Date.now(),
    duration: 60,
    url: 'https://google.com'
  };
  assert(validate(validSeg) !== null, 'Valid segment passes validation');

  assert(validate(null) === null, 'Null fails validation');
  assert(validate({}) === null, 'Empty object fails validation');
  assert(validate({ ...validSeg, type: 'invalid' }) === null, 'Invalid type fails validation');
  assert(validate({ ...validSeg, type: undefined }) === null, 'Missing type fails validation');
  assert(validate({ ...validSeg, startTime: -1 }) === null, 'Negative startTime fails validation');
  assert(validate({ ...validSeg, startTime: 'not-a-number' }) === null, 'String startTime fails validation');
  assert(validate({ ...validSeg, endTime: 0 }) === null, 'Zero endTime fails validation');
  assert(validate({ ...validSeg, duration: -5 }) === null, 'Negative duration fails validation');
  assert(validate({ ...validSeg, url: 123 }) === null, 'Non-string URL fails validation');

  const distractionSeg = { ...validSeg, type: 'distraction' };
  assert(validate(distractionSeg) !== null, 'Distraction type passes validation');
}

// ── Background.js tests ───────────────────────────────────────────────────────

async function testSessionTiming() {
  await waitForRestore();
  console.log('\nRunning Test: Session Timing');

  chromeMock.storage.local.data.whitelist = ['google.com'];

  // Call the function in the VM — study.com is NOT whitelisted, so type is 'distraction'
  vm.runInContext("attemptStartSegment('https://study.com', 'distraction')", sandbox);

  // Wait 6 seconds (START_DELAY is 5s)
  await new Promise(r => setTimeout(r, 6000));

  // Check sandbox state
  const currentSession = vm.runInContext('currentSession', sandbox);
  assert(
    currentSession && currentSession.url === 'https://study.com',
    'Segment started correctly after 5s grace period'
  );

  // End segment
  vm.runInContext('endSegment()', sandbox);
  await new Promise(r => setTimeout(r, 500));

  const currentSessionAfter = vm.runInContext('currentSession', sandbox);
  assert(!currentSessionAfter, 'Segment ended correctly');

  const segments = chromeMock.storage.local.data.segments;
  const dateKey = new Date().toISOString().split('T')[0];
  assert(
    segments && segments[dateKey] && segments[dateKey].length > 0,
    'Segment saved to storage correctly'
  );
}

async function testWhitelist() {
  console.log('\nRunning Test: Whitelist');
  vm.runInContext('currentSession = null', sandbox);

  chromeMock.storage.local.data.whitelist = ['google.com'];
  // google.com IS whitelisted — type is 'study', which has 0ms delay
  vm.runInContext("attemptStartSegment('https://google.com', 'study')", sandbox);

  await new Promise(r => setTimeout(r, 1000));

  const currentSession = vm.runInContext('currentSession', sandbox);
  assert(
    currentSession && currentSession.type === 'study',
    'Whitelisted URL started a study segment (no delay)'
  );

  // Clean up
  vm.runInContext('endSegment()', sandbox);
  await new Promise(r => setTimeout(r, 500));
}

async function testWhitelistCaseInsensitive() {
  console.log('\nRunning Test: Whitelist Case Insensitivity');

  chromeMock.storage.local.data.whitelist = ['Google.COM'];

  const result = await new Promise((resolve) => {
    vm.runInContext(`
      isWhitelisted('https://google.com/search').then(result => {
        globalThis._whitelistResult = result;
      });
    `, sandbox);
    setTimeout(() => {
      resolve(vm.runInContext('globalThis._whitelistResult', sandbox));
    }, 200);
  });

  assert(result === true, 'Case-insensitive whitelist match works');
}

async function testWhitelistSubdomain() {
  console.log('\nRunning Test: Whitelist Subdomain Matching');

  chromeMock.storage.local.data.whitelist = ['google.com'];

  const result = await new Promise((resolve) => {
    vm.runInContext(`
      isWhitelisted('https://mail.google.com').then(result => {
        globalThis._subdomainResult = result;
      });
    `, sandbox);
    setTimeout(() => {
      resolve(vm.runInContext('globalThis._subdomainResult', sandbox));
    }, 200);
  });

  assert(result === true, 'Subdomain matches parent domain whitelist entry');

  // Ensure partial matches don't work (e.g. "notgoogle.com" should NOT match "google.com")
  const result2 = await new Promise((resolve) => {
    vm.runInContext(`
      isWhitelisted('https://notgoogle.com').then(result => {
        globalThis._partialResult = result;
      });
    `, sandbox);
    setTimeout(() => {
      resolve(vm.runInContext('globalThis._partialResult', sandbox));
    }, 200);
  });

  assert(result2 === false, 'Partial domain match correctly rejected (notgoogle.com != google.com)');
}

async function testPersistence() {
  console.log('\nRunning Test: Service Worker Persistence');
  vm.runInContext('currentSession = null', sandbox);

  chromeMock.storage.local.data.whitelist = ['google.com'];

  // Start a distraction segment
  vm.runInContext("attemptStartSegment('https://reddit.com', 'distraction')", sandbox);
  await new Promise(r => setTimeout(r, 6000));

  // Verify segment started
  const session = vm.runInContext('currentSession', sandbox);
  assert(
    session && session.url === 'https://reddit.com',
    'Distraction segment started for persistence test'
  );

  // Check that _liveState was persisted to storage
  const liveState = chromeMock.storage.local.data._liveState;
  assert(!!liveState, '_liveState exists in storage');
  assert(
    liveState.currentSession && liveState.currentSession.url === 'https://reddit.com',
    '_liveState.currentSession matches active session'
  );
  assert(!!liveState.studyDayStart, '_liveState.studyDayStart persisted');

  // Simulate service worker restart: clear in-memory state, then restore
  vm.runInContext('currentSession = null; studyDayStart = null;', sandbox);
  vm.runInContext('restoreState()', sandbox);
  await new Promise(r => setTimeout(r, 500));

  const restored = vm.runInContext('currentSession', sandbox);
  assert(
    restored && restored.url === 'https://reddit.com' && restored.type === 'distraction',
    'Session restored after simulated service worker restart'
  );

  const restoredDayStart = vm.runInContext('studyDayStart', sandbox);
  assert(!!restoredDayStart, 'studyDayStart restored correctly');

  // Clean up
  vm.runInContext('endSegment()', sandbox);
  await new Promise(r => setTimeout(r, 500));

  // After ending, _liveState should have null currentSession
  const clearedState = chromeMock.storage.local.data._liveState;
  assert(
    clearedState && !clearedState.currentSession,
    'Live state cleared after segment end'
  );
}

async function testReportGeneration() {
  console.log('\nRunning Test: Report Generation');

  // Clear storage and set up test data
  const dateKey = new Date().toISOString().split('T')[0];
  chromeMock.storage.local.data.segments = {
    [dateKey]: [
      { type: 'study', startTime: Date.now() - 7200000, endTime: Date.now() - 3600000, duration: 3600, url: 'https://docs.google.com' },
      { type: 'distraction', startTime: Date.now() - 3600000, endTime: Date.now() - 2400000, duration: 1200, url: 'https://reddit.com' },
      { type: 'study', startTime: Date.now() - 2400000, endTime: Date.now() - 600000, duration: 1800, url: 'https://notion.so' },
      // Corrupted segment — should be filtered out
      { type: 'invalid', startTime: 'bad', endTime: null, duration: -5, url: 123 },
      null,
    ]
  };

  vm.runInContext('currentSession = null; studyDayStart = Date.now() - 7200000;', sandbox);

  await new Promise((resolve) => {
    vm.runInContext(`
      generateReport().then(r => { globalThis._testReport = r; });
    `, sandbox);
    setTimeout(resolve, 1000);
  });

  const report = vm.runInContext('globalThis._testReport', sandbox);
  assert(!!report, 'Report was generated');
  assert(report.totalStudy === 5400, 'Total study time calculated correctly (3600 + 1800)');
  assert(report.totalDistraction === 1200, 'Total distraction time calculated correctly');
  assert(report.productivityPct === 82, 'Productivity percentage calculated correctly (82%)');
  assert(report.recommendations.length > 0, 'Recommendations generated');
  assert(report.distractionByDomain['reddit.com'] === 1200, 'Distraction by domain tracked correctly');
}

async function testReportWithCorruptedData() {
  console.log('\nRunning Test: Report with fully corrupted data');

  const dateKey = new Date().toISOString().split('T')[0];
  chromeMock.storage.local.data.segments = {
    [dateKey]: 'not-an-array'
  };

  vm.runInContext('currentSession = null; studyDayStart = Date.now();', sandbox);

  await new Promise((resolve) => {
    vm.runInContext(`
      generateReport().then(r => { globalThis._corruptReport = r; });
    `, sandbox);
    setTimeout(resolve, 500);
  });

  const report = vm.runInContext('globalThis._corruptReport', sandbox);
  assert(!!report, 'Report generated even with corrupted data');
  assert(report.totalStudy === 0, 'Total study is 0 for corrupted data');
  assert(report.totalDistraction === 0, 'Total distraction is 0 for corrupted data');

  // Clean up corrupted data so subsequent tests aren't affected
  chromeMock.storage.local.data.segments = {};
}

async function testGracePeriodCancellation() {
  console.log('\nRunning Test: Grace Period Cancellation');
  vm.runInContext('currentSession = null', sandbox);

  // Start a distraction with 5s grace period
  vm.runInContext("attemptStartSegment('https://youtube.com', 'distraction')", sandbox);

  // Switch back to study within grace period (before 5s)
  await new Promise(r => setTimeout(r, 1000));
  vm.runInContext("attemptStartSegment('https://google.com', 'study')", sandbox);

  await new Promise(r => setTimeout(r, 500));

  const session = vm.runInContext('currentSession', sandbox);
  assert(
    session && session.type === 'study',
    'Grace period cancelled when switching to study site'
  );

  // Wait past original grace period — should still be study
  await new Promise(r => setTimeout(r, 5000));
  const sessionAfter = vm.runInContext('currentSession', sandbox);
  assert(
    sessionAfter && sessionAfter.type === 'study',
    'Distraction segment never started after grace period cancellation'
  );

  // Clean up
  vm.runInContext('endSegment()', sandbox);
  await new Promise(r => setTimeout(r, 500));
}

// ── Run all tests ────────────────────────────────────────────────────────────

async function runTests() {
  // Utils tests (fast, no delays)
  testFormatDuration();
  testExtractHostname();
  testIsInternalUrl();
  testValidateSegment();

  // Background logic tests (require timeouts for grace periods)
  await testSessionTiming();
  await testWhitelist();
  await testWhitelistCaseInsensitive();
  await testWhitelistSubdomain();
  await testPersistence();
  await testReportGeneration();
  await testReportWithCorruptedData();
  await testGracePeriodCancellation();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Tests complete: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`${'═'.repeat(50)}`);

  if (testsFailed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
