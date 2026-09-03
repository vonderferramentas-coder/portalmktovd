import { signInWithEmail, signInWithGoogle, requestPasswordReset } from './firebase-client.js';
const $ = id => document.getElementById(id);
const form = $('loginForm'), email = $('email'), password = $('password'), message = $('authMessage');
const next = new URLSearchParams(location.search).get('next');
const destination = next && /^[-a-z0-9_./]+\.html(?:\?.*)?$/i.test(next) ? next : 'index.html';
function show(text, kind = 'error') { message.textContent = text; message.className = 'auth-message show' + (kind === 'success' ? ' success' : ''); }
function setBusy(busy) { ['emailSubmit','googleSubmit','resetPassword'].forEach(id => { $(id).disabled = busy; }); }
function friendly(error) {
  const code = error && error.code;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'E-mail ou senha não reconhecidos. Tente novamente ou recupere sua senha.';
  if (code === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
  if (code === 'auth/popup-closed-by-user') return 'O login com Google foi cancelado.';
  if (code === 'auth/access-pending') return 'Sua conta foi autenticada, mas ainda não foi liberada por um administrador.';
  if (code === 'auth/domain-not-allowed') return 'Use um e-mail corporativo autorizado.';
  return (error && error.message) || 'Não foi possível concluir o login. Tente novamente.';
}
$('passwordToggle').addEventListener('click', () => { const hidden = password.type === 'password'; password.type = hidden ? 'text' : 'password'; $('passwordToggle').setAttribute('aria-label', hidden ? 'Ocultar senha' : 'Mostrar senha'); });
form.addEventListener('submit', async event => { event.preventDefault(); setBusy(true); message.className = 'auth-message'; try { await signInWithEmail(email.value.trim(), password.value); location.replace(destination); } catch (error) { show(friendly(error)); } finally { setBusy(false); } });
$('googleSubmit').addEventListener('click', async () => { setBusy(true); message.className = 'auth-message'; try { await signInWithGoogle(); location.replace(destination); } catch (error) { show(friendly(error)); } finally { setBusy(false); } });
$('resetPassword').addEventListener('click', async () => { try { await requestPasswordReset(email.value.trim()); show('Se o e-mail estiver cadastrado, enviaremos um link seguro para redefinir a senha.', 'success'); } catch (error) { show(friendly(error)); } });
