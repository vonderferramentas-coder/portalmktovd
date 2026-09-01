(() => {
  'use strict';

  // O painel lê a série diária publicada pelo workflow (data/social-followers.json) e a
  // combina com números lançados à mão. O dado da API nunca é gravado no navegador: ele
  // é relido a cada carga, para que a página nunca mostre uma cópia velha do que a Meta
  // já corrigiu — foi exatamente esse tipo de cópia que fez a série de exemplo sobreviver
  // à sua remoção do código.

  const brand = (window.PortalBrand && (window.PortalBrand.list || []).find(item => item.id === window.PortalBrand.activeId)) || {};
  const brandKey = brand.id || 'default';
  const SOURCE = 'data/social-followers.json';
  const LIVE_SOURCE = 'data/social-followers-live.json';
  const AUTO_REFRESH_MS = 60000;
  const MAX_BUCKETS = 60;

  ['social_followers_', 'social_followers_goals_', 'social_followers_v2_', 'social_followers_goals_v2_']
    .forEach(prefix => { try { localStorage.removeItem(prefix + brandKey); } catch (error) { /* sem storage */ } });

  const manualKey = 'social_followers_manual_v3_' + brandKey;
  const goalsKey = 'social_followers_goals_v3_' + brandKey;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (error) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* sem storage */ } };

  const NETWORKS = [
    { name:'Instagram', color:'#E94683', icon:'icons/instagram.svg', connected:true },
    { name:'Facebook',  color:'#287BE0', icon:'icons/facebook.svg',  connected:false },
    { name:'YouTube',   color:'#F04444', icon:'icons/youtube.svg',   connected:false },
    { name:'TikTok',    color:'#111827', icon:'icons/tiktok.svg',    connected:false }
  ];
  const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const WEEKDAYS = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

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

  let selectedNetwork = 'all';
  let series = [];   // pontos diários fechados, com valor arrastado para a frente
  let goals = read(goalsKey, {});
  let liveSnapshot = null;
  let initialized = false;

  // ---------------------------------------------------------------- dados

  function buildSeries(published, manual) {
    const byDate = new Map();
    const put = (date, network, value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) return;
      if (!byDate.has(date)) byDate.set(date, {});
      byDate.get(date)[network] = value;
    };
    ((published && published.history) || []).forEach(entry => {
      if (!entry || !entry.date) return;
      Object.keys(entry.followers || {}).forEach(network => put(entry.date, network, Number(entry.followers[network])));
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
      return { date, values: Object.assign({}, carried), measured };
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
    const grain = el('grain').value;
    const from = el('startDate').value, to = el('endDate').value;
    const points = (from && to) ? inRange(series, from, to) : series.slice();

    if (!points.length) {
      renderEmpty(series.length ? 'Nenhuma medição no período selecionado.' : 'Aguardando a primeira coleta.');
      return;
    }

    const last = points[points.length - 1];
    const first = points[0];
    const active = selectedNetwork === 'all' ? null : NETWORKS[Number(selectedNetwork)];
    const currentPoint = { values: currentValues(last) };
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
    renderComparatives(points, nets, periodDeltas);
    renderGoal(currentPoint, current, nets, periodDeltas, perDay);
  }

  function renderChart(points, nets, grain) {
    const buckets = aggregate(points, grain);
    const plotted = nets.filter(network => buckets.some(item => Number.isFinite(item.point.values[network.name])));
    el('legend').innerHTML = plotted.map(network => `<span><i style="background:${network.color}"></i>${network.name}</span>`).join('');
    const values = buckets.flatMap(item => plotted.map(network => item.point.values[network.name] || 0));
    const max = Math.max(1, ...values);
    el('chartY').innerHTML = [max, max * .66, max * .33, 0]
      .map(value => `<span>${value >= 1000 ? Math.round(value/1000) + ' mil' : format(Math.round(value))}</span>`).join('');
    // com muitos pontos os rótulos não cabem lado a lado: mostra um a cada N e aperta o
    // espaçamento, em vez de deixar o gráfico transbordar para fora do card
    const every = Math.ceil(buckets.length / 12);
    el('bars').className = buckets.length > 20 ? 'bars dense' : 'bars';
    el('bars').innerHTML = buckets.map((item, index) => {
      const stack = plotted
        .filter(network => Number.isFinite(item.point.values[network.name]) && item.point.values[network.name] > 0)
        .map(network => `<i title="${network.name}: ${format(item.point.values[network.name])}" style="background:${network.color};height:${Math.max(1, item.point.values[network.name] / max * 100)}%"></i>`)
        .join('');
      const showLabel = buckets.length <= 12 || index % every === 0 || index === buckets.length - 1;
      return `<div class="m" title="${item.label}"><div class="st">${stack}</div><small>${showLabel ? item.label : ''}</small></div>`;
    }).join('');
    const note = document.querySelector('.chart-card .head p.muted');
    if (note) {
      const grainName = grain === 'month' ? 'mês' : grain === 'week' ? 'semana' : 'dia';
      note.textContent = `Por ${grainName}${points.length > MAX_BUCKETS && grain === 'day' ? ` · últimos ${MAX_BUCKETS} pontos` : ''}`;
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
    const buttons = [`<button type="button" class="platform ${selectedNetwork === 'all' ? 'selected' : ''}" data-network="all"><span class="all-networks-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/></svg></span><span class="platform-copy"><strong>Todas as redes</strong><small>${format(allTotal)} seguidores</small></span><span class="platform-delta">${chip(allTotal, allDelta, comparableAll)}</span><span class="platform-chevron">›</span></button>`]
      .concat(NETWORKS.map((network, index) => {
        const value = last.values[network.name];
        const before = first.values[network.name];
        const known = Number.isFinite(value);
        const detail = known ? `${format(value)} seguidores` : (network.connected ? 'Aguardando coleta' : 'Sem API conectada');
        const comparable = known && Number.isFinite(before) && points.length > 1;
        return `<button type="button" class="platform ${String(index) === selectedNetwork ? 'selected' : ''}" data-network="${index}"><img class="platform-logo" src="${network.icon}" alt=""><span class="platform-copy"><strong>${network.name}</strong><small>${detail}</small></span><span class="platform-delta">${chip(value, known ? value - before : 0, comparable)}</span><span class="platform-chevron">›</span></button>`;
      })).join('');
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

    const today = parse(last.date);
    const daysToDeadline = deadline ? dayDiff(last.date, deadline) : null;
    setText('goalNeeded', daysToDeadline && daysToDeadline > 0 ? `${decimal(remaining / daysToDeadline)}/dia` : '—');

    // ritmo atual: média móvel de 7 dias quando existir, senão a média do período
    const recent = periodDeltas.slice(-7);
    const pace = recent.length >= 7 ? recent.reduce((sum, item) => sum + item.delta, 0) / 7 : perDay;
    if (pace === null || pace <= 0) {
      setText('goalPace', pace === null ? '—' : `${decimal(pace)}/dia`);
      setText('goalMonthly', '—');
      setText('goalEndMonth', '—');
      setText('goalEndYear', '—');
      setText('goalProjection', '—');
      setText('goalStatus', pace === null ? 'Ritmo indisponível' : 'Sem crescimento');
      return;
    }
    setText('goalPace', `${decimal(pace)}/dia`);

    const monthlyNeed = daysToDeadline && daysToDeadline > 0 ? remaining / (daysToDeadline / 30.44) : null;
    const monthStart = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
    const opening = series.filter(point => point.date < monthStart).pop();
    const doneThisMonth = opening ? current - totalAt(opening, nets) : null;
    setText('goalMonthly', monthlyNeed === null || doneThisMonth === null
      ? '—'
      : `${signed(doneThisMonth)} de ${signed(monthlyNeed)}`);
    if (monthlyNeed !== null && doneThisMonth !== null) setTone('goalMonthly', doneThisMonth - monthlyNeed);

    const daysLeftInMonth = dayDiff(last.date, iso(monthEnd(today)));
    const daysLeftInYear = dayDiff(last.date, `${today.getUTCFullYear()}-12-31`);
    setText('goalEndMonth', format(Math.round(current + pace * Math.max(0, daysLeftInMonth))));
    setText('goalEndYear', format(Math.round(current + pace * Math.max(0, daysLeftInYear))));

    const eta = addDays(today, Math.ceil(remaining / pace));
    setText('goalProjection', `${String(eta.getUTCDate()).padStart(2,'0')}/${String(eta.getUTCMonth()+1).padStart(2,'0')}/${eta.getUTCFullYear()}`);
    setText('goalStatus', deadline ? (eta <= parse(deadline) ? 'No ritmo' : 'Atrasada') : 'Projeção');
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
    ['netGrowth','growthRate','dailyRate','bestDay','worstDay','ma7','ma30','mtd','ytd','cmpDay','cmpWeek','cmpMonth','cmpPeriod','cmpAccel','cmpWeekday']
      .forEach(id => { setText(id, '—'); const node = el(id); if (node) node.className = ''; });
    renderGoal({ values:{} }, 0, activeNetworks(), [], null);
  }

  // ---------------------------------------------------------------- controles

  function resetRange() {
    if (!series.length) { el('startDate').value = ''; el('endDate').value = ''; return; }
    el('startDate').value = series[0].date;
    el('endDate').value = series[series.length - 1].date;
  }
  function setRange(from, to) { el('startDate').value = from; el('endDate').value = to; render(); }
  const lastDate = () => series.length ? series[series.length - 1].date : iso(new Date());

  el('grain').addEventListener('change', render);
  el('startDate').addEventListener('change', render);
  el('endDate').addEventListener('change', render);
  el('quick7').addEventListener('click', () => setRange(iso(addDays(parse(lastDate()), -6)), lastDate()));
  el('quick30').addEventListener('click', () => setRange(iso(addDays(parse(lastDate()), -29)), lastDate()));
  el('quickMonth').addEventListener('click', () => {
    const day = parse(lastDate());
    setRange(iso(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))), lastDate());
  });
  el('quickYear').addEventListener('click', () => {
    const day = parse(lastDate());
    setRange(`${day.getUTCFullYear()}-01-01`, lastDate());
  });

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

  function fetchJson(source) {
    return fetch(source + '?v=' + Date.now(), { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null);
  }

  function load() {
    const manual = read(manualKey, {});
    return Promise.all([fetchJson(SOURCE), fetchJson(LIVE_SOURCE)])
      .then(([published, live]) => {
        series = buildSeries(published, manual);
        liveSnapshot = live;
        refreshSubtitle(published, live);
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
    const stamp = live && live.updatedAt ? new Date(live.updatedAt) : null;
    if (!stamp || isNaN(stamp)) {
      status.textContent = 'Histórico diário fechado · aguardando o primeiro snapshot ao vivo da Meta.';
      return;
    }
    const minutes = Math.max(0, Math.round((Date.now() - stamp.getTime()) / 60000));
    const relative = minutes < 1 ? 'agora mesmo' : minutes === 1 ? 'há 1 min' : `há ${minutes} min`;
    status.textContent = `Snapshot atual da Meta: ${relative} (${stamp.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}) · histórico e métricas usam dias fechados.`;
  }

  load();
  window.setInterval(load, AUTO_REFRESH_MS);
})();
