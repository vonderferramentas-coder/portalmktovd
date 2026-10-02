// Monitoramento - menções à marca em vídeos de outros canais do YouTube.
// Dados coletados (somente leitura aqui): .github/workflows/sync-youtube-mencoes.yml publica em
// portalStore/youtube-mentions-vonder-v1 (mesmo gateway PortalFirebase.readPortalStore do painel
// de seguidores) - esta tela nunca chama a API do YouTube direto do navegador.
// Triagem (status por vídeo): documento próprio, gravável por qualquer usuário ativo, porque o
// documento de menções é só do administrador (ver isCollectedDataDoc em firestore.rules).
(() => {
  'use strict';
  // 'default' é o id fixo da VONDER (ver DEFAULT_BRANDS em portal-shell.js); só ela tem coleta.
  const STORE_KEY = 'youtube-mentions-vonder-v1';
  const TRIAGE_KEY = 'monitoramento-triagem-vonder-v1';
  const LAST_VISIT_KEY = 'monitoramento_last_visit_v1';
  const DAY_MS = 86400000;
  const STALE_MS = 6 * 3600000; // o coletor roda a cada 2h; passou de 6h, algo parou
  const STATUSES = [
    { value: '', label: 'Pendente' },
    { value: 'acompanhando', label: 'Acompanhando' },
    { value: 'crise', label: 'Crise' },
    { value: 'analisado', label: 'Analisado' },
    { value: 'ignorado', label: 'Ignorado' },
  ];
  const PENDING = ['', 'acompanhando', 'crise'];
  const PRIORITY_RANK = { alta: 3, media: 2, baixa: 1 };
  const PRIORITY_LABEL = { alta: 'Prioridade alta', media: 'Prioridade média', baixa: 'Prioridade baixa' };

  const el = id => document.getElementById(id);
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = n => (n == null ? '-' : Number(n).toLocaleString('pt-BR'));
  const time = iso => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };
  const formatDateTime = iso => time(iso)
    ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';

  const brandId = (window.PortalBrand && window.PortalBrand.activeId) || 'default';
  let MENTIONS = [];
  let TRIAGE = {};          // { [videoId]: { status, by, at } }
  let triageVersion = 0;
  let lastVisit = 0;

  function setSyncStatus(text, kind) {
    const node = el('syncStatus');
    node.textContent = text;
    node.className = 'sync-status' + (kind ? ' ' + kind : '');
  }

  const statusOf = m => (TRIAGE[m.id] && TRIAGE[m.id].status) || '';
  const isNew = m => time(m.firstSeenAt) > lastVisit;
  const isDirect = m => (m.matchedIn || []).length > 0;
  const priorityOf = m => m.priority || 'baixa';

  function renderStats() {
    const now = Date.now();
    const active = MENTIONS.filter(m => !m.unavailable);
    el('statNew').textContent = lastVisit ? fmt(MENTIONS.filter(isNew).length) : '-';
    el('statHigh').textContent = fmt(active.filter(m => priorityOf(m) === 'alta' && PENDING.includes(statusOf(m))).length);
    el('stat24h').textContent = fmt(active.filter(m => now - time(m.publishedAt) <= DAY_MS).length);
    el('stat7d').textContent = fmt(active.filter(m => now - time(m.publishedAt) <= 7 * DAY_MS).length);
  }

  function rowHtml(m) {
    const tags = [
      `<span class="mon-tag mon-prio-${priorityOf(m)}">${PRIORITY_LABEL[priorityOf(m)]}</span>`,
      isNew(m) && lastVisit ? '<span class="mon-tag is-new">Novo</span>' : '',
      m.unavailable ? '<span class="mon-tag">Indisponível</span>' : '',
      (m.negative || []).length ? `<span class="mon-tag mon-neg">Palavras negativas: ${escapeHtml(m.negative.join(', '))}</span>` : '',
      isDirect(m)
        ? `<span class="mon-tag">Marca em: ${escapeHtml(m.matchedIn.join(', '))}</span>`
        : '<span class="mon-tag is-weak">Sem a marca no texto</span>',
    ].join('');
    const thumb = m.thumbnailUrl ? `<img src="${escapeHtml(m.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<img alt="">';
    const delta = m.viewsDelta != null ? `<div class="mon-delta">${m.viewsDelta >= 0 ? '+' : ''}${fmt(m.viewsDelta)} em ${m.viewsDeltaHours}h</div>` : '';
    const options = STATUSES.map(s => `<option value="${s.value}"${s.value === statusOf(m) ? ' selected' : ''}>${s.label}</option>`).join('');
    return `<tr class="${m.unavailable ? 'mon-unavailable' : ''}">
      <td><div class="mon-video">${thumb}<div><a href="${escapeHtml(m.permalink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.title)}</a><div>${tags}</div></div></div></td>
      <td class="mon-channel"><a href="${escapeHtml(m.channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.channelTitle)}</a></td>
      <td class="mon-num">${fmt(m.channelSubscribers)}</td>
      <td class="mon-num">${fmt(m.views)}${delta}</td>
      <td class="mon-num">${fmt(m.comments)}</td>
      <td>${escapeHtml(formatDateTime(m.publishedAt))}</td>
      <td><select class="mon-status" data-id="${escapeHtml(m.id)}" aria-label="Status de ${escapeHtml(m.title)}">${options}</select></td>
    </tr>`;
  }

  function render() {
    renderStats();
    const days = Number(el('monPeriod').value);
    const sort = el('monSort').value;
    const directOnly = el('monMatch').value === 'direct';
    const pendingOnly = el('monStatus').value === 'pending';
    const cutoff = days ? Date.now() - days * DAY_MS : 0;
    const recent = m => time(m.publishedAt);
    const keys = {
      priority: m => PRIORITY_RANK[priorityOf(m)] * 1e14 + recent(m),
      recent,
      views: m => m.views || 0,
      growth: m => m.viewsDelta == null ? -Infinity : m.viewsDelta,
      reach: m => m.channelSubscribers || 0,
    };
    const rows = MENTIONS
      .filter(m => time(m.publishedAt) >= cutoff && (!directOnly || isDirect(m)) && (!pendingOnly || PENDING.includes(statusOf(m))))
      .sort((a, b) => keys[sort](b) - keys[sort](a));

    el('monSummary').textContent = `${rows.length} de ${MENTIONS.length} vídeo(s)`;
    el('monTableBody').innerHTML = rows.map(rowHtml).join('');
    el('monTableWrap').hidden = !rows.length;
    const empty = el('monEmpty');
    empty.hidden = !!rows.length;
    empty.textContent = MENTIONS.length ? 'Nenhum vídeo nos filtros selecionados.' : 'Nenhuma menção encontrada até agora.';
  }

  // Triagem: lê-modifica-grava com a versão otimista do portalStore; em conflito (outra pessoa
  // gravou antes) mescla o que veio do servidor com a mudança local e tenta mais uma vez.
  async function saveTriage(id, status) {
    const context = await window.PortalFirebase.currentContext();
    const profile = context.profile || {};
    const entry = { status, by: profile.name || (context.user && context.user.email) || '', at: new Date().toISOString() };
    const apply = items => ({ ...items, [id]: entry });
    let items = apply(TRIAGE);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await window.PortalFirebase.writePortalStore(TRIAGE_KEY, { items }, triageVersion);
      if (!result.conflict) { TRIAGE = items; triageVersion = result.updated_at; return; }
      items = apply((result.server.v && result.server.v.items) || {});
      triageVersion = result.server.updated_at;
    }
    throw new Error('conflito');
  }

  async function onStatusChange(event) {
    const select = event.target.closest('.mon-status');
    if (!select) return;
    const previous = statusOf({ id: select.dataset.id });
    select.disabled = true;
    try {
      await saveTriage(select.dataset.id, select.value);
    } catch (error) {
      select.value = previous;
      setSyncStatus('Não foi possível salvar o status - tente novamente', 'warn');
    }
    select.disabled = false;
    render();
  }

  async function load() {
    try {
      const record = await window.PortalFirebase.readPortalStore(STORE_KEY);
      const data = record.v;
      MENTIONS = (data && data.mentions) || [];
      if (!data) setSyncStatus('Aguardando primeira coleta', 'warn');
      else if (Date.now() - time(data.updatedAt) > STALE_MS) {
        setSyncStatus(`Última busca: ${formatDateTime(data.updatedAt)}`, 'warn');
        el('monStale').hidden = false;
        el('monStaleSince').textContent = formatDateTime(data.updatedAt);
      } else setSyncStatus(`Última busca: ${formatDateTime(data.updatedAt)}`, 'ok');
    } catch (error) {
      setSyncStatus('Sem conexão com o servidor - tente novamente mais tarde', 'warn');
    }
    try {
      const record = await window.PortalFirebase.readPortalStore(TRIAGE_KEY);
      TRIAGE = (record.v && record.v.items) || {};
      triageVersion = record.updated_at || 0;
    } catch (error) { /* sem triagem salva: tudo "Pendente" */ }
    // "Novo" compara com a visita anterior; só depois de renderizar a visita atual é gravada.
    try { lastVisit = Number(localStorage.getItem(LAST_VISIT_KEY)) || 0; } catch (error) { lastVisit = 0; }
    render();
    try { localStorage.setItem(LAST_VISIT_KEY, String(Date.now())); } catch (error) { /* só conveniência */ }
  }

  function init() {
    if (brandId !== 'default') { el('monNotConnected').hidden = false; return; }
    el('monContent').hidden = false;
    ['monPeriod', 'monSort', 'monMatch', 'monStatus'].forEach(id => el(id).addEventListener('change', render));
    el('monTableBody').addEventListener('change', onStatusChange);
    load();
  }

  if (window.PortalFirebase) init();
  else window.addEventListener('portal-firebase-ready', init, { once: true });
})();
