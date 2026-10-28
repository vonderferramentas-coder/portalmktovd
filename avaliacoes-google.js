import { classificar, porPrioridade, HORAS_ATRASO } from './avaliacoes-google-regras.js';
import { lerColado, adicionar, apelidosDoTexto, nomesAmbiguos, ordenar } from './avaliacoes-google-vendedores.js';

const $ = id => document.getElementById(id);
const PAGINA = 20;
const NIVEIS = { critica: 'Crítica', atencao: 'Atenção', elogio: 'Elogio' };
const state = { resumo: null, fichas: new Map(), blocos: {}, visiveis: PAGINA, vendedores: [], rev: 0, fila: Promise.resolve(), geracao: 0, formulario: null, podeEditar: false, mensagem: '', lendo: {}, seq: 0 };

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

function renderGeral(itens) {
  const recs = itens.map(i => i.rec);
  if (!recs.length) { $('abaGeral').replaceChildren(h('p', { class: 'list-empty' }, 'Nenhuma avaliação neste filtro.')); return; }
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

  $('abaGeral').replaceChildren(tiles, h('div', { class: 'ag-grid' },
    painel('Notas', estrelas), painel('Por mês (quantidade · nota média)', mensal), painel('Por ficha', h('ul', { class: 'ag-rows' }, fichas))));
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
// "redesenhar: false" (apelidos) só troca a mensagem: redesenhar no blur engoliria o clique seguinte do usuário.
const resumoVendedores = mensagem => `${state.vendedores.filter(v => v.ativo).length} ativos de ${state.vendedores.length} vendedores. ` + (mensagem || 'O primeiro nome já conta nas citações; use apelidos para o que o cliente costuma escrever (ex.: Lisboa).');

function salvarVendedores(lista, mensagem, redesenhar = true) {
  state.vendedores = lista; state.mensagem = mensagem;
  if (redesenhar) renderVendedores(); else $('agVendMsg').textContent = resumoVendedores(mensagem);
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

const alterar = (id, mudanca, mensagem, redesenhar) => salvarVendedores(state.vendedores.map(v => v.id === id ? { ...v, ...mudanca } : v), mensagem, redesenhar);

function formularioVendedor() {
  const campo = (rotulo, no) => h('label', {}, rotulo, no);
  const loja = h('input', { list: 'agLojas', required: '', placeholder: 'Ex.: Curitiba' });
  const nome = h('input', { required: '', placeholder: 'Nome completo' });
  const apelidos = h('input', { placeholder: 'Ex.: Lisboa, Samuel' });
  const colado = h('textarea', { rows: '5', placeholder: 'Cole aqui as duas colunas da planilha (Loja e Vendedor), uma pessoa por linha.' });
  const adicionarUm = e => {
    e.preventDefault();
    const r = adicionar(state.vendedores, [{ loja: loja.value, nome: nome.value, apelidos: apelidosDoTexto(apelidos.value) }]);
    if (r.adicionados) e.target.reset();
    salvarVendedores(r.lista, r.adicionados ? 'Vendedor adicionado.' : 'Esse vendedor já está no cadastro dessa loja.');
  };
  const importar = () => {
    const r = adicionar(state.vendedores, lerColado(colado.value));
    colado.value = '';
    salvarVendedores(r.lista, `${r.adicionados} adicionado(s); ${r.repetidos} já estavam no cadastro.`);
  };
  return h('div', { class: 'card ag-panel' }, h('h2', {}, 'Adicionar vendedor'),
    h('form', { class: 'ag-form', onsubmit: adicionarUm }, campo('Loja', loja), campo('Nome', nome), campo('Apelidos', apelidos), h('button', { type: 'submit', class: 'btn' }, 'Adicionar')),
    h('datalist', { id: 'agLojas' }),
    h('details', { class: 'ag-colar' }, h('summary', {}, 'Colar vários de uma planilha'), colado, h('button', { type: 'button', class: 'btn ghost', onclick: importar }, 'Importar')));
}

function linhaVendedor(v, ambiguos) {
  const apelidos = h('input', { 'aria-label': `Apelidos de ${v.nome}`, placeholder: 'Apelidos, separados por vírgula (ex.: Lisboa)', value: v.apelidos.join(', ') });
  apelidos.addEventListener('change', () => alterar(v.id, { apelidos: apelidosDoTexto(apelidos.value) }, 'Apelidos salvos.', false));
  const ativo = h('input', { type: 'checkbox', ...(v.ativo ? { checked: '' } : {}) });
  ativo.addEventListener('change', () => alterar(v.id, { ativo: ativo.checked }, ativo.checked ? 'Vendedor reativado.' : 'Vendedor desativado: sai das contagens novas, mas continua no cadastro.'));
  let armado = false;
  const remover = e => {
    const botao = e.currentTarget;
    if (armado) { salvarVendedores(state.vendedores.filter(x => x.id !== v.id), 'Vendedor removido.'); return; }
    armado = true; botao.textContent = 'Confirmar remoção'; botao.classList.add('danger');
    setTimeout(() => { armado = false; botao.textContent = 'Remover'; botao.classList.remove('danger'); }, 4000);
  };
  return h('li', { class: 'ag-vend' + (v.ativo ? '' : ' is-off') },
    h('div', { class: 'ag-vend-nome' }, h('strong', {}, v.nome), !v.ativo && h('span', { class: 'ag-meta' }, 'Inativo'),
      ambiguos.has(v.id) && h('span', { class: 'ag-chip is-atencao' }, 'Primeiro nome repetido na loja: use apelidos')),
    state.podeEditar ? apelidos : h('span', { class: 'ag-meta' }, v.apelidos.join(', ') || 'Sem apelidos'),
    state.podeEditar && h('label', { class: 'ag-check' }, ativo, 'Ativo'),
    state.podeEditar && h('button', { type: 'button', class: 'btn ghost small', onclick: remover }, 'Remover'));
}

function renderVendedores() {
  const ambiguos = nomesAmbiguos(state.vendedores), porLoja = {};
  ordenar(state.vendedores).forEach(v => (porLoja[v.loja] ||= []).push(v));
  const formulario = state.podeEditar && (state.formulario ||= formularioVendedor());
  formulario && formulario.querySelector('datalist').replaceChildren(...[...new Set(state.vendedores.map(v => v.loja))].sort().map(l => h('option', { value: l })));
  $('abaVendedores').replaceChildren(...[
    h('p', { class: 'ag-note', role: 'status', id: 'agVendMsg' }, resumoVendedores(state.mensagem)),
    formulario,
    !state.vendedores.length && h('p', { class: 'list-empty' }, 'Nenhum vendedor cadastrado ainda.'),
    ...Object.entries(porLoja).map(([loja, lista]) => h('div', { class: 'card ag-panel' }, h('h2', {}, `${loja} (${lista.filter(v => v.ativo).length} ativos)`), h('ul', { class: 'ag-vendlist' }, lista.map(v => linhaVendedor(v, ambiguos)))))].filter(Boolean));
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
  const itens = filtradas();
  renderGeral(itens); renderFila(itens);
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
