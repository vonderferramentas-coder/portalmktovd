import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, Bytes, addDoc, collection, serverTimestamp, updateDoc,
  runTransaction, onSnapshot, writeBatch, query, where, deleteDoc, getCountFromServer, getDocs, limit
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const config = window.PORTAL_FIREBASE_CONFIG;
if (!config || !config.apiKey || !config.projectId) throw new Error('Configuração Firebase ausente.');

const app = initializeApp(config);
const auth = getAuth(app);
await setPersistence(auth, browserSessionPersistence);
const db = getFirestore(app);
const policy = window.PORTAL_AUTH_POLICY || { allowedEmailDomains: [], sessionHours: 8 };

function portalError(code, message) {
  const error = new Error(message); error.code = code; return error;
}

function emailAllowed(email) {
  const domains = Array.isArray(policy.allowedEmailDomains) ? policy.allowedEmailDomains : [];
  return !domains.length || domains.some(domain => String(email || '').toLowerCase().endsWith(String(domain).toLowerCase()));
}

async function profileFor(user) {
  if (!user) return null;
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function assertApproved(user) {
  if (!user) throw portalError('auth/not-signed-in', 'Faça login para continuar.');
  if (!emailAllowed(user.email)) {
    await signOut(auth);
    throw portalError('auth/domain-not-allowed', 'Use seu e-mail corporativo autorizado.');
  }
  const profile = await profileFor(user);
  if (!profile || profile.status !== 'active') {
    await signOut(auth);
    throw portalError('auth/access-pending', 'Seu acesso ainda não foi liberado por um administrador.');
  }
  return { user, profile };
}

async function audit(event, details = {}) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, 'securityAudit'), {
      actorUid: user.uid,
      event,
      details,
      createdAt: serverTimestamp()
    });
  } catch (_) {
    // Auditoria não deve impedir o uso caso a conexão esteja indisponível.
  }
}

async function completeSignIn(user, method) {
  const context = await assertApproved(user);
  try { await updateDoc(doc(db, 'users', user.uid), { lastAccessAt: serverTimestamp() }); } catch (_) {} 
  await audit('login', { method });
  return context;
}

export async function signInWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return completeSignIn(credential.user, 'password');
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return completeSignIn(credential.user, 'google');
}

export async function requestPasswordReset(email) {
  if (!email) throw portalError('auth/missing-email', 'Informe seu e-mail corporativo para receber o link.');
  await sendPasswordResetEmail(auth, email);
}

export async function logout() {
  if (auth.currentUser) await audit('logout');
  await signOut(auth);
}

export async function currentContext() {
  return assertApproved(auth.currentUser);
}

export function waitForAuthState() {
  return new Promise(resolve => onAuthStateChanged(auth, resolve, () => resolve(null)));
}

export function hasRole(context, role) {
  return Boolean(context && context.profile && context.profile.role === role);
}

// Camada de dados pronta para a migração do calendário: Firestore aplica as regras no servidor.
export async function readPortalStore(key) {
  const context = await currentContext();
  const snapshot = await getDoc(doc(db, 'portalStore', String(key)));
  if (!snapshot.exists()) return { v: null, updated_at: 0 };
  const data = snapshot.data();
  return { v: data.v === undefined ? null : data.v, updated_at: Number(data.updated_at || 0), context };
}

export async function deletePortalStore(key) {
  await currentContext();
  await deleteDoc(doc(db, 'portalStore', String(key)));
}

export async function writePortalStore(key, value, expectedVersion) {
  await currentContext();
  const reference = doc(db, 'portalStore', String(key));
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    const currentVersion = current.exists() ? Number(current.data().updated_at || 0) : 0;
    if (currentVersion !== Number(expectedVersion || 0)) {
      return { conflict: true, server: current.exists() ? { v: current.data().v, updated_at: currentVersion } : { v: null, updated_at: 0 } };
    }
    const updated_at = Date.now();
    transaction.set(reference, { v: value, updated_at, updatedAt: serverTimestamp() });
    return { conflict: false, updated_at };
  });
}
function calendarStoreReference(key) {
  return doc(db, 'portalStore', `calendar-meta-${encodeURIComponent(String(key))}`);
}

function calendarPostsReference(key) {
  // ponytail: a marca inteira mantém busca/exportação globais; se o histórico crescer para dezenas
  // de milhares de cards, evoluir para partições anuais/mensais carregadas sob demanda.
  return query(collection(db, 'portalStore'), where('calendarStoreKey', '==', String(key)));
}

function calendarPostReference(key, postId) {
  return doc(db, 'portalStore', `calendar-post-${encodeURIComponent(String(key))}-${encodeURIComponent(String(postId))}`);
}

function postReadyNotificationReference(key, postId, revision, recipientUid) {
  return doc(db, 'portalStore', `post-ready-notification-${encodeURIComponent(String(key))}-${encodeURIComponent(String(postId))}-${revision}-${encodeURIComponent(String(recipientUid))}`);
}

function postResult(snapshot) {
  if (!snapshot.exists()) return { post: null, revision: 0 };
  const data = snapshot.data();
  return { post: data.v === undefined ? null : data.v, revision: Number(data.revision || 0) };
}

// Migração idempotente: um lease impede dois navegadores de copiarem a lista legada ao mesmo tempo.
export async function ensurePostsStore(key, legacyPosts = []) {
  await currentContext();
  const storeReference = calendarStoreReference(key);
  const owner = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const leaseMs = 60000;

  for (;;) {
    const claim = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(storeReference);
      const data = snapshot.exists() ? snapshot.data() : {};
      if (data.migrated) return 'done';
      const now = Date.now();
      if (data.migrationOwner && data.migrationOwner !== owner && Number(data.migrationLeaseUntil || 0) > now) return 'wait';
      transaction.set(storeReference, {
        migrationOwner: owner,
        migrationLeaseUntil: now + leaseMs,
        migrationStatus: 'migrating'
      }, { merge: true });
      return 'claimed';
    });

    if (claim === 'done') return;
    if (claim === 'wait') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    const posts = Array.isArray(legacyPosts) ? legacyPosts.filter(post => post && post.id) : [];
    for (let offset = 0; offset < posts.length; offset += 400) {
      const batch = writeBatch(db);
      posts.slice(offset, offset + 400).forEach(post => {
        batch.set(calendarPostReference(key, post.id), {
          kind: 'calendarPost',
          calendarStoreKey: String(key),
          postId: String(post.id),
          v: post,
          revision: 1,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(storeReference);
      const data = snapshot.exists() ? snapshot.data() : {};
      if (data.migrated) return;
      if (data.migrationOwner !== owner) throw portalError('posts/migration-lost', 'A migração do calendário foi assumida por outra sessão.');
      transaction.set(storeReference, {
        migrated: true,
        migratedAt: serverTimestamp(),
        migrationStatus: 'done',
        migrationOwner: null,
        migrationLeaseUntil: 0
      }, { merge: true });
    });
    return;
  }
}

export async function writePost(key, post, expectedRevision, notification) {
  await currentContext();
  const reference = calendarPostReference(key, post.id);
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    const currentResult = postResult(current);
    if (currentResult.revision !== Number(expectedRevision || 0)) return { conflict: true, server: currentResult };
    const revision = currentResult.revision + 1;
    transaction.set(reference, {
      kind: 'calendarPost',
      calendarStoreKey: String(key),
      postId: String(post.id),
      v: post, revision, updatedAt: serverTimestamp()
    });
    const becameReady = currentResult.post && !['Pronto para ser postado','Aprovado'].includes(currentResult.post.status)
      && post.status === 'Pronto para ser postado';
    if (becameReady && notification && Array.isArray(notification.recipientIds)) {
      [...new Set(notification.recipientIds.filter(Boolean))].forEach(recipientUid => {
        transaction.set(postReadyNotificationReference(key, post.id, revision, recipientUid), {
          kind: 'postReadyNotification', recipientUid: String(recipientUid),
          brandId: String(notification.brandId || ''), brandName: String(notification.brandName || ''),
          postId: String(post.id), postDate: String(post.date || ''), postTitle: String(post.title || 'Postagem'),
          readAt: null, createdAt: serverTimestamp()
        });
      });
    }
    return { conflict: false, revision };
  });
}

export async function deletePost(key, postId, expectedRevision) {
  await currentContext();
  const reference = calendarPostReference(key, postId);
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    const currentResult = postResult(current);
    if (currentResult.revision !== Number(expectedRevision || 0)) return { conflict: true, server: currentResult };
    if (current.exists()) transaction.delete(reference);
    return { conflict: false, revision: 0 };
  });
}

// Artes salvas do Editor de Posts (fase 1): um documento pequeno por arte ("art-draft-{marca}-{id}"), com a receita da arte; sem fotos.
// A revisão evita sobrescrever o que outra pessoa salvou depois (mesmo esquema dos cards do calendário).
function artDraftReference(key, id) {
  return doc(db, 'portalStore', `art-draft-${encodeURIComponent(String(key))}-${encodeURIComponent(String(id))}`);
}

export async function readArtDraft(key, id) {
  await currentContext();
  const snapshot = await getDoc(artDraftReference(key, id));
  if (!snapshot.exists()) return { draft: null, revision: 0 };
  const data = snapshot.data();
  return { draft: data.v === undefined ? null : data.v, revision: Number(data.revision || 0) };
}

const ART_LOCK_MS = 10 * 60 * 1000;
// bloqueio de edição: vale 10 min a partir da última renovação (gravação da arte ou batida a cada ~5 min) e vence sozinho
function artLockedByOther(lock, uid, now) {
  return !!(lock && lock.until > now && lock.uid !== uid);
}

// me = { uid, name }. Se outra pessoa tem o bloqueio ativo, nada é gravado e volta { locked }.
export async function writeArtDraft(key, draft, expectedRevision, me) {
  await currentContext();
  if (!draft || !draft.id || String(draft.recipe || '').length > 100000) throw portalError('art/invalid', 'Arte inválida ou grande demais para salvar.');
  const reference = artDraftReference(key, draft.id);
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    const currentRevision = current.exists() ? Number(current.data().revision || 0) : 0;
    if (currentRevision !== Number(expectedRevision || 0)) return { conflict: true, revision: currentRevision };
    const now = Date.now(), lock = current.exists() ? current.data().lock : null;
    if (artLockedByOther(lock, me.uid, now)) return { conflict: false, locked: { name: lock.name, until: lock.until }, revision: currentRevision };
    const revision = currentRevision + 1;
    const payload = { kind: 'artDraft', artStoreKey: String(key), artId: String(draft.id), v: draft, revision, updatedAt: serverTimestamp(), lock: { uid: me.uid, name: me.name, until: now + ART_LOCK_MS } };
    if (current.exists()) transaction.update(reference, payload); else transaction.set(reference, payload);
    return { conflict: false, revision };
  });
}

// Pega (ou renova) o bloqueio para abrir uma arte. force = assumir de quem está com ele.
export async function lockArtDraft(key, id, me, force) {
  await currentContext();
  const reference = artDraftReference(key, id);
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    if (!current.exists()) return { missing: true };
    const now = Date.now(), lock = current.data().lock;
    if (!force && artLockedByOther(lock, me.uid, now)) return { locked: { name: lock.name, until: lock.until } };
    transaction.update(reference, { lock: { uid: me.uid, name: me.name, until: now + ART_LOCK_MS } });
    return { locked: null };
  });
}

export async function releaseArtDraftLock(key, id, uid) {
  await currentContext();
  const reference = artDraftReference(key, id);
  await runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    if (current.exists() && current.data().lock && current.data().lock.uid === uid) transaction.update(reference, { lock: null });
  });
}

// Lixeira: deletedAt = timestamp (ms) manda para a lixeira, null restaura. A limpeza diária apaga de vez depois de 7 dias.
export async function setArtDraftDeleted(key, id, deletedAt, me) {
  await currentContext();
  const reference = artDraftReference(key, id);
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    if (!current.exists()) return { missing: true };
    const lock = current.data().lock;
    if (artLockedByOther(lock, me.uid, Date.now())) return { locked: { name: lock.name, until: lock.until } };
    const revision = Number(current.data().revision || 0) + 1;
    transaction.update(reference, { 'v.deletedAt': deletedAt || null, 'v.deletedBy': deletedAt ? me.name : '', revision, updatedAt: serverTimestamp() });
    return { revision };
  });
}

// Renomear: o nome vira customTitle e passa a valer sobre o título gerado do conteúdo da arte.
export async function renameArtDraft(key, id, title, me) {
  await currentContext();
  const reference = artDraftReference(key, id);
  return runTransaction(db, async transaction => {
    const current = await transaction.get(reference);
    if (!current.exists()) return { missing: true };
    const lock = current.data().lock;
    if (artLockedByOther(lock, me.uid, Date.now())) return { locked: { name: lock.name, until: lock.until } };
    const revision = Number(current.data().revision || 0) + 1;
    transaction.update(reference, { 'v.title': String(title).slice(0, 80), 'v.customTitle': String(title).slice(0, 80), revision, updatedAt: serverTimestamp() });
    return { revision };
  });
}

// Fotos das artes (coleção artPhotos, fora do portalStore e do backup). bytes = JPEG já comprimido.
export async function writeArtPhoto(hash, photo) {
  const context = await currentContext();
  const reference = doc(db, 'artPhotos', String(hash));
  if ((await getDoc(reference)).exists()) return { existed: true };
  await setDoc(reference, { hash: String(hash), data: Bytes.fromUint8Array(photo.bytes), size: photo.bytes.length, w: photo.w, h: photo.h, type: photo.type, createdAt: serverTimestamp(), createdBy: context.user.uid });
  return { existed: false };
}

export async function readArtPhoto(hash) {
  await currentContext();
  const snapshot = await getDoc(doc(db, 'artPhotos', String(hash)));
  return snapshot.exists() ? { bytes: snapshot.data().data.toUint8Array(), type: snapshot.data().type || 'image/jpeg' } : null;
}

// Total de bytes de fotos (gravado pela limpeza diária, só Admin SDK); { photoBytes: 0 } enquanto a limpeza não rodou.
export async function readArtStats() {
  await currentContext();
  const snapshot = await getDoc(doc(db, 'portalStore', 'art-stats-v1'));
  return snapshot.exists() && snapshot.data().v ? snapshot.data().v : { photoBytes: 0, photoCount: 0 };
}

// ponytail: sem orderBy (exigiria índice composto); traz até `max` artes da marca e quem chama ordena. A retenção mantém a lista curta.
export async function listArtDrafts(key, max = 100) {
  await currentContext();
  const snapshot = await getDocs(query(collection(db, 'portalStore'), where('artStoreKey', '==', String(key)), limit(Math.max(1, Math.min(300, max)))));
  return snapshot.docs.map(entry => ({ id: String(entry.data().artId || ''), draft: entry.data().v === undefined ? null : entry.data().v, revision: Number(entry.data().revision || 0), lock: entry.data().lock || null }));
}

export async function subscribeToPosts(key, onChange, onError) {
  await currentContext();
  let initial = true;
  return onSnapshot(calendarPostsReference(key), snapshot => {
    const changes = snapshot.docChanges().map(change => {
      const result = postResult(change.doc);
      const data = change.doc.data();
      return {
        type: change.type,
        id: String(data.postId || (result.post && result.post.id) || change.doc.id),
        ...result,
        pending: change.doc.metadata.hasPendingWrites
      };
    });
    onChange({ changes, initial, fromCache: snapshot.metadata.fromCache });
    initial = false;
  }, onError);
}

export async function subscribeNotifications(onChange, onError) {
  const context = await currentContext();
  return onSnapshot(query(collection(db, 'portalStore'), where('recipientUid', '==', context.user.uid)), snapshot => {
    onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data(), pending: item.metadata.hasPendingWrites })));
  }, onError);
}

export async function markNotificationRead(id) {
  const context = await currentContext();
  const reference = doc(db, 'portalStore', String(id));
  const snapshot = await getDoc(reference);
  if (!snapshot.exists() || snapshot.data().kind !== 'postReadyNotification' || snapshot.data().recipientUid !== context.user.uid) return;
  if (!snapshot.data().readAt) await updateDoc(reference, { readAt: serverTimestamp() });
}

// Autoatendimento do menu "Perfil" (portal-shell.js): qualquer usuário ativo pode alterar seu
// próprio nome/foto - nunca role/status/email, travado nas regras do Firestore
// (match /users/{userId}, affectedKeys().hasOnly(['lastAccessAt','name','photo'])), então mesmo
// uma chamada forjada pelo console do navegador não consegue se autopromover por aqui.
export async function updateOwnProfile(patch) {
  const context = await currentContext();
  await updateDoc(doc(db, 'users', context.user.uid), patch);
}

// Métricas operacionais são best-effort: uma falha de rede ou de permissão nunca pode
// atrasar uma exportação, um salvamento ou qualquer outra entrega do usuário.
export async function recordUsageEvent(payload) {
  const context = await currentContext();
  const event = payload && typeof payload === 'object' ? payload : {};
  const tool = String(event.tool || '').slice(0, 80);
  const action = String(event.action || '').slice(0, 80);
  if (!tool || !action) return;
  await addDoc(collection(db, 'usageEvents'), {
    actorUid: context.user.uid,
    tool,
    action,
    brandId: String(event.brandId || '').slice(0, 80),
    quantity: Math.max(1, Math.min(10000, Number(event.quantity) || 1)),
    createdAt: serverTimestamp()
  });
}

// Acessos por QR rastreável (qrHits é gravado pela página /redir pública; aqui só lemos). Testes (?t=1) ficam de fora.
export async function countQrHits(ids) {
  await currentContext();
  const out = {};
  await Promise.all(ids.map(async id => {
    const snap = await getCountFromServer(query(collection(db, 'qrHits'), where('qr', '==', id), where('test', '==', false)));
    out[id] = snap.data().count;
  }));
  return out;
}

// Acessos de um QR (sem testes) para a tela de métricas. ponytail: agrega no navegador, até 5000 registros;
// acima disso, trocar por resumo diário gerado no servidor.
export async function readQrHits(id) {
  await currentContext();
  const snap = await getDocs(query(collection(db, 'qrHits'), where('qr', '==', id), where('test', '==', false), limit(5000)));
  return snap.docs.map(d => { const v = d.data(); return { t: v.t.toDate(), os: v.os, lang: v.lang }; });
}

export { app, auth, db, profileFor, audit };

window.PortalFirebase = {
  readPortalStore, writePortalStore, deletePortalStore, ensurePostsStore, writePost, deletePost, subscribeToPosts,
  readArtDraft, writeArtDraft, listArtDrafts, lockArtDraft, releaseArtDraftLock, setArtDraftDeleted, renameArtDraft, writeArtPhoto, readArtPhoto, readArtStats,
  subscribeNotifications, markNotificationRead, currentContext, logout, requestPasswordReset,
  updateOwnProfile, recordUsageEvent, audit
};
window.dispatchEvent(new Event('portal-firebase-ready'));
