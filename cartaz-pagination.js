// Distribuição dos produtos do Gerador de Cartazes em páginas (A4/A3) e vínculo/desvínculo de marcas.
// Funções puras (sem DOM): recebem e devolvem listas de páginas, para poderem ser testadas em tests/cartaz-pagination.test.html.
(function () {
  const groupBrand = group => group.rows.map(row => row.brand).find(Boolean) || 'SEM MARCA';

  /* Distribui os produtos de UMA marca (ou de várias vinculadas, `members`) em páginas: A4 até 12 produtos,
     A3 acima disso, e a regra de linhas/colunas de sempre. `prev` devolve título e foto já editados de cada
     produto quando as páginas são redistribuídas (vincular/desvincular). */
  function paginate(brandName, brandItems, members, prev) {
    let out = [];
    let format = (brandItems.length > 6 && brandItems.length <= 9) || brandItems.length > 12 ? 'A3' : 'A4' /* até 6 = 1 folha A4; 7 a 9 = 1 folha A3; 10 a 12 = A4 em duas; acima de 12 = A3 */, capacity = format === 'A4' ? 6 : 9, columns = format === 'A4' ? 2 : 3, total = Math.ceil(brandItems.length / capacity), base = Math.floor(brandItems.length / total), extra = brandItems.length % total, start = 0;
    for (let pageIndex = 0; pageIndex < total; pageIndex++) {
      let count = base + (pageIndex < extra ? 1 : 0), pageGroups = brandItems.slice(start, start += count), remainder = pageGroups.length % columns, lastRowIndex = Math.floor((pageGroups.length - 1) / columns), lastRowGroups = pageGroups.filter((group, index) => Math.floor(index / columns) === lastRowIndex), codeExtra = group => group.rows.length > 20 ? Math.min(150, Math.ceil((group.rows.length - 20) / 2) * 16 + 8) : 0, pairedExtraHeight = format === 'A4' && pageGroups.length <= 4 && lastRowGroups.length === 2 ? Math.max(...lastRowGroups.map(codeExtra)) : 0;
      out.push({ name: brandName + ' · ' + format + ' · pág ' + (pageIndex + 1) + '/' + total, brand: brandName, ...(members ? { brands: members } : {}), format, capacity, items: pageGroups.map((group, index) => {
        let lastRow = Math.floor(index / columns) === lastRowIndex, col = index % columns, center = format === 'A4' && lastRow && remainder === 1, pair = format === 'A3' && lastRow && remainder === 2;
        if (format === 'A3' && lastRow && remainder === 1) col = 1;
        let extraHeight = center && pageGroups.length <= 3 ? codeExtra(group) : (lastRow ? pairedExtraHeight : 0); return { group, col, gridRow: Math.floor(index / columns), size: 1, center, pair, extraHeight };
      }) });
    }
    if (prev) out.forEach(page => page.items.forEach(item => { let old = prev.get(item.group); if (old) { if (old.title) { item.title = old.title; if (old.titleHtml) item.titleHtml = old.titleHtml; } if (old.photo) item.photo = old.photo; } }));
    return out;
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

  window.CartazPagination = { paginate, groupBrand, link, unlink, insertItem };
})();
