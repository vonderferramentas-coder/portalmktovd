import { db } from './firebase-client.js';
import { collection, doc, getDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const toolNames = {
  'post-editor': 'Editor de Posts',
  'post-editor-busca-sem-resultado': 'Editor de Posts - buscas sem resultado no catálogo',
  'post-editor-produto-do-site': 'Editor de Posts - produtos escolhidos pelo site',
  'cartaz-generator': 'Gerador de Cartazes',
  'business-card-generator': 'Gerador de Cartões',
  'conecta-fg': 'Conecta FG',
  'photoshop-actions': 'Ações do Photoshop'
};
const brandNames = {
  default: 'VONDER',
  'ferramentas-gerais': 'Ferramentas Gerais',
  'osten-ferragens': 'Osten Ferragens',
  dismatal: 'Dismatal',
  toolmix: 'Toolmix',
  dwt: 'DWT',
  nove54: 'Nove54',
  'grupo-ovd': 'Grupo OVD',
  'pilar-tecnologia': 'Pilar Tecnologia'
};
const day = value => value.toISOString().slice(0, 10);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const toolLabel = value => toolNames[value] || value;
const brandLabel = value => brandNames[value] || value || 'Sem marca';
let rows = [];

function options(id, values, label) {
  const el = $(id), current = el.value;
  [...new Set(values.filter(Boolean))].sort((a, b) => label(a).localeCompare(label(b), 'pt-BR')).forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label(value);
    el.append(option);
  });
  el.value = current;
}

function list(id, data, field, label) {
  const el = $(id), totals = {};
  data.forEach(row => {
    const value = row[field] || '';
    totals[value] = (totals[value] || 0) + Number(row.quantity || 0);
  });
  const items = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  el.innerHTML = items.length
    ? items.map(([value, total]) => '<div class="usage-row"><span>' + escapeHtml(label(value)) + '</span><strong>' + total + '</strong></div>').join('')
    : '<p class="usage-empty">Ainda não há entregas consolidadas neste período.</p>';
}

function render() {
  const days = Number($('period').value), start = new Date();
  start.setDate(start.getDate() - days + 1);
  const subset = rows.filter(row => row.date >= day(start) && (!$('tool').value || row.tool === $('tool').value) && (!$('brand').value || row.brandId === $('brand').value));
  const total = subset.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const users = subset.reduce((sum, row) => sum + Number(row.uniqueUsers || 0), 0);
  $('total').textContent = total;
  $('users').textContent = users;
  $('tools').textContent = new Set(subset.map(row => row.tool)).size;
  $('change').textContent = '-';
  list('ranking', subset, 'tool', toolLabel);
  list('brands', subset, 'brandId', brandLabel);
}

try {
  const start = new Date();
  start.setDate(start.getDate() - 89);
  const snapshot = await getDocs(query(collection(db, 'usageDaily'), where('date', '>=', day(start))));
  rows = snapshot.docs.map(doc => doc.data());
  options('tool', rows.map(row => row.tool), toolLabel);
  options('brand', rows.map(row => row.brandId), brandLabel);
  ['period', 'tool', 'brand'].forEach(id => $(id).addEventListener('change', render));
  render();
} catch (error) {
  console.error(error);
  ['ranking', 'brands'].forEach(id => $(id).innerHTML = '<p class="usage-empty">Não foi possível carregar os indicadores agora.</p>');
}

// ---------------------------------------------------------------- credenciais e vencimentos (só admin)
// O verificador diário (.github/workflows/verificar-credenciais.yml) grava em portalStore/posts-credenciais-status-v1 só
// o estado e a data de vencimento de cada credencial, nunca o valor. O texto (para que serve, como renovar) fica aqui.
const DOCS = 'docs/ARQUITETURA-E-INTEGRACOES.md';
const SECRETS_PLACE = 'GitHub: Settings > Secrets and variables > Actions';
const CREDENTIALS = [
  { id: 'linkedin', name: 'LinkedIn (página Grupo OVD)', use: 'Seguidores, histórico e posts do LinkedIn.', where: 'LINKEDIN_REFRESH_TOKEN (junto com LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET e LINKEDIN_ORGANIZATION_ID)',
    steps: ['Entre em linkedin.com/developers com um usuário que administre a página Grupo OVD e abra o app "Feed Social Grupo OVD".', 'Em Docs and tools, abra o OAuth token generator, marque r_organization_followers, r_organization_social e rw_organization_admin e clique em Request access token.', 'Copie o Refresh token (aparece uma vez só) e atualize o segredo LINKEDIN_REFRESH_TOKEN (' + SECRETS_PLACE + ').', 'Em Actions, rode "Sincronizar seguidores LinkedIn" para confirmar que ficou verde.'] },
  { id: 'meta-vonder', name: 'Meta - VONDER (Instagram e Facebook)', use: 'Seguidores e posts do Instagram e do Facebook da VONDER.', where: 'META_PAGE_ACCESS_TOKEN',
    steps: ['Gere um novo token de Página de longa duração no Graph API Explorer, seguindo o passo a passo da seção 8 de ' + DOCS + '.', 'Atualize o segredo META_PAGE_ACCESS_TOKEN (' + SECRETS_PLACE + ').', 'Em Actions, rode "Sincronizar seguidores Meta" para confirmar.'] },
  { id: 'meta-fg', name: 'Meta - Ferramentas Gerais (Instagram e Facebook)', use: 'Seguidores e posts do Instagram e do Facebook da Ferramentas Gerais.', where: 'META_PAGE_ACCESS_TOKEN_FERRAMENTAS_GERAIS',
    steps: ['Gere um novo token de Página de longa duração da Ferramentas Gerais no Graph API Explorer, como na seção 8 de ' + DOCS + '.', 'Atualize o segredo META_PAGE_ACCESS_TOKEN_FERRAMENTAS_GERAIS (' + SECRETS_PLACE + ').', 'Em Actions, rode "Sincronizar seguidores Meta" para confirmar.'] },
  { id: 'youtube-key', name: 'YouTube - chave de API', use: 'Inscritos, vídeos e menções do YouTube.', where: 'YOUTUBE_API_KEY',
    steps: ['A chave não vence. Se falhar ou precisar trocar, abra o Google Cloud Console (projeto mkt-ovd), APIs e serviços, Credenciais, e crie ou rotacione a chave (restrita à YouTube Data API v3).', 'Atualize o segredo YOUTUBE_API_KEY (' + SECRETS_PLACE + ').', 'Em Actions, rode "Sincronizar seguidores YouTube" para confirmar.'] },
  { id: 'youtube-oauth', name: 'YouTube - autorização do canal (OAuth)', use: 'Histórico e análises diárias do canal Vonder.', where: 'YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET e YOUTUBE_OAUTH_REFRESH_TOKEN',
    steps: ['A autorização não tem data de vencimento, mas é perdida se a senha da conta mudar ou se o acesso for revogado em myaccount.google.com/permissions.', 'Repita a autorização única com quem administra o canal Vonder (escolhendo a Conta de marca Vonder), como na seção 9 de ' + DOCS + '.', 'Regrave os três segredos YOUTUBE_OAUTH_* (' + SECRETS_PLACE + ').'] },
  { id: 'github-backup', name: 'GitHub - backup diário', use: 'Copia o banco de dados para o repositório privado de backups.', where: 'BACKUP_REPO_TOKEN',
    steps: ['No GitHub, em Settings > Developer settings > Fine-grained tokens, gere um novo token só para o repositório portalmktovd-backups (Contents: Read and write; Metadata: Read-only).', 'Atualize o segredo BACKUP_REPO_TOKEN (' + SECRETS_PLACE + ').', 'Em Actions, rode o backup do portalStore para confirmar.'] },
  { id: 'cloudflare-dispatch', name: 'Cloudflare - agendador das coletas', use: 'Dispara as coletas no horário certo (Worker agendador-portal-mkt). Sem ele, nada atualiza sozinho.', where: 'GITHUB_DISPATCH_TOKEN no Cloudflare; a data de vencimento vai na variável de repositório CLOUDFLARE_DISPATCH_TOKEN_EXPIRA',
    steps: ['No GitHub, em Settings > Developer settings > Fine-grained tokens, gere um novo token só para este repositório, com Actions: Read and write.', 'No Cloudflare, abra Workers & Pages > agendador-portal-mkt > Settings > Variables and Secrets e atualize GITHUB_DISPATCH_TOKEN.', 'No GitHub, em Settings > Secrets and variables > Actions > Variables, atualize CLOUDFLARE_DISPATCH_TOKEN_EXPIRA com a nova data (AAAA-MM-DD). Essa data o sistema não consegue ler sozinho.'] },
  { id: 'firebase-hml', name: 'Firebase - ambiente de testes (HML)', use: 'Cópia de dados de produção para o HML.', where: 'FIREBASE_SERVICE_ACCOUNT_KEY_HML',
    steps: ['No Firebase Console do projeto mkt-ovd-hml, em Configurações do projeto > Contas de serviço, gere uma nova chave privada.', 'Atualize o segredo FIREBASE_SERVICE_ACCOUNT_KEY_HML (' + SECRETS_PLACE + ') e apague a chave antiga no console.'] }
];
const CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const glyph = path => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
// Cards por serviço: ícone da rede (ou um desenho simples para infraestrutura) e uma linha por credencial ([id de CREDENTIALS, rótulo]).
const GROUPS = [
  { name: 'Meta', sub: 'Instagram e Facebook', icons: ['icons/instagram.svg', 'icons/facebook.svg'], items: [['meta-vonder', 'VONDER'], ['meta-fg', 'Ferramentas Gerais']] },
  { name: 'YouTube', sub: 'Canal Vonder', icons: ['icons/youtube.svg'], items: [['youtube-key', 'Chave de API'], ['youtube-oauth', 'Autorização do canal']] },
  { name: 'LinkedIn', sub: 'Página Grupo OVD', icons: ['icons/linkedin.svg'], items: [['linkedin', 'Token da página']] },
  { name: 'GitHub', sub: 'Backup diário do banco de dados', glyph: glyph('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'), items: [['github-backup', 'Token do backup']] },
  { name: 'Cloudflare', sub: 'Agendador das coletas', glyph: glyph('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'), items: [['cloudflare-dispatch', 'Token do agendador']] },
  { name: 'Firebase', sub: 'Ambiente de testes (HML)', glyph: glyph('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>'), items: [['firebase-hml', 'Chave de serviço']] }
];
const TONE_RANK = { danger: 0, warn: 1, ok: 2 };
const dateLabel = value => new Date(value).toLocaleDateString('pt-BR');
const daysLeft = value => Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);

// Verde = verificado e longe do vencimento; amarelo = vence em até 60 dias, sem leitura hoje ou data a informar;
// vermelho = não verificado, recusado pelo serviço ou vencido.
function credentialState(info, waiting) {
  // sem documento nenhum (verificador ainda não rodou) não é falha de credencial: aguarda; com documento, a ausente é "não verificada"
  if (!info && waiting) return { tone: 'warn', label: 'Aguardando verificação', note: 'A primeira verificação roda sozinha assim que o verificador diário entrar no ar.' };
  if (!info) return { tone: 'danger', label: 'Não verificado', note: 'O verificador diário ainda não leu esta credencial.' };
  if (info.ok === false) return { tone: 'danger', label: 'Precisa atualizar', note: info.detail };
  if (info.expiresAt) {
    const left = daysLeft(info.expiresAt), when = dateLabel(info.expiresAt);
    if (!Number.isFinite(left)) return { tone: 'warn', label: 'Data inválida', note: 'O verificador gravou uma data de vencimento que não dá para ler.' };
    if (left <= 0) return { tone: 'danger', label: 'Vencido', note: `Venceu em ${when}.` };
    const note = `Vence em ${when}, daqui a ${left} ${left === 1 ? 'dia' : 'dias'}. ${info.detail || ''}`.trim();
    return left <= 60 ? { tone: 'warn', label: `Vence em ${left} ${left === 1 ? 'dia' : 'dias'}`, note } : { tone: 'ok', label: 'Verificado', note };
  }
  if (info.ok === null) return { tone: 'warn', label: info.manual ? 'Informar vencimento' : 'Sem leitura hoje', note: info.detail };
  return { tone: 'ok', label: 'Verificado', note: info.detail || 'Funcionando, sem data de vencimento.' };
}

function renderCredentials(status) {
  const items = (status && status.items) || {};
  const byId = Object.fromEntries(CREDENTIALS.map(item => [item.id, item]));
  const groups = GROUPS.map(group => {
    const rows = group.items.map(([id, label]) => ({ item: byId[id], label, state: credentialState(items[id], !status) }));
    return { group, rows, worst: rows.reduce((tone, row) => TONE_RANK[row.state.tone] < TONE_RANK[tone] ? row.state.tone : tone, 'ok') };
  });
  const all = groups.flatMap(entry => entry.rows.map(row => Object.assign({ groupName: entry.group.name }, row)));
  const count = tone => all.filter(row => row.state.tone === tone).length;
  const needAction = all.filter(row => row.state.tone !== 'ok');
  const rawStamp = status && status.updatedAt ? new Date(status.updatedAt) : null;
  const stamp = rawStamp && Number.isFinite(rawStamp.getTime()) ? rawStamp : null;
  // data ausente ou ilegível conta como verificador parado (a comparação com NaN daria false e esconderia o aviso)
  const stale = !!status && !(stamp && Date.now() - stamp.getTime() <= 36 * 3600000);

  $('credCheck').textContent = stamp
    ? `Verificado em ${stamp.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}, uma vez por dia. Nenhum valor de token é guardado aqui, só o estado e a data.`
    : 'Ainda não há nenhuma verificação gravada.';
  $('credTiles').innerHTML = [['ok', 'Em dia'], ['warn', 'Vencendo ou a informar'], ['danger', 'Precisam de atenção']]
    .map(([tone, label]) => `<div class="cred-tile ${count(tone) ? tone : 'is-zero'}"><strong>${count(tone)}</strong><span>${label}</span></div>`).join('');

  // os avisos se empilham: verificador parado não esconde credencial vencida ou com falha no último estado gravado
  const banners = [];
  const failed = items.verificador && items.verificador.ok === false;
  if (failed) banners.push({ tone: 'danger', text: `O verificador diário falhou: ${items.verificador.detail || 'erro inesperado'}.` });
  if (stale) banners.push({ tone: 'warn', text: `O verificador diário não grava desde ${stamp ? dateLabel(stamp) : 'uma data válida'}. Confira o workflow "Verificar credenciais" em Actions: os vencimentos abaixo podem estar desatualizados.` });
  if (needAction.length) banners.push({ tone: needAction.some(row => row.state.tone === 'danger') ? 'danger' : 'warn', text: `${needAction.length} ${needAction.length === 1 ? 'credencial precisa' : 'credenciais precisam'} de atenção: ${needAction.map(row => `${row.groupName} - ${row.label}`).join('; ')}.` });
  else if (stamp && !stale && !failed) banners.push({ tone: 'ok', text: 'Todas as credenciais verificadas estão em dia.' });
  $('credBanner').innerHTML = banners.map(banner => `<p class="cred-banner ${banner.tone}">${escapeHtml(banner.text)}</p>`).join('');

  $('credList').innerHTML = groups.map(({ group, rows, worst }) => {
    const icons = (group.icons || []).map(src => `<span class="cred-icon"><img src="${escapeHtml(src)}" alt=""></span>`).join('') || `<span class="cred-icon">${group.glyph}</span>`;
    const body = rows.map(({ item, label, state }) => `<div class="cred-row"><div class="cred-rtop"><span class="cred-rname">${escapeHtml(label)}</span><span class="cred-badge ${state.tone}">${escapeHtml(state.label)}</span></div>`
      + (state.note ? `<p class="cred-rnote">${escapeHtml(state.note)}</p>` : '')
      + `<details class="cred-steps"><summary>${CHEVRON}Como renovar</summary><p class="cred-where">${escapeHtml(item.use)} Onde atualizar: ${escapeHtml(item.where)}</p><ol>${item.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol></details></div>`).join('');
    return `<article class="cred-group ${worst}"><header class="cred-ghead"><span class="cred-icons">${icons}</span><div><h3>${escapeHtml(group.name)}</h3><p>${escapeHtml(group.sub)}</p></div></header>${body}</article>`;
  }).join('');
}

// auth-guard.js libera a página e grava o papel do usuário em body.dataset.userRole; o card só é lido e mostrado para admin.
async function initCredentials() {
  if (document.documentElement.classList.contains('auth-pending')) {
    await new Promise(resolve => {
      const observer = new MutationObserver(() => {
        if (document.documentElement.classList.contains('auth-pending')) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
  }
  if (document.body.dataset.userRole !== 'admin') return;
  $('credSection').hidden = false;
  try {
    const snapshot = await getDoc(doc(db, 'portalStore', 'posts-credenciais-status-v1'));
    renderCredentials(snapshot.exists() ? snapshot.data().v : null);
  } catch (error) {
    console.error(error);
    $('credBanner').innerHTML = '<p class="cred-banner warn">Não foi possível carregar os vencimentos agora.</p>';
  }
}
initCredentials();
