/**
 * auth.js — Firebase Authentication via REST API
 *
 * No Firebase SDK required. All calls are plain fetch() to Firebase's
 * public REST endpoints — works fine within MV3's strict CSP.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 * Set your Firebase Web API Key in firebase-config.js
 */

// Loaded from firebase-config.js (included before this script)
const FIREBASE_API_KEY = (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey)
  ? FIREBASE_CONFIG.apiKey
  : '';

const AUTH_URL  = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

// ── Internal ──────────────────────────────────────────────────────────────────

async function _post(endpoint, body) {
  const res  = await fetch(`${AUTH_URL}:${endpoint}?key=${FIREBASE_API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(_friendly(data?.error?.message || 'Unknown error'));
  return data;
}

function _friendly(code) {
  const map = {
    'EMAIL_EXISTS':                  'An account with this email already exists.',
    'INVALID_EMAIL':                 'Please enter a valid email address.',
    'WEAK_PASSWORD':                 'Password must be at least 6 characters.',
    'EMAIL_NOT_FOUND':               'No account found with that email.',
    'INVALID_PASSWORD':              'Incorrect password. Please try again.',
    'INVALID_LOGIN_CREDENTIALS':     'Incorrect email or password.',
    'USER_DISABLED':                 'This account has been disabled.',
    'TOO_MANY_ATTEMPTS_TRY_LATER':   'Too many attempts. Try again later.',
    'MISSING_PASSWORD':              'Please enter your password.',
    'OPERATION_NOT_ALLOWED':         'Email/password sign-in is not enabled in Firebase.',
  };
  for (const [key, val] of Object.entries(map)) {
    if (code.includes(key)) return val;
  }
  return code;
}

function _expiresAt() {
  return Date.now() + 55 * 60 * 1000; // 55 min (tokens last 60, give 5 min buffer)
}

// ── Public API ────────────────────────────────────────────────────────────────

const TideTrackAuth = {

  async signUp(email, password, displayName = '') {
    const data = await _post('signUp', { email, password, returnSecureToken: true });

    if (displayName.trim()) {
      await _post('update', {
        idToken: data.idToken,
        displayName: displayName.trim(),
        returnSecureToken: false
      }).catch(() => {});
    }

    const user = {
      uid:          data.localId,
      email:        data.email,
      displayName:  displayName.trim() || data.email.split('@')[0],
      idToken:      data.idToken,
      refreshToken: data.refreshToken,
      expiresAt:    _expiresAt()
    };
    await chrome.storage.local.set({ authUser: user });
    return user;
  },

  async signIn(email, password) {
    const data = await _post('signInWithPassword', {
      email, password, returnSecureToken: true
    });
    const user = {
      uid:          data.localId,
      email:        data.email,
      displayName:  data.displayName || data.email.split('@')[0],
      idToken:      data.idToken,
      refreshToken: data.refreshToken,
      expiresAt:    _expiresAt()
    };
    await chrome.storage.local.set({ authUser: user });
    return user;
  },

  async sendPasswordReset(email) {
    await _post('sendOobCode', { requestType: 'PASSWORD_RESET', email });
  },

  async signOut() {
    await chrome.storage.local.remove('authUser');
  },

  async getCurrentUser() {
    const { authUser } = await chrome.storage.local.get(['authUser']);
    if (!authUser) return null;
    if (Date.now() < authUser.expiresAt) return authUser;

    // Token expired — try refresh
    try {
      const res = await fetch(`${TOKEN_URL}?key=${FIREBASE_API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    `grant_type=refresh_token&refresh_token=${encodeURIComponent(authUser.refreshToken)}`
      });
      const data = await res.json();
      if (!res.ok) throw new Error('refresh failed');
      const updated = {
        ...authUser,
        idToken:      data.id_token,
        refreshToken: data.refresh_token,
        expiresAt:    _expiresAt()
      };
      await chrome.storage.local.set({ authUser: updated });
      return updated;
    } catch {
      await chrome.storage.local.remove('authUser');
      return null;
    }
  },

  async isAuthenticated() {
    return !!(await TideTrackAuth.getCurrentUser());
  }
};
