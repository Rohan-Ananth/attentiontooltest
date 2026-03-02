// Mocking Chrome Extension APIs for testing
const chromeMock = {
  storage: {
    local: {
      data: {},
      get: (keys, cb) => {
        const result = {};
        keys.forEach(k => result[k] = chromeMock.storage.local.data[k]);
        setTimeout(() => cb(result), 0);
      },
      set: (obj, cb) => {
        Object.assign(chromeMock.storage.local.data, obj);
        if (cb) setTimeout(cb, 0);
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

async function testSessionTiming() {
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

async function runTests() {
  await testSessionTiming();
  await testWhitelist();
  console.log('All tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
