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
  const PAGE_SIZE = 50;
  const STATUSES = [
    { value: '', label: 'Pendente' },
    { value: 'acompanhando', label: 'Acompanhando' },
    { value: 'crise', label: 'Crise' },
    { value: 'analisado', label: 'Analisado' },
    { value: 'ignorado', label: 'Ignorado' },
  ];
  const PENDING = ['', 'acompanhando', 'crise'];
  const PRIORITY_RANK = { alta: 3, media: 2, baixa: 1 };
  const PRIORITY_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

  const el = id => document.getElementById(id);
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  // Minúsculas e sem acento: busca e ordenação de texto não diferenciam "Média" de "media".
  const plain = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
  let page = 0;

  const statusOf = m => (TRIAGE[m.id] && TRIAGE[m.id].status) || '';
  const statusLabel = m => STATUSES.find(s => s.value === statusOf(m)).label;
  const isNew = m => time(m.firstSeenAt) > lastVisit;
  const priorityOf = m => m.priority || 'baixa';

  // Uma linha por coluna: rótulo, valor usado para ordenar, sentido inicial ao primeiro clique
  // (texto começa A-Z; números, datas e prioridade começam do maior) e se alinha à direita.
  // Valor ausente (null) vai sempre para o fim, em qualquer sentido (ver compare()).
  const COLUMNS = [
    { key: 'title', label: 'Vídeo', first: 'asc', value: m => plain(m.title) },
    { key: 'priority', label: 'Prioridade', first: 'desc', value: m => PRIORITY_RANK[priorityOf(m)] },
    { key: 'channel', label: 'Canal', first: 'asc', value: m => plain(m.channelTitle) },
    { key: 'subs', label: 'Inscritos', first: 'desc', num: true, value: m => m.channelSubscribers },
    { key: 'views', label: 'Views', first: 'desc', num: true, value: m => m.views },
    { key: 'delta', label: 'Cresc. 24h', first: 'desc', num: true, value: m => m.viewsDelta },
    { key: 'comments', label: 'Comentários', first: 'desc', num: true, value: m => m.comments },
    { key: 'published', label: 'Publicado em', first: 'desc', value: m => time(m.publishedAt) },
    { key: 'status', label: 'Status', first: 'asc', value: m => plain(statusLabel(m)) },
  ];
  let sort = { key: 'priority', dir: 'desc' };

  function compare(a, b) {
    const col = COLUMNS.find(c => c.key === sort.key);
    const x = col.value(a), y = col.value(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    const result = typeof x === 'string' ? x.localeCompare(y, 'pt') : x - y;
    return sort.dir === 'asc' ? result : -result;
  }

  function renderHead() {
    const arrow = '<svg class="mon-sort-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m7 10 5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el('monHead').innerHTML = COLUMNS.map(col => {
      const active = sort.key === col.key;
      const cls = [col.num ? 'mon-num' : '', active ? 'is-sorted is-' + sort.dir : ''].filter(Boolean).join(' ');
      const aria = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th class="${cls}" aria-sort="${aria}"><button type="button" class="mon-sort" data-sort="${col.key}">${col.label}${arrow}</button></th>`;
    }).join('');
  }

  function onSortClick(event) {
    const button = event.target.closest('.mon-sort');
    if (!button) return;
    const col = COLUMNS.find(c => c.key === button.dataset.sort);
    sort = sort.key === col.key
      ? { key: col.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: col.first };
    page = 0;
    render();
  }

  function setSyncStatus(text, kind) {
    const node = el('syncStatus');
    node.textContent = text;
    node.className = 'sync-status' + (kind ? ' ' + kind : '');
  }

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
      isNew(m) && lastVisit ? '<span class="mon-tag is-new">Novo</span>' : '',
      m.unavailable ? '<span class="mon-tag">Indisponível</span>' : '',
      (m.negative || []).length ? `<span class="mon-tag mon-neg">Palavras negativas: ${escapeHtml(m.negative.join(', '))}</span>` : '',
      `<span class="mon-tag">Marca em: ${escapeHtml((m.matchedIn || []).join(', '))}</span>`,
    ].join('');
    const thumb = m.thumbnailUrl ? `<img src="${escapeHtml(m.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<img alt="">';
    const delta = m.viewsDelta != null
      ? `${m.viewsDelta >= 0 ? '+' : ''}${fmt(m.viewsDelta)}<div class="mon-delta-hours">em ${m.viewsDeltaHours}h</div>`
      : '-';
    const options = STATUSES.map(s => `<option value="${s.value}"${s.value === statusOf(m) ? ' selected' : ''}>${s.label}</option>`).join('');
    return `<tr class="${m.unavailable ? 'mon-unavailable' : ''}">
      <td><div class="mon-video">${thumb}<div><a href="${escapeHtml(m.permalink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.title)}</a><div>${tags}</div></div></div></td>
      <td><span class="mon-tag mon-prio-${priorityOf(m)}">${PRIORITY_LABEL[priorityOf(m)]}</span></td>
      <td class="mon-channel"><a href="${escapeHtml(m.channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.channelTitle)}</a></td>
      <td class="mon-num">${fmt(m.channelSubscribers)}</td>
      <td class="mon-num">${fmt(m.views)}</td>
      <td class="mon-num mon-delta">${delta}</td>
      <td class="mon-num">${fmt(m.comments)}</td>
      <td>${escapeHtml(formatDateTime(m.publishedAt))}</td>
      <td><select class="mon-status" data-id="${escapeHtml(m.id)}" aria-label="Status de ${escapeHtml(m.title)}">${options}</select></td>
    </tr>`;
  }

  function render() {
    renderStats();
    renderHead();
    const days = Number(el('monPeriod').value);
    const pendingOnly = el('monStatus').value === 'pending';
    const query = plain(el('monSearch').value).trim();
    const cutoff = days ? Date.now() - days * DAY_MS : 0;
    const rows = MENTIONS
      .filter(m => time(m.publishedAt) >= cutoff && (!pendingOnly || PENDING.includes(statusOf(m)))
        && (!query || plain(m.title).includes(query) || plain(m.channelTitle).includes(query)))
      // Desempate sempre pelo mais recente, para a ordem não "pular" entre linhas iguais.
      .sort((a, b) => compare(a, b) || time(b.publishedAt) - time(a.publishedAt));

    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const start = page * PAGE_SIZE;
    el('monSummary').textContent = rows.length
      ? `${start + 1}-${Math.min(start + PAGE_SIZE, rows.length)} de ${rows.length} (histórico: ${MENTIONS.length})`
      : `0 de ${MENTIONS.length} vídeo(s)`;
    el('monTableBody').innerHTML = rows.slice(start, start + PAGE_SIZE).map(rowHtml).join('');
    el('monTableWrap').hidden = !rows.length;
    el('monPager').hidden = pages <= 1;
    el('monPagerLabel').textContent = `Página ${page + 1} de ${pages}`;
    el('monPagerPrev').disabled = page === 0;
    el('monPagerNext').disabled = page >= pages - 1;
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
    // Mudar qualquer filtro ou a busca volta para a página 1.
    ['monSearch', 'monPeriod', 'monStatus'].forEach(id => {
      el(id).addEventListener(id === 'monSearch' ? 'input' : 'change', () => { page = 0; render(); });
    });
    el('monHead').addEventListener('click', onSortClick);
    el('monTableBody').addEventListener('change', onStatusChange);
    el('monPagerPrev').addEventListener('click', () => { page -= 1; render(); });
    el('monPagerNext').addEventListener('click', () => { page += 1; render(); });
    renderHead();
    load();
  }

  if (window.PortalFirebase) init();
  else window.addEventListener('portal-firebase-ready', init, { once: true });
})();
