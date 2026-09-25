/* Gerador de Código de Barras: EAN-13 (e UPC-A, que é EAN-13 com 0 na frente), EAN-8 e ITF-14
   (GTIN-14/DUN-14 das embalagens sub e master, com moldura bearer bar).
   A geometria (layout) é única e alimenta a prévia SVG, o PNG (canvas) e o WMF (binário),
   então os três saem idênticos. Sem dependências além de XLSX/JSZip, que só a tela usa. */
(function () {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
    G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'],
    R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
    I = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'], // ITF: 1 = barra/espaço largo
    P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  // Alturas nominais da norma GS1 em módulos: barras do EAN-13 ≈ 22,85 mm / 0,33 mm; do ITF-14 ≈ 32 mm / 1,016 mm.
  // "height" (%) é a fração dessa altura, como o campo Height do Zoner Barcode Studio (padrão dele: 50%).
  const EAN_BAR = 69, GUARD_EXTRA = 5, FONT = 11, ITF_BAR = 31.5, DEFAULT_HEIGHT = 50;
  const pct = h => Math.min(100, Math.max(20, +h || DEFAULT_HEIGHT));

  // dígito verificador GS1: pesos 3,1,3,1… a partir do último dígito do corpo
  function check(payload) {
    let s = 0;
    for (let i = payload.length - 1, w = 3; i >= 0; i--, w = 4 - w) s += +payload[i] * w;
    return (10 - s % 10) % 10;
  }

  // texto da célula → { code, note } ou { error }. 12 dígitos: UPC-A válido ganha 0 na frente (também
  // recupera o EAN-13 que o Excel deixou sem o zero inicial); senão é EAN-13 sem o dígito verificador.
  function normalize(raw) {
    const d = String(raw ?? '').trim().replace(/\.0+$/, '').replace(/\D/g, '');
    if (!d) return { empty: true };
    if (d.length === 14 || d.length === 13 || d.length === 8) {
      const want = check(d.slice(0, -1));
      return want === +d.slice(-1) ? { code: d } : { error: 'dígito verificador inválido (o correto seria ' + want + ')', fix: d.slice(0, -1) + want };
    }
    if (d.length === 12) {
      if (check(d.slice(0, 11)) === +d[11]) return { code: '0' + d };
      return { code: d + check(d), note: 'dígito verificador calculado' };
    }
    if (d.length === 7) return { code: d + check(d), note: 'dígito verificador calculado' };
    return { error: d.length + ' dígitos — aceito EAN-13/UPC-A (12–13), EAN-8 (7–8) e ITF-14 (14)' };
  }

  // { w, h, base, font, rects:[{x,y,w,h}], texts:[{s,x}] } numa unidade própria de cada tipo: 1 = menor barra
  // (EAN); 0,5 módulo (ITF-14, para caber a razão 2,5:1 entre barra larga e estreita em números inteiros).
  // ITF-14 no padrão do Zoner: barra larga 2,5×, zona de silêncio de 10 módulos e 2 faixas (bearer bars)
  // horizontais de 2 módulos, sem laterais; os dígitos ficam logo abaixo, distribuídos pelo símbolo.
  function layoutItf(code, height) {
    const M = 4, T = 4, Q = 20, N = 2, Wd = 5, BH = Math.round(2 * ITF_BAR * pct(height) / 100), x0 = M + Q, bars = [];
    let x = x0;
    const put = (w, bar) => { if (bar) bars.push({ x, y: M + T, w, h: BH }); x += w; };
    [N, N, N, N].forEach((w, i) => put(w, i % 2 === 0));
    for (let i = 0; i < 14; i += 2)
      for (let k = 0; k < 5; k++) { put(I[+code[i]][k] === '1' ? Wd : N, true); put(I[+code[i + 1]][k] === '1' ? Wd : N, false); }
    put(Wd, true); put(N, false); put(N, true);
    const w = x + Q + M, bottom = M + T + BH + T, texts = [...code].map((s, i) => ({ s, x: x0 + 16 + 16 * i }));
    return { w, h: bottom + 15, base: bottom + 10, font: 12, texts, rects: [...bars,
      { x: M, y: M, w: w - 2 * M, h: T }, { x: M, y: M + T + BH, w: w - 2 * M, h: T }] };
  }

  function layout(code, { height } = {}) {
    if (code.length === 14) return layoutItf(code, height);
    const is13 = code.length === 13, q = is13 ? 11 : 7, barH = Math.round(EAN_BAR * pct(height) / 100);
    let bits = '101';
    if (is13) {
      for (let i = 1; i < 7; i++) bits += (P[+code[0]][i - 1] === 'L' ? L : G)[+code[i]];
      bits += '01010';
      for (let i = 7; i < 13; i++) bits += R[+code[i]];
    } else {
      for (let i = 0; i < 4; i++) bits += L[+code[i]];
      bits += '01010';
      for (let i = 4; i < 8; i++) bits += R[+code[i]];
    }
    bits += '101';
    const mid = is13 ? 45 : 31, guard = i => i < 3 || (i >= mid && i < mid + 5) || i >= bits.length - 3;
    const rects = [];
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== '1') continue;
      const h = barH + (guard(i) ? GUARD_EXTRA : 0), last = rects[rects.length - 1];
      if (last && last.x + last.w === q + i && last.h === h) last.w++;
      else rects.push({ x: q + i, y: 0, w: 1, h });
    }
    const texts = [], half = is13 ? 6 : 4, left = is13 ? code.slice(1, 7) : code.slice(0, 4), right = code.slice(-half);
    if (is13) texts.push({ s: code[0], x: q - 5.5 });
    [...left].forEach((s, i) => texts.push({ s, x: q + 3 + 7 * i + 3.5 }));
    [...right].forEach((s, i) => texts.push({ s, x: q + mid + 5 + 7 * i + 3.5 }));
    return { w: q + bits.length + 7, h: barH + 16, base: barH + 12, font: FONT, rects, texts };
  }

  function svg(code, opts) {
    const l = layout(code, opts);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + l.w + ' ' + l.h + '" role="img" aria-label="Código de barras ' + code + '"><rect width="' + l.w + '" height="' + l.h + '" fill="#fff"/>' +
      l.rects.map(r => '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>').join('') +
      '<g font-family="Arial,Helvetica,sans-serif" font-size="' + l.font + '" text-anchor="middle">' +
      l.texts.map(t => '<text x="' + t.x + '" y="' + l.base + '">' + t.s + '</text>').join('') + '</g></svg>';
  }

  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0) } return t })();
  const crc32 = u => { let c = ~0; for (const b of u) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0 };

  // grava o tamanho físico (chunk pHYs, pixels por metro) logo depois do IHDR, para o PNG abrir no tamanho certo
  function withDpi(png, ppm) {
    const d = new Uint8Array(21), v = new DataView(d.buffer);
    v.setUint32(0, 9); d.set([0x70, 0x48, 0x59, 0x73], 4); v.setUint32(8, ppm); v.setUint32(12, ppm); d[16] = 1;
    v.setUint32(17, crc32(d.subarray(4, 17)));
    const out = new Uint8Array(png.length + 21);
    out.set(png.subarray(0, 33)); out.set(d, 33); out.set(png.subarray(33), 54);
    return out;
  }

  // PNG opaco (fundo branco) com largura mm (imagem inteira, com margens) e resolução dpi. Os pixels por
  // módulo são inteiros (barras nítidas, sem borrar); por isso a resolução efetiva pode variar um pouco
  // do dpi pedido, e é ela que vai gravada no arquivo para manter a largura em mm.
  function png(code, { mm = 50, dpi = 600, height } = {}) {
    const l = layout(code, { height }), px = Math.max(1, Math.min(Math.floor(8000 / l.w), Math.round(mm / 25.4 * dpi / l.w)));
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = l.w * px; c.height = l.h * px;
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#000';
    l.rects.forEach(r => x.fillRect(r.x * px, r.y * px, r.w * px, r.h * px));
    x.font = l.font * px + 'px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    l.texts.forEach(t => x.fillText(t.s, t.x * px, l.base * px));
    return new Promise(ok => c.toBlob(async b => ok(new Blob([withDpi(new Uint8Array(await b.arrayBuffer()), Math.round(c.width / (mm / 1000)))], { type: 'image/png' })), 'image/png'));
  }

  // WMF "placeable" vetorial, fundo transparente, 1 módulo = 20 unidades. Com mm, a escala (unidades por
  // polegada) é ajustada para o desenho inteiro ter essa largura; sem, fica em 1440/pol (~0,35 mm por módulo).
  // Abre no CorelDRAW/Illustrator/Word; o texto usa Arial (fonte precisa existir no PC que abrir).
  function wmf(code, { mm, height } = {}) {
    const U = 20, l = layout(code, { height }), W = l.w * U, Hh = l.h * U, w = [];
    let maxRec = 0;
    const rec = (fn, ...p) => { const n = 3 + p.length; maxRec = Math.max(maxRec, n); w.push(n & 0xFFFF, n >>> 16, fn, ...p.map(v => v & 0xFFFF)); };
    const packed = s => { const o = []; for (let i = 0; i < s.length; i += 2) o.push(s.charCodeAt(i) | ((s.charCodeAt(i + 1) || 0) << 8)); return o; };
    rec(0x0103, 8);                        // SetMapMode ANISOTROPIC
    rec(0x020B, 0, 0);                     // SetWindowOrg
    rec(0x020C, Hh, W);                    // SetWindowExt (y, x)
    rec(0x0102, 1);                        // SetBkMode TRANSPARENT
    rec(0x012E, 30, 0);                    // SetTextAlign BASELINE|CENTER
    rec(0x02FA, 5, 0, 0, 0, 0);            // CreatePenIndirect PS_NULL          (objeto 0)
    rec(0x02FC, 0, 0, 0, 0);               // CreateBrushIndirect sólido preto   (objeto 1)
    rec(0x02FB, -l.font * U, 0, 0, 0, 400, 0, 0, 0, 0, ...packed('Arial\0'.padEnd(32, '\0'))); // CreateFontIndirect (objeto 2)
    rec(0x012D, 0); rec(0x012D, 1); rec(0x012D, 2);
    l.rects.forEach(r => rec(0x041B, (r.y + r.h) * U, (r.x + r.w) * U, r.y * U, r.x * U)); // Rectangle (bottom,right,top,left)
    l.texts.forEach(t => rec(0x0521, 1, ...packed(t.s), l.base * U, Math.round(t.x * U))); // TextOut (len, texto, y, x)
    rec(0);                                // EOF
    const head = [1, 9, 0x0300, 0, 0, 3, 0, 0, 0], total = head.length + w.length;
    head[3] = total & 0xFFFF; head[4] = total >>> 16; head[6] = maxRec & 0xFFFF; head[7] = maxRec >>> 16;
    const place = [0xCDD7, 0x9AC6, 0, 0, 0, W, Hh, mm ? Math.min(0xFFFF, Math.round(W * 25.4 / mm)) : 1440, 0, 0];
    place.push(place.reduce((a, v) => a ^ v, 0));
    const all = [...place, ...head, ...w], buf = new DataView(new ArrayBuffer(all.length * 2));
    all.forEach((v, i) => buf.setUint16(i * 2, v & 0xFFFF, true));
    return new Blob([buf.buffer], { type: 'image/x-wmf' });
  }

  // Planilha: acha a coluna pelo cabeçalho ("CÓDIGO DE BARRAS", "COD. BARRAS", "EAN", "GTIN"…).
  // "CÓDIGO" sozinho não conta: é outra informação (código do produto).
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const isBarcodeHeader = h => /BARRA|\b(EAN|GTIN)\d*\b/.test(norm(h));
  const isPcodeHeader = h => /^(COD|CODIGO|SKU|REF|REFERENCIA|ITEM)( (DO )?(PRODUTO|PROD|ITEM|OVD|FG))?$/.test(norm(h));
  const isDescHeader = h => !isPcodeHeader(h) && /DESCRI|TITULO|NOME|PRODUTO/.test(norm(h));

  // rows: matriz (sheet_to_json header:1); row0/col0 = linha/coluna (0-based) onde a matriz começa na planilha.
  // Cada item traz row (1-based) e col (0-based) da célula. Retorna null se não há coluna de código de barras.
  function fromRows(rows, { row0 = 0, col0 = 0 } = {}) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const col = rows[r].findIndex(isBarcodeHeader);
      if (col < 0) continue;
      const desc = rows[r].findIndex((h, i) => i !== col && isDescHeader(h)), pc = rows[r].findIndex((h, i) => i !== col && isPcodeHeader(h));
      return rows.slice(r + 1).map((row, k) => ({ raw: row[col], desc: desc < 0 ? '' : String(row[desc] ?? '').trim(), pcode: pc < 0 ? '' : String(row[pc] ?? '').trim(), row: row0 + r + k + 2, col: col0 + col })).filter(x => String(x.raw ?? '').trim() !== '');
    }
    return null;
  }

  window.BarcodeGen = { check, normalize, layout, svg, png, wmf, fromRows };
})();
