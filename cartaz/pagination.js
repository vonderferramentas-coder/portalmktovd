// Distribuição dos produtos do Gerador de Cartazes em páginas (A4/A3) e vínculo/desvínculo de marcas.
// Funções puras (sem DOM): recebem e devolvem listas de páginas, para poderem ser testadas em tests/cartaz-pagination.test.html.
(function () {
  const groupBrand = group => group.rows.map(row => row.brand).find(Boolean) || 'SEM MARCA';
  const twoCodeColumns = (count, a3) => count > 9 && !a3;

  /* Configuração do cartaz (por template): produtos e colunas por folha. O padrão é o layout da Feira (6 boxes em 2 colunas no A4,
     9 em 3 no A3). Com `a3Auto`, o A3 acompanha o A4: capacidade x1,5 (arredondada para baixo) e colunas x1,25 (arredondadas). */
  const DEFAULT_CONFIG = { capA4: 6, colsA4: 2, a3Auto: true, capA3: 9, colsA3: 3, paginateBy: 'brand', brandMode: 'footer', boxShape: 'rect', rowFill: 'equal', bandWidth: 'row', qtyPos: 'qr', sheetFormats: 'both', layout: 'feira', logoBox: false, headerMode: 'compact', headerCorner: 'tl', footerLogo: true, codeType: 'barcode', showTitle: true, showPhoto: true, showCodeBox: true, showDesc: true, showCode: true, showQty: true, tableStyle: 'table', codePos: 'left', titleAlign: 'center', button: true, buttonText: 'CLIQUE AQUI E COMPRE AGORA!', buttonColor: '#F6BE00', divisions: [], showStrip: true, titleSize: 11.5, tableSize: 7, cardOutline: false, cardOutlineColor: '#000000', cardOutlineWidth: .75, divisionColors: {}, legalEnabled: false, legalText: '', attentionTitle: 'ATENÇÃO', attentionTitleOn: true, attentionTextOn: true, attentionColor: '#ffffff', attentionText: 'Para acessar as condições especiais, é indispensável estar logado com o seu perfil em nossa Plataforma B2B.' };
  let current = { ...DEFAULT_CONFIG };
  function resolve(config) {
    let c = { ...DEFAULT_CONFIG, ...config };
    c.capA4 = Math.max(1, Math.floor(+c.capA4) || DEFAULT_CONFIG.capA4); c.colsA4 = Math.max(1, Math.floor(+c.colsA4) || DEFAULT_CONFIG.colsA4);
    if (c.a3Auto) { c.capA3 = Math.floor(c.capA4 * 1.5); c.colsA3 = Math.round(c.colsA4 * 1.25); }
    else { c.capA3 = Math.max(1, Math.floor(+c.capA3) || DEFAULT_CONFIG.capA3); c.colsA3 = Math.max(1, Math.floor(+c.colsA3) || DEFAULT_CONFIG.colsA3); }
    return c;
  }
  const setConfig = config => { current = resolve(config); return current; };
  /* Escolha de "linhas incompletas" feita por marca ({ marca: 'equal' | 'balance' }); sem ela vale a do template (config rowFill). */
  let fills = () => ({});
  const setFillSource = source => { fills = source; };
  const balances = brand => current.boxShape !== 'square' && (fills()[brand] || current.rowFill) === 'balance';
  /* config bandWidth: 'row' (faixa na linha toda), 'cards' (sobre os cards da marca; a marca que cabe no resto da linha entra ao lado) ou 'card' (uma faixa em cada card; as marcas
     seguem sem quebrar linha). Marca em "equilibrar" fica sempre com as linhas dela. `need` = células da marca, `room` = o que sobra na linha. */
  const sharesRow = (brand, need, room) => current.bandWidth !== 'row' && !balances(brand) && (current.bandWidth === 'card' || need <= room);

  /* Os `need` boxes a partir de `cell` ficam numa linha só? A célula do header compacto (`taken`) empurra; marca quebrada em duas linhas não divide a linha com a seguinte
     (a faixa dela cairia no meio dos boxes). Com a faixa em cada box isso não importa. */
  const oneRow = (cell, need, cols, taken) => { if (current.bandWidth === 'card') return true; if (cell === taken) cell++; return cell % cols + need + (taken > cell && taken < cell + need ? 1 : 0) <= cols; };
  /* Divide os produtos em folhas de tamanho parecido (o padrão por marca). */
  function evenChunks(items, capacity) {
    const total = Math.ceil(items.length / capacity), base = Math.floor(items.length / total), extra = items.length % total; let start = 0;
    return Array.from({ length: total }, (_, i) => items.slice(start, start += base + (i < extra ? 1 : 0)));
  }
  /* Modo "marcas como seções": o primeiro produto de cada marca abre uma faixa (linha inteira da grade, com a logo). As marcas se encadeiam nas folhas. */
  const sectionStarts = items => { const starts = new Set(); let prev; items.forEach(group => { const brand = groupBrand(group); if (brand !== prev) starts.add(group); prev = brand; }); return starts; };
  /* Enche as folhas na ordem simulando as células da grade: o primeiro produto de cada marca começa numa linha nova (a faixa é uma linha extra e curta acima dele,
     fora da conta de produtos por folha). `taken` = célula do header compacto. ponytail: ignora os destaques (2 colunas); se a folha faltar espaço, placeLive acrescenta linha. */
  function sectionChunks(items, starts, total, cols, taken) {
    const out = []; let cur = [], cell = 0, open = false /* a marca anterior deixa dividir a linha */;
    for (const group of items) for (;;) {
      let at = cell, small = open || (!cell && current.bandWidth === 'card' && sharesRow(groupBrand(group), 0, cols)) /* folha que começa com a continuação de uma marca */;
      if (starts.has(group)) {
        const brand = groupBrand(group), count = items.filter(other => groupBrand(other) === brand).length;
        if (at % cols && !(open && sharesRow(brand, count, cols - at % cols))) at += cols - at % cols; /* entra ao lado da anterior? senão desce */
        small = sharesRow(brand, count, cols) && oneRow(at, count, cols, taken);
      }
      if (at === taken) at++;
      if (at < total || !cur.length) { cell = at + 1; open = small; cur.push(group); break; }
      out.push(cur); cur = []; cell = 0; open = false;
    }
    if (cur.length) out.push(cur); return out;
  }

  /* Distribui os produtos de UMA marca (ou de várias vinculadas, `members`) em páginas, pela configuração atual (setConfig).
     Com o padrão da Feira: até 6 = 1 folha A4; 7 a 9 = 1 folha A3; 10 a 12 = A4 em duas; acima de 12 = A3. `prev` devolve título e foto já editados de cada
     produto quando as páginas são redistribuídas (vincular/desvincular). */
  function paginate(brandName, brandItems, members, prev) {
    let out = [];
    let cfg = current, sections = cfg.layout === 'liveshop' && cfg.paginateBy === 'brand' && cfg.brandMode === 'sections' /* marcas viram seções (faixa com a logo) em vez de cards no rodapé */, starts = sections ? sectionStarts(brandItems) : new Set(), count0 = brandItems.length + Math.ceil((cfg.bandWidth === 'card' ? 0 : starts.size) * (cfg.colsA4 - 1) / 2) /* cada marca nova começa numa linha nova: em média sobra meia linha vazia (com a faixa em cada card não há quebra) */, format = cfg.sheetFormats === 'a4' ? 'A4' : cfg.sheetFormats === 'a3' ? 'A3' : count0 <= cfg.capA4 ? 'A4' : count0 <= cfg.capA3 ? 'A3' : count0 <= 2 * cfg.capA4 ? 'A4' : 'A3' /* sheetFormats: só A4, só A3 ou os dois (a regra automática) */, capacity = format === 'A4' ? cfg.capA4 : cfg.capA3, columns = format === 'A4' ? cfg.colsA4 : cfg.colsA3, live = cfg.layout === 'liveshop', header = live && cfg.logoBox ? (cfg.headerMode === 'full' ? 'full' : cfg.headerMode === 'custom' ? 'custom' : 'compact') : 'none', offset = header === 'compact' ? 1 : 0 /* header compacto: o box ocupa 1 célula da grade (canto em headerCorner); completo e personalizado (imagem): ficam acima da grade, como na Feira */, standard = !live && columns === (format === 'A4' ? 2 : 3) /* centralizar/parear a última linha só existe na grade da Feira */, chunks = sections ? sectionChunks(brandItems, starts, (capacity + offset), columns, header === 'compact' ? headerCell({ cols: columns, corner: cfg.headerCorner }, Math.ceil((capacity + offset) / columns)) : -1) : evenChunks(brandItems, capacity), total = chunks.length;
    for (let pageIndex = 0; pageIndex < total; pageIndex++) {
      let pageGroups = chunks[pageIndex], remainder = pageGroups.length % columns, lastRowIndex = Math.floor((pageGroups.length - 1) / columns), lastRowGroups = pageGroups.filter((group, index) => Math.floor(index / columns) === lastRowIndex), codeExtra = group => group.rows.length > 20 ? Math.min(150, Math.ceil((group.rows.length - 20) / 2) * 16 + 8) : 0, pairedExtraHeight = standard && format === 'A4' && pageGroups.length <= 4 && lastRowGroups.length === 2 ? Math.max(...lastRowGroups.map(codeExtra)) : 0;
      out.push({ name: brandName + ' · ' + format + ' · pág ' + (pageIndex + 1) + '/' + total, brand: brandName, ...(members ? { brands: members } : {}), ...(sections ? { sectioned: true } : {}), format, capacity, cols: columns, rows: Math.ceil((capacity + offset) / columns), ...(live ? { layout: 'liveshop', logoBox: !!offset, header, corner: cfg.headerCorner || 'tl', footerLogo: !sections && cfg.footerLogo !== false } : {}), items: pageGroups.map((group, index) => {
        let lastRow = Math.floor(index / columns) === lastRowIndex, col = index % columns, center = standard && format === 'A4' && lastRow && remainder === 1, pair = standard && format === 'A3' && lastRow && remainder === 2;
        if (standard && format === 'A3' && lastRow && remainder === 1) col = 1;
        let extraHeight = center && pageGroups.length <= 3 ? codeExtra(group) : (lastRow ? pairedExtraHeight : 0); return { group, col: offset ? (index + offset) % columns : col, gridRow: Math.floor((index + offset) / columns), size: 1, center, pair, extraHeight, ...(starts.has(group) ? { band: groupBrand(group), bandTotal: brandItems.filter(other => groupBrand(other) === groupBrand(group)).length /* inclui o que vai para outras folhas */ } : {}) };
      }) });
    }
    if (prev) out.forEach(page => page.items.forEach(item => { let old = prev.get(item.group); if (old) { if (old.title) { item.title = old.title; if (old.titleHtml) item.titleHtml = old.titleHtml; } if (old.photo) item.photo = old.photo; if (old.wide) item.wide = true; if (old.liveCenter) item.liveCenter = true; if (old.photoSrc) item.photoSrc = old.photoSrc; if (old.rows) item.rows = old.rows; if (old.minQty !== undefined) item.minQty = old.minQty; if (old.links) item.links = old.links; if (old.showButton === false) item.showButton = false; if (old.flip) item.flip = true; if (old.linesOverride) item.linesOverride = old.linesOverride; ['titleScale', 'consult', 'acceptedTextIssues'].forEach(key => { if (old[key] !== undefined) item[key] = old[key]; }); } }));
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
    const cols = page.cols, base = page.baseRows || (page.baseRows = page.rows), isWide = item => item.wide && cols >= 2, each = page.sectioned && current.bandWidth === 'card' /* uma faixa em cada card */;
    for (let rows = base; ; rows++) {
      const total = rows * cols, taken = page.logoBox ? headerCell(page, rows) : -1, queue = page.items.slice(), spots = [], bands = [];
      const free = (c, span) => c % cols + span <= cols && c + span <= total && !(taken >= c && taken < c + span);
      let cell = 0, open = each && sharesRow(groupBrand(page.items[0].group), 0, cols) /* a marca anterior deixa dividir a linha; com a faixa em cada box, vale também para a continuação no topo da folha */;
      const put = (item, span) => { spots.push([item, cell, span]); cell += span; };
      while (queue.length && cell < total) {
        const item = queue.shift(), span = isWide(item) ? 2 : 1;
        if (item.band) { /* início de seção: a marca começa numa linha nova (ou ao lado da anterior, se a faixa for do tamanho dos cards) e a faixa vira uma linha EXTRA, curta, antes dela */
          const rest = queue.findIndex(entry => entry.band), segment = [item, ...queue.slice(0, rest < 0 ? queue.length : rest)], need = segment.reduce((sum, entry) => sum + (isWide(entry) ? 2 : 1), 0), small = sharesRow(item.band, Math.max(need, item.bandTotal || 0), cols);
          const beside = open && small && cell % cols && sharesRow(item.band, need, cols - cell % cols) && (each || !(taken >= cell && taken < cell + need));
          if (!beside && cell % cols) cell += cols - cell % cols;
          if (!each) bands.push({ vrow: Math.floor(cell / cols), brand: item.band, segment, small }); open = small && oneRow(cell, need, cols, taken);
        }
        while (cell < total && !free(cell, 1)) cell++;
        if (span === 2) while (cell < total && !free(cell, 2)) { const stop = queue.findIndex(entry => entry.band) /* o vão só é preenchido com produto da mesma marca */, next = queue.findIndex(entry => !isWide(entry)); if (next >= 0 && (stop < 0 || next < stop) && free(cell, 1)) put(queue.splice(next, 1)[0], 1); else cell++; }
        if (cell >= total) { queue.unshift(item); break; }
        put(item, span);
      }
      if (queue.length) continue; /* faltou espaço: tenta com mais uma linha */
      if (each) spots.forEach(([item, at]) => bands.push({ vrow: Math.floor(at / cols), item }));
      const bandRows = [...new Set(bands.map(band => band.vrow))] /* marcas lado a lado dividem a mesma linha de faixa */, realRow = vrow => vrow + bandRows.filter(row => row <= vrow).length; /* linha da grade = linha dos cards + faixas acima dela */
      spots.forEach(([item, at, span]) => { item.col = at % cols; item.gridRow = realRow(Math.floor(at / cols)); item.size = 1; item.span = span; });
      /* item.alone: único box da linha (e a célula do header compacto não está nela): só ele pode ser centralizado (item.liveCenter) */
      const perRow = {}; page.items.forEach(item => perRow[item.gridRow] = (perRow[item.gridRow] || 0) + item.span);
      page.items.forEach(item => item.alone = cols > 1 && item.span === 1 && perRow[item.gridRow] === 1 && !(taken >= 0 && realRow(Math.floor(taken / cols)) === item.gridRow));
      page.items.forEach(item => { if (!item.alone) delete item.liveCenter; }); /* deixou de estar sozinho na linha: perde a centralização (não volta sozinha depois) */
      page.rows = rows + bandRows.length;
      const filled = fillRows(page, taken >= 0 ? realRow(Math.floor(taken / cols)) : -1);
      /* células sem box que ainda dá para preencher; nas seções, as linhas sem produto no fim da folha não são de marca nenhuma */
      /* faixa estreita: só quando os cards da marca estão numa linha; um card sozinho e centralizado leva a faixa junto */
      page.bands = bands.map(({ vrow, brand, segment, small, item }) => {
        const row = realRow(vrow) - 1;
        if (item) { /* faixa do próprio card: acompanha a largura, o destaque, o equilíbrio e a centralização dele */
          const own = groupBrand(item.group);
          return item.fit ? { row, brand: own, fit: item.fit, span: item.span } : item.liveCenter && item.alone ? { row, brand: own, center: true } : { row, brand: own, col: item.col, span: item.span };
        }
        const first = segment[0];
        if (!small || segment.some(entry => entry.gridRow !== first.gridRow)) return { row, brand };
        if (first.liveCenter && first.alone) return { row, brand, center: true };
        const col = Math.min(...segment.map(entry => entry.col));
        return { row, brand, col, span: Math.max(...segment.map(entry => entry.col + entry.span)) - col };
      });
      page.empty = page.sectioned ? page.gaps.reduce((sum, gap) => sum + (gap.balanced ? 0 : gap.free), 0) : total - ((page.logoBox ? 1 : 0) + page.items.reduce((sum, item) => sum + item.span, 0)) - filled;
      return;
    }
  }

  /* Linhas incompletas (page.gaps). No formato retângulos, quando a marca ou o template pede "equilibrar", os boxes da linha dividem a largura
     livre na proporção das colunas que ocupam (item.fit). `boxRow` = linha do header compacto. Devolve quantas células essa divisão preencheu. */
  function fillRows(page, boxRow) {
    let filled = 0; page.gaps = []; page.items.forEach(item => delete item.fit);
    [...new Set(page.items.map(item => item.gridRow))].forEach(row => {
      const list = page.items.filter(item => item.gridRow === row).sort((a, b) => a.col - b.col), used = list.reduce((sum, item) => sum + item.span, 0), avail = page.cols - (row === boxRow ? 1 : 0), free = avail - used;
      if (free <= 0) return;
      const brands = page.sectioned ? [...new Set(list.map(item => groupBrand(item.group)))] : [page.brand], brand = brands[0], balanced = brands.length === 1 && balances(brand);
      page.gaps.push({ row, brand, ...(brands.length > 1 ? { brands } : {}), free, balanced });
      if (!balanced) return;
      filled += free; let before = 0;
      list.forEach((item, index) => {
        item.fit = { index, count: list.length, before, total: used, units: avail * item.span / used, box: row !== boxRow ? '' : (page.corner || 'tl')[1] === 'l' ? 'left' : 'right' };
        before += item.span; item.alone = false; delete item.liveCenter;
      });
    });
    return filled;
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

  window.CartazPagination = { paginate, sectionStarts, groupBrand, link, unlink, insertItem, twoCodeColumns, setConfig, setFillSource, resolve, placeLive, DEFAULT_CONFIG };
})();
