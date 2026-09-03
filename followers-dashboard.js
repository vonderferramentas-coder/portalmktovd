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
  const AUTO_REFRESH_MS = 60000;
  const MAX_BUCKETS = 60;

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

  const el = id => document.getElementById(id);
  const setText = (id, value) => { const node = el(id); if (node) node.textContent = value; };
  const setTone = (id, value) => { const node = el(id); if (node) node.className = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'; };
  const format = value => Number(value || 0).toLocaleString('pt-BR');
  const signed = value => (value > 0 ? '+' : '') + format(Math.round(value));
  const percent = value => `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`;
  const decimal = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  let selectedNetwork = '0';
  let series = [];   // pontos diários fechados, com valor arrastado para a frente
  let goals = Object.assign({}, isVonder ? DEFAULT_GOALS : {}, read(goalsKey, {}));
  let liveSnapshot = null;
  let initialized = false;

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
    setText('scorePeriod', `${points.length} ${points.length === 1 ? 'dia' : 'dias'}`);
    setText('newFollowers', periodDeltas.length ? signed(net) : '—');
    setTone('newFollowers', periodDeltas.length ? net : 0);
    setText('avg', perDay === null ? '—' : signed(perDay));
    setTone('avg', perDay || 0);

    const ranked = nets
      .filter(network => Number.isFinite(last.values[network.name]))
      .map(network => ({ network, gain: (last.values[network.name] || 0) - (first.values[network.name] || 0) }))
      .sort((a,b) => b.gain - a.gain);
    setText('bestChannel', ranked.length ? ranked[0].network.name : '—');

    const score = Math.max(0, Math.min(100, Math.round(rate * 14)));
    setText('scoreValue', periodDeltas.length ? `${score}%` : '—');
    setText('scoreCaption', !periodDeltas.length
      ? 'É preciso mais de uma medição para calcular o ritmo.'
      : score >= 70 ? 'Crescimento forte no período'
      : score >= 30 ? 'Crescimento moderado no período'
      : net > 0 ? 'Crescimento discreto no período' : 'Sem crescimento no período');
    el('scoreBar').style.width = periodDeltas.length ? `${score}%` : '0%';
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
    const showTooltip = (event, point) => {
      const item = buckets[Number(point.dataset.index)];
      const network = plotted.find(entry => entry.name === point.dataset.network);
      const value = item.point.values[network.name];
      const previous = series.filter(entry => entry.date < item.point.date).pop();
      const daily = previous && Number.isFinite(previous.values[network.name]) ? value - previous.values[network.name] : null;
      tooltip.innerHTML = `<strong>${network.name} · ${shortDate(item.point.date)}</strong><span>Seguidores: <b>${format(value)}</b></span><span>Novos no dia: <b class="${daily === null ? 'neutral' : daily > 0 ? 'positive' : daily < 0 ? 'negative' : 'neutral'}">${daily === null ? '—' : signed(daily)}</b></span>`;
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
  function renderTable(points, nets, grain) {
    const buckets = aggregate(points, grain).slice().reverse();
    document.querySelector('thead tr').innerHTML = `<th>Período</th>${nets.map(network => `<th>${network.name}</th>`).join('')}<th>Total</th>`;
    el('table').innerHTML = buckets.map(item => {
      const cells = nets.map(network => {
        const value = item.point.values[network.name];
        return `<td>${Number.isFinite(value) ? format(value) : '—'}</td>`;
      }).join('');
      return `<tr><td>${item.label}</td>${cells}<td><strong>${format(totalAt(item.point, nets))}</strong></td></tr>`;
    }).join('');
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

  function renderInsights(points) {
    const daily = points.map(point => point.insights && point.insights.Instagram).filter(insight => insight && Number.isFinite(Number(insight.follows)) && Number.isFinite(Number(insight.unfollows)));
    const blank = message => {
      ['grossFollows','unfollows','insightNet','reach','followConversion','avgFollows'].forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = 'neutral'; });
      setText('insightsSummary', message);
      setText('insightsPeriod', 'Aguardando');
    };
    if (!daily.length) return blank('Aguardando a importação dos Insights da Meta para os dias fechados.');
    const follows = daily.reduce((sum, item) => sum + Number(item.follows), 0);
    const left = daily.reduce((sum, item) => sum + Number(item.unfollows), 0);
    const net = follows - left;
    const reachValues = daily.map(item => Number(item.reach)).filter(Number.isFinite);
    const reach = reachValues.reduce((sum, value) => sum + value, 0);
    const conversion = reach ? follows / reach * 100 : null;
    setText('grossFollows', signed(follows)); setTone('grossFollows', follows);
    setText('unfollows', signed(-left)); setTone('unfollows', -left);
    setText('insightNet', signed(net)); setTone('insightNet', net);
    setText('reach', reachValues.length ? format(reach) : '—');
    setText('followConversion', conversion === null ? '—' : `${conversion.toFixed(2).replace('.', ',')}%`);
    setText('avgFollows', `${decimal(follows / daily.length)}/dia`); setTone('avgFollows', follows);
    setText('insightsSummary', `Dados confirmados pela Meta em ${daily.length} dia${daily.length === 1 ? '' : 's'} fechado${daily.length === 1 ? '' : 's'} no período.`);
    setText('insightsPeriod', `${daily.length} dia${daily.length === 1 ? '' : 's'}`);
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

  function renderGoal(last, current, nets, periodDeltas, perDay) {
    const blank = message => {
      setText('goalSummary', message);
      setText('goalStatus', 'Meta');
      ['goalTotal','goalPercent','goalRemaining','goalNeeded','goalPace','goalMonthly','goalEndMonth','goalEndYear','goalProjection']
        .forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = ''; });
    };
    const entries = nets.filter(network => goals[network.name] && Number(goals[network.name].target) > 0);
    if (!entries.length) return blank('Nenhuma meta cadastrada para esta seleção.');

    const target = entries.reduce((sum, network) => sum + Number(goals[network.name].target), 0);
    const reached = entries.reduce((sum, network) => sum + (Number(last.values[network.name]) || 0), 0);
    const remaining = target - reached;
    const deadline = entries.map(network => goals[network.name].deadline).filter(Boolean).sort()[0];
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
    setText('goalNeeded', `${decimal(requiredDaily)}/dia`);
    if (pace === null || pace <= 0) {
      setText('goalPace', pace === null ? '—' : `${decimal(pace)}/dia`);
      ['goalMonthly','goalEndMonth','goalEndYear','goalProjection'].forEach(id => setText(id, '—'));
      setText('goalStatus', pace === null ? 'Dados insuficientes' : 'Sem crescimento');
      return;
    }
    setText('goalPace', `${decimal(pace)}/dia`);

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
    setText('scorePeriod', '—');
    setText('scoreValue', '—');
    setText('scoreCaption', 'É preciso mais de uma medição para calcular o ritmo.');
    el('scoreBar').style.width = '0%';
    el('channelContext').textContent = 'Todas';
    el('legend').innerHTML = '';
    el('chartY').innerHTML = '';
    el('bars').innerHTML = `<p class="muted" style="margin:auto;text-align:center;max-width:340px">${message}<br>O Instagram é coletado automaticamente uma vez por dia; os demais canais podem ser lançados em "Registrar número".</p>`;
    el('platforms').innerHTML = NETWORKS.map(network => `<div class="platform" style="cursor:default"><img class="platform-logo" src="${network.icon}" alt=""><span class="platform-copy"><strong>${network.name}</strong><small>${network.connected ? 'Aguardando coleta' : 'Sem API conectada'}</small></span><span class="platform-delta"><strong class="neutral">—</strong></span></div>`).join('');
    el('table').innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted)">${message}</td></tr>`;
    ['netGrowth','growthRate','dailyRate','bestDay','worstDay','ma7','ma30','mtd','ytd','cmpDay','cmpWeek','cmpMonth','cmpPeriod','cmpAccel','cmpWeekday','grossFollows','unfollows','insightNet','reach','followConversion','avgFollows']
      .forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = ''; });
    renderGoal({ values:{} }, 0, activeNetworks(), [], null);
  }

  // ---------------------------------------------------------------- controles

  function resetRange() {
    if (!series.length) { el('startDate').value = ''; el('endDate').value = ''; return; }
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
  const closeMenus = () => {
    periodMenu.hidden = true; periodTrigger.setAttribute('aria-expanded', 'false');
    actionsMenu.hidden = true; actionsTrigger.setAttribute('aria-expanded', 'false');
  };
  const openPeriod = () => { actionsMenu.hidden = true; actionsTrigger.setAttribute('aria-expanded', 'false'); periodMenu.hidden = false; periodTrigger.setAttribute('aria-expanded', 'true'); };
  const applyPreset = (range, shouldRender = true) => {
    const end = lastDate(); let from = end;
    if (/^\d+$/.test(range)) from = iso(addDays(parse(end), -(Number(range) - 1)));
    if (range === 'month') { const day = parse(end); from = iso(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))); }
    if (range === 'year') { const day = parse(end); from = `${day.getUTCFullYear()}-01-01`; }
    if (range === 'all') { from = series.length ? series[0].date : end; }
    setRange(from, end, shouldRender);
    const label = /^\d+$/.test(range)
      ? `${labels[range]} · ${shortDate(from)} a ${shortDate(end)}`
      : range === 'month' ? `${labels.month} · ${MONTH_NAMES[parse(end).getUTCMonth()]}`
      : range === 'year' ? `${labels.year} · ${parse(end).getUTCFullYear()}`
      : range === 'all' ? `${labels.all} · ${shortDate(from)} a ${shortDate(end)}`
      : labels[range];
    setText('periodLabel', label);
    customRange.hidden = true;
    document.querySelectorAll('[data-range]').forEach(button => button.classList.toggle('is-active', button.dataset.range === range));
  };
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
    const range = button.dataset.range;
    if (range === 'custom') {
      customRange.hidden = false;
      setText('periodLabel', labels.custom);
      document.querySelectorAll('[data-range]').forEach(item => item.classList.toggle('is-active', item === button));
      el('startDate').value = '';
      el('endDate').value = '';
      el('endDate').disabled = true;
      el('endDate').removeAttribute('min');
      el('startDate').focus();
      return;
    }
    applyPreset(range);
    closeMenus();
  }));
  periodTrigger.addEventListener('click', () => periodMenu.hidden ? openPeriod() : closeMenus());
  actionsTrigger.addEventListener('click', () => {
    const opening = actionsMenu.hidden;
    closeMenus();
    if (opening) { actionsMenu.hidden = false; actionsTrigger.setAttribute('aria-expanded', 'true'); }
  });
  document.addEventListener('click', event => { if (!el('periodControl').contains(event.target) && !el('actionsControl').contains(event.target)) closeMenus(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenus(); });
  el('startDate').addEventListener('change', () => {
    const start = el('startDate').value;
    if (!start) return;
    el('endDate').min = start;
    if (el('endDate').value && el('endDate').value < start) el('endDate').value = '';
    el('endDate').disabled = false;
    el('endDate').focus();
  });
  el('endDate').addEventListener('change', () => {
    const start = el('startDate').value, end = el('endDate').value;
    if (!start || !end || end < start) return;
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
  if (!isVonder || window.PortalFirebase) load();
  else window.addEventListener('portal-firebase-ready', load, { once: true });
  window.setInterval(load, AUTO_REFRESH_MS);
})();
