// Identifica, numa planilha importada no Gerador de Cartazes, as colunas de código do produto,
// título do card, código de barras (vários tamanhos/tipos), marca, código FG e preço.
// Primeiro pelo nome do cabeçalho (sinônimos, sem exigir título exato); o que ficar sem coluna é
// deduzido pelo conteúdo. Nada aqui assume tamanho do código: o de 10 dígitos da OVD é só o comum.
(function () {
  const norm = x => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const BARCODE_LENGTHS = [8, 12, 13, 14]; // EAN-8, UPC-A, EAN-13, GTIN-14/ITF-14
  const OLD = /antigo|velho|anterior|errad|obsolet|old/, PICTURE = /foto|imag|img|thumb|video/;

  function detect(headers, rows) {
    const heads = headers.map(h => ({ h, k: norm(h) })), cols = {};
    const pick = (test, prefer) => {
      const found = heads.filter(x => test(x.k));
      return (found.find(x => prefer && prefer(x.k)) || found[0] || {}).h;
    };
    // barras: "correto/atual" vence; colunas "antigo/errado" nunca são usadas
    cols.barcode = pick(k => !OLD.test(k) && /barra|gtin|^ean|principal/.test(k), k => /correto|atual|novo/.test(k));
    cols.ovd = pick(k => /cod|sku/.test(k) && !/barra|principal|fg|gtin/.test(k) && !OLD.test(k), k => /ovd/.test(k) && !/produto/.test(k))
      || pick(k => /ovd/.test(k));
    cols.productCode = pick(k => /ovd.*produto|produto.*ovd/.test(k));
    // "Descrição" só vira título se não houver outra coluna de nome: senão ela fica livre para a tabela Descrição do Live Shop (cols.desc)
    cols.title = pick(k => (/titulo/.test(k) || (/nome|produto/.test(k) && !/ovd|foto|imagem|linha|tipo|marca|link|url|categoria|grupo|familia/.test(k))) && !/cod|varia|descri/.test(k), k => /titulo/.test(k)) || pick(k => /descri/.test(k) && !/cod|varia/.test(k));
    cols.brand = pick(k => /marca/.test(k));
    cols.fg = pick(k => /cod/.test(k) && /fg/.test(k));
    cols.price = pick(k => /preco|valor/.test(k));
    // colunas do layout Live Shop: modelo de cada linha da tabela, link do QR/botão e quantidade mínima
    cols.desc = pick(k => /modelo|descri/.test(k) && !/cod/.test(k), k => /modelo/.test(k)); if (cols.desc === cols.title) cols.desc = undefined;
    // uma coluna de link por divisão ("LINK OSTEN", "LINK DISMATAL"...); a sem divisão no nome é o link genérico. ponytail: divisões fixas, igual a DIVISIONS em cartaz/generator.js
    cols.links = {}; heads.filter(x => /link|url/.test(x.k) && !PICTURE.test(x.k)).forEach(x => ['osten', 'dismatal', 'vonder'].forEach(id => { if (x.k.includes(id)) cols.links[id] = x.h; }));
    cols.link = pick(k => /link|url/.test(k) && !/osten|dismatal|vonder/.test(k) && !PICTURE.test(k));
    cols.minQty = pick(k => /minim|qtd|quant/.test(k));

    // Deduz pelo conteúdo o que o cabeçalho não entregou
    const sample = rows.slice(0, 300);
    const stat = h => {
      const v = sample.map(r => String(r[h] ?? '').trim().replace(/\.0$/, '')).filter(Boolean);
      const digits = v.filter(x => /^\d+$/.test(x)), len = {};
      digits.forEach(x => len[x.length] = (len[x.length] || 0) + 1);
      const top = Object.entries(len).sort((a, b) => b[1] - a[1])[0];
      return { count: v.length, digits: digits.length / (v.length || 1), topLen: top ? +top[0] : 0, avg: v.reduce((s, x) => s + x.length, 0) / (v.length || 1) };
    };
    const used = () => Object.values(cols);
    const free = () => heads.filter(x => !/link|url/.test(x.k) /* coluna de endereço nunca é deduzida como código ou título */ && !used().includes(x.h)).map(x => x.h);
    const best = (list, score) => list.map(h => ({ h, s: score(stat(h)) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0]?.h;
    if (!cols.barcode) cols.barcode = best(free(), s => s.digits >= .8 && BARCODE_LENGTHS.includes(s.topLen) ? s.count : 0);
    if (!cols.ovd) cols.ovd = best(free(), s => s.digits >= .8 ? s.count : 0);
    if (!cols.title) cols.title = best(free(), s => s.digits < .3 ? s.avg * s.count : 0);
    return cols;
  }

  // Linhas da planilha cujo código (coluna `header`) tem cor de preenchimento: a linha pintada é o produto principal do card.
  // Branco e "sem preenchimento" não contam. Precisa do XLSX lido com { cellStyles: true }.
  function markedRows(sheet, header, count) {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1'), cell = (r, c) => sheet[XLSX.utils.encode_cell({ r, c })];
    let col = range.s.c; while (col <= range.e.c && String(cell(range.s.r, col)?.v ?? '').trim() !== header) col++;
    return Array.from({ length: count }, (_, i) => {
      const fill = cell(range.s.r + 1 + i, col)?.s;
      return !!fill && fill.patternType === 'solid' && fill.fgColor?.theme !== 0 && !/^(FF)?FFFFFF$/i.test(fill.fgColor?.rgb || '');
    });
  }

  // Código OVD (só dígitos) -> código FG, a partir do catálogo (data/catalog-vonder.json). Produto sem codeFG fica de fora.
  const fgMap = catalog => new Map(catalog.filter(p => p.codeFG).map(p => [String(p.code).replace(/\D/g, ''), String(p.codeFG)]));

  // A logo `name` serve para a marca? Só por palavras inteiras: o mesmo nome, uma variação dele ("Loctite_consumo", "FamastilFerramentas" ou "3M_branco" para LOCTITE, FAMASTIL e 3M)
  // ou as primeiras palavras da marca ("Gedore" para GEDORE RED). Pedaço de palavra não vale ("GE" não é GEDORE, "Maxeb" não é Max), nem só a 1ª palavra em comum ("Santa Clara" não é Santa Luzia).
  function logoMatches(brand, name) {
    const plain = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''), key = norm(brand), full = norm(name);
    const parts = plain(name).replace(/([a-z])([A-Z])|([A-Za-z])(?=\d)|(\d)(?=[A-Za-z])/g, (m, low, up, letter, digit) => low ? low + ' ' + up : m + ' ').split(/[^A-Za-z0-9]+/).filter(Boolean), words = plain(brand).split(/[^A-Za-z0-9]+/).filter(Boolean);
    const leads = (list, target) => list.some((_, i) => norm(list.slice(0, i + 1).join('')) === target);
    return !!full && (leads(parts, key) || leads(words, full));
  }

  // Divisões (entre `ids`, na ordem deles) que têm link em algum produto: é o que a planilha pede quando o template não marca nenhuma.
  const linkedDivisions = (groups, ids) => ids.filter(id => groups.some(group => group.divLinks?.[id]));

  window.CartazColumns = { detect, norm, markedRows, fgMap, logoMatches, linkedDivisions, BARCODE_LENGTHS };
})();
