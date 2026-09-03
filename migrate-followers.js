import { audit, readPortalStore, writePortalStore } from './firebase-client.js';

const STORE_KEY = 'followers-vonder-v1';
const summary = document.getElementById('migrationSummary');
const button = document.getElementById('migrateButton');

function setMessage(message, type = '') {
  summary.textContent = message;
  summary.className = `auth-notice ${type}`.trim();
}

async function loadSource() {
  const [historyResponse, liveResponse] = await Promise.all([
    fetch(`data/social-followers.json?v=${Date.now()}`, { cache: 'no-store' }),
    fetch(`data/social-followers-live.json?v=${Date.now()}`, { cache: 'no-store' })
  ]);
  if (!historyResponse.ok || !liveResponse.ok) throw new Error('Não foi possível ler os arquivos atuais de seguidores.');
  const [published, live] = await Promise.all([historyResponse.json(), liveResponse.json()]);
  if (!published || !Array.isArray(published.history) || !live || !live.platforms) {
    throw new Error('Os arquivos de origem não têm o formato esperado. Nenhuma cópia foi feita.');
  }
  return { published, live };
}

async function migrate() {
  button.disabled = true;
  setMessage('Copiando dados para o Firestore protegido…');
  try {
    const payload = await loadSource();
    const current = await readPortalStore(STORE_KEY);
    const result = await writePortalStore(STORE_KEY, payload, current.updated_at);
    if (result.conflict) throw new Error('Os dados foram alterados por outra sessão. Atualize a página e tente novamente.');
    const validation = await readPortalStore(STORE_KEY);
    const copied = validation.v;
    const expectedCount = payload.published.history.length;
    const actualCount = copied && copied.published && Array.isArray(copied.published.history) ? copied.published.history.length : 0;
    if (!copied || actualCount !== expectedCount || copied.live.updatedAt !== payload.live.updatedAt) {
      throw new Error('A validação não confirmou todos os dados. Os arquivos de origem foram preservados.');
    }
    await audit('followers_migrated', { historyPoints: actualCount, liveUpdatedAt: copied.live.updatedAt });
    setMessage(`Migração validada: ${actualCount} pontos históricos e o snapshot de ${new Date(copied.live.updatedAt).toLocaleString('pt-BR')} estão protegidos no Firestore.`, 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível concluir a migração. Nenhum arquivo de origem foi removido.', 'error');
    button.disabled = false;
  }
}

try {
  const source = await loadSource();
  setMessage(`Pronto para copiar ${source.published.history.length} pontos históricos e o snapshot da Meta de ${new Date(source.live.updatedAt).toLocaleString('pt-BR')}.`);
  button.disabled = false;
  button.addEventListener('click', migrate);
} catch (error) {
  setMessage(error.message || 'Não foi possível preparar a migração.', 'error');
}