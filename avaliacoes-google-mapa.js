// Mapa de lojas (Sul do Brasil) em SVG puro: contorno vindo do módulo gerado, pings por latitude/longitude. Sem biblioteca, sem rede.
import { PROJECAO, ESTADOS } from './avaliacoes-google-mapa-dados.js';
import { chave } from './avaliacoes-google-vendedores.js';

// Lojas da campanha. "lado" é onde o nome da cidade fica em relação ao pin; "deslocar" afasta o pin do ponto real (com uma linha até ele)
// quando duas cidades são tão próximas que os pins se sobrepõem (Porto Alegre e Novo Hamburgo).
// Cidade nova: acrescente aqui (latitude/longitude do centro da cidade); sem entrada, a loja aparece só na lista.
export const LOJAS = {
  'curitiba': { nome: 'Curitiba', lat: -25.4284, lon: -49.2733, lado: 'e', apelidos: [] },
  'joinville': { nome: 'Joinville', lat: -26.3045, lon: -48.8487, lado: 'd', apelidos: [] },
  'porto alegre': { nome: 'Porto Alegre', lat: -30.0346, lon: -51.2177, lado: 'e', apelidos: ['poa'] },
  'caxias do sul': { nome: 'Caxias do Sul', lat: -29.1678, lon: -51.1794, lado: 'd', apelidos: ['caxias'] },
  'novo hamburgo': { nome: 'Novo Hamburgo', lat: -29.6783, lon: -51.1306, lado: 'd', deslocar: [58, 0], apelidos: ['hamburgo'] }
};

export const projetar = (lat, lon) => [(lon - PROJECAO.lon0) * PROJECAO.fx, (PROJECAO.latN - lat) * PROJECAO.fy];

// Liga uma ficha do Google (título e cidade) a uma loja da tabela, pela cidade ou apelido citado ("POA"). Vazio = sem loja conhecida.
export function lojaDaFicha(ficha) {
  const texto = chave(`${ficha.title || ''} ${ficha.cidade || ''}`);
  return Object.keys(LOJAS).find(k => new RegExp(`\\b(${[k, ...LOJAS[k].apelidos].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`).test(texto)) || '';
}

const NS = 'http://www.w3.org/2000/svg';
const no = (tag, atributos = {}, ...filhos) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(atributos).forEach(([k, v]) => e.setAttribute(k, v));
  e.append(...filhos);
  return e;
};

// pings: [{ chave, nome, texto, dica, status?: 'ok'|'atencao'|'ruim' (bolinha no pin), vazio?: true (sem dado, pin cinza) }]. Clicar (ou Enter/Espaço) chama aoEscolher(chave); o mesmo ping de novo desmarca (a tela decide).
export function desenharMapa({ pings, selecionada, aoEscolher }) {
  const svg = no('svg', { class: 'ag-mapa', viewBox: `0 0 ${PROJECAO.largura} ${PROJECAO.altura}`, role: 'group', 'aria-label': 'Mapa das lojas no Paraná, Santa Catarina e Rio Grande do Sul' });
  Object.entries(ESTADOS).forEach(([uf, d]) => svg.append(no('path', { class: 'ag-uf', d }, no('title', {}, uf))));
  pings.filter(p => LOJAS[p.chave]).forEach(p => {
    const l = LOJAS[p.chave], [x, y] = projetar(l.lat, l.lon), [dx, dy] = l.deslocar || [0, 0];
    const ativo = selecionada === p.chave, esq = l.lado === 'e';
    if (dx || dy) svg.append(no('line', { class: 'ag-ping-fio', x1: x.toFixed(1), y1: y.toFixed(1), x2: (x + dx).toFixed(1), y2: (y + dy).toFixed(1) }), no('circle', { class: 'ag-ping-ponto', cx: x.toFixed(1), cy: y.toFixed(1), r: '5' }));
    // Pin de localização: a ponta fica no ponto da cidade (ou no ponto deslocado) e o número entra na cabeça.
    const g = no('g', { class: `ag-ping${p.vazio ? ' is-vazio' : ''}${ativo ? ' is-sel' : ''}`, transform: `translate(${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)})`, role: 'button', tabindex: '0', 'aria-pressed': String(ativo), 'aria-label': p.dica },
      no('title', {}, p.dica),
      no('path', { class: 'ag-pin', d: 'M0 0C-5-12-24-24-24-44A24 24 0 1 1 24-44C24-24 5-12 0 0Z' }),
      no('text', { class: 'ag-ping-num', 'text-anchor': 'middle', y: '-44', dy: '.35em' }, p.texto),
      p.status && no('circle', { class: `ag-status is-${p.status}`, cx: '19', cy: '-62', r: '8' }),
      no('text', { class: 'ag-ping-nome', x: esq ? '-34' : '34', y: '-44', 'text-anchor': esq ? 'end' : 'start', dy: '.35em' }, p.nome));
    g.addEventListener('click', () => aoEscolher(p.chave));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoEscolher(p.chave); } });
    svg.append(g);
  });
  return svg;
}
