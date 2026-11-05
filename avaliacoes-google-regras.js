// Prioridade das avaliações do Google por regras fixas (sem IA): nota, palavras de alerta e idade sem resposta.
// Cada classificação devolve os motivos, para a tela mostrar por que a avaliação foi marcada.
const sem = texto => String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// "*" no fim = prefixo ("decepcion*" pega decepcionado); sem "*" = palavra inteira ("caro" não pega "Carolina").
const montar = termos => new RegExp('\\b(' + termos.map(t => t.endsWith('*') ? sem(t.slice(0, -1)) + '\\w*' : sem(t) + '\\b').join('|') + ')', 'g');

export const PALAVRAS_CRITICAS = ['pessim*', 'horrivel', 'golpe*', 'fraude*', 'procon', 'reclame aqui', 'nao recomendo', 'enganad*', 'enganaram', 'descaso', 'absurdo', 'vergonha', 'lixo', 'roubo*', 'processar', 'justica'];
export const PALAVRAS_NEGATIVAS = ['demor*', 'atras*', 'defeito*', 'quebr*', 'problema*', 'ruim', 'mau atendimento', 'mal atendid*', 'nao resolve*', 'nunca mais', 'decepcion*', 'nao entreg*', 'sem estoque', 'falta de', 'caro', 'reclam*', 'insatisf*', 'grosseir*', 'arrogan*'];
export const HORAS_ATRASO = 48;
const NEGACAO = new Set(['nao', 'nunca', 'nenhum', 'nenhuma', 'sem', 'nada', 'jamais', 'nem']);

const CRITICAS = montar(PALAVRAS_CRITICAS);
const NEGATIVAS = montar(PALAVRAS_NEGATIVAS);
const BASE = { critica: 300, atencao: 200, elogio: 100 };

// Primeira palavra de alerta que não vem logo depois de uma negação ("sem defeito", "nunca tive problema", "não é golpe").
function achar(regex, texto) {
  for (const m of texto.matchAll(regex)) {
    const frase = texto.slice(0, m.index).split(/[.!?;:,\n]/).pop(); // a negação só vale dentro da mesma frase
    const antes = frase.split(/\s+/).filter(Boolean).slice(-3);
    if (!antes.some(p => NEGACAO.has(p))) return m[1];
  }
}

export function classificar(rec, agora = Date.now()) {
  const texto = sem(rec.t);
  const critica = achar(CRITICAS, texto);
  const negativa = achar(NEGATIVAS, texto);
  const motivos = [];
  let nivel = 'elogio';
  if (rec.s >= 1 && rec.s <= 2) { nivel = 'critica'; motivos.push(`${rec.s} estrela${rec.s > 1 ? 's' : ''}`); }
  if (critica) { nivel = 'critica'; motivos.push(`contém "${critica}"`); }
  if (nivel !== 'critica') {
    if (rec.s === 3) { nivel = 'atencao'; motivos.push('3 estrelas'); }
    if (negativa) { nivel = 'atencao'; motivos.push(rec.s >= 4 ? `nota alta, mas contém "${negativa}"` : `contém "${negativa}"`); }
  }
  const horas = (agora - Date.parse(rec.c)) / 36e5;
  const atrasada = !rec.r && nivel !== 'elogio' && horas > HORAS_ATRASO;
  if (atrasada) motivos.push(`sem resposta há ${Math.floor(horas / 24)} dias`);
  return { nivel, motivos, atrasada, peso: BASE[nivel] + (atrasada ? 50 : 0) };
}

// Mais urgente primeiro; entre iguais, a mais antiga.
export const porPrioridade = (a, b) => b.cls.peso - a.cls.peso || a.rec.c.localeCompare(b.rec.c);

// ---- Referencial da loja (painel ao lado do mapa), no formato das avaliações do Google. Tudo por regra fixa, sem IA. ----

// "um dia atrás", "2 anos atrás": o mesmo jeito de contar do Google.
export function tempoRelativo(iso, agora = Date.now()) {
  const dias = Math.floor((agora - Date.parse(iso)) / 864e5);
  if (Number.isNaN(dias)) return '';
  const medida = (n, um, varios) => `${n === 1 ? um : `${n} ${varios}`} atrás`;
  if (dias < 1) return 'hoje'; // inclui data no futuro por relógio atrasado
  if (dias < 7) return medida(dias, 'um dia', 'dias');
  if (dias < 30) return medida(Math.floor(dias / 7), 'uma semana', 'semanas');
  if (dias < 365) return medida(Math.min(11, Math.floor(dias / 30)), 'um mês', 'meses'); // 360 dias ainda não é "12 meses"
  return medida(Math.floor(dias / 365), 'um ano', 'anos');
}

const SEM_VALOR = new Set(('para com uma uns umas que mais muito muita muitos muitas foram esta estao estou estava esse essa esses essas isso este estes estas pelo pela pelos pelas como tambem sobre entre quando porque onde cada ainda apos pois nos nas dos das sao tem ter tinha tive fui foi vou vai aqui sempre nunca loja lojas bem meu minha meus minhas seu sua seus suas dele dela eles elas nao sim mas nem ate sem por num numa depois antes so ja ficou ficar fazer feito sido era ser tudo todo toda todos todas outro outra').split(' '));

// Palavras que mais aparecem nos comentários: [{ palavra, n }], n = quantas avaliações a citam (no mínimo 2), ignorando palavras de ligação.
export function palavrasChave(textos, max = 6) {
  const contagem = new Map();
  textos.forEach(texto => {
    const vistas = new Set();
    (String(texto || '').toLowerCase().match(/\p{L}{4,}/gu) || []).forEach(palavra => {
      const k = sem(palavra);
      if (SEM_VALOR.has(k) || vistas.has(k)) return;
      vistas.add(k);
      const atual = contagem.get(k) || { palavra, n: 0 };
      atual.n++;
      contagem.set(k, atual);
    });
  });
  return [...contagem.values()].filter(i => i.n >= 2).sort((a, b) => b.n - a.n || a.palavra.localeCompare(b.palavra, 'pt-BR')).slice(0, max);
}

// A avaliação cita a palavra (sem diferenciar acento nem caixa).
export const citaPalavra = (rec, palavra) => sem(rec.t).includes(sem(palavra));

export const ORDENS = [['relevantes', 'Mais relevantes'], ['recentes', 'Mais recentes'], ['maior', 'Maior classificação'], ['menor', 'Menor classificação']];
// "Relevantes" aqui é regra própria (o Google não expõe a dele): com comentário primeiro, comentário mais longo antes, depois a mais nova.
const recentes = (a, b) => b.c.localeCompare(a.c);
const REGRAS_ORDEM = {
  relevantes: (a, b) => ((b.t || '').length > 0) - ((a.t || '').length > 0) || (b.t || '').length - (a.t || '').length || recentes(a, b),
  recentes,
  maior: (a, b) => b.s - a.s || recentes(a, b),
  menor: (a, b) => (a.s || 6) - (b.s || 6) || recentes(a, b)
};
export const ordenarAvaliacoes = (lista, ordem) => [...lista].sort(REGRAS_ORDEM[ordem] || recentes);

// O Google junta ao comentário o aviso "(Translated by Google)" com a tradução. Costuma vir depois do texto do cliente
// ("original (Translated by Google) tradução") e, em alguns idiomas, antes ("(Translated by Google) tradução (Original) original").
// A equipe quer só o que o cliente escreveu: fica o original.
export function textoOriginal(texto) {
  const s = String(texto || '');
  const m = s.match(/[(](?:Translated by Google|Traduzido pelo Google)[)]/i);
  if (!m) return s;
  const antes = s.slice(0, m.index).trim();
  if (antes) return antes;
  const resto = s.slice(m.index + m[0].length), o = resto.match(/[(]Original[)]/i);
  return (o ? resto.slice(o.index + o[0].length) : resto).trim();
}

// Contagem como no Google: 193, 1,2 mil, 15 mil.
export const abreviar = n => n >= 1000 ? `${(Math.floor(n / 100) / 10).toString().replace('.', ',')} mil` : String(n);

// Busca no referencial da loja: todas as palavras digitadas precisam aparecer no comentário, no nome de quem avaliou ou na resposta da loja
// (sem diferenciar acento nem caixa). Busca vazia deixa tudo passar.
export function buscaAvaliacao(rec, consulta) {
  const termos = sem(consulta).trim().split(' ').filter(Boolean);
  if (!termos.length) return true;
  const alvo = sem(`${rec.t || ''} ${rec.n || ''} ${rec.r || ''}`);
  return termos.every(t => alvo.includes(t));
}
