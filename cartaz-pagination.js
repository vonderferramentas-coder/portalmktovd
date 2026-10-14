// Distribuição dos produtos do Gerador de Cartazes em páginas (A4/A3) e vínculo/desvínculo de marcas.
// Funções puras (sem DOM): recebem e devolvem listas de páginas, para poderem ser testadas em tests/cartaz-pagination.test.html.
(function () {
  const groupBrand = group => group.rows.map(row => row.brand).find(Boolean) || 'SEM MARCA';
  const twoCodeColumns = (count, a3) => count > 9 && !a3;

  /* Configuração do cartaz (por template): produtos e colunas por folha. O padrão é o layout da Feira (6 boxes em 2 colunas no A4,
     9 em 3 no A3). Com `a3Auto`, o A3 acompanha o A4: capacidade x1,5 (arredondada para baixo) e colunas x1,25 (arredondadas). */
  const DEFAULT_CONFIG = { capA4: 6, colsA4: 2, a3Auto: true, capA3: 9, colsA3: 3, paginateBy: 'brand', sheetFormats: 'both', layout: 'feira', logoBox: false, headerMode: 'compact', headerCorner: 'tl', footerLogo: true, codeType: 'barcode', showTitle: true, showPhoto: true, showCodeBox: true, showDesc: true, showCode: true, showQty: true, tableStyle: 'table', codePos: 'left', titleAlign: 'center', button: true, buttonText: 'CLIQUE AQUI E COMPRE AGORA!', buttonColor: '#F6BE00', divisions: [], showStrip: true, divisionColors: {}, legalEnabled: false, legalText: '', attentionTitle: 'ATENÇÃO', attentionColor: '#ffffff', attentionText: 'Para acessar as condições especiais, é indispensável estar logado com o seu perfil em nossa Plataforma B2B.' };
  let current = { ...DEFAULT_CONFIG };
  function resolve(config) {
    let c = { ...DEFAULT_CONFIG, ...config };
    c.capA4 = Math.max(1, Math.floor(+c.capA4) || DEFAULT_CONFIG.capA4); c.colsA4 = Math.max(1, Math.floor(+c.colsA4) || DEFAULT_CONFIG.colsA4);
    if (c.a3Auto) { c.capA3 = Math.floor(c.capA4 * 1.5); c.colsA3 = Math.round(c.colsA4 * 1.25); }
    else { c.capA3 = Math.max(1, Math.floor(+c.capA3) || DEFAULT_CONFIG.capA3); c.colsA3 = Math.max(1, Math.floor(+c.colsA3) || DEFAULT_CONFIG.colsA3); }
    return c;
  }
  const setConfig = config => { current = resolve(config); return current; };

  /* Distribui os produtos de UMA marca (ou de várias vinculadas, `members`) em páginas, pela configuração atual (setConfig).
     Com o padrão da Feira: até 6 = 1 folha A4; 7 a 9 = 1 folha A3; 10 a 12 = A4 em duas; acima de 12 = A3. `prev` devolve título e foto já editados de cada
     produto quando as páginas são redistribuídas (vincular/desvincular). */
  function paginate(brandName, brandItems, members, prev) {
    let out = [];
    let cfg = current, count0 = brandItems.length, format = cfg.sheetFormats === 'a4' ? 'A4' : cfg.sheetFormats === 'a3' ? 'A3' : count0 <= cfg.capA4 ? 'A4' : count0 <= cfg.capA3 ? 'A3' : count0 <= 2 * cfg.capA4 ? 'A4' : 'A3' /* sheetFormats: só A4, só A3 ou os dois (a regra automática) */, capacity = format === 'A4' ? cfg.capA4 : cfg.capA3, columns = format === 'A4' ? cfg.colsA4 : cfg.colsA3, live = cfg.layout === 'liveshop', header = live && cfg.logoBox ? (cfg.headerMode === 'full' ? 'full' : 'compact') : 'none', offset = header === 'compact' ? 1 : 0 /* header compacto: o box ocupa 1 célula da grade (canto em headerCorner); completo: fica acima da grade, como na Feira */, standard = !live && columns === (format === 'A4' ? 2 : 3) /* centralizar/parear a última linha só existe na grade da Feira */, total = Math.ceil(brandItems.length / capacity), base = Math.floor(brandItems.length / total), extra = brandItems.length % total, start = 0;
    for (let pageIndex = 0; pageIndex < total; pageIndex++) {
      let count = base + (pageIndex < extra ? 1 : 0), pageGroups = brandItems.slice(start, start += count), remainder = pageGroups.length % columns, lastRowIndex = Math.floor((pageGroups.length - 1) / columns), lastRowGroups = pageGroups.filter((group, index) => Math.floor(index / columns) === lastRowIndex), codeExtra = group => group.rows.length > 20 ? Math.min(150, Math.ceil((group.rows.length - 20) / 2) * 16 + 8) : 0, pairedExtraHeight = standard && format === 'A4' && pageGroups.length <= 4 && lastRowGroups.length === 2 ? Math.max(...lastRowGroups.map(codeExtra)) : 0;
      out.push({ name: brandName + ' · ' + format + ' · pág ' + (pageIndex + 1) + '/' + total, brand: brandName, ...(members ? { brands: members } : {}), format, capacity, cols: columns, rows: Math.ceil((capacity + offset) / columns), ...(live ? { layout: 'liveshop', logoBox: !!offset, header, corner: cfg.headerCorner || 'tl', footerLogo: cfg.footerLogo !== false } : {}), items: pageGroups.map((group, index) => {
        let lastRow = Math.floor(index / columns) === lastRowIndex, col = index % columns, center = standard && format === 'A4' && lastRow && remainder === 1, pair = standard && format === 'A3' && lastRow && remainder === 2;
        if (standard && format === 'A3' && lastRow && remainder === 1) col = 1;
        let extraHeight = center && pageGroups.length <= 3 ? codeExtra(group) : (lastRow ? pairedExtraHeight : 0); return { group, col: offset ? (index + offset) % columns : col, gridRow: Math.floor((index + offset) / columns), size: 1, center, pair, extraHeight };
      }) });
    }
    if (prev) out.forEach(page => page.items.forEach(item => { let old = prev.get(item.group); if (old) { if (old.title) { item.title = old.title; if (old.titleHtml) item.titleHtml = old.titleHtml; } if (old.photo) item.photo = old.photo; if (old.wide) item.wide = true; if (old.photoSrc) item.photoSrc = old.photoSrc; if (old.rows) item.rows = old.rows; if (old.minQty !== undefined) item.minQty = old.minQty; if (old.links) item.links = old.links; if (old.showButton === false) item.showButton = false; if (old.flip) item.flip = true; if (old.linesOverride) item.linesOverride = old.linesOverride; } }));
    if (live) out.forEach(placeLive);
    return out;
  }

  /* Célula que o header compacto ocupa na grade de `rows` linhas: canto superior/inferior, esquerdo/direito (page.corner: tl, tr, bl, br). */
  const headerCell = (page, rows) => ({ tl: 0, tr: page.cols - 1, bl: (rows - 1) * page.cols, br: rows * page.cols - 1 })[page.corner || 'tl'] ?? 0;

  /* Live Shop: posiciona os boxes da folha pela ordem, com "Destaque" (item.wide) ocupando 2 colunas e o header compacto numa célula de canto. Se o destaque não cabe
     no resto da linha, a vaga é preenchida pelo próximo box pequeno (mesma ideia do consolidado). A folha ganha linhas extras só se faltar espaço (page.baseRows
     guarda o mínimo original). ponytail: pega o próximo pequeno da fila para a vaga, sem otimizar a ocupação da folha. */
  function placeLive(page) {
    if (page.layout !== 'liveshop') return;
    const cols = page.cols, base = page.baseRows || (page.baseRows = page.rows), isWide = item => item.wide && cols >= 2;
    for (let rows = base; ; rows++) {
      const total = rows * cols, taken = page.logoBox ? headerCell(page, rows) : -1, queue = page.items.slice(), spots = [];
      const free = (c, span) => c % cols + span <= cols && c + span <= total && !(taken >= c && taken < c + span);
      let cell = 0;
      const put = (item, span) => { spots.push([item, cell, span]); cell += span; };
      while (queue.length && cell < total) {
        const item = queue.shift(), span = isWide(item) ? 2 : 1;
        while (cell < total && !free(cell, 1)) cell++;
        if (span === 2) while (cell < total && !free(cell, 2)) { const next = queue.findIndex(entry => !isWide(entry)); if (next >= 0 && free(cell, 1)) put(queue.splice(next, 1)[0], 1); else cell++; }
        if (cell >= total) { queue.unshift(item); break; }
        put(item, span);
      }
      if (queue.length) continue; /* faltou espaço: tenta com mais uma linha */
      spots.forEach(([item, at, span]) => { item.col = at % cols; item.gridRow = Math.floor(at / cols); item.size = 1; item.span = span; });
      page.rows = rows;
      page.empty = total - ((page.logoBox ? 1 : 0) + page.items.reduce((sum, item) => sum + item.span, 0)); /* células sem box na folha */
      return;
    }
  }

  // Junta as páginas das marcas `names` (ordem da lista) numa marca vinculada "A + B"; a nova entrada ocupa o lugar da primeira.
  function link(pagesList, names) {
    let old = pagesList.filter(page => names.includes(page.brand)), first = pagesList.indexOf(old[0]), prev = new Map(), groups = [], key = names.join(' + ');
    old.forEach(page => page.items.forEach(item => prev.set(item.group, item)));
    names.forEach(name => old.filter(page => page.brand === name).forEach(page => page.items.forEach(item => groups.push(item.group))));
    let next = pagesList.filter(page => !names.includes(page.brand)); next.splice(first, 0, ...paginate(key, groups, names, prev));
    return { pages: next, key };
  }

  // Desfaz o vínculo `key`: cada marca volta a ter as suas próprias páginas. Devolve null se a chave não existir.
  function unlink(pagesList, key) {
    let old = pagesList.filter(page => page.brand === key); if (!old.length) return null;
    let members = old[0].brands, first = pagesList.indexOf(old[0]), prev = new Map(), byBrand = new Map(members.map(name => [name, []]));
    old.forEach(page => page.items.forEach(item => { prev.set(item.group, item); byBrand.get(groupBrand(item.group))?.push(item.group); }));
    let next = pagesList.filter(page => page.brand !== key);
    next.splice(first, 0, ...members.flatMap(name => byBrand.get(name).length ? paginate(name, byBrand.get(name), null, prev) : []));
    return { pages: next, first: members[0] };
  }

  /* Insere manualmente um produto avulso (`group`, um card) numa marca já existente ou cria a marca (`brandKey`
     ainda sem nenhuma página). Refaz a paginação inteira daquela marca (mesma regra de formato A4/A3, colunas
     e última linha do import) para o item novo entrar corretamente junto dos demais - nunca cria uma folha
     avulsa fora dessa regra. `beforeGroup` é o grupo existente diante do qual inserir; sem ele, entra no fim
     da marca. Marca nova: a página entra na posição alfabética entre as marcas já existentes, igual à ordem
     que o import usa. */
  function insertItem(pagesList, brandKey, group, beforeGroup) {
    let old = pagesList.filter(page => page.brand === brandKey);
    if (!old.length) {
      let seen = [], next = pagesList.slice();
      pagesList.forEach(page => { if (!seen.includes(page.brand)) seen.push(page.brand); });
      let after = seen.find(name => brandKey.localeCompare(name, 'pt-BR') < 0), at = after ? next.findIndex(page => page.brand === after) : next.length;
      next.splice(at, 0, ...paginate(brandKey, [group]));
      return { pages: next, key: brandKey };
    }
    let prev = new Map(), groups = [];
    old.forEach(page => page.items.forEach(item => { prev.set(item.group, item); groups.push(item.group); }));
    let at = beforeGroup ? groups.indexOf(beforeGroup) : -1;
    if (at < 0) groups.push(group); else groups.splice(at, 0, group);
    let first = pagesList.indexOf(old[0]), next = pagesList.filter(page => page.brand !== brandKey);
    next.splice(first, 0, ...paginate(brandKey, groups, old[0].brands, prev));
    return { pages: next, key: brandKey };
  }

  window.CartazPagination = { paginate, groupBrand, link, unlink, insertItem, twoCodeColumns, setConfig, resolve, placeLive, DEFAULT_CONFIG };
})();
