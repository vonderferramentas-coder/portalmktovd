(() => {
  'use strict';

  // O painel lê a série diária publicada pelo workflow (data/social-followers.json) e a
  // combina com números lançados à mão. O dado da API nunca é gravado no navegador: ele
  // é relido a cada carga, para que a página nunca mostre uma cópia velha do que a Meta
  // já corrigiu — foi exatamente esse tipo de cópia que fez a série de exemplo sobreviver
  // à sua remoção do código.

  const brand = (window.PortalBrand && (window.PortalBrand.list || []).find(item => item.id === window.PortalBrand.activeId)) || {};
  const brandKey = brand.id || 'default';
  // 'default' é o id fixo da VONDER (ver DEFAULT_BRANDS em portal-shell.js) — hoje é a única
  // marca com coleta automática pela API da Meta. As demais marcas ainda não têm integração
  // própria, então não devem herdar os números nem as metas/projeções da VONDER: usam este
  // sinal para não buscar os arquivos publicados e mostrar uma mensagem de "não conectado".
  const isVonder = brandKey === 'default';
  const FOLLOWERS_STORE_KEY = 'followers-vonder-v1';
  const POSTS_STORE_KEY = 'posts-vonder-v1';
  const AUTO_REFRESH_MS = 60000;
  const MAX_BUCKETS = 60;

  // auth.css esconde a página inteira (visibility:hidden) até auth-guard.js liberar o acesso —
  // mas transições CSS e requestAnimationFrame continuam correndo por baixo. Sem isso, a
  // animação do anel de meta termina escondida e só aparece o quadro final quando a página some
  // do auth-pending. pageVisible fica em memória (não observa de novo) porque a classe some uma
  // única vez, no máximo, na vida da página.
  let pageVisible = !document.documentElement.classList.contains('auth-pending');
  let onPageVisible = null;
  if (!pageVisible) {
    const authPendingObserver = new MutationObserver(() => {
      if (document.documentElement.classList.contains('auth-pending')) return;
      pageVisible = true;
      authPendingObserver.disconnect();
      if (onPageVisible) { const run = onPageVisible; onPageVisible = null; run(); }
    });
    authPendingObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  ['social_followers_', 'social_followers_goals_', 'social_followers_v2_', 'social_followers_goals_v2_']
    .forEach(prefix => { try { localStorage.removeItem(prefix + brandKey); } catch (error) { /* sem storage */ } });

  const manualKey = 'social_followers_manual_v3_' + brandKey;
  const goalsKey = 'social_followers_goals_v3_' + brandKey;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (error) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* sem storage */ } };

  const NETWORKS = [
    { name:'Instagram', color:'#E94683', icon:'icons/instagram.svg', connected:isVonder },
    { name:'Facebook',  color:'#287BE0', icon:'icons/facebook.svg',  connected:false },
    { name:'YouTube',   color:'#F04444', icon:'icons/youtube.svg',   connected:false },
    { name:'TikTok',    color:'#111827', icon:'icons/tiktok.svg',    connected:false }
  ];
  const POST_SORT_OPTIONS = [
    { key: 'likeCount', label: 'Curtidas', icon: '<path d="M12 20s-6.5-4-9-8.5C1.2 7.8 3 4.5 6.5 4.5c2 0 3.5 1.2 5.5 3.5 2-2.3 3.5-3.5 5.5-3.5 3.5 0 5.3 3.3 3.5 7C18.5 16 12 20 12 20Z"/>' },
    { key: 'commentsCount', label: 'Comentários', icon: '<path d="M21 11.5c0 4.4-4 8-9 8-1 0-2-.1-2.9-.4L4 21l1.3-4.3A7.6 7.6 0 0 1 3 11.5c0-4.4 4-8 9-8s9 3.6 9 8Z"/>' },
    { key: 'totalInteractions', label: 'Interações', icon: '<path d="M3 17l6-6.5 4 4L21 6"/><path d="M15 6h6v6"/>' },
    { key: 'views', label: 'Visualizações', icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>' },
    { key: 'saved', label: 'Salvamentos', icon: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>' }
  ];
  const postIconSvg = key => {
    const option = POST_SORT_OPTIONS.find(item => item.key === key);
    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${option ? option.icon : ''}</svg>`;
  };
  const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const WEEKDAYS = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  // Meta padrão da VONDER: só se aplica à própria VONDER (ver isVonder acima), nunca às demais marcas.
  const DEFAULT_GOALS = { Instagram: { target: 1000000, deadline: '2027-09-30' } };

  // Tudo em UTC: as datas vêm do workflow em UTC e converter para o fuso local deslocaria
  // medições para o dia anterior.
  const parse = value => { const [y,m,d] = String(value).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const iso = date => date.toISOString().slice(0,10);
  const addDays = (date, amount) => { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + amount); return copy; };
  const dayDiff = (from, to) => Math.round((parse(to) - parse(from)) / 86400000);
  const monthEnd = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const shortDate = value => { const d = parse(value); return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`; };
  const monthTag = date => `${MONTHS[date.getUTCMonth()]}/${String(date.getUTCFullYear()).slice(-2)}`;
  // <input type="date"> dispara "change" assim que dia+mês+ano formam uma data válida — e ao
  // digitar o ano dígito a dígito, o primeiro já forma uma data "válida" (ano bem pequeno, tipo
  // 0002), disparando o listener antes do usuário terminar de digitar os outros 3 dígitos.
  const looksLikeTypedYear = isoDate => { const year = Number(isoDate.slice(0, 4)); return year >= 2000 && year <= 2099; };

  const el = id => document.getElementById(id);
  const setText = (id, value) => { const node = el(id); if (node) node.textContent = value; };
  const setTone = (id, value) => { const node = el(id); if (node) node.className = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'; };
  const format = value => Number(value || 0).toLocaleString('pt-BR');
  const signed = value => (value > 0 ? '+' : '') + format(Math.round(value));
  const percent = value => `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`;
  // Seguidor é unidade inteira — "1.299,8/dia" não faz sentido. Toda taxa "por dia" arredonda.
  const rounded = value => format(Math.round(value));
  // Legenda vem direto da Meta — trata como conteúdo não confiável antes de injetar no DOM.
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

  let selectedNetwork = '0';
  let series = [];   // pontos diários fechados, com valor arrastado para a frente
  let goals = Object.assign({}, isVonder ? DEFAULT_GOALS : {}, read(goalsKey, {}));
  let liveSnapshot = null;
  let initialized = false;
  let milestoneMonth = null;  // { year, month } navegado pelo usuário no card "Marcos do mês"
  let postsData = [];        // snapshot mais recente de posts (sem histórico por dia)
  let postsSort = 'likeCount';

  // ---------------------------------------------------------------- dados

  function buildSeries(published, manual) {
    const byDate = new Map();
    const insightsByDate = new Map();
    const put = (date, network, value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) return;
      if (!byDate.has(date)) byDate.set(date, {});
      byDate.get(date)[network] = value;
    };
    ((published && published.history) || []).forEach(entry => {
      if (!entry || !entry.date) return;
      Object.keys(entry.followers || {}).forEach(network => put(entry.date, network, Number(entry.followers[network])));
      if (entry.insights && typeof entry.insights === 'object') insightsByDate.set(entry.date, entry.insights);
    });
    Object.keys(manual || {}).forEach(date => {
      Object.keys(manual[date] || {}).forEach(network => put(date, network, Number(manual[date][network])));
    });

    // Seguidores são um estoque, não um fluxo: entre duas medições vale a última conhecida.
    // 'measured' preserva o que foi de fato medido no dia, para não inventar pontos no gráfico.
    const carried = {};
    return Array.from(byDate.keys()).sort().map(date => {
      const measured = byDate.get(date);
      Object.keys(measured).forEach(network => { carried[network] = measured[network]; });
      return { date, values: Object.assign({}, carried), measured, insights: insightsByDate.get(date) || {} };
    });
  }

  const activeNetworks = () => selectedNetwork === 'all' ? NETWORKS : [NETWORKS[Number(selectedNetwork)]];
  const totalAt = (point, nets) => nets.reduce((sum, network) => sum + (Number.isFinite(point.values[network.name]) ? point.values[network.name] : 0), 0);
  const currentValues = point => {
    const values = Object.assign({}, point.values);
    const instagram = liveSnapshot && liveSnapshot.platforms && liveSnapshot.platforms.Instagram;
    if (instagram && Number.isFinite(Number(instagram.followers))) values.Instagram = Number(instagram.followers);
    return values;
  };

  // Só conta a variação de canais que já tinham valor conhecido no ponto anterior: a
  // primeira medição de um canal é um saldo inicial, não um ganho de seguidores.
  function deltas(points, nets) {
    const out = [];
    for (let index = 1; index < points.length; index++) {
      let total = 0, comparable = false;
      nets.forEach(network => {
        const now = points[index].values[network.name];
        const before = points[index - 1].values[network.name];
        if (Number.isFinite(now) && Number.isFinite(before)) { total += now - before; comparable = true; }
      });
      if (comparable) out.push({ date: points[index].date, delta: total, days: dayDiff(points[index - 1].date, points[index].date) });
    }
    return out;
  }

  const inRange = (points, from, to) => points.filter(point => point.date >= from && point.date <= to);
  const valueOn = (date, nets) => {
    const upTo = series.filter(point => point.date <= date);
    return upTo.length ? totalAt(upTo[upTo.length - 1], nets) : null;
  };

  // ------------------------------------------------------- agrupamento do gráfico

  function bucketOf(date, grain) {
    const d = parse(date);
    if (grain === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}`;
    if (grain === 'week') { const weekday = d.getUTCDay(); return iso(addDays(d, weekday === 0 ? -6 : 1 - weekday)); }
    return date;
  }
  function bucketLabel(key, grain) {
    if (grain === 'month') { const [y,m] = key.split('-').map(Number); return `${MONTHS[m-1]}/${String(y).slice(-2)}`; }
    return grain === 'week' ? shortDate(key) : shortDate(key);
  }
  function aggregate(points, grain) {
    const buckets = new Map();
    points.forEach(point => buckets.set(bucketOf(point.date, grain), point));
    const list = Array.from(buckets.entries()).map(([key, point]) => ({ label: bucketLabel(key, grain), point }));
    return list.slice(-MAX_BUCKETS);
  }

  // ---------------------------------------------------------------- render

  function render() {
    renderMilestones();
    const nets = activeNetworks();
    const from = el('startDate').value, to = el('endDate').value;
    const spanForGrain = from && to ? Math.max(1, dayDiff(from, to)) : Math.max(1, series.length - 1);
    const grain = spanForGrain > 180 ? 'month' : spanForGrain > 60 ? 'week' : 'day';
    const points = (from && to) ? inRange(series, from, to) : series.slice();

    if (!points.length) {
      const message = !isVonder
        ? 'A integração de redes sociais desta marca ainda não foi conectada.'
        : (series.length ? 'Nenhuma medição no período selecionado.' : 'Aguardando a primeira coleta.');
      renderEmpty(message);
      return;
    }

    const last = points[points.length - 1];
    const first = points[0];
    const active = selectedNetwork === 'all' ? null : NETWORKS[Number(selectedNetwork)];
    const useLiveSnapshot = last.date === lastDate();
    const currentPoint = { date: last.date, values: useLiveSnapshot ? currentValues(last) : Object.assign({}, last.values) };
    const current = totalAt(currentPoint, nets);
    const periodDeltas = deltas(points, nets);
    const net = periodDeltas.reduce((sum, item) => sum + item.delta, 0);
    const span = Math.max(1, dayDiff(first.date, last.date));
    const startValue = totalAt(first, nets);
    const rate = startValue ? net / startValue * 100 : 0;
    const perDay = periodDeltas.length ? net / span : null;

    el('totalLabel').textContent = active ? `Seguidores no ${active.name}` : 'Comunidade total';
    setText('total', format(current));
    el('growth').className = 'growth-line';
    el('growth').textContent = periodDeltas.length
      ? `${signed(net)} no período · ${percent(rate)}`
      : 'Primeira medição registrada';
    if (periodDeltas.length) el('growth').className = `growth-line ${net > 0 ? 'positive' : net < 0 ? 'negative' : ''}`.trim();

    setText('growthPeriod', `${shortDate(first.date)} a ${shortDate(last.date)}`);
    setText('newFollowers', periodDeltas.length ? signed(net) : '—');
    setTone('newFollowers', periodDeltas.length ? net : 0);
    setText('avg', perDay === null ? '—' : signed(perDay));
    setTone('avg', perDay || 0);

    const ranked = nets
      .filter(network => Number.isFinite(last.values[network.name]))
      .map(network => ({ network, gain: (last.values[network.name] || 0) - (first.values[network.name] || 0) }))
      .sort((a,b) => b.gain - a.gain);
    setText('bestChannel', ranked.length ? ranked[0].network.name : '—');

    renderGoalRing(currentPoint, nets);
    el('channelContext').innerHTML = active ? `<img src="${active.icon}" alt=""> ${active.name}` : 'Todas';

    renderChart(points, nets, grain);
    renderPlatforms(points, nets, currentPoint);
    renderTable(points, nets, grain);
    renderIndicators(points, nets, periodDeltas, net, rate, perDay, span);
    renderInsights(points);
    renderComparatives(points, nets, periodDeltas);
    renderGoal(currentPoint, current, nets, periodDeltas, perDay);
  }

  function renderChart(points, nets, grain) {
    const buckets = aggregate(points, grain);
    const plotted = nets.filter(network => buckets.some(item => Number.isFinite(item.point.values[network.name])));
    el('legend').innerHTML = plotted.map(network => `<span><i style="background:${network.color}"></i>${network.name}</span>`).join('');
    const values = buckets.flatMap(item => plotted.map(network => item.point.values[network.name]).filter(Number.isFinite));
    const minimum = Math.min(...values), maximum = Math.max(...values);
    const spread = Math.max(1, maximum - minimum);
    const lower = Math.max(0, minimum - spread * .16), upper = maximum + spread * .16;
    const scaleY = value => 252 - ((value - lower) / Math.max(1, upper - lower) * 252);
    const scaleX = index => buckets.length < 2 ? 500 : index / (buckets.length - 1) * 1000;
    el('chartY').innerHTML = [upper, upper - (upper - lower) / 3, upper - (upper - lower) * 2 / 3, lower]
      .map(value => `<span>${value >= 1000 ? (value / 1000).toFixed(1).replace('.', ',') + ' mil' : format(Math.round(value))}</span>`).join('');
    const every = Math.ceil(buckets.length / 12);
    const seriesLines = plotted.map(network => {
      const coordinates = buckets.map((item, index) => {
        const value = item.point.values[network.name];
        return Number.isFinite(value) ? `${scaleX(index).toFixed(1)},${scaleY(value).toFixed(1)}` : null;
      }).filter(Boolean).join(' ');
      return `<polyline class="line-series" points="${coordinates}" stroke="${network.color}"/>`;
    }).join('');
    const dots = plotted.flatMap(network => buckets.map((item, index) => {
      const value = item.point.values[network.name];
      if (!Number.isFinite(value)) return '';
      return `<button type="button" class="line-point" style="left:${scaleX(index) / 10}%;top:${scaleY(value).toFixed(1)}px;background:${network.color}" data-index="${index}" data-network="${network.name}" aria-label="Ver dados de ${network.name} em ${shortDate(item.point.date)}"></button>`;
    })).join('');
    const labels = buckets.map((item, index) => {
      const show = buckets.length <= 12 || index % every === 0 || index === buckets.length - 1;
      return show ? `<span style="left:${scaleX(index) / 10}%">${item.label}</span>` : '';
    }).join('');
    el('bars').className = 'line-chart';
    el('bars').innerHTML = `<svg class="line-chart-svg" viewBox="0 0 1000 252" preserveAspectRatio="none" aria-label="Evolução de seguidores">${seriesLines}</svg>${dots}<div class="line-labels">${labels}</div><div class="chart-tooltip" id="chartTooltip" role="status" hidden></div>`;
    const tooltip = el('chartTooltip');
    const hideTooltip = () => { tooltip.hidden = true; };
    const grainNounLabel = grain === 'month' ? 'no mês' : grain === 'week' ? 'na semana' : 'no dia';
    const showTooltip = (event, point) => {
      const index = Number(point.dataset.index);
      const item = buckets[index];
      const network = plotted.find(entry => entry.name === point.dataset.network);
      const value = item.point.values[network.name];
      // Compara com o bucket anterior (mesmo grão), não com o dia bruto anterior: num
      // agrupamento por mês, "novos no mês" precisa somar o mês inteiro, não só o último dia dele.
      const previousValue = index > 0 ? buckets[index - 1].point.values[network.name] : undefined;
      const change = Number.isFinite(previousValue) ? value - previousValue : null;
      tooltip.innerHTML = `<strong>${network.name} · ${shortDate(item.point.date)}</strong><span>Seguidores: <b>${format(value)}</b></span><span>Novos ${grainNounLabel}: <b class="${change === null ? 'neutral' : change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral'}">${change === null ? '—' : signed(change)}</b></span>`;
      tooltip.hidden = false;
      const rect = el('bars').getBoundingClientRect();
      const pointerX = event.clientX || (rect.left + point.getBoundingClientRect().left - rect.left);
      const pointerY = event.clientY || (point.getBoundingClientRect().top + point.getBoundingClientRect().height / 2);
      tooltip.style.left = `${Math.max(8, Math.min(rect.width - 174, pointerX - rect.left + 12))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(rect.height - 88, pointerY - rect.top - 74))}px`;
    };
    const chart = el('bars');
    chart.addEventListener('pointerleave', hideTooltip);
    chart.querySelectorAll('.line-point').forEach(point => {
      point.addEventListener('pointerenter', event => showTooltip(event, point));
      point.addEventListener('pointermove', event => showTooltip(event, point));
      point.addEventListener('pointerleave', hideTooltip);
      point.addEventListener('focus', event => showTooltip(event, point));
      point.addEventListener('blur', hideTooltip);
    });
    const note = document.querySelector('.chart-card .head p.muted');
    if (note) {
      const grainName = grain === 'month' ? 'mês' : grain === 'week' ? 'semana' : 'dia';
      note.textContent = `Passe o mouse sobre um ponto para ver os dados · por ${grainName}`;
    }
  }
  function renderPlatforms(points, nets, currentPoint) {
    const last = currentPoint || points[points.length - 1];
    const first = points[0];
    const chip = (value, delta, comparable) => comparable
      ? `<strong class="${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}">${signed(delta)}</strong><small>no período</small>`
      : `<strong class="neutral">—</strong>`;
    const allTotal = totalAt(last, NETWORKS);
    const allDelta = allTotal - totalAt(first, NETWORKS);
    const comparableAll = points.length > 1;
    const buttons = NETWORKS.map((network, index) => {
      const value = last.values[network.name];
      const before = first.values[network.name];
      const known = Number.isFinite(value);
      const detail = known ? `${format(value)} seguidores` : (network.connected ? 'Aguardando coleta' : 'Sem API conectada');
      const comparable = known && Number.isFinite(before) && points.length > 1;
      return `<button type="button" class="platform ${String(index) === selectedNetwork ? 'selected' : ''}" data-network="${index}"><img class="platform-logo" src="${network.icon}" alt=""><span class="platform-copy"><strong>${network.name}</strong><small>${detail}</small></span><span class="platform-delta">${chip(value, known ? value - before : 0, comparable)}</span><span class="platform-chevron">›</span></button>`;
    }).concat([`<button type="button" class="platform ${selectedNetwork === 'all' ? 'selected' : ''}" data-network="all"><span class="all-networks-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/></svg></span><span class="platform-copy"><strong>Todas as redes</strong><small>${format(allTotal)} seguidores</small></span><span class="platform-delta">${chip(allTotal, allDelta, comparableAll)}</span><span class="platform-chevron">›</span></button>`]).join('');
    el('platforms').innerHTML = buttons;
    el('platforms').querySelectorAll('[data-network]').forEach(button => button.addEventListener('click', () => {
      selectedNetwork = button.dataset.network;
      render();
    }));
  }
  const HISTORY_PAGE_SIZE = 10;
  let historyPage = 0;
  let historySignature = '';
  function renderTable(points, nets, grain) {
    const buckets = aggregate(points, grain).slice().reverse();
    // Muda o período/agrupamento filtrado (não a passagem do tempo em si) volta pra página 1;
    // um refresh automático com o mesmo filtro não deve chutar o usuário da página que ele está lendo.
    const signature = `${grain}|${points.length ? points[0].date : ''}|${points.length ? points[points.length - 1].date : ''}`;
    if (signature !== historySignature) { historySignature = signature; historyPage = 0; }
    const totalPages = Math.max(1, Math.ceil(buckets.length / HISTORY_PAGE_SIZE));
    historyPage = Math.min(historyPage, totalPages - 1);
    const pageItems = buckets.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);

    el('historyHead').innerHTML = `<th>Período</th>${nets.map(network => `<th>${network.name}</th>`).join('')}<th>Total</th>`;
    el('table').innerHTML = pageItems.map(item => {
      const cells = nets.map(network => {
        const value = item.point.values[network.name];
        return `<td>${Number.isFinite(value) ? format(value) : '—'}</td>`;
      }).join('');
      return `<tr><td>${item.label}</td>${cells}<td><strong>${format(totalAt(item.point, nets))}</strong></td></tr>`;
    }).join('');

    const pager = el('historyPager');
    if (pager) {
      pager.hidden = buckets.length <= HISTORY_PAGE_SIZE;
      setText('historyPageLabel', `Página ${historyPage + 1} de ${totalPages}`);
      const prevBtn = el('historyPrev'), nextBtn = el('historyNext');
      if (prevBtn) prevBtn.disabled = historyPage <= 0;
      if (nextBtn) nextBtn.disabled = historyPage >= totalPages - 1;
    }
  }

  // ----------------------------------------------------------- marcos do mês

  // Marcos fixos do card visual: abertura e fechamento do mês, mais toda sexta-feira
  // entre os dois — são os pontos que o time usa para comparar semana a semana.
  function monthMilestones(year, month) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = monthEnd(start);
    const set = new Set([iso(start), iso(end)]);
    let cursor = new Date(start);
    while (cursor.getUTCDay() !== 5) cursor = addDays(cursor, 1);
    while (cursor <= end) { set.add(iso(cursor)); cursor = addDays(cursor, 7); }
    return Array.from(set).sort();
  }

  // Seguidores são estoque: o valor em um marco é o último medido até aquela data,
  // igual ao resto do painel (ver comentário em buildSeries).
  function valueAtDate(date, networkName) {
    if (liveSnapshot && networkName === 'Instagram' && date === lastDate()) {
      const live = liveSnapshot.platforms && liveSnapshot.platforms.Instagram;
      if (live && Number.isFinite(Number(live.followers))) return Number(live.followers);
    }
    for (let index = series.length - 1; index >= 0; index--) {
      const point = series[index];
      if (point.date <= date && Number.isFinite(point.values[networkName])) return point.values[networkName];
    }
    return null;
  }

  // Distingue "cresceu 0 entre os marcos" de "não houve coleta nessa janela" — meses antigos só
  // têm um número estimado por mês (ver comentário em buildSeries), então o valor do marco é
  // sempre herdado do mês anterior até a próxima medição real, sem refletir a semana em si.
  function hasMeasurementInRange(networkName, fromExclusive, toInclusive) {
    return series.some(point => point.date > fromExclusive && point.date <= toInclusive &&
      point.measured && Number.isFinite(point.measured[networkName]));
  }

  const milestoneDateLabel = value => {
    const d = parse(value);
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  };

  function renderMilestones() {
    const head = el('milestoneHead'), body = el('milestoneBody'), label = el('milestoneMonthLabel'), nextBtn = el('milestoneNext');
    if (!head || !body || !label) return;
    if (!series.length) {
      label.textContent = '—';
      if (nextBtn) nextBtn.disabled = true;
      head.innerHTML = '<th>Rede social</th>';
      const message = !isVonder ? 'A integração de redes sociais desta marca ainda não foi conectada.' : 'Aguardando a primeira coleta.';
      body.innerHTML = `<tr><td style="text-align:center;color:var(--muted);padding:20px">${message}</td></tr>`;
      return;
    }

    const todayIso = lastDate();
    if (!milestoneMonth) {
      const last = parse(todayIso);
      milestoneMonth = { year: last.getUTCFullYear(), month: last.getUTCMonth() };
    }
    const { year, month } = milestoneMonth;
    label.textContent = `${MONTH_NAMES[month]} de ${year}`;
    const lastAvailable = parse(todayIso);
    const atOrAfterCurrentMonth = year > lastAvailable.getUTCFullYear() ||
      (year === lastAvailable.getUTCFullYear() && month >= lastAvailable.getUTCMonth());
    if (nextBtn) nextBtn.disabled = atOrAfterCurrentMonth;

    const dates = monthMilestones(year, month);
    head.innerHTML = `<th>Rede social</th>${dates.map(date => `<th>${milestoneDateLabel(date)}</th>`).join('')}`;

    const toneClass = delta => delta === null ? 'neutral' : delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
    body.innerHTML = NETWORKS.map((network, netIndex) => {
      const values = dates.map(date => date > todayIso ? null : valueAtDate(date, network.name));
      // Sem coleta real dentro da janela (ex.: meses antigos, só um número estimado por mês), o valor
      // do marco é apenas herdado do anterior — mostrar "0" aí sugeriria estagnação em vez de "sem dado".
      const deltasRow = values.map((value, index) => {
        if (index === 0 || value === null || values[index - 1] === null) return null;
        if (!hasMeasurementInRange(network.name, dates[index - 1], dates[index])) return null;
        return value - values[index - 1];
      });
      const known = deltasRow.filter(delta => delta !== null);
      const best = known.length ? Math.max(...known) : null;
      const altClass = netIndex % 2 ? ' alt' : '';
      const deltaCells = deltasRow.map(delta => {
        const isBest = best !== null && delta === best;
        return `<td class="milestone-delta-cell ${toneClass(delta)}${isBest ? ' best-week' : ''}">${delta === null ? '—' : signed(delta)}</td>`;
      }).join('');
      const totalCells = values.map(value => `<td>${value === null ? '—' : format(value)}</td>`).join('');
      return `<tr class="milestone-total-row${altClass}"><td class="milestone-row-label"><span class="milestone-row-label-inner"><img class="milestone-icon" src="${network.icon}" alt="">${network.name}</span></td>${totalCells}</tr>` +
        `<tr class="milestone-delta-row${altClass}"><td class="milestone-row-label"></td>${deltaCells}</tr>`;
    }).join('');
  }

  function shiftMilestoneMonth(delta) {
    if (!milestoneMonth) return;
    let { year, month } = milestoneMonth;
    month += delta;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    milestoneMonth = { year, month };
    renderMilestones();
  }

  // ------------------------------------------------------------ melhores posts

  const postDateLabel = value => {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  };

  function renderPostCard(post, index) {
    const caption = escapeHtml(post.caption).slice(0, 140);
    const thumb = post.thumbnailUrl ? `<img src="${escapeHtml(post.thumbnailUrl)}" alt="" loading="lazy">` : '';
    const stats = POST_SORT_OPTIONS.map(option => {
      const value = post[option.key];
      const known = Number.isFinite(Number(value));
      return `<span class="post-stat${option.key === postsSort ? ' is-primary' : ''}">${postIconSvg(option.key)}<b>${known ? format(Number(value)) : '—'}</b></span>`;
    }).join('');
    return `<a class="post-card" href="${escapeHtml(post.permalink) || '#'}" target="_blank" rel="noopener">
      <div class="post-thumb">${thumb}<span class="post-rank">#${index + 1}</span></div>
      <div class="post-body">
        <p class="post-caption">${caption || '<em>Sem legenda</em>'}</p>
        <span class="post-date">${postDateLabel(post.timestamp)}</span>
        <div class="post-stats">${stats}</div>
      </div>
    </a>`;
  }

  function renderPosts() {
    const grid = el('postsGrid'), summary = el('postsSummary'), sortWrap = el('postsSort');
    if (!grid) return;
    if (!isVonder) {
      if (summary) summary.textContent = 'Esta marca ainda não tem posts conectados.';
      if (sortWrap) sortWrap.hidden = true;
      grid.innerHTML = '';
      return;
    }
    if (sortWrap) sortWrap.hidden = false;
    if (!postsData.length) {
      if (summary) summary.textContent = 'Aguardando a primeira coleta de posts.';
      grid.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:20px 0">Assim que a coleta automática rodar, os posts mais recentes aparecem aqui.</p>';
      return;
    }
    const sorted = postsData.slice().sort((a, b) => (Number(b[postsSort]) || 0) - (Number(a[postsSort]) || 0));
    const activeOption = POST_SORT_OPTIONS.find(option => option.key === postsSort);
    if (summary) summary.textContent = `${sorted.length} posts · ordenado por ${activeOption ? activeOption.label.toLowerCase() : ''}`;
    grid.innerHTML = sorted.slice(0, 12).map((post, index) => renderPostCard(post, index)).join('');
  }

  function protectedPosts() {
    if (!isVonder) return Promise.resolve(null);
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.readPortalStore !== 'function') {
      return Promise.reject(new Error('A conexão segura com os dados ainda não está pronta.'));
    }
    return gateway.readPortalStore(POSTS_STORE_KEY).then(record => record && record.v);
  }

  function loadPosts() {
    return protectedPosts()
      .then(data => { postsData = (data && Array.isArray(data.posts)) ? data.posts : []; renderPosts(); })
      .catch(() => { postsData = []; renderPosts(); });
  }

  // Barras finas divergindo de uma linha de base central — reaproveitado tanto no gráfico
  // grande de "Indicadores do período" quanto nos mini-gráficos de "Insights do Instagram".
  function divergingBarsSvg(values, width, height, minGap) {
    const baselineY = height / 2;
    const maxAbs = Math.max(1, ...values.map(value => Math.abs(value)));
    const barWidth = Math.max(1.5, Math.min(14, width / values.length - minGap));
    const bars = values.map((value, index) => {
      const cx = (index + 0.5) / values.length * width;
      const half = Math.max(1, Math.abs(value) / maxAbs * (baselineY - 4));
      const y = value >= 0 ? baselineY - half : baselineY;
      const cls = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
      return `<rect class="mini-bar ${cls}" data-index="${index}" x="${(cx - barWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${half.toFixed(1)}" rx="${Math.min(2, barWidth / 2).toFixed(1)}"></rect>`;
    }).join('');
    return `<line class="mini-baseline" x1="0" y1="${baselineY}" x2="${width}" y2="${baselineY}"></line>${bars}`;
  }

  // Linha com área preenchida, para séries que só têm valores >= 0 (alcance, novos seguidores...).
  // Usa currentColor: quem chama pinta o tom certo (verde, vermelho, dourado) via style="color:".
  function areaSparklineSvg(values, width, height) {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(1, max - min);
    const stepX = width / (values.length - 1);
    const points = values.map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const linePath = `M${points.join(' L')}`;
    const areaPath = `${linePath} L${width.toFixed(1)},${height} L0,${height} Z`;
    return `<path class="tile-spark-area" d="${areaPath}"></path><path class="tile-spark-line" d="${linePath}"></path>`;
  }

  // Mini-gráfico de um tile: 'bars' pra séries que podem ser negativas (crescimento líquido),
  // 'area' pra séries só-positivas (segue o mesmo dado real do tile, não é decoração).
  // dates/label/unit alimentam o tooltip; sem eles o gráfico fica só visual, sem hover.
  function renderTileSpark(id, values, kind, tone, dates, label, unit) {
    const host = el(id);
    if (!host) return;
    if (!values.length) { host.innerHTML = ''; return; }
    const width = 100, height = 36;
    const chart = kind === 'bars'
      ? `<svg class="mini-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${divergingBarsSvg(values, width, height, 1)}</svg>`
      : (() => { const inner = areaSparklineSvg(values, width, height); return inner ? `<svg class="tile-spark-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" style="color:${tone}">${inner}</svg>` : ''; })();
    host.innerHTML = `${chart}<div class="chart-tooltip tile-spark-tooltip" role="status" hidden></div>`;
    if (!chart || !dates || dates.length !== values.length) return;

    const tooltip = host.querySelector('.tile-spark-tooltip');
    if (!tooltip) return;
    const formatValue = value => unit === 'signed' ? signed(value) : unit === 'percent' ? `${value.toFixed(2).replace('.', ',')}%` : format(Math.round(value));
    const hide = () => { tooltip.hidden = true; };
    const show = event => {
      const rect = host.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const index = Math.round(ratio * (values.length - 1));
      tooltip.innerHTML = `<strong>${shortDate(dates[index])}</strong><span>${label}: <b>${formatValue(values[index])}</b></span>`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(4, Math.min(rect.width - 130, event.clientX - rect.left + 8))}px`;
      tooltip.style.top = '-8px';
    };
    host.addEventListener('pointerenter', show);
    host.addEventListener('pointermove', show);
    host.addEventListener('pointerleave', hide);
  }

  function renderIndicators(points, nets, periodDeltas, net, rate, perDay, span) {
    const needs = days => `Faltam ${days} dia${days === 1 ? '' : 's'}`;
    setText('netGrowth', periodDeltas.length ? signed(net) : '—');
    setTone('netGrowth', periodDeltas.length ? net : 0);
    setText('growthRate', periodDeltas.length ? percent(rate) : '—');
    setTone('growthRate', periodDeltas.length ? rate : 0);
    setText('dailyRate', perDay === null ? '—' : signed(perDay));
    setTone('dailyRate', perDay || 0);

    if (periodDeltas.length) {
      const best = periodDeltas.reduce((top, item) => item.delta > top.delta ? item : top);
      const worst = periodDeltas.reduce((low, item) => item.delta < low.delta ? item : low);
      setText('bestDay', `${signed(best.delta)} · ${shortDate(best.date)}`);
      setTone('bestDay', best.delta);
      setText('worstDay', `${signed(worst.delta)} · ${shortDate(worst.date)}`);
      setTone('worstDay', worst.delta);
    } else {
      setText('bestDay', '—'); setText('worstDay', '—');
    }

    const movingAverage = window => {
      const recent = periodDeltas.slice(-window);
      if (recent.length < window) return null;
      return recent.reduce((sum, item) => sum + item.delta, 0) / window;
    };
    const ma7 = movingAverage(7), ma30 = movingAverage(30);
    setText('ma7', ma7 === null ? needs(7 - periodDeltas.length > 0 ? 7 - periodDeltas.length : 1) : signed(ma7));
    setText('ma30', ma30 === null ? needs(30 - periodDeltas.length > 0 ? 30 - periodDeltas.length : 1) : signed(ma30));
    if (ma7 !== null) setTone('ma7', ma7);
    if (ma30 !== null) setTone('ma30', ma30);

    const last = points[points.length - 1];
    const day = parse(last.date);
    const monthStart = iso(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)));
    const yearStart = iso(new Date(Date.UTC(day.getUTCFullYear(), 0, 1)));
    // sem um ponto de abertura anterior ao último, não há intervalo para acumular:
    // devolver 0 aí passaria a ideia de "não cresceu" em vez de "ainda não dá para saber"
    const accumulated = since => {
      const before = series.filter(point => point.date < since).pop();
      const opening = before || series.find(point => point.date >= since);
      if (!opening || opening.date === last.date) return null;
      return totalAt(last, nets) - totalAt(opening, nets);
    };
    const mtd = accumulated(monthStart), ytd = accumulated(yearStart);
    setText('mtd', mtd === null ? '—' : signed(mtd));
    setTone('mtd', mtd || 0);
    setText('ytd', ytd === null ? '—' : signed(ytd));
    setTone('ytd', ytd || 0);
  }

  const INSIGHT_SPARK_IDS = ['grossFollowsSpark', 'unfollowsSpark', 'insightNetSpark', 'reachSpark', 'followConversionSpark', 'avgFollowsSpark'];
  function renderInsights(points) {
    // Mantém a data junto do insight — o tooltip dos mini-gráficos precisa dizer "em que dia".
    const daily = points
      .map(point => ({ date: point.date, insight: point.insights && point.insights.Instagram }))
      .filter(item => item.insight && Number.isFinite(Number(item.insight.follows)) && Number.isFinite(Number(item.insight.unfollows)));
    const blank = message => {
      ['grossFollows','unfollows','insightNet','reach','followConversion','avgFollows'].forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = 'neutral'; });
      INSIGHT_SPARK_IDS.forEach(id => renderTileSpark(id, [], 'area', null));
      setText('insightsSummary', message);
      setText('insightsPeriod', 'Aguardando');
    };
    if (!daily.length) return blank('Aguardando a importação dos Insights da Meta para os dias fechados.');
    const dateSeries = daily.map(item => item.date);
    const followsSeries = daily.map(item => Number(item.insight.follows));
    const unfollowsSeries = daily.map(item => Number(item.insight.unfollows));
    const netSeries = followsSeries.map((value, index) => value - unfollowsSeries[index]);
    const reachSeries = daily.map(item => Number.isFinite(Number(item.insight.reach)) ? Number(item.insight.reach) : 0);
    const conversionSeries = followsSeries.map((value, index) => reachSeries[index] > 0 ? value / reachSeries[index] * 100 : 0);

    const follows = followsSeries.reduce((sum, value) => sum + value, 0);
    const left = unfollowsSeries.reduce((sum, value) => sum + value, 0);
    const net = follows - left;
    const reachValues = daily.map(item => Number(item.insight.reach)).filter(Number.isFinite);
    const reach = reachValues.reduce((sum, value) => sum + value, 0);
    const conversion = reach ? follows / reach * 100 : null;
    setText('grossFollows', signed(follows)); setTone('grossFollows', follows);
    setText('unfollows', signed(-left)); setTone('unfollows', -left);
    setText('insightNet', signed(net)); setTone('insightNet', net);
    setText('reach', reachValues.length ? format(reach) : '—');
    setText('followConversion', conversion === null ? '—' : `${conversion.toFixed(2).replace('.', ',')}%`);
    setText('avgFollows', `${rounded(follows / daily.length)}/dia`); setTone('avgFollows', follows);
    setText('insightsSummary', `Dados confirmados pela Meta em ${daily.length} dia${daily.length === 1 ? '' : 's'} fechado${daily.length === 1 ? '' : 's'} no período.`);
    setText('insightsPeriod', `${daily.length} dia${daily.length === 1 ? '' : 's'}`);

    renderTileSpark('grossFollowsSpark', followsSeries, 'area', 'var(--success)', dateSeries, 'Novos seguidores', 'count');
    renderTileSpark('unfollowsSpark', unfollowsSeries, 'area', 'var(--danger)', dateSeries, 'Deixaram de seguir', 'count');
    renderTileSpark('insightNetSpark', netSeries, 'bars', null, dateSeries, 'Saldo (Insights)', 'signed');
    renderTileSpark('reachSpark', reachSeries, 'area', 'var(--accent)', dateSeries, 'Alcance', 'count');
    renderTileSpark('followConversionSpark', conversionSeries, 'area', 'var(--accent)', dateSeries, 'Conversão', 'percent');
    renderTileSpark('avgFollowsSpark', followsSeries, 'area', 'var(--success)', dateSeries, 'Novos seguidores', 'count');
  }
  function renderComparatives(points, nets, periodDeltas) {
    const last = points[points.length - 1];
    const compareBack = days => {
      const target = iso(addDays(parse(last.date), -days));
      const before = valueOn(target, nets);
      if (before === null || !series.some(point => point.date <= target)) return null;
      return totalAt(last, nets) - before;
    };
    const show = (id, value) => { setText(id, value === null ? '—' : signed(value)); if (value !== null) setTone(id, value); };
    show('cmpDay', periodDeltas.length ? periodDeltas[periodDeltas.length - 1].delta : null);
    show('cmpWeek', compareBack(7));
    show('cmpMonth', compareBack(30));

    // período anterior de mesmo tamanho, imediatamente antes do início da janela
    const first = points[0];
    const windowDays = Math.max(1, dayDiff(first.date, last.date));
    const previousFrom = iso(addDays(parse(first.date), -windowDays));
    const previousPoints = inRange(series, previousFrom, first.date);
    const previousDeltas = deltas(previousPoints, nets);
    const currentNet = periodDeltas.reduce((sum, item) => sum + item.delta, 0);
    const previousNet = previousDeltas.reduce((sum, item) => sum + item.delta, 0);
    if (!previousDeltas.length || !previousNet) {
      setText('cmpPeriod', '—');
    } else {
      const variation = (currentNet - previousNet) / Math.abs(previousNet) * 100;
      setText('cmpPeriod', percent(variation));
      setTone('cmpPeriod', variation);
    }

    const recent = periodDeltas.slice(-7), earlier = periodDeltas.slice(-14, -7);
    if (recent.length < 7 || earlier.length < 7) {
      setText('cmpAccel', 'Faltam dados de 14 dias');
    } else {
      const now = recent.reduce((sum, item) => sum + item.delta, 0) / 7;
      const before = earlier.reduce((sum, item) => sum + item.delta, 0) / 7;
      const change = now - before;
      setText('cmpAccel', `${signed(change)} por dia`);
      setTone('cmpAccel', change);
    }

    if (periodDeltas.length < 7) {
      setText('cmpWeekday', 'Faltam dados de 7 dias');
    } else {
      const byWeekday = new Map();
      periodDeltas.forEach(item => {
        const weekday = parse(item.date).getUTCDay();
        if (!byWeekday.has(weekday)) byWeekday.set(weekday, []);
        byWeekday.get(weekday).push(item.delta);
      });
      const ranked = Array.from(byWeekday.entries())
        .map(([weekday, list]) => ({ weekday, average: list.reduce((sum, value) => sum + value, 0) / list.length }))
        .sort((a,b) => b.average - a.average);
      setText('cmpWeekday', `${WEEKDAYS[ranked[0].weekday]} · ${signed(ranked[0].average)}`);
      setTone('cmpWeekday', ranked[0].average);
    }
  }

  // Compartilhado pelo anel "Progresso da meta" no topo e pelo card "Meta e projeção" mais
  // abaixo, para que os dois sempre concordem sobre quanto falta e até quando.
  function goalProgressFor(nets, last) {
    const entries = nets.filter(network => goals[network.name] && Number(goals[network.name].target) > 0);
    if (!entries.length) return null;
    const target = entries.reduce((sum, network) => sum + Number(goals[network.name].target), 0);
    const reached = entries.reduce((sum, network) => sum + (Number(last.values[network.name]) || 0), 0);
    const deadline = entries.map(network => goals[network.name].deadline).filter(Boolean).sort()[0];
    return { entries, target, reached, deadline };
  }

  const GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  let goalRingAnimFrame = null;
  let goalRingDisplayedPercent = null; // de onde a próxima animação parte, não o que está cru no DOM

  // Conta do valor atual até o novo, em vez de trocar o número seco — mesma curva do
  // preenchimento do traço (ver transition do .goal-ring-fill), pra sentir como um só movimento.
  function animateGoalRingPercent(percentEl, target) {
    const from = goalRingDisplayedPercent === null ? 0 : goalRingDisplayedPercent;
    if (goalRingAnimFrame) cancelAnimationFrame(goalRingAnimFrame);
    if (from === target) { percentEl.textContent = `${target.toFixed(1).replace('.', ',')}%`; return; }
    const duration = 900;
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      percentEl.textContent = `${value.toFixed(1).replace('.', ',')}%`;
      if (t < 1) { goalRingAnimFrame = requestAnimationFrame(step); }
      else { goalRingDisplayedPercent = target; goalRingAnimFrame = null; }
    };
    goalRingAnimFrame = requestAnimationFrame(step);
  }

  function renderGoalRing(last, nets) {
    const percentEl = el('goalRingPercent'), captionEl = el('goalRingCaption');
    const fill = el('goalRingFill'), deadlinePill = el('goalRingDeadline');
    if (!percentEl || !fill) return;
    const progress = goalProgressFor(nets, last);
    if (!progress) {
      if (goalRingAnimFrame) { cancelAnimationFrame(goalRingAnimFrame); goalRingAnimFrame = null; }
      goalRingDisplayedPercent = null;
      percentEl.textContent = '—';
      captionEl.textContent = 'Nenhuma meta cadastrada para esta seleção.';
      fill.style.strokeDashoffset = `${GOAL_RING_CIRCUMFERENCE}`;
      fill.style.opacity = '0'; // sem isso, a ponta arredondada do traço desenha um pontinho mesmo com 0% de progresso
      if (deadlinePill) deadlinePill.textContent = 'Meta';
      return;
    }
    const percent = progress.target ? progress.reached / progress.target * 100 : 0;
    const clamped = Math.max(0, Math.min(100, percent));
    captionEl.textContent = `${format(progress.reached)} de ${format(progress.target)} seguidores`;
    if (deadlinePill) deadlinePill.textContent = progress.deadline ? progress.deadline.slice(0, 4) : 'Meta';
    const reveal = () => {
      animateGoalRingPercent(percentEl, percent);
      fill.style.strokeDashoffset = `${GOAL_RING_CIRCUMFERENCE * (1 - clamped / 100)}`;
      fill.style.opacity = clamped > 0 ? '1' : '0';
    };
    if (pageVisible) reveal(); else onPageVisible = reveal;
  }

  function renderGoal(last, current, nets, periodDeltas, perDay) {
    const blank = message => {
      setText('goalSummary', message);
      setText('goalStatus', 'Meta');
      ['goalTotal','goalPercent','goalRemaining','goalNeeded','goalPace','goalMonthly','goalEndMonth','goalEndYear','goalProjection']
        .forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = ''; });
    };
    const progress = goalProgressFor(nets, last);
    if (!progress) return blank('Nenhuma meta cadastrada para esta seleção.');
    const { entries, target, reached, deadline } = progress;
    const remaining = target - reached;
    setText('goalSummary', `${entries.map(network => network.name).join(', ')}: ${format(reached)} de ${format(target)}${deadline ? ` até ${deadline.split('-').reverse().join('/')}` : ''}.`);
    setText('goalTotal', format(target));
    setText('goalPercent', `${(reached / target * 100).toFixed(1).replace('.',',')}%`);
    setText('goalRemaining', remaining > 0 ? format(remaining) : 'Meta atingida');

    if (remaining <= 0) {
      setText('goalStatus', 'Atingida');
      ['goalNeeded','goalPace','goalMonthly','goalEndMonth','goalEndYear'].forEach(id => setText(id, '—'));
      setText('goalProjection', 'Concluída');
      return;
    }

    const referenceDate = parse(last.date);
    const daysToDeadline = deadline ? dayDiff(last.date, deadline) : null;
    if (!daysToDeadline || daysToDeadline <= 0) {
      setText('goalNeeded', 'Prazo encerrado');
      ['goalPace','goalMonthly','goalEndMonth','goalEndYear','goalProjection'].forEach(id => setText(id, '—'));
      setText('goalStatus', 'Prazo encerrado');
      return;
    }

    // Todas as projeções usam o último total que aparece no filtro e a média do período selecionado.
    const requiredDaily = remaining / daysToDeadline;
    const pace = perDay;
    setText('goalNeeded', `${rounded(requiredDaily)}/dia`);
    if (pace === null || pace <= 0) {
      setText('goalPace', pace === null ? '—' : `${rounded(pace)}/dia`);
      ['goalMonthly','goalEndMonth','goalEndYear','goalProjection'].forEach(id => setText(id, '—'));
      setText('goalStatus', pace === null ? 'Dados insuficientes' : 'Sem crescimento');
      return;
    }
    setText('goalPace', `${rounded(pace)}/dia`);

    const monthlyNeed = requiredDaily * 30.44;
    const monthlyPace = pace * 30.44;
    setText('goalMonthly', `${signed(monthlyPace)} de ${signed(monthlyNeed)}`);
    setTone('goalMonthly', monthlyPace - monthlyNeed);

    const daysLeftInMonth = dayDiff(last.date, iso(monthEnd(referenceDate)));
    const daysLeftInYear = dayDiff(last.date, `${referenceDate.getUTCFullYear()}-12-31`);
    setText('goalEndMonth', format(Math.round(current + pace * Math.max(0, daysLeftInMonth))));
    setText('goalEndYear', format(Math.round(current + pace * Math.max(0, daysLeftInYear))));

    const eta = addDays(referenceDate, Math.ceil(remaining / pace));
    setText('goalProjection', `${String(eta.getUTCDate()).padStart(2,'0')}/${String(eta.getUTCMonth()+1).padStart(2,'0')}/${eta.getUTCFullYear()}`);
    setText('goalStatus', eta <= parse(deadline) ? 'No ritmo' : 'Atrasada');
  }

  function renderEmpty(message) {
    setText('totalLabel', 'Comunidade total');
    setText('total', '—');
    el('growth').className = 'growth-line';
    setText('growth', message);
    ['newFollowers','avg','bestChannel'].forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = 'neutral'; });
    setText('growthPeriod', '—');
    renderGoalRing({ values:{} }, activeNetworks());
    el('channelContext').textContent = 'Todas';
    el('legend').innerHTML = '';
    el('chartY').innerHTML = '';
    el('bars').innerHTML = `<p class="muted" style="margin:auto;text-align:center;max-width:340px">${message}<br>O Instagram é coletado automaticamente uma vez por dia; os demais canais podem ser lançados em "Registrar número".</p>`;
    el('platforms').innerHTML = NETWORKS.map(network => `<div class="platform" style="cursor:default"><img class="platform-logo" src="${network.icon}" alt=""><span class="platform-copy"><strong>${network.name}</strong><small>${network.connected ? 'Aguardando coleta' : 'Sem API conectada'}</small></span><span class="platform-delta"><strong class="neutral">—</strong></span></div>`).join('');
    el('table').innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted)">${message}</td></tr>`;
    const pager = el('historyPager'); if (pager) pager.hidden = true;
    INSIGHT_SPARK_IDS.forEach(id => renderTileSpark(id, [], 'area', null));
    ['netGrowth','growthRate','dailyRate','bestDay','worstDay','ma7','ma30','mtd','ytd','cmpDay','cmpWeek','cmpMonth','cmpPeriod','cmpAccel','cmpWeekday','grossFollows','unfollows','insightNet','reach','followConversion','avgFollows']
      .forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = ''; });
    renderGoal({ values:{} }, 0, activeNetworks(), [], null);
  }

  // ---------------------------------------------------------------- controles

  function resetRange() {
    if (!series.length) { el('startDate').value = ''; el('endDate').value = ''; return; }
    periodPreset = '30'; periodOffset = 0;
    applyPreset('30', false);
  }
  function setRange(from, to, shouldRender = true) {
    el('startDate').value = from;
    el('endDate').min = from;
    el('endDate').value = to;
    if (shouldRender) render();
  }
  const lastDate = () => series.length ? series[series.length - 1].date : iso(new Date());
  const labels = { '7':'Últimos 7 dias', '15':'Últimos 15 dias', '30':'Últimos 30 dias', month:'Este mês', year:'Este ano', all:'Desde o início', custom:'Personalizado' };
  const periodMenu = el('periodMenu'), periodTrigger = el('periodTrigger'), customRange = el('customRange');
  const actionsMenu = el('actionsMenu'), actionsTrigger = el('actionsTrigger');
  const periodPrevBtn = el('periodPrev'), periodNextBtn = el('periodNext');
  let periodPreset = '30', periodOffset = 0;
  const closeMenus = () => {
    periodMenu.hidden = true; periodTrigger.setAttribute('aria-expanded', 'false');
    actionsMenu.hidden = true; actionsTrigger.setAttribute('aria-expanded', 'false');
  };
  const openPeriod = () => { actionsMenu.hidden = true; actionsTrigger.setAttribute('aria-expanded', 'false'); periodMenu.hidden = false; periodTrigger.setAttribute('aria-expanded', 'true'); };

  // "all" (todo o histórico) e "custom" (já é datas livres) não têm uma unidade natural
  // para deslocar — só os presets de janela fixa (dias/mês/ano) ganham as setas.
  const isShiftable = range => /^\d+$/.test(range) || range === 'month' || range === 'year';
  function computeWindow(range, offset) {
    const end = lastDate();
    if (/^\d+$/.test(range)) {
      const size = Number(range);
      let to = offset === 0 ? end : iso(addDays(parse(end), offset * size));
      if (to > end) to = end;
      return { from: iso(addDays(parse(to), -(size - 1))), to };
    }
    if (range === 'month') {
      const day = parse(end);
      const target = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + offset, 1));
      const from = iso(target);
      const natural = iso(monthEnd(target));
      return { from, to: natural > end ? end : natural };
    }
    if (range === 'year') {
      const targetYear = parse(end).getUTCFullYear() + offset;
      const from = `${targetYear}-01-01`, natural = `${targetYear}-12-31`;
      return { from, to: natural > end ? end : natural };
    }
    if (range === 'all') return { from: series.length ? series[0].date : end, to: end };
    return { from: end, to: end };
  }
  function buildLabel(range, from, to) {
    if (/^\d+$/.test(range)) return `${labels[range]} · ${shortDate(from)} a ${shortDate(to)}`;
    if (range === 'month') { const d = parse(from); return `${labels.month} · ${MONTH_NAMES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`; }
    if (range === 'year') return `${labels.year} · ${parse(from).getUTCFullYear()}`;
    if (range === 'all') return `${labels.all} · ${shortDate(from)} a ${shortDate(to)}`;
    return labels[range];
  }
  const applyPreset = (range, shouldRender = true, offset = 0) => {
    periodPreset = range;
    periodOffset = offset;
    const { from, to } = computeWindow(range, offset);
    setRange(from, to, shouldRender);
    setText('periodLabel', buildLabel(range, from, to));
    customRange.hidden = true;
    document.querySelectorAll('[data-range]').forEach(button => button.classList.toggle('is-active', button.dataset.range === range));
    const canShift = isShiftable(range) && series.length > 0;
    if (periodPrevBtn) periodPrevBtn.disabled = !canShift;
    if (periodNextBtn) periodNextBtn.disabled = !canShift || offset >= 0;
  };
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
    const range = button.dataset.range;
    if (range === 'custom') {
      periodPreset = 'custom'; periodOffset = 0;
      customRange.hidden = false;
      setText('periodLabel', labels.custom);
      document.querySelectorAll('[data-range]').forEach(item => item.classList.toggle('is-active', item === button));
      el('startDate').value = '';
      el('endDate').value = '';
      el('endDate').disabled = true;
      el('endDate').removeAttribute('min');
      if (periodPrevBtn) periodPrevBtn.disabled = true;
      if (periodNextBtn) periodNextBtn.disabled = true;
      el('startDate').focus();
      return;
    }
    applyPreset(range, true, 0);
    closeMenus();
  }));
  if (periodPrevBtn) periodPrevBtn.addEventListener('click', () => applyPreset(periodPreset, true, periodOffset - 1));
  if (periodNextBtn) periodNextBtn.addEventListener('click', () => applyPreset(periodPreset, true, periodOffset + 1));
  periodTrigger.addEventListener('click', () => periodMenu.hidden ? openPeriod() : closeMenus());
  actionsTrigger.addEventListener('click', () => {
    const opening = actionsMenu.hidden;
    closeMenus();
    if (opening) { actionsMenu.hidden = false; actionsTrigger.setAttribute('aria-expanded', 'true'); }
  });
  document.addEventListener('click', event => { if (!el('periodControl').contains(event.target) && !el('actionsControl').contains(event.target)) closeMenus(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenus(); });
  const milestonePrevBtn = el('milestonePrev'), milestoneNextBtn = el('milestoneNext');
  if (milestonePrevBtn) milestonePrevBtn.addEventListener('click', () => shiftMilestoneMonth(-1));
  if (milestoneNextBtn) milestoneNextBtn.addEventListener('click', () => shiftMilestoneMonth(1));
  const postsSortWrap = el('postsSort');
  if (postsSortWrap) {
    postsSortWrap.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
      postsSort = button.dataset.sort;
      postsSortWrap.querySelectorAll('[data-sort]').forEach(item => item.classList.toggle('is-active', item === button));
      renderPosts();
    }));
  }
  renderPosts(); // estado inicial ("aguardando...") enquanto loadPosts() ainda não resolveu
  const historyToggle = el('historyToggle'), historyBody = el('historyBody');
  if (historyToggle && historyBody) {
    historyToggle.addEventListener('click', () => {
      const expanded = historyToggle.getAttribute('aria-expanded') === 'true';
      historyToggle.setAttribute('aria-expanded', String(!expanded));
      historyBody.hidden = expanded;
    });
  }
  const historyPrevBtn = el('historyPrev'), historyNextBtn = el('historyNext');
  if (historyPrevBtn) historyPrevBtn.addEventListener('click', () => { if (historyPage > 0) { historyPage--; render(); } });
  if (historyNextBtn) historyNextBtn.addEventListener('click', () => { historyPage++; render(); });
  el('startDate').addEventListener('change', () => {
    const start = el('startDate').value;
    if (!start || !looksLikeTypedYear(start)) return;
    el('endDate').min = start;
    if (el('endDate').value && el('endDate').value < start) el('endDate').value = '';
    el('endDate').disabled = false;
    el('endDate').focus();
  });
  el('endDate').addEventListener('change', () => {
    const start = el('startDate').value, end = el('endDate').value;
    if (!start || !end || !looksLikeTypedYear(end) || end < start) return;
    setText('periodLabel', `${shortDate(start)} a ${shortDate(end)}`);
    closeMenus();
    render();
  });

  // ---------------------------------------------------------------- explicação do workflow

  const workflowInfo = el('workflowInfoBackdrop');
  const workflowTrigger = el('workflowInfoTrigger');
  let workflowLastFocus = null;
  const closeWorkflowInfo = () => {
    if (!workflowInfo) return;
    workflowInfo.style.display = 'none';
    workflowInfo.setAttribute('aria-hidden', 'true');
    if (workflowLastFocus) workflowLastFocus.focus();
  };
  const openWorkflowInfo = () => {
    if (!workflowInfo) return;
    workflowLastFocus = document.activeElement;
    workflowInfo.style.display = 'flex';
    workflowInfo.setAttribute('aria-hidden', 'false');
    el('workflowInfoClose').focus();
  };
  if (workflowTrigger) workflowTrigger.addEventListener('click', openWorkflowInfo);
  if (workflowInfo) workflowInfo.addEventListener('click', event => { if (event.target === workflowInfo) closeWorkflowInfo(); });
  ['workflowInfoClose', 'workflowInfoDone'].forEach(id => { const button = el(id); if (button) button.addEventListener('click', closeWorkflowInfo); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && workflowInfo && workflowInfo.style.display === 'flex') closeWorkflowInfo(); });

  el('addGoal').addEventListener('click', () => {
    const answer = prompt('Rede social para a meta (Instagram, Facebook, YouTube ou TikTok):');
    if (!answer) return;
    const network = NETWORKS.find(item => item.name.toLowerCase() === answer.trim().toLowerCase());
    if (!network) return alert('Rede não encontrada.');
    const target = Number(prompt(`Meta total de seguidores para ${network.name}:`));
    if (!Number.isFinite(target) || target <= 0) return;
    const deadline = prompt('Data limite (AAAA-MM-DD):');
    if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline.trim())) return alert('Data inválida. Use o formato AAAA-MM-DD.');
    goals[network.name] = { target, deadline: deadline.trim() };
    write(goalsKey, goals);
    render();
  });

  el('addMeasurement').addEventListener('click', () => {
    const answer = prompt('Rede social: Instagram, Facebook, YouTube ou TikTok');
    if (!answer) return;
    const network = NETWORKS.find(item => item.name.toLowerCase() === answer.trim().toLowerCase());
    if (!network) return alert('Rede não encontrada.');
    const value = Number(prompt(`Total de seguidores para ${network.name}:`));
    if (!Number.isFinite(value) || value < 0) return;
    const when = prompt('Data da medição (AAAA-MM-DD):', iso(new Date()));
    if (!when || !/^\d{4}-\d{2}-\d{2}$/.test(when.trim())) return alert('Data inválida. Use o formato AAAA-MM-DD.');
    const manual = read(manualKey, {});
    manual[when.trim()] = Object.assign({}, manual[when.trim()], { [network.name]: value });
    write(manualKey, manual);
    load();
  });

  // ---------------------------------------------------------------- carga

  function protectedFollowers() {
    if (!isVonder) return Promise.resolve({ published: null, live: null });
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.readPortalStore !== 'function') {
      return Promise.reject(new Error('A conexão segura com os dados ainda não está pronta.'));
    }
    return gateway.readPortalStore(FOLLOWERS_STORE_KEY).then(record => {
      const payload = record && record.v;
      if (!payload || !payload.published) {
        throw new Error('Os dados de seguidores ainda não foram migrados para a área protegida.');
      }
      return { published: payload.published, live: payload.live || null };
    });
  }

  function load() {
    const manual = read(manualKey, {});
    // Fora da VONDER não há coleta própria: nunca busca dados de outra marca.
    return protectedFollowers()
      .then(({ published, live }) => {
        series = buildSeries(published, manual);
        liveSnapshot = live;
        refreshSubtitle(published, live);
        if (!initialized) { resetRange(); initialized = true; }
        render();
      })
      .catch(error => {
        const status = el('dataStatus');
        if (status) status.textContent = error.message || 'Não foi possível carregar os dados protegidos.';
        series = buildSeries(null, manual);
        liveSnapshot = null;
        if (!initialized) { resetRange(); initialized = true; }
        render();
      });
  }

  function refreshSubtitle(published, live) {
    const subtitle = document.querySelector('.page-subtitle');
    if (!subtitle) return;
    subtitle.textContent = `Acompanhe a evolução da comunidade da ${brand.name || 'marca'} em cada canal.`;
    const status = el('dataStatus');
    if (!status) return;
    if (!isVonder) {
      status.textContent = 'Esta marca ainda não tem uma rede social conectada. Os números e metas de outras marcas nunca aparecem aqui.';
      return;
    }
    const stamp = live && live.updatedAt ? new Date(live.updatedAt) : null;
    if (!stamp || isNaN(stamp)) {
      status.textContent = 'Histórico diário fechado · aguardando o primeiro snapshot ao vivo da Meta.';
      return;
    }
    const minutes = Math.max(0, Math.round((Date.now() - stamp.getTime()) / 60000));
    const relative = minutes < 1 ? 'agora mesmo' : minutes === 1 ? 'há 1 min' : `há ${minutes} min`;
    status.textContent = `Snapshot atual da Meta: ${relative} (${stamp.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}) · histórico e métricas usam dias fechados.`;
  }

  // auth-guard.js é um módulo adiado: ele só define window.PortalFirebase depois que este
  // script (clássico, executado durante o parsing) já rodou. Por isso aguardamos o aviso
  // disparado ao final de firebase-client.js antes de tentar ler a área protegida.
  const loadAll = () => { load(); loadPosts(); };
  if (!isVonder || window.PortalFirebase) loadAll();
  else window.addEventListener('portal-firebase-ready', loadAll, { once: true });
  window.setInterval(loadAll, AUTO_REFRESH_MS);
})();
