// Mapa de lojas com Leaflet (vendor/leaflet, carregado antes como script comum) e os tiles do OpenStreetMap, no estilo do exemplo shadcn-map.
// Os tiles do CARTO que o exemplo usa exigem chave de API (sem ela vem marca d'água), por isso o OpenStreetMap, que não pede chave (política de uso: tile.openstreetmap.org/policy).
// Os pings são o mesmo desenho de antes (SVG dentro de um divIcon), nas mesmas coordenadas.
import { chave } from './avaliacoes-google-vendedores.js';

// Lojas da campanha. "lado" é onde o nome da cidade fica em relação ao pin; "deslocar" (px) afasta o pin para a direita do ponto real, com uma
// linha até ele, quando duas cidades são tão próximas que os pins se cobririam (Porto Alegre e Novo Hamburgo).
// Cidade nova: acrescente aqui (latitude/longitude do centro da cidade); sem entrada, a loja aparece só na lista.
export const LOJAS = {
  'curitiba': { nome: 'Curitiba', lat: -25.4284, lon: -49.2733, lado: 'e', apelidos: [] },
  'joinville': { nome: 'Joinville', lat: -26.3045, lon: -48.8487, lado: 'd', apelidos: [] },
  'porto alegre': { nome: 'Porto Alegre', lat: -30.0346, lon: -51.2177, lado: 'e', apelidos: ['poa'] },
  'caxias do sul': { nome: 'Caxias do Sul', lat: -29.1678, lon: -51.1794, lado: 'd', apelidos: ['caxias'] },
  'novo hamburgo': { nome: 'Novo Hamburgo', lat: -29.6783, lon: -51.1306, lado: 'd', deslocar: 34, apelidos: ['hamburgo'] }
};

// Liga uma ficha do Google (título e cidade) a uma loja da tabela, pela cidade ou apelido citado ("POA"). Vazio = sem loja conhecida.
export function lojaDaFicha(ficha) {
  const texto = chave(`${ficha.title || ''} ${ficha.cidade || ''}`);
  return Object.keys(LOJAS).find(k => new RegExp(`\\b(${[k, ...LOJAS[k].apelidos].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`).test(texto)) || '';
}

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'; // o tema escuro é um filtro de CSS sobre estes tiles
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const PIN = 'M0 0C-5-12-24-24-24-44A24 24 0 1 1 24-44C24-24 5-12 0 0Z';
// Última posição do mapa por tela: filtrar ou clicar num ping refaz a tela, mas o mapa não deve voltar ao enquadramento inicial.
const visoes = {};
// Mapas criados: a tela é refeita a cada filtro, então os que saíram da página são soltos (Leaflet guarda observadores e eventos) na próxima criação.
let instancias = [];

const NS = 'http://www.w3.org/2000/svg';
const no = (tag, atributos = {}, ...filhos) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(atributos).forEach(([k, v]) => e.setAttribute(k, v));
  e.append(...filhos.filter(Boolean));
  return e;
};

// Pin de localização: a ponta fica no ponto da cidade e o número entra na cabeça. O nome da cidade é HTML (texto de terceiros nunca vira HTML).
function iconeDoPin(p, lado, deslocar = 0) {
  const raiz = document.createElement('div');
  const nome = document.createElement('span');
  nome.className = `ag-ping-nome is-${lado}`;
  nome.textContent = p.nome;
  const fio = deslocar * 56 / 37; // px -> unidades do viewBox: a linha vai da ponta do pin ao ponto real da cidade
  raiz.append(no('svg', { class: 'ag-pin-svg', viewBox: '-28 -72 56 74', width: '37', height: '49', 'aria-hidden': 'true' },
    deslocar > 0 && no('line', { class: 'ag-ping-fio', x1: -fio.toFixed(1), y1: '0', x2: '0', y2: '0' }),
    deslocar > 0 && no('circle', { class: 'ag-ping-ponto', cx: -fio.toFixed(1), cy: '0', r: '5' }),
    no('path', { class: 'ag-pin', d: PIN }),
    no('text', { class: 'ag-ping-num', 'text-anchor': 'middle', y: '-44', dy: '.35em' }, p.texto),
    p.status && no('circle', { class: `ag-status is-${p.status}`, cx: '19', cy: '-62', r: '8' })), nome);
  return raiz;
}

// pings: [{ chave, nome, texto, dica, status?: 'ok'|'atencao'|'ruim' (bolinha no pin), vazio?: true (sem dado, pin cinza) }].
// Clicar (ou Enter/Espaço) chama aoEscolher(chave); o mesmo ping de novo desmarca (a tela decide).
// chaveVisao guarda a posição do mapa entre redesenhos; reservas() diz quantos px de cada lado estão cobertos por cartões { esq, dir } (o enquadramento inicial os evita).
// Devolve o <div> do mapa: quem chama o põe na página e o tamanho vem do CSS (o enquadramento espera o elemento ter tamanho).
export function desenharMapa({ pings, selecionada, aoEscolher, chaveVisao = 'mapa', reservas = () => ({ esq: 0, dir: 0 }) }) {
  instancias.forEach(i => { if (i.el.isConnected) i.naPagina = true; });
  instancias = instancias.filter(i => !i.naPagina || i.el.isConnected || (i.soltar(), false)); // só solta quem já esteve na página e saiu dela
  const el = document.createElement('div');
  el.className = 'ag-mapa';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Mapa das lojas no Paraná, Santa Catarina e Rio Grande do Sul');
  const salvo = visoes[chaveVisao];
  const mapa = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, minZoom: 4, maxZoom: 16, zoomSnap: 0.25 })
    .setView(salvo ? salvo.centro : [-27.6, -50.5], salvo ? salvo.zoom : 6);
  el.style.position = ''; // fora da página o Leaflet crava position:relative; quem posiciona o mapa é o CSS (no fundo da cena ele é absoluto)
  mapa.on('moveend', () => { const c = mapa.getCenter(); visoes[chaveVisao] = { centro: [c.lat, c.lng], zoom: mapa.getZoom() }; });
  L.tileLayer(TILES, { attribution: ATRIBUICAO, maxZoom: 19 }).addTo(mapa);
  L.control.attribution({ prefix: false }).addTo(mapa);
  L.control.zoom({ position: 'bottomleft', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapa);
  // Rolagem comum continua rolando a página; zoom só com Ctrl/⌘ + rolagem (DESIGN.md §5, mapa no meio da página).
  // O giro é acumulado em passos de um quarto de nível: a pinça do trackpad manda dezenas de eventos pequenos por segundo.
  let giro = 0;
  el.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    giro -= e.deltaY * (e.deltaMode === 1 ? 33 : 1) * 0.01;
    const passo = Math.trunc(giro / 0.25) * 0.25;
    if (!passo) return;
    giro -= passo;
    mapa.setZoomAround(mapa.mouseEventToContainerPoint(e), mapa.getZoom() + passo, { animate: false });
  }, { passive: false });

  const posicoes = [];
  pings.filter(p => LOJAS[p.chave]).forEach(p => {
    const l = LOJAS[p.chave], ativo = selecionada === p.chave;
    posicoes.push([l.lat, l.lon]);
    const marcador = L.marker([l.lat, l.lon], {
      icon: L.divIcon({ className: `ag-ping${p.vazio ? ' is-vazio' : ''}${ativo ? ' is-sel' : ''}`, html: iconeDoPin(p, l.lado, l.deslocar), iconSize: [37, 49], iconAnchor: [19 - (l.deslocar || 0), 48] }),
      title: p.dica, keyboard: true, zIndexOffset: ativo ? 1000 : 0
    }).addTo(mapa);
    marcador.on('click', () => aoEscolher(p.chave)); // o Enter já vira clique no Leaflet
    const icone = marcador.getElement();
    if (!icone) return;
    icone.setAttribute('role', 'button');
    icone.setAttribute('aria-pressed', String(ativo));
    icone.setAttribute('aria-label', p.dica);
    icone.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); aoEscolher(p.chave); } });
  });

  // O elemento ainda não está na página quando esta função termina: o primeiro tamanho real dispara o enquadramento.
  let enquadrado = Boolean(salvo);
  const tamanho = new ResizeObserver(() => {
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    mapa.invalidateSize({ animate: false });
    if (enquadrado || !posicoes.length) return;
    enquadrado = true;
    const { esq, dir } = reservas(), folga = 72; // folga: o nome da cidade fica ao lado do pin
    mapa.fitBounds(L.latLngBounds(posicoes), { paddingTopLeft: [24 + esq + folga, 72], paddingBottomRight: [24 + dir + folga, 48], maxZoom: 8, animate: false });
  });
  tamanho.observe(el);
  instancias.push({ el, naPagina: false, soltar: () => { tamanho.disconnect(); mapa.remove(); } });
  return el;
}
