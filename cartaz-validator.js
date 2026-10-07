// Validador de textos do Gerador de Cartazes: aponta, no título de cada card, possíveis erros de
// acentuação e caracteres, pontuação, hífen, palavra em duplicidade, concordância e unidades de medida.
// Tudo por regras e dicionário local (nenhuma IA/API externa) - não é um corretor ortográfico completo:
// só pega o que está listado aqui. Para ampliar, acrescente entradas em ACCENTS / COMPOUNDS / FOREIGN /
// ADJECTIVES ou uma regra nova em check(); cada aviso traz find/replace para o botão "Corrigir".
(function () {
  const LETTER = 'A-Za-zÀ-ÿ';

  // Palavras do dia a dia de ferramentas/construção que aparecem sem acento ou cedilha (chave = sem acento).
  const ACCENTS = {};
  ('água agua|alumínio aluminio|luminária luminaria|caçula cacula|lança lanca|híbrido hibrido|instantâneo instantaneo|instantânea instantanea|' +
    'líquido liquido|líquida liquida|plástico plastico|plástica plastica|plásticos plasticos|plásticas plasticas|elétrico eletrico|elétrica eletrica|' +
    'elétricos eletricos|elétricas eletricas|eletrônico eletronico|eletrônica eletronica|hidráulico hidraulico|hidráulica hidraulica|pneumático pneumatico|' +
    'pneumática pneumatica|magnético magnetico|magnética magnetica|mecânico mecanico|mecânica mecanica|automático automatico|automática automatica|' +
    'veículo veiculo|veículos veiculos|aço aco|aços acos|lâmpada lampada|lâmpadas lampadas|lâmina lamina|lâminas laminas|máquina maquina|máquinas maquinas|' +
    'régua regua|réguas reguas|torquímetro torquimetro|paquímetro paquimetro|micrômetro micrometro|óculos oculos|proteção protecao|precisão precisao|' +
    'pressão pressao|conexão conexao|conexões conexoes|fixação fixacao|aplicação aplicacao|extensão extensao|iluminação iluminacao|rotação rotacao|' +
    'tensão tensao|potência potencia|vedação vedacao|medição medicao|gás gas|série serie|área area|nível nivel|níveis niveis|útil util|fácil facil|' +
    'difícil dificil|máxima maxima|máximo maximo|mínima minima|mínimo minimo|único unico|reforçado reforcado|reforçada reforcada|regulável regulavel|' +
    'ajustável ajustavel|descartável descartavel|retrátil retratil|telescópico telescopico|básico basico|técnico tecnico|cordão cordao|alça alca|' +
    'pinça pinca|portátil portatil|móveis moveis|cabeça cabeca|espaço espaco|traço traco|círculo circulo|estéreo estereo|' +
    'acético acetico|acética acetica|ácido acido|ácidos acidos|abrasão abrasao|ligação ligacao|espátula espatula|espátulas espatulas|ângulo angulo|ângulos angulos|' +
    'fósforo fosforo|tração tracao|ímã ima|ímãs imas|serviço servico|serviços servicos|edição edicao|' +
    'condição condicao|instalação instalacao|manutenção manutencao|construção construcao|vidraçaria vidracaria|serralheria serralheria').split('|')
    .forEach(pair => { const [good, plain] = pair.split(' '); if (good !== plain) ACCENTS[plain] = good; });

  // "PALAVRA PALAVRA" que se escreve com hífen
  const COMPOUNDS = ['lança chamas', 'porta ferramentas', 'porta cadeado', 'porta cadeados', 'guarda pó', 'limpa vidros', 'quebra cabeça',
    'para brisa', 'para choque', 'para raios', 'corta frios', 'tira manchas', 'abre latas', 'saca rolhas', 'passa fita'];

  // termos estrangeiros/técnicos que a revisão pede em itálico
  const FOREIGN = ['drywall', 'spray', 'flowpack', 'blister', 'display', 'slim', 'tape', 'power', 'clean', 'led'];

  // adjetivos: singular -> plural (para conferir com o substantivo que vem antes)
  const ADJECTIVES = { isolante: 'isolantes', retangular: 'retangulares', redonda: 'redondas', redondo: 'redondos', flexível: 'flexíveis',
    metálica: 'metálicas', metálico: 'metálicos', profissional: 'profissionais', industrial: 'industriais', transparente: 'transparentes',
    plástica: 'plásticas', plástico: 'plásticos', adesiva: 'adesivas', adesivo: 'adesivos' };
  const ADJ_BY_FORM = {};
  Object.entries(ADJECTIVES).forEach(([one, many]) => { ADJ_BY_FORM[one] = { plural: false, other: many }; ADJ_BY_FORM[many] = { plural: true, other: one }; });

  // início do título no plural que não indica "vários produtos"
  const NOT_PLURAL = new Set(['óculos', 'oculos', 'gás', 'gas', 'mais', 'menos', 'lápis', 'pires', 'ônibus', 'onibus', 'atlas', 'tênis', 'tenis', 'bis', 'kits']);

  // símbolos de unidade no formato correto (chave = minúsculas)
  const UNIT = { mm: 'mm', cm: 'cm', km: 'km', mg: 'mg', kg: 'kg', ml: 'mL', kw: 'kW', kv: 'kV', ma: 'mA', hz: 'Hz', khz: 'kHz', mhz: 'MHz',
    db: 'dB', rpm: 'rpm', psi: 'psi', bar: 'bar', m: 'm', g: 'g', l: 'L', w: 'W', v: 'V' };
  const UNIT_ABBR = { mts: 'm', mt: 'm', cms: 'cm', mms: 'mm', kgs: 'kg', grs: 'g', gr: 'g', lts: 'L', lt: 'L' };

  const STOP = new Set(['para', 'sobre', 'entre', 'cada', 'tipo', 'como', 'mais', 'duas', 'tres']);

  const matchCase = (source, replacement) => {
    if (source.length > 1 && source === source.toUpperCase()) return replacement.toUpperCase();
    if (source[0] === source[0].toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  };
  const strip = word => word.normalize('NFD').replace(/[̀-ͯ]/g, '');

  const MOJIBAKE = { 'Ã§': 'ç', 'Ã£': 'ã', 'Ã©': 'é', 'Ã³': 'ó', 'Ãª': 'ê', 'Ã¡': 'á', 'Ãµ': 'õ', 'Ã­': 'í', 'Ãº': 'ú', 'Ã¢': 'â', 'Ã´': 'ô', 'Ã ': 'à' };

  const formatCode = digits => `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
  // vocabulário = mapa "palavra sem acento em minúsculas" -> forma mais usada (com acento), montado com os nomes dos produtos do catálogo
  function buildVocab(names) {
    const count = new Map(), form = new Map();
    for (const name of names) for (const w of String(name || '').match(new RegExp(`[${LETTER}]{4,}`, 'g')) || []) {
      const low = w.toLowerCase(), norm = strip(low), key = norm + '|' + low;
      count.set(key, (count.get(key) || 0) + 1);
      const best = form.get(norm);
      if (!best || count.get(key) > count.get(norm + '|' + best)) form.set(norm, low);
    }
    return form;
  }
  // distância de edição limitada (1 para palavras até 5 letras, 2 para as maiores); devolve a forma do vocabulário mais próxima ou null
  function nearestWord(norm, vocab) {
    const max = norm.length <= 5 ? 1 : 2; let best = null, bestDist = max + 1;
    for (const [other, form] of vocab) {
      if (Math.abs(other.length - norm.length) > max) continue;
      const d = editDistance(norm, other, max);
      if (d < bestDist) { bestDist = d; best = form; }
    }
    return best;
  }
  function editDistance(a, b, max) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < rowMin) rowMin = cur[j]; }
      if (rowMin > max) return max + 1; prev = cur;
    }
    return prev[b.length];
  }

  /* check(texto, { codes, html, formatCodes, vocab }) -> [{ kind, level, message, find, replace, italic }]
     kind: codigo | ortografia | acento | caractere | pontuacao | hifen | duplicidade | concordancia | unidade | italico
     level: 'erro' (certeza alta) ou 'aviso' (conferir).  find/replace: correção automática; italic: palavra a pôr em itálico. */
  function check(text, ctx = {}) {
    const issues = [], seen = new Set();
    const add = issue => { const key = issue.kind + '|' + issue.find + '|' + (issue.replace ?? '') + '|' + (issue.italic || ''); if (!seen.has(key)) { seen.add(key); issues.push(issue); } };
    text = String(text || '');

    // caracteres quebrados / incomuns
    for (const [bad, good] of Object.entries(MOJIBAKE)) if (text.includes(bad)) add({ kind: 'caractere', level: 'erro', message: `Caractere corrompido "${bad}": o correto é "${good}".`, find: bad, replace: good });
    if (text.includes('�')) add({ kind: 'caractere', level: 'erro', message: 'Há um caractere ilegível (�): provavelmente uma letra com acento se perdeu na planilha.', find: '�', replace: null });
    const odd = text.match(/[^A-Za-zÀ-ÿ0-9\s.,;:/\-–()"%°º+&×'’#*™®$\[\]!?]/g);
    if (odd) add({ kind: 'caractere', level: 'aviso', message: `Caractere incomum no título: ${[...new Set(odd)].map(c => '"' + c + '"').join(' ')}.`, find: odd[0], replace: null });

    // acentos e cedilha
    for (const word of text.match(new RegExp(`[${LETTER}]+`, 'g')) || []) {
      const good = ACCENTS[word.toLowerCase()];
      if (good && strip(word).toLowerCase() === word.toLowerCase()) { const fix = matchCase(word, good); add({ kind: 'acento', level: 'erro', message: `Falta acento: "${word}" -> "${fix}".`, find: word, replace: fix }); }
    }

    // pontuação e espaçamento
    if (/ {2,}/.test(text)) add({ kind: 'pontuacao', level: 'erro', message: 'Espaços duplicados entre palavras.', find: text.match(/ {2,}/)[0], replace: ' ' });
    if (/^\s|\s$/.test(text)) add({ kind: 'pontuacao', level: 'aviso', message: 'Espaço sobrando no início ou no fim do título.', find: text, replace: text.trim() });
    for (const m of text.matchAll(/(\S)\s+([,;:])/g)) add({ kind: 'pontuacao', level: 'erro', message: `Espaço antes de "${m[2]}".`, find: m[0], replace: m[1] + m[2] });
    for (const m of text.matchAll(new RegExp(`([${LETTER}]),([${LETTER}])`, 'g'))) add({ kind: 'pontuacao', level: 'erro', message: 'Falta espaço depois da vírgula.', find: m[0], replace: m[1] + ', ' + m[2] });

    // hífen
    const lower = text.toLowerCase();
    for (const compound of COMPOUNDS) {
      const at = lower.indexOf(compound);
      if (at >= 0) { const found = text.slice(at, at + compound.length); add({ kind: 'hifen', level: 'aviso', message: `Palavra composta: "${found}" -> "${found.replace(' ', '-')}".`, find: found, replace: found.replace(' ', '-') }); }
    }

    // palavra repetida (colada ou solta): ignora artigos/preposições e números
    const words = (text.match(new RegExp(`[${LETTER}]{4,}`, 'g')) || []).map(w => w.toLowerCase());
    const dupes = words.filter((w, i) => words.indexOf(w) !== i && !STOP.has(w));
    for (const dupe of new Set(dupes)) add({ kind: 'duplicidade', level: 'aviso', message: `A palavra "${dupe.toUpperCase()}" aparece mais de uma vez no título: se for repetição, retire uma.`, find: dupe, replace: null });

    // concordância
    const tokens = text.match(new RegExp(`[${LETTER}]+`, 'g')) || [], first = tokens[0] && tokens[0].toLowerCase();
    if (first && ctx.codes > 0 && first.length > 3) {
      const plural = first.endsWith('s') && !NOT_PLURAL.has(first);
      if (plural && ctx.codes === 1) add({ kind: 'concordancia', level: 'aviso', message: `O título começa no plural ("${tokens[0]}"), mas o card tem só 1 código: confira se não deveria ficar no singular.`, find: tokens[0], replace: null });
      if (!plural && !first.endsWith('s') && ctx.codes > 1 && !/[0-9]/.test(tokens[0]) && !ADJ_BY_FORM[first]) add({ kind: 'concordancia', level: 'aviso', message: `O card tem ${ctx.codes} códigos, mas o título começa no singular ("${tokens[0]}"): confira se não deveria ficar no plural.`, find: tokens[0], replace: null });
    }
    for (let i = 1; i < tokens.length; i++) {
      const noun = tokens[i - 1].toLowerCase(), adj = ADJ_BY_FORM[tokens[i].toLowerCase()];
      if (!adj || noun.length < 4 || ADJ_BY_FORM[noun]) continue;
      const nounPlural = noun.endsWith('s') && !NOT_PLURAL.has(noun);
      if (nounPlural !== adj.plural) { const fix = matchCase(tokens[i], adj.other); add({ kind: 'concordancia', level: 'aviso', message: `Concordância: "${tokens[i - 1]} ${tokens[i]}" -> "${tokens[i - 1]} ${fix}".`, find: tokens[i - 1] + ' ' + tokens[i], replace: tokens[i - 1] + ' ' + fix }); }
    }

    // ---- unidades de medida ----
    const NUM = '\\d+(?:[.,/]\\d+)*';
    // símbolos com mais de uma letra (com ou sem espaço): número + espaço + símbolo, na caixa certa
    for (const m of text.matchAll(new RegExp(`(${NUM})(\\s*)(mm|cm|km|mg|kg|ml|kw|kv|ma|hz|khz|mhz|db|rpm|psi|bar)(?![${LETTER}])`, 'gi'))) {
      const good = `${m[1]} ${UNIT[m[3].toLowerCase()]}`;
      if (m[0] !== good) add({ kind: 'unidade', level: 'erro', message: `Unidade de medida: "${m[0]}" -> "${good}" (símbolo em minúsculas/maiúsculas conforme o padrão, com espaço depois do número).`, find: m[0], replace: good });
    }
    // símbolos de uma letra (m, g, L, W, V): só com espaço depois do número, para não confundir com marca (3M) ou "a" (preposição)
    for (const m of text.matchAll(new RegExp(`(${NUM})(\\s+)(m|g|l|w|v)(?![${LETTER}0-9])`, 'gi'))) {
      const good = `${m[1]} ${UNIT[m[3].toLowerCase()]}`;
      if (m[0] !== good) add({ kind: 'unidade', level: 'erro', message: `Unidade de medida: "${m[0]}" -> "${good}".`, find: m[0], replace: good });
    }
    // abreviações que não são símbolo: mts, cms, kgs, lts...
    for (const m of text.matchAll(new RegExp(`(${NUM})\\s*(mts?|cms|mms|kgs|grs?|lts?)\\.?(?![${LETTER}])`, 'gi'))) {
      const good = `${m[1]} ${UNIT_ABBR[m[2].toLowerCase()]}`; add({ kind: 'unidade', level: 'erro', message: `"${m[0]}" não é o símbolo da unidade: use "${good}".`, find: m[0], replace: good });
    }
    // polegadas: sempre o sinal " colado ao número
    for (const m of text.matchAll(/(\d[\d/.,]*)\s*(?:''|”|“|″|POL(?:EGADAS?)?\b\.?|IN\b)/gi)) add({ kind: 'unidade', level: 'erro', message: `Polegada: "${m[0]}" -> "${m[1]}\\"" (use o sinal " logo depois do número).`, find: m[0], replace: m[1] + '"' });
    for (const m of text.matchAll(/(\d[\d/.,]*)\s+"/g)) add({ kind: 'unidade', level: 'erro', message: 'Polegada: o sinal " vai colado ao número, sem espaço.', find: m[0], replace: m[1] + '"' });
    // "x" de medida em minúsculo (6 X 3/4" -> 6 x 3/4")
    for (const m of text.matchAll(new RegExp(`(\\d|"|mm|cm|km|\\bm)(\\s*)X(\\s*)(?=\\d)`, 'gi'))) if (/X/.test(m[0].slice(m[1].length + m[2].length))) add({ kind: 'unidade', level: 'erro', message: 'Nas medidas, o "x" é minúsculo (ex.: 6 x 3/4").', find: m[0], replace: m[1] + m[2] + 'x' + m[3] });
    for (const m of text.matchAll(/(\d)(\s*)×(\s*)(?=\d)/g)) add({ kind: 'unidade', level: 'erro', message: 'Nas medidas, use a letra "x" minúscula (não o sinal ×).', find: m[0], replace: m[1] + m[2] + 'x' + m[3] });
    // vírgula decimal quando há unidade
    for (const m of text.matchAll(/(\d+)\.(\d{1,2})(?=\s*(?:mm|cm|m|km|kg|g|mg|ml|l|w|kw|v|kv|hz|db|")(?![A-Za-zÀ-ÿ]))/gi)) add({ kind: 'unidade', level: 'erro', message: `Decimal com vírgula: "${m[0]}" -> "${m[1]},${m[2]}".`, find: m[0], replace: m[1] + ',' + m[2] });
    // % e ° colados ao número
    for (const m of text.matchAll(/(\d)\s+([%°])/g)) add({ kind: 'unidade', level: 'erro', message: `O sinal "${m[2]}" vai colado ao número.`, find: m[0], replace: m[1] + m[2] });
    for (const m of text.matchAll(/(\d)º(?![A-Za-zÀ-ÿ])/g)) add({ kind: 'unidade', level: 'aviso', message: 'Para graus (ex.: 90°), use o símbolo ° e não a letra ordinal º.', find: m[0], replace: m[1] + '°' });

    // código de produto sem pontos (só se quem chama pedir: 10 dígitos soltos viram 00.00.000.000; códigos de outro tamanho, como os 7 dígitos da FG, ficam como estão)
    if (ctx.formatCodes) for (const m of text.matchAll(/(?<![\d.])\d{10}(?![\d.])/g)) { const good = formatCode(m[0]); add({ kind: 'codigo', level: 'erro', message: `Código sem pontos: "${m[0]}" -> "${good}".`, find: m[0], replace: good }); }

    // palavras que não aparecem em nenhum produto do catálogo (ctx.vocab, ver buildVocab): sugere a mais parecida
    if (ctx.vocab && ctx.vocab.size) {
      const known = new Set(Object.keys(ACCENTS).concat(Object.values(ACCENTS).map(w => strip(w))));
      for (const word of new Set(text.match(new RegExp(`[${LETTER}]{4,}`, 'g')) || [])) {
        const norm = strip(word).toLowerCase();
        if (ctx.vocab.has(norm) || known.has(norm) || FOREIGN.includes(norm)) continue;
        const near = nearestWord(norm, ctx.vocab);
        if (near) { const fix = matchCase(word, near); add({ kind: 'ortografia', level: 'aviso', message: `"${word}" não aparece em nenhum produto do catálogo: você quis dizer "${fix}"?`, find: word, replace: fix }); }
        else add({ kind: 'ortografia', level: 'aviso', message: `"${word}" não aparece em nenhum produto do catálogo: confira a grafia.`, find: word, replace: null });
      }
    }

    // itálico em termos estrangeiros
    for (const foreign of FOREIGN) if (new RegExp(`(^|[^${LETTER}])${foreign}(?![${LETTER}])`, 'i').test(text) && !(ctx.html && new RegExp(`<i>[^<]*${foreign}`, 'i').test(ctx.html))) {
      const word = (text.match(new RegExp(`${foreign}(?![${LETTER}])`, 'i')) || [foreign])[0];
      add({ kind: 'italico', level: 'aviso', message: `Termo estrangeiro: "${word}" costuma ir em itálico.`, find: word, replace: null, italic: word });
    }
    return issues;
  }

  const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Aplica uma observação ao título: { title, titleHtml } (titleHtml só existe quando o título já tinha formatação)
  function apply(title, titleHtml, issue) {
    if (issue.italic) {
      const base = titleHtml || escapeHtml(title), pattern = new RegExp(`(^|[^${LETTER}>])(${issue.italic})(?![${LETTER}<])`, 'i');
      const html = pattern.test(base) ? base.replace(pattern, '$1<i>$2</i>') : base;
      return { title, titleHtml: html === escapeHtml(title) ? undefined : html };
    }
    if (issue.replace == null) return { title, titleHtml };
    const swap = value => value.split(issue.find).join(issue.replace);
    const next = swap(title), html = titleHtml && titleHtml.includes(issue.find) ? swap(titleHtml) : titleHtml;
    return { title: next, titleHtml: html };
  }

  // Identifica a observação no estado exato do título. Se o texto mudar, uma confirmação antiga não a esconde.
  const key = (text, issue) => JSON.stringify([String(text || ''), issue.kind, issue.level, issue.message, issue.find ?? '', issue.replace ?? '', issue.italic || '']);

  window.CartazValidator = { check, apply, key, buildVocab, formatCode };
})();
