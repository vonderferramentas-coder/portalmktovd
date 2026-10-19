// Tela Marcas (Administração): marcas que aparecem em folhetos, posts e cartazes, com as versões de logo de cada uma.
// Estrutura em portalStore/brand-library-v1 (modelo em brand-library-model.js); imagens dos logos enviados em brandLogos/<id>.
// Logo do código (post-editor-assets/brands-js) só pode ser ocultado (reversível); logo enviado pela tela é apagado de verdade.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Model = window.BrandLibraryModel, KEY = 'brand-library-v1', MAX_DATA = 400000;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (paths, size = 18) => PortalShell.svgIcon(paths, size);
  const ICONS = {
    chevron: icon('<path d="m6 9 6 6 6-6"/>', 14), kebab: icon('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
    eyeOff: icon('<path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m1 1 22 22"/>'),
    eye: icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>'),
    edit: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'), move: icon('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
    download: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 14), plus: icon('<path d="M12 5v14M5 12h14"/>'), trash: icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>')
  };
  const state = { api: null, library: { brands: [] }, version: 0, editable: false, drawer: '', query: '' };
  const uris = new Map();

  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4200); }

  // ---- imagens ----
  function loadStatic(name) {
    return new Promise(resolve => {
      const done = () => resolve((window.OVD_BRAND_LOGOS && window.OVD_BRAND_LOGOS[name]) || '');
      if (window.OVD_BRAND_LOGOS && window.OVD_BRAND_LOGOS[name]) return done();
      const script = document.createElement('script'); script.src = 'post-editor-assets/brands-js/' + encodeURIComponent(name) + '.js'; script.onload = script.onerror = done; document.head.appendChild(script);
    });
  }
  const logoUri = logo => { if (!uris.has(logo.name)) uris.set(logo.name, logo.custom ? state.api.readBrandLogo(logo.docId).catch(() => '') : loadStatic(logo.name)); return uris.get(logo.name); };

  // SVG: só aceita se a raiz for <svg> e tira script/foreignObject. Imagem (PNG/WebP/JPG): reduz para no máximo 800 px e guarda como PNG/WebP com transparência.
  async function readLogoFile(file) {
    const fail = message => { throw new Error(message); };
    if (!file) fail('Escolha o arquivo do logo.');
    if (/svg/.test(file.type) || /\.svg$/i.test(file.name)) {
      const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml'), root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) fail('O SVG não é válido.');
      root.querySelectorAll('script,foreignObject').forEach(node => node.remove());
      const data = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(root))));
      if (data.length > MAX_DATA) fail('O SVG é grande demais (máximo ~300 KB). Simplifique o desenho ou envie em PNG.');
      return { data, type: 'image/svg+xml' };
    }
    if (!/^image\/(png|webp|jpeg)$/.test(file.type)) fail('Envie um SVG, PNG ou WebP.');
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('A imagem não pôde ser lida.')); img.src = URL.createObjectURL(file); });
    let scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight)), data = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      data = canvas.toDataURL('image/png'); if (data.length > MAX_DATA) data = canvas.toDataURL('image/webp', .9);
      if (data.length <= MAX_DATA) return { data, type: data.startsWith('data:image/webp') ? 'image/webp' : 'image/png' };
      scale *= .75;
    }
    return fail('A imagem é grande demais. Envie uma menor ou em SVG.');
  }

  // ---- janela de formulário (também serve de confirmação) ----
  function ask({ title, text = '', fields = [], ok = 'Salvar', danger = false }) {
    const dialog = $('dlg'), form = $('dlgForm');
    $('dlgTitle').textContent = title; $('dlgText').textContent = text; $('dlgText').hidden = !text;
    $('dlgFields').innerHTML = fields.map(f => '<label>' + esc(f.label) + (f.type === 'file'
      ? '<input type="file" name="' + f.name + '" accept="' + (f.accept || '') + '"' + (f.required ? ' required' : '') + '>'
      : '<input type="text" name="' + f.name + '" value="' + esc(f.value || '') + '" maxlength="80"' + (f.list ? ' list="dlgList"' : '') + (f.required ? ' required' : '') + ' autocomplete="off" placeholder="' + esc(f.placeholder || '') + '">') + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>').join('');
    const listField = fields.find(f => f.list); $('dlgList').innerHTML = listField ? listField.list.map(item => '<option value="' + esc(item) + '">').join('') : '';
    $('dlgOk').textContent = ok; $('dlgOk').classList.toggle('danger', danger);
    return new Promise(resolve => {
      dialog.returnValue = '';
      dialog.onclose = () => {
        if (dialog.returnValue !== 'ok') return resolve(null);
        const values = {}; fields.forEach(f => { const input = form.elements[f.name]; values[f.name] = f.type === 'file' ? input.files[0] : input.value.trim(); }); resolve(values);
      };
      dialog.showModal(); const first = form.querySelector('input'); (danger || !first ? $('dlgCancel') : first).focus();
    });
  }

  // ---- menu ⋮ ----
  let menu = null;
  function closeMenu() { if (!menu) return; menu.remove(); menu = null; document.removeEventListener('pointerdown', onOutside, true); document.removeEventListener('keydown', onKey, true); document.removeEventListener('scroll', closeMenu, true); }
  const onOutside = event => { if (menu && !menu.contains(event.target) && !event.target.closest('.kebab')) closeMenu(); };
  const onKey = event => { if (event.key === 'Escape') { closeMenu(); event.stopImmediatePropagation(); } }; // Esc fecha só o menu, não o painel por baixo
  function openMenu(button, entries) {
    const same = menu && menu.dataset.for === button.dataset.menuId; closeMenu(); if (same) return;
    menu = document.createElement('div'); menu.className = 'm-menu'; menu.dataset.for = button.dataset.menuId; menu.setAttribute('role', 'menu');
    menu.innerHTML = entries.map((entry, index) => entry === 'separator' ? '<div class="m-menu-sep" role="separator"></div>' : '<button type="button" role="menuitem" class="m-menu-item' + (entry.danger ? ' danger' : '') + '" data-index="' + index + '"><span class="ico">' + entry.icon + '</span><span>' + esc(entry.label) + '</span></button>').join('');
    menu.onclick = event => { const target = event.target.closest('.m-menu-item'); if (!target) return; const entry = entries[+target.dataset.index]; closeMenu(); entry.run(); };
    document.body.appendChild(menu);
    const box = button.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(innerWidth - width - 8, box.right - width)) + 'px'; menu.style.top = (box.bottom + 6 + height > innerHeight - 8 ? Math.max(8, box.top - height - 6) : box.bottom + 6) + 'px';
    document.addEventListener('pointerdown', onOutside, true); document.addEventListener('keydown', onKey, true); document.addEventListener('scroll', closeMenu, true);
  }

  // ---- dados ----
  const staticNames = () => window.OVD_BRAND_MANIFEST || [];
  const findBrand = id => state.library.brands.find(brand => brand.id === id);
  const takenNames = () => new Set([...staticNames(), ...state.library.brands.flatMap(brand => brand.logos.map(logo => logo.name))].map(Model.fold));
  async function reload() {
    const record = await SyncBackend.get(KEY); state.version = record.updated_at || 0; state.library = Model.merge(record.v, staticNames()); render();
  }
  // Grava o documento inteiro com controle de versão; se outra pessoa salvou antes, recarrega a versão dela e pede para repetir.
  async function persist() {
    const result = await SyncBackend.put(KEY, state.library, state.version);
    if (!result.conflict) { state.version = result.updated_at; return true; }
    state.version = result.server.updated_at; state.library = Model.merge(result.server.v, staticNames()); render();
    toast('Outra pessoa alterou as marcas agora. Atualizei a lista; repita a ação.'); return false;
  }
  async function commit(mutate, message, after) {
    try { await mutate(); if (!await persist()) return; if (after) await after(); render(); toast(message); }
    catch (error) { toast('Não foi possível salvar: ' + (error.message || 'tente de novo.')); try { await reload(); } catch (_) { /* segue com o que está na tela */ } }
  }
  const slugFor = name => { let id = Model.slug(name), n = 2; const base = id; while (state.library.brands.some(brand => brand.id === id)) id = base + '-' + n++; return id; };
  async function uploadLogo(brandName, label, file) {
    const image = await readLogoFile(file), docId = crypto.randomUUID(), name = Model.customName(brandName, label, takenNames());
    await state.api.writeBrandLogo(docId, image.data, image.type); uris.set(name, Promise.resolve(image.data));
    return { name, label: label || 'Principal', custom: true, docId };
  }

  // ---- ações ----
  async function newBrand() {
    const values = await ask({ title: 'Nova marca', text: 'Cadastre a marca com o primeiro logo. Depois você pode acrescentar outras versões.', fields: [
      { name: 'name', label: 'Nome da marca', required: true, placeholder: 'Ex.: Nove54' }, { name: 'label', label: 'Versão do logo', value: 'Principal', required: true, hint: 'Ex.: Principal, Branco, Vertical.' },
      { name: 'file', type: 'file', label: 'Arquivo do logo (SVG, PNG ou WebP)', accept: '.svg,.png,.webp,image/svg+xml,image/png,image/webp', required: true }], ok: 'Criar marca' });
    if (!values) return;
    if (state.library.brands.some(brand => Model.fold(brand.name) === Model.fold(values.name))) return toast('Já existe uma marca com esse nome.');
    await commit(async () => { const logo = await uploadLogo(values.name, values.label, values.file); const brand = { id: slugFor(values.name), name: values.name, logos: [logo] }; state.library.brands.unshift(brand); state.drawer = brand.id; }, 'Marca criada.');
  }
  async function addLogo(brand) {
    const values = await ask({ title: 'Adicionar logo a ' + brand.name, fields: [
      { name: 'label', label: 'Versão do logo', required: true, placeholder: 'Ex.: Branco, Vertical, Com slogan' }, { name: 'file', type: 'file', label: 'Arquivo do logo (SVG, PNG ou WebP)', accept: '.svg,.png,.webp,image/svg+xml,image/png,image/webp', required: true }], ok: 'Adicionar' });
    if (!values) return;
    await commit(async () => { brand.logos.push(await uploadLogo(brand.name, values.label, values.file)); }, 'Logo adicionado.');
  }
  async function renameBrand(brand) {
    const values = await ask({ title: 'Renomear marca', text: 'Muda o nome mostrado aqui. Os logos já enviados continuam sendo encontrados pelo nome original nos editores.', fields: [{ name: 'name', label: 'Nome da marca', value: brand.name, required: true }] });
    if (values && values.name !== brand.name) await commit(() => { brand.name = values.name; }, 'Marca renomeada.');
  }
  async function renameLogo(logo) {
    const values = await ask({ title: 'Renomear versão', fields: [{ name: 'label', label: 'Nome da versão', value: logo.label, required: true }] });
    if (values && values.label !== logo.label) await commit(() => { logo.label = values.label; }, 'Versão renomeada.');
  }
  async function moveLogo(brand, logo) {
    const values = await ask({ title: 'Mover logo para outra marca', text: 'Útil quando o agrupamento automático errou. Escolha uma marca da lista.', fields: [{ name: 'target', label: 'Marca de destino', list: state.library.brands.filter(b => b !== brand).map(b => b.name), required: true }], ok: 'Mover' });
    if (!values) return;
    const target = state.library.brands.find(b => Model.fold(b.name) === Model.fold(values.target));
    if (!target) return toast('Marca não encontrada. Escolha uma da lista ou crie a marca antes.');
    await commit(() => { brand.logos = brand.logos.filter(l => l !== logo); target.logos.push(logo); state.library.brands = state.library.brands.filter(b => b.logos.length); state.drawer = target.id; }, 'Logo movido para ' + target.name + '.');
  }
  async function deleteCustom(brand, logo) {
    if (!await ask({ title: 'Excluir logo?', text: '“' + brand.name + ' · ' + logo.label + '” será apagado para toda a equipe. Artes e cartazes já salvos com ele perdem o logo.', ok: 'Excluir', danger: true })) return;
    // a lista é gravada antes de apagar a imagem: se a gravação falhar, o logo continua inteiro
    await commit(() => { brand.logos = brand.logos.filter(l => l !== logo); state.library.brands = state.library.brands.filter(b => b.logos.length); }, 'Logo excluído.', async () => { await state.api.deleteBrandLogo(logo.docId); uris.delete(logo.name); });
  }
  async function deleteBrand(brand) {
    const customs = brand.logos.filter(logo => logo.custom).length;
    if (!await ask({ title: 'Excluir marca?', text: '“' + brand.name + '”: os logos do código ficam ocultos (dá para restaurar) e ' + (customs ? customs + ' logo(s) enviado(s) serão apagados de vez.' : 'nenhum logo enviado será apagado.'), ok: 'Excluir marca', danger: true })) return;
    const drop = brand.logos.filter(logo => logo.custom);
    await commit(() => {
      brand.logos = brand.logos.filter(logo => !logo.custom); brand.logos.forEach(logo => { logo.hidden = true; });
      if (!brand.logos.length) state.library.brands = state.library.brands.filter(b => b !== brand);
    }, 'Marca excluída.', async () => { for (const logo of drop) { await state.api.deleteBrandLogo(logo.docId); uris.delete(logo.name); } });
  }
  const toggleHidden = logo => commit(() => { logo.hidden = !logo.hidden; }, logo.hidden ? 'Logo visível de novo.' : 'Logo oculto nos editores.'); // a mensagem é escolhida antes de inverter

  // Baixar logo (qualquer usuário): PNG sem fundo, EPS vetorial ou SVG; o EPS só existe para logos vetoriais sem imagem embutida (brand-export.js).
  async function downloadLogo(brand, logo, kind) {
    try {
      const uri = await logoUri(logo); if (!uri) throw new Error('A imagem deste logo não carregou.');
      const base = (brand.name + (logo.label && logo.label !== 'Principal' ? ' ' + logo.label : '')).replace(/[\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '_');
      if (kind === 'png') return BrandExport.download(await BrandExport.toPngBlob(uri), base + '.png');
      const text = BrandExport.svgText(uri); if (!text) throw new Error('Este logo foi enviado como imagem (PNG/WebP) e não é vetorial. Baixe em PNG.');
      if (kind === 'svg') BrandExport.download(new Blob([text], { type: 'image/svg+xml' }), base + '.svg');
      else BrandExport.download(new Blob([BrandExport.svgToEps(text, base).eps], { type: 'application/postscript' }), base + '.eps');
    } catch (error) { toast((error.message || 'Não foi possível baixar o logo.') + (/EPS vetorial/.test(error.message) ? ' Use o PNG sem fundo ou o SVG.' : '')); }
  }
  // ---- tela ----
  const ICON_SEARCH = icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 30);
  const letterOf = name => { const c = Model.fold(name).trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
  const mainLogo = brand => brand.logos.find(l => !l.hidden && l.label === 'Principal') || brand.logos.find(l => !l.hidden) || brand.logos[0];
  const versions = n => n + (n === 1 ? ' versão' : ' versões');

  function cardHtml(brand) {
    const hidden = brand.logos.filter(l => l.hidden).length, custom = brand.logos.some(l => l.custom);
    return '<button type="button" class="brand-card' + (brand.id === state.drawer ? ' is-active' : '') + '" data-id="' + esc(brand.id) + '"><span class="brand-thumb is-loading"><img alt="" hidden></span><span class="brand-name">' + esc(brand.name) + '</span><span class="brand-sub">' + versions(brand.logos.length) + (hidden ? ' · ' + hidden + (hidden > 1 ? ' ocultas' : ' oculta') : '') + '</span>' + (custom ? '<span class="brand-tag">Enviado</span>' : '') + '</button>';
  }
  // Miniaturas só carregam perto da tela (são centenas de logos); sem IntersectionObserver carrega tudo.
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { observer.unobserve(entry.target); loadThumb(entry.target); } }), { rootMargin: '300px' }) : null;
  function loadThumb(card) {
    const brand = findBrand(card.dataset.id), logo = brand && mainLogo(brand), thumb = card.querySelector('.brand-thumb'), img = thumb.querySelector('img');
    if (!logo) return thumb.classList.remove('is-loading');
    logoUri(logo).then(uri => { thumb.classList.remove('is-loading'); if (uri) { img.src = uri; img.hidden = false; } });
  }
  function render() {
    const q = Model.fold(state.query), all = state.library.brands;
    const list = all.filter(brand => !q || Model.fold(brand.name).includes(q) || brand.logos.some(logo => Model.fold(logo.name + ' ' + logo.label).includes(q))).sort((a, b) => Model.fold(a.name).localeCompare(Model.fold(b.name)));
    const groups = new Map(); list.forEach(brand => { const letter = letterOf(brand.name); if (!groups.has(letter)) groups.set(letter, []); groups.get(letter).push(brand); });
    const letters = [...groups.keys()].sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
    $('brandList').innerHTML = letters.length
      ? letters.map(letter => '<section class="letter-group" id="letter-' + (letter === '#' ? 'num' : letter) + '"><h3 class="letter-title">' + letter + '</h3><div class="brand-grid">' + groups.get(letter).map(cardHtml).join('') + '</div></section>').join('')
      : '<div class="marcas-empty">' + ICON_SEARCH + '<strong>' + (all.length ? 'Nenhuma marca encontrada' : 'Nenhuma marca cadastrada') + '</strong><span>' + (all.length ? 'Tente outro nome ou limpe a busca.' : 'Use “Nova marca” para cadastrar a primeira.') + '</span></div>';
    $('azIndex').hidden = !all.length;
    $('azIndex').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').map(letter => '<button type="button" data-letter="' + letter + '"' + (groups.has(letter) ? '' : ' disabled') + '>' + letter + '</button>').join('');
    $('azIndex').querySelectorAll('button').forEach(button => button.onclick = () => { const target = $('letter-' + (button.dataset.letter === '#' ? 'num' : button.dataset.letter)); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('brandList').querySelectorAll('.brand-card').forEach(card => { card.onclick = () => openDrawer(card.dataset.id); if (observer) observer.observe(card); else loadThumb(card); });
    syncDrawer();
  }

  // ---- painel lateral da marca: versões em tamanho maior, com download sempre à vista ----
  let returnFocus = null;
  function openDrawer(id) { returnFocus = document.activeElement; state.drawer = id; syncDrawer(); $('drawerClose').focus(); }
  function closeDrawer() { state.drawer = ''; syncDrawer(); if (returnFocus && document.contains(returnFocus)) returnFocus.focus(); }
  function syncDrawer() {
    const brand = state.drawer && findBrand(state.drawer); if (!brand) state.drawer = '';
    $('drawer').classList.toggle('is-open', !!brand); $('drawerBackdrop').classList.toggle('is-open', !!brand); $('drawer').setAttribute('aria-hidden', !brand);
    document.querySelectorAll('.brand-card').forEach(card => card.classList.toggle('is-active', card.dataset.id === state.drawer));
    if (brand) renderDrawer(brand);
  }
  function verHtml(brand, logo, index) {
    const status = logo.hidden ? 'Oculto nos editores' : logo.custom ? 'Enviado pela equipe' : 'Do sistema';
    return '<article class="ver' + (logo.hidden ? ' is-hidden' : '') + '" data-index="' + index + '"><div class="ver-thumb"><img alt="" hidden><span class="logo-wait">…</span></div><div class="ver-row"><div class="ver-info"><strong>' + esc(logo.label) + '</strong><small>' + status + '</small></div>'
      + (state.editable ? '<button type="button" class="kebab" data-menu-id="' + esc(brand.id + ':' + index) + '" aria-haspopup="menu" aria-label="Ações de ' + esc(logo.label) + '">' + ICONS.kebab + '</button>' : '') + '</div>'
      + '<div class="ver-dl">' + ['png', 'eps', 'svg'].map(kind => '<button type="button" class="btn ghost small" data-kind="' + kind + '" title="' + (kind === 'png' ? 'PNG sem fundo' : kind === 'eps' ? 'EPS vetorial' : 'SVG vetorial') + '">' + ICONS.download + kind.toUpperCase() + '</button>').join('') + '</div></article>';
  }
  function renderDrawer(brand) {
    $('drawerTitle').textContent = brand.name; $('drawerSub').textContent = versions(brand.logos.length); $('drawerMenu').hidden = !state.editable;
    $('drawerMenu').onclick = () => openMenu($('drawerMenu'), [{ icon: ICONS.plus, label: 'Adicionar logo', run: () => addLogo(brand) }, { icon: ICONS.edit, label: 'Renomear marca', run: () => renameBrand(brand) }, 'separator', { icon: ICONS.trash, label: 'Excluir marca', danger: true, run: () => deleteBrand(brand) }]);
    $('drawerBody').innerHTML = brand.logos.map((logo, index) => verHtml(brand, logo, index)).join('') + (state.editable ? '<button type="button" class="logo-add" data-add>' + ICONS.plus + '<span>Adicionar logo</span></button>' : '');
    $('drawerBody').querySelectorAll('.ver').forEach(row => {
      const logo = brand.logos[+row.dataset.index], img = row.querySelector('img');
      logoUri(logo).then(uri => { if (uri) { img.src = uri; img.hidden = false; row.querySelector('.logo-wait').remove(); } else row.querySelector('.logo-wait').textContent = 'Sem imagem'; });
      row.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => downloadLogo(brand, logo, button.dataset.kind));
      const kebab = row.querySelector('.kebab');
      if (kebab) kebab.onclick = () => openMenu(kebab, [
        logo.custom ? null : { icon: logo.hidden ? ICONS.eye : ICONS.eyeOff, label: logo.hidden ? 'Mostrar nos editores' : 'Ocultar nos editores', run: () => toggleHidden(logo) },
        { icon: ICONS.edit, label: 'Renomear versão', run: () => renameLogo(logo) }, { icon: ICONS.move, label: 'Mover para outra marca…', run: () => moveLogo(brand, logo) },
        logo.custom ? 'separator' : null, logo.custom ? { icon: ICONS.trash, label: 'Excluir logo', danger: true, run: () => deleteCustom(brand, logo) } : null].filter(Boolean));
    });
    const add = $('drawerBody').querySelector('[data-add]'); if (add) add.onclick = () => addLogo(brand);
  }

  async function init() {
    try {
      state.api = window.PortalFirebase || await new Promise(resolve => addEventListener('portal-firebase-ready', () => resolve(window.PortalFirebase), { once: true }));
      const context = await state.api.currentContext(); state.editable = ['admin', 'criacao'].includes(context.profile.role);
      $('newBrand').hidden = !state.editable; $('readOnlyNote').hidden = state.editable;
      await reload();
    } catch (error) { $('brandList').innerHTML = '<div class="marcas-empty"><strong>Não foi possível carregar as marcas</strong><span>Recarregue a página e tente de novo.</span></div>'; }
  }
  $('newBrand').onclick = newBrand;
  $('brandSearch').oninput = event => { state.query = event.target.value; render(); };
  $('drawerClose').onclick = $('drawerBackdrop').onclick = closeDrawer;
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.drawer && !$('dlg').open) closeDrawer(); });
  document.querySelectorAll('.bg-toggle button').forEach(button => button.onclick = () => { document.querySelector('.marcas-app').dataset.bg = button.dataset.bg; document.querySelectorAll('.bg-toggle button').forEach(other => other.setAttribute('aria-pressed', other === button)); });
  init();
})();
