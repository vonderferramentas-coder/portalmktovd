// Sugestões do galpão do Calendário no mapa da Início: regras fixas sobre dados que o portal já tem (sem IA).
// calendar() é pura (testada em tests/home-suggestions.test.html); loadCalendar() lê os dados da marca ativa e a chama.
// Cada sugestão: { tone: 'bad'|'warn'|'info', text, sub, action: { label, href } }, já em ordem de prioridade.
(function () {
  const DAY = 86400000;
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const ddmm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  const pad = n => String(n).padStart(2, '0');
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  // mesmos critérios do app.js (getPostProducts / postChannelEntries)
  const products = p => Array.isArray(p.products) && p.products.length ? p.products : (p.productCode || p.productName) ? [{ code: p.productCode || '', name: p.productName || '' }] : [];
  const isVideo = p => (Array.isArray(p.channels) && p.channels.length ? p.channels : [{ types: [p.type] }])
    .some(c => (c.types || []).some(t => fold(t) === 'video'));
  const cardLink = p => 'visual-editor.html?post=' + encodeURIComponent(p.id) + '&date=' + p.date;
  const RANK = { bad: 0, warn: 1, info: 2 };
  // data da Meta ("2026-03-02T12:00:00+0000"): o "+0000" sem dois-pontos só o Chrome aceita; vira ISO e é lida no fuso local
  const when = s => new Date(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));

  // posts: cards do calendário; settings: { customDates, videoWeeklyTarget, TARGET, editorias }; social: posts coletados do
  // Instagram ({timestamp, likeCount, caption, mediaProductType}) ou null quando a marca não tem coleta; trends: documento
  // trends-v1 (Google Trends cruzado com o catálogo VONDER) ou null; today: Date
  function calendar({ posts, settings, social, trends, today, names }) {
    const out = [], t0 = parse(ymd(today)), todayS = ymd(t0);
    const dated = (posts || []).filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date || ''));
    const daysTo = s => Math.round((parse(s) - t0) / DAY);
    // n dias a partir de hoje pelo calendário (somar 24 h pularia ou repetiria um dia na troca de horário de verão)
    const at = n => ymd(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + n));

    // 1) data comemorativa nos próximos 10 dias sem card: nem um card que cite o nome até 10 dias antes,
    // nem um card de editoria comemorativa no próprio dia
    for (let i = 0; i <= 10; i++) {
      const s = at(i), from = at(i - 10);
      (names(s, settings && settings.customDates) || []).forEach(name => {
        const covered = dated.some(p => (p.date >= from && p.date <= s && fold(p.title).includes(fold(name)))
          || (p.date === s && [].concat(p.editoria || []).some(e => fold(e).includes('comemorativ'))));
        if (covered) return;
        out.push({ tone: i <= 3 ? 'bad' : 'warn', date: s,
          text: i === 0 ? `Hoje é ${name}` : `Falta${i > 1 ? 'm' : ''} ${pad(i)} dia${i > 1 ? 's' : ''} para ${name}`,
          sub: ddmm(s) + ' · ainda sem post no calendário', action: { label: 'Criar post', href: 'visual-editor.html?date=' + s + '&commemorative=1' } });
      });
    }

    // 2) cards dos próximos 30 dias sem produto escolhido (e não marcados como "sem produto")
    dated.filter(p => p.date >= todayS && daysTo(p.date) <= 30 && !p.noProduct && !products(p).length).forEach(p => {
      out.push({ tone: daysTo(p.date) <= 3 ? 'bad' : 'warn', date: p.date, text: `Pendente escolha de produtos em "${(p.title || 'Sem título').trim()}"`,
        sub: 'Card de ' + ddmm(p.date), action: { label: 'Escolher produtos', href: cardLink(p) } });
    });

    // 3) vídeos do mês abaixo da meta (meta semanal de Configurações > Metas, proporcional aos dias do mês)
    const weekly = settings && settings.videoWeeklyTarget != null ? Number(settings.videoWeeklyTarget) : 2;
    if (weekly > 0) {
      const month = todayS.slice(0, 7), daysInMonth = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate();
      const goal = Math.round(weekly * daysInMonth / 7), videos = dated.filter(p => p.date.slice(0, 7) === month && isVideo(p)).length;
      if (videos < goal) out.push({ tone: 'warn', date: todayS, text: `Só ${videos} vídeo${videos === 1 ? '' : 's'} no calendário de ${MONTHS[t0.getMonth()]} (meta: ${goal})`,
        sub: 'Proponha um novo vídeo para o mês', action: { label: 'Propor vídeo', href: 'visual-editor.html?date=' + todayS } });
    }

    // 4) post mais curtido do ano no Instagram: sugere repetir o tema. O produto vem do card do calendário do mesmo dia.
    // ponytail: liga post e card só pela data (o post coletado não traz o produto); evolução: guardar o id do post no card.
    const year = String(t0.getFullYear());
    const top = (social || []).filter(p => ymd(when(p.timestamp)).slice(0, 4) === year)
      .sort((a, b) => (Number(b.likeCount) || 0) - (Number(a.likeCount) || 0))[0];
    if (top && Number(top.likeCount) > 0) {
      const day = ymd(when(top.timestamp)), card = dated.find(p => p.date === day && products(p).length);
      const prod = card && products(card)[0], caption = String(top.caption || '').replace(/\s+/g, ' ').trim();
      out.push({ tone: 'info', date: day,
        text: prod ? `Potencial de repetir conteúdo sobre ${(prod.name || prod.code).trim()}` : 'Potencial de repetir o tema do post mais curtido do ano',
        sub: `Mais curtido de ${year} no Instagram: ${Number(top.likeCount).toLocaleString('pt-BR')} curtidas` + (prod || !caption ? '' : ` · "${caption.slice(0, 60)}${caption.length > 60 ? '…' : ''}"`),
        action: { label: 'Ver relatório', href: 'followers-dashboard.html' } });
    }

    const month = todayS.slice(0, 7), mName = MONTHS[t0.getMonth()];
    const inRange = (p, a, b) => p.date >= at(a) && p.date <= at(b);

    // 5) dias das próximas 2 semanas abaixo da meta diária de Configurações (TARGET; collab não conta, como no calendário)
    const target = settings && Number(settings.TARGET) > 0 ? Number(settings.TARGET) : 3, low = [];
    for (let i = 0; i < 14; i++){ const s = at(i), n = dated.filter(p => p.date === s && !p.collab).length; if (n < target) low.push([s, n]); }
    if (low.length) out.push({ tone: 'warn', date: low[0][0], text: `${low.length} dia${low.length > 1 ? 's' : ''} das próximas 2 semanas abaixo da meta de ${target} post${target > 1 ? 's' : ''}/dia`,
      sub: low.slice(0, 4).map(d => `${ddmm(d[0])} (${d[1]})`).join(' · ') + (low.length > 4 ? ' …' : ''), action: { label: 'Ver no calendário', href: 'visual-editor.html?date=' + low[0][0] } });

    // 6) editoria esquecida: nenhum card nos últimos 30 dias nem nas próximas 2 semanas (datas comemorativas ficam de fora: dependem da data)
    const hasEd = (p, name) => [].concat(p.editoria || []).some(e => fold(e) === fold(name));
    ((settings && settings.editorias) || []).map(e => typeof e === 'string' ? e : e && e.name).filter(n => n && !fold(n).includes('comemorativ')).forEach(name => {
      if (dated.some(p => inRange(p, -30, 14) && hasEd(p, name))) return;
      const last = dated.filter(p => p.date < todayS && hasEd(p, name)).map(p => p.date).sort().pop();
      out.push({ tone: 'warn', date: todayS, text: `Editoria "${name}" sem posts há mais de 30 dias`,
        sub: (last ? 'Último em ' + ddmm(last) + '/' + last.slice(0, 4) : 'Nenhum post registrado') + ' · nada planejado nas próximas 2 semanas',
        action: { label: 'Planejar post', href: 'visual-editor.html?date=' + todayS } });
    });

    // 7) formatos do mês: nenhum Story, ou só feed (considera os formatos de todas as redes de cada card)
    const places = p => (Array.isArray(p.channels) && p.channels.length ? p.channels : [{ places: [].concat(p.place || []) }]).flatMap(c => (c.places || []).map(fold));
    const monthCards = dated.filter(p => p.date.slice(0, 7) === month), all = monthCards.flatMap(places);
    if (monthCards.length >= 5 && !all.some(f => f.includes('stor'))) out.push({ tone: 'warn', date: todayS,
      text: all.some(f => f.includes('reel')) ? `Nenhum Story planejado em ${mName}` : `${mName[0].toUpperCase() + mName.slice(1)} só tem posts de feed`,
      sub: `${monthCards.length} cards no mês · varie com Stories${all.some(f => f.includes('reel')) ? '' : ' e Reels'}`, action: { label: 'Propor Story', href: 'visual-editor.html?date=' + todayS } });

    // 8) próximo mês vazio: a 10 dias ou menos da virada, com menos de uma semana de posts planejada (5 x meta diária)
    const next = new Date(t0.getFullYear(), t0.getMonth() + 1, 1), nextS = ymd(next), left = daysTo(nextS), nextCards = dated.filter(p => p.date.slice(0, 7) === nextS.slice(0, 7)).length;
    if (left <= 10 && nextCards < target * 5) out.push({ tone: left <= 3 ? 'bad' : 'warn', date: nextS,
      text: `Falta${left > 1 ? 'm' : ''} ${pad(left)} dia${left > 1 ? 's' : ''} para ${MONTHS[next.getMonth()]} e ele tem só ${nextCards} card${nextCards === 1 ? '' : 's'}`,
      sub: 'Comece o planejamento do próximo mês', action: { label: 'Planejar ' + MONTHS[next.getMonth()], href: 'visual-editor.html?date=' + nextS } });

    // 9) Google Trends (catálogo VONDER): termo em alta que casa com produto e sem card desse produto de -30 a +30 dias
    const planned = new Set(dated.filter(p => inRange(p, -30, 30)).flatMap(p => products(p).map(x => String(x.code))));
    const growth = v => v === 'Alta' ? 5000 : parseInt(String(v).replace(/\D/g, ''), 10) || 0, seen = new Set();
    ((trends && trends.categories) ? Object.values(trends.categories) : []).flatMap(c => ((c.periods && c.periods['30d'] && c.periods['30d'].terms) || []))
      .filter(t => t.variation && (t.variation === 'Alta' || String(t.variation).startsWith('+')) && (t.matchedProducts || []).length && !t.matchedProducts.some(m => planned.has(String(m.code))))
      .sort((a, b) => growth(b.variation) - growth(a.variation))
      .filter(t => !seen.has(fold(t.term)) && seen.add(fold(t.term))).slice(0, 2)
      .forEach(t => out.push({ tone: 'info', date: todayS, text: `"${t.term}" em alta nas buscas (${t.variation === 'Alta' ? 'subindo muito' : t.variation})`,
        sub: `Produto: ${t.matchedProducts[0].name} · sem card nos últimos e próximos 30 dias`, action: { label: 'Ver tendência', href: 'intelligence-center.html' } }));

    // 10) e 11) Instagram dos últimos 12 meses: Reels engajando mais que o feed (e pouco planejado) e melhor dia da semana
    const recent = (social || []).filter(p => { const d = when(p.timestamp); return d <= t0 && t0 - d < 365 * DAY; });
    const avg = list => list.reduce((s, p) => s + (Number(p.likeCount) || 0), 0) / (list.length || 1);
    const reels = recent.filter(p => p.mediaProductType === 'REELS'), feed = recent.filter(p => p.mediaProductType !== 'REELS');
    if (reels.length >= 5 && feed.length >= 5){
      const k = avg(reels) / (avg(feed) || 1), next30 = dated.filter(p => inRange(p, 0, 30)), share = next30.filter(p => places(p).some(f => f.includes('reel'))).length;
      if (k >= 1.5 && next30.length >= 4 && share / next30.length < .3) out.push({ tone: 'info', date: todayS,
        text: `Reels têm ${k.toFixed(1).replace('.', ',')}x mais curtidas que posts de feed no Instagram`,
        sub: `Só ${share} de ${next30.length} cards dos próximos 30 dias ${share === 1 ? 'é' : 'são'} Reels`, action: { label: 'Propor Reels', href: 'visual-editor.html?date=' + todayS } });
    }
    const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'], byDay = WD.map((_, i) => recent.filter(p => when(p.timestamp).getDay() === i));
    const overall = avg(recent), bestDay = byDay.map((l, i) => [i, l.length >= 4 ? avg(l) : 0]).sort((a, b) => b[1] - a[1])[0];
    if (recent.length >= 20 && bestDay[1] >= overall * 1.2) {
      const free = [1, 2, 3, 4, 5, 6, 7].map(at).find(s => parse(s).getDay() === bestDay[0] && !dated.some(p => p.date === s));
      if (free) out.push({ tone: 'info', date: free, text: `${WD[bestDay[0]][0].toUpperCase() + WD[bestDay[0]].slice(1)} é o dia de mais curtidas no Instagram (+${Math.round((bestDay[1] / overall - 1) * 100)}% sobre a média)`,
        sub: `${WD[bestDay[0]][0].toUpperCase() + WD[bestDay[0]].slice(1)}, ${ddmm(free)} está sem post`, action: { label: 'Criar post', href: 'visual-editor.html?date=' + free } });
    }

    return out.sort((a, b) => RANK[a.tone] - RANK[b.tone] || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // marcas com coleta automática de posts (mesmo mapa de followers-dashboard.js: BRAND_INTEGRATIONS)
  const SOCIAL_SUFFIX = { '': 'vonder', '__ferramentas-gerais': 'ferramentas-gerais' };

  // lê uma vez os cards: assinatura em tempo real fechada no primeiro retorno DO SERVIDOR. Um retorno só do cache local
  // (offline) pode vir vazio e geraria alertas falsos ("0 cards"), então é ignorado; sem servidor em 12 s, vira erro.
  function loadCards(fb, key) {
    return new Promise((resolve, reject) => {
      const stop = fb.subscribeToPosts(key, ({ changes, fromCache }) => {
        if (fromCache) return;
        clearTimeout(timer); stop.then(s => s()); resolve(changes.map(c => c.post).filter(Boolean));
      }, e => { clearTimeout(timer); reject(e); });
      const timer = setTimeout(() => { stop.then(s => s()); reject(new Error('Sem resposta do servidor.')); }, 12000);
      stop.catch(e => { clearTimeout(timer); reject(e); });
    });
  }
  // documento em partes (key, key__2...): as demais partes em paralelo, como protectedStoreChunked do followers-dashboard.js
  async function readChunked(fb, key) {
    const first = (await fb.readPortalStore(key) || {}).v;
    const n = (first && Number(first.chunkCount)) || 1, rest = [];
    for (let i = 2; i <= n; i++) rest.push(fb.readPortalStore(`${key}__${i}`));
    return ((first && first.posts) || []).concat(...(await Promise.all(rest)).map(r => ((r || {}).v || {}).posts || []));
  }
  // resultado guardado por marca durante a sessão (5 min): voltar à doca não baixa tudo de novo; falha não fica guardada
  const CACHE = {}, TTL = 5 * 60000;
  function loadCalendar(suffix, fresh) {
    const hit = CACHE[suffix];
    if (!fresh && hit && Date.now() - hit.at < TTL) return hit.promise;
    const promise = readCalendar(suffix);
    CACHE[suffix] = { at: Date.now(), promise };
    promise.catch(() => { if (CACHE[suffix] && CACHE[suffix].promise === promise) delete CACHE[suffix]; });
    return promise;
  }
  async function readCalendar(suffix) {
    const fb = window.PortalFirebase;
    if (!fb) throw new Error('A conexão com os dados ainda não está pronta.');
    const social = SOCIAL_SUFFIX[suffix];
    const [posts, settingsRec, socialPosts, trendsRec] = await Promise.all([
      loadCards(fb, 'posts' + suffix),
      fb.readPortalStore('settings' + suffix).catch(() => null),
      social ? readChunked(fb, `posts-${social}-v1`).catch(() => null) : null,
      suffix === '' ? fb.readPortalStore('trends-v1').catch(() => null) : null // os produtos casados são do catálogo VONDER
    ]);
    return calendar({ posts, settings: settingsRec && settingsRec.v, social: socialPosts, trends: trendsRec && trendsRec.v, today: new Date(), names: window.CommemorativeDates.names });
  }

  window.HomeSuggestions = { calendar, loadCalendar };
})();
