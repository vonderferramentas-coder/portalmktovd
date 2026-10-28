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
