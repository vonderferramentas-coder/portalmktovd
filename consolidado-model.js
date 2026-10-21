(function (global) {
  'use strict';

  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const text = value => String(value ?? '').replace(/&nbsp;/gi, ' ').replace(/\uFFFD/g, '').replace(/\s+/g, ' ').trim();
  const digits = value => text(value).replace(/\.0$/, '').replace(/\D/g, '');
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  function findColumn(headers, tests) {
    return headers.findIndex(header => tests.some(test => test(normalize(header))));
  }

  function detectColumns(rows) {
    const headers = rows[0] || [];
    const call = findColumn(headers, [value => value.includes('chamado')]);
    const code = findColumn(headers, [value => value === 'codigo', value => value.includes('codigo ovd')]);
    let title = findColumn(headers, [value => /titulo|descricao|produto/.test(value)]);
    if (title < 0) {
      title = headers.map((_, column) => ({ column, score: rows.slice(1, 15).filter(row => /[a-zA-ZÀ-ÿ]{4}/.test(text(row[column]))).length }))
        .filter(candidate => candidate.column !== call && candidate.column !== code)
        .sort((a, b) => b.score - a.score)[0]?.column ?? -1;
    }
    if (code < 0 || title < 0) throw new Error('Não identifiquei as colunas de código e produto na planilha.');
    return { call, code, title };
  }

  function displayTitle(value) {
    return text(value).replace(/\s+VONDER(?:®)?\s*$/i, '').replace(/^VONDER\s*-\s*/i, '').trim();
  }

  // Seções do informativo, na ordem em que aparecem. Nove54/DWT/Toolmix são marcas próprias com faixa colorida e só entram em alguns consolidados.
  const BRANDS = [
    { key: 'vonder', label: 'VONDER' },
    { key: 'nove54', label: 'Nove54', color: '#d9000d', logo: 'NOVE54 B' }, // CMYK 15/100/95/0
    { key: 'dwt', label: 'DWT', color: '#ab2328', logo: 'DWT B' },
    { key: 'toolmix', label: 'Toolmix', color: '#f26522', logo: 'TOOLMIX_vazada_branco' }, // logo todo branco sobre o fundo laranja (vetor extraído do .ai oficial vazado)
    { key: 'multi', label: 'Multimarcas' }
  ];
  // Itens salvos antes das marcas próprias só têm `multi`.
  const brandOf = item => item.brand || (item.multi ? 'multi' : 'vonder');

  // Marca pelo título: VONDER/VD manda; depois as marcas próprias; senão vale uma marca conhecida ou, genericamente, uma marca em CAIXA ALTA no fim do título (Multimarcas).
  const OTHER_BRANDS = /\b(NORTON|CLIPPER|R[ÖO]HM|QUARTZOLIT|TASCHIBRA)\b/i;
  function detectBrand(title) {
    const value = text(title).replace(/[,\s]+$/, '');
    if (/\b(VONDER|VD)\b/i.test(value)) return 'vonder';
    if (/\bNOVE ?54\b/i.test(value)) return 'nove54';
    if (/\bDWT\b/i.test(value)) return 'dwt';
    if (/\bTOOLMIX\b/i.test(value)) return 'toolmix';
    return OTHER_BRANDS.test(value) || /(?:,|\s-)\s*[A-ZÀ-Ý][A-ZÀ-Ý &.]{3,}$/.test(value) ? 'multi' : 'vonder';
  }

  function parseRows(rows) {
    const columns = detectColumns(rows);
    const groups = [];
    let current = null;
    rows.slice(1).forEach((row, offset) => {
      const code = digits(row[columns.code]);
      const sourceTitle = text(row[columns.title]);
      const call = columns.call < 0 ? '' : text(row[columns.call]).replace(/\.0$/, '');
      if (!code && !sourceTitle && !call) return;
      // linhas sem chamado de outra marca (ex.: NORTON CLIPPER logo após um produto VONDER) viram um produto próprio
      const brand = detectBrand(sourceTitle);
      if (call || !current || (brand !== current.brand && (brand !== 'vonder' || /\b(VONDER|VD)\b/i.test(sourceTitle)))) {
        current = { id: crypto.randomUUID(), call, title: displayTitle(sourceTitle) || 'Produto sem título', rows: [], link: '', photo: '', brand };
        groups.push(current);
      }
      if (!code && !sourceTitle) return;
      current.rows.push({ code, title: sourceTitle, sourceRow: offset + 2 });
    });
    return groups.filter(group => group.rows.length);
  }

  function monthNumber(name) {
    const key = normalize(name);
    const index = MONTHS.findIndex(month => normalize(month) === key);
    return index < 0 ? 0 : index + 1;
  }

  function monthLabel(value) {
    const [year, month] = String(value || '').split('-').map(Number);
    return year && month ? MONTHS[month - 1] + ' ' + year : '';
  }

  function formatCode(value) {
    const code = digits(value).padStart(10, '0');
    return code.length === 10 ? code.replace(/^(\d{2})(\d{2})(\d{3})(\d{3})$/, '$1.$2.$3.$4') : text(value);
  }

  function photoUrl(value) {
    const code = digits(value);
    return code ? (global.PORTAL_API || 'https://ecommerce-fg.vonderferramentas.workers.dev') + '/product-image?code=' + encodeURIComponent(code) : '';
  }

  global.ConsolidadoModel = { MONTHS, BRANDS, brandOf, parseRows, detectBrand, monthNumber, monthLabel, formatCode, photoUrl };
})(window);
