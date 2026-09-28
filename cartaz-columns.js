// Identifica, numa planilha importada no Gerador de Cartazes, as colunas de código do produto,
// título do card, código de barras (vários tamanhos/tipos), marca, código FG e preço.
// Primeiro pelo nome do cabeçalho (sinônimos, sem exigir título exato); o que ficar sem coluna é
// deduzido pelo conteúdo. Nada aqui assume tamanho do código: o de 10 dígitos da OVD é só o comum.
(function () {
  const norm = x => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const BARCODE_LENGTHS = [8, 12, 13, 14]; // EAN-8, UPC-A, EAN-13, GTIN-14/ITF-14
  const OLD = /antigo|velho|anterior|errad|obsolet|old/;

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
    cols.title = pick(k => /titulo|nome|descri|produto/.test(k) && !/cod|varia/.test(k), k => /titulo/.test(k));
    cols.brand = pick(k => /marca/.test(k));
    cols.fg = pick(k => /cod/.test(k) && /fg/.test(k));
    cols.price = pick(k => /preco|valor/.test(k));

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
    const free = () => heads.map(x => x.h).filter(h => !used().includes(h));
    const best = (list, score) => list.map(h => ({ h, s: score(stat(h)) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0]?.h;
    if (!cols.barcode) cols.barcode = best(free(), s => s.digits >= .8 && BARCODE_LENGTHS.includes(s.topLen) ? s.count : 0);
    if (!cols.ovd) cols.ovd = best(free(), s => s.digits >= .8 ? s.count : 0);
    if (!cols.title) cols.title = best(free(), s => s.digits < .3 ? s.avg * s.count : 0);
    return cols;
  }

  window.CartazColumns = { detect, norm, BARCODE_LENGTHS };
})();
