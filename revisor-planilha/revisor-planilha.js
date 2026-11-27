/**
 * Revisor de Planilha (revisor-planilha.html), marca VONDER, seção Diagramação.
 * Fluxo: sobe o .xlsx (lido num Worker) -> escolhe as colunas de valor antigo e novo -> cada linha ganha a "Diferença"
 * (trecho que saiu e o que entrou, por palavra) -> linhas com a mesma diferença ficam num grupo só -> exporta .xlsx com a coluna nova.
 * Tudo roda no navegador: a planilha não é enviada a nenhum servidor.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SRC = document.currentScript && document.currentScript.src;
  const ROW_H = 56;

  // ---- diferença entre dois valores (pura, testada em revisor-planilha.test.html, nesta pasta) ----
  const tok = s => String(s).split(/(\s+)/).filter(Boolean);
  function diff(a, b) {
    const ta = tok(a), tb = tok(b);
    let pre = 0; while (pre < ta.length && pre < tb.length && ta[pre] === tb[pre]) pre++;
    let suf = 0; while (suf < ta.length - pre && suf < tb.length - pre && ta[ta.length - 1 - suf] === tb[tb.length - 1 - suf]) suf++;
    const rem = ta.slice(pre, ta.length - suf).join('').trim(), add = tb.slice(pre, tb.length - suf).join('').trim();
    // kind: igual | espaco | caixa (só maiúscula/minúscula) | acento | troca | add | rem
    let kind = 'troca', key;
    if (a === b) { kind = 'igual'; key = ''; }
    else if (rem.replace(/\s+/g, ' ') === add.replace(/\s+/g, ' ')) { kind = 'espaco'; key = 'Mudou só os espaços'; }
    else if (rem && add && rem.toLowerCase() === add.toLowerCase()) { kind = 'caixa'; key = 'Mudou só maiúscula/minúscula'; }
    else if (rem && add && norm(rem) === norm(add) && rem.toLowerCase() !== add.toLowerCase()) { kind = 'acento'; key = 'Mudou só a acentuação'; }
    else if (!rem) { kind = 'add'; key = `Acrescentou "${add}"`; }
    else if (!add) { kind = 'rem'; key = `Tirou "${rem}"`; }
    else key = `Trocou "${rem}" por "${add}"`;
    return { ta, tb, pre, suf, rem, add, kind, key };
  }
  // célula numérica já vem como número; só o texto no formato brasileiro perde o ponto de milhar
  const num = s => { if (typeof s === 'number') return s; let t = String(s).trim(); if (t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(t) ? +t : NaN; };
  // texto da coluna "Diferença" exportada: a chave do grupo e, quando os dois valores são números, quanto subiu ou caiu
  function diffText(a, b) {
    const d = diff(String(a), String(b)); if (!d.key) return 'Sem mudança';
    const x = num(a), y = num(b);
    return Number.isFinite(x) && Number.isFinite(y) ? d.key + ' (' + (y > x ? 'subiu ' : 'caiu ') + String(+Math.abs(y - x).toFixed(6)).replace('.', ',') + ')' : d.key;
  }
  window.RevisorPlanilha = { diff, diffText };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const colName = i => { let n = '', k = i; do { n = String.fromCharCode(65 + k % 26) + n; k = Math.floor(k / 26) - 1; } while (k >= 0); return n; };
  // grifa só o trecho que mudou (tokens de pre até length-suf)
  function mark(t, pre, suf, cls) {
    const end = t.length - suf;
    return esc(t.slice(0, pre).join('')) + (end > pre ? `<mark class="${cls}">${esc(t.slice(pre, end).join(''))}</mark>` : '') + esc(t.slice(end).join(''));
  }

  if (!$('rpDrop')) return; // carregado pelo teste, sem a página
  let header = [], rows = [], fileName = '', sel = { id: 0, prod: -1, ctx: -1, old: -1, nw: -1 };
  let inc = 0, keys = [], groups = [], open = new Set(), flat = [];
  const worker = new Worker(new URL('revisor-planilha-worker.js', SRC));
  const say = (t, err) => { $('rpError').hidden = !err; if (err) $('rpStatus').textContent = ''; (err ? $('rpError') : $('rpStatus')).textContent = t; };
  // libera a tela depois de ler ou gravar; limpar o campo permite escolher o mesmo arquivo de novo
  const idle = () => { $('rpDrop').classList.remove('is-loading'); $('rpFile').value = ''; $('rpExport').disabled = false; $('rpExport').textContent = 'Exportar .xlsx'; };
  const fail = msg => { idle(); say('Não foi possível processar a planilha: ' + msg, true); };
  const nf = n => n.toLocaleString('pt-BR');

  function loadFile(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) return say('Envie um arquivo .xlsx.', true);
    fileName = file.name; $('rpError').hidden = true;
    $('rpDrop').classList.add('is-loading'); say('Lendo a planilha. Arquivos grandes levam cerca de um minuto, não feche a página.');
    file.arrayBuffer().then(buffer => worker.postMessage({ op: 'read', buffer }, [buffer])).catch(e => fail(e.message));
  }
  worker.onerror = e => fail(e.message || 'o leitor de planilhas parou. Recarregue a página');
  worker.onmessage = ev => {
    const m = ev.data; idle();
    if (m.error) return fail(m.error);
    if (m.op === 'read') {
      header = m.header.map((h, i) => String(h).trim() || 'Coluna ' + colName(i)); rows = m.rows;
      if (!rows.length) return say('A planilha não tem linhas de dados.', true);
      const find = re => header.findIndex(h => re.test(norm(h)));
      sel = { id: Math.max(0, find(/codigo|sku|^id$/)), prod: find(/descri|produto/), ctx: find(/atributo/), old: find(/antigo/), nw: find(/novo/) };
      if (sel.nw === sel.old) sel.nw = -1;
      ['rpId', 'rpProd', 'rpCtx', 'rpOld', 'rpNew'].forEach((id, n) => {
        $(id).innerHTML = (n === 1 || n === 2 ? '<option value="-1">Nenhuma</option>' : n > 2 ? '<option value="-1" disabled>Escolha</option>' : '') + header.map((h, i) => `<option value="${i}">${esc(colName(i) + ' · ' + h)}</option>`).join('');
        $(id).value = [sel.id, sel.prod, sel.ctx, sel.old, sel.nw][n];
      });
      $('rpWork').hidden = false; $('rpDrop').querySelector('strong').textContent = fileName;
      say(nf(rows.length) + ' linhas lidas.'); fillAttrs(); recompute();
    } else if (m.op === 'write') {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([m.out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = fileName.replace(/\.xlsx$/i, '') + '_diferencas.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      say('Planilha exportada.');
    }
  };

  // "Ver só o atributo": lista os valores da coluna de atributos (ex.: Nome, Cor) com a quantidade de linhas de cada um
  function fillAttrs() {
    const keep = $('rpAttr').value, cnt = new Map();
    if (sel.ctx >= 0) for (let i = 0; i < rows.length; i++) { const v = cell(i, sel.ctx); cnt.set(v, (cnt.get(v) || 0) + 1); }
    $('rpAttr').innerHTML = '<option value="">Todos' + (cnt.size ? ' (' + nf(rows.length) + ')' : '') + '</option>' + [...cnt].sort((a, b) => b[1] - a[1]).map(([v, n]) => `<option value="${esc(v)}">${esc(v || '(vazio)')} (${nf(n)})</option>`).join('');
    $('rpAttr').disabled = !cnt.size; if (cnt.has(keep)) $('rpAttr').value = keep;
  }
  const cell = (r, c) => c < 0 ? '' : String(rows[r][c] ?? '');
  // calcula a diferença de cada linha e monta os grupos (chave = a diferença, mais o contexto se marcado)
  function recompute() {
    if (sel.old < 0 || sel.nw < 0) { groups = []; flat = []; $('rpStats').textContent = 'Escolha as colunas de valor antigo e novo.'; return draw(); }
    const split = $('rpSplit').checked, only = $('rpAttr').value, map = new Map(); inc = 0;
    keys = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      if (only && sel.ctx >= 0 && cell(i, sel.ctx) !== only) continue;
      inc++;
      const d = diff(cell(i, sel.old), cell(i, sel.nw)), k = d.key || 'Sem mudança';
      keys[i] = k;
      const gk = split && sel.ctx >= 0 ? k + '\u0000' + cell(i, sel.ctx) : k;
      let g = map.get(gk); if (!g) map.set(gk, g = { key: k, d, ctx: split && sel.ctx >= 0 ? cell(i, sel.ctx) : '', idx: [] });
      g.idx.push(i);
    }
    groups = [...map.values()].sort((a, b) => b.idx.length - a.idx.length || a.key.localeCompare(b.key));
    open = new Set(); buildFlat();
  }
  function buildFlat() {
    const q = norm($('rpSearch').value.trim());
    flat = []; let rowsShown = 0, gShown = 0;
    groups.forEach((g, gi) => {
      if (q && !norm(g.key + ' ' + g.ctx).includes(q)) return;
      gShown++; rowsShown += g.idx.length; flat.push(gi);
      if (open.has(gi)) g.idx.forEach(r => flat.push(~r)); // linha = ~índice (negativo); grupo = índice >= 0
    });
    const changed = groups.reduce((n, g) => n + (g.key === 'Sem mudança' ? 0 : g.idx.length), 0);
    $('rpStats').textContent = `${nf(inc)} linhas${inc < rows.length ? ' do atributo escolhido' : ''}: ${nf(changed)} mudaram e ${nf(inc - changed)} ficaram iguais. As que mudaram se repartem em ${nf(new Set(groups.filter(g => g.key !== 'Sem mudança').map(g => g.key)).size)} tipos de mudança. Na lista: ${nf(gShown)} grupos, ${nf(rowsShown)} linhas.`;
    draw();
  }

  // frase do grupo em português claro: verbo em negrito, o que saiu em vermelho, o que entrou em verde
  const chip = (t, c) => `<mark class="${c}">${esc(t)}</mark>`;
  const say2 = d => ({ troca: `<b>Trocou</b> ${chip(d.rem, 'rp-del')} <b>por</b> ${chip(d.add, 'rp-ins')}`, add: `<b>Acrescentou</b> ${chip(d.add, 'rp-ins')}`, rem: `<b>Tirou</b> ${chip(d.rem, 'rp-del')}` }[d.kind] || `<b>${esc(d.key || 'Sem mudança')}</b>`);

  // ---- lista virtualizada: só as linhas visíveis existem no DOM ----
  const box = $('rpList'), spacer = $('rpSpacer'), win = $('rpWin');
  function draw() {
    box.hidden = !flat.length; $('rpEmpty').hidden = !!flat.length || !rows.length;
    spacer.style.height = flat.length * ROW_H + 'px';
    const first = Math.max(0, Math.floor(box.scrollTop / ROW_H) - 6), last = Math.min(flat.length, Math.ceil((box.scrollTop + box.clientHeight) / ROW_H) + 6);
    win.style.transform = `translateY(${first * ROW_H}px)`;
    let h = '';
    for (let n = first; n < last; n++) {
      const v = flat[n];
      if (v >= 0) {
        const g = groups[v], o = open.has(v);
        h += `<div class="rp-group" role="button" tabindex="0" aria-expanded="${o}" data-g="${v}"><svg class="rp-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span class="rp-key" title="${esc(g.key)}">${say2(g.d)}</span>${g.ctx ? `<span class="rp-ctx">${esc(g.ctx)}</span>` : ''}<span class="rp-count">${nf(g.idx.length)}</span></div>`;
      } else {
        const r = ~v, d = diff(cell(r, sel.old), cell(r, sel.nw));
        const t = c => `<span title="${esc(cell(r, c))}">${esc(cell(r, c))}</span>`;
        h += `<div class="rp-row">${t(sel.id)}${t(sel.prod)}<span class="rp-old" title="${esc(cell(r, sel.old))}">${mark(d.ta, d.pre, d.suf, 'rp-del')}</span><span class="rp-new" title="${esc(cell(r, sel.nw))}">${mark(d.tb, d.pre, d.suf, 'rp-ins')}</span><span class="rp-dif">${say2(d)}</span></div>`;
      }
    }
    win.innerHTML = h;
  }
  let raf = 0; box.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
  const toggle = el => { const g = el && el.closest('[data-g]'); if (!g) return; const i = +g.dataset.g; open.has(i) ? open.delete(i) : open.add(i); buildFlat(); };
  box.addEventListener('click', e => toggle(e.target));
  box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e.target); } });

  // ---- controles ----
  $('rpFile').addEventListener('change', e => loadFile(e.target.files[0]));
  ['dragover', 'dragenter'].forEach(t => $('rpDrop').addEventListener(t, e => { e.preventDefault(); $('rpDrop').classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => $('rpDrop').addEventListener(t, e => { e.preventDefault(); $('rpDrop').classList.remove('is-over'); if (t === 'drop') loadFile(e.dataTransfer.files[0]); }));
  [['rpId', 'id'], ['rpProd', 'prod'], ['rpCtx', 'ctx'], ['rpOld', 'old'], ['rpNew', 'nw']].forEach(([id, k]) => $(id).addEventListener('change', e => { sel[k] = +e.target.value; if (k === 'ctx') fillAttrs(); recompute(); }));
  $('rpAttr').addEventListener('change', recompute);
  $('rpSplit').addEventListener('change', recompute);
  $('rpSearch').addEventListener('input', () => { box.scrollTop = 0; buildFlat(); });
  $('rpOpenAll').addEventListener('click', () => { open = new Set(groups.map((_, i) => i)); buildFlat(); });
  $('rpCloseAll').addEventListener('click', () => { open = new Set(); buildFlat(); });
  window.addEventListener('resize', draw);

  // exporta as linhas dos grupos que passam na busca, na ordem dos grupos, com a coluna "Diferença" no fim
  $('rpExport').addEventListener('click', () => {
    if (!groups.length) return;
    const q = norm($('rpSearch').value.trim()), aoa = [header.concat('Diferença')];
    groups.forEach(g => { if (!q || norm(g.key + ' ' + g.ctx).includes(q)) g.idx.forEach(r => aoa.push(rows[r].concat(diffText(rows[r][sel.old] ?? '', rows[r][sel.nw] ?? '')))); });
    $('rpExport').disabled = true; $('rpExport').textContent = 'Gerando…'; say('Gerando o .xlsx. Pode levar cerca de um minuto.');
    worker.postMessage({ op: 'write', aoa });
  });
})();
