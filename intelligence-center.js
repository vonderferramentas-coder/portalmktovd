// Central de Inteligência — painel de consulta do Google Trends (categoria/período/região).
// Só leitura: os dados são coletados uma vez por dia por .github/workflows/sync-google-trends.yml
// e publicados em portalStore/trends-v1 (mesmo gateway PortalFirebase.readPortalStore usado pelo
// painel de seguidores) — esta tela nunca chama o Google Trends direto do navegador.
(() => {
  'use strict';
  const STORE_KEY = 'trends-v1';

  const CATEGORIES = [
    { slug: 'construction-power-tools', label: 'Construction & Power Tools' },
    { slug: 'home-improvement', label: 'Home Improvement' },
    { slug: 'yard-patio', label: 'Yard & Patio' },
    { slug: 'construction-maintenance', label: 'Construction & Maintenance' },
    { slug: 'automotive', label: 'Automotive' },
    { slug: 'cleaning-supplies-services', label: 'Cleaning Supplies & Services' },
    { slug: 'industrial-materials', label: 'Industrial Materials' },
  ];
  const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.slug, c.label]));

  // "Comparativo anual" reaproveita o mesmo balde de dados de "Últimos 12 meses" coletado pelo
  // workflow — só muda o rótulo mostrado na coluna "Período analisado", não a consulta em si
  // (ver comentário equivalente em .github/workflows/sync-google-trends.yml).
  const PERIODS = [
    { key: '7d', label: 'Últimos 7 dias', dataKey: '7d' },
    { key: '30d', label: 'Últimos 30 dias', dataKey: '30d' },
    { key: '90d', label: 'Últimos 90 dias', dataKey: '90d' },
    { key: '12m', label: 'Últimos 12 meses', dataKey: '12m' },
    { key: 'yoy', label: 'Comparativo anual', dataKey: '12m' },
  ];
  const PERIOD_LABELS = Object.fromEntries(PERIODS.map(p => [p.key, p.label]));
  const PERIOD_DATA_KEY = Object.fromEntries(PERIODS.map(p => [p.key, p.dataKey]));

  const el = id => document.getElementById(id);
  const setText = (id, text) => { const node = el(id); if (node) node.textContent = text; };
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  let TRENDS = null;
  let category = 'all';
  let period = '30d';

  function setSyncStatus(text, kind) {
    const node = el('syncStatus'); if (!node) return;
    node.textContent = text;
    node.className = 'sync-status' + (kind ? ' ' + kind : '');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Junta as linhas da(s) categoria(s) em foco para o período selecionado. O "rank" gravado
  // pelo coletor é por categoria, então "Todas as categorias" recalcula um ranking novo, global,
  // em vez de reaproveitar os ranks individuais.
  function collectRows() {
    if (!TRENDS || !TRENDS.categories) return [];
    const dataKey = PERIOD_DATA_KEY[period];
    const slugs = category === 'all' ? CATEGORIES.map(c => c.slug) : [category];
    const rows = [];
    slugs.forEach(slug => {
      const bucket = TRENDS.categories[slug];
      const periodData = bucket && bucket.periods && bucket.periods[dataKey];
      if (!periodData || !Array.isArray(periodData.terms)) return;
      periodData.terms.forEach(term => rows.push({
        term: term.term,
        categoryLabel: bucket.label || CATEGORY_LABELS[slug] || slug,
        interest: term.interest,
        variation: term.variation,
        collectedAt: periodData.collectedAt,
      }));
    });
    rows.sort((a, b) => b.interest - a.interest);
    return rows;
  }

  function renderVariation(variation) {
    if (!variation) return '<span class="intel-variation-flat">—</span>';
    const isUp = variation === 'Alta' || variation.startsWith('+');
    return `<span class="${isUp ? 'intel-variation-up' : ''}">${escapeHtml(variation)}</span>`;
  }

  function render() {
    const rows = collectRows();
    const tbody = el('trendsTableBody');
    const empty = el('trendsEmpty');
    const wrap = el('trendsTableWrap');
    const periodLabel = PERIOD_LABELS[period];

    if (!rows.length) {
      wrap.style.display = 'none';
      empty.style.display = '';
      empty.textContent = TRENDS
        ? 'Nenhuma tendência coletada ainda para essa combinação de categoria e período.'
        : 'Ainda não há coleta de tendências — a primeira atualização automática roda no próximo ciclo diário.';
      setText('trendsSummary', '');
      return;
    }

    wrap.style.display = '';
    empty.style.display = 'none';
    tbody.innerHTML = rows.map((row, index) => `
      <tr>
        <td class="intel-col-rank">${index + 1}</td>
        <td>${escapeHtml(row.term)}</td>
        <td>${escapeHtml(row.categoryLabel)}</td>
        <td class="intel-col-interest">${row.interest}</td>
        <td class="intel-col-variation">${renderVariation(row.variation)}</td>
        <td>${escapeHtml(periodLabel)}</td>
        <td>${formatDateTime(row.collectedAt)}</td>
      </tr>
    `).join('');
    setText('trendsSummary', `${rows.length} termo${rows.length === 1 ? '' : 's'}`);
  }

  // ---- dropdowns (Categoria / Período) ----
  const allMenus = () => [el('trendsCategoryMenu'), el('trendsPeriodMenu')];
  const allTriggers = () => [el('trendsCategoryTrigger'), el('trendsPeriodTrigger')];
  function closeAllMenus() {
    allMenus().forEach(menu => { if (menu) menu.hidden = true; });
    allTriggers().forEach(trigger => { if (trigger) trigger.setAttribute('aria-expanded', 'false'); });
  }
  function wireDropdown(controlId, triggerId, menuId, onSelect) {
    const control = el(controlId), trigger = el(triggerId), menu = el(menuId);
    if (!control || !trigger || !menu) return;
    trigger.addEventListener('click', () => {
      const opening = menu.hidden;
      closeAllMenus();
      if (opening) { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
    });
    menu.addEventListener('click', event => {
      const button = event.target.closest('.period-option');
      if (!button) return;
      menu.querySelectorAll('.period-option').forEach(opt => opt.classList.toggle('is-active', opt === button));
      closeAllMenus();
      onSelect(button);
    });
  }
  document.addEventListener('click', event => {
    const inCategory = el('trendsCategoryControl')?.contains(event.target);
    const inPeriod = el('trendsPeriodControl')?.contains(event.target);
    if (!inCategory && !inPeriod) closeAllMenus();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAllMenus(); });

  wireDropdown('trendsCategoryControl', 'trendsCategoryTrigger', 'trendsCategoryMenu', button => {
    category = button.dataset.category;
    setText('trendsCategoryLabel', button.textContent.trim());
    render();
  });
  wireDropdown('trendsPeriodControl', 'trendsPeriodTrigger', 'trendsPeriodMenu', button => {
    period = button.dataset.period;
    setText('trendsPeriodLabel', button.textContent.trim());
    render();
  });

  // ---- carregamento ----
  async function load() {
    if (!window.PortalFirebase) return;
    try {
      const record = await window.PortalFirebase.readPortalStore(STORE_KEY);
      TRENDS = record.v || null;
      setSyncStatus(
        TRENDS && TRENDS.updatedAt ? `Última coleta: ${formatDateTime(TRENDS.updatedAt)}` : 'Aguardando primeira coleta',
        TRENDS ? 'ok' : 'warn'
      );
    } catch (error) {
      setSyncStatus('Sem conexão com o servidor — tente novamente mais tarde', 'warn');
    }
    render();
  }

  if (window.PortalFirebase) load();
  else window.addEventListener('portal-firebase-ready', load, { once: true });
})();
