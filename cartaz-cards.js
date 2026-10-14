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
      .filter(({ page, item }) => norm(plainTitle(item) + ' ' + lines(item).map(row => row.code).join(' ') + ' ' + page.brand).includes(q));
  }

  /* Nova lista com `item` trocado de lugar com o vizinho (step = -1 sobe, +1 desce); null nos extremos. */
  function move(items, item, step) {
    const from = items.indexOf(item), to = from + step; if (from < 0 || to < 0 || to >= items.length) return null;
    const next = items.slice(); [next[from], next[to]] = [next[to], next[from]]; return next;
  }

  const sameOrder = (pages, items) => { const before = pages.flatMap(page => page.items); return items.length === before.length && items.every((item, i) => item === before[i]); };

  /* Distribui `items` (nova ordem da marca) pelas folhas dela mantendo a quantidade de cada folha, e reposiciona cada folha. */
  function distribute(pages, items) {
    const counts = pages.map(page => page.items.length); let pos = 0;
    pages.forEach((page, i) => { page.items = items.slice(pos, pos += counts[i]); global.CartazPagination.placeLive(page); });
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
     (o destaque divide os códigos em duas tabelas, então é o que mais ganha); em empate, o que está mais ao fim da folha. */
  function emptyHint(page) {
    if (!page.empty || page.cols < 2) return null;
    const candidates = page.items.filter(item => !item.wide); if (!candidates.length) return null;
    const pos = item => item.gridRow * page.cols + item.col;
    const best = candidates.reduce((a, b) => (lines(b).length > lines(a).length || (lines(b).length === lines(a).length && pos(b) > pos(a)) ? b : a));
    return { empty: page.empty, item: best };
  }

  global.CartazCards = { t, norm, lines, minQty, plainTitle, search, move, sameOrder, distribute, setField, addRow, removeRow, emptyHint };
})(window);
