document.addEventListener('DOMContentLoaded', () => {

  // ── Elements ──────────────────────────────────────────────────────────────
  const tabBtns     = document.querySelectorAll('.tab-btn');
  const signinForm  = document.getElementById('signinForm');
  const signupForm  = document.getElementById('signupForm');
  const authSection = document.getElementById('authSection');
  const resetSection= document.getElementById('resetSection');
  const msgBox      = document.getElementById('msgBox');
  const resetMsg    = document.getElementById('resetMsg');

  // Sign in
  const siEmail    = document.getElementById('si-email');
  const siPassword = document.getElementById('si-password');
  const signinBtn  = document.getElementById('signinBtn');
  const forgotLink = document.getElementById('forgotLink');

  // Sign up
  const suName     = document.getElementById('su-name');
  const suEmail    = document.getElementById('su-email');
  const suPassword = document.getElementById('su-password');
  const suConfirm  = document.getElementById('su-confirm');
  const signupBtn  = document.getElementById('signupBtn');

  // Reset
  const resetEmail = document.getElementById('reset-email');
  const resetBtn   = document.getElementById('resetBtn');
  const backToSignin = document.getElementById('backToSignin');

  // ── Redirect if already signed in ────────────────────────────────────────
  TideTrackAuth.getCurrentUser().then(user => {
    if (user) redirectAfterAuth();
  });

  // ── Tab switching ─────────────────────────────────────────────────────────
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      clearMsg();

      if (btn.dataset.tab === 'signin') {
        signinForm.style.display = 'block';
        signupForm.style.display = 'none';
      } else {
        signinForm.style.display = 'none';
        signupForm.style.display = 'block';
      }
    });
  });

  // ── Sign in ───────────────────────────────────────────────────────────────
  signinBtn.addEventListener('click', async () => {
    const email    = siEmail.value.trim();
    const password = siPassword.value;

    if (!email || !password) {
      showMsg(msgBox, 'Please fill in all fields.', 'error');
      return;
    }

    setLoading(signinBtn, true);
    clearMsg();

    try {
      await TideTrackAuth.signIn(email, password);
      redirectAfterAuth();
    } catch (err) {
      showMsg(msgBox, err.message, 'error');
      setLoading(signinBtn, false, 'Sign in');
    }
  });

  // Enter key on password field
  siPassword.addEventListener('keydown', e => {
    if (e.key === 'Enter') signinBtn.click();
  });

  // ── Sign up ───────────────────────────────────────────────────────────────
  signupBtn.addEventListener('click', async () => {
    const name     = suName.value.trim();
    const email    = suEmail.value.trim();
    const password = suPassword.value;
    const confirm  = suConfirm.value;

    if (!email || !password) {
      showMsg(msgBox, 'Email and password are required.', 'error');
      return;
    }
    if (password !== confirm) {
      showMsg(msgBox, 'Passwords do not match.', 'error');
      suConfirm.classList.add('error');
      return;
    }
    if (password.length < 6) {
      showMsg(msgBox, 'Password must be at least 6 characters.', 'error');
      return;
    }

    suConfirm.classList.remove('error');
    setLoading(signupBtn, true);
    clearMsg();

    try {
      await TideTrackAuth.signUp(email, password, name);
      redirectAfterAuth();
    } catch (err) {
      showMsg(msgBox, err.message, 'error');
      setLoading(signupBtn, false, 'Create account');
    }
  });

  suConfirm.addEventListener('keydown', e => {
    if (e.key === 'Enter') signupBtn.click();
  });

  // ── Forgot password → show reset section ─────────────────────────────────
  forgotLink.addEventListener('click', () => {
    authSection.style.display  = 'none';
    resetSection.style.display = 'block';
    clearMsg();
  });

  backToSignin.addEventListener('click', () => {
    resetSection.style.display = 'none';
    authSection.style.display  = 'block';
    clearMsg();
  });

  // ── Password reset ────────────────────────────────────────────────────────
  resetBtn.addEventListener('click', async () => {
    const email = resetEmail.value.trim();
    if (!email) {
      showMsg(resetMsg, 'Please enter your email address.', 'error');
      return;
    }

    setLoading(resetBtn, true);

    try {
      await TideTrackAuth.sendPasswordReset(email);
      showMsg(resetMsg, `Reset link sent to ${email}. Check your inbox.`, 'success');
      setLoading(resetBtn, false, 'Send reset link');
    } catch (err) {
      showMsg(resetMsg, err.message, 'error');
      setLoading(resetBtn, false, 'Send reset link');
    }
  });

  resetEmail.addEventListener('keydown', e => {
    if (e.key === 'Enter') resetBtn.click();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function redirectAfterAuth() {
    // If opened as a popup window from options.html, close and let options reload
    if (window.opener) {
      window.opener.postMessage({ type: 'AUTH_SUCCESS' }, '*');
      window.close();
    } else {
      // Opened in a full tab — go to options page
      window.location.href = chrome.runtime.getURL('options.html');
    }
  }

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className   = `msg ${type}`;
  }

  function clearMsg() {
    msgBox.className   = 'msg';
    msgBox.textContent = '';
  }

  function setLoading(btn, loading, label = '') {
    if (loading) {
      btn.disabled   = true;
      btn.innerHTML  = '<span class="spinner"></span>';
    } else {
      btn.disabled   = false;
      btn.innerHTML  = `<span>${label}</span>`;
    }
  }
});
