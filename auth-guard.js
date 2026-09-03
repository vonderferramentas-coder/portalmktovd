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
// Falta de permissão (perfil autenticado, só não é o exigido nesta página) não é falha de
// sessão: deslogar aqui derrubava a pessoa do portal inteiro por clicar num link que nem
// deveria estar visível para ela, e sem nenhuma mensagem — parecia um loop travado. Aqui só
// avisa e manda de volta ao início, mantendo a sessão.
function denyPermission() {
  alert('Você não tem permissão para acessar esta área.');
  location.replace(new URL('index.html', location.href).href);
}
try {
  await waitForAuthState();
  const context = await currentContext();
  const requiredRole = body.dataset.authRole;
  if (requiredRole && context.profile.role !== requiredRole) denyPermission();
  else {
    body.dataset.authenticated = 'true'; body.dataset.userRole = context.profile.role; body.dataset.userEmail = context.user.email; document.documentElement.classList.remove('auth-pending');
    if (context.profile.role === 'admin') document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = false; });
    const profileNameEl = document.getElementById('portalProfileName');
    if (profileNameEl) profileNameEl.textContent = context.profile.name || context.user.email;
    const profileEmailEl = document.getElementById('portalProfileEmail');
    if (profileEmailEl && context.profile.name) profileEmailEl.textContent = context.user.email;
  }
} catch (error) { await deny(error && error.code === 'auth/access-pending' ? 'pending' : 'access'); }
