import { app, auth, db, audit, readPortalStore, writePortalStore } from './firebase-client.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { collection, getDocs, doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const $$ = selector => Array.prototype.slice.call(document.querySelectorAll(selector));
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function svgIcon(paths, size) {
  return `<svg width="${size || 15}" height="${size || 15}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const PENCIL_ICON = svgIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
const MENU_ICON = svgIcon('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>');
const LOCK_ICON = svgIcon('<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
const UNLOCK_ICON = svgIcon('<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>');
const RESET_ICON = svgIcon('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>');
const REFRESH_ICON = svgIcon('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>');
const PLUS_ICON = svgIcon('<path d="M12 5v14M5 12h14"/>');
const TRASH_ICON = svgIcon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');

const message = $('adminMessage');
function show(text, success = false) {
  message.textContent = text;
  message.className = 'auth-message show' + (success ? ' success' : '');
}
function formatDate(value) {
  if (!value || !value.toDate) return '—';
  return value.toDate().toLocaleString('pt-BR');
}

// ============================================================
// PERFIS — lista editável (id/nome), gravada em portalStore/user-profiles-v1. "Administrador"
// é fixo (locked): não some da lista nem perde o cadeado de permissões travadas, porque é o
// único perfil com privilégio real no Firestore (ver firestore.rules, função admin()) — sem
// ele ninguém consegue mais gerenciar usuários/perfis. Os demais são só rótulos com um
// conjunto de páginas visíveis (ver PERMISSÕES abaixo) e podem ser excluídos livremente.
// ============================================================
const PROFILES_KEY = 'user-profiles-v1';
const DEFAULT_PROFILES = [
  { id: 'admin', name: 'Administrador', locked: true },
  { id: 'user', name: 'Usuário' },
  { id: 'gestao', name: 'Gestão' },
  { id: 'criacao', name: 'Criação' }
];
let profiles = DEFAULT_PROFILES.map(p => Object.assign({}, p));
let profilesVersion = 0;
function sortedProfiles() {
  return profiles.slice().sort((a, b) => (b.locked ? 1 : 0) - (a.locked ? 1 : 0));
}
function profileName(id) {
  const found = profiles.find(item => item.id === id);
  return found ? found.name : (id || 'Usuário');
}
async function loadProfiles() {
  try {
    const record = await readPortalStore(PROFILES_KEY);
    profilesVersion = record.updated_at || 0;
    if (Array.isArray(record.v) && record.v.length) {
      profiles = record.v;
    } else {
      // primeira vez que esta tela roda com o recurso de perfis: já grava os padrões
      // (Administrador travado + Usuário + Gestão + Criação) em vez de deixar só no cliente.
      profiles = DEFAULT_PROFILES.map(p => Object.assign({}, p));
      const result = await writePortalStore(PROFILES_KEY, profiles, profilesVersion);
      if (!result.conflict) profilesVersion = result.updated_at;
    }
  } catch (error) {
    profilesVersion = 0;
    profiles = DEFAULT_PROFILES.map(p => Object.assign({}, p));
  }
  renderProfileList();
  renderUserRows();
}

// ============================================================
// PERMISSÕES POR PERFIL — checklist de quais páginas do menu cada perfil pode ver, gravado em
// portalStore/page-permissions-v1 e aplicado por auth-guard.js em toda página (esconde
// item/card e bloqueia acesso direto pela URL). A lista de páginas vem de
// window.PortalNavItems (portal-shell.js), fonte única do menu.
// ============================================================
const PERMISSIONS_KEY = 'page-permissions-v1';
let permissionsMap = {};
let permissionsVersion = 0;
function pagesForRole() {
  return window.PortalNavItems || [];
}
// perfil Administrador vem com TODAS as páginas marcadas e travadas (não dá pra desmarcar
// nenhuma) — um admin nunca pode, por engano, tirar o próprio acesso (nem o de outros admins)
// a alguma área. Os demais perfis só travam a Início.
function lockedPagesForRole(role) {
  return role === 'admin' ? pagesForRole().map(item => item.href) : ['index.html'];
}
// sem nada salvo ainda pra este perfil, replica o que o portal já fazia antes deste checklist
// existir: todo mundo vê tudo, exceto páginas defaultHidden (hoje só Usuários e acessos),
// essas só pro perfil admin — mesma regra espelhada em auth-guard.js (defaultAllowedPages).
function defaultAllowedForRole(role) {
  return pagesForRole().filter(item => role === 'admin' || !item.defaultHidden).map(item => item.href);
}
function allowedForRole(role) {
  return Array.isArray(permissionsMap[role]) ? permissionsMap[role].slice() : defaultAllowedForRole(role);
}
async function loadPagePermissions() {
  try {
    const record = await readPortalStore(PERMISSIONS_KEY);
    permissionsVersion = record.updated_at || 0;
    permissionsMap = record.v || {};
  } catch (error) {
    permissionsVersion = 0;
    permissionsMap = {};
  }
}

function renderProfileList() {
  const container = $('profileList');
  if (!container) return;
  container.innerHTML = sortedProfiles().map(profile => `<div class="admin-profile-row">
    <span class="admin-profile-row-name">${escape(profile.name)}</span>
    <div class="admin-profile-row-actions">
      ${profile.locked ? '' : `<button class="btn-icon" type="button" data-edit-profile="${profile.id}" title="Editar permissões de ${escape(profile.name)}" aria-label="Editar permissões de ${escape(profile.name)}">${PENCIL_ICON}</button>`}
      ${profile.locked ? '' : `<button class="btn-icon" type="button" data-delete-profile="${profile.id}" title="Excluir perfil ${escape(profile.name)}" aria-label="Excluir perfil ${escape(profile.name)}">${TRASH_ICON}</button>`}
    </div>
  </div>`).join('') || '<p class="muted">Nenhum perfil cadastrado.</p>';
}
const profileListEl = $('profileList');
if (profileListEl) profileListEl.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const profileId = button.dataset.editProfile || button.dataset.deleteProfile;
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  if (button.dataset.editProfile) openProfilePermissionsModal(profile);
  else openDeleteProfileModal(profile);
});

// ============================================================
// MODAL "PERMISSÕES DO PERFIL" — único, centralizado, mesmo padrão .modal-backdrop/.modal do
// resto do portal. Aberto pelo lápis de cada linha em Perfis; a lista de páginas é a mesma
// pros dois modais (aqui e no antigo checklist por abas que este substitui).
// ============================================================
let permModalEl = null;
function buildPermModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'profilePermBackdrop';
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <h2 id="profilePermTitle">Permissões</h2>
      <div class="modal-header-actions">
        <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>')}</button>
      </div>
    </div>
    <div class="modal-body">
      <p class="muted" style="margin:0 0 14px">Marque as páginas que este perfil pode visualizar no menu.</p>
      <div id="profilePermPages" class="admin-perm-pages"></div>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancelProfilePerm" class="btn ghost">Cancelar</button>
      <button type="button" id="saveProfilePerm" class="btn">Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => { backdrop.style.display = 'none'; };
  backdrop.addEventListener('click', ev => { if (ev.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#cancelProfilePerm').addEventListener('click', close);
  backdrop.querySelector('#saveProfilePerm').addEventListener('click', async () => {
    const role = backdrop.dataset.role;
    const locked = lockedPagesForRole(role);
    const checked = $$('#profilePermPages input[data-perm-page]:checked').map(i => i.dataset.permPage);
    const payload = Array.from(new Set(checked.concat(locked)));
    const btn = backdrop.querySelector('#saveProfilePerm');
    btn.disabled = true;
    try {
      const nextMap = Object.assign({}, permissionsMap, { [role]: payload });
      const result = await writePortalStore(PERMISSIONS_KEY, nextMap, permissionsVersion);
      if (result.conflict) {
        show('Alguém salvou outra alteração de permissões antes. Recarregando…');
        await loadPagePermissions();
        close();
        return;
      }
      permissionsVersion = result.updated_at;
      permissionsMap = nextMap;
      close();
      show('Permissões salvas.', true);
    } catch (error) {
      show('Não foi possível salvar as permissões.');
    } finally {
      btn.disabled = false;
    }
  });
  return backdrop;
}
function openProfilePermissionsModal(profile) {
  if (!permModalEl) permModalEl = buildPermModal();
  permModalEl.dataset.role = profile.id;
  $('profilePermTitle').textContent = 'Permissões — ' + profile.name;
  const selected = new Set(allowedForRole(profile.id));
  const locked = new Set(lockedPagesForRole(profile.id));
  $('profilePermPages').innerHTML = pagesForRole().map(item => {
    const isLocked = locked.has(item.href);
    const checked = isLocked || selected.has(item.href);
    return `<label class="chip"><input type="checkbox" data-perm-page="${item.href}" ${checked ? 'checked' : ''} ${isLocked ? 'disabled' : ''}> ${escape(item.label)}</label>`;
  }).join('');
  permModalEl.style.display = 'flex';
}

// ============================================================
// MODAL "EXCLUIR PERFIL" — confirmação, listando (se houver) os usuários ainda vinculados a
// esse perfil. A exclusão não migra esses usuários pra outro perfil automaticamente: o campo
// role deles continua com o id do perfil apagado, e passa a valer o padrão de visibilidade
// (defaultAllowedForRole) até alguém reatribuir um perfil existente na Edição do usuário.
// ============================================================
let deleteProfileModalEl = null;
function buildDeleteProfileModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'deleteProfileBackdrop';
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <h2>Excluir perfil</h2>
      <div class="modal-header-actions">
        <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>')}</button>
      </div>
    </div>
    <div class="modal-body">
      <p id="deleteProfileMessage"></p>
      <div id="deleteProfileUsers"></div>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancelDeleteProfile" class="btn ghost">Cancelar</button>
      <button type="button" id="confirmDeleteProfile" class="btn ghost danger">Excluir perfil</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => { backdrop.style.display = 'none'; };
  backdrop.addEventListener('click', ev => { if (ev.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#cancelDeleteProfile').addEventListener('click', close);
  backdrop.querySelector('#confirmDeleteProfile').addEventListener('click', async () => {
    const role = backdrop.dataset.role;
    const btn = backdrop.querySelector('#confirmDeleteProfile');
    btn.disabled = true;
    try {
      const nextProfiles = profiles.filter(p => p.id !== role);
      const result = await writePortalStore(PROFILES_KEY, nextProfiles, profilesVersion);
      if (result.conflict) {
        show('Alguém alterou os perfis antes. Recarregando…');
        await loadProfiles();
        close();
        return;
      }
      profilesVersion = result.updated_at;
      profiles = nextProfiles;
      // limpa a entrada de permissões desse perfil também (best-effort: se falhar, só fica
      // uma chave sem uso em page-permissions-v1, não impede a exclusão do perfil em si)
      try {
        const nextMap = Object.assign({}, permissionsMap);
        delete nextMap[role];
        const permResult = await writePortalStore(PERMISSIONS_KEY, nextMap, permissionsVersion);
        if (!permResult.conflict) { permissionsVersion = permResult.updated_at; permissionsMap = nextMap; }
      } catch (_) { /* limpeza best-effort */ }
      close();
      renderProfileList();
      renderUserRows();
      show('Perfil excluído.', true);
    } catch (error) {
      show('Não foi possível excluir o perfil.');
    } finally {
      btn.disabled = false;
    }
  });
  return backdrop;
}
function openDeleteProfileModal(profile) {
  if (!deleteProfileModalEl) deleteProfileModalEl = buildDeleteProfileModal();
  deleteProfileModalEl.dataset.role = profile.id;
  const affected = latestUsers.filter(u => u.role === profile.id);
  $('deleteProfileMessage').textContent = affected.length
    ? `Tem certeza que deseja excluir o perfil "${profile.name}"? ${affected.length} usuário(s) ainda estão vinculados a ele:`
    : `Tem certeza que deseja excluir o perfil "${profile.name}"? Nenhum usuário está vinculado a ele no momento.`;
  $('deleteProfileUsers').innerHTML = affected.length
    ? `<div class="modal-user-list">${affected.map(u => `<div class="modal-user-list-item"><strong>${escape(u.name)}</strong><span>${escape(u.email)}</span></div>`).join('')}</div>`
    : '';
  deleteProfileModalEl.style.display = 'flex';
}

// ============================================================
// MODAL "NOVO PERFIL" — aberto pelo "+" no cabeçalho de Perfis. Só pede o nome; o id é gerado
// a partir dele (slug sem acento) e o perfil nasce sem página nenhuma travada e sem
// permissões salvas ainda, caindo no padrão de visibilidade (defaultAllowedForRole) até
// alguém editar via lápis.
// ============================================================
const PROFILE_ID_ACCENTS = { 'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ç': 'c', 'ñ': 'n' };
function slugifyProfileId(name) {
  const base = String(name || '').trim().toLowerCase()
    .replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, ch => PROFILE_ID_ACCENTS[ch] || ch)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'perfil';
  let id = base, n = 2;
  while (profiles.some(p => p.id === id)) { id = base + '-' + n; n++; }
  return id;
}
let createProfileModalEl = null;
function buildCreateProfileModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'createProfileBackdrop';
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <h2>Novo perfil</h2>
      <div class="modal-header-actions">
        <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>')}</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="auth-form">
        <div class="auth-field"><label for="newProfileName">Nome do perfil</label><input id="newProfileName" type="text" required></div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancelCreateProfile" class="btn ghost">Cancelar</button>
      <button type="button" id="submitCreateProfile" class="btn">Criar</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => { backdrop.style.display = 'none'; };
  backdrop.addEventListener('click', ev => { if (ev.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#cancelCreateProfile').addEventListener('click', close);
  backdrop.querySelector('#submitCreateProfile').addEventListener('click', async () => {
    const name = $('newProfileName').value.trim();
    if (!name) { $('newProfileName').focus(); return; }
    const btn = backdrop.querySelector('#submitCreateProfile');
    btn.disabled = true;
    try {
      const nextProfiles = profiles.concat([{ id: slugifyProfileId(name), name }]);
      const result = await writePortalStore(PROFILES_KEY, nextProfiles, profilesVersion);
      if (result.conflict) {
        show('Alguém alterou os perfis antes. Recarregando…');
        await loadProfiles();
        close();
        return;
      }
      profilesVersion = result.updated_at;
      profiles = nextProfiles;
      close();
      renderProfileList();
      renderUserRows();
      show('Perfil criado.', true);
    } catch (error) {
      show('Não foi possível criar o perfil.');
    } finally {
      btn.disabled = false;
    }
  });
  return backdrop;
}
function openCreateProfileModal() {
  if (!createProfileModalEl) createProfileModalEl = buildCreateProfileModal();
  $('newProfileName').value = '';
  createProfileModalEl.style.display = 'flex';
  $('newProfileName').focus();
}
$('openCreateProfile').innerHTML = PLUS_ICON;
$('openCreateProfile').addEventListener('click', openCreateProfileModal);

// ============================================================
// TABELA DE USUÁRIOS
// ============================================================
let latestUsers = [];
function roleOptionsHtml(selected) {
  return sortedProfiles().map(p => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${escape(p.name)}</option>`).join('');
}
function renderUserRows() {
  const rows = $('userRows');
  if (!rows) return;
  rows.innerHTML = latestUsers.map(user => `<tr>
    <td>${escape(user.name)}</td>
    <td>${escape(user.email)}</td>
    <td>${escape(profileName(user.role))}</td>
    <td><span class="admin-badge ${user.status === 'active' ? 'active' : 'blocked'}">${user.status === 'active' ? 'Ativo' : 'Bloqueado'}</span></td>
    <td>${formatDate(user.lastAccessAt)}</td>
    <td><div class="admin-table-actions">
      <button class="btn-icon" type="button" data-edit="${user.id}" title="Editar usuário" aria-label="Editar usuário">${PENCIL_ICON}</button>
      <button class="btn-icon" type="button" data-menu="${user.id}" title="Mais ações" aria-label="Mais ações">${MENU_ICON}</button>
    </div></td>
  </tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum usuário aprovado.</td></tr>';
}
async function load() {
  const snapshot = await getDocs(collection(db, 'users'));
  latestUsers = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'pt-BR'));
  renderUserRows();
}

// ============================================================
// MODAL "EDITAR USUÁRIO" — único, centralizado, mesmo padrão .modal-backdrop/.modal do
// resto do portal (ver portal-shell.js). Reúne nome/e-mail/perfil num só lugar.
// ============================================================
let editModalEl = null;
function buildEditModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'editUserBackdrop';
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <h2>Editar usuário</h2>
      <div class="modal-header-actions">
        <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>')}</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="auth-form">
        <div class="auth-field"><label for="editUserName">Nome</label><input id="editUserName" type="text" required></div>
        <div class="auth-field"><label for="editUserEmail">E-mail</label><input id="editUserEmail" type="email" required></div>
        <div class="auth-field"><label for="editUserRole">Perfil</label><select id="editUserRole"></select></div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancelEditUser" class="btn ghost">Cancelar</button>
      <button type="button" id="saveEditUser" class="btn">Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => { backdrop.style.display = 'none'; };
  backdrop.addEventListener('click', ev => { if (ev.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#cancelEditUser').addEventListener('click', close);
  backdrop.querySelector('#saveEditUser').addEventListener('click', async () => {
    const id = backdrop.dataset.userId;
    const name = $('editUserName').value.trim();
    const email = $('editUserEmail').value.trim().toLowerCase();
    const role = $('editUserRole').value;
    if (!name) { $('editUserName').focus(); return; }
    if (!email) { $('editUserEmail').focus(); return; }
    const btn = backdrop.querySelector('#saveEditUser');
    btn.disabled = true;
    try {
      await updateDoc(doc(db, 'users', id), { name, email, role });
      await audit('user_updated', { targetUid: id, name, email, role });
      close();
      show('Usuário atualizado.', true);
      await load();
    } catch (error) {
      show('Não foi possível atualizar o usuário.');
    } finally {
      btn.disabled = false;
    }
  });
  return backdrop;
}
function openEditModal(user) {
  if (!editModalEl) editModalEl = buildEditModal();
  editModalEl.dataset.userId = user.id;
  $('editUserName').value = user.name || '';
  $('editUserEmail').value = user.email || '';
  $('editUserRole').innerHTML = roleOptionsHtml(user.role);
  editModalEl.style.display = 'flex';
  $('editUserName').focus();
}

// ============================================================
// MENU "⋯" DA LINHA — reticências que reúnem "Redefinir senha" e "Bloquear"/"Liberar", no
// mesmo estilo .portal-brand-popover/.portal-account-menu que o menu da barra de conta usa
// (ver portal-shell.js). Criado a cada clique (não reaproveitado) porque o conteúdo depende
// do status atual do usuário da linha.
// ============================================================
let rowMenuEl = null;
function closeRowMenu() {
  if (rowMenuEl && rowMenuEl.parentNode) rowMenuEl.parentNode.removeChild(rowMenuEl);
  rowMenuEl = null;
  document.removeEventListener('mousedown', onDocClickCloseRowMenu);
  window.removeEventListener('scroll', closeRowMenu, true);
  window.removeEventListener('resize', closeRowMenu);
}
function onDocClickCloseRowMenu(ev) {
  if (rowMenuEl && rowMenuEl.contains(ev.target)) return;
  if (ev.target.closest && ev.target.closest('[data-menu]')) return;
  closeRowMenu();
}
function openRowMenu(anchor, user) {
  const reopening = rowMenuEl && rowMenuEl.dataset.forUser === user.id;
  closeRowMenu();
  if (reopening) return;
  rowMenuEl = document.createElement('div');
  rowMenuEl.className = 'portal-brand-popover portal-account-menu';
  rowMenuEl.dataset.forUser = user.id;
  const blocking = user.status === 'active';
  rowMenuEl.innerHTML = `
    <button type="button" class="portal-account-menu-item" id="rowMenuReset">${RESET_ICON}<span>Redefinir senha</span></button>
    <div class="portal-account-menu-divider"></div>
    <button type="button" class="portal-account-menu-item${blocking ? ' danger' : ''}" id="rowMenuStatus">${blocking ? LOCK_ICON : UNLOCK_ICON}<span>${blocking ? 'Bloquear' : 'Liberar'}</span></button>
  `;
  document.body.appendChild(rowMenuEl);
  const r = anchor.getBoundingClientRect();
  rowMenuEl.style.position = 'fixed';
  rowMenuEl.style.top = (r.bottom + 6) + 'px';
  rowMenuEl.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  rowMenuEl.querySelector('#rowMenuReset').addEventListener('click', async () => {
    closeRowMenu();
    try {
      await sendPasswordResetEmail(auth, user.email);
      await audit('password_reset_requested', { targetUid: user.id });
      show('Link de redefinição enviado.', true);
    } catch (error) {
      show('Não foi possível enviar o link de redefinição.');
    }
  });
  rowMenuEl.querySelector('#rowMenuStatus').addEventListener('click', async () => {
    closeRowMenu();
    const next = blocking ? 'blocked' : 'active';
    try {
      await updateDoc(doc(db, 'users', user.id), { status: next });
      await audit('user_status_changed', { targetUid: user.id, status: next });
      await load();
    } catch (error) {
      show('Não foi possível concluir esta ação.');
    }
  });
  document.addEventListener('mousedown', onDocClickCloseRowMenu);
  window.addEventListener('scroll', closeRowMenu, true);
  window.addEventListener('resize', closeRowMenu);
}

$('userRows').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const id = button.dataset.edit || button.dataset.menu;
  const user = latestUsers.find(u => u.id === id);
  if (!user) return;
  if (button.dataset.edit) openEditModal(user);
  else { event.stopPropagation(); openRowMenu(button, user); }
});

// ============================================================
// MODAL "NOVO USUÁRIO" — único, centralizado, mesmo padrão .modal-backdrop/.modal do resto
// do portal, aberto pelo "+" no cabeçalho de Acessos cadastrados.
// ============================================================
let createModalEl = null;
function buildCreateModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'createUserBackdrop';
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <h2>Novo usuário</h2>
      <div class="modal-header-actions">
        <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>')}</button>
      </div>
    </div>
    <div class="modal-body">
      <p class="muted" style="margin:0 0 14px">A pessoa receberá um e-mail seguro para definir a própria senha.</p>
      <p id="createUserMessage" class="auth-message" role="alert"></p>
      <div class="auth-form">
        <div class="auth-field"><label for="newName">Nome</label><input id="newName" type="text" required></div>
        <div class="auth-field"><label for="newEmail">E-mail corporativo</label><input id="newEmail" type="email" required></div>
        <div class="auth-field"><label for="newRole">Perfil</label><select id="newRole"></select></div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancelCreateUser" class="btn ghost">Cancelar</button>
      <button type="button" id="submitCreateUser" class="btn">Criar e enviar convite</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const createMessage = backdrop.querySelector('#createUserMessage');
  const showCreateMessage = (text, success = false) => {
    createMessage.textContent = text;
    createMessage.className = 'auth-message show' + (success ? ' success' : '');
  };
  const close = () => { backdrop.style.display = 'none'; };
  backdrop.addEventListener('click', ev => { if (ev.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#cancelCreateUser').addEventListener('click', close);
  backdrop.querySelector('#submitCreateUser').addEventListener('click', async () => {
    const name = $('newName').value.trim();
    const email = $('newEmail').value.trim().toLowerCase();
    const role = $('newRole').value;
    if (!name) { $('newName').focus(); return; }
    if (!email) { $('newEmail').focus(); return; }
    const btn = backdrop.querySelector('#submitCreateUser');
    btn.disabled = true;
    try {
      const tempApp = initializeApp(window.PORTAL_FIREBASE_CONFIG, 'provision-' + Date.now());
      const tempAuth = getAuth(tempApp);
      const random = crypto.getRandomValues(new Uint32Array(8));
      const password = Array.from(random, n => n.toString(36)).join('') + 'Aa!9';
      const created = await createUserWithEmailAndPassword(tempAuth, email, password);
      await setDoc(doc(db, 'users', created.user.uid), { name, email, role, status: 'active', createdAt: serverTimestamp(), lastAccessAt: null });
      await sendPasswordResetEmail(auth, email);
      await audit('user_created', { targetUid: created.user.uid, role });
      await signOut(tempAuth);
      await deleteApp(tempApp);
      close();
      show('Usuário criado. Enviamos um link para definição segura de senha.', true);
      await load();
    } catch (error) {
      showCreateMessage(error.code === 'auth/email-already-in-use' ? 'Este e-mail já possui uma conta.' : 'Não foi possível criar o usuário: ' + (error.message || 'erro inesperado'));
    } finally {
      btn.disabled = false;
    }
  });
  return backdrop;
}
function openCreateModal() {
  if (!createModalEl) createModalEl = buildCreateModal();
  $('newName').value = '';
  $('newEmail').value = '';
  const defaultRole = profiles.some(p => p.id === 'user') ? 'user' : ((sortedProfiles()[0] || {}).id || '');
  $('newRole').innerHTML = roleOptionsHtml(defaultRole);
  const createMessage = $('createUserMessage');
  createMessage.textContent = '';
  createMessage.className = 'auth-message';
  createModalEl.style.display = 'flex';
  $('newName').focus();
}
$('openCreateUser').innerHTML = PLUS_ICON;
$('openCreateUser').addEventListener('click', openCreateModal);
$('refreshUsers').innerHTML = REFRESH_ICON;
$('refreshUsers').addEventListener('click', () => load().catch(() => show('Não foi possível carregar usuários.')));

load().catch(() => show('Não foi possível carregar usuários. Verifique seu perfil administrativo.'));
loadProfiles().catch(() => show('Não foi possível carregar os perfis.'));
loadPagePermissions().catch(() => show('Não foi possível carregar as permissões.'));
