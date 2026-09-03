import { currentContext, logout } from './firebase-client.js';
const adminCard = document.querySelector('[data-admin-only]');
const userSlot = document.getElementById('homeUserSlot');
try {
  const context = await currentContext();
  if (context.profile.role === 'admin' && adminCard) adminCard.hidden = false;
  if (userSlot) {
    const safe = String(context.profile.name || context.user.email || 'Usuário').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    userSlot.innerHTML = `<span>${safe}</span><button type="button" class="auth-home-logout" id="homeLogout">Sair</button>`;
    document.getElementById('homeLogout').addEventListener('click', async () => { await logout(); location.replace('login.html'); });
  }
} catch (_) {}
