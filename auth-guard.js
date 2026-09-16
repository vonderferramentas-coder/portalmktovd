import { currentContext, logout, waitForAuthState, readPortalStore } from './firebase-client.js';
const body = document.body;
const loginUrl = new URL('login.html', location.href);
const target = location.pathname.split('/').pop() || 'index.html';
if (target !== 'index.html' || location.search) loginUrl.searchParams.set('next', target + location.search);
async function deny(message) {
  await logout().catch(() => {});
  if (message) loginUrl.searchParams.set('reason', message);
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
// Padrão usado enquanto nenhum admin tiver salvo Permissões por perfil ainda (documento
// inexistente) e como piso de segurança em cada leitura: replica o que o portal já fazia antes
// deste checklist existir — todo mundo ativo vê tudo, exceto as páginas marcadas
// defaultHidden em portal-shell.js (hoje só Usuários e acessos), essas só pro perfil admin.
function defaultAllowedPages(role) {
  const items = window.PortalNavItems || [];
  const allowed = new Set();
  items.forEach(item => { if (role === 'admin' || !item.defaultHidden) allowed.add(item.href); });
  allowed.add('index.html'); // nunca esconde/bloqueia a própria Início, senão ninguém tem pra onde ir
  return allowed;
}
// "Quais páginas cada perfil pode ver" — editado em Usuários e acessos (checkbox por perfil),
// gravado em portalStore/page-permissions-v1.
async function loadAllowedPages(role) {
  try {
    const record = await readPortalStore('page-permissions-v1');
    const map = record && record.v;
    if (map && Array.isArray(map[role])) {
      const allowed = new Set(map[role]);
      allowed.add('index.html');
      return allowed;
    }
  } catch (_) { /* sem conexão ou sem acesso ao documento: cai no padrão abaixo */ }
  return defaultAllowedPages(role);
}
try {
  await waitForAuthState();
  const context = await currentContext();
  const requiredRole = body.dataset.authRole;
  if (requiredRole && context.profile.role !== requiredRole) denyPermission();
  else {
    const allowedPages = await loadAllowedPages(context.profile.role);
    // window.PortalNavItems vem de portal-shell.js (script clássico, já executado antes deste
    // módulo adiado) — só páginas do menu principal são "gerenciadas" por este mecanismo;
    // páginas fora dele (ex: migrate-followers.html) continuam controladas só por data-auth-role.
    const navItems = window.PortalNavItems || [];
    const pageIsManaged = navItems.some(item => item.href === target);
    if (pageIsManaged && !allowedPages.has(target)) denyPermission();
    else {
      body.dataset.authenticated = 'true'; body.dataset.userRole = context.profile.role; body.dataset.userEmail = context.user.email; document.documentElement.classList.remove('auth-pending');
      // esconde qualquer link (sidebar, card da Início etc.) que aponte pra uma página
      // gerenciada fora da lista liberada pro perfil — um único mecanismo pras duas entradas.
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');
        if (navItems.some(item => item.href === href) && !allowedPages.has(href)) link.hidden = true;
      });
      // some também o rótulo da seção (ex: "Administração") quando nenhum item dela sobrou
      // visível — senão fica um título solto sem nada embaixo. display:none via estilo inline,
      // não hidden — .portal-nav-section já tem display:flex no CSS, mesma especificidade de
      // [hidden] só que de origem "autor" (vence a stylesheet do navegador).
      document.querySelectorAll('.portal-nav-section').forEach(section => {
        const anyVisible = Array.from(section.querySelectorAll('.portal-nav-item')).some(a => !a.hidden);
        if (!anyVisible) section.style.display = 'none';
      });
      const profileNameEl = document.getElementById('portalProfileName');
      if (profileNameEl) profileNameEl.textContent = context.profile.name || context.user.email;
      const profileEmailEl = document.getElementById('portalProfileEmail');
      if (profileEmailEl && context.profile.name) profileEmailEl.textContent = context.user.email;
      // Foto de perfil (menu "Perfil" > portal-shell.js): some por trás do ícone genérico se
      // ninguém tiver enviado uma ainda.
      if (context.profile.photo) {
        const avatarEl = document.querySelector('#portalAccountBar .portal-account-avatar');
        if (avatarEl && !avatarEl.querySelector('img')) {
          const img = document.createElement('img');
          img.alt = '';
          img.src = context.profile.photo;
          avatarEl.insertBefore(img, avatarEl.firstChild);
        }
      }
    }
  }
} catch (error) {
  // "Nunca logou nesta aba" (auth/not-signed-in) é o estado normal de quem ainda não entrou —
  // não é uma sessão que expirou, então não mostra o aviso de expiração (nem qualquer reason).
  const code = error && error.code;
  await deny(code === 'auth/access-pending' ? 'pending' : code === 'auth/not-signed-in' ? null : 'access');
}
