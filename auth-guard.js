import { currentContext, logout, waitForAuthState } from './firebase-client.js';
const body = document.body;
const loginUrl = new URL('login.html', location.href);
const target = location.pathname.split('/').pop() || 'index.html';
if (target !== 'index.html' || location.search) loginUrl.searchParams.set('next', target + location.search);
async function deny(message) {
  await logout().catch(() => {});
  loginUrl.searchParams.set('reason', message || 'access');
  location.replace(loginUrl.href);
}
try {
  await waitForAuthState();
  const context = await currentContext();
  const requiredRole = body.dataset.authRole;
  if (requiredRole && context.profile.role !== requiredRole) await deny('permission');
  else {
    body.dataset.authenticated = 'true'; body.dataset.userRole = context.profile.role; document.documentElement.classList.remove('auth-pending');
    if (context.profile.role === 'admin') document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = false; });
    const profileNameEl = document.getElementById('portalProfileName');
    if (profileNameEl) profileNameEl.textContent = context.profile.name || context.user.email;
    const profileEmailEl = document.getElementById('portalProfileEmail');
    if (profileEmailEl && context.profile.name) profileEmailEl.textContent = context.user.email;
  }
} catch (error) { await deny(error && error.code === 'auth/access-pending' ? 'pending' : 'access'); }
