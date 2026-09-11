import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, addDoc, collection, serverTimestamp, updateDoc,
  runTransaction, onSnapshot, writeBatch, query, where
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

export { app, auth, db, profileFor, audit };

window.PortalFirebase = {
  readPortalStore, writePortalStore, ensurePostsStore, writePost, deletePost, subscribeToPosts,
  subscribeNotifications, markNotificationRead, currentContext, logout, requestPasswordReset
};
window.dispatchEvent(new Event('portal-firebase-ready'));
