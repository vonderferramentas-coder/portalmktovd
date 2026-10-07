(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const M = window.ConsolidadoModel;
  const INDEX_KEY = 'consolidado-index-v1';
  const ITEM_KEY = 'consolidado-v1-';
  const state = { items: [], original: null, texts: {}, edited: false, sheetName: '', saved: [], indexVersion: 0, id: '', version: 0, createdAt: 0, sourceName: '', workbook: null, dirty: false };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 3600);
  }
  function monthValue() { return $('consolidadoMonth').value; }
  function generatedTitle(value = monthValue()) { return 'Consolidado ' + (M.monthLabel(value) || 'mensal'); }
  function validLink(value) { try { const url = new URL(String(value)); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
  function markDirty() { state.dirty = true; state.edited = true; $('saveConsolidado').disabled = !state.items.length; }
  const noLinkItems = () => state.items.filter(item => !validLink(item.link));
  function setEditorStatus() { $('editorStatus').textContent = state.items.length ? state.items.length + ' produtos (' + state.items.filter(item => item.multi).length + ' em Multimarcas) · ' + noLinkItems().length + ' sem link.' : 'Importe a planilha ou comece do zero para adicionar produtos.'; }

  function showLibrary() {
    $('libraryView').hidden = false; $('editorView').hidden = true; state.dirty = false; renderLibrary();
  }
  function showEditor() { $('libraryView').hidden = true; $('editorView').hidden = false; }
  function resetEditor() {
    const now = new Date();
    state.items = []; state.original = null; state.texts = {}; state.edited = false; state.id = ''; state.version = 0; state.createdAt = 0; state.sourceName = ''; state.workbook = null; state.dirty = false;
    $('consolidadoMonth').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    $('consolidadoTitle').value = generatedTitle(); $('editorHeading').textContent = 'Novo consolidado'; $('sheetFile').value = ''; $('sheetField').hidden = true;
    $('sheetDropzone').classList.remove('is-dragover'); renderAll();
  }

  function renderLibrary() {
    $('libraryCount').textContent = state.saved.length;
    if (!state.saved.length) {
      $('savedConsolidados').innerHTML = '<div class="empty-library"><strong>Nenhum consolidado salvo</strong>Crie o primeiro a partir da planilha mensal.</div>';
      return;
    }
    $('savedConsolidados').innerHTML = state.saved.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(item => '<article class="saved-card"><div><h3>' + esc(item.title) + '</h3><div class="saved-meta"><span>' + esc(M.monthLabel(item.month)) + '</span><span>' + item.itemCount + ' produtos</span><span>Atualizado em ' + new Date(item.updatedAt).toLocaleString('pt-BR') + '</span></div></div><div class="saved-actions"><button type="button" class="btn small" data-open="' + esc(item.id) + '">Abrir</button><button type="button" class="btn ghost danger small" data-delete="' + esc(item.id) + '" aria-label="Excluir ' + esc(item.title) + '">Excluir</button></div></article>').join('');
    $('savedConsolidados').querySelectorAll('[data-open]').forEach(button => button.onclick = () => openSaved(button.dataset.open));
    $('savedConsolidados').querySelectorAll('[data-delete]').forEach(button => button.onclick = () => deleteSaved(button.dataset.delete));
  }

  async function loadSaved() {
    try {
      const record = await SyncBackend.get(INDEX_KEY); state.saved = Array.isArray(record.v) ? record.v : []; state.indexVersion = record.updated_at || 0;
    } catch (_) { state.saved = []; toast('Não foi possível carregar os consolidados salvos.'); }
    renderLibrary();
  }

  function photoView(item) {
    const view = item.photoView || (item.photoView = { x: 0, y: 0, scale: 1 });
    view.x = Number.isFinite(+view.x) ? +view.x : 0; view.y = Number.isFinite(+view.y) ? +view.y : 0; view.scale = Math.max(.2, Math.min(3, Number.isFinite(+view.scale) ? +view.scale : 1));
    return view;
  }
  function photoTransform(item) { const view = photoView(item); return 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')'; }
  const svg = body => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const ICONS = {
    layers: svg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    star: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    refresh: svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
    kebab: svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>')
  };
  // Textos editáveis com Negrito/Itálico/Sublinhado (cartaz-title-format.js); o HTML editado fica em item.*Html / state.texts
  const EDIT = ' contenteditable="true" spellcheck="false"', FMT = { always: true, keepBr: true, keepStrong: true };
  const HEAD_ART = '<svg class="consolidado-head-art" viewBox="0 0 800 184" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="#1c2326"/><stop offset=".45" stop-color="#4b5a60"/><stop offset="1" stop-color="#1c2326"/></linearGradient></defs><rect width="800" height="184" fill="#fcbc00"/><rect y="13" width="800" height="57" fill="url(#hg)"/><rect y="80" width="800" height="104" fill="#e4e4e4"/></svg><img class="consolidado-head-plate" src="consolidado-assets/faixa-intro.png" alt="">';
  const rich = (html, fallback) => html ? CartazTitleFormat.clean(html, FMT) : fallback;
  // Ordem e largura dos produtos de um bloco: os marcados como destaque ocupam a linha toda e os demais se reorganizam em pares.
  // Se não houver outro pequeno para fazer par, o produto fica sozinho com o espaço ao lado vazio. ponytail: puxa o próximo pequeno para a vaga, sem outras otimizações.
  function layout(list) {
    const rest = list.slice(), out = []; let pending = null;
    while (rest.length) {
      const item = rest.shift();
      if (item.wide) {
        if (pending) { const next = rest.findIndex(entry => !entry.wide); if (next >= 0) out.push({ item: pending }, { item: rest.splice(next, 1)[0] }); else out.push({ item: pending }); pending = null; }
        out.push({ item, wide: true });
      } else if (pending) { out.push({ item: pending }, { item }); pending = null; } else pending = item;
    }
    if (pending) out.push({ item: pending });
    return out;
  }
  function cardHtml(item, index, wide) {
    const firstCode = item.rows[0]?.code || '';
    const codeText = item.rows.length > 1 ? 'Consulte códigos' : (firstCode ? M.formatCode(firstCode) : '');
    const photo = item.photo || M.photoUrl(firstCode);
    const link = validLink(item.link);
    return '<article class="consolidado-card' + (wide ? ' wide' : '') + '" data-item-id="' + esc(item.id) + '" data-link="' + esc(link) + '"><h3 class="consolidado-card-title"' + EDIT + ' data-fmt="titleHtml">' + rich(item.titleHtml, esc(item.title)) + '</h3><span class="consolidado-code"' + EDIT + ' data-fmt="codeHtml">' + rich(item.codeHtml, esc(codeText)) + '</span><div class="consolidado-photo" style="transform:' + photoTransform(item) + '"><img crossorigin="anonymous" src="' + esc(photo) + '" alt=""><span class="photo-fallback">Foto indisponível</span></div><div class="consolidado-link' + (link ? '' : ' missing') + '"><img class="link-icon" src="consolidado-assets/icone-link.png" alt=""><span' + EDIT + ' data-fmt="ctaHtml">' + rich(item.ctaHtml, 'CLIQUE AQUI PARA VISUALIZAR<br>O INFORMATIVO COMPLETO') + '</span></div></article>';
  }

  function pageHtml(items) {
    const vonder = items.filter(item => !item.multi), multi = items.filter(item => item.multi);
    const grid = list => layout(list).map((entry, index) => cardHtml(entry.item, index, entry.wide)).join('');
    const month = (M.monthLabel(monthValue()) || 'MÊS E ANO').toUpperCase();
    const ovdLogo = window.OVD_BRAND_LOGOS && window.OVD_BRAND_LOGOS['OVD - Grupo_amarelo'];
    const vonderLogo = window.OVD_BRAND_LOGOS && window.OVD_BRAND_LOGOS.VONDER_TIP_PTO;
    return '<section class="consolidado-page"><header class="consolidado-page-head"><div class="consolidado-page-title"' + EDIT + ' data-fmt="title">' + rich(state.texts.title, 'Informativo Mensal Consolidado de Lançamentos - <strong>' + esc(month) + '</strong>') + '</div><div class="consolidado-ovd">' + (ovdLogo ? '<img src="' + esc(ovdLogo) + '" alt="Grupo OVD">' : 'Grupo OVD') + '</div>' + HEAD_ART + '<div class="consolidado-intro"' + EDIT + ' data-fmt="intro">' + rich(state.texts.intro, 'Confira todos os produtos lançados em ' + esc(month.toLowerCase()) + ' em um único informativo, para<br>facilitar sua busca e reforçar a disponibilidade de comercialização!') + '</div></header><div class="consolidado-brand">' + (vonderLogo ? '<img src="' + esc(vonderLogo) + '" alt="VONDER">' : 'VONDER') + '</div><div class="consolidado-grid">' + grid(vonder) + '</div>' + (multi.length ? '<div class="consolidado-multi"><h2 class="consolidado-multi-title">MULTIMARCAS</h2><div class="consolidado-grid">' + grid(multi) + '</div></div>' : '') + '<div class="consolidado-foot"></div></section>';
  }

  function bindImageFallbacks(root) {
    root.querySelectorAll('.consolidado-photo img').forEach(image => {
      const fallback = image.nextElementSibling;
      image.onload = () => { image.style.display = ''; fallback.style.display = 'none'; };
      image.onerror = () => { image.style.display = 'none'; fallback.style.display = 'block'; };
      if (image.complete) image.naturalWidth ? image.onload() : image.onerror();
    });
  }

  function bindTextEditing(root) {
    root.querySelectorAll('[contenteditable][data-fmt]').forEach(el => {
      el.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
      el.oninput = () => {
        const key = el.dataset.fmt, html = CartazTitleFormat.sanitize(el, FMT), card = el.closest('.consolidado-card');
        if (card) {
          const item = state.items.find(entry => entry.id === card.dataset.itemId); if (!item) return; item[key] = html;
          if (key === 'titleHtml') { item.title = el.textContent.replace(/\s+/g, ' ').trim(); const setting = document.querySelector('[data-setting-id="' + item.id + '"]'); if (setting) { setting.querySelector('[data-title]').value = item.title; setting.querySelector('.square-summary strong').textContent = item.title; } }
        } else { state.texts[key] = html; root.querySelectorAll('[data-fmt="' + key + '"]').forEach(other => { if (other !== el) other.innerHTML = html; }); }
        markDirty();
      };
    });
  }
  function bindPhotoEditing(root) {
    bindTextEditing(root);
    root.querySelectorAll('.consolidado-photo').forEach(photo => {
      const card = photo.closest('.consolidado-card'), item = state.items.find(entry => entry.id === card.dataset.itemId); if (!item) return;
      const apply = () => { photo.style.transform = photoTransform(item); };
      photo.ondblclick = event => { event.preventDefault(); root.querySelectorAll('.consolidado-photo.photo-editing').forEach(entry => { if (entry !== photo) entry.classList.remove('photo-editing'); }); photo.classList.toggle('photo-editing'); toast(photo.classList.contains('photo-editing') ? 'Foto selecionada: arraste para mover e use a roda do mouse para redimensionar.' : 'Edição da foto concluída.'); };
      photo.onwheel = event => { if (!photo.classList.contains('photo-editing')) return; event.preventDefault(); const view = photoView(item); view.scale = Math.max(.2, Math.min(3, view.scale + (event.deltaY < 0 ? .1 : -.1))); apply(); markDirty(); };
      photo.onpointerdown = event => { if (!photo.classList.contains('photo-editing')) return; event.preventDefault(); const view = photoView(item), startX = event.clientX, startY = event.clientY, originX = view.x, originY = view.y; photo.setPointerCapture(event.pointerId); photo.onpointermove = move => { view.x = originX + move.clientX - startX; view.y = originY + move.clientY - startY; apply(); }; photo.onpointerup = photo.onpointercancel = () => { photo.onpointermove = photo.onpointerup = photo.onpointercancel = null; markDirty(); }; };
    });
  }

  // Reordenar arrastando o ícone de três linhas (pointer events): um "cartão fantasma" segue o mouse, o lugar vazio (tracejado) mostra onde o produto vai
  // cair e os vizinhos deslizam (FLIP). Dá para soltar nas duas seções (VONDER / Multimarcas); soltar em outra seção troca a marca do produto.
  function bindReorder() {
    const root = $('squareList'), panel = root.closest('.square-settings');
    root.querySelectorAll('.drag-handle').forEach(handle => {
      handle.onclick = event => event.preventDefault();
      handle.onpointerdown = event => {
        if (event.button) return; event.preventDefault();
        const card = handle.closest('.square-item'); card.open = false;
        const box = card.getBoundingClientRect(), grabX = event.clientX - box.left, grabY = event.clientY - box.top;
        const ghost = card.cloneNode(true); ghost.classList.add('drag-ghost'); ghost.style.cssText = 'left:' + box.left + 'px;top:' + box.top + 'px;width:' + box.width + 'px';
        document.body.appendChild(ghost); card.classList.add('drag-placeholder');
        let pointerX = event.clientX, pointerY = event.clientY, scrollSpeed = 0, frame = 0, ended = false;
        const lists = [...root.querySelectorAll('.square-items')];
        const place = () => {
          const target = lists.find(list => { const area = list.parentElement.getBoundingClientRect(); return pointerY >= area.top && pointerY <= area.bottom; }) || card.parentElement;
          const others = [...target.querySelectorAll('.square-item')].filter(entry => entry !== card);
          const before = others.find(entry => { const r = entry.getBoundingClientRect(); return pointerY < r.top + r.height / 2; }) || null;
          if (card.parentElement === target && card.nextElementSibling === before) return;
          const first = new Map([...root.querySelectorAll('.square-item')].map(entry => [entry, entry.getBoundingClientRect().top]));
          target.insertBefore(card, before);
          first.forEach((top, entry) => { const shift = top - entry.getBoundingClientRect().top; if (!shift || entry === card) return; entry.style.transition = 'none'; entry.style.transform = 'translateY(' + shift + 'px)'; requestAnimationFrame(() => { entry.style.transition = 'transform .18s ease'; entry.style.transform = ''; }); });
        };
        const tick = () => { if (ended) return; if (scrollSpeed) { panel.scrollTop += scrollSpeed; place(); } frame = requestAnimationFrame(tick); };
        const onMove = move => {
          pointerX = move.clientX; pointerY = move.clientY; ghost.style.transform = 'translate(' + (pointerX - grabX - box.left) + 'px,' + (pointerY - grabY - box.top) + 'px) scale(1.02)';
          const area = panel.getBoundingClientRect(); scrollSpeed = pointerY < area.top + 48 ? -8 : pointerY > area.bottom - 48 ? 8 : 0; place();
        };
        const finish = commit => {
          if (ended) return; ended = true; cancelAnimationFrame(frame); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel);
          const slot = card.getBoundingClientRect(); ghost.style.transition = 'transform .16s ease, opacity .16s ease';
          ghost.style.transform = 'translate(' + (slot.left - box.left) + 'px,' + (slot.top - box.top) + 'px)'; ghost.style.opacity = '.6';
          setTimeout(() => {
            ghost.remove(); card.classList.remove('drag-placeholder');
            if (!commit) { renderSettings(); return; }
            const byId = new Map(state.items.map(item => [item.id, item])), read = group => [...root.querySelectorAll('.square-items[data-group="' + group + '"] .square-item')].map(entry => byId.get(entry.dataset.settingId));
            const before = state.items.map(item => item.id + item.multi).join(), vonder = read('vonder'), multi = read('multi');
            vonder.forEach(item => { item.multi = false; }); multi.forEach(item => { item.multi = true; }); state.items = [...vonder, ...multi];
            if (state.items.map(item => item.id + item.multi).join() !== before) markDirty();
            renderAll();
          }, 170);
        };
        const onUp = () => finish(true), onCancel = () => finish(false); // ouvir no document: mover o cartão no DOM solta a captura do ponteiro no ícone
        document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onCancel); tick();
      };
    });
  }
  // Menu "⋮" de cada produto (dropdown com ícone + texto), posicionado em fixed para não ser cortado pela rolagem do painel
  const photoInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png', hidden: true }); document.body.appendChild(photoInput);
  let photoTarget = null, openMenu = null;
  photoInput.onchange = async () => {
    const file = photoInput.files[0], item = photoTarget; photoInput.value = ''; if (!file || !item) return;
    try { item.photo = await compressPng(file); item.photoView = { x: 0, y: 0, scale: 1 }; renderAll(); markDirty(); toast('Foto do produto substituída.'); } catch (error) { toast(error.message); }
  };
  function closeSquareMenu() { if (!openMenu) return; openMenu.remove(); openMenu = null; document.removeEventListener('pointerdown', onMenuOutside, true); document.removeEventListener('keydown', onMenuKey, true); document.removeEventListener('scroll', closeSquareMenu, true); window.removeEventListener('resize', closeSquareMenu); }
  function onMenuOutside(event) { if (openMenu && !openMenu.contains(event.target) && !event.target.closest('.kebab')) closeSquareMenu(); }
  function onMenuKey(event) { if (event.key === 'Escape') closeSquareMenu(); }
  function openSquareMenu(button, item) {
    const same = openMenu && openMenu.dataset.for === item.id; closeSquareMenu(); if (same) return;
    const entries = [
      { icon: ICONS.layers, label: 'Multimarcas', checked: item.multi, run: () => { item.multi = !item.multi; renderAll(); markDirty(); } },
      { icon: ICONS.star, label: 'Destaque (largura total)', checked: item.wide, run: () => { item.wide = !item.wide; renderAll(); markDirty(); } },
      { icon: ICONS.upload, label: 'Substituir foto por PNG', run: () => { photoTarget = item; photoInput.click(); } },
      { icon: ICONS.refresh, label: 'Voltar à foto automática', disabled: !item.photo, run: () => { item.photo = ''; item.photoView = { x: 0, y: 0, scale: 1 }; renderAll(); markDirty(); } },
      'separator',
      { icon: ICONS.trash, label: 'Excluir produto', danger: true, run: () => { state.items = state.items.filter(entry => entry.id !== item.id); renderAll(); markDirty(); toast('Produto excluído. Use "Voltar à planilha original" para trazê-lo de volta.'); } }
    ];
    const menu = document.createElement('div'); menu.className = 'square-menu'; menu.setAttribute('role', 'menu'); menu.dataset.for = item.id;
    menu.innerHTML = entries.map((entry, index) => entry === 'separator' ? '<div class="square-menu-sep" role="separator"></div>' : '<button type="button" role="menuitem" class="square-menu-item' + (entry.danger ? ' danger' : '') + '" data-index="' + index + '"' + (entry.disabled ? ' disabled' : '') + '><span class="ico">' + entry.icon + '</span><span class="txt">' + entry.label + '</span>' + (entry.checked ? '<span class="check">' + ICONS.check + '</span>' : '') + '</button>').join('');
    menu.onclick = event => { const target = event.target.closest('.square-menu-item'); if (!target || target.disabled) return; const entry = entries[+target.dataset.index]; closeSquareMenu(); entry.run(); };
    document.body.appendChild(menu); openMenu = menu;
    const box = button.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(innerWidth - width - 8, box.right - width)) + 'px';
    menu.style.top = (box.bottom + 6 + height > innerHeight - 8 ? Math.max(8, box.top - height - 6) : box.bottom + 6) + 'px';
    document.addEventListener('pointerdown', onMenuOutside, true); document.addEventListener('keydown', onMenuKey, true); document.addEventListener('scroll', closeSquareMenu, true); window.addEventListener('resize', closeSquareMenu);
  }
  const codesInfo = item => item.rows.length ? item.rows.length + ' código(s) · foto do ' + M.formatCode(item.rows[0].code) : 'sem código';
  function renderSettings() {
    document.querySelectorAll('.drag-ghost').forEach(ghost => ghost.remove());
    const wideIds = new Set([...layout(state.items.filter(item => !item.multi)), ...layout(state.items.filter(item => item.multi))].filter(entry => entry.wide).map(entry => entry.item.id));
    const itemHtml = (item, index) => '<details class="square-item' + (wideIds.has(item.id) ? ' is-wide' : '') + '" data-setting-id="' + esc(item.id) + '"><summary><span class="square-number">' + (index + 1) + '</span><span class="square-summary"><strong>' + esc(item.title) + '</strong><small><span class="codes-info">' + esc(codesInfo(item)) + '</span>' + (wideIds.has(item.id) ? ' · largura total' : '') + '<span class="warn"' + (validLink(item.link) ? ' hidden' : '') + '> · sem link</span></small></span><button type="button" class="drag-handle" title="Arraste para reordenar" aria-label="Reordenar produto"><svg width="18" height="18" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="96" y1="176" x2="416" y2="176"/><line x1="96" y1="256" x2="416" y2="256"/><line x1="96" y1="336" x2="416" y2="336"/></svg></button><button type="button" class="kebab" aria-haspopup="menu" title="Mais ações" aria-label="Mais ações">' + ICONS.kebab + '</button></summary><div class="square-body"><label>Título do produto<textarea maxlength="150" data-title>' + esc(item.title) + '</textarea></label><label>Link do informativo<input type="url" inputmode="url" placeholder="https://..." value="' + esc(item.link) + '" data-link-input></label>' + (item.manual ? '<label>Códigos (um por linha; o primeiro define a foto)<textarea rows="3" data-codes placeholder="60.01.000.300">' + esc(item.rows.map(row => M.formatCode(row.code)).join('\n')) + '</textarea></label>' : '<div class="codes-readonly">' + item.rows.map(row => esc(M.formatCode(row.code)) + ' — ' + esc(row.title)).join('<br>') + '</div>') + '</div></details>';
    const group = (key, label, list) => '<section class="square-group"><h3 class="group-title">' + label + '<span class="count-pill">' + list.length + '</span></h3><div class="square-items" data-group="' + key + '">' + list.map(itemHtml).join('') + '</div></section>';
    $('squareList').innerHTML = group('vonder', 'VONDER', state.items.filter(item => !item.multi)) + group('multi', 'Multimarcas', state.items.filter(item => item.multi));
    bindReorder();
    $('squareList').querySelectorAll('.square-item').forEach(details => {
      const item = state.items.find(entry => entry.id === details.dataset.settingId);
      const title = details.querySelector('[data-title]');
      title.oninput = () => { item.title = title.value; delete item.titleHtml; details.querySelector('.square-summary strong').textContent = title.value; document.querySelectorAll('[data-item-id="' + item.id + '"] .consolidado-card-title').forEach(el => el.textContent = title.value); markDirty(); };
      const link = details.querySelector('[data-link-input]');
      link.oninput = () => { item.link = link.value.trim(); const card = document.querySelector('.consolidado-card[data-item-id="' + item.id + '"]'); if (card) { card.dataset.link = validLink(item.link); card.querySelector('.consolidado-link').classList.toggle('missing', !card.dataset.link); } details.querySelector('.warn').hidden = !!validLink(item.link); setEditorStatus(); markDirty(); };
      const codes = details.querySelector('[data-codes]');
      if (codes) codes.oninput = () => { item.rows = codes.value.split('\n').map(line => line.replace(/\D/g, '')).filter(Boolean).map(code => ({ code, title: '', sourceRow: 0 })); details.querySelector('.codes-info').textContent = codesInfo(item); clearTimeout(codes.timer); codes.timer = setTimeout(renderPreview, 300); markDirty(); };
      details.querySelector('.kebab').onclick = event => { event.preventDefault(); openSquareMenu(event.currentTarget, item); };
    });
  }

  function renderPreview() {

    $('pagesPreview').innerHTML = pageHtml(state.items);
    bindImageFallbacks($('pagesPreview')); bindPhotoEditing($('pagesPreview'));
  }
  // Origem dos produtos: com a lista vazia mostra a área grande de arrastar planilha + "começar do zero"; com produtos, o cartão compacto da planilha
  function renderSource() {
    const loaded = state.items.length > 0;
    $('sheetDropzone').classList.toggle('has-file', loaded); $('dzEmpty').hidden = loaded; $('dzFile').hidden = !loaded; $('startActions').hidden = loaded;
    $('fileName').textContent = state.sourceName || (state.original ? 'Planilha já importada' : 'Produtos adicionados manualmente');
  }
  function addProduct() {
    const item = { id: crypto.randomUUID(), call: '', title: 'Novo produto', rows: [], link: '', photo: '', multi: false, manual: true };
    state.items.push(item); renderAll(); markDirty();
    const details = document.querySelector('[data-setting-id="' + item.id + '"]');
    if (details) { details.open = true; details.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const title = details.querySelector('[data-title]'); title.focus(); title.select(); }
  }
  function renderAll() {
    $('workspace').hidden = !state.items.length; $('itemCount').textContent = state.items.length; $('exportPdf').disabled = !state.items.length; $('saveConsolidado').disabled = !state.items.length; $('restoreOriginal').hidden = !state.original;
    renderSource(); renderSettings(); renderPreview(); setEditorStatus();
  }

  function compressPng(file) {
    if (file.type !== 'image/png') return Promise.reject(new Error('Envie uma imagem PNG.'));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error('O PNG deve ter no máximo 12 MB.'));
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error('Não foi possível ler o PNG.'));
      reader.onload = () => { const image = new Image(); image.onerror = () => reject(new Error('O PNG não é válido.')); image.onload = () => {
        let scale = Math.min(1, 700 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); let data = '';
        for (let attempt = 0; attempt < 5; attempt++) {
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); data = canvas.toDataURL('image/webp', .8); if (data.length < 180000) break; scale *= .78;
        }
        resolve(data);
      }; image.src = reader.result; };
      reader.readAsDataURL(file);
    });
  }

  function yearFromFile(name) { return +(String(name).match(/20\d{2}/) || [new Date().getFullYear()])[0]; }
  function chooseSheet() {
    if (!state.workbook) return;
    const name = $('sheetSelect').value; const rows = XLSX.utils.sheet_to_json(state.workbook.Sheets[name], { header: 1, defval: '', raw: false });
    try {
      state.items = M.parseRows(rows); state.original = JSON.parse(JSON.stringify(state.items)); if (!state.items.length) throw new Error('Nenhum produto foi encontrado nessa aba.');
      const month = M.monthNumber(name); const year = yearFromFile(state.sourceName); if (month) $('consolidadoMonth').value = year + '-' + String(month).padStart(2, '0');
      $('consolidadoTitle').value = generatedTitle(); state.id = ''; state.version = 0; state.createdAt = 0; renderAll(); markDirty(); state.edited = false; state.sheetName = name; toast(state.items.length + ' produtos importados da aba ' + name + '.');
    } catch (error) { toast(error.message); }
  }

  async function readWorkbook(file) {
    try {
      state.sourceName = file.name; $('fileName').textContent = file.name; state.workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      $('sheetSelect').innerHTML = state.workbook.SheetNames.map(name => '<option>' + esc(name) + '</option>').join(''); $('sheetField').hidden = false;
      const wanted = +monthValue().split('-')[1]; const match = state.workbook.SheetNames.find(name => M.monthNumber(name) === wanted); $('sheetSelect').value = match || state.workbook.SheetNames[state.workbook.SheetNames.length - 1]; chooseSheet();
    } catch (error) { toast(error.message || 'Não foi possível abrir a planilha.'); }
  }

  async function saveIndex(entry) {
    let next = [entry, ...state.saved.filter(item => item.id !== entry.id)].sort((a, b) => b.updatedAt - a.updatedAt);
    let result = await SyncBackend.put(INDEX_KEY, next, state.indexVersion);
    if (result.conflict) {
      const latest = await SyncBackend.get(INDEX_KEY); const current = Array.isArray(latest.v) ? latest.v : [];
      next = [entry, ...current.filter(item => item.id !== entry.id)].sort((a, b) => b.updatedAt - a.updatedAt); result = await SyncBackend.put(INDEX_KEY, next, latest.updated_at || 0);
      if (result.conflict) throw new Error('A lista foi alterada por outra pessoa. Tente salvar novamente.');
    }
    state.saved = next; state.indexVersion = result.updated_at || state.indexVersion;
  }

  async function saveCurrent() {
    if (!state.items.length) return;
    const title = $('consolidadoTitle').value.trim() || generatedTitle(); const now = Date.now(); const id = state.id || crypto.randomUUID(); const createdAt = state.createdAt || now;
    const payload = { schema: 1, title, month: monthValue(), sourceName: state.sourceName, createdAt, updatedAt: now, items: state.items, texts: state.texts, original: state.original };
    if (JSON.stringify(payload).length > 850000) { toast('As fotos enviadas deixaram o arquivo grande demais. Use PNGs menores.'); return; }
    $('saveConsolidado').disabled = true;
    try {
      const result = await SyncBackend.put(ITEM_KEY + id, payload, state.version); if (result.conflict) throw new Error('Este consolidado foi alterado em outra sessão. Abra-o novamente antes de salvar.');
      state.id = id; state.version = result.updated_at || state.version; state.createdAt = createdAt;
      await saveIndex({ id, title, month: payload.month, createdAt, updatedAt: now, itemCount: state.items.length, pageCount: 1 }); state.dirty = false; $('saveConsolidado').disabled = false; toast('Consolidado salvo para a equipe.');
    } catch (error) { toast(error.message || 'Não foi possível salvar o consolidado.'); $('saveConsolidado').disabled = false; }
  }

  async function openSaved(id) {
    const entry = state.saved.find(item => item.id === id); if (!entry) return;
    try {
      const record = await SyncBackend.get(ITEM_KEY + id); const data = record.v; if (!data || !Array.isArray(data.items)) throw new Error('O conteúdo deste consolidado não foi encontrado.');
      state.items = data.items.map(item => ({ ...item, id: item.id || crypto.randomUUID() })); state.texts = data.texts || {}; state.original = data.original || null; state.id = id; state.version = record.updated_at || 0; state.createdAt = data.createdAt || entry.createdAt || Date.now(); state.sourceName = data.sourceName || ''; state.workbook = null; state.dirty = false;
      $('consolidadoTitle').value = data.title || entry.title; $('consolidadoMonth').value = data.month || entry.month; $('editorHeading').textContent = data.title || entry.title; $('fileName').textContent = state.sourceName || 'Planilha já importada'; $('sheetField').hidden = true; showEditor(); renderAll(); $('saveConsolidado').disabled = false;
    } catch (error) { toast(error.message || 'Não foi possível abrir o consolidado.'); }
  }

  async function deleteSaved(id) {
    const entry = state.saved.find(item => item.id === id); if (!entry || !confirm('Excluir "' + entry.title + '"? Esta ação não pode ser desfeita.')) return;
    try {
      const next = state.saved.filter(item => item.id !== id); const result = await SyncBackend.put(INDEX_KEY, next, state.indexVersion); if (result.conflict) { await loadSaved(); toast('A lista mudou. Confira e tente novamente.'); return; }
      state.saved = next; state.indexVersion = result.updated_at || state.indexVersion; await SyncBackend.remove(ITEM_KEY + id); renderLibrary(); toast('Consolidado excluído.');
    } catch (error) { toast(error.message || 'Não foi possível excluir o consolidado.'); }
  }

  function waitForImages(page) { return Promise.all([...page.querySelectorAll('img')].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 12000); }))); }
  // Página de trabalho = 28,2222 x 52 cm do InDesign; 1 px CSS = 1 pt do PDF (os tamanhos de fonte no CSS são em px = pt reais)
  const PAGE_W = 800; // largura do InDesign (28,2222 cm); a altura acompanha o conteúdo (informativo de e-mail, sem paginação)
  // Avisos antes de baixar o PDF: produtos sem link ou sem foto (a foto é conferida na prévia já carregada)
  function exportWarnings(page) {
    const brief = list => list.slice(0, 5).map(item => '“' + item.title.slice(0, 40) + '”').join(', ') + (list.length > 5 ? ' e mais ' + (list.length - 5) : '');
    const noPhoto = state.items.filter(item => { const card = page.querySelector('.consolidado-card[data-item-id="' + item.id + '"]'), img = card && card.querySelector('.consolidado-photo img'); return !img || img.style.display === 'none'; });
    const lines = []; const noLink = noLinkItems();
    if (noLink.length) lines.push('• ' + noLink.length + ' produto(s) sem link: ' + brief(noLink));
    if (noPhoto.length) lines.push('• ' + noPhoto.length + ' produto(s) sem foto: ' + brief(noPhoto));
    return !lines.length || confirm('Atenção antes de baixar o PDF:\n\n' + lines.join('\n') + '\n\nBaixar mesmo assim?');
  }
  async function exportPdf() {
    const button = $('exportPdf'); button.disabled = true; button.textContent = 'Gerando…';
    try {
      const pages = [...$('pagesPreview').querySelectorAll('.consolidado-page')]; const { jsPDF } = window.jspdf; let pdf; await waitForImages(pages[0]); if (!exportWarnings(pages[0])) return;
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index]; await waitForImages(page); const height = page.offsetHeight, scale = Math.max(1, Math.min(3, 16000 / height)); /* 3x = 2400 px de largura; limita a altura do canvas (máx. do navegador ~16000 px) em informativos muito longos */ const canvas = await html2canvas(page, { scale, useCORS: true, backgroundColor: '#f6be00', logging: false, onclone: clonedDoc => ConsolidadoExport.bakeImages(page, clonedDoc.querySelector('.consolidado-page'), scale) });
        if (!pdf) pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [PAGE_W, height], compress: true }); else pdf.addPage([PAGE_W, height], 'portrait');
        pdf.addImage(canvas.toDataURL('image/jpeg', .93), 'JPEG', 0, 0, PAGE_W, height, undefined, 'FAST');
        const pageRect = page.getBoundingClientRect(); page.querySelectorAll('.consolidado-card[data-link]').forEach(card => { const url = validLink(card.dataset.link); if (!url) return; const rect = card.getBoundingClientRect(); pdf.link(rect.left - pageRect.left, rect.top - pageRect.top, rect.width, rect.height, { url }); });
      }
      const safe = ($('consolidadoTitle').value || generatedTitle()).replace(/[\\/:*?"<>|]/g, '-'); pdf.save(safe + '.pdf'); toast('PDF gerado com os links dos produtos.');
    } catch (error) { toast(error.message || 'Não foi possível gerar o PDF.'); }
    finally { button.disabled = false; button.textContent = 'Baixar PDF'; }
  }

  document.addEventListener('pointerdown', event => { if (!event.target.closest('.consolidado-photo')) document.querySelectorAll('.consolidado-photo.photo-editing').forEach(photo => photo.classList.remove('photo-editing')); });
  $('restoreOriginal').onclick = () => {
    if (!state.original || !confirm('Voltar à planilha original? Exclusões, ordem, destaques, textos, fotos e links dos produtos serão descartados.')) return;
    state.items = JSON.parse(JSON.stringify(state.original)); state.texts = {}; renderAll(); markDirty(); toast('Produtos restaurados a partir da planilha original.');
  };
  $('newConsolidado').onclick = () => { resetEditor(); showEditor(); };
  $('addProduct').onclick = addProduct; $('startBlank').onclick = addProduct;
  $('backToLibrary').onclick = () => { if (state.dirty && !confirm('Voltar sem salvar as alterações?')) return; showLibrary(); };
  $('saveConsolidado').onclick = saveCurrent; $('exportPdf').onclick = exportPdf;
  // Trocar planilha/aba/mês substitui os produtos: pede confirmação se já houver edições ou se for um consolidado salvo
  const confirmDiscard = () => !state.items.length || !(state.edited || state.id) || confirm('Trocar a planilha, a aba ou o mês substitui os produtos atuais e descarta as edições feitas. Continuar?');
  function loadSheetFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) { toast('Envie uma planilha do Excel (.xlsx ou .xls).'); return; }
    if (!confirmDiscard()) return;
    readWorkbook(file);
  }
  // Arrastar e soltar a planilha: mesmo padrão da importação de CSV do TikTok (followers-dashboard.js) - só um arquivo por vez
  const dropzone = $('sheetDropzone');
  ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('is-dragover'); }));
  ['dragleave', 'dragend', 'drop'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('is-dragover'); }));
  dropzone.addEventListener('drop', event => {
    const files = event.dataTransfer && event.dataTransfer.files; if (!files || !files.length) return;
    if (files.length > 1) { toast('Selecione só uma planilha por vez.'); return; }
    loadSheetFile(files[0]);
  });
  ['dragover', 'drop'].forEach(type => window.addEventListener(type, event => event.preventDefault())); // soltar fora do campo não abre o arquivo no navegador
  $('sheetFile').onchange = event => { loadSheetFile(event.target.files[0]); event.target.value = ''; };
  $('sheetSelect').onchange = () => { if (!confirmDiscard()) { $('sheetSelect').value = state.sheetName; return; } chooseSheet(); };
  $('consolidadoMonth').onchange = () => { state.texts = {}; /* ponytail: trocar o mês refaz título e introdução do cabeçalho e descarta a formatação deles */ const old = $('consolidadoTitle').value; if (!old || /^Consolidado /.test(old)) $('consolidadoTitle').value = generatedTitle(); if (state.workbook && !(state.edited || state.id)) { const wanted = +monthValue().split('-')[1]; const match = state.workbook.SheetNames.find(name => M.monthNumber(name) === wanted); if (match) { $('sheetSelect').value = match; chooseSheet(); return; } } renderPreview(); markDirty(); };
  $('consolidadoTitle').oninput = () => { $('editorHeading').textContent = $('consolidadoTitle').value || 'Novo consolidado'; markDirty(); };
  window.addEventListener('beforeunload', event => { if (!state.dirty) return; event.preventDefault(); event.returnValue = ''; });
  loadSaved();
})();
