import { classificar, porPrioridade, tempoRelativo, palavrasChave, citaPalavra, ordenarAvaliacoes, ORDENS, textoOriginal, abreviar, buscaAvaliacao, limitesDoPeriodo } from './avaliacoes-google-regras.js';
import { lerColado, adicionar, apelidosDoTexto, nomesAmbiguos, ordenar, idDe, paraCsv, chave } from './avaliacoes-google-vendedores.js';
import { desenharMapa, lojaDaFicha, LOJAS } from './avaliacoes-google-mapa.js';

const $ = id => document.getElementById(id);
const PAGINA = 20;
const NIVEIS = { critica: 'Crítica', atencao: 'Atenção', elogio: 'Elogio' };
const FILTRO_PADRAO = { periodo: '90', de: '', ate: '', nota: '', prioridade: '', resposta: '' };
const state = { filtro: { ...FILTRO_PADRAO }, filtroUi: null, aba: 'geral', dados: null, memoLoja: null, memoLojas: { consulta: '', ordem: 'volume' }, resumo: null, fichas: new Map(), blocos: {}, visiveis: PAGINA, vendedores: [], rev: 0, fila: Promise.resolve(), geracao: 0, menu: null, lojaSel: '', lojaMapa: '', inicial: {}, podeEditar: false, mensagem: '', lendo: {}, seq: 0 };

// Monta nós com textContent: o texto das avaliações vem de terceiros e nunca entra como HTML.
function h(tag, props = {}, ...filhos) {
  const no = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => { if (k === 'class') no.className = v; else if (k.startsWith('on')) no.addEventListener(k.slice(2), v); else no.setAttribute(k, v); });
  filhos.flat().forEach(f => { if (f) no.append(f); });
  return no;
}
const data = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
const media = lista => { const com = lista.filter(r => r.s >= 1); return com.length ? (com.reduce((t, r) => t + r.s, 0) / com.length).toFixed(1).replace('.', ',') : '–'; };
const aviso = (texto, erro) => { const no = $('agStatus'); no.hidden = false; no.textContent = texto; no.setAttribute('role', erro ? 'alert' : 'status'); $('agConteudo').hidden = true; };

// Limite inferior do que a tela lê (ISO, '' = desde o começo). O limite superior só corta depois, em filtradas().
function corteDoPeriodo() {
  const [inicio] = limitesDoPeriodo(state.filtro.periodo, state.filtro.de, state.filtro.ate);
  return inicio ? new Date(inicio).toISOString() : '';
}
// Só os meses entre o começo e o fim do período (o fim vale no intervalo personalizado com "Até"); cada mês é um documento grande, então não se lê o que fica de fora.
const mesesFaltando = () => {
  const [, fim] = limitesDoPeriodo(state.filtro.periodo, state.filtro.de, state.filtro.ate), ultimo = fim ? new Date(fim).toISOString().slice(0, 7) : '9999-12';
  return state.resumo.meses.filter(m => m >= corteDoPeriodo().slice(0, 7) && m <= ultimo && !state.blocos[m]);
};

// Cada mês é um documento; só baixa os que o período pede e que ainda não estão em memória.
const lerMes = mes => (state.lendo[mes] ||= window.PortalFirebase.readAvaliacoesGoogle(mes).then(
  bloco => {
    const recs = JSON.parse((bloco && bloco.reviewsJson) || '{}');
    Object.values(recs).forEach(r => { r.t = textoOriginal(r.t); }); // sem o bloco "(Translated by Google)"
    state.blocos[mes] = recs;
  },
  erro => { delete state.lendo[mes]; throw erro; }));
const carregarMeses = () => Promise.all(mesesFaltando().map(lerMes));

function filtradas() {
  const corte = corteDoPeriodo(), [corteMs, fimMs] = limitesDoPeriodo(state.filtro.periodo, state.filtro.de, state.filtro.ate);
  const { nota, prioridade, resposta } = state.filtro;
  const agora = Date.now(), itens = [];
  Object.entries(state.blocos).forEach(([mes, bloco]) => {
    if (mes < corte.slice(0, 7)) return;
    Object.values(bloco).forEach(rec => {
      const f = state.fichas.get(rec.l);
      if (!f || Date.parse(rec.c) < corteMs || (fimMs && Date.parse(rec.c) > fimMs)) return;
      if (nota === 'neg' ? !(rec.s >= 1 && rec.s <= 2) : nota && rec.s !== Number(nota)) return;
      if (resposta === 'sem' && rec.r) return;
      if (resposta === 'com' && !rec.r) return;
      const cls = classificar(rec, agora);
      if (prioridade && cls.nivel !== prioridade) return;
      itens.push({ rec, cls, ficha: f });
    });
  });
  return itens;
}

const FAIXAS = [['ok', 4.6, '4,6 ou mais'], ['atencao', 4.2, '4,2 a 4,5'], ['ruim', 0.1, 'abaixo de 4,2']];
// "Ferramentas Gerais - Curitiba-PR": o nome da ficha mais a cidade-UF do cadastro, que é como a equipe identifica a loja no dia a dia.
const localFicha = f => [f.cidade, f.uf].filter(Boolean).join('-');
const tituloFicha = f => [f.title, localFicha(f)].filter(Boolean).join(' - '); // texto corrido (busca)
// Nome da ficha com a cidade-UF numa pílula, para a informação ganhar destaque: ["Ferramentas Gerais", (Curitiba-PR)]
const nomeFicha = f => [f.title, localFicha(f) && h('span', { class: 'ag-local' }, localFicha(f))].filter(Boolean);
// Loja do mapa, ou a própria ficha quando ela não tem pin (centro de distribuição, por exemplo): é o que o painel da loja filtra.
const chaveDaFicha = f => lojaDaFicha(f) || 'ficha:' + f.id;
// Voltar do painel da loja para a lista (botão de seta ou clicar de novo no pin) zera os filtros aplicados; abrir uma loja mantém os filtros.
function escolherLojaMapa(k) {
  state.lojaMapa = state.lojaMapa === k ? '' : k; state.memoLoja = null;
  if (!state.lojaMapa) state.filtroUi.zerar();
  atualizar();
}

// Quanto o painel da direita cobre do mapa: o enquadramento inicial deixa os pings fora dele.
function reservasDoMapa(mapa) {
  const painelDireito = mapa.parentElement && mapa.parentElement.querySelector('.ag-sobre > :last-child');
  if (!painelDireito) return { esq: 0, dir: 0 };
  const m = mapa.getBoundingClientRect(), d = painelDireito.getBoundingClientRect();
  return { esq: 0, dir: d.top < m.bottom && d.bottom > m.top ? Math.max(0, m.right - d.left) : 0 };
}

// Mapa com a nota média de cada loja no período e filtros atuais ("base" = sem o filtro do próprio mapa, para os outros pings não sumirem ao clicar em um).
// Devolve o mapa, que fica por trás de tudo (ver cena).
let mapaGeral = null; // { assinatura dos pings, elemento do mapa } da última Visão geral desenhada
function painelMapa(base) {
  const lojas = new Set([...state.fichas.values()].map(lojaDaFicha).filter(Boolean));
  if (!lojas.size) return null;
  const porLoja = {};
  base.forEach(i => { const k = lojaDaFicha(i.ficha); if (k) (porLoja[k] ||= []).push(i.rec); });
  const pings = [...lojas].map(k => {
    const notas = (porLoja[k] || []).filter(r => r.s >= 1), m = notas.length ? notas.reduce((t, r) => t + r.s, 0) / notas.length : 0;
    return { chave: k, nome: LOJAS[k].nome, texto: media(notas), status: m ? FAIXAS.find(f => Math.round(m * 10) / 10 >= f[1])[0] : '', vazio: !m,
      dica: notas.length ? `${LOJAS[k].nome}: nota média ${media(notas)} em ${notas.length} avaliações` : `${LOJAS[k].nome}: sem avaliações neste filtro` };
  });
  // Só a loja selecionada mudou (mesmos pings): reaproveita o mapa em vez de refazê-lo, senão ele pisca a cada loja aberta.
  const assinatura = JSON.stringify(pings);
  if (mapaGeral && mapaGeral.assinatura === assinatura && !mapaGeral.el.solto) { mapaGeral.el.selecionar(state.lojaMapa); mapaGeral.el.destacar(''); return mapaGeral.el; }
  const mapa = desenharMapa({ pings, selecionada: state.lojaMapa, aoEscolher: escolherLojaMapa, aoDestacar: realcarLinha, chaveVisao: 'geral', reservas: () => reservasDoMapa(mapa) });
  mapaGeral = { assinatura, el: mapa };
  return mapa;
}

// Visão geral: o mapa preenche toda a largura por trás e o painel da direita fica à frente. Sem loja no mapa, só o painel.
// A cena (mapa) vai da sua posição até o fim da janela, para o mapa ocupar a parte de baixo da tela; mínimo de 560px.
// Abaixo de 900px o CSS assume (mapa de 360px acima do painel). Roda depois de cada desenho da Visão geral e ao redimensionar a janela.
function ajustarAlturaCena() {
  const el = document.querySelector('#abaGeral .ag-cena');
  if (!el) return;
  if (matchMedia('(max-width:900px)').matches) { el.style.height = ''; return; }
  el.style.height = `${Math.max(560, window.innerHeight - (el.getBoundingClientRect().top + window.scrollY))}px`;
}

function cena(mapa, direita) {
  if (!mapa) return h('div', { class: 'ag-mapa-layout is-sozinho' }, direita);
  return h('div', { class: 'ag-cena' }, mapa, h('div', { class: 'ag-mapa-layout ag-sobre' }, direita));
}

// Estrelas com nota fracionária: a camada preenchida é cortada na largura proporcional à nota.
function estrelasNota(nota) {
  const cheias = '★★★★★';
  return h('span', { class: 'ag-rate', role: 'img', 'aria-label': `${String(Math.round(nota * 10) / 10).replace('.', ',')} de 5 estrelas` },
    h('i', { 'aria-hidden': 'true' }, cheias), h('b', { 'aria-hidden': 'true', style: `width:${Math.max(0, Math.min(5, nota)) * 20}%` }, cheias));
}

function avaliacaoLoja(rec) {
  const nome = rec.n || 'Anônimo';
  return h('article', { class: 'ag-rev' },
    h('div', { class: 'ag-rev-head' },
      h('span', { class: 'ag-avatar', 'aria-hidden': 'true' }, nome.trim().charAt(0).toUpperCase()),
      h('div', {}, h('div', { class: 'ag-rev-nome' }, nome),
        h('div', { class: 'ag-rev-linha' }, rec.s ? estrelasNota(rec.s) : h('span', {}, 'Sem nota'), h('span', { title: data(rec.c) }, tempoRelativo(rec.c))))),
    rec.t && h('p', { class: 'ag-text' }, rec.t),
    rec.r && h('div', { class: 'ag-reply' }, h('b', {}, 'Resposta da loja' + (rec.rt ? ` · ${tempoRelativo(rec.rt)}` : '')), rec.r));
}

const pad2 = n => String(n).padStart(2, '0');
const isoDia = (a, m, d) => `${a}-${pad2(m + 1)}-${pad2(d)}`;
const brDia = iso => iso ? iso.split('-').reverse().join('/') : '';
const primeiroDoMes = iso => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, 1);

// Filtro único da tela, no botão "Filtrar" ao lado da busca (substitui a barra de filtros do topo). Vale para a tela inteira: cartões, mapa, Visão geral e Fila.
// O painel que o botão abre tem: Período, "De" e "Até" (só com "Personalizado") com um calendário próprio, Nota, Prioridade e Resposta,
// e no fim Cancelar, Limpar e Aplicar. As escolhas ficam num rascunho: a tela só muda em Aplicar; Cancelar (ou fechar o painel) descarta o rascunho.
// O calendário nativo do navegador não serve: ao escolher o "De" a página não tem gesto do usuário para abrir o do "Até". Aqui, escolher o "De" leva direto
// ao "Até", no mês do dia escolhido, com os dias anteriores ao "De" bloqueados. "f" é o filtro em vigor (datas em YYYY-MM-DD); "aoMudar" refaz a tela.
// Existe uma instância só (state.filtroUi): os cartões da aba ativa a encaixam no seu lugar a cada desenho, e por isso o painel não fecha quando a tela se refaz.
const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['90', 'Últimos 90 dias'], ['365', 'Últimos 12 meses'], ['ano', 'Este ano'], ['all', 'Tudo'], ['custom', 'Personalizado']];
const OPCOES_FIXAS = {
  nota: [['', 'Todas'], ['neg', '1 e 2 estrelas'], ['5', '5 estrelas'], ['4', '4 estrelas'], ['3', '3 estrelas'], ['2', '2 estrelas'], ['1', '1 estrela']],
  prioridade: [['', 'Todas'], ['critica', 'Críticas'], ['atencao', 'Atenção'], ['elogio', 'Elogios']],
  resposta: [['', 'Todas'], ['sem', 'Sem resposta'], ['com', 'Respondidas']]
};
const SELECOES = [['nota', 'Nota'], ['prioridade', 'Prioridade'], ['resposta', 'Resposta']]; // [campo, rótulo]
const mesmoFiltro = (a, b) => Object.keys(FILTRO_PADRAO).every(k => a[k] === b[k]);
const temFiltro = f => !mesmoFiltro(f, FILTRO_PADRAO);
const rotuloOpcao = (k, v) => (OPCOES_FIXAS[k].find(o => o[0] === v) || [])[1];
// Critérios do filtro em vigor como trios [rótulo, valor, campo]: ['Nota', '5 estrelas', 'nota']. Sem "completo", o período padrão (90 dias) não entra.
const criteriosFiltros = (f, completo) => [
  ['Período', f.periodo === 'custom' ? ([f.de && `de ${brDia(f.de)}`, f.ate && `até ${brDia(f.ate)}`].filter(Boolean).join(' ') || 'Personalizado')
    : (completo || f.periodo !== FILTRO_PADRAO.periodo) && PERIODOS.find(p => p[0] === f.periodo)[1], 'periodo'],
  ...SELECOES.map(([k, rotulo]) => [rotulo, f[k] && rotuloOpcao(k, f[k]), k])].filter(([, v]) => v);
let contaFiltros = 0;
function criarFiltro(f, aoMudar) {
  let alvo = '', mes = new Date(); // alvo: campo que o calendário está preenchendo ('de', 'ate' ou '' se fechado)
  const r = { ...f }; // rascunho: o que o painel mostra; só vira filtro da tela em Aplicar
  const opcoes = k => OPCOES_FIXAS[k];

  const campo = (rotulo, chaveUi) => h('div', { class: 'ag-data' }, h('span', {}, rotulo),
    h('button', { type: 'button', class: 'ag-data-btn', 'aria-haspopup': 'dialog', 'aria-label': rotulo === 'De' ? 'Data inicial' : 'Data final', onclick: () => abrirCal(alvo === chaveUi ? '' : chaveUi) }));
  const de = campo('De', 'de'), ate = campo('Até', 'ate');
  const periodoSel = h('select', { 'aria-label': 'Período', onchange: e => { r.periodo = e.target.value; if (r.periodo !== 'custom') r.de = r.ate = ''; abrirCal(''); } },
    ...PERIODOS.map(([v, t]) => h('option', { value: v }, t)));
  const periodo = h('label', { class: 'ag-sel ag-periodo' }, h('span', {}, 'Período'), periodoSel);
  // "De" e "Até" só existem em Personalizado: abrem e fecham com animação de altura (grade 0fr/1fr, DESIGN.md §1)
  const datas = h('div', { class: 'ag-datas-colapso is-closed', inert: '' }, h('div', { class: 'ag-datas-miolo' }, h('div', { class: 'ag-datas-par' }, de, ate)));
  const selecoes = SELECOES.map(([k, rotulo]) => {
    const sel = h('select', { 'aria-label': `Filtrar por ${rotulo.toLowerCase()}`, onchange: e => { r[k] = e.target.value; sincronizar(); } });
    return { k, sel, el: h('label', { class: 'ag-sel' }, h('span', {}, rotulo), sel) };
  });
  function popular(k) { const x = selecoes.find(s => s.k === k); x.sel.replaceChildren(...opcoes(k).map(([v, t]) => h('option', { value: v }, t))); x.sel.value = r[k]; }
  selecoes.forEach(x => popular(x.k));
  const cancelar = h('button', { type: 'button', class: 'btn ghost', onclick: () => fechar() }, 'Cancelar');
  const limpar = h('button', { type: 'button', class: 'btn ghost', onclick: () => { Object.assign(r, FILTRO_PADRAO); selecoes.forEach(x => popular(x.k)); abrirCal(''); } }, 'Limpar');
  const aplicar = h('button', { type: 'button', class: 'btn', onclick: () => { Object.assign(f, r); abrirCal(''); fechar(true); aoMudar(); } }, 'Aplicar');
  const titulo = h('strong', { class: 'ag-cal-mes', 'aria-live': 'polite' }), grade = h('div', { class: 'ag-cal-grade' });
  const passo = (rotulo, delta, ic) => { const b = h('button', { type: 'button', class: 'ag-iconbtn', 'aria-label': rotulo, onclick: () => { mes = new Date(mes.getFullYear(), mes.getMonth() + delta, 1); desenharCal(); } }); b.append(icone(ic, 16)); return b; };
  const caixa = h('div', { class: 'ag-cal-caixa', role: 'dialog', 'aria-label': 'Escolher data' },
    h('div', { class: 'ag-cal-topo' }, passo('Mês anterior', -1, ICONES.anterior), titulo, passo('Próximo mês', 1, ICONES.avancar)), grade);
  const cal = h('div', { class: 'ag-cal is-closed', inert: '' }, h('div', { class: 'ag-cal-corpo' }, caixa));
  const painel = h('div', { class: 'ag-filtro is-closed', id: 'agFiltro' + (++contaFiltros), inert: '' }, h('div', { class: 'ag-filtro-corpo' }, h('div', { class: 'ag-filtro-caixa' },
    h('div', { class: 'ag-filtro-campos' }, h('div', { class: 'ag-datas' }, periodo, datas)), cal,
    h('div', { class: 'ag-filtro-selecoes' }, ...selecoes.map(x => x.el)),
    h('div', { class: 'ag-filtro-acoes' }, cancelar, limpar, aplicar))));
  const botao = h('button', { type: 'button', class: 'btn ghost ag-filtrar', 'aria-expanded': 'false', 'aria-controls': painel.id, onclick: () => {
    if (painel.classList.contains('is-closed')) { painel.classList.remove('is-closed'); painel.inert = false; botao.setAttribute('aria-expanded', 'true'); } else fechar();
  } }, icone(ICONES.funil, 16), 'Filtrar');
  // Fecha o painel. Sem "aplicado", descarta o rascunho e volta ao filtro em vigor.
  function fechar(aplicado) {
    if (!aplicado) { Object.assign(r, f); selecoes.forEach(x => popular(x.k)); }
    abrirCal('');
    painel.classList.add('is-closed'); painel.inert = true; botao.setAttribute('aria-expanded', 'false');
  }

  // A caixa tem a largura e a posição do campo em escolha ("De" à esquerda, "Até" à direita). Ao passar de um para o outro ela desliza (transform, .25s);
  // na primeira abertura e ao redimensionar ela só se posiciona, sem deslizar.
  function posicionar(deslizar) {
    if (!alvo) return;
    const rc = (alvo === 'ate' ? ate : de).getBoundingClientRect(), c = cal.getBoundingClientRect();
    if (!deslizar) caixa.style.transition = 'none';
    caixa.style.width = `${rc.width}px`; caixa.style.transform = `translateX(${rc.left - c.left}px)`;
    if (!deslizar) { caixa.offsetWidth; caixa.style.transition = ''; } // força o estilo sem transição antes de religá-la
  }
  new ResizeObserver(() => posicionar(false)).observe(cal);
  function escolher(iso) {
    if (alvo === 'de') {
      r.de = iso; if (r.ate && r.ate < iso) r.ate = '';
      mes = primeiroDoMes(iso); alvo = 'ate'; // segue para o "Até", já no mês do dia escolhido
      desenharCal(true); sincronizar(); posicionar(true);
    } else { r.ate = iso; abrirCal(''); }
  }
  function desenharCal(foco) {
    const a = mes.getFullYear(), m = mes.getMonth(), agora = new Date(), hoje = isoDia(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const nome = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); titulo.textContent = nome.charAt(0).toUpperCase() + nome.slice(1);
    const dias = [...['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => h('span', { class: 'ag-cal-sem', 'aria-hidden': 'true' }, d)), ...Array.from({ length: new Date(a, m, 1).getDay() }, () => h('span'))];
    for (let d = 1; d <= new Date(a, m + 1, 0).getDate(); d++) {
      const iso = isoDia(a, m, d), bloqueado = (alvo === 'ate' && r.de && iso < r.de) || (alvo === 'de' && r.ate && iso > r.ate);
      const sel = iso === r.de || iso === r.ate, dentro = r.de && r.ate && iso > r.de && iso < r.ate;
      const dia = h('button', { type: 'button', class: 'ag-cal-dia' + (sel ? ' is-sel' : '') + (dentro ? ' is-dentro' : '') + (iso === hoje ? ' is-hoje' : ''),
        'aria-pressed': String(sel), 'aria-label': brDia(iso), onclick: () => escolher(iso) }, String(d));
      dia.disabled = !!bloqueado; // propriedade: o h() escreve atributo, e disabled="false" também desabilita
      dias.push(dia);
    }
    grade.replaceChildren(...dias);
    if (foco) (grade.querySelector('.is-sel:not(:disabled)') || grade.querySelector('.ag-cal-dia:not(:disabled)'))?.focus();
  }
  function abrirCal(quem) {
    if (r.periodo !== 'custom') quem = ''; // as datas só valem em "Personalizado"
    const estavaAberto = !cal.classList.contains('is-closed');
    alvo = quem;
    if (quem) { const base = r[quem] || (quem === 'ate' && r.de) || ''; mes = base ? primeiroDoMes(base) : new Date(); desenharCal(); }
    cal.classList.toggle('is-closed', !quem); cal.inert = !quem; sincronizar(); posicionar(estavaAberto);
  }
  function sincronizar() { // campos, selects e botões refletem o rascunho; o botão Filtrar reflete o filtro em vigor
    const custom = r.periodo === 'custom';
    [[de, 'de'], [ate, 'ate']].forEach(([el, k]) => {
      const b = el.lastChild;
      b.disabled = !custom; b.textContent = brDia(r[k]) || 'dd/mm/aaaa'; b.classList.toggle('is-vazio', !r[k]); b.classList.toggle('is-ativo', alvo === k); b.setAttribute('aria-expanded', String(alvo === k));
    });
    periodoSel.value = r.periodo; datas.classList.toggle('is-closed', !custom); datas.inert = !custom;
    selecoes.forEach(x => { x.sel.value = r[x.k]; });
    botao.classList.toggle('is-ativo', temFiltro(f));
    limpar.disabled = mesmoFiltro(r, FILTRO_PADRAO);
    aplicar.disabled = mesmoFiltro(r, f) || (custom && !r.de && !r.ate); // sem mudança, ou "Personalizado" sem nenhuma data
  }
  // Tira um critério do filtro em vigor (e do rascunho) e refaz a tela: o período volta ao padrão, com as datas; os demais voltam a "Todas".
  function remover(k) {
    (k === 'periodo' ? ['periodo', 'de', 'ate'] : [k]).forEach(x => { f[x] = r[x] = FILTRO_PADRAO[x]; });
    abrirCal(''); aoMudar();
  }
  // Volta tudo ao padrão (filtro em vigor e rascunho) e fecha o painel, sem refazer a tela: quem chama é quem refaz. Usado ao voltar do painel da loja para a lista.
  function zerar() {
    Object.assign(f, FILTRO_PADRAO); Object.assign(r, FILTRO_PADRAO); selecoes.forEach(x => popular(x.k));
    fechar(true);
  }
  painel.addEventListener('keydown', e => { if (e.key === 'Escape' && alvo) { e.stopPropagation(); const x = (alvo === 'de' ? de : ate).lastChild; abrirCal(''); x.focus(); } });
  sincronizar();
  return { botao, painel, remover, zerar };
}

// Cartão que só carrega o filtro (Fila de atenção e erro de leitura): resumo do que está filtrado e o botão, com o painel por baixo.
const cartaoFiltro = () => h('div', { class: 'card ag-panel ag-fila-filtro' },
  h('div', { class: 'ag-busca-linha ag-solo' }, h('p', { class: 'ag-resumo' }, criteriosFiltros(state.filtro).filter(([, , k]) => k !== 'periodo').map(([, v]) => v).join(' · ') || 'Sem outros filtros'), state.filtroUi.botao), state.filtroUi.painel);

// Campo de busca do referencial da loja: o campo é refeito a cada digitação, então quem chama devolve o foco (data-ref 'busca').
function campoBusca(valor, aoDigitar, rotulo) {
  return h('label', { class: 'ag-busca' }, icone(ICONES.lupa, 16),
    h('input', { type: 'search', placeholder: 'Pesquisar avaliações', 'aria-label': rotulo, value: valor, autocomplete: 'off', 'data-ref': 'busca', oninput: aoDigitar, oncompositionend: aoDigitar }));
}
const linhaBusca = (campo, botao) => h('div', { class: 'ag-busca-linha' }, campo, botao);

// Referencial da loja escolhida no mapa, no formato da página de avaliações do Google: nome, endereço, nota, palavras-chave, ordem e avaliações.
// Usa as avaliações já filtradas (período, nota, resposta...). Estado próprio (palavra, ordem, quantas mostrar): cada clique redesenha só este painel.
function painelLoja(chaveLoja, itens, inicial = {}) {
  const fichas = [...state.fichas.values()].filter(f => chaveDaFicha(f) === chaveLoja);
  const porFicha = {};
  itens.forEach(i => { porFicha[i.rec.l] = (porFicha[i.rec.l] || 0) + 1; });
  const principal = [...fichas].sort((a, b) => (porFicha[b.id] || 0) - (porFicha[a.id] || 0))[0] || { title: (LOJAS[chaveLoja] || {}).nome || '' };
  const enderecos = [...new Set(fichas.map(f => f.endereco || [f.cidade, f.uf].filter(Boolean).join(' / ')).filter(Boolean))];
  const recs = itens.map(i => i.rec), notas = recs.filter(r => r.s >= 1);
  const mediaNum = notas.length ? notas.reduce((t, r) => t + r.s, 0) / notas.length : 0;
  const chaves = palavrasChave(recs.map(r => r.t));
  // A busca, a palavra-chave e a ordem sobrevivem a uma mudança de filtro, que refaz o painel (state.memoLoja vale enquanto for a mesma loja).
  const ui = state.memoLoja && state.memoLoja.chave === chaveLoja ? state.memoLoja.ui : { ordem: 'relevantes', palavra: '', busca: '', visiveis: 10 };
  if (inicial.busca) ui.busca = inicial.busca;
  state.memoLoja = { chave: chaveLoja, ui };
  const caixa = h('div', { class: 'card ag-panel ag-ref', translate: 'no' });
  // As palavras-chave são sugestões do campo de busca: abrem quando ele é acionado (animação de altura, DESIGN.md §1) e ficam abertas enquanto
  // houver uma palavra escolhida. O elemento é o mesmo em todo redesenho; só o conteúdo muda, senão a animação recomeçaria.
  const sugestoes = h('div', { class: 'ag-sugestoes' + (ui.palavra ? '' : ' is-closed'), inert: '' }, h('div', { class: 'ag-sugestoes-corpo' }));
  sugestoes.inert = !ui.palavra; // com palavra-chave escolhida (painel refeito por um filtro) as sugestões já nascem abertas
  const mostrar = aberto => { sugestoes.classList.toggle('is-closed', !aberto); sugestoes.inert = !aberto; };
  // setTimeout: o redesenho devolve o foco ao campo no mesmo instante, e só depois de ele assentar dá para saber se o foco saiu de verdade.
  const fecharSeSaiu = () => setTimeout(() => { const a = document.activeElement; if (!ui.palavra && !(a && caixa.contains(a) && a.closest('.ag-busca, .ag-sugestoes'))) mostrar(false); }, 0);
  caixa.addEventListener('focusin', e => { if (e.target.closest('.ag-busca')) mostrar(true); });
  caixa.addEventListener('focusout', fecharSeSaiu);

  const voltar = h('button', { type: 'button', class: 'btn small ag-voltar', 'aria-label': 'Ver todas as fichas', title: 'Ver todas as fichas', onclick: () => escolherLojaMapa('') });
  voltar.append(icone(ICONES.voltar, 16));
  // Menu de reticências ao lado do voltar (mesmo tamanho e forma): relatório da loja e atalho para a ficha no Google
  const mais = h('button', { type: 'button', class: 'btn ghost ag-voltar', 'aria-label': 'Mais ações', title: 'Mais ações', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: e => menuMaisAcoes(e.currentTarget, [['Exportar relatório', ICONES.baixar, () => modalRelatorio(principal)], ['Ver no Google', ICONES.externo, () => verNoGoogle(principal)]]) });
  mais.append(icone(ICONES.reticencias, 16));
  const pilula = (rotulo, ativo, aoClicar, contagem, id) => h('button', { type: 'button', class: 'ag-pill', 'aria-pressed': String(ativo), 'data-ref': id, onclick: aoClicar }, rotulo, contagem != null && h('small', {}, String(contagem)));
  function desenhar() {
    const ativo = document.activeElement, foco = ativo && ativo.dataset.ref, selecao = foco === 'busca' ? [ativo.selectionStart, ativo.selectionEnd] : null;
    const lista = ordenarAvaliacoes(recs.filter(r => (!ui.palavra || citaPalavra(r, ui.palavra)) && buscaAvaliacao(r, ui.busca)), ui.ordem);
    const aoDigitar = e => { if (e.isComposing) return; ui.busca = e.target.value; ui.visiveis = 10; desenhar(); }; // durante a composição de acento o campo não é refeito
    const mudar = mudanca => () => { Object.assign(ui, mudanca, { visiveis: 10 }); desenhar(); fecharSeSaiu(); };
    // mousedown sem foco: clicar numa palavra não tira o foco do campo (o que fecharia as sugestões antes do clique)
    sugestoes.firstChild.replaceChildren(h('div', { class: 'ag-pills', role: 'group', 'aria-label': 'Palavras-chave', onmousedown: e => e.preventDefault() },
      pilula('Tudo', !ui.palavra, mudar({ palavra: '' }), null, 'p-tudo'), ...chaves.map(c => pilula(c.palavra, ui.palavra === c.palavra, mudar({ palavra: ui.palavra === c.palavra ? '' : c.palavra }), c.n, 'p-' + c.palavra))));
    // Resultado da combinação: só aparece com busca, palavra-chave ou filtro fora do padrão. Cada critério vira uma etiqueta "Rótulo valor" (Busca, Palavra-chave,
    // Período, Nota, Prioridade, Resposta), todos valendo ao mesmo tempo (E); a contagem é a da lista abaixo. O período padrão não vira etiqueta: ele está sempre no cabeçalho.
    const busca = ui.busca.trim(), algum = busca || ui.palavra || temFiltro(state.filtro);
    const criterios = [busca && ['Busca', `“${busca}”`, 'busca'], ui.palavra && ['Palavra-chave', `“${ui.palavra}”`, 'palavra'], ...criteriosFiltros(state.filtro)].filter(Boolean);
    // Cada critério tem um x que o tira da combinação e volta à busca sem ele; o período padrão (90 dias) não tem x, porque não há o que tirar
    const tirar = k => k === 'busca' || k === 'palavra' ? mudar({ [k]: '' })() : state.filtroUi.remover(k);
    const etiqueta = ([rotulo, valor, k]) => {
      const x = !(k === 'periodo' && state.filtro.periodo === FILTRO_PADRAO.periodo) && h('button', { type: 'button', class: 'ag-crit-x', 'aria-label': `Remover ${rotulo}: ${valor}`, title: 'Remover', onclick: () => tirar(k) });
      if (x) x.append(icone(ICONES.fechar, 12));
      return h('li', { class: x ? 'tem-x' : '' }, h('span', {}, rotulo), h('b', {}, valor), x);
    };
    const resultado = algum && h('div', { class: 'ag-resultado', role: 'status' },
      h('div', { class: 'ag-resultado-topo' }, h('p', {}, busca || ui.palavra ? 'Resultados de busca' : 'Avaliações filtradas'),
        h('span', { class: 'ag-resultado-n' }, `${lista.length} ${lista.length === 1 ? 'resultado' : 'resultados'}`)),
      h('ul', { class: 'ag-criterios', 'aria-label': 'Critérios aplicados' }, ...criterios.map(etiqueta)));
    caixa.replaceChildren(...[
      h('div', { class: 'ag-ref-topo' }, h('div', {}, h('h2', { class: 'ag-ref-nome' }, ...nomeFicha(principal)), ...enderecos.map(e => h('p', { class: 'ag-ref-end' }, e))),
        h('div', { class: 'ag-ref-acoes' }, mais, voltar)),
      h('div', { class: 'ag-ref-nota' }, h('strong', {}, media(recs)), mediaNum ? estrelasNota(mediaNum) : null, h('span', {}, `${recs.length} ${recs.length === 1 ? 'avaliação' : 'avaliações'} `, h('i', { class: 'ag-ref-periodo' }, `(${criteriosFiltros(state.filtro, true)[0][1]})`))), // período da nota e da quantidade, inclusive no padrão (90 dias)
      linhaBusca(campoBusca(ui.busca, aoDigitar, 'Pesquisar avaliações desta loja'), state.filtroUi.botao), state.filtroUi.painel,
      chaves.length > 0 && sugestoes,
      resultado,
      h('div', {}, h('p', { class: 'ag-ref-rotulo' }, 'Ordenar por'),
        h('div', { class: 'ag-pills', role: 'group', 'aria-label': 'Ordenar por' }, ...ORDENS.map(([id, rotulo]) => pilula(rotulo, ui.ordem === id, mudar({ ordem: id }), null, 'o-' + id)))),
      lista.length ? h('div', { class: 'ag-revs' }, ...lista.slice(0, ui.visiveis).map(avaliacaoLoja)) : h('p', { class: 'list-empty' }, ui.busca || ui.palavra || temFiltro(state.filtro) ? 'Nenhuma avaliação encontrada.' : 'Nenhuma avaliação neste filtro.'),
      lista.length > ui.visiveis && h('button', { type: 'button', class: 'btn ghost ag-more', 'data-ref': 'mais', onclick: () => { ui.visiveis += 10; desenhar(); } }, `Mostrar mais (${lista.length - ui.visiveis})`)].filter(Boolean)); // replaceChildren escreveria "false" como texto
    if (foco) { const volta = [...caixa.querySelectorAll('[data-ref]')].find(b => b.dataset.ref === foco); if (volta) { volta.focus(); if (selecao) volta.setSelectionRange(selecao[0], selecao[1]); } }
  }
  desenhar();
  return caixa;
}

function renderGeral(itens, base) {
  const mapa = painelMapa(base), porFicha = {};
  itens.forEach(i => { const f = porFicha[i.rec.l] ||= { ficha: i.ficha, recs: [] }; f.recs.push(i.rec); });
  $('abaGeral').replaceChildren(cena(mapa, state.lojaMapa ? painelLoja(state.lojaMapa, itens, state.inicial) : painelLojas(porFicha)));
  state.inicial = {};
  ajustarAlturaCena();
  if (mapaGeral && !mapaGeral.el.solto) mapaGeral.el.centralizar(state.lojaMapa); // depois do painel na tela: o mapa usa a largura dele para centralizar
}

// Painel "Lojas" da Visão geral com busca: acha a loja pelo nome, endereço ou categoria e também pelo que está escrito nas avaliações dela.
// Digitar refaz só a lista (o campo e o mapa ficam); clicar numa loja abre o painel dela já com a busca aplicada às avaliações.
// Ordem do card Lojas. Empate sempre pelo volume de avaliações. "Menor nota" deixa por último a loja sem nenhuma nota.
// Linha da lista com o mouse (ou o foco) em cima: anima o pin da loja dela no mapa. Ficha sem pin (centro de distribuição) não anima nada.
// O inverso: mouse (ou foco) no pin do mapa deixa cinza a linha da loja na lista, o mesmo cinza do hover da linha, e a traz para a vista se estiver fora dela.
function realcarLinha(chave) {
  const linhas = [...document.querySelectorAll('#abaGeral .ag-ficha')];
  linhas.forEach(b => b.classList.toggle('is-realce', Boolean(chave) && b.dataset.loja === chave));
  const primeira = chave && linhas.find(b => b.dataset.loja === chave);
  // Rola só o cartão da lista (nunca a página, como o scrollIntoView faria) e só se a linha estiver fora da parte visível dele.
  const cartao = primeira && primeira.closest('.ag-sobre > :last-child');
  if (cartao) {
    const c = cartao.getBoundingClientRect(), r = primeira.getBoundingClientRect();
    if (r.top < c.top) cartao.scrollTop -= c.top - r.top; else if (r.bottom > c.bottom) cartao.scrollTop += r.bottom - c.bottom;
  }
}
function destacarPing(ficha) {
  if (mapaGeral && !mapaGeral.el.solto) mapaGeral.el.destacar(ficha ? lojaDaFicha(ficha) : '');
}
const mediaDe = rs => { const n = rs.filter(r => r.s >= 1); return n.length ? n.reduce((t, r) => t + r.s, 0) / n.length : 0; };
const semResposta = rs => rs.filter(r => !r.r).length;
const ORDENS_LOJAS = [
  ['volume', 'Mais avaliações', (a, b) => b.recs.length - a.recs.length],
  ['maior', 'Maior nota', (a, b) => mediaDe(b.recs) - mediaDe(a.recs)],
  ['menor', 'Menor nota', (a, b) => (mediaDe(a.recs) || 6) - (mediaDe(b.recs) || 6)],
  ['sem', 'Sem resposta', (a, b) => semResposta(b.recs) - semResposta(a.recs)]
];
function painelLojas(porFicha) {
  const linhas = Object.values(porFicha), memo = state.memoLojas; // a busca e a ordem sobrevivem a uma mudança de filtro, que refaz o card
  // Cabeçalho do card, no mesmo desenho do painel da loja, mas para a Ferramentas Gerais toda: nota geral, estrelas e total de avaliações de todas as fichas, com o período
  const todas = linhas.flatMap(l => l.recs), mediaGeral = mediaDe(todas);
  const topo = h('div', { class: 'ag-geral-topo' }, h('div', {}, h('h2', { class: 'ag-ref-nome' }, 'Ferramentas Gerais'), h('p', { class: 'ag-ref-end' }, 'Avaliações de todas as lojas e centros de distribuição da FG no Google Meu Negócio')),
    h('div', { class: 'ag-ref-nota' }, h('strong', {}, media(todas)), mediaGeral ? estrelasNota(mediaGeral) : null,
      h('span', {}, `${todas.length} ${todas.length === 1 ? 'avaliação' : 'avaliações'} `, h('i', { class: 'ag-ref-periodo' }, `(${criteriosFiltros(state.filtro, true)[0][1]})`))));
  const lista = h('ul', { class: 'ag-rows' });
  const desenhar = () => {
    destacarPing(null); // a lista é refeita: sem isso um destaque ficaria preso se a linha sumisse com o mouse em cima
    const q = memo.consulta.trim(), itensLi = [], cmp = ORDENS_LOJAS.find(o => o[0] === memo.ordem)[2];
    [...linhas].sort((a, b) => cmp(a, b) || b.recs.length - a.recs.length).forEach(({ ficha, recs: rs }) => {
      const porNome = buscaAvaliacao({ t: [tituloFicha(ficha), ficha.endereco, ficha.categoria, ficha.telefone].join(' ') }, q);
      const citam = q ? rs.filter(r => buscaAvaliacao(r, q)) : [];
      if (!porNome && !citam.length) return;
      const trecho = citam.find(r => r.t), notas = rs.filter(r => r.s >= 1);
      itensLi.push(h('li', {}, h('button', { type: 'button', class: 'ag-ficha', 'data-loja': lojaDaFicha(ficha), onpointerenter: () => destacarPing(ficha), onpointerleave: () => destacarPing(null), onfocus: () => destacarPing(ficha), onblur: () => destacarPing(null),
        onclick: () => { state.inicial = { busca: !porNome && citam.length ? q : '' }; escolherLojaMapa(chaveDaFicha(ficha)); } },
        h('strong', { class: 'ag-ficha-nome' }, ...nomeFicha(ficha)),
        h('span', { class: 'ag-ficha-nota' }, h('b', {}, media(rs)), estrelasNota(notas.length ? notas.reduce((t, r) => t + r.s, 0) / notas.length : 0), `(${abreviar(rs.length)} ${rs.length === 1 ? 'avaliação' : 'avaliações'})`,
          ficha.categoria && ` · ${ficha.categoria}`,
          memo.ordem === 'sem' && ` · ${semResposta(rs)} sem resposta`),
        h('small', {}, [ficha.endereco || ficha.rua || [ficha.cidade, ficha.uf].filter(Boolean).join(' - ') || 'Sem endereço', ficha.telefone].filter(Boolean).join(' · ')),
        citam.length > 0 && h('span', { class: 'ag-achou' },
          h('b', {}, `${citam.length} ${citam.length === 1 ? 'avaliação encontrada' : 'avaliações encontradas'}`),
          trecho && h('q', {}, trecho.t)))));
    });
    lista.replaceChildren(...(itensLi.length ? itensLi : [h('li', { class: 'list-empty' }, 'Nenhuma loja ou avaliação encontrada.')]));
  };
  desenhar();
  const pilulas = ORDENS_LOJAS.map(([id, rotulo]) => h('button', { type: 'button', class: 'ag-pill', 'aria-pressed': String(id === memo.ordem), onclick: () => {
    memo.ordem = id; pilulas.forEach((p, k) => p.setAttribute('aria-pressed', String(ORDENS_LOJAS[k][0] === memo.ordem))); desenhar();
  } }, rotulo));
  const digitou = e => { if (e.isComposing) return; memo.consulta = e.target.value; desenhar(); };
  const campo = h('label', { class: 'ag-busca' }, icone(ICONES.lupa, 16),
    h('input', { type: 'search', placeholder: 'Buscar loja ou avaliação', 'aria-label': 'Buscar por nome da loja ou por texto das avaliações', autocomplete: 'off', value: memo.consulta, oninput: digitou, oncompositionend: digitou }));
  return h('div', { class: 'card ag-panel' }, topo, linhaBusca(campo, state.filtroUi.botao), state.filtroUi.painel,
    h('div', { class: 'ag-ordem-lojas' }, h('p', { class: 'ag-ref-rotulo' }, 'Ordenar por'), h('div', { class: 'ag-pills', role: 'group', 'aria-label': 'Ordenar lojas por' }, ...pilulas)), lista);
}

function cartao({ rec, cls, ficha }) {
  const estrelas = rec.s ? '★'.repeat(rec.s) + '☆'.repeat(5 - rec.s) : '';
  return h('article', { class: `card ag-item is-${cls.nivel}` },
    h('div', { class: 'ag-head' },
      rec.s ? h('span', { class: 'ag-stars', role: 'img', 'aria-label': `${rec.s} estrelas` }, estrelas) : h('span', { class: 'ag-meta' }, 'Sem nota'),
      h('span', { class: `ag-chip is-${cls.nivel}` }, NIVEIS[cls.nivel]),
      cls.atrasada && h('span', { class: 'ag-chip is-critica' }, 'Atrasada'),
      h('span', { class: 'ag-meta' }, [rec.n || 'Anônimo', ficha.title, ficha.uf, data(rec.c)].filter(Boolean).join(' · '))),
    h('p', { class: 'ag-text' }, rec.t || '(avaliação sem comentário)'),
    cls.nivel !== 'elogio' && h('p', { class: 'ag-why' }, 'Por que: ' + cls.motivos.join('; ') + '.'),
    rec.r && h('div', { class: 'ag-reply' }, h('b', {}, 'Resposta da loja' + (rec.rt ? ` · ${data(rec.rt)}` : '')), rec.r));
}

function renderFila(itens) {
  const caixa = $('abaFila'), topo = cartaoFiltro();
  if (!itens.length) { caixa.replaceChildren(topo, h('p', { class: 'list-empty' }, 'Nenhuma avaliação neste filtro.')); return; }
  const ordenadas = [...itens].sort(porPrioridade), mostrar = ordenadas.slice(0, state.visiveis);
  caixa.replaceChildren(topo, ...mostrar.map(cartao),
    ...[ordenadas.length > mostrar.length && h('button', { type: 'button', class: 'btn ghost ag-more', onclick: () => { state.visiveis += PAGINA; renderFila(itens); } }, `Mostrar mais (${ordenadas.length - mostrar.length})`)].filter(Boolean));
}

// Cadastro de vendedores da campanha. Desativar mantém o histórico (vendedor que saiu); remover apaga do cadastro.
async function carregarVendedores() {
  const registro = await window.PortalFirebase.readAvaliacoesGoogle('vendedores');
  state.rev = Number((registro && registro.rev) || 0);
  state.vendedores = ((registro && registro.itens) || []).filter(v => v && v.id && v.loja && v.nome).map(v => ({ ...v, apelidos: v.apelidos || [], ativo: v.ativo !== false }));
}

// As gravações entram numa fila (uma por vez, sempre da lista mais recente) e conferem a revisão; falha ou conflito recarrega o cadastro.
const resumoVendedores = mensagem => `${state.vendedores.filter(v => v.ativo).length} ativos de ${state.vendedores.length} vendedores. ` + (mensagem || 'O primeiro nome já conta nas citações; use apelidos para o que o cliente costuma escrever (ex.: Lisboa).');

function salvarVendedores(lista, mensagem) {
  state.vendedores = lista; state.mensagem = mensagem;
  renderVendedores();
  const geracao = state.geracao;
  state.fila = state.fila.then(async () => {
    if (geracao !== state.geracao) return; // uma gravação anterior falhou e o cadastro foi recarregado: esta edição se perdeu
    try {
      const r = await window.PortalFirebase.writeAvaliacoesGoogleVendedores(state.vendedores, state.rev);
      if (!r.conflict) { state.rev = r.rev; return; }
      state.mensagem = 'Outra pessoa alterou o cadastro enquanto você editava. Recarregamos a lista: confira e refaça as últimas alterações.';
    } catch (e) { state.mensagem = 'Não foi possível salvar. Recarregamos o cadastro: confira e refaça as últimas alterações.'; }
    state.geracao++;
    try { await carregarVendedores(); } catch (e2) { /* mantém o que está na tela */ }
    renderVendedores(); state.mensagem = '';
  });
}

const icone = (paths, tamanho = 15) => { const s = h('span', { class: 'ag-ico', 'aria-hidden': 'true' }); s.innerHTML = window.PortalShell.svgIcon(paths, tamanho); return s; }; // SVG fixo do próprio código, nunca texto de terceiros
const ICONES = {
  funil: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  lupa: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  lapis: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  lixeira: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  reticencias: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  externo: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  seta: '<path d="m6 9 6 6 6-6"/>',
  voltar: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  anterior: '<path d="m15 18-6-6 6-6"/>',
  avancar: '<path d="m9 18 6-6-6-6"/>',
  fechar: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>'
};

// Modal do portal (.modal-backdrop + .modal): o corpo rola, cabeçalho e rodapé ficam fixos. "aoSalvar" devolve um texto de erro (o modal continua aberto) ou nada (fecha).
function abrirModal({ titulo, corpo, salvar = 'Salvar', perigo = false, aoSalvar }) {
  const erro = h('p', { class: 'ag-erro', role: 'alert', hidden: '' });
  const fechar = () => { backdrop.style.display = 'none'; backdrop.remove(); };
  const enviar = e => { e.preventDefault(); const msg = aoSalvar(); if (msg) { erro.textContent = msg; erro.hidden = false; } else fechar(); };
  const x = h('button', { type: 'button', class: 'modal-close', 'aria-label': 'Fechar', onclick: fechar });
  x.append(icone(ICONES.fechar));
  const backdrop = h('div', { class: 'modal-backdrop' }, h('div', { class: 'modal modal--narrow', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-header' }, h('h2', {}, titulo), h('div', { class: 'modal-header-actions' }, x)),
    h('form', { class: 'modal-form', novalidate: '', onsubmit: enviar },
      h('div', { class: 'modal-body' }, ...corpo, erro),
      h('div', { class: 'modal-footer' },
        h('button', { type: 'button', class: 'btn ghost', onclick: fechar }, 'Cancelar'),
        h('button', { type: 'submit', class: perigo ? 'btn ghost danger' : 'btn' }, salvar)))));
  backdrop.addEventListener('click', e => { if (e.target === backdrop) fechar(); });
  document.body.append(backdrop);
  window.PortalShell.wireModalA11y(backdrop, fechar);
  backdrop.style.display = 'flex';
}

const campo = (rotulo, no) => h('label', { class: 'ag-campo' }, rotulo, no);

function modalAdicionar() {
  const lojas = h('datalist', { id: 'agLojas' }, ...[...new Set(state.vendedores.map(v => v.loja))].sort().map(l => h('option', { value: l })));
  const loja = h('input', { list: 'agLojas', placeholder: 'Ex.: Curitiba', autocomplete: 'off' });
  const nome = h('input', { placeholder: 'Nome completo' });
  const apelidos = h('input', { placeholder: 'Ex.: Lisboa, Samuel' });
  abrirModal({ titulo: 'Adicionar vendedor', salvar: 'Adicionar', corpo: [campo('Loja', loja), lojas, campo('Nome', nome), campo('Apelidos', apelidos)],
    aoSalvar: () => {
      if (!loja.value.trim() || !nome.value.trim()) return 'Informe a loja e o nome.';
      const r = adicionar(state.vendedores, [{ loja: loja.value, nome: nome.value, apelidos: apelidosDoTexto(apelidos.value) }]);
      if (!r.adicionados) return 'Esse vendedor já está no cadastro dessa loja.';
      salvarVendedores(r.lista, 'Vendedor adicionado.');
    } });
}

function modalImportar() {
  const colado = h('textarea', { rows: '8', placeholder: 'Cole aqui as duas colunas da planilha (Loja e Vendedor), uma pessoa por linha.' });
  abrirModal({ titulo: 'Importar planilha', salvar: 'Importar', corpo: [h('p', { class: 'ag-ajuda' }, 'Copie as colunas Loja e Vendedor do Excel e cole abaixo. Quem já está no cadastro é ignorado.'), colado],
    aoSalvar: () => {
      const novos = lerColado(colado.value);
      if (!novos.length) return 'Não encontrei linhas com loja e vendedor. Cole as duas colunas, uma pessoa por linha.';
      const r = adicionar(state.vendedores, novos);
      salvarVendedores(r.lista, `${r.adicionados} adicionado(s); ${r.repetidos} já estavam no cadastro.`);
    } });
}

function modalEditar(v) {
  const nome = h('input', { value: v.nome });
  const apelidos = h('input', { placeholder: 'Ex.: Lisboa, Samuel', value: v.apelidos.join(', ') });
  const ativo = h('input', { type: 'checkbox', ...(v.ativo ? { checked: '' } : {}) });
  abrirModal({ titulo: 'Editar vendedor',
    corpo: [h('p', { class: 'ag-ajuda' }, `Loja: ${v.loja}`), campo('Nome', nome), campo('Apelidos (separados por vírgula)', apelidos),
      h('label', { class: 'ag-check' }, ativo, 'Vendedor ativo'),
      h('p', { class: 'ag-ajuda' }, 'Desativar tira o vendedor das contagens novas, mas mantém o cadastro (use para quem saiu da empresa).')],
    aoSalvar: () => {
      const novoNome = nome.value.trim();
      if (!novoNome) return 'Informe o nome.';
      const id = idDe(v.loja, novoNome);
      if (id !== v.id && state.vendedores.some(x => x.id === id)) return 'Já existe um vendedor com esse nome nessa loja.';
      salvarVendedores(state.vendedores.map(x => x.id === v.id ? { ...x, id, nome: novoNome, apelidos: apelidosDoTexto(apelidos.value), ativo: ativo.checked } : x), 'Vendedor atualizado.');
    } });
}

function modalRemover(v) {
  abrirModal({ titulo: 'Remover vendedor', salvar: 'Remover', perigo: true,
    corpo: [h('p', { class: 'ag-ajuda' }, `Remover ${v.nome} (${v.loja}) do cadastro? Se ele só saiu da empresa, prefira desativar em Editar: assim o histórico fica.`)],
    aoSalvar: () => salvarVendedores(state.vendedores.filter(x => x.id !== v.id), 'Vendedor removido.') });
}

function exportarLista() {
  const link = h('a', { href: URL.createObjectURL(new Blob([paraCsv(ordenar(state.vendedores))], { type: 'text/csv;charset=utf-8' })), download: `vendedores-fg-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// "Ver no Google": abre a página da ficha no Google Maps (metadata.mapsUri do cadastro, gravado pelo coletor). Se a coleta ainda não trouxe o link,
// cai na busca do Google Maps pelo nome e endereço da ficha, que costuma achar a mesma página mas não é exata.
function verNoGoogle(f) {
  const exato = /^https:\/\//.test(f.mapsUri || '') && f.mapsUri;
  const url = exato || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([f.title, f.endereco || localFicha(f)].filter(Boolean).join(' '))}`;
  window.open(url, '_blank', 'noopener');
}

// Exportar relatório: por enquanto só o modal de configuração, com as opções ainda por definir.
function modalRelatorio(f) {
  abrirModal({ titulo: 'Exportar relatório', salvar: 'Exportar',
    corpo: [h('p', { class: 'ag-ajuda' }, `Relatório de ${tituloFicha(f)}. As opções (período, conteúdo e formato) serão configuradas na próxima etapa.`)],
    aoSalvar: () => 'As opções do relatório ainda não foram definidas.' });
}

// Menu flutuante (DESIGN §1): position fixed, fecha com Esc, clique fora, rolagem e redimensionamento.
function menuMaisAcoes(botao, itensDados) {
  if (state.menu) { state.menu(); return; }
  const itens = itensDados || [state.podeEditar && ['Adicionar vendedor', ICONES.mais, modalAdicionar], state.podeEditar && ['Importar planilha', ICONES.subir, modalImportar], ['Exportar lista', ICONES.baixar, exportarLista]].filter(Boolean);
  const menu = h('div', { class: 'ag-menu', role: 'menu' }, ...itens.map(([texto, ic, fn]) => {
    const b = h('button', { type: 'button', role: 'menuitem', class: 'ag-menu-item', onclick: () => { fechar(); fn(); } });
    b.append(icone(ic), texto);
    return b;
  }));
  const fechar = () => {
    state.menu = null; menu.remove(); botao.setAttribute('aria-expanded', 'false'); botao.focus();
    document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla);
    window.removeEventListener('scroll', fechar, true); window.removeEventListener('resize', fechar);
  };
  const fora = e => { if (!menu.contains(e.target) && !botao.contains(e.target)) fechar(); };
  const tecla = e => {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
  };
  state.menu = fechar;
  document.body.append(menu);
  const r = botao.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`; menu.style.right = `${document.documentElement.clientWidth - r.right}px`;
  botao.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => menu.classList.add('is-open'));
  menu.querySelector('button').focus();
  document.addEventListener('pointerdown', fora); document.addEventListener('keydown', tecla);
  window.addEventListener('scroll', fechar, true); window.addEventListener('resize', fechar);
}

function botaoIcone(ic, rotulo, aoClicar, extra = '') {
  const b = h('button', { type: 'button', class: 'ag-iconbtn' + extra, 'aria-label': rotulo, title: rotulo, onclick: aoClicar });
  b.append(icone(ic, 15));
  return b;
}

function linhaVendedor(v, ambiguos) {
  const detalhe = [!v.ativo && 'Inativo', v.apelidos.length && `Apelidos: ${v.apelidos.join(', ')}`].filter(Boolean).join(' · ');
  return h('li', { class: 'ag-vend' + (v.ativo ? '' : ' is-off') },
    h('div', { class: 'ag-vend-nome' }, h('strong', {}, v.nome), detalhe && h('span', { class: 'ag-meta' }, detalhe),
      ambiguos.has(v.id) && h('span', { class: 'ag-chip is-atencao' }, 'Primeiro nome repetido: use apelidos')),
    ...(state.podeEditar ? [botaoIcone(ICONES.lapis, `Editar ${v.nome}`, () => modalEditar(v)), botaoIcone(ICONES.lixeira, `Remover ${v.nome}`, () => modalRemover(v), ' is-danger')] : []));
}

function renderVendedores() {
  const ambiguos = nomesAmbiguos(state.vendedores), porLoja = {};
  ordenar(state.vendedores).forEach(v => (porLoja[v.loja] ||= []).push(v));
  const lojas = Object.entries(porLoja);
  if (state.lojaSel && !lojas.some(([l]) => chave(l) === state.lojaSel)) state.lojaSel = '';
  const escolher = k => { state.lojaSel = state.lojaSel === k ? '' : k; renderVendedores(); };
  const mais = h('button', { type: 'button', class: 'btn ghost ag-mais', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: e => menuMaisAcoes(e.currentTarget) }, 'Mais ações');
  mais.append(icone(ICONES.seta, 14));
  const pings = lojas.map(([loja, lista]) => { const n = lista.filter(v => v.ativo).length; return { chave: chave(loja), nome: loja, texto: String(n), vazio: !n, dica: `${loja}: ${n} vendedor(es) ativo(s)` }; });
  const semPosicao = lojas.map(([l]) => l).filter(l => !LOJAS[chave(l)]);
  const mapa = h('div', { class: 'card ag-panel ag-mapa-card' }, h('h2', {}, 'Lojas no mapa'),
    desenharMapa({ pings, selecionada: state.lojaSel, aoEscolher: escolher, chaveVisao: 'vendedores' }),
    h('p', { class: 'ag-legenda' }, h('span', {}, 'O número é a quantidade de vendedores ativos. Clique numa loja para ver só ela.')),
    semPosicao.length > 0 && h('p', { class: 'ag-ajuda' }, `Sem posição no mapa (cidade ainda não cadastrada): ${semPosicao.join(', ')}.`));
  const mostrar = state.lojaSel ? lojas.filter(([l]) => chave(l) === state.lojaSel) : lojas;
  const lista = h('div', { class: 'card ag-panel ag-lista-lojas' }, ...mostrar.map(([loja, vs]) => h('section', { class: 'ag-loja' },
    h('div', { class: 'ag-loja-topo' }, h('h2', {}, loja, h('span', { class: 'ag-meta' }, `${vs.filter(v => v.ativo).length} ativos`)),
      state.lojaSel && h('button', { type: 'button', class: 'btn ghost small', onclick: () => escolher(state.lojaSel) }, 'Ver todas as lojas')),
    h('ul', { class: 'ag-vendlist' }, vs.map(v => linhaVendedor(v, ambiguos))))));
  $('abaVendedores').replaceChildren(...[
    h('div', { class: 'ag-vtopo' }, h('p', { class: 'ag-note', role: 'status', id: 'agVendMsg' }, resumoVendedores(state.mensagem)), mais),
    state.vendedores.length ? h('div', { class: 'ag-mapa-layout' }, mapa, lista) : h('p', { class: 'list-empty' }, 'Nenhum vendedor cadastrado ainda.')].filter(Boolean));
}

// Desenha só a aba aberta: o filtro tem uma instância só, que o cartão da aba ativa encaixa no seu lugar. Se o foco estava dentro do painel do filtro,
// ele volta para o mesmo controle depois (mover o elemento o tira do foco).
function renderAba() {
  if (!state.dados) return;
  const a = document.activeElement, dentro = a && state.filtroUi.painel.contains(a);
  if (state.aba === 'geral') renderGeral(state.dados.itens, state.dados.base);
  else if (state.aba === 'fila') renderFila(state.dados.base);
  if (dentro) a.focus();
}

async function atualizar() {
  const minha = ++state.seq;
  if (mesesFaltando().length) { $('agStatus').hidden = false; $('agStatus').textContent = 'Carregando as avaliações…'; $('agConteudo').hidden = true; }
  try { await carregarMeses(); } catch (e) {
    if (minha !== state.seq) return;
    aviso('Não foi possível ler as avaliações agora. Tente de novo ou troque o filtro.', true);
    $('agConteudo').hidden = false; // o filtro continua à mão, no cartão que o carrega, para tentar de novo
    const aqui = state.aba === 'fila' ? $('abaFila') : $('abaGeral');
    $('abaGeral').replaceChildren(); $('abaFila').replaceChildren(); aqui.replaceChildren(cartaoFiltro(), h('button', { type: 'button', class: 'btn', onclick: atualizar }, 'Tentar de novo'));
    return;
  }
  if (minha !== state.seq) return;
  $('agStatus').hidden = true; $('agConteudo').hidden = false;
  state.visiveis = PAGINA;
  const base = filtradas(), itens = state.lojaMapa ? base.filter(i => chaveDaFicha(i.ficha) === state.lojaMapa) : base;
  state.dados = { itens, base };
  renderAba(); // o clique no mapa filtra só a Visão geral
}

function trocarAba(aba) {
  document.querySelectorAll('#agTabs button').forEach(b => { const ativa = b.dataset.aba === aba; b.classList.toggle('active', ativa); b.setAttribute('aria-selected', ativa); });
  $('abaGeral').hidden = aba !== 'geral'; $('abaFila').hidden = aba !== 'fila'; $('abaVendedores').hidden = aba !== 'vendedores';
  state.aba = aba; renderAba();
}

async function iniciar() {
  try { state.resumo = await window.PortalFirebase.readAvaliacoesGoogle('resumo'); } catch (e) { aviso('Você não tem acesso às avaliações ou a conexão falhou.', true); return; }
  if (!state.resumo) { aviso('Aguardando coleta. As avaliações das fichas aparecem aqui assim que a primeira coleta for feita.'); return; }
  state.resumo.fichas.forEach(f => state.fichas.set(f.id, f));
  state.filtroUi = criarFiltro(state.filtro, atualizar);
  window.addEventListener('resize', ajustarAlturaCena);
  try {
    const admin = ((await window.PortalFirebase.currentContext()).profile || {}).role === 'admin';
    await carregarVendedores();
    state.podeEditar = admin;
  } catch (e) { state.mensagem = 'Não foi possível ler o cadastro de vendedores; a edição fica bloqueada. Recarregue a página.'; }
  renderVendedores();
  $('agNota').textContent = `Atualizado em ${new Date(state.resumo.updatedAt).toLocaleString('pt-BR')}`;
  $('agTabs').addEventListener('click', e => { const b = e.target.closest('button[data-aba]'); if (b) trocarAba(b.dataset.aba); });
  atualizar();
}

// auth-guard.js é módulo adiado: window.PortalFirebase só existe depois dele.
if (window.PortalFirebase) iniciar(); else window.addEventListener('portal-firebase-ready', iniciar, { once: true });
