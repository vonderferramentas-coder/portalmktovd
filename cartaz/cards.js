/* Regras do painel "Cards da marca" do Gerador de Cartazes (Live Shop): busca, mover, redistribuir nas folhas, edição de campos e linhas,
   e a sugestão de destaque quando sobra espaço na folha. Sem DOM do painel, para poder ser testado em tests/cartaz-cards.test.html. */
(function (global) {
  const t = value => String(value ?? '').trim();
  const norm = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const lines = item => item.rows || item.group.rows;
  const minQty = item => item.minQty ?? item.group.minQty ?? '';
  const plainTitle = item => item.titleHtml ? t(new DOMParser().parseFromString(item.titleHtml, 'text/html').body.textContent) : (item.title || t(item.group.title));

  /* Produtos de TODAS as marcas cujo título, códigos ou nome da marca contêm o texto (sem maiúsculas/acentos). `id` = "página:posição" na lista de páginas. */
  function search(pages, text) {
    const q = norm(t(text)); if (!q) return [];
    return pages.flatMap((page, pi) => page.items.map((item, ii) => ({ page, item, id: pi + ':' + ii })))
      .filter(({ page, item }) => norm(plainTitle(item) + ' ' + lines(item).map(row => row.code).join(' ') + ' ' + brandOf(page, item)).includes(q));
  }
  /* Marca de um produto: nas folhas em seções (várias marcas) vem do próprio produto; nas demais, da folha. */
  const brandOf = (page, item) => page.sectioned ? global.CartazPagination.groupBrand(item.group) : page.brand;

  /* Códigos editados à mão no layout da Feira (item.linesOverride) viram as linhas do produto, para não se perderem na conversão para o Live Shop. */
  function adoptOverride(item) {
    if (!item.linesOverride || item.rows) return;
    const codes = [...new DOMParser().parseFromString(item.linesOverride.html, 'text/html').querySelectorAll('.cd')].map(el => t(el.textContent)).filter(Boolean);
    const source = item.group.rows, key = value => String(value).replace(/\s/g, '');
    if (codes.length) item.rows = codes.map((code, i) => ({ desc: (source.find(row => key(row.code) === key(code)) || (codes.length === source.length ? source[i] : {})).desc || '', code }));
  }

  /* Nova lista com `item` trocado de lugar com o vizinho (step = -1 sobe, +1 desce); null nos extremos. */
  function move(items, item, step) {
    const from = items.indexOf(item), to = from + step; if (from < 0 || to < 0 || to >= items.length) return null;
    const next = items.slice(); [next[from], next[to]] = [next[to], next[from]]; return next;
  }

  /* `items` = produtos de UMA marca na nova ordem. Nas folhas em seções elas também têm produtos de outras marcas, que ficam onde estão. */
  const sameOrder = (pages, items) => { const mine = new Set(items), before = pages.flatMap(page => page.items).filter(item => mine.has(item)); return items.length === before.length && items.every((item, i) => item === before[i]); };

  /* Distribui `items` pelas posições que a marca já ocupa (cada folha mantém a quantidade) e reposiciona cada folha. */
  function distribute(pages, items) {
    const mine = new Set(items), queue = items.slice(), head = items.find(item => item.band);
    if (head) { const { band, bandTotal } = head; items.forEach(item => { delete item.band; delete item.bandTotal; }); Object.assign(items[0], { band, bandTotal }); } /* seções: a faixa da marca acompanha o 1º produto */
    pages.forEach(page => { page.items = page.items.map(item => mine.has(item) ? queue.shift() : item); global.CartazPagination.placeLive(page); });
  }

  /* Edição no próprio item (o grupo é compartilhado com a fonte de dados e com as outras folhas). kind: t título, q quantidade mínima, d descrição, c código. */
  const ownRows = item => item.rows || (item.rows = item.group.rows.map(row => ({ desc: row.desc, code: row.code })));
  function setField(item, kind, rowIndex, value) {
    if (kind === 't') { item.title = value; delete item.titleHtml; }
    else if (kind === 'q') item.minQty = value;
    else ownRows(item)[rowIndex][kind === 'd' ? 'desc' : 'code'] = value;
  }
  function addRow(item) { ownRows(item).push({ desc: '', code: '' }); }
  function removeRow(item, rowIndex) { const rows = ownRows(item); if (rows.length < 2) return false; rows.splice(rowIndex, 1); return true; }

  /* Folha Live Shop com células vazias (page.empty, calculado em CartazPagination.placeLive): sugere como destaque o produto com mais linhas na tabela
     (o destaque divide os códigos em duas tabelas, então é o que mais ganha); em empate, o que está mais ao fim da folha. Nas folhas em seções, `brand`
     limita a contagem e a sugestão às linhas daquela marca. Linhas equilibradas (item.fit) não têm sobra. */
  function emptyHint(page, brand) {
    const gaps = (page.gaps || []).filter(gap => !gap.balanced && (!brand || (gap.brands || [gap.brand]).includes(brand)));
    const empty = page.sectioned ? gaps.reduce((sum, gap) => sum + gap.free, 0) : page.empty;
    if (!empty || page.cols < 2) return null;
    const rows = page.sectioned && new Set(gaps.map(gap => gap.row));
    const candidates = page.items.filter(item => !item.wide && !item.fit && (!rows || (rows.has(item.gridRow) && (!brand || brandOf(page, item) === brand)))); if (!candidates.length) return null;
    const pos = item => item.gridRow * page.cols + item.col;
    const best = candidates.reduce((a, b) => (lines(b).length > lines(a).length || (lines(b).length === lines(a).length && pos(b) > pos(a)) ? b : a));
    return { empty, item: best };
  }

  /* Tamanho da logo no box da marca: por ÁREA, não por "caber": a logo larga fica mais baixa e a alta usa toda a altura, com peso visual parecido. `fill` = parte da altura do box usada
     pela logo alta; `zoom` = ajuste manual da marca, limitado ao box (capped). */
  function logoSize(ratio, boxW, boxH, fill, zoom) {
    const full = boxH * fill; let h = Math.min(full, Math.sqrt(2 * full * full / ratio)), w = h * ratio;
    if (w > boxW * .75) { w = boxW * .75; h = w / ratio; }
    const scale = Math.min(zoom, (boxW - 20) / w, (boxH - 4) / h) /* 20 = recuo lateral dos boxes */;
    return { w: w * scale, h: h * scale, capped: scale < zoom };
  }
  global.CartazCards = { logoSize, t, norm, lines, minQty, plainTitle, brandOf, adoptOverride, search, move, sameOrder, distribute, setField, addRow, removeRow, emptyHint };
})(window);
