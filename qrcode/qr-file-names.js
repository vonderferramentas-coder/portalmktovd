// Importação em lote de QR Codes: transforma a 1ª aba da planilha em itens com o nome de arquivo ordem-nome-marca-divisão
// (ex.: 1-fitas-isolantes-3M-dismatal). Sem DOM, para ser testado em tests/qr-file-names.test.html.
(function () {
  const plain = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = value => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const key = value => slug(value).replace(/-/g, '');
  const STOP = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'para', 'em', 'com', 'sem', 'por']);

  // marca em maiúsculas: o hífen interno some (WD-40 vira WD40) e o espaço vira hífen (GEDORE RED vira GEDORE-RED)
  const brandPart = brand => plain(brand).toUpperCase().split(/\s+/).map(word => word.replace(/[^A-Z0-9]/g, '')).filter(Boolean).join('-');

  // "Nome do arquivo" preenchido vale como está; senão, as 2 primeiras palavras do "Nome na tela" antes da vírgula. A marca não se repete.
  // ponytail: mantém o plural da planilha; para outro nome, preencher "Nome do arquivo".
  function itemPart(typed, screen, brand) {
    const brandWords = new Set(String(brand ?? '').split(/\s+/).map(key).filter(Boolean));
    const noBrand = text => String(text ?? '').split(/\s+/).filter(word => !brandWords.has(key(word))).join(' ');
    if (key(typed)) return slug(noBrand(typed));
    const first = String(screen ?? '').split(/,(?!\d)|(?<!\d),/)[0]; // a vírgula de "7,5 m" não encerra o nome
    return noBrand(first).split(/[\s/]+/).map(slug).filter(word => word && !STOP.has(word)).slice(0, 2).join('-'); // "tico-tico" é uma palavra
  }

  // divisão = o que sobra do título da coluna do link: "OSTEN LINK QR CODES" vira "osten"
  const division = header => slug(header).split('-').filter(word => !/^(links?|qr|qrcodes?|codes?|url)$/.test(word)).join('-');

  /* `table` = linhas da planilha (a 1ª é o cabeçalho), tudo em texto; `valid` diz se a célula é um link. A ordem conta as linhas que têm link,
     por isso o mesmo produto fica com o mesmo número em todas as divisões. */
  function items(table, valid) {
    const head = table[0] || [], body = table.slice(1), find = name => head.findIndex(title => key(title) === name);
    const typed = find('nomedoarquivo'), screen = find('nomenatela'), brand = find('marca');
    const order = new Map(body.filter(row => row.some(valid)).map((row, i) => [row, i + 1]));
    return head.flatMap((title, c) => body.filter(row => valid(row[c])).map(row => {
      const col = title || 'Coluna ' + (c + 1), name = itemPart(row[typed], row[screen], row[brand]), mark = brandPart(row[brand]);
      const file = [order.get(row), name || (mark ? '' : 'qr'), mark, division(title)].filter(Boolean).join('-');
      return { name: file, file, folder: division(title) || slug(col), url: row[c], col };
    }));
  }

  // nome digitado na edição de um QR Code: vira nome de arquivo sem perder as maiúsculas da marca
  const fileSafe = value => plain(value).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const isNameColumn = header => ['nomedoarquivo', 'nomenatela', 'marca'].includes(key(header));

  window.QrFileNames = { items, fileSafe, isNameColumn };
})();
