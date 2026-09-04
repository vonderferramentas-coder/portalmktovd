import { currentContext, logout, waitForAuthState, readPortalStore } from './firebase-client.js';
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
      const profileNameEl = document.getElementById('portalProfileName');
      if (profileNameEl) profileNameEl.textContent = context.profile.name || context.user.email;
      const profileEmailEl = document.getElementById('portalProfileEmail');
      if (profileEmailEl && context.profile.name) profileEmailEl.textContent = context.user.email;
    }
  }
} catch (error) { await deny(error && error.code === 'auth/access-pending' ? 'pending' : 'access'); }
