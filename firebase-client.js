import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, addDoc, collection, serverTimestamp, updateDoc,
  runTransaction
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

export { app, auth, db, profileFor, audit };

window.PortalFirebase = { readPortalStore, writePortalStore, currentContext, logout };
window.dispatchEvent(new Event('portal-firebase-ready'));
