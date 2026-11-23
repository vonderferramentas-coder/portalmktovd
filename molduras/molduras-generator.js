/**
 * Gerador de Molduras (molduras-generator.html), tela só do Admin.
 * Fluxo: molduras PNG (retrato e paisagem, salvas no Firebase) + planilha dos filhos + ZIP de desenhos (nome do arquivo = matrícula)
 * -> cada desenho entra no miolo transparente da moldura certa, com o texto "Nome, idade, filho(a) de Colaborador" num canto.
 * Planilha e desenhos têm dados de crianças (LGPD): são lidos só no navegador e nunca enviados a servidor.
 * Única exceção, autorizada pelo Grupo OVD: as decisões da etapa 3 (filho escolhido pelo nome, textos editados) ficam em `molduras/work` no Firestore.
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
    filter: 'all',      // lista de desenhos: 'all' | 'pending'
    items: [],          // desenhos do ZIP: { id, file, key, key0, entry, choice, skip, over, view }; over = texto editado à mão, view = zoom/posição/giro
    work: {},           // trabalho salvo no Firestore, por nome de arquivo: { k, c (nome do filho), o, v, s }
    cfgOk: false,
    workOk: false       // só salva depois de ler o que já estava salvo (senão apagaria o trabalho de outra pessoa)
  };

  // ---------- utilitários ----------
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const titleCase = s => String(s).trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i && PARTICLES.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const keyOf = v => { const t = String(v == null ? '' : v).trim().replace(/\.0+$/, '').toUpperCase(); return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t; };
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
  async function readSheet(file) {
    const st = $('sheetState');
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
      state.index = index; resolveKids();
      st.textContent = kids + ' filhos de ' + index.size + ' colaboradores';
      ed.item = null; refreshAll();
    } catch (e) { state.index = null; st.textContent = e.message; refreshAll(); }
  }

  // ---------- ZIP de desenhos ----------
  // ---------- trabalho salvo (continuar depois ou por outra pessoa) ----------
  let workP;
  const ensureWork = () => workP || (workP = fbw().then(m => m.readMoldurasWork()).then(v => { state.work = v.items || {}; state.workOk = true; $('mgWorkState').textContent = ''; })
    .catch(() => { workP = null; $('mgWorkState').textContent = 'Não foi possível carregar o trabalho salvo; as alterações não serão salvas'; }));
  // devolve a decisão guardada de um desenho (ou null se ele está como veio do ZIP)
  const workOf = item => {
    const kids = (state.index && state.index.get(item.key)) || [], kid = item.choice != null ? kids[item.choice] : null;
    const e = { k: item.key !== item.key0 ? item.key : undefined, c: kid ? kid.nome : item.wKid || undefined, o: item.over || undefined, v: item.view || undefined, s: item.skip ? 1 : undefined };
    Object.keys(e).forEach(k => e[k] === undefined && delete e[k]);
    return Object.keys(e).length ? e : null;
  };
  function resolveKids() { // o filho salvo é guardado pelo nome; vira posição quando a planilha chega
    if (!state.index) return;
    state.items.forEach(it => { if (it.wKid == null) return; const i = ((state.index.get(it.key)) || []).findIndex(k => k.nome === it.wKid); if (i >= 0) { it.choice = i; it.wKid = null; } });
  }
  function applyWork() {
    let n = 0;
    state.items.forEach(it => {
      const e = state.work[it.file]; if (!e) return; n++;
      if (e.k) it.key = e.k; if (e.o) it.over = e.o; if (e.v) it.view = e.v; if (e.s) it.skip = true; if (e.c) it.wKid = e.c;
    });
    resolveKids();
    if (n) $('mgWorkState').textContent = 'Trabalho salvo retomado em ' + n + (n === 1 ? ' desenho' : ' desenhos');
  }
  const saveWork = debounce(() => {
    if (!state.workOk || !state.items.length) return;
    state.items.forEach(it => { const e = workOf(it); if (e) state.work[it.file] = e; else delete state.work[it.file]; });
    fbw().then(m => m.writeMoldurasWork({ items: state.work })).then(() => { $('mgWorkState').textContent = 'Trabalho salvo'; }).catch(() => { $('mgWorkState').textContent = 'Não foi possível salvar o trabalho'; });
  }, 1200);
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
  async function readZip(file) {
    const st = $('zipState');
    try {
      await PortalShell.loadScript('vendor/jszip.min.js');
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(e => {
        const base = e.name.split('/').pop();
        return !e.dir && !/(^|\/)__MACOSX\//.test(e.name) && !base.startsWith('.') && (IMG_EXT.test(base) || PDF_EXT.test(base));
      });
      const items = [], unreadable = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i], name = entry.name.split('/').pop(), stem = name.replace(/\.[^.]+$/, ''), m = stem.match(/^\s*(\d+)/), key = keyOf(m ? m[1] : stem);
        if (!PDF_EXT.test(name)) { items.push({ id: items.length, file: name, key, key0: key, entry, choice: null, skip: false }); continue; }
        st.textContent = 'Lendo PDF ' + (i + 1) + ' de ' + entries.length;
        try { (await openPdf(entry)).destroy(); } catch (_) { unreadable.push(name); continue; } // confere que o PDF abre
        items.push({ id: items.length, file: name, key, key0: key, entry, page: 1, choice: null, skip: false });
      }
      await ensureWork();
      state.items = items; ed.item = null; applyWork();
      st.textContent = (items.length ? items.length + ' desenhos' : 'Nenhuma imagem ou PDF encontrado no ZIP') + (unreadable.length ? '. ' + unreadable.length + ' PDF(s) não puderam ser lidos: ' + unreadable.slice(0, 3).join(', ') + (unreadable.length > 3 ? '…' : '') : '');
      refreshAll();
    } catch (e) { state.items = []; st.textContent = 'Não foi possível ler o ZIP: ' + e.message; refreshAll(); }
  }
  const blobOf = item => item.page ? renderPdfPage(item) : item.entry.async('blob').then(b => new Blob([b], { type: /\.png$/i.test(item.file) ? 'image/png' : /\.webp$/i.test(item.file) ? 'image/webp' : 'image/jpeg' }));
  const bitmapOf = async item => createImageBitmap(await blobOf(item), { imageOrientation: 'from-image' });

  // ---------- cruzamento ----------
  function statusOf(item) {
    const kids = (state.index && state.index.get(item.key)) || [];
    if (item.skip) return { s: 'skip', kids };
    if (item.over) return { s: 'ok', kids, kid: item.choice != null ? kids[item.choice] : kids.length === 1 ? kids[0] : null, rec: item.over }; // texto editado à mão
    if (!kids.length) return { s: 'missing', kids };
    if (kids.length === 1) return { s: 'ok', kids, kid: kids[0], rec: recOf(kids[0]) };
    if (item.choice == null) return { s: 'choose', kids };
    return { s: 'ok', kids, kid: kids[item.choice], rec: recOf(kids[item.choice]) };
  }

  const STATUS_LABEL = { ok: 'Pronto', choose: 'Escolher o filho', missing: 'Matrícula não encontrada', skip: 'Descartado' };
  const textOf = (item, st) => { const r = st.rec; return r ? r.nome + (r.idade ? ', ' + r.idade : '') + ', filho(a) de ' + r.colab : 'Matrícula ' + item.key; };
  const badgeOf = (item, st) => { const warn = st.s === 'choose' || st.s === 'missing'; return warn || st.s === 'skip' ? '<span class="mg-badge' + (warn ? ' is-warn' : '') + '">' + STATUS_LABEL[st.s] + '</span>' : (item.over || item.view ? '<span class="mg-badge">Editado</span>' : ''); };
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
    $('mgExportRow').hidden = !ready; $('mgWorkClear').hidden = !ready;
    $('mgResultCount').textContent = ready ? sts.length + ' desenhos, ' + oks.length + ' prontos' + (pending.length ? ', ' + pending.length + (pending.length === 1 ? ' pendente' : ' pendentes') : '') : '';
    $('mgExport').disabled = !oks.length || !!pending.length;
    $('mgFilterPending').textContent = 'Pendentes (' + pending.length + ')';
    return { ready, sts, pending };
  }
  // os campos de edição são um só elemento que mora na linha selecionada; antes de refazer a lista ele sai para um depósito para não ser destruído
  const attachFields = () => { const row = document.querySelector('#mgResultList .mg-qrow.is-sel'); if (row) row.querySelector('.mg-qinner').appendChild($('mgEdFields')); };
  function refreshAll() {
    const { ready, sts, pending } = summary();
    $('mgEmpty').hidden = ready; $('mgWork').hidden = !ready;
    if (!ready) { // os desenhos vêm do ZIP: sem ele (ou sem a planilha) não há o que conferir
      const noSheet = !state.index, noZip = !state.items.length;
      $('mgEmpty').textContent = noSheet && noZip ? 'Envie a planilha e o ZIP com os desenhos na etapa 2. Cada desenho aparece aqui, um a um, para você conferir e editar.'
        : noZip ? 'A planilha já foi lida. Falta enviar o ZIP com os desenhos na etapa 2: eles aparecem aqui, um a um, para você conferir e editar.'
        : 'Os desenhos já foram lidos. Falta enviar a planilha na etapa 2 para cruzar as matrículas.';
      ed.item = null; return;
    }
    document.querySelectorAll('#mgFilter button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
    $('mgEdHold').appendChild($('mgEdFields'));
    $('mgResultList').innerHTML = (state.filter === 'pending' ? pending : sts).map(rowOf).join('') || '<p class="mg-empty-state">Nenhum desenho pendente</p>';
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
  $('edIdade').addEventListener('input', () => { drawEditor(); scheduleCommit(); });

  // grava o que está nos campos no desenho (adiado 250 ms para juntar teclas e arrastos; trocar de desenho grava antes)
  let commitTimer = 0;
  const scheduleCommit = () => { clearTimeout(commitTimer); commitTimer = setTimeout(() => { commitTimer = 0; commit(); }, 250); };
  const flushCommit = () => { if (commitTimer) { clearTimeout(commitTimer); commitTimer = 0; commit(); } };
  function commit() {
    const it = ed.item; if (!it) return;
    const kids = (state.index && state.index.get(it.key)) || [], cur = edRec(), kid = ed.kidIdx != null ? kids[ed.kidIdx] : null, base = kid ? recOf(kid) : null;
    it.choice = ed.kidIdx;
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
  async function selectItem(item, keep) {
    flushCommit();
    if (!keep) { ed.open = false; ed.adjust = false; }
    if (ed.bitmap) ed.bitmap.close();
    const st = statusOf(item), kids = st.kids || [];
    ed.item = item; ed.view = { ...(item.view || DEFAULT_VIEW) }; ed.view.z = Math.max(1, ed.view.z); ed.fail = false; ed.bitmap = null; ed.frame = null;
    $('mgEd').hidden = false; $('mgDetailEmpty').hidden = true;
    $('edKey').value = item.key;
    $('edKidWrap').hidden = !kids.length;
    const idx = item.choice != null ? item.choice : kids.length === 1 ? 0 : null;
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
  function drawEditor() { // adia o desenho para juntar vários eventos seguidos (arrastar, digitar)
    if (!ed.item || ed.timer) return;
    ed.timer = setTimeout(async () => {
      ed.timer = 0; if (!ed.item) return;
      const c = $('edCanvas'), hint = $('edHint');
      if (!ed.bitmap || !ed.frame) { c.hidden = true; hint.textContent = ed.fail ? 'Não foi possível abrir esta imagem' : ed.bitmap ? 'Falta a moldura em ' + ed.kind + '. Envie-a na etapa 1' : 'Carregando'; return; }
      c.hidden = false; await fontsReady(ed.kind);
      if (!ed.item) return;
      const r = edRec(), kids = (state.index && state.index.get(ed.item.key)) || [], provisional = !(r.nome && r.colab) && ed.kidIdx == null && kids.length > 1;
      const rec = r.nome && r.colab ? r : provisional ? recOf(kids[0]) : null; // sem filho escolhido, a prévia usa o primeiro da planilha só para mostrar a tag
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
  $('edReset').addEventListener('click', () => { ed.view = { ...DEFAULT_VIEW }; if (ed.bitmap) { ed.kind = kindFor(ed.bitmap, 0); ed.frame = frameOf(ed.kind); } syncZoom(); drawEditor(); scheduleCommit(); });
  const rotate = d => { // gira 90°; com os dois formatos ligados o desenho passa para a moldura do outro formato
    if (!ed.item) return;
    ed.view.r = ((ed.view.r || 0) + d + 4) % 4; ed.view.x = ed.view.y = 0;
    if (ed.bitmap) { ed.kind = kindFor(ed.bitmap, ed.view.r); ed.frame = frameOf(ed.kind); }
    drawEditor(); scheduleCommit();
  };
  $('edRotL').addEventListener('click', () => rotate(-1)); $('edRotR').addEventListener('click', () => rotate(1));
  $('edKid').addEventListener('change', e => {
    const i = e.target.value === '' ? null : +e.target.value;
    if (i == null) { ed.kidIdx = null; ed.nomeFull = ed.colabFull = ''; $('edNome').value = $('edIdade').value = $('edColab').value = ''; } else loadKid(i);
    renderChips($('edNomeChips'), ed.nomeFull, $('edNome')); renderChips($('edColabChips'), ed.colabFull, $('edColab')); drawEditor(); scheduleCommit();
  });
  $('edKeyGo').addEventListener('click', () => { // corrige a matrícula do arquivo e cruza de novo com a planilha
    const it = ed.item, k = keyOf($('edKey').value); if (!it || !k) return;
    const keep = ed.open; flushCommit(); it.key = k; it.choice = null; it.over = null; ed.item = null; refreshAll(); ed.open = keep; selectItem(it, true); saveWork();
  });
  $('edSkip').addEventListener('click', () => { const it = ed.item; if (!it) return; it.skip = !it.skip; $('edSkip').textContent = it.skip ? 'Restaurar desenho' : 'Descartar desenho'; refreshAll(); saveWork(); });
  $('mgWorkClear').addEventListener('click', () => { // apaga as decisões salvas (de todos os desenhos) e volta ao que veio do ZIP e da planilha
    if (!confirm('Apagar todos os ajustes salvos (filhos escolhidos, textos, zoom, giro e descartados)? Isso vale para todos os administradores.')) return;
    state.items.forEach(it => { it.key = it.key0; it.choice = null; it.wKid = null; it.over = null; it.view = null; it.skip = false; });
    state.work = {}; ed.item = null; refreshAll();
    fbw().then(m => m.writeMoldurasWork({ items: {} })).then(() => { $('mgWorkState').textContent = 'Ajustes salvos apagados'; }).catch(() => { $('mgWorkState').textContent = 'Não foi possível apagar o trabalho salvo'; });
  });
  $('mgResultList').addEventListener('click', e => {
    const b = e.target.closest('.mg-qhead, .mg-qedit'), r = b && b.closest('.mg-qrow'); if (!r) return;
    const it = state.items.find(x => x.id === +r.dataset.id); if (!it) return;
    const same = it === ed.item; if (!same) selectItem(it);
    if (b.classList.contains('mg-qedit')) { ed.open = same ? !ed.open : true; markSel(); } // o lápis abre ou fecha a edição
    else if (same && ed.open) { ed.open = false; markSel(); } // clicar de novo no topo da linha aberta fecha
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
      $('mgFrames').open = have.length < enabledKinds().length; // configuração pronta: recolhe e deixa o fluxo do dia a dia em foco
    } catch (e) { $('mgFramesState').textContent = 'Não foi possível carregar as molduras salvas'; }
    applyFormats();
  })();
})();
