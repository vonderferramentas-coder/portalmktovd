/**
 * Gerador de Molduras (molduras-generator.html), tela só do Admin.
 * Fluxo: molduras PNG (retrato e paisagem, salvas no Firebase) + planilha dos filhos + ZIP de desenhos (nome do arquivo = matrícula)
 * -> cada desenho entra no miolo transparente da moldura certa, com o texto "Nome, idade, filho(a) de Colaborador" num canto.
 * Planilha e desenhos têm dados de crianças (LGPD): são lidos só no navegador e nunca enviados a servidor.
 * Única exceção, autorizada pelo Grupo OVD: os "conjuntos salvos" (planilha, ZIP e decisões da etapa 3) ficam no Firestore (`molduras/lote_*`, `work_*`, `lotes`), só para admin.
 * Só as molduras e a configuração do texto ficam no Firebase (coleção molduras, ver firestore.rules).
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SCRIPT_SRC = document.currentScript && document.currentScript.src;
  const KINDS = ['paisagem', 'retrato'];
  // Modelo da diretoria: Montserrat no topo, recuado à direita do selo; nome e idade em negrito amarelo, o resto branco.
  // Cada moldura tem posições de texto: 4 cantos, 1 central e quantas "locais" extras a pessoa criar. Cada posição guarda
  // x e y (ponto de ancoragem, % da moldura; y = centro do bloco), alinhamento e tamanho. Fonte, cores e encaixe valem para a
  // moldura toda. `def` é a posição padrão (a que vale ao abrir a tela); `slot` é a em uso agora e não é salva.
  const SLOT_KEYS = ['tl', 'tr', 'bl', 'br', 'c'];
  const SLOT_NAMES = { tl: 'Superior esquerdo', tr: 'Superior direito', bl: 'Inferior esquerdo', br: 'Inferior direito', c: 'Personalizado' };
  const BASE_STYLE = { font: 'Montserrat', color: '#ffffff', accent: '#fdb913', tag: '#07483c', fit: 'contain' };
  // posições iniciais tiradas das artes de referência (a tag fica no canto inferior, sobre o desenho)
  const defaultSlots = kind => kind === 'retrato' ? ({
    tl: { x: 37.3, y: 4.5, align: 'left', size: 2.4 }, tr: { x: 96, y: 4.5, align: 'right', size: 2.4 },
    bl: { x: 8, y: 90.5, align: 'left', size: 2.4 }, br: { x: 92, y: 90.5, align: 'right', size: 2.4 }, c: { x: 50, y: 50, align: 'center', size: 2.4 } }) : ({
    tl: { x: 19.7, y: 8.5, align: 'left', size: 2.4 }, tr: { x: 96, y: 8.5, align: 'right', size: 2.4 },
    bl: { x: 11.9, y: 78.6, align: 'left', size: 2.4 }, br: { x: 89.1, y: 78.6, align: 'right', size: 2.4 }, c: { x: 50, y: 50, align: 'center', size: 2.4 } });
  const defaultCfg = kind => ({ ...BASE_STYLE, def: 'bl', slot: 'bl', slots: defaultSlots(kind) });
  const extraKeys = c => Object.keys(c.slots).filter(k => !SLOT_KEYS.includes(k));
  const slotName = (c, k) => SLOT_NAMES[k] || (c.slots[k] && c.slots[k].name) || k;
  // aceita o formato antigo (x, y, align, size soltos) e completa o que faltar
  function mergeCfg(kind, sv) {
    const d = defaultCfg(kind); if (!sv) return d;
    const slots = { ...d.slots };
    if (sv.slots) Object.keys(sv.slots).forEach(k => { slots[k] = { ...(d.slots[k] || { x: 50, y: 50, align: 'center', size: 2.2 }), ...sv.slots[k] }; });
    else if (sv.x != null) slots.tl = { x: sv.x, y: sv.y, align: sv.align || 'left', size: sv.size || 2.2 };
    const def = slots[sv.def] ? sv.def : 'bl';
    return { font: sv.font || d.font, color: sv.color || d.color, accent: sv.accent || d.accent, tag: sv.tag || d.tag, fit: sv.fit || d.fit, def, slot: def, slots };
  }
  let draft = null; // ajustes em edição no menu Configurar: { kind, slot, vals, isNew, makeDefault }; só valem na prévia até Salvar
  const DEFAULT_VIEW = { z: 1, x: 0, y: 0, r: 0 }; // r = giros de 90° no sentido horário (0 a 3)
  const SAMPLE = { nome: 'Ana', idade: '7 anos', colab: 'Maria da Silva' };
  const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i, PDF_EXT = /\.pdf$/i;
  const state = {
    frames: { retrato: null, paisagem: null },
    cfg: { retrato: defaultCfg('retrato'), paisagem: defaultCfg('paisagem') },
    kind: 'paisagem',
    formats: 'ambos',   // formatos em uso: 'paisagem' | 'retrato' | 'ambos'
    index: null,        // Map matrícula -> filhos [{ colab, nome, nasc }]
    sheetInfo: '',
    filter: 'all',      // lista de desenhos: 'all' | 'pending' | 'review'
    items: [],          // desenhos do ZIP: { id, file, key, key0, entry, choice, skip, over, view }; over = texto editado à mão, view = zoom/posição/giro
    work: {},           // decisões do conjunto aberto, por nome de arquivo: { k, c (nome do filho), o, v, s }
    cfgOk: false,
    loteId: null,       // conjunto salvo aberto (as decisões só são gravadas quando há um)
    files: { sheet: null, zip: null }, // arquivos carregados, para salvar o conjunto
    lotes: { rev: 0, itens: [] }
  };

  // ---------- utilitários ----------
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const titleCase = s => String(s).trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i && PARTICLES.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  // "FG90104" e "90104" são a mesma matrícula
  const keyOf = v => { const t = String(v == null ? '' : v).trim().replace(/\.0+$/, '').toUpperCase().replace(/^FG[\s_-]*(?=\d)/, ''); return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t; };
  // revisor de acentos: só aponta (nunca corrige sozinho) nomes que provavelmente perderam o acento, ex.: Joao -> João.
  // ponytail: lista local de nomes e sobrenomes comuns + regras de terminação (-ao, -oes, -aes); sem dicionário completo nem IA.
  // Nome escrito certo sem acento (Mario, Marcio) também é apontado: a tag é só um aviso, não trava nada. Evolução: lista de "manter assim" por desenho.
  const ACENTUADOS = ('João José Antônio Antônia Jéssica Letícia Patrícia Fabrícia Fabrício Júlia Júlio Lúcia Lúcio Márcia Márcio Mário Sílvia Sílvio Cláudia Cláudio Cíntia Cássia Cássio Valéria Valério Vitória Vinícius Rogério Sérgio André Andréia Andréa Amélia Ângela Ângelo Bárbara Bráulio Cecília Célia Célio César Cléber Dâmaris Débora Denílson Érica Érika Fábio Fátima Fernão Flávia Flávio Gílson Geórgia Hélio Hélder Heloísa Inês Ítalo Jacó Jônatas Josué Juçara Kátia Lázaro Léa Lêda Leônidas Lídia Lívia Luíza Luís Maurício Mônica Nádia Nélson Noêmia Pâmela Pérola Raíssa Rúbia Rúbens Simão Tâmara Teófilo Tomé Vânia Verônica Zélia Gonçalves Conceição Araújo Assunção Ávila Benício Brandão Cândido Estêvão Guimarães Magalhães Mendonça Moisés Nóbrega Paixão Simões Sebastião Salomão Esteves Ferrão Leão Mourão Alcântara Amâncio Aníbal Atílio Cézar Fidélis Galvão Lourenço Marçal Sá').split(' ');
  const ACENTO_MAP = new Map(ACENTUADOS.map(n => [norm(n), n]));
  const SEM_ACENTO = new Set(['moraes', 'praes', 'baraes', 'chaves']); // sobrenomes que terminam em -aes/-oes mas se escrevem assim
  const ACENTO_FIM = { ao: 'ão', oes: 'ões', aes: 'ães' };
  const acentoDe = w => { // devolve a palavra com acento, ou null se não há suspeita
    const n = norm(w); if (n !== w.toLowerCase()) return null; // já tem acento ou ç: a pessoa já cuidou
    let s = ACENTO_MAP.get(n);
    if (!s && n.length >= 5 && !SEM_ACENTO.has(n)) { const m = n.match(/(ao|oes|aes)$/); if (m) s = n.slice(0, -m[1].length) + ACENTO_FIM[m[1]]; }
    if (!s) return null;
    s = s.toLowerCase();
    return w === w.toUpperCase() && w.length > 1 ? s.toUpperCase() : w[0] === w[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s;
  };
  const acentosEm = text => { const seen = new Set(); return String(text).split(/\s+/).filter(Boolean).map(w => ({ de: w, para: acentoDe(w) })).filter(a => a.para && !seen.has(a.de) && seen.add(a.de)); };
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fb = () => import('../firebase-client.js');
  const fbw = () => window.__mgWork ? Promise.resolve(window.__mgWork) : fb(); // window.__mgWork: gancho dos testes (sem Firebase)
  const readDataUrl = file => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fail(r.error); r.readAsDataURL(file); });
  const loadImage = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Imagem inválida')); i.src = src; });

  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
    if (typeof v === 'number') { const p = XLSX.SSF.parse_date_code(v); return p ? { y: p.y, m: p.m, d: p.d } : null; }
    const s = String(v || '').trim();
    let m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += y > 30 ? 1900 : 2000; return { y, m: +m[2], d: +m[1] }; }
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  // Anos completos até hoje; bebê com menos de 1 ano aparece em meses
  function ageText(b) {
    if (!b) return '';
    const t = new Date();
    let months = (t.getFullYear() - b.y) * 12 + (t.getMonth() + 1 - b.m);
    if (t.getDate() < b.d) months--;
    if (months < 0) return '';
    if (months < 1) return 'menos de 1 mês';
    if (months < 12) return months === 1 ? '1 mês' : months + ' meses';
    const y = Math.floor(months / 12);
    return y === 1 ? '1 ano' : y + ' anos';
  }
  const recOf = kid => ({ nome: titleCase(kid.nome).split(' ')[0], idade: ageText(kid.nasc), colab: titleCase(kid.colab) });

  // ---------- moldura: miolo transparente ----------
  // Procura a maior região transparente ligada ao centro (a partir do ponto transparente mais próximo dele).
  function findHole(img) {
    const W = img.naturalWidth, H = img.naturalHeight, s = Math.min(1, 400 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
    const a = cx.getImageData(0, 0, w, h).data, clear = new Uint8Array(w * h);
    let seed = -1, best = Infinity;
    for (let i = 0; i < w * h; i++) {
      if (a[i * 4 + 3] < 24) {
        clear[i] = 1;
        const d = Math.hypot((i % w) - w / 2, Math.floor(i / w) - h / 2);
        if (d < best) { best = d; seed = i; }
      }
    }
    if (seed < 0) return { x: 0, y: 0, w: W, h: H };
    const seen = new Uint8Array(w * h), stack = [seed]; seen[seed] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && clear[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && clear[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && clear[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && clear[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    return { x: Math.floor(x0 / s), y: Math.floor(y0 / s), w: Math.ceil((x1 - x0 + 1) / s), h: Math.ceil((y1 - y0 + 1) / s) };
  }

  // ---------- desenho da peça ----------
  // Enfeite de Natal da ponta esquerda da tag (molduras/assets/bolas.png); a prévia se redesenha quando ele termina de carregar
  let bolas = null;
  const bolasReady = loadImage(new URL('assets/bolas.png', SCRIPT_SRC || location.href).href).then(img => { bolas = img; renderPreview(); }).catch(() => {});

  function drawSegments(ctx, segs, px, font, x, y, align) {
    const w = s => { ctx.font = (s.b ? 700 : 400) + ' ' + px + 'px "' + font + '", sans-serif'; return ctx.measureText(s.t).width; };
    const total = segs.reduce((n, s) => n + w(s), 0);
    let cur = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    segs.forEach(s => { ctx.fillStyle = s.c || ctx.fillStyle; ctx.font = (s.b ? 700 : 400) + ' ' + px + 'px "' + font + '", sans-serif'; ctx.fillText(s.t, cur, y); cur += ctx.measureText(s.t).width; });
  }
  function measure(ctx, segs, px, font) {
    return segs.reduce((n, s) => { ctx.font = (s.b ? 700 : 400) + ' ' + px + 'px "' + font + '", sans-serif'; return n + ctx.measureText(s.t).width; }, 0);
  }
  // Tag verde de cantos arredondados que se ajusta ao texto: "NOME, idade" em negrito (cor de destaque) e "Filho(a) de COLABORADOR"
  // na linha de baixo, com o enfeite das bolas na ponta esquerda. As proporções vêm da arte de referência e são múltiplos do tamanho da letra.
  function drawText(ctx, W, H, cfg, rec) {
    const base = Math.min(W, H), ax = cfg.x / 100 * W, side = 0.03 * W, al = cfg.align;
    const nome = String(rec.nome).toLocaleUpperCase('pt-BR'), colab = String(rec.colab).toLocaleUpperCase('pt-BR');
    const head = [{ t: nome + (rec.idade ? ', ' + rec.idade : ''), b: 1, c: cfg.accent }], tail = [{ t: 'Filho(a) de ' + colab, c: cfg.color }];
    const OV = 0.65, TX = 2.7, PR = 1.4, PY = 0.5, LH = 1.1, RAD = 0.8, ORN = 3.9;
    const tagW = p => TX * p + Math.max(measure(ctx, head, p, cfg.font), measure(ctx, tail, p, cfg.font)) + PR * p;
    const maxW = al === 'right' ? ax - side : al === 'center' ? 2 * Math.min(ax, W - ax) - 2 * side : W - ax - side;
    let px = cfg.size / 100 * base;
    while (px > 8 && tagW(px) > maxW) px *= 0.95;
    const w = tagW(px), h = (2 * LH + 2 * PY) * px, orH = ORN * px, below = Math.max(0, orH - h);
    let x0 = al === 'right' ? ax - w : al === 'center' ? ax - w / 2 : ax;
    x0 = Math.min(Math.max(x0, OV * px), W - w);
    const yc = Math.min(Math.max(cfg.y / 100 * H, h / 2), H - h / 2 - below), y0 = yc - h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 0.8 * px; ctx.shadowOffsetY = 0.2 * px;
    ctx.fillStyle = cfg.tag; ctx.beginPath();
    const r = RAD * px; ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    const tx = x0 + TX * px, mid = y0 + PY * px + LH * px / 2;
    drawSegments(ctx, head, px, cfg.font, tx, mid + px * 0.35, 'left');
    drawSegments(ctx, tail, px, cfg.font, tx, mid + LH * px + px * 0.35, 'left');
    if (bolas) { const ow = orH * bolas.width / bolas.height; ctx.drawImage(bolas, x0 - OV * px, y0, ow, orH); }
  }
  // Monta a peça: fundo branco, desenho no miolo, moldura por cima, texto. scale < 1 só para a prévia.
  function compose(frame, cfg, bitmap, rec, scale, view) {
    const W = frame.w, H = frame.h, c = document.createElement('canvas');
    c.width = Math.round(W * scale); c.height = Math.round(H * scale);
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const hole = frame.hole;
    ctx.save(); ctx.beginPath(); ctx.rect(hole.x, hole.y, hole.w, hole.h); ctx.clip();
    if (bitmap) {
      // zoom e posição por desenho; o que sobra do miolo fica com o fundo branco da peça
      const v = view || DEFAULT_VIEW, r = (v.r || 0) % 4, bw = r % 2 ? bitmap.height : bitmap.width, bh = r % 2 ? bitmap.width : bitmap.height;
      const k = (cfg.fit === 'cover' ? Math.max : Math.min)(hole.w / bw, hole.h / bh) * v.z;
      ctx.translate(hole.x + hole.w / 2 + v.x * hole.w, hole.y + hole.h / 2 + v.y * hole.h); ctx.rotate(r * Math.PI / 2);
      ctx.drawImage(bitmap, -bitmap.width * k / 2, -bitmap.height * k / 2, bitmap.width * k, bitmap.height * k);
    } else { ctx.fillStyle = '#e9e9e7'; ctx.fillRect(hole.x, hole.y, hole.w, hole.h); }
    ctx.restore();
    ctx.drawImage(frame.img, 0, 0, W, H);
    if (rec) drawText(ctx, W, H, cfg, rec);
    return c;
  }

  // ---------- formatos em uso ----------
  const enabledKinds = () => state.formats === 'ambos' ? KINDS : [state.formats];
  // com um formato só, a mesma moldura vale para todos os desenhos (verticais ou horizontais); com os dois, o formato do desenho escolhe a moldura
  const kindFor = (bm, r) => { const turned = (r || 0) % 2, w = turned ? bm.height : bm.width, h = turned ? bm.width : bm.height; return enabledKinds().length === 1 ? enabledKinds()[0] : (w >= h ? 'paisagem' : 'retrato'); }; // desenho girado 90° troca de formato
  const frameOf = k => enabledKinds().includes(k) ? state.frames[k] : null; // formato desligado conta como sem moldura
  function applyFormats() {
    const on = enabledKinds();
    document.querySelectorAll('#mgFormats button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.formats === state.formats)));
    document.querySelectorAll('.mg-frame-slot').forEach(el => { el.hidden = !on.includes(el.dataset.kind); });
    document.querySelectorAll('#mgKind button').forEach(b => { b.hidden = !on.includes(b.dataset.kind); });
    $('mgKind').hidden = on.length < 2; $('mgCopy').hidden = on.length < 2;
    if (!on.includes(state.kind)) setKind(on[0]); else { syncControls(); renderPreview(); }
  }

  // ---------- molduras e configuração ----------
  async function fontsReady(kind, font) {
    const f = font || state.cfg[kind || state.kind].font;
    try { await Promise.all([document.fonts.load('400 20px "' + f + '"'), document.fonts.load('700 20px "' + f + '"')]); } catch (_) { /* usa a fonte de reserva */ }
  }
  async function setFrame(kind, dataUrl) {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth, h = img.naturalHeight; // a moldura precisa ter o formato do campo em que foi enviada
    if (kind === 'retrato' ? h <= w : w <= h) {
      const e = new Error('A moldura ' + kind + ' precisa ser ' + (kind === 'retrato' ? 'vertical (mais alta que larga)' : 'horizontal (mais larga que alta)') + '. Esta imagem tem ' + w + ' × ' + h + (w === h ? ', é quadrada' : kind === 'retrato' ? ', é horizontal: envie no campo Paisagem' : ', é vertical: envie no campo Retrato'));
      Object.assign(e, { format: true, kind, w, h }); throw e;
    }
    state.frames[kind] = { img, dataUrl, w: img.naturalWidth, h: img.naturalHeight, hole: findHole(img) };
    $('thumb' + (kind === 'retrato' ? 'Retrato' : 'Paisagem')).innerHTML = '<img alt="Moldura em ' + kind + '" src="' + dataUrl + '">';
  }
  const saveCfg = debounce(() => state.cfgOk && fb().then(m => m.writeMoldurasCfg({ ...state.cfg, formats: state.formats })).catch(() => { $('mgFramesState').textContent = 'Não foi possível salvar o texto'; }), 800);

  // estilo da moldura + posição ativa (ou o rascunho aberto no Configurar)
  const effCfg = (kind, d) => { const c = state.cfg[kind]; return { font: c.font, color: c.color, accent: c.accent, tag: c.tag, fit: c.fit, ...c.slots[c.slot], ...(d && d.kind === kind ? d.vals : {}) }; };
  let previewSeq = 0;
  async function renderPreview() {
    const seq = ++previewSeq, frame = frameOf(state.kind), canvas = $('mgPreview'), empty = $('mgPreviewEmpty');
    canvas.hidden = !frame; empty.hidden = !!frame; empty.dataset.kind = state.kind;
    if (!frame) { empty.textContent = 'Envie a moldura ' + state.kind + ' para ver a prévia'; return; }
    const cfg = effCfg(state.kind, draft);
    await fontsReady(null, cfg.font);
    if (seq !== previewSeq) return; // um desenho mais novo já foi pedido
    const scale = Math.min(1, 900 / Math.max(frame.w, frame.h));
    const out = compose(frame, cfg, null, SAMPLE, scale);
    canvas.width = out.width; canvas.height = out.height;
    canvas.getContext('2d').drawImage(out, 0, 0);
  }
  const GEAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
  const pillHtml = (c, k) => '<div class="mg-slot is-flow" data-pos="' + k + '"><button type="button" class="mg-slot-cfg" data-cfg="' + k + '" aria-label="Configurar ' + esc(slotName(c, k).toLowerCase()) + '" title="Configurar">' + GEAR + '</button><button type="button" class="mg-slot-pick" data-slot="' + k + '" aria-pressed="false" title="' + esc(slotName(c, k)) + '">' + esc(slotName(c, k)) + '</button></div>';
  function syncControls() {
    const c = state.cfg[state.kind], fr = frameOf(state.kind);
    $('mgExtra').querySelectorAll('.mg-slot').forEach(el => el.remove());
    $('mgAddSlot').insertAdjacentHTML('beforebegin', extraKeys(c).map(k => pillHtml(c, k)).join(''));
    document.querySelectorAll('#mgSlotsWrap .mg-slot').forEach(el => {
      const k = el.dataset.pos;
      el.querySelector('[data-slot]').setAttribute('aria-pressed', String(k === c.slot));
      el.classList.toggle('is-default', k === c.def);
      el.classList.toggle('is-editing', !!draft && draft.slot === k && !draft.isNew);
    });
    const mini = $('mgSlots');
    mini.dataset.kind = state.kind;
    mini.style.setProperty('--mg-frame', fr ? 'url("' + fr.dataUrl + '")' : 'none');
    $('mgSlotsLabel').textContent = 'Posição do texto' + (enabledKinds().length > 1 ? ' em ' + state.kind : '');
    document.querySelectorAll('#mgKind button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === state.kind)));
  }
  // ---- menu Configurar (rascunho até Salvar) ----
  const pct = v => v.toFixed(1) + '%';
  function fillCfg() {
    const v = draft.vals, c = state.cfg[draft.kind], extra = !SLOT_KEYS.includes(draft.slot), isDef = c.def === draft.slot;
    $('mgCfgTitle').textContent = (draft.isNew ? 'Novo local' : 'Configurar: ' + (extra ? v.name || draft.slot : SLOT_NAMES[draft.slot])) + (enabledKinds().length > 1 ? ' (' + draft.kind + ')' : '');
    $('mgSecName').hidden = !extra; if (extra && document.activeElement !== $('mgName')) $('mgName').value = v.name || '';
    $('mgDefault').checked = isDef || draft.makeDefault; $('mgDefault').disabled = isDef;
    $('mgDefaultHint').textContent = isDef ? 'Esta já é a posição padrão. Para trocar, marque outra como padrão.' : 'A posição padrão é a que vale sempre que a tela abre.';
    $('mgCfgDelete').hidden = !extra || draft.isNew;
    $('mgX').value = v.x; $('mgY').value = v.y; $('mgSize').value = v.size; $('mgFont').value = v.font; $('mgColor').value = v.color; $('mgAccent').value = v.accent; $('mgTag').value = v.tag; $('mgFit').value = v.fit;
    ['X', 'Y'].forEach(a => { const n = $('mg' + a + 'Num'); if (document.activeElement !== n) n.value = v[a.toLowerCase()].toFixed(1); }); // não reescreve o campo enquanto a pessoa digita
    $('mgSizeOut').textContent = pct(v.size);
    $('mgAlign').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.align === v.align)));
  }
  function showCfg(on) { $('mgCfgWrap').classList.toggle('is-open', on); $('mgCfgWrap').inert = !on; }
  function openCfg(slot, isNew) {
    const c = state.cfg[state.kind];
    const base = isNew ? { x: 50, y: 50, align: 'center', size: 2.2, name: 'P' + (extraKeys(c).length + 2) } : c.slots[slot];
    draft = { kind: state.kind, slot, isNew: !!isNew, makeDefault: false, vals: { ...base, font: c.font, color: c.color, accent: c.accent, tag: c.tag, fit: c.fit } };
    fillCfg(); showCfg(true); syncControls(); renderPreview();
  }
  function closeCfg() { draft = null; showCfg(false); syncControls(); renderPreview(); }
  function setDraft(patch) { Object.assign(draft.vals, patch); fillCfg(); renderPreview(); }
  function saveDraft() {
    const c = state.cfg[draft.kind], { x, y, align, size, font, color, accent, tag, fit, name } = draft.vals;
    c.slots[draft.slot] = { x, y, align, size, ...(SLOT_KEYS.includes(draft.slot) ? {} : { name: (name || '').trim() || draft.slot }) };
    Object.assign(c, { font, color, accent, tag, fit, slot: draft.slot });
    if (draft.makeDefault) c.def = draft.slot;
    saveCfg(); closeCfg();
  }
  function deleteSlot() {
    const c = state.cfg[draft.kind], k = draft.slot; delete c.slots[k];
    if (c.def === k) c.def = 'bl'; if (c.slot === k) c.slot = c.def;
    saveCfg(); closeCfg();
  }
  function setKind(kind) { draft = null; showCfg(false); state.kind = kind; syncControls(); renderPreview(); }

  // ---- aviso de moldura em formato incorreto (modal) ----
  const fmModal = $('mgFormat');
  let fmKind = null;
  function showFormat(e) {
    fmKind = e.kind;
    const need = e.kind === 'retrato' ? 'vertical (mais alta que larga)' : 'horizontal (mais larga que alta)';
    const is = e.w === e.h ? 'quadrada' : e.w > e.h ? 'horizontal' : 'vertical';
    const hint = e.w === e.h ? 'Imagens quadradas não servem como moldura.' : 'Este arquivo parece ser de ' + (e.w > e.h ? 'paisagem' : 'retrato') + ': envie-o no campo ' + (e.w > e.h ? 'Paisagem' : 'Retrato') + '.';
    $('fmText').textContent = 'O campo ' + (e.kind === 'retrato' ? 'Retrato' : 'Paisagem') + ' aceita só PNG ' + need + '.';
    $('fmDetail').textContent = 'A imagem enviada tem ' + e.w + ' × ' + e.h + ' pixels e é ' + is + '. ' + hint;
    fmModal.style.display = 'flex'; fmModal.setAttribute('aria-hidden', 'false');
  }
  function closeFormat() { fmModal.style.display = ''; fmModal.setAttribute('aria-hidden', 'true'); }

  async function uploadFrame(kind, file) {
    const st = $('mgFramesState');
    if (!file) return;
    if (file.type !== 'image/png') { st.textContent = 'A moldura precisa ser um PNG'; return; }
    try {
      const dataUrl = await readDataUrl(file);
      if (dataUrl.length > 8000000) { st.textContent = 'PNG grande demais (máximo de cerca de 6 MB)'; return; } // o Firestore aceita ~10 MB por gravação
      await setFrame(kind, dataUrl);
      setKind(kind); refreshAll(); // a moldura já vale nesta sessão mesmo que o salvamento falhe
      st.textContent = 'Salvando a moldura ' + kind;
      await (await fb()).writeMoldura(kind, dataUrl);
      st.textContent = 'Moldura ' + kind + ' salva';
    } catch (e) { if (e.format) showFormat(e); else st.textContent = 'Não foi possível salvar: ' + (e.message || 'erro desconhecido'); }
  }

  // ---------- planilha ----------
  async function readSheet(file, fromLote) {
    if (!fromLote) { state.files.sheet = file; unlinkLote(); }
    const st = $('sheetState'); reading++; renderLotes();
    try {
      await PortalShell.loadScript('vendor/xlsx.full.min.js');
      const buf = await file.arrayBuffer();
      let wb;
      if (/\.csv$/i.test(file.name)) { // CSV: UTF-8, ou Windows-1252 quando vem do Excel em português (senão os acentos quebram)
        let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { text = new TextDecoder('windows-1252').decode(buf); }
        wb = XLSX.read(text, { type: 'string', raw: true });
      } else wb = XLSX.read(buf, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      const hi = rows.findIndex(r => r.filter(c => String(c).trim()).length >= 3);
      if (hi < 0) throw new Error('A planilha está vazia');
      const head = rows[hi].map(norm), find = fn => head.findIndex(fn);
      const col = {
        mat: find(h => h.includes('matric')),
        nasc: find(h => h.includes('nasc')),
        kid: find(h => /crian|filh|depend|menor/.test(h))
      };
      col.colab = find((h, i) => i !== col.kid && /colab|funcion|respons|^pai|^mae|pai\/mae|pai ou mae/.test(h));
      if (col.colab < 0) col.colab = find((h, i) => i !== col.kid && h.includes('nome'));
      const miss = Object.entries({ matrícula: col.mat, colaborador: col.colab, criança: col.kid, 'data de nascimento': col.nasc }).filter(e => e[1] < 0).map(e => e[0]);
      if (miss.length) throw new Error('Não achei a coluna de ' + miss.join(', ') + '. Colunas lidas: ' + rows[hi].filter(String).join(', '));
      const index = new Map(); let kids = 0;
      rows.slice(hi + 1).forEach(r => {
        const nome = String(r[col.kid] || '').trim(), key = keyOf(r[col.mat]);
        if (!nome || !key) return;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ colab: String(r[col.colab] || '').trim(), nome, nasc: parseDate(r[col.nasc]) });
        kids++;
      });
      unbindKids(); state.index = index; resolveKids();
      st.textContent = kids + ' filhos de ' + index.size + ' colaboradores';
      ed.item = null; refreshAll();
    } catch (e) { unbindKids(); state.index = null; ed.item = null; st.textContent = e.message; refreshAll(); }
    finally { reading--; renderLotes(); }
  }

  // ---------- ZIP de desenhos ----------
  // ---------- conjuntos salvos (continuar depois ou por outra pessoa) ----------
  let saving = null, reading = 0, dirty = false, writing = Promise.resolve(true); // conjunto sendo salvo; arquivos sendo lidos; ajuste desta tela ainda não gravado
  const decisions = () => { const work = {}; state.items.forEach(it => { const e = workOf(it); if (e) work[it.file] = e; }); return { work, drawings: state.items.length }; };
  const clean = () => { dirty = false; writing = Promise.resolve(true); }; // nada pendente: ao trocar ou limpar o conjunto
  function unlinkLote() { // subir arquivo novo é outro conjunto (chamar ANTES de mexer nos desenhos ou na planilha lida)
    flushCommit();
    if (saving && !saving.kept) saving.kept = decisions(); // o conjunto que está sendo salvo fica com as decisões dos arquivos que estão saindo
    if (state.loteId) { writeWorkNow(); state.loteId = null; state.work = {}; clean(); $('mgWorkState').textContent = ''; renderLotes(); summary(); }
  }
  // devolve a decisão guardada de um desenho (ou null se ele está como veio do ZIP)
  const workOf = item => {
    const kids = (state.index && state.index.get(item.key)) || [], kid = item.choice != null ? kids[item.choice] : null;
    const e = { k: item.key !== item.key0 ? item.key : undefined, c: kid ? kid.nome : item.wKid || undefined, n: kid ? JSON.stringify(kid.nasc) : item.wKid ? item.wNasc : undefined, o: item.over || undefined, v: item.view || undefined, s: item.skip ? 1 : undefined, a: item.keep && item.keep.length ? item.keep : undefined };
    Object.keys(e).forEach(k => e[k] === undefined && delete e[k]);
    return Object.keys(e).length ? e : null;
  };
  function unbindKids() { // antes de trocar a planilha: a escolha volta a ser o nome do filho (a posição muda de uma planilha para outra)
    flushCommit();
    state.items.forEach(it => { if (it.choice == null) return; const kid = state.index && (state.index.get(it.key) || [])[it.choice]; if (kid) { it.wKid = kid.nome; it.wNasc = JSON.stringify(kid.nasc); } it.choice = null; });
  }
  function resolveKids() { // o filho salvo é guardado pelo nome; vira posição quando a planilha chega
    if (!state.index) return;
    const loose = name => norm(name).replace(/\s+/g, ' '); // planilha corrigida (acento, maiúscula, espaço duplo) continua sendo o mesmo filho
    state.items.forEach(it => {
      if (it.wKid == null) return;
      const kids = state.index.get(it.key) || [], exact = kids.filter(k => k.nome === it.wKid), found = exact.length ? exact : kids.filter(k => loose(k.nome) === loose(it.wKid)), kid = found.find(k => JSON.stringify(k.nasc) === it.wNasc) /* homônimos: desempata pelo nascimento */ || found[0];
      if (kid) { it.choice = kids.indexOf(kid); it.wKid = null; delete it.wNasc; }
    });
  }
  function applyWork() {
    let n = 0;
    state.items.forEach(it => {
      const e = state.work[it.file]; if (!e) return; n++;
      if (e.k) it.key = e.k; if (e.o) it.over = e.o; if (e.v) it.view = e.v; if (e.s) it.skip = true; if (e.c) it.wKid = e.c; if (e.n) it.wNasc = e.n; if (e.a) it.keep = e.a;
    });
    resolveKids();
    if (n) $('mgWorkState').textContent = 'Trabalho salvo retomado em ' + n + (n === 1 ? ' desenho' : ' desenhos');
  }
  const writeWorkNow = force => { // devolve (promessa) se o trabalho está gravado; sem ajuste pendente não regrava, para não apagar o que outra pessoa salvou
    const id = state.loteId; // capturado agora: um novo upload pode desvincular o conjunto antes de a gravação rodar
    if (!id || !state.items.length) return Promise.resolve(true);
    if (!dirty && !force) return writing;
    dirty = false;
    state.items.forEach(it => { const e = workOf(it); if (e) state.work[it.file] = e; else delete state.work[it.file]; });
    const snapshot = JSON.parse(JSON.stringify(state.work)); // cópia agora: state.work é zerado se o conjunto for desvinculado
    return writing = fbw().then(m => m.writeMoldurasWork(id, { items: snapshot })).then(() => { $('mgWorkState').textContent = 'Trabalho salvo'; return true; }).catch(() => { if (state.loteId === id) dirty = true; $('mgWorkState').textContent = 'Não foi possível salvar o trabalho'; return false; });
  };
  const saveLater = debounce(() => writeWorkNow(), 1200), saveWork = () => { dirty = true; saveLater(); };
  const lotesAdd = (entry, remove) => { // lista compartilhada: relê e tenta de novo uma vez se outra pessoa alterou antes
    const tryOnce = async cur => { const itens = [...(entry ? [entry] : []), ...cur.itens.filter(l => l.id !== (entry || remove).id)].sort((a, b) => b.updatedAt - a.updatedAt); const m = await fbw(); const r = await m.writeMoldurasLotes(itens, cur.rev); return r.conflict ? null : { rev: r.rev, itens }; };
    return fbw().then(async m => { let r = await tryOnce(state.lotes); if (!r) r = await tryOnce(await m.readMoldurasLotes()); if (!r) throw new Error('A lista foi alterada por outra pessoa. Tente de novo.'); state.lotes = r; renderLotes(); });
  };
  const fmtBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function renderLotes() {
    const list = $('mgLoteList'); list.replaceChildren();
    if (!state.lotes.itens.length) { const p = document.createElement('p'); p.className = 'mg-meta'; p.textContent = 'Nenhum conjunto salvo ainda'; list.append(p); }
    state.lotes.itens.forEach(l => {
      const row = document.createElement('div'), info = document.createElement('div'), t = document.createElement('strong'), m = document.createElement('small'), open = document.createElement('button'), del = document.createElement('button');
      row.className = 'mg-lote' + (l.id === state.loteId ? ' is-open' : ''); info.className = 'mg-lote-info';
      t.textContent = l.title; m.textContent = new Date(l.updatedAt).toLocaleString('pt-BR') + ' · ' + l.drawings + ' desenhos · ' + fmtBytes(l.bytes) + (l.by ? ' · ' + l.by : '');
      open.type = del.type = 'button'; open.className = 'btn ghost small'; del.className = 'btn ghost danger small'; open.textContent = l.id === state.loteId ? 'Aberto' : 'Abrir'; open.disabled = l.id === state.loteId; del.textContent = 'Excluir';
      open.onclick = () => openLote(l); del.onclick = () => deleteLote(l);
      info.append(t, m); row.append(info, open, del); list.append(row);
    });
    $('mgLoteSave').disabled = !!state.loteId || reading > 0 || !state.files.sheet || !state.files.zip || !state.items.length || !state.index;
    const n = state.lotes.itens.length; $('mgLotesState').textContent = n ? n + (n === 1 ? ' trabalho salvo' : ' trabalhos salvos') : 'Nenhum trabalho salvo';
  }
  async function loadLotes() {
    try { state.lotes = await (await fbw()).readMoldurasLotes(); } catch (_) { $('mgLoteState').textContent = 'Não foi possível carregar os conjuntos salvos'; }    renderLotes();
  }
  const askLoteName = () => new Promise(ok => {
    const modal = $('mgLoteName'), input = $('lnInput');
    const done = v => { modal.style.display = ''; modal.setAttribute('aria-hidden', 'true'); $('lnSave').onclick = $('lnCancel').onclick = $('lnClose').onclick = null; ok(v); };
    input.value = (state.files.zip && state.files.zip.name.replace(/\.zip$/i, '')) || '';
    modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false'); input.focus(); input.select();
    $('lnSave').onclick = () => input.value.trim() ? done(input.value.trim()) : input.focus();
    $('lnCancel').onclick = $('lnClose').onclick = () => done('');
    input.onkeydown = e => { if (e.key === 'Enter') $('lnSave').click(); };
  });
  let loteBusy = false; // uma operação de conjunto por vez (salvar, abrir, excluir)
  async function saveLote() {
    const { sheet, zip } = state.files; if (!sheet || !zip || state.loteId || loteBusy || reading) return;
    loteBusy = true;
    try { await saveLoteNow(sheet, zip); } finally { loteBusy = false; }
  }
  async function saveLoteNow(sheet, zip) {
    if (zip.size > 150 * 1048576) { $('mgLoteState').textContent = 'ZIP grande demais para salvar (máximo de 150 MB)'; return; }
    const title = await askLoteName(); if (!title) return;
    const btn = $('mgLoteSave'), st = $('mgLoteState'), id = crypto.randomUUID(); btn.disabled = true;
    saving = { kept: null }; // se outros arquivos forem enviados durante o salvamento, unlinkLote guarda aqui as decisões destes
    const same = () => state.files.sheet === sheet && state.files.zip === zip;
    try {
      const m = await fbw();
      await m.writeMolduraArquivo('lote_' + id + '_sheet', sheet);
      await m.writeMolduraArquivo('lote_' + id + '_zip', zip, (a, b) => { st.textContent = 'Salvando o ZIP: ' + a + ' de ' + b; });
      const now = Date.now(), by = ((await m.currentContext()).user || {}).email || '';
      const linked = same(), drawings = linked ? state.items.length : saving.kept.drawings;
      if (linked) { state.loteId = id; state.work = {}; if (!await writeWorkNow(true)) throw new Error('as decisões não foram gravadas'); } else await m.writeMoldurasWork(id, { items: saving.kept.work });
      await lotesAdd({ id, title, createdAt: now, updatedAt: now, drawings, bytes: sheet.size + zip.size, sheetName: sheet.name, zipName: zip.name, by });
      st.textContent = state.loteId === id ? 'Conjunto salvo' : 'Conjunto salvo sem os arquivos enviados depois'; summary(); renderLotes();
    } catch (e) { if (state.loteId === id) { state.loteId = null; state.work = {}; clean(); } st.textContent = 'Não foi possível salvar o conjunto: ' + (e.message || e); renderLotes(); fbw().then(m => m.deleteMoldurasLote(id)).catch(() => {}); } // não deixa pedaços órfãos no Firestore
    finally { saving = null; }
  }
  async function openLote(l) {
    const st = $('mgLoteState'); if (reading) { st.textContent = 'Aguarde a leitura dos arquivos para abrir outro conjunto'; return; }
    if (loteBusy) return; loteBusy = true;
    let replaced = false;
    try {
      const keepCurrent = async () => { // repete enquanto houver ajuste novo; sem rede o Firestore não responde, por isso o prazo
        do {
          flushCommit(); if (dirty && state.loteId) st.textContent = 'Salvando os ajustes';
          if (!await Promise.race([writeWorkNow(), new Promise(ok => setTimeout(ok, 20000, false))])) throw new Error('os ajustes do conjunto aberto não foram salvos');
        } while (state.loteId && state.items.length && (dirty || commitTimer));
      };
      await keepCurrent();
      const m = await fbw(); st.textContent = 'Abrindo o conjunto';
      const [sheet, zip, work] = await Promise.all([m.readMolduraArquivo('lote_' + l.id + '_sheet', 'application/octet-stream'), m.readMolduraArquivo('lote_' + l.id + '_zip', 'application/zip', (a, b) => { st.textContent = 'Baixando o ZIP: ' + a + ' de ' + b; }), m.readMoldurasWork(l.id)]);
      await keepCurrent(); /* o que mudou durante o download */ replaced = true; clean(); state.work = work.items || {}; state.loteId = l.id;
      state.files = { sheet: new File([sheet], l.sheetName || 'planilha.xlsx'), zip: new File([zip], l.zipName || 'desenhos.zip') };
      state.items = []; state.index = null; ed.item = null;
      await readSheet(state.files.sheet, true); await readZip(state.files.zip, true);
      $('mgWorkState').textContent = ''; st.textContent = 'Conjunto aberto: ' + l.title; renderLotes(); summary();
    } catch (e) { if (replaced) { state.loteId = null; state.work = {}; } st.textContent = 'Não foi possível abrir o conjunto: ' + (e.message || e); renderLotes(); }
    finally { loteBusy = false; }
  }
  async function deleteLote(l) {
    if (loteBusy || !confirm('Excluir "' + l.title + '"? A planilha, o ZIP e os ajustes salvos serão apagados para todos os administradores.')) return;
    loteBusy = true;
    try {
      await (await fbw()).deleteMoldurasLote(l.id); await lotesAdd(null, l); // arquivos primeiro: se falhar no meio, o conjunto continua na lista para excluir de novo
      if (state.loteId === l.id) { state.loteId = null; state.work = {}; }
      $('mgLoteState').textContent = 'Conjunto excluído'; renderLotes(); summary();
    } catch (e) { $('mgLoteState').textContent = 'Não foi possível excluir: ' + (e.message || e); }
    finally { loteBusy = false; }
  }
  // PDFs do ZIP (só a primeira página vale: a segunda é o verso do desenho, sem conteúdo): lidos com pdf.js, copiado em vendor/pdfjs/ e carregado só no primeiro PDF
  let pdfjsReady;
  const ensurePdfjs = () => pdfjsReady || (pdfjsReady = PortalShell.loadScript('vendor/pdfjs/pdf.min.js').then(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', SCRIPT_SRC || location.href).href;
  }).catch(e => { pdfjsReady = null; throw e; })); // falha não fica guardada: o próximo PDF tenta de novo
  const openPdf = async entry => { await ensurePdfjs(); return pdfjsLib.getDocument({ data: await entry.async('uint8array'), isEvalSupported: false }).promise; }; // sem eval: a CSP do portal não permite
  // ponytail: a página é desenhada de novo a cada uso (miniatura, editor, exportação) para não guardar dezenas de imagens grandes na memória
  async function renderPdfPage(item) {
    const doc = await openPdf(item.entry);
    try {
      const page = await doc.getPage(item.page), v0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(4, 3000 / Math.max(v0.width, v0.height)) });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return await new Promise(ok => c.toBlob(ok, 'image/jpeg', .92));
    } finally { doc.destroy(); }
  }
  async function readZip(file, fromLote) {
    if (!fromLote) { state.files.zip = file; unlinkLote(); }
    const st = $('zipState'); reading++; renderLotes();
    try {
      await PortalShell.loadScript('vendor/jszip.min.js');
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(e => {
        const base = e.name.split('/').pop();
        return !e.dir && !/(^|\/)__MACOSX\//.test(e.name) && !base.startsWith('.') && (IMG_EXT.test(base) || PDF_EXT.test(base));
      });
      const items = [], unreadable = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i], name = entry.name.split('/').pop(), stem = name.replace(/\.[^.]+$/, ''), m = stem.match(/^\s*(?:FG[\s_-]*)?(\d+)/i), key = keyOf(m ? m[1] : stem);
        if (!PDF_EXT.test(name)) { items.push({ id: items.length, file: name, key, key0: key, entry, choice: null, skip: false }); continue; }
        st.textContent = 'Lendo PDF ' + (i + 1) + ' de ' + entries.length;
        try { (await openPdf(entry)).destroy(); } catch (_) { unreadable.push(name); continue; } // confere que o PDF abre
        items.push({ id: items.length, file: name, key, key0: key, entry, page: 1, choice: null, skip: false });
      }
      state.items = items; ed.item = null; applyWork();
      st.textContent = (items.length ? items.length + ' desenhos' : 'Nenhuma imagem ou PDF encontrado no ZIP') + (unreadable.length ? '. ' + unreadable.length + ' PDF(s) não puderam ser lidos: ' + unreadable.slice(0, 3).join(', ') + (unreadable.length > 3 ? '…' : '') : '');
      refreshAll();
    } catch (e) { state.items = []; st.textContent = 'Não foi possível ler o ZIP: ' + e.message; refreshAll(); }
    finally { reading--; renderLotes(); }
  }
  const blobOf = item => item.page ? renderPdfPage(item) : item.entry.async('blob').then(b => new Blob([b], { type: /\.png$/i.test(item.file) ? 'image/png' : /\.webp$/i.test(item.file) ? 'image/webp' : 'image/jpeg' }));
  const bitmapOf = async item => createImageBitmap(await blobOf(item), { imageOrientation: 'from-image' });

  // ---------- cruzamento ----------
  function statusOf(item) {
    const kids = (state.index && state.index.get(item.key)) || [];
    if (item.skip) return { s: 'skip', kids };
    if (item.over) return { s: 'ok', kids, kid: item.choice != null ? kids[item.choice] : kids.length === 1 ? kids[0] : null, rec: item.over }; // texto editado à mão
    if (!kids.length) return { s: 'missing', kids };
    if (item.wKid && item.choice == null) return { s: 'choose', kids }; // o filho escolhido não está nesta planilha: não assume o que sobrou
    if (kids.length === 1) return { s: 'ok', kids, kid: kids[0], rec: recOf(kids[0]) };
    if (item.choice == null) return { s: 'choose', kids };
    return { s: 'ok', kids, kid: kids[item.choice], rec: recOf(kids[item.choice]) };
  }

  const STATUS_LABEL = { ok: 'Pronto', choose: 'Escolher o filho', missing: 'Matrícula não encontrada', skip: 'Descartado' };
  const textOf = (item, st) => { const r = st.rec; return r ? r.nome + (r.idade ? ', ' + r.idade : '') + ', filho(a) de ' + r.colab : 'Matrícula ' + item.key; };
  const acList = (item, st) => st.s === 'ok' && st.rec ? acentosEm(st.rec.nome + ' ' + st.rec.colab).filter(a => !(item.keep || []).includes(a.de)) : []; // item.keep: palavras que a pessoa mandou manter como estão
  const acBadge = (item, st) => { const l = acList(item, st); return l.length ? '<span class="mg-badge is-attn" title="' + esc(l.map(a => a.de + ' → ' + a.para).join(', ')) + '">Revisar acentos</span>' : ''; };
  const badgeOf = (item, st) => { const warn = st.s === 'choose' || st.s === 'missing'; return (warn || st.s === 'skip' ? '<span class="mg-badge' + (warn ? ' is-warn' : '') + '">' + STATUS_LABEL[st.s] + '</span>' : (item.over || item.view ? '<span class="mg-badge">Editado</span>' : '')) + acBadge(item, st); };
  const headOf = (item, st) => '<span class="mg-qdot" aria-hidden="true"></span><span class="mg-qmain"><strong>' + esc(item.file) + '</strong><small>' + esc(textOf(item, st)) + '</small></span>' + badgeOf(item, st);
  const PEN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const rowClass = (item, st) => 'mg-qrow is-' + st.s + (item === ed.item ? ' is-sel' + (ed.open ? ' is-open' : '') : '');
  // clicar na linha só escolhe o desenho (prévia ao lado); o lápis ao final abre a edição dos dados
  const rowOf = ({ item, st }) => { const sel = item === ed.item, open = sel && ed.open;
    return '<div class="' + rowClass(item, st) + '" data-id="' + item.id + '" role="listitem"><div class="mg-qtop"><button type="button" class="mg-qhead" tabindex="' + (sel ? 0 : -1) + '">' + headOf(item, st) + '</button><button type="button" class="mg-qedit" aria-expanded="' + open + '" aria-label="Editar os dados deste desenho" title="Editar" tabindex="' + (sel ? 0 : -1) + '">' + PEN + '</button></div><div class="mg-qcollapse"' + (open ? '' : ' inert') + '><div class="mg-qinner"></div></div></div>'; };
  // contagens, filtro e botão de baixar (leve: pode rodar a cada edição)
  function summary() {
    const ready = !!(state.index && state.items.length);
    const sts = state.items.map(item => ({ item, st: statusOf(item) }));
    const pending = ready ? sts.filter(x => x.st.s === 'choose' || x.st.s === 'missing') : [], oks = ready ? sts.filter(x => x.st.s === 'ok') : [];
    [['sheetFile', state.index && state.files.sheet], ['zipFile', state.items.length && state.files.zip]].forEach(([id, f]) => { // ícone e nome do arquivo lido
      $(id).hidden = !f; if (f) $(id).querySelector('.mg-file-name').textContent = f.name;
    });
    $('mgExportRow').hidden = !ready; $('mgWorkClear').hidden = !ready || !state.loteId; $('mgLoteSave').disabled = !!state.loteId || reading > 0 || !state.files.sheet || !state.files.zip || !ready;
    $('mgResultCount').textContent = ready ? sts.length + ' desenhos, ' + oks.length + ' prontos' + (pending.length ? ', ' + pending.length + (pending.length === 1 ? ' pendente' : ' pendentes') : '') : '';
    $('mgExport').disabled = !oks.length || !!pending.length;
    $('mgFilterPending').textContent = 'Pendentes (' + pending.length + ')';
    const review = ready ? sts.filter(x => acList(x.item, x.st).length) : []; // nomes que podem ter perdido o acento
    $('mgFilterReview').textContent = 'Revisão (' + review.length + ')';
    return { ready, sts, pending, review };
  }
  // os campos de edição são um só elemento que mora na linha selecionada; antes de refazer a lista ele sai para um depósito para não ser destruído
  const attachFields = () => { const row = document.querySelector('#mgResultList .mg-qrow.is-sel'); if (row) row.querySelector('.mg-qinner').appendChild($('mgEdFields')); };
  let wasReady = false;
  function refreshAll() {
    const { ready, sts, pending, review } = summary();
    $('mgEmpty').hidden = ready; $('mgWork').hidden = !ready;
    if (ready && !wasReady) $('mgResult').open = true; // planilha e ZIP prontos: abre a conferência
    wasReady = ready;
    if (!ready) { // os desenhos vêm do ZIP: sem ele (ou sem a planilha) não há o que conferir
      const noSheet = !state.index, noZip = !state.items.length;
      $('mgEmpty').textContent = noSheet && noZip ? 'Envie a planilha na etapa 3 e o ZIP com os desenhos na etapa 4. Cada desenho aparece aqui, um a um, para você conferir e editar.'
        : noZip ? 'A planilha já foi lida. Falta enviar o ZIP com os desenhos na etapa 4: eles aparecem aqui, um a um, para você conferir e editar.'
        : 'Os desenhos já foram lidos. Falta enviar a planilha na etapa 3 para cruzar as matrículas.';
      ed.item = null; return;
    }
    document.querySelectorAll('#mgFilter button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
    $('mgEdHold').appendChild($('mgEdFields'));
    $('mgResultList').innerHTML = (state.filter === 'pending' ? pending : state.filter === 'review' ? review : sts).map(rowOf).join('') || '<p class="mg-empty-state">' + (state.filter === 'review' ? 'Nenhum desenho para revisar' : 'Nenhum desenho pendente') + '</p>';
    attachFields();
    if (!ed.item || !state.items.includes(ed.item)) selectItem((pending[0] || sts[0]).item); // abre o primeiro pendente (ou o primeiro desenho)
  }
  function patchRow(item) { // atualiza só o cabeçalho da linha editada (refazer a lista tiraria o foco dos campos)
    const row = document.querySelector('#mgResultList .mg-qrow[data-id="' + item.id + '"]'); if (!row) return;
    const st = statusOf(item);
    row.className = rowClass(item, st);
    row.querySelector('.mg-qhead').innerHTML = headOf(item, st);
  }

  // ---------- editor do desenho selecionado: zoom, posição e textos (vale na hora, sem botão Salvar) ----------
  const ed = { open: false, adjust: false, item: null, bitmap: null, frame: null, kind: '', view: null, kidIdx: null, nomeFull: '', colabFull: '', timer: 0, drag: null, fail: false };
  const chipStates = (words, text) => { const t = text.toLowerCase().split(/\s+/).filter(Boolean); let j = 0; return words.map(w => (j < t.length && t[j] === w.toLowerCase()) ? (j++, true) : false); };
  // um botão por palavra do nome completo: clicar liga ou desliga a palavra no campo ao lado (ordem original mantida)
  function renderChips(box, full, input) {
    const words = full.split(/\s+/).filter(Boolean), on = chipStates(words, input.value);
    box.innerHTML = words.length > 1 ? words.map((w, i) => '<button type="button" data-i="' + i + '" aria-pressed="' + on[i] + '">' + esc(w) + '</button>').join('') : '';
  }
  function bindChips(box, getFull, input) {
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const words = getFull().split(/\s+/).filter(Boolean), on = chipStates(words, input.value); on[+b.dataset.i] = !on[+b.dataset.i];
      input.value = words.filter((_, i) => on[i]).join(' ');
      renderChips(box, getFull(), input); drawEditor(); scheduleCommit();
    });
    input.addEventListener('input', () => { renderChips(box, getFull(), input); drawEditor(); scheduleCommit(); });
  }
  bindChips($('edNomeChips'), () => ed.nomeFull, $('edNome'));
  bindChips($('edColabChips'), () => ed.colabFull, $('edColab'));
  // tags amarelas de possível falta de acento, com Corrigir (troca a palavra no campo e nos botões de palavras) e Manter (a palavra está certa: sai da revisão)
  let acKey = '';
  function renderAcentos() {
    const keep = ed.item.keep || [], ok = a => !keep.includes(a.de), nome = acentosEm($('edNome').value).filter(ok), colab = acentosEm($('edColab').value).filter(ok), key = JSON.stringify([nome, colab]);
    if (key === acKey) return; acKey = key;
    [['edNomeAc', nome, 'nome'], ['edColabAc', colab, 'colab']].forEach(([id, list, f]) => {
      $(id).innerHTML = list.map(a => '<span class="mg-badge is-attn">Possível acento: ' + esc(a.de) + ' → ' + esc(a.para) + '<button type="button" data-act="fix" data-f="' + f + '" data-de="' + esc(a.de) + '" data-para="' + esc(a.para) + '">Corrigir</button><button type="button" data-act="keep" data-de="' + esc(a.de) + '">Manter</button></span>').join('');
    });
  }
  ['edNomeAc', 'edColabAc'].forEach(id => $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !ed.item) return;
    if (b.dataset.act === 'keep') (ed.item.keep || (ed.item.keep = [])).push(b.dataset.de);
    else {
      const isN = b.dataset.f === 'nome', input = $(isN ? 'edNome' : 'edColab'), fix = s => s.split(/\s+/).map(w => w === b.dataset.de ? b.dataset.para : w).join(' ');
      input.value = fix(input.value);
      if (isN) ed.nomeFull = fix(ed.nomeFull); else ed.colabFull = fix(ed.colabFull);
      renderChips($(isN ? 'edNomeChips' : 'edColabChips'), isN ? ed.nomeFull : ed.colabFull, input);
    }
    drawEditor(); commit(); // grava já: a tag some da linha e o contador do filtro Revisão atualiza
    if (state.filter === 'review') refreshAll(); // no filtro Revisão a linha sai da lista
  }));
  $('edIdade').addEventListener('input', () => { drawEditor(); scheduleCommit(); });

  // grava o que está nos campos no desenho (adiado 250 ms para juntar teclas e arrastos; trocar de desenho grava antes)
  let commitTimer = 0;
  const scheduleCommit = () => { clearTimeout(commitTimer); commitTimer = setTimeout(() => { commitTimer = 0; commit(); }, 250); };
  const flushCommit = () => { if (commitTimer) { clearTimeout(commitTimer); commitTimer = 0; commit(); } };
  function commit() {
    const it = ed.item; if (!it) return;
    const kids = (state.index && state.index.get(it.key)) || [], cur = edRec(), kid = ed.kidIdx != null ? kids[ed.kidIdx] : null, base = kid ? recOf(kid) : null;
    if (it.wKid == null) it.choice = ed.kidIdx; // filho lembrado que não está nesta planilha: só uma escolha explícita o substitui
    it.over = base && cur.nome === base.nome && cur.idade === base.idade && cur.colab === base.colab ? null : (cur.nome && cur.colab ? cur : null); // só guarda texto editado se for diferente da planilha
    it.view = (ed.view.z !== 1 || ed.view.x || ed.view.y || ed.view.r) ? { ...ed.view } : null;
    patchRow(it); summary(); saveWork();
  }

  function loadKid(i) {
    const kids = (state.index && state.index.get(ed.item.key)) || [];
    ed.kidIdx = i;
    if (i == null || !kids[i]) { ed.nomeFull = ed.colabFull = ''; return; }
    const r = recOf(kids[i]);
    ed.nomeFull = titleCase(kids[i].nome); ed.colabFull = titleCase(kids[i].colab);
    $('edNome').value = r.nome; $('edIdade').value = r.idade; $('edColab').value = r.colab;
  }
  // verso: 2ª página do mesmo PDF, só para reconhecer a criança pelo nome escrito à mão; não entra na moldura nem na exportação
  let versoSeq = 0, versoItem = null, versoSrc = null;
  const versoModal = $('mgVerso');
  // pinta o verso girado como o desenho principal (ed.view.r, em quartos de volta) na miniatura e, se aberto, no modal
  function syncVerso() {
    if (!versoSrc) return;
    const r = (ed.view.r || 0) % 4, w = versoSrc.width, h = versoSrc.height;
    [$('edVerso'), $('vmCanvas')].forEach(c => {
      c.width = r % 2 ? h : w; c.height = r % 2 ? w : h;
      const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(r * Math.PI / 2); x.drawImage(versoSrc, -w / 2, -h / 2);
    });
  }
  const closeVerso = () => { versoModal.style.display = ''; versoModal.setAttribute('aria-hidden', 'true'); };
  const openVerso = () => { versoModal.style.display = 'flex'; versoModal.setAttribute('aria-hidden', 'false'); $('vmClose').focus(); };
  $('edVerso').addEventListener('click', openVerso);
  $('edVerso').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openVerso(); } });
  $('vmClose').addEventListener('click', closeVerso);
  versoModal.addEventListener('mousedown', e => { if (e.target === versoModal) closeVerso(); });
  PortalShell.wireModalA11y(versoModal, closeVerso);
  async function drawVerso(item) {
    if (item === versoItem) return;
    const box = $('edVersoBox'), seq = ++versoSeq; box.hidden = true; versoItem = versoSrc = null; closeVerso();
    if (!item.page) return;
    try {
      const doc = await openPdf(item.entry);
      try {
        if (doc.numPages < 2) return;
        const page = await doc.getPage(2), v0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, 1600 / Math.max(v0.width, v0.height)) });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (seq !== versoSeq) return; // o usuário já trocou de desenho
        versoItem = item; versoSrc = c; box.hidden = false; syncVerso();
      } finally { doc.destroy(); }
    } catch (_) { /* o verso é só ajuda visual: sem ele, segue sem avisar */ }
  }
  async function selectItem(item, keep) {
    flushCommit(); drawVerso(item);
    if (!keep) { ed.open = false; ed.adjust = false; }
    if (ed.bitmap) ed.bitmap.close();
    const st = statusOf(item), kids = st.kids || [];
    ed.item = item; ed.view = { ...(item.view || DEFAULT_VIEW) }; ed.view.z = Math.max(1, ed.view.z); ed.fail = false; ed.bitmap = null; ed.frame = null;
    syncVerso();
    $('mgEd').hidden = false; $('mgDetailEmpty').hidden = true;
    $('edKey').value = item.key;
    $('edKidWrap').hidden = !kids.length;
    const idx = item.choice != null ? item.choice : kids.length === 1 && !item.wKid ? 0 : null;
    $('edKid').innerHTML = (idx == null ? '<option value="">Escolher o filho</option>' : '') + kids.map((k, i) => '<option value="' + i + '">' + esc(titleCase(k.nome)) + (ageText(k.nasc) ? ', ' + esc(ageText(k.nasc)) : '') + '</option>').join('');
    loadKid(idx); $('edKid').value = idx == null ? '' : idx;
    if (item.over) { $('edNome').value = item.over.nome; $('edIdade').value = item.over.idade; $('edColab').value = item.over.colab; }
    else if (idx == null) { $('edNome').value = $('edIdade').value = $('edColab').value = ''; }
    renderChips($('edNomeChips'), ed.nomeFull, $('edNome')); renderChips($('edColabChips'), ed.colabFull, $('edColab'));
    $('edSkip').textContent = item.skip ? 'Restaurar desenho' : 'Descartar desenho';
    syncZoom(); syncAdjust(); markSel();
    try { const bm = await bitmapOf(item); if (ed.item !== item) { bm.close(); return; } ed.bitmap = bm; ed.kind = kindFor(bm, ed.view.r); ed.frame = frameOf(ed.kind); }
    catch (_) { ed.fail = true; }
    drawEditor();
  }
  function markSel() { // troca a linha aberta na lista, sem refazê-la
    document.querySelectorAll('#mgResultList .mg-qrow').forEach(r => {
      const on = !!ed.item && +r.dataset.id === ed.item.id, open = on && ed.open;
      r.classList.toggle('is-sel', on); r.classList.toggle('is-open', open);
      r.querySelector('.mg-qhead').tabIndex = r.querySelector('.mg-qedit').tabIndex = on ? 0 : -1;
      r.querySelector('.mg-qedit').setAttribute('aria-expanded', String(open)); r.querySelector('.mg-qcollapse').inert = !open;
    });
    attachFields();
    const row = document.querySelector('#mgResultList .mg-qrow.is-sel'); if (row) row.scrollIntoView({ block: 'nearest' });
  }
  const edRec = () => ({ nome: $('edNome').value.trim(), idade: $('edIdade').value.trim(), colab: $('edColab').value.trim() });
  function syncZoom() { $('edZoom').value = Math.round(ed.view.z * 100); $('edZoomOut').textContent = Math.round(ed.view.z * 100) + '%'; }
  function edRecord() { // texto que vai na peça agora
    const r = edRec(), kids = (state.index && state.index.get(ed.item.key)) || [], provisional = !(r.nome && r.colab) && ed.kidIdx == null && kids.length > 1;
    return { provisional, rec: r.nome && r.colab ? r : provisional ? recOf(kids[0]) : null }; // sem filho escolhido, a prévia usa o primeiro da planilha só para mostrar a tag
  }
  // lupa no canto da prévia: a peça (com moldura) ampliada num modal
  const zoomModal = $('mgZoom');
  const closeZoom = () => { zoomModal.style.display = ''; zoomModal.setAttribute('aria-hidden', 'true'); };
  $('edMagnify').addEventListener('click', async () => {
    if (!ed.item || !ed.bitmap || !ed.frame) return;
    await fontsReady(ed.kind); if (!ed.item || !ed.frame) return;
    const out = compose(ed.frame, effCfg(ed.kind), ed.bitmap, edRecord().rec, Math.min(1, 1800 / Math.max(ed.frame.w, ed.frame.h)), ed.view), c = $('zmCanvas');
    c.width = out.width; c.height = out.height; c.getContext('2d').drawImage(out, 0, 0);
    zoomModal.style.display = 'flex'; zoomModal.setAttribute('aria-hidden', 'false'); $('zmClose').focus();
  });
  $('zmClose').addEventListener('click', closeZoom);
  zoomModal.addEventListener('mousedown', e => { if (e.target === zoomModal) closeZoom(); });
  PortalShell.wireModalA11y(zoomModal, closeZoom);
  function drawEditor() { // adia o desenho para juntar vários eventos seguidos (arrastar, digitar)
    if (ed.item) renderAcentos();
    if (!ed.item || ed.timer) return;
    ed.timer = setTimeout(async () => {
      ed.timer = 0; if (!ed.item) return;
      const c = $('edCanvas'), hint = $('edHint');
      if (!ed.bitmap || !ed.frame) { c.hidden = true; hint.textContent = ed.fail ? 'Não foi possível abrir esta imagem' : ed.bitmap ? 'Falta a moldura em ' + ed.kind + '. Envie-a na etapa 1' : 'Carregando'; return; }
      c.hidden = false; await fontsReady(ed.kind);
      if (!ed.item) return;
      const { rec, provisional } = edRecord();
      hint.textContent = provisional ? 'Prévia com o primeiro filho da planilha. Escolha o filho certo ao lado para confirmar' : rec ? (ed.adjust ? 'Arraste para mover, use a roda do mouse ou o zoom para ampliar. Duplo clique no desenho para travar' : 'Duplo clique no desenho para ajustar o zoom e a posição') : 'Matrícula fora da planilha: corrija a matrícula ou preencha o nome e o colaborador ao lado';
      const out = compose(ed.frame, effCfg(ed.kind), ed.bitmap, rec, Math.min(1, 800 / Math.max(ed.frame.w, ed.frame.h)), ed.view);
      c.width = out.width; c.height = out.height; c.getContext('2d').drawImage(out, 0, 0);
    }, 16);
  }
  // zoom e reposicionamento só valem depois de um duplo clique no desenho (evita mover sem querer ao clicar ou rolar a página)
  function syncAdjust() { $('edCanvas').classList.toggle('is-adjust', ed.adjust); $('edZoom').disabled = !ed.adjust; }
  $('edCanvas').addEventListener('dblclick', () => { if (!ed.item) return; ed.adjust = !ed.adjust; syncAdjust(); drawEditor(); });
  const setZoom = z => { if (!ed.adjust) return; ed.view.z = Math.min(4, Math.max(1, z)); // sem zoom abaixo de 100%: o desenho já cabe inteiro nessa medida
    syncZoom(); drawEditor(); scheduleCommit(); };
  $('edZoom').addEventListener('input', e => setZoom(+e.target.value / 100));
  $('edCanvas').addEventListener('wheel', e => { if (!ed.adjust) return; e.preventDefault(); setZoom(ed.view.z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  $('edCanvas').addEventListener('pointerdown', e => { if (!ed.adjust) return; ed.drag = { x: e.clientX, y: e.clientY, vx: ed.view.x, vy: ed.view.y }; e.target.setPointerCapture(e.pointerId); e.target.classList.add('is-drag'); });
  $('edCanvas').addEventListener('pointermove', e => {
    if (!ed.drag || !ed.frame) return;
    const k = e.target.getBoundingClientRect().width / ed.frame.w; // pixels da tela por pixel da moldura
    ed.view.x = ed.drag.vx + (e.clientX - ed.drag.x) / (k * ed.frame.hole.w);
    ed.view.y = ed.drag.vy + (e.clientY - ed.drag.y) / (k * ed.frame.hole.h);
    drawEditor();
  });
  const endDrag = e => { if (ed.drag) scheduleCommit(); ed.drag = null; e.target.classList.remove('is-drag'); };
  $('edCanvas').addEventListener('pointerup', endDrag); $('edCanvas').addEventListener('pointercancel', endDrag);
  $('edReset').addEventListener('click', () => { ed.view = { ...DEFAULT_VIEW }; if (ed.bitmap) { ed.kind = kindFor(ed.bitmap, 0); ed.frame = frameOf(ed.kind); } syncZoom(); syncVerso(); drawEditor(); scheduleCommit(); });
  const rotate = d => { // gira 90°; com os dois formatos ligados o desenho passa para a moldura do outro formato
    if (!ed.item) return;
    ed.view.r = ((ed.view.r || 0) + d + 4) % 4; ed.view.x = ed.view.y = 0;
    if (ed.bitmap) { ed.kind = kindFor(ed.bitmap, ed.view.r); ed.frame = frameOf(ed.kind); }
    syncVerso(); drawEditor(); scheduleCommit();
  };
  $('edRotL').addEventListener('click', () => rotate(-1)); $('edRotR').addEventListener('click', () => rotate(1));
  $('edKid').addEventListener('change', e => {
    const i = e.target.value === '' ? null : +e.target.value; if (ed.item) { ed.item.wKid = null; delete ed.item.wNasc; }
    if (i == null) { ed.kidIdx = null; ed.nomeFull = ed.colabFull = ''; $('edNome').value = $('edIdade').value = $('edColab').value = ''; } else loadKid(i);
    renderChips($('edNomeChips'), ed.nomeFull, $('edNome')); renderChips($('edColabChips'), ed.colabFull, $('edColab')); drawEditor(); scheduleCommit();
  });
  $('edKeyGo').addEventListener('click', () => { // corrige a matrícula do arquivo e cruza de novo com a planilha
    const it = ed.item, k = keyOf($('edKey').value); if (!it || !k) return;
    const keep = ed.open; flushCommit(); it.key = k; it.choice = null; it.wKid = null; it.over = null; ed.item = null; refreshAll(); ed.open = keep; selectItem(it, true); saveWork();
  });
  $('edSkip').addEventListener('click', () => { const it = ed.item; if (!it) return; it.skip = !it.skip; $('edSkip').textContent = it.skip ? 'Restaurar desenho' : 'Descartar desenho'; refreshAll(); saveWork(); });
  $('mgLoteSave').addEventListener('click', saveLote);
  document.querySelectorAll('.mg-file-x').forEach(b => b.addEventListener('click', e => { // x no ícone: tira o arquivo para enviar outro
    e.preventDefault(); e.stopPropagation();
    unlinkLote(); $('mgLoteState').textContent = '';
    if (b.dataset.clear === 'sheet') { unbindKids(); state.files.sheet = null; state.index = null; $('fileSheet').value = ''; $('sheetState').textContent = 'Nenhuma planilha'; }
    else { state.files.zip = null; state.items = []; $('fileZip').value = ''; $('zipState').textContent = 'Nenhum ZIP'; }
    ed.item = null; refreshAll();
  }));
  $('mgWorkClear').addEventListener('click', () => { // apaga as decisões salvas (de todos os desenhos) e volta ao que veio do ZIP e da planilha
    if (!state.loteId || !confirm('Apagar todos os ajustes salvos deste conjunto (filhos escolhidos, textos, zoom, giro e descartados)? Isso vale para todos os administradores.')) return;
    state.items.forEach(it => { it.key = it.key0; it.choice = null; it.wKid = null; it.over = null; it.view = null; it.skip = false; it.keep = null; });
    state.work = {}; clean(); ed.item = null; refreshAll();
    fbw().then(m => m.writeMoldurasWork(state.loteId, { items: {} })).then(() => { $('mgWorkState').textContent = 'Ajustes salvos apagados'; }).catch(() => { $('mgWorkState').textContent = 'Não foi possível apagar o trabalho salvo'; });
  });
  $('mgResultList').addEventListener('click', e => {
    const b = e.target.closest('.mg-qhead, .mg-qedit'), r = b && b.closest('.mg-qrow'); if (!r) return;
    const it = state.items.find(x => x.id === +r.dataset.id); if (!it) return;
    const same = it === ed.item; if (!same) selectItem(it);
    if (b.classList.contains('mg-qedit') || e.target.closest('.mg-badge.is-warn, .mg-badge.is-attn')) { ed.open = same ? !ed.open : true; markSel(); } // o lápis e as etiquetas vermelha e amarela abrem ou fecham a edição
    else if (same && ed.open) { ed.open = false; markSel(); } // clicar de novo no topo da linha aberta fecha
  });
  $('mgResultList').addEventListener('dblclick', e => { // duplo clique na linha abre a edição, como o lápis
    const h = e.target.closest('.mg-qhead'), r = h && h.closest('.mg-qrow'), it = r && state.items.find(x => x.id === +r.dataset.id); if (!it) return;
    if (it !== ed.item) selectItem(it);
    ed.open = true; markSel();
  });
  $('mgResultList').addEventListener('keydown', e => { // setas sobem e descem na lista
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !e.target.closest('.mg-qhead')) return;
    const rows = [...$('mgResultList').querySelectorAll('.mg-qrow')], at = rows.findIndex(r => r.classList.contains('is-sel')), to = rows[at + (e.key === 'ArrowDown' ? 1 : -1)];
    if (to) { e.preventDefault(); const h = to.querySelector('.mg-qhead'); h.click(); h.focus(); }
  });
  $('mgFilter').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.filter = b.dataset.filter; refreshAll(); } });
  $('fmCancel').addEventListener('click', closeFormat); $('fmClose').addEventListener('click', closeFormat);
  $('fmRetry').addEventListener('click', () => { const k = fmKind; closeFormat(); $('file' + (k === 'retrato' ? 'Retrato' : 'Paisagem')).click(); });
  fmModal.addEventListener('mousedown', e => { if (e.target === fmModal) closeFormat(); });
  PortalShell.wireModalA11y(fmModal, closeFormat);
  PortalShell.wireModalA11y($('mgLoteName'), () => $('lnCancel').click()); // Esc e Tab dentro do modal; o clique fora não fecha (evita perder o nome digitado)

  // ---------- exportar ----------
  async function exportAll() {
    flushCommit();
    const wantPng = $('outPng').checked, wantPdf = $('outPdf').checked, st = $('mgExportState'), btn = $('mgExport');
    if (!wantPng && !wantPdf) { st.textContent = 'Marque PNG, PDF ou os dois'; return; }
    const list = state.items.map(item => ({ item, st: statusOf(item) })).filter(x => x.st.s === 'ok');
    btn.disabled = true;
    try {
      await PortalShell.loadScript('vendor/jszip.min.js');
      if (wantPdf) await PortalShell.loadScript('vendor/jspdf.umd.min.js');
      await fontsReady(); // as duas molduras podem usar fontes diferentes
      await bolasReady;
      await Promise.all(KINDS.map(k => Promise.all([document.fonts.load('400 20px "' + state.cfg[k].font + '"'), document.fonts.load('700 20px "' + state.cfg[k].font + '"')]))).catch(() => {});
      const out = new JSZip(), used = {}, failed = [];
      for (let i = 0; i < list.length; i++) {
        const { item, st: s } = list[i];
        st.textContent = 'Gerando ' + (i + 1) + ' de ' + list.length;
        let bitmap;
        try { bitmap = await bitmapOf(item); } catch (_) { failed.push(item.file + ' (imagem ilegível)'); continue; }
        const kind = kindFor(bitmap, item.view && item.view.r), frame = frameOf(kind);
        if (!frame) { failed.push(item.file + (enabledKinds().includes(kind) ? ' (falta a moldura em ' + kind + ')' : ' (o formato ' + kind + ' está desligado na etapa 1)')); bitmap.close(); continue; }
        const rec = s.rec, canvas = compose(frame, effCfg(kind), bitmap, rec, 1, item.view);
        bitmap.close();
        let name = item.key + '-' + (slug(rec.nome) || 'desenho'); used[name] = (used[name] || 0) + 1; if (used[name] > 1) name += '-' + used[name];
        if (wantPng) out.file((wantPdf ? 'png/' : '') + name + '.png', await new Promise(ok => canvas.toBlob(ok, 'image/png')));
        if (wantPdf) {
          const pdf = new window.jspdf.jsPDF({ unit: 'px', format: [frame.w, frame.h], orientation: frame.w > frame.h ? 'l' : 'p', hotfixes: ['px_scaling'], compress: true });
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, frame.w, frame.h);
          out.file((wantPng ? 'pdf/' : '') + name + '.pdf', pdf.output('blob'));
        }
      }
      if (failed.length) out.file('nao-gerados.txt', failed.join('\n'));
      st.textContent = 'Compactando';
      download(await out.generateAsync({ type: 'blob' }), 'molduras.zip');
      st.textContent = failed.length ? (list.length - failed.length) + ' gerados, ' + failed.length + ' não gerados (veja nao-gerados.txt no ZIP)' : list.length + ' gerados';
    } catch (e) { st.textContent = 'Erro ao gerar: ' + e.message; }
    btn.disabled = false;
  }

  // ---------- eventos ----------
  KINDS.forEach(k => $('file' + (k === 'retrato' ? 'Retrato' : 'Paisagem')).addEventListener('change', e => { uploadFrame(k, e.target.files[0]); e.target.value = ''; }));
  $('fileSheet').addEventListener('change', e => { if (e.target.files[0]) readSheet(e.target.files[0]); e.target.value = ''; });
  $('fileZip').addEventListener('change', e => { if (e.target.files[0]) readZip(e.target.files[0]); e.target.value = ''; });
  $('mgKind').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setKind(b.dataset.kind); });
  $('mgSlotsWrap').addEventListener('click', e => {
    const cfgBtn = e.target.closest('[data-cfg]'), pick = e.target.closest('[data-slot]');
    if (cfgBtn) openCfg(cfgBtn.dataset.cfg);
    else if (pick) { if (draft) closeCfg(); state.cfg[state.kind].slot = pick.dataset.slot; syncControls(); renderPreview(); } // em uso agora; não é salvo (o padrão é que vale ao abrir)
    else if (e.target.closest('#mgAddSlot')) {
      const c = state.cfg[state.kind]; let n = 2; while (c.slots['x' + n]) n++;
      openCfg('x' + n, true);
    }
  });
  $('mgName').addEventListener('input', e => setDraft({ name: e.target.value.slice(0, 12) }));
  $('mgDefault').addEventListener('change', e => { draft.makeDefault = e.target.checked; fillCfg(); });
  $('mgCfgDelete').addEventListener('click', deleteSlot);
  $('mgFormats').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.formats === state.formats) return;
    draft = null; showCfg(false); state.formats = b.dataset.formats; applyFormats(); saveCfg();
  });
  $('mgFont').addEventListener('change', e => setDraft({ font: e.target.value }));
  $('mgColor').addEventListener('input', e => setDraft({ color: e.target.value }));
  $('mgAccent').addEventListener('input', e => setDraft({ accent: e.target.value }));
  $('mgTag').addEventListener('input', e => setDraft({ tag: e.target.value }));
  $('mgSize').addEventListener('input', e => setDraft({ size: +e.target.value }));
  $('mgX').addEventListener('input', e => setDraft({ x: +e.target.value }));
  $('mgY').addEventListener('input', e => setDraft({ y: +e.target.value }));
  // porcentagem digitada: vale na hora (limitada a 0-100) e o campo se acerta ao sair
  ['X', 'Y'].forEach(a => {
    const num = $('mg' + a + 'Num'), key = a.toLowerCase();
    num.addEventListener('input', () => { const v = parseFloat(num.value); if (!isNaN(v)) setDraft({ [key]: Math.min(100, Math.max(0, v)) }); });
    num.addEventListener('change', () => { if (draft) num.value = draft.vals[key].toFixed(1); });
  });
  $('mgFit').addEventListener('change', e => setDraft({ fit: e.target.value }));
  $('mgAlign').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDraft({ align: b.dataset.align }); });
  $('mgCfgSave').addEventListener('click', saveDraft);
  $('mgCfgCancel').addEventListener('click', closeCfg);
  $('mgCfg').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeCfg(); } });
  // arrastar na prévia move o texto: no rascunho aberto, ou na posição ativa
  (function () {
    const cv = $('mgPreview'); let on = false;
    const move = e => {
      const r = cv.getBoundingClientRect(), f = v => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
      const pos = { x: f((e.clientX - r.left) / r.width * 100), y: f((e.clientY - r.top) / r.height * 100) };
      if (draft) setDraft(pos); else { const c = state.cfg[state.kind]; Object.assign(c.slots[c.slot], pos); renderPreview(); saveCfg(); }
    };
    cv.addEventListener('pointerdown', e => { on = true; cv.setPointerCapture(e.pointerId); move(e); });
    cv.addEventListener('pointermove', e => { if (on) move(e); });
    ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { on = false; }));
  })();
  $('mgCopy').addEventListener('click', () => {
    const to = state.kind === 'retrato' ? 'paisagem' : 'retrato';
    state.cfg[to] = JSON.parse(JSON.stringify(state.cfg[state.kind]));
    saveCfg(); $('mgCopy').textContent = 'Copiado para ' + to; setTimeout(() => { $('mgCopy').textContent = 'Copiar ajustes para a outra moldura'; }, 1800);
  });
  $('mgExport').addEventListener('click', exportAll);

  // ---------- início ----------
  (async function init() {
    showCfg(false); applyFormats(); refreshAll();
    try {
      const m = await fb(), saved = await m.readMoldurasCfg(); state.cfgOk = true; // só salva depois de ler: senão gravaria os padrões por cima do que a equipe configurou
      KINDS.forEach(k => { state.cfg[k] = mergeCfg(k, saved[k]); });
      if (['paisagem', 'retrato', 'ambos'].includes(saved.formats)) state.formats = saved.formats;
      const wrong = [];
      for (const k of KINDS) { const url = await m.readMoldura(k); if (url) { try { await setFrame(k, url); } catch (e) { if (!e.format) throw e; wrong.push(k); } } }
      const have = enabledKinds().filter(k => state.frames[k]);
      $('mgFramesState').textContent = wrong.length ? 'A moldura salva em ' + wrong.join(' e ') + ' tem o formato trocado e foi ignorada: envie de novo' : have.length ? 'Molduras salvas: ' + have.join(' e ') : 'Nenhuma moldura salva';
    } catch (e) { $('mgFramesState').textContent = 'Não foi possível carregar as molduras salvas'; }
    applyFormats(); loadLotes();
  })();
})();
