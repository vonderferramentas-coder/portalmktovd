// Mapa de lojas com Leaflet (vendor/leaflet, carregado antes como script comum) e os tiles do OpenStreetMap, no estilo do exemplo shadcn-map.
// Os tiles do CARTO que o exemplo usa exigem chave de API (sem ela vem marca d'água), por isso o OpenStreetMap, que não pede chave (política de uso: tile.openstreetmap.org/policy).
// Os pings são o mesmo desenho de antes (SVG dentro de um divIcon), nas mesmas coordenadas.
import { chave } from './avaliacoes-google-vendedores.js';

// Lojas da campanha. "lado" é onde o nome da cidade fica em relação ao pin; "deslocar" (px) afasta o pin para a direita do ponto real, com uma
// linha até ele, quando duas cidades são tão próximas que os pins se cobririam (Porto Alegre e Novo Hamburgo).
// "ufs": ficha dessa UF sem cidade reconhecida cai nesta loja (a única de SP é a de São Paulo; a ficha pode estar cadastrada na Grande São Paulo).
// Cidade nova: acrescente aqui (latitude/longitude do centro da cidade); sem entrada, a loja aparece só na lista.
export const LOJAS = {
  'curitiba': { nome: 'Curitiba', lat: -25.4284, lon: -49.2733, lado: 'e', apelidos: [] },
  'joinville': { nome: 'Joinville', lat: -26.3045, lon: -48.8487, lado: 'd', apelidos: [] },
  'porto alegre': { nome: 'Porto Alegre', lat: -30.0346, lon: -51.2177, lado: 'e', apelidos: ['poa'] },
  'caxias do sul': { nome: 'Caxias do Sul', lat: -29.1678, lon: -51.1794, lado: 'd', apelidos: ['caxias'] },
  'novo hamburgo': { nome: 'Novo Hamburgo', lat: -29.6783, lon: -51.1306, lado: 'd', deslocar: 34, apelidos: ['hamburgo'] },
  'sao paulo': { nome: 'São Paulo', lat: -23.5505, lon: -46.6333, lado: 'd', apelidos: [], ufs: ['SP'] }
};

// Liga uma ficha do Google (título e cidade) a uma loja da tabela, pela cidade ou apelido citado ("POA"). Vazio = sem loja conhecida.
// O resultado fica guardado por ficha (WeakMap): a tela chama isto a cada tecla, passagem de mouse e foco, e cada chamada monta uma expressão regular por loja.
const lojaPorFicha = new WeakMap();
export function lojaDaFicha(ficha) {
  if (lojaPorFicha.has(ficha)) return lojaPorFicha.get(ficha);
  const texto = chave(`${ficha.title || ''} ${ficha.cidade || ''}`);
  const loja = Object.keys(LOJAS).find(k => new RegExp(`\\b(${[k, ...LOJAS[k].apelidos].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`).test(texto))
    || Object.keys(LOJAS).find(k => (LOJAS[k].ufs || []).includes(String(ficha.uf || '').toUpperCase())) || '';
  lojaPorFicha.set(ficha, loja);
  return loja;
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
// aoDestacar(chave) é chamado quando o mouse (ou o foco) entra no pin e aoDestacar('') quando sai.
// Clicar (ou Enter/Espaço) chama aoEscolher(chave); o mesmo ping de novo desmarca (a tela decide).
// chaveVisao guarda a posição do mapa entre redesenhos; reservas() diz quantos px de cada lado estão cobertos por cartões { esq, dir } (o enquadramento inicial os evita).
// Devolve o <div> do mapa: quem chama o põe na página e o tamanho vem do CSS (o enquadramento espera o elemento ter tamanho).
export function desenharMapa({ pings, selecionada, aoEscolher, aoDestacar = () => {}, chaveVisao = 'mapa', reservas = () => ({ esq: 0, dir: 0 }) }) {
  instancias.forEach(i => { if (i.el.isConnected) i.naPagina = true; });
  instancias = instancias.filter(i => !i.naPagina || i.el.isConnected || (i.soltar(), false)); // só solta quem já esteve na página e saiu dela
  const el = document.createElement('div');
  el.className = 'ag-mapa';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Mapa das lojas em São Paulo, Paraná, Santa Catarina e Rio Grande do Sul');
  const salvo = visoes[chaveVisao];
  let centrada = ''; // loja em que o mapa está centrado (ver centralizar)
  const mapa = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, minZoom: 4, maxZoom: 16, zoomSnap: 0.25 })
    .setView(salvo ? salvo.centro : [-27.6, -50.5], salvo ? salvo.zoom : 6);
  el.style.position = ''; // fora da página o Leaflet crava position:relative; quem posiciona o mapa é o CSS (no fundo da cena ele é absoluto)
  // A visão guardada leva junto a loja em que o mapa está centrado: se a tela refizer o mapa (um filtro mudou os números dos pins), o novo mapa sabe que ainda precisa reenquadrar ao voltar para a lista.
  mapa.on('moveend', () => { const c = mapa.getCenter(); visoes[chaveVisao] = { centro: [c.lat, c.lng], zoom: mapa.getZoom(), centrada }; });
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

  const posicoes = [], marcadores = [];
  pings.filter(p => LOJAS[p.chave]).forEach(p => {
    const l = LOJAS[p.chave], ativo = selecionada === p.chave;
    posicoes.push([l.lat, l.lon]);
    const marcador = L.marker([l.lat, l.lon], {
      icon: L.divIcon({ className: `ag-ping${p.vazio ? ' is-vazio' : ''}${ativo ? ' is-sel' : ''}`, html: iconeDoPin(p, l.lado, l.deslocar), iconSize: [37, 49], iconAnchor: [19 - (l.deslocar || 0), 48] }),
      title: p.dica, keyboard: true, zIndexOffset: ativo ? 1000 : 0
    }).addTo(mapa);
    marcador.on('click', () => aoEscolher(p.chave)); // o Enter já vira clique no Leaflet
    marcador.on('mouseover', () => aoDestacar(p.chave)); marcador.on('mouseout', () => aoDestacar('')); // mouse em cima do pin: a tela destaca a linha da loja na lista
    marcadores.push([p.chave, marcador]);
    const icone = marcador.getElement();
    if (!icone) return;
    icone.setAttribute('role', 'button');
    icone.setAttribute('aria-pressed', String(ativo));
    icone.setAttribute('aria-label', p.dica);
    icone.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); aoEscolher(p.chave); } });
    icone.addEventListener('focus', () => aoDestacar(p.chave)); icone.addEventListener('blur', () => aoDestacar(''));
  });

  // Troca a loja selecionada sem refazer o mapa (refazer recarrega os tiles e o mapa pisca): quem chama reaproveita o elemento e chama selecionar(chave).
  let escolhida = selecionada;
  el.classList.toggle('tem-sel', Boolean(selecionada));
  el.selecionar = chave => {
    escolhida = chave;
    el.classList.toggle('tem-sel', Boolean(chave)); // com uma loja aberta, os outros pins ficam apagados (CSS)
    marcadores.forEach(([k, m]) => {
      const ativo = k === chave, icone = m.getElement();
      m.setZIndexOffset(ativo ? 1000 : 0);
      if (!icone) return;
      icone.classList.toggle('is-sel', ativo);
      icone.setAttribute('aria-pressed', String(ativo));
    });
  };
  // Destaca (anima) o pin de uma loja enquanto o mouse ou o foco está na linha dela na lista; chave vazia apaga o destaque. Só o visual muda: a seleção continua a mesma.
  el.destacar = chave => marcadores.forEach(([k, m]) => {
    const on = Boolean(chave) && k === chave, icone = m.getElement();
    m.setZIndexOffset(on ? 900 : k === escolhida ? 1000 : 0);
    if (icone) icone.classList.toggle('is-hover', on);
  });
  // Enquadra todas as lojas, fora da área coberta pelos cartões (folga: o nome da cidade fica ao lado do pin).
  function enquadrarTodos(animar) {
    const { esq, dir } = reservas(), folga = 72;
    const opcoes = { paddingTopLeft: [24 + esq + folga, 72], paddingBottomRight: [24 + dir + folga, 48], maxZoom: 8 };
    if (animar) mapa.flyToBounds(L.latLngBounds(posicoes), { ...opcoes, duration: 0.7 }); else mapa.fitBounds(L.latLngBounds(posicoes), { ...opcoes, animate: false });
  }
  // Centraliza a loja aberta no painel (no meio da parte do mapa que o cartão deixa livre), com zoom de cidade; ao voltar para a lista, reenquadra todas.
  // Só age quando a loja muda: refazer a tela por causa de um filtro não move o mapa de novo.
  let enquadrado = Boolean(salvo);
  centrada = (salvo && salvo.centrada) || '';
  el.centralizar = (chave, forcar) => { // forcar: reenquadra mesmo que o mapa já esteja nessa loja (ao trocar de aba o cartão muda de lado)
    if ((chave === centrada && !forcar) || !el.clientWidth) return;
    const l = LOJAS[chave];
    if (chave && !l) return; // ficha sem pin (centro de distribuição): o mapa fica onde está
    centrada = chave;
    if (!chave) { if (posicoes.length) enquadrarTodos(true); return; }
    const zoom = Math.max(mapa.getZoom(), 10), { esq, dir } = reservas();
    mapa.flyTo(mapa.unproject(mapa.project([l.lat, l.lon], zoom).add([(dir - esq) / 2, 0]), zoom), zoom, { duration: 0.7 });
  };
  // Troca de aba: o mapa da outra aba parte de onde o mapa anterior estava (visao/ir) e depois voa para o próprio enquadramento (centralizar).
  el.visao = () => { const c = mapa.getCenter(); return { centro: [c.lat, c.lng], zoom: mapa.getZoom() }; };
  el.ir = v => { enquadrado = true; mapa.invalidateSize({ animate: false }); mapa.setView(v.centro, v.zoom, { animate: false }); };
  // O elemento ainda não está na página quando esta função termina: o primeiro tamanho real dispara o enquadramento.
  const tamanho = new ResizeObserver(() => {
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    mapa.invalidateSize({ animate: false });
    if (enquadrado || !posicoes.length) return;
    enquadrado = true;
    enquadrarTodos(false);
  });
  tamanho.observe(el);
  instancias.push({ el, naPagina: false, soltar: () => { el.solto = true; tamanho.disconnect(); mapa.remove(); } });
  return el;
}
