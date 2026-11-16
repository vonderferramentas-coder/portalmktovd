// Datas comemorativas do calendário: feriados nacionais + datas comerciais de referência para planejamento de conteúdo.
// Datas fixas (mesmo dia todo ano) ficam num dicionário "MM-DD"; datas móveis (baseadas na Páscoa, ou no "enésimo dia
// da semana do mês", como Dia das Mães/Pais e Black Friday) são calculadas por ano e guardadas em cache, já que o
// cálculo da Páscoa não é trivial de refazer a cada célula do calendário. Usado pelo calendário (app.js) e pelas
// sugestões da Início (home-suggestions.js), para os dois verem exatamente as mesmas datas.
(function () {
  const FIXED = {
    '01-01': ['Confraternização Universal'],
    '03-06': ['Data Magna de Pernambuco'],
    '03-08': ['Dia Internacional da Mulher'],
    '03-15': ['Dia Mundial do Consumidor'],
    '03-19': ['Dia do Carpinteiro e Marceneiro'],
    '03-20': ['Início do Outono'],
    '03-22': ['Dia Mundial da Água'],
    '03-25': ['Data Magna do Ceará'],
    '04-05': ['Emancipação de Novo Hamburgo'],
    '04-21': ['Tiradentes', 'Dia do Metalúrgico'],
    '04-22': ['Descobrimento do Brasil'],
    '04-23': ['Dia do Serralheiro'],
    '05-01': ['Dia do Trabalho'],
    '05-11': ['Aniversário de Aparecida de Goiânia'],
    '05-18': ['Dia do Vidraceiro'],
    '05-25': ['Dia da Indústria e do Trabalhador Rural'],
    '06-05': ['Dia Mundial do Meio Ambiente'],
    '06-12': ['Dia dos Namorados'],
    '06-13': ['Dia de Santo Antônio'],
    '06-15': ['Aniversário de Itajaí'],
    '06-20': ['Dia do Revendedor'],
    '06-21': ['Início do Inverno'],
    '06-24': ['Dia de São João'],
    '07-02': ['Independência da Bahia'],
    '07-04': ['Dia Internacional do Cooperativismo'],
    '07-09': ['Revolução Constitucionalista', 'Fundação de Cabo de Santo Agostinho'],
    '07-16': ['Dia de N. Sra. do Carmo', 'Dia do Comerciante'],
    '07-26': ['Dia de N. Sra. Sant’Ana'],
    '07-28': ['Dia do Agricultor'],
    '08-15': ['Dia de N. Sra. do Desterro'],
    '08-17': ['Aniversário de Barbalha'],
    '09-07': ['Independência do Brasil'],
    '09-08': ['Dia de N. Sra. da Luz dos Pinhais'],
    '09-15': ['Dia do Cliente'],
    '09-19': ['Dia do Comprador'],
    '09-20': ['Revolução Farroupilha'],
    '09-23': ['Dia do Soldador'],
    '09-27': ['Dia do Encanador'],
    '09-30': ['Dia da Secretária'],
    '10-01': ['Dia do Vendedor'],
    '10-12': ['Dia de Nossa Sra. Aparecida', 'Dia das Crianças'],
    '10-15': ['Aniversário VONDER'],
    '10-17': ['Dia do Eletricista'],
    '10-18': ['Dia do Pintor'],
    '10-26': ['Dia do Trabalhador da Construção Civil'],
    '10-30': ['Dia do Balconista e Comerciário'],
    '10-31': ['Dia Municipal da Reforma Protestante e Ação de Graças'],
    '11-02': ['Finados'],
    '11-14': ['Emancipação de Aparecida de Goiânia'],
    '11-15': ['Proclamação da República'],
    '11-20': ['Dia Nacional de Zumbi e da Consciência Negra'],
    '11-27': ['Dia do Técnico e Engenheiro de Segurança no Trabalho'],
    '12-08': ['Dia de N. Sra. da Imaculada Conceição'],
    '12-11': ['Dia do Engenheiro'],
    '12-13': ['Dia do Pedreiro'],
    '12-15': ['Dia do Jardineiro', 'Dia do Arquiteto e Urbanista'],
    '12-20': ['Dia do Mecânico'],
    '12-21': ['Início do Verão'],
    '12-25': ['Natal']
  };
  // início da Primavera (horário de Brasília) é o único marco sazonal que oscila entre 22 e 23/09
  // ponytail: só 2026/2027 conferidos; demais anos assumem 22/09 - revisar ao incluir novos anos
  const SPRING_START_DAY = { 2027: 23 };
  // data da Páscoa (algoritmo de Gauss/computus gregoriano) - base de todos os feriados móveis
  function easterDate(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  // enésima ocorrência de um dia da semana (0=Dom...6=Sáb) num mês - Dia das Mães (2º domingo de maio) e dos Pais (agosto)
  function nthWeekdayOfMonth(year, month, weekday, n) {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (n - 1) * 7);
  }
  // última ocorrência de um dia da semana num mês - Black Friday (última 6ª de novembro)
  function lastWeekdayOfMonth(year, month, weekday) {
    const last = new Date(year, month + 1, 0);
    const offset = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month, last.getDate() - offset);
  }
  function ymd(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  const cache = {};
  function movable(year) {
    if (cache[year]) return cache[year];
    const easter = easterDate(year);
    const map = {};
    map[ymd(addDays(easter, -47))] = 'Carnaval';
    map[ymd(addDays(easter, -2))] = 'Paixão de Cristo';
    map[ymd(easter)] = 'Páscoa';
    map[ymd(addDays(easter, 39))] = 'Ascensão do Senhor';
    map[`${year}-09-${SPRING_START_DAY[year] || 22}`] = 'Início da Primavera';
    map[ymd(addDays(easter, 60))] = 'Corpus Christi';
    map[ymd(nthWeekdayOfMonth(year, 4, 0, 2))] = 'Dia das Mães'; // maio, domingo
    map[ymd(nthWeekdayOfMonth(year, 7, 0, 2))] = 'Dia dos Pais'; // agosto, domingo
    const blackFriday = lastWeekdayOfMonth(year, 10, 5); // novembro, sexta
    map[ymd(blackFriday)] = 'Black Friday';
    map[ymd(addDays(blackFriday, 3))] = 'Cyber Monday';
    cache[year] = map;
    return map;
  }
  // nome(s) da(s) data(s) comemorativa(s) em "YYYY-MM-DD": fixas, móveis e as personalizadas de Configurações
  // (customDates: [{date, name, recurring}]), sem repetir
  function names(dateStr, customDates) {
    const out = [];
    out.push(...(FIXED[dateStr.slice(5)] || []));
    const mv = movable(Number(dateStr.slice(0, 4)))[dateStr];
    if (mv) out.push(mv);
    (customDates || []).forEach(c => {
      const matches = c.recurring ? c.date.slice(5) === dateStr.slice(5) : c.date === dateStr;
      if (matches) out.push(c.name);
    });
    return Array.from(new Set(out));
  }
  window.CommemorativeDates = { FIXED, movable, names };
})();
