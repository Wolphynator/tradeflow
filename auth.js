(function () {

const SVG_EYE     = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

const EMAIL_TYPOS = {
  'gmal.com':'gmail.com',   'gmial.com':'gmail.com',  'gnail.com':'gmail.com',
  'gamil.com':'gmail.com',  'gmil.com':'gmail.com',   'gmail.co':'gmail.com',
  'lmail.com':'gmail.com',
  'gmaill.com':'gmail.com', 'gmai.com':'gmail.com',   'gmali.com':'gmail.com',
  'yaho.com':'yahoo.com',   'yho.com':'yahoo.com',    'yhoo.com':'yahoo.com',
  'yahho.com':'yahoo.com',
  'yahew.com':'yahoo.com',  'yahooo.com':'yahoo.com', 'yahoo.cm':'yahoo.com',
  'yaho.co.uk':'yahoo.co.uk', 'yhoo.co.uk':'yahoo.co.uk',
  'hotmial.com':'hotmail.com', 'hotmai.com':'hotmail.com', 'homail.com':'hotmail.com',
  'hotmil.com':'hotmail.com',  'hotmall.com':'hotmail.com',
  'outlok.com':'outlook.com',  'outllok.com':'outlook.com', 'ourlook.com':'outlook.com',
  'iclod.com':'icloud.com',    'icoud.com':'icloud.com',   'icloud.co':'icloud.com',
  'gmail.c.uk':'gmail.co.uk',  'hotmail.c.uk':'hotmail.co.uk', 'yahoo.c.uk':'yahoo.co.uk',
};

const COMMON_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'gmail.co.uk', 'yahoo.co.uk', 'hotmail.co.uk', 'outlook.co.uk'
];

const AUTH_EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function suggestEmailDomain(domain) {
  if (EMAIL_TYPOS[domain]) return EMAIL_TYPOS[domain];
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  let best = null;
  let bestDistance = Infinity;
  COMMON_EMAIL_DOMAINS.forEach(candidate => {
    const distance = editDistance(domain, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  });
  return bestDistance <= 2 ? best : null;
}

window.currentUser     = null;
window.currentBusiness = null;

// ─── Password checklist ────────────────────────────────────────────────────
const PW_RULES = [
  ['pwc-len', pw => pw.length >= 8,   'At least 8 characters'],
  ['pwc-up',  pw => /[A-Z]/.test(pw), 'One uppercase letter'],
  ['pwc-low', pw => /[a-z]/.test(pw), 'One lowercase letter'],
  ['pwc-num', pw => /[0-9]/.test(pw), 'One number'],
];

function updatePasswordChecklist(pw) {
  const list = document.getElementById('signup-pw-checklist');
  if (!list) return;
  if (!pw) { list.style.display = 'none'; return; }
  list.style.display = 'block';
  PW_RULES.forEach(([id, test, label]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const pass = test(pw);
    el.className   = 'pwc-row ' + (pass ? 'ok' : 'fail');
    el.textContent = (pass ? '✓ ' : '✗ ') + label;
  });
}

// ─── Password visibility toggle ────────────────────────────────────────────
function togglePwVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show  = input.type === 'password';
  input.type  = show ? 'text' : 'password';
  btn.innerHTML = show ? SVG_EYE_OFF : SVG_EYE;
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

// ─── Validation ────────────────────────────────────────────────────────────
function validateAuthEmail(email) {
  if (!email || !AUTH_EMAIL_PATTERN.test(email)) {
    return { valid: false, message: 'Please enter a valid email address.' };
  }
  const [local, rawDomain] = email.split('@');
  const domain = rawDomain.toLowerCase();
  const parts = domain.split('.');
  if (parts.some(part => !part || part.length > 63 || !/^[a-z0-9-]+$/.test(part) || part.startsWith('-') || part.endsWith('-'))) {
    return { valid: false, message: 'Please enter a valid email domain.' };
  }
  if (parts.length === 2 && parts[1] === 'uk' && parts[0].length < 2) {
    return { valid: false, message: 'Please enter a valid email domain, for example name@example.co.uk.' };
  }
  const suggestedDomain = suggestEmailDomain(domain);
  if (suggestedDomain) {
    const suggestion = local + '@' + suggestedDomain;
    return { valid: false, suggestion, message: 'Email domain looks misspelled. Did you mean ' + suggestion + '?' };
  }
  return { valid: true };
}

function validatePassword(pw) {
  const failed = [];
  if (pw.length < 8)       failed.push('at least 8 characters');
  if (!/[A-Z]/.test(pw))  failed.push('one uppercase letter');
  if (!/[a-z]/.test(pw))  failed.push('one lowercase letter');
  if (!/[0-9]/.test(pw))  failed.push('one number');
  if (!failed.length)      return { valid: true };
  return { valid: false, message: 'Password needs: ' + failed.join(', ') + '.' };
}

function humanizeAuthError(error) {
  const m = (error.message || '').toLowerCase();
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already'))
    return 'An account with this email already exists. Try signing in instead.';
  if (m.includes('invalid login credentials') || m.includes('invalid email or password') || m.includes('invalid credentials'))
    return 'Incorrect email or password. Please try again.';
  if (m.includes('email not confirmed'))
    return 'Sign-in failed. If you recently signed up, check your inbox for a confirmation link.';
  if (m.includes('too many') || m.includes('rate limit') || m.includes('over_email_send_rate_limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  return error.message || 'Something went wrong. Please try again.';
}

// ─── Error / hint display ──────────────────────────────────────────────────
function showAuthError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  const text = String(msg || '').trim();
  if (!text) return;
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(document.createTextNode(text));
  el.classList.add('show');
  el.style.display = 'block';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
}

function clearAuthError(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.remove('show');
  el.style.display = '';
  while (el.firstChild) el.removeChild(el.firstChild);
}

function showEmailHint(hintId, inputId, suggestion) {
  const el = document.getElementById(hintId);
  if (!el) return;
  el.textContent   = 'Did you mean ' + suggestion + '? Tap to fix.';
  el.style.display = 'block';
  el.onclick = () => {
    document.getElementById(inputId).value = suggestion;
    el.style.display = 'none';
  };
}

function clearEmailHint(hintId) {
  const el = document.getElementById(hintId);
  if (el) { el.style.display = 'none'; el.onclick = null; }
}

function isErrorVisible(elId) {
  const el = document.getElementById(elId);
  return !!(el && el.classList.contains('show'));
}

function getSignInValidation(showInline) {
  const email    = document.getElementById('signin-email')?.value.trim() || '';
  const password = document.getElementById('signin-password')?.value || '';
  const messages = [];

  if (showInline) {
    clearAuthError('signin-error');
    clearAuthError('signin-email-error');
    clearAuthError('signin-pw-error');
    clearEmailHint('signin-email-hint');
  }

  if (!email) {
    const msg = 'Please enter your email address.';
    messages.push(msg);
  } else {
    const emailCheck = validateAuthEmail(email);
    if (!emailCheck.valid) {
      messages.push(emailCheck.message);
    } else if (emailCheck.suggestion && showInline) {
      showEmailHint('signin-email-hint', 'signin-email', emailCheck.suggestion);
    }
  }

  if (!password) {
    const msg = 'Please enter your password.';
    messages.push(msg);
  }

  if (showInline && messages.length) showAuthError('signin-error', messages.join(' '));
  return messages;
}

function getSignUpValidation(showInline) {
  const name     = document.getElementById('signup-name')?.value.trim() || '';
  const email    = document.getElementById('signup-email')?.value.trim() || '';
  const password = document.getElementById('signup-password')?.value || '';
  const messages = [];

  if (showInline) {
    clearAuthError('signup-error');
    clearAuthError('signup-email-error');
    clearEmailHint('signup-email-hint');
  }

  if (!name) messages.push('Please enter your full name.');
  if (!email) {
    const msg = 'Please enter your email address.';
    messages.push(msg);
  } else {
    const emailCheck = validateAuthEmail(email);
    if (!emailCheck.valid) {
      messages.push(emailCheck.message);
    } else if (emailCheck.suggestion && showInline) {
      showEmailHint('signup-email-hint', 'signup-email', emailCheck.suggestion);
    }
  }

  if (!password) {
    messages.push('Please enter your password.');
  } else {
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) messages.push(pwCheck.message);
    updatePasswordChecklist(password);
  }

  if (showInline && messages.length) showAuthError('signup-error', messages.join(' '));
  return messages;
}

function refreshSignInErrors() {
  const email = document.getElementById('signin-email')?.value.trim() || '';
  const hasInvalidEmail = email && !validateAuthEmail(email).valid;
  if (hasInvalidEmail || isErrorVisible('signin-error')) {
    getSignInValidation(true);
  }
}

function refreshSignUpErrors() {
  const email = document.getElementById('signup-email')?.value.trim() || '';
  const hasInvalidEmail = email && !validateAuthEmail(email).valid;
  if (hasInvalidEmail || isErrorVisible('signup-error')) {
    getSignUpValidation(true);
  }
}

function bindAuthValidation() {
  ['signin-email', 'signin-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.authValidationBound) {
      el.dataset.authValidationBound = '1';
      el.addEventListener('input', refreshSignInErrors);
    }
  });
  ['signup-name', 'signup-email', 'signup-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.authValidationBound) {
      el.dataset.authValidationBound = '1';
      el.addEventListener('input', refreshSignUpErrors);
    }
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

function resetAuthButtons() {
  const signInBtn = document.getElementById('signin-btn');
  if (signInBtn) {
    signInBtn.textContent = 'Sign In';
    signInBtn.disabled = false;
  }
  const signUpBtn = document.getElementById('signup-btn');
  if (signUpBtn) {
    signUpBtn.textContent = 'Create Account';
    signUpBtn.disabled = false;
  }
}

// ─── Sign In ───────────────────────────────────────────────────────────────
async function handleSignIn() {
  const email    = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const btn      = document.getElementById('signin-btn');

  if (getSignInValidation(true).length) return;

  btn.textContent = 'Signing in…';
  btn.disabled    = true;

  if (typeof sb === 'undefined' || !sb.auth || !sb.auth.signInWithPassword) {
    btn.textContent = 'Sign In';
    btn.disabled    = false;
    showAuthError('signin-error', 'Sign-in service is not available. Please refresh the page and try again.');
    return;
  }

  let result;
  try {
    result = await withTimeout(
      sb.auth.signInWithPassword({ email, password }),
      12000,
      'Sign-in request timed out.'
    );
  } catch (e) {
    btn.textContent = 'Sign In';
    btn.disabled    = false;
    showAuthError('signin-error', e.message === 'Sign-in request timed out.'
      ? 'Sign-in is taking too long. Check your connection and try again.'
      : 'Could not sign in. Please check your connection and try again.');
    return;
  }

  const { data, error } = result;

  if (error || !data || !data.user) {
    showAuthError('signin-error', error ? humanizeAuthError(error) : 'No account was found for those sign-in details.');
    btn.textContent = 'Sign In';
    btn.disabled    = false;
    return;
  }

  try {
    await onLoginSuccess(data.user);
  } catch(e) {
    console.error('Post-signin error:', e);
    btn.textContent = 'Sign In';
    btn.disabled    = false;
    showAuthError('signin-error', 'Signed in but setup failed. Please try again.');
  }
}

// ─── Sign Up ───────────────────────────────────────────────────────────────
async function handleSignUp() {
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const btn      = document.getElementById('signup-btn');

  if (getSignUpValidation(true).length) return;

  btn.textContent = 'Creating account…';
  btn.disabled    = true;

  if (typeof sb === 'undefined' || !sb.auth || !sb.auth.signUp) {
    btn.textContent = 'Create Account';
    btn.disabled    = false;
    showAuthError('signup-error', 'Account service is not available. Please refresh the page and try again.');
    return;
  }

  let result;
  try {
    result = await withTimeout(
      sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      }),
      12000,
      'Account creation request timed out.'
    );
  } catch (e) {
    btn.textContent = 'Create Account';
    btn.disabled    = false;
    showAuthError('signup-error', e.message === 'Account creation request timed out.'
      ? 'Account creation is taking too long. Check your connection and try again.'
      : 'Could not create account. Please check your connection and try again.');
    return;
  }

  const { data, error } = result;

  if (error) {
    showAuthError('signup-error', humanizeAuthError(error));
    btn.textContent = 'Create Account';
    btn.disabled    = false;
    return;
  }

  // Supabase returns user:null (no error) when the email exists but is unconfirmed
  if (!data.user) {
    showAuthError('signup-error', 'An account with this email already exists. Try signing in, or check your inbox to confirm it.');
    btn.textContent = 'Create Account';
    btn.disabled    = false;
    return;
  }

  // Email confirmation is enabled — account created but no session yet
  if (!data.session) {
    document.getElementById('signup-name').value  = '';
    document.getElementById('signup-email').value = '';
    const pwEl2 = document.getElementById('signup-password');
    pwEl2.value = '';
    pwEl2.type  = 'password';
    const tb2 = pwEl2.parentElement?.querySelector('.auth-pw-toggle');
    if (tb2) tb2.innerHTML = SVG_EYE;
    showAuthError('signup-error', 'Account created! Check your email to confirm it, then sign in.');
    btn.textContent = 'Create Account';
    btn.disabled    = false;
    return;
  }

  // Clear form
  document.getElementById('signup-name').value     = '';
  document.getElementById('signup-email').value    = '';
  const pwEl = document.getElementById('signup-password');
  pwEl.value = '';
  pwEl.type  = 'password';
  const toggleBtn = pwEl.parentElement?.querySelector('.auth-pw-toggle');
  if (toggleBtn) toggleBtn.innerHTML = SVG_EYE;

  try {
    await onLoginSuccess(data.user);
  } catch(e) {
    console.error('Post-signup error:', e);
    btn.textContent = 'Create Account';
    btn.disabled    = false;
    showAuthError('signup-error', 'Account created but setup failed. Please try signing in.');
  }
}

// ─── Post-login ────────────────────────────────────────────────────────────
async function onLoginSuccess(user) {
  currentUser = user;
  window.currentUser = user;
  await loadBusinessRecord(user);

  // Reset local state, then restore only this account's local buckets.
  try { loadPersistedData(); } catch(e) {}

  // Load real data from Supabase
  await loadClients();
  await Promise.all([
    loadInvoices().catch(e=>console.error('loadInvoices:',e)),
    loadEstimates().catch(e=>console.error('loadEstimates:',e))
  ]);

  try { renderClientList(); }    catch(e) {}
  try { updateClientSummary(); } catch(e) {}
  try { renderInvoiceList(); }   catch(e) {}
  try { renderEstimateList(); }  catch(e) {}
  try { renderHomeScreen(); }    catch(e) {}
  try { renderSchedule(); }      catch(e) {}

  hist.length = 0;
  hist.push('screen-home');
  updateSidebarUser();
  goTo('screen-home');
}

async function loadBusinessRecord(user) {
  const { data, error } = await sb.from('businesses').select('*').maybeSingle();
  if (error || !data) {
    const name = user.user_metadata?.full_name || 'My Business';
    const { data: biz, error: rpcErr } = await sb.rpc('create_business_for_user', {
      p_name:     name,
      p_currency: 'GBP'
    });
    if (rpcErr) throw rpcErr;
    currentBusiness = biz;
    window.currentBusiness = biz;
  } else {
    currentBusiness = data;
    window.currentBusiness = data;
  }
  applyBusinessPreferences();
  if(typeof window.initCompanyProfiles==='function') window.initCompanyProfiles();
  if(typeof window.subscribeToPush==='function') window.subscribeToPush();
}

function applyBusinessPreferences() {
  if (!currentBusiness) return;
  const code = currentBusiness.currency_code || 'GBP';
  if (typeof window.setCurrencyPreference === 'function') {
    window.setCurrencyPreference(code);
  } else {
    const c = currencies.find(x => x[0] === code) || currencies.find(x => x[0] === 'GBP');
    if (c) currentCurrency = { code: c[0], name: c[1], symbol: c[2], rate: currencyRates[c[0]] || 1 };
  }
  currentLanguage = currentBusiness.language_code || 'en';
  try { applyCurrency(); }  catch(e) {}
  try { applyLanguage(); }  catch(e) {}
}

async function updateBusinessRecord(fields) {
  if (!currentBusiness) return;
  const { data, error } = await sb.from('businesses')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', currentBusiness.id)
    .select()
    .single();
  if (!error && data) {
    currentBusiness = data;
    window.currentBusiness = data;
  }
}

function updateSidebarUser() {
  if (!currentUser) return;
  const name      = currentUser.user_metadata?.full_name || currentUser.email || 'My Account';
  const initials  = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const firstName = name.split(' ')[0];
  const nameEl    = document.getElementById('sidebar-name');
  const logoEl    = document.getElementById('sidebar-logo');
  if (nameEl) nameEl.textContent = name;
  if (logoEl) logoEl.textContent = initials;
  setGreeting(firstName);
  const isAdmin = typeof window.isCurrentUserAdmin === 'function'
    ? window.isCurrentUserAdmin()
    : currentUser.app_metadata?.role === 'admin' || currentUser.user_metadata?.role === 'admin';

  // Get Paid is a reserved admin-only area for future card payments / Tap to Pay.
  const financeDivider = document.getElementById('finance-sidebar-divider');
  if (financeDivider) financeDivider.style.display = isAdmin ? '' : 'none';
  const financeSection = document.getElementById('finance-sidebar-section');
  if (financeSection) financeSection.style.display = isAdmin ? '' : 'none';
  const devTerminal = document.getElementById('dev-terminal-item');
  if (devTerminal) devTerminal.style.display = isAdmin ? '' : 'none';
  const taxesItem = document.getElementById('taxes-sidebar-item');
  if (taxesItem) taxesItem.style.display = isAdmin ? '' : 'none';

  document.querySelectorAll('.sb-item-badge.soon').forEach(badge => {
    const item = badge.closest('.sb-item');
    if (item) item.style.display = isAdmin ? '' : 'none';
  });
}

// ─── Forgot password (sign-in screen) ─────────────────────────────────────
let _forgotPwCooldown = null;
async function handleForgotPassword() {
  const email = document.getElementById('forgot-pw-email')?.value.trim() || '';
  const btn   = document.getElementById('btn-forgot-pw-send');
  clearAuthError('forgot-pw-error');
  if (!email) { showAuthError('forgot-pw-error', 'Please enter your email address.'); return; }
  const check = validateAuthEmail(email);
  if (!check.valid) { showAuthError('forgot-pw-error', check.message); return; }
  if (btn?.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  const redirectTo = window.location.origin && window.location.origin !== 'null'
    ? window.location.origin + window.location.pathname : undefined;
  const { error } = await sb.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : {});
  if (error) {
    showAuthError('forgot-pw-error', humanizeAuthError(error));
    if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
    return;
  }
  showAuthError('forgot-pw-error', '✓ Reset link sent — check your email.');
  document.getElementById('forgot-pw-error')?.classList.add('show');
  let secs = 60;
  if (btn) btn.textContent = 'Resend in ' + secs + 's';
  clearInterval(_forgotPwCooldown);
  _forgotPwCooldown = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(_forgotPwCooldown);
      if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
    } else {
      if (btn) btn.textContent = 'Resend in ' + secs + 's';
    }
  }, 1000);
}

// ─── Set new password (password recovery flow) ────────────────────────────
const RESET_PW_RULES = [
  ['rpwc-len', pw => pw.length >= 8,   'At least 8 characters'],
  ['rpwc-up',  pw => /[A-Z]/.test(pw), 'One uppercase letter'],
  ['rpwc-low', pw => /[a-z]/.test(pw), 'One lowercase letter'],
  ['rpwc-num', pw => /[0-9]/.test(pw), 'One number'],
];

function updateResetPwChecklist(pw) {
  const list = document.getElementById('reset-pw-checklist');
  if (!list) return;
  if (!pw) { list.style.display = 'none'; return; }
  list.style.display = 'block';
  RESET_PW_RULES.forEach(([id, test, label]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const pass = test(pw);
    el.className   = 'pwc-row ' + (pass ? 'ok' : 'fail');
    el.textContent = (pass ? '✓ ' : '✗ ') + label;
  });
}

async function handleSetNewPassword() {
  const pw  = document.getElementById('reset-pw-input')?.value || '';
  const btn = document.getElementById('reset-pw-btn');
  clearAuthError('reset-pw-error');
  const check = validatePassword(pw);
  if (!check.valid) { showAuthError('reset-pw-error', check.message); return; }
  btn.textContent = 'Saving…';
  btn.disabled    = true;
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) {
    showAuthError('reset-pw-error', humanizeAuthError(error));
    btn.textContent = 'Set New Password';
    btn.disabled    = false;
    return;
  }
  btn.textContent = 'Set New Password';
  btn.disabled    = false;
  document.getElementById('reset-pw-input').value = '';
  const list = document.getElementById('reset-pw-checklist');
  if (list) list.style.display = 'none';
  // Password updated — log in normally
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onLoginSuccess(session.user);
  } else {
    goTo('screen-signin');
  }
}

// ─── Init & sign out ───────────────────────────────────────────────────────
async function initAuth() {
  bindAuthValidation();
  resetAuthButtons();

  // Expired / invalid auth link — show sign-in with a message
  if (window._authLinkError) {
    window._authLinkError = false;
    goTo('screen-signin');
    setTimeout(() => showAuthError('signin-error', 'That link has expired. Enter your email and request a new password reset.'), 100);
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        currentUser = null; currentBusiness = null;
        window.currentUser = null; window.currentBusiness = null;
        try { resetLocalSessionData(); } catch(e) {}
        resetAuthButtons(); hist.length = 0; hist.push('screen-signin'); goTo('screen-signin');
      }
    });
    const { data: { session } } = await sb.auth.getSession();
    if (session) await onLoginSuccess(session.user);
    return;
  }

  // supabase.js sets this flag BEFORE createClient() clears the hash
  if (window._isRecoveryUrl) {
    window._isRecoveryUrl = false;
    goTo('screen-reset-password');
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        currentUser = null; currentBusiness = null;
        window.currentUser = null; window.currentBusiness = null;
        try { resetLocalSessionData(); } catch(e) {}
        resetAuthButtons();
        hist.length = 0; hist.push('screen-signin');
        goTo('screen-signin');
      }
    });
    return;
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      goTo('screen-reset-password');
      return;
    }
    if (event === 'SIGNED_OUT') {
      currentUser     = null;
      currentBusiness = null;
      window.currentUser = null;
      window.currentBusiness = null;
      try { resetLocalSessionData(); } catch(e) {}
      resetAuthButtons();
      hist.length     = 0;
      hist.push('screen-signin');
      goTo('screen-signin');
    }
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onLoginSuccess(session.user);
  } else {
    goTo('screen-signin');
  }
}

async function signOut() {
  closeSidebar();
  await sb.auth.signOut();
}

// ─── Public API ────────────────────────────────────────────────────────────
window.handleSignIn            = handleSignIn;
window.handleSignUp            = handleSignUp;
window.handleForgotPassword    = handleForgotPassword;
window.handleSetNewPassword    = handleSetNewPassword;
window.updateResetPwChecklist  = updateResetPwChecklist;
window.signOut                 = signOut;
window.togglePwVisibility      = togglePwVisibility;
window.updatePasswordChecklist = updatePasswordChecklist;
window.refreshSignInErrors     = refreshSignInErrors;
window.refreshSignUpErrors     = refreshSignUpErrors;
window.initAuth                = initAuth;
window.onLoginSuccess          = onLoginSuccess;
window.loadBusinessRecord      = loadBusinessRecord;
window.updateBusinessRecord    = updateBusinessRecord;
window.applyBusinessPreferences= applyBusinessPreferences;
window.updateSidebarUser       = updateSidebarUser;

})();
