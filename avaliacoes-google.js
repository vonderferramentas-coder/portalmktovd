import { classificar, porPrioridade, HORAS_ATRASO } from './avaliacoes-google-regras.js';
import { lerColado, adicionar, apelidosDoTexto, nomesAmbiguos, ordenar, idDe, paraCsv, chave } from './avaliacoes-google-vendedores.js';
import { desenharMapa, lojaDaFicha, LOJAS } from './avaliacoes-google-mapa.js';

const $ = id => document.getElementById(id);
const PAGINA = 20;
const NIVEIS = { critica: 'Crítica', atencao: 'Atenção', elogio: 'Elogio' };
const state = { resumo: null, fichas: new Map(), blocos: {}, visiveis: PAGINA, vendedores: [], rev: 0, fila: Promise.resolve(), geracao: 0, menu: null, lojaSel: '', lojaMapa: '', podeEditar: false, mensagem: '', lendo: {}, seq: 0 };

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

function corteDoPeriodo() {
  const periodo = $('fPeriodo').value;
  return periodo === 'all' ? '' : new Date(Date.now() - Number(periodo) * 864e5).toISOString();
}
const mesesFaltando = () => state.resumo.meses.filter(m => m >= corteDoPeriodo().slice(0, 7) && !state.blocos[m]);

// Cada mês é um documento; só baixa os que o período pede e que ainda não estão em memória.
const lerMes = mes => (state.lendo[mes] ||= window.PortalFirebase.readAvaliacoesGoogle(mes).then(
  bloco => { state.blocos[mes] = JSON.parse((bloco && bloco.reviewsJson) || '{}'); },
  erro => { delete state.lendo[mes]; throw erro; }));
const carregarMeses = () => Promise.all(mesesFaltando().map(lerMes));

function filtradas() {
  const corte = corteDoPeriodo(), corteMs = corte ? Date.parse(corte) : 0;
  const uf = $('fUf').value, ficha = $('fFicha').value, nota = $('fNota').value, prioridade = $('fPrioridade').value, resposta = $('fResposta').value;
  const agora = Date.now(), itens = [];
  Object.entries(state.blocos).forEach(([mes, bloco]) => {
    if (mes < corte.slice(0, 7)) return;
    Object.values(bloco).forEach(rec => {
      const f = state.fichas.get(rec.l);
      if (!f || Date.parse(rec.c) < corteMs) return;
      if (ficha && rec.l !== ficha) return;
      if (uf && (f.uf || '-') !== uf) return;
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

function tile(rotulo, valor, { ruim, ir } = {}) {
  const filhos = [h('strong', {}, String(valor)), h('span', {}, rotulo)];
  const classe = 'card ag-tile' + (ruim ? ' is-bad' : '');
  return ir ? h('button', { type: 'button', class: classe, onclick: () => trocarAba(ir) }, filhos) : h('div', { class: classe }, filhos);
}

const painel = (titulo, corpo) => h('div', { class: 'card ag-panel' }, h('h2', {}, titulo), corpo);

function barra(rotulo, parte, valor) {
  return h('div', { class: 'ag-bar' }, h('span', {}, rotulo), h('i', {}, h('b', { style: `width:${parte * 100}%` })), h('em', {}, valor));
}

const FAIXAS = [['ok', 4.6, '4,6 ou mais'], ['atencao', 4.2, '4,2 a 4,5'], ['ruim', 0.1, 'abaixo de 4,2']];
function escolherLojaMapa(k) { state.lojaMapa = state.lojaMapa === k ? '' : k; atualizar(); }

// Mapa com a nota média de cada loja no período e filtros atuais ("base" = sem o filtro do próprio mapa, para os outros pings não sumirem ao clicar em um).
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
  return h('div', { class: 'card ag-panel ag-mapa-card' },
    h('div', { class: 'ag-loja-topo' }, h('h2', {}, 'Nota média por loja'), state.lojaMapa && h('button', { type: 'button', class: 'btn ghost small', onclick: () => escolherLojaMapa('') }, 'Ver todas as lojas')),
    desenharMapa({ pings, selecionada: state.lojaMapa, aoEscolher: escolherLojaMapa }),
    h('p', { class: 'ag-legenda' }, h('span', {}, 'Bolinha no pin:'), ...FAIXAS.map(([cor, , texto]) => h('span', {}, h('i', { class: `ag-dot is-${cor}` }), texto)), h('span', {}, 'Clique numa loja para filtrar esta visão.')));
}

function renderGeral(itens, base) {
  const recs = itens.map(i => i.rec), mapa = painelMapa(base);
  if (!recs.length) { $('abaGeral').replaceChildren(...[mapa, h('p', { class: 'list-empty' }, 'Nenhuma avaliação neste filtro.')].filter(Boolean)); return; }
  const criticas = itens.filter(i => i.cls.nivel === 'critica' && !i.rec.r).length;
  const atrasadas = itens.filter(i => i.cls.atrasada).length;
  const tiles = h('div', { class: 'ag-tiles' },
    tile('Avaliações', recs.length), tile('Nota média', media(recs)), tile('Sem resposta', recs.filter(r => !r.r).length),
    tile('Críticas pendentes', criticas, { ruim: criticas > 0, ir: 'fila' }), tile(`Atrasadas (+${HORAS_ATRASO} h)`, atrasadas, { ruim: atrasadas > 0, ir: 'fila' }));

  const contagem = n => recs.filter(r => r.s === n).length;
  const maior = Math.max(1, ...[1, 2, 3, 4, 5].map(contagem));
  const estrelas = [5, 4, 3, 2, 1].map(n => barra(`${n} ★`, contagem(n) / maior, String(contagem(n))));

  const porMes = {};
  recs.forEach(r => (porMes[r.c.slice(0, 7)] ||= []).push(r));
  const meses = Object.keys(porMes).sort().reverse().slice(0, 12);
  const maiorMes = Math.max(1, ...meses.map(m => porMes[m].length));
  const mensal = meses.map(m => barra(`${m.slice(5)}/${m.slice(2, 4)}`, porMes[m].length / maiorMes, `${porMes[m].length} · ${media(porMes[m])}`));

  const porFicha = {};
  itens.forEach(i => (porFicha[i.rec.l] ||= { ficha: i.ficha, recs: [] }).recs.push(i.rec));
  const fichas = Object.values(porFicha).sort((a, b) => b.recs.length - a.recs.length).map(({ ficha, recs: rs }) => h('li', {},
    h('span', {}, ficha.title), h('span', { class: 'ag-num' }, `${media(rs)} ★`),
    h('small', {}, [ficha.cidade, ficha.uf].filter(Boolean).join(' / ') || 'Sem endereço'),
    h('small', { class: 'ag-num' }, `${rs.length} avaliações · ${rs.filter(r => !r.r).length} sem resposta`)));

  $('abaGeral').replaceChildren(tiles, h('div', { class: 'ag-mapa-layout' + (mapa ? '' : ' is-sozinho') }, ...[mapa, painel('Por ficha', h('ul', { class: 'ag-rows' }, fichas))].filter(Boolean)),
    h('div', { class: 'ag-grid' }, painel('Notas', estrelas), painel('Por mês (quantidade · nota média)', mensal)));
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
  const caixa = $('abaFila');
  if (!itens.length) { caixa.replaceChildren(h('p', { class: 'list-empty' }, 'Nenhuma avaliação neste filtro.')); return; }
  const ordenadas = [...itens].sort(porPrioridade), mostrar = ordenadas.slice(0, state.visiveis);
  caixa.replaceChildren(...mostrar.map(cartao),
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
  lapis: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  lixeira: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  seta: '<path d="m6 9 6 6 6-6"/>',
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

// Menu flutuante (DESIGN §1): position fixed, fecha com Esc, clique fora, rolagem e redimensionamento.
function menuMaisAcoes(botao) {
  if (state.menu) { state.menu(); return; }
  const itens = [state.podeEditar && ['Adicionar vendedor', ICONES.mais, modalAdicionar], state.podeEditar && ['Importar planilha', ICONES.subir, modalImportar], ['Exportar lista', ICONES.baixar, exportarLista]].filter(Boolean);
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
    desenharMapa({ pings, selecionada: state.lojaSel, aoEscolher: escolher }),
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

async function atualizar() {
  const minha = ++state.seq;
  if (mesesFaltando().length) { $('agStatus').hidden = false; $('agStatus').textContent = 'Carregando as avaliações…'; $('agConteudo').hidden = true; }
  try { await carregarMeses(); } catch (e) {
    if (minha !== state.seq) return;
    aviso('Não foi possível ler as avaliações agora. Troque o filtro para tentar de novo.', true);
    $('agConteudo').hidden = false; $('abaGeral').replaceChildren(); $('abaFila').replaceChildren(); // os filtros continuam à mão
    return;
  }
  if (minha !== state.seq) return;
  $('agStatus').hidden = true; $('agConteudo').hidden = false;
  state.visiveis = PAGINA;
  const base = filtradas(), itens = state.lojaMapa ? base.filter(i => lojaDaFicha(i.ficha) === state.lojaMapa) : base;
  renderGeral(itens, base); renderFila(base); // o clique no mapa filtra só a Visão geral
}

function trocarAba(aba) {
  document.querySelectorAll('#agTabs button').forEach(b => { const ativa = b.dataset.aba === aba; b.classList.toggle('active', ativa); b.setAttribute('aria-selected', ativa); });
  $('abaGeral').hidden = aba !== 'geral'; $('abaFila').hidden = aba !== 'fila'; $('abaVendedores').hidden = aba !== 'vendedores';
  $('agFiltros').hidden = aba === 'vendedores';
}

function preencherFiltros() {
  const ufs = [...new Set([...state.fichas.values()].map(f => f.uf || '-'))].sort();
  $('fUf').append(...ufs.map(u => h('option', { value: u }, u === '-' ? 'Sem UF' : u)));
  $('fFicha').append(...[...state.fichas.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')).map(f => h('option', { value: f.id }, f.title)));
}

async function iniciar() {
  try { state.resumo = await window.PortalFirebase.readAvaliacoesGoogle('resumo'); } catch (e) { aviso('Você não tem acesso às avaliações ou a conexão falhou.', true); return; }
  if (!state.resumo) { aviso('Aguardando coleta. As avaliações das fichas aparecem aqui assim que a primeira coleta for feita.'); return; }
  state.resumo.fichas.forEach(f => state.fichas.set(f.id, f));
  preencherFiltros();
  try {
    const admin = ((await window.PortalFirebase.currentContext()).profile || {}).role === 'admin';
    await carregarVendedores();
    state.podeEditar = admin;
  } catch (e) { state.mensagem = 'Não foi possível ler o cadastro de vendedores; a edição fica bloqueada. Recarregue a página.'; }
  renderVendedores();
  $('agNota').textContent = `Atualizado em ${new Date(state.resumo.updatedAt).toLocaleString('pt-BR')}. A prioridade segue regras fixas (nota, palavras de alerta e tempo sem resposta), sem IA: confira antes de agir.`;
  $('agFiltros').addEventListener('change', atualizar);
  $('agTabs').addEventListener('click', e => { const b = e.target.closest('button[data-aba]'); if (b) trocarAba(b.dataset.aba); });
  atualizar();
}

// auth-guard.js é módulo adiado: window.PortalFirebase só existe depois dele.
if (window.PortalFirebase) iniciar(); else window.addEventListener('portal-firebase-ready', iniciar, { once: true });
