import { currentContext, logout } from './firebase-client.js';
// o card de "Usuários e acessos" não é mais revelado aqui: quem decide se ele aparece é o
// mesmo checklist por perfil de Usuários e acessos > Permissões, aplicado por auth-guard.js
// (que já esconde/mostra qualquer <a href> apontando pra uma página gerenciada) — ver
// defaultHidden em portal-shell.js.
const userSlot = document.getElementById('homeUserSlot');
try {
  const context = await currentContext();
  if (userSlot) {
    const safe = String(context.profile.name || context.user.email || 'Usuário').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    userSlot.innerHTML = `<span>${safe}</span><button type="button" class="auth-home-logout" id="homeLogout">Sair</button>`;
    document.getElementById('homeLogout').addEventListener('click', async () => { await logout(); location.replace('login.html'); });
  }
} catch (_) {}
