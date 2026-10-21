// Gerador de Cartazes: lógica da página cartaz-generator.html (carregado no fim do <body>).
(() => {
    const NOLOGO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 18 5-5 3 3 2-2 4 4"/></svg>'; const LINK_ICON = '<svg class="link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>'; const $ = x => document.getElementById(x), S = { undo: [], sort: { key: 'az', dir: 1 }, filter: 'all', menu: false, menuSection: '', linking: false, linkSel: [], pages: [], page: 0, brand: '', printFormat: '', codes: {}, brandLogos: {}, brandAssets: [] }; let savedGrids = [], savedGridsVersion = 0, currentGridId = null, currentGridVersion = 0, currentGridCreatedAt = 0, sourceName = ''; const GRID_INDEX_KEY = 'cartaz-grid-index-v1', GRID_KEY = 'cartaz-grid-v1-'; const n = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''), t = x => String(x ?? '').trim(), e = x => t(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); function toast(x) { $('toast').textContent = x; $('toast').hidden = false; clearTimeout(S.timer); S.timer = setTimeout(() => $('toast').hidden = true, 3500) } function map(files, to, label) { [...files].forEach(f => to[f.name.replace(/\.[^.]+$/, '')] = f); $(label).textContent = Object.keys(to).length + ' arquivo(s) identificado(s)'; draw() } function logoCandidates(brand) { let key=n(brand), first=n(t(brand).split(/\s+/)[0]); return S.brandAssets.filter(asset=>{let k=n(asset.name);return k===key||k.startsWith(key)||key.startsWith(k)||(first.length>=3&&(k===first||k.startsWith(first)));}); }
    /* post-editor-assets/brands/*.svg (os SVGs crus) fica fora do Git (~250 MB, ver .gitignore) e nunca existiu
       no HML/produção publicados - só no disco de quem editou localmente. post-editor.js já resolve isso desde
       sempre carregando post-editor-assets/brands-js/<nome>.js, um "wrapper" leve e versionado que registra a
       logo como data: URI em window.OVD_BRAND_LOGOS (mesma logo usada no post de Ecommerce da FG); reaproveita
       aqui em vez de reinventar. ponytail: um redraw por logo resolvida (sem debounce) - se algum dia a lista
       tiver dezenas de marcas novas na mesma grade, agrupar os redraws. */
    let brandLogoCache = {}, brandLogoLoading = new Set(), brandLogoWaiters = {};
    function brandLogoDataUri(file, onReady) {
        let name = file.replace(/\.svg$/i, '');
        if (name in brandLogoCache) { let uri = brandLogoCache[name]; if (uri && onReady) onReady(uri); return uri; }
        if (window.OVD_BRAND_LOGOS && window.OVD_BRAND_LOGOS[name]) { let uri = brandLogoCache[name] = window.OVD_BRAND_LOGOS[name]; if (onReady) onReady(uri); return uri; } /* logo já em memória (ex.: enviado pela tela Marcas): não tem arquivo em brands-js */
        if (onReady) (brandLogoWaiters[name] = brandLogoWaiters[name] || []).push(onReady);
        if (!brandLogoLoading.has(name)) {
            brandLogoLoading.add(name);
            let script = document.createElement('script');
            script.src = 'post-editor-assets/brands-js/' + encodeURIComponent(name) + '.js';
            script.onload = script.onerror = () => {
                brandLogoLoading.delete(name);
                let uri = brandLogoCache[name] = (window.OVD_BRAND_LOGOS && window.OVD_BRAND_LOGOS[name]) || '';
                let waiters = brandLogoWaiters[name] || []; delete brandLogoWaiters[name];
                if (uri) { waiters.forEach(fn => fn(uri)); pages(); draw(); }
            };
            document.head.appendChild(script);
        }
        return '';
    }
    function logoUrl(brand) { let saved=S.brandLogos[brand]; if(saved && saved.startsWith('data:')) return saved; let asset=logoCandidates(brand).find(item=>item.file===saved)||logoCandidates(brand)[0]; return asset?brandLogoDataUri(asset.file):''; } async function loadBrandAssets() { try { let assets=await fetch('post-editor-assets/brands/index.json').then(r=>r.ok?r.json():[]); S.brandAssets=await BrandLibrary.overlayAssets(Array.isArray(assets)?assets:[]); if(S.pages.length){pages();drawWhenIdle();} }catch(_){} } /* Linhas da planilha cujo código tem cor de preenchimento (qualquer cor que não seja branca). */
    /* Sem coluna de link/FG na planilha, o código FG do produto principal vem do catálogo (data/catalog-vonder.json), pelo código OVD. Devolve quantos ficaram sem. */
    async function fillFg(groups) {
        let need = groups.filter(g => !g.rows[0].fg); if (!need.length) return 0;
        try { let map = CartazColumns.fgMap(await fetch('data/catalog-vonder.json').then(r => r.json())); need.forEach(g => g.rows[0].fg = map.get(g.rows[0].ovd.replace(/\D/g, '')) || ''); } catch (_) { toast('Não consegui consultar o catálogo para achar os códigos FG.'); }
        return need.filter(g => !g.rows[0].fg).length;
    }
    function load(file) { sourceName = file.name; currentGridId = null; currentGridVersion = 0; currentGridCreatedAt = 0; S.brandLogos = {}; let reader = new FileReader; reader.onload = async event => { try { let workbook = XLSX.read(event.target.result, { type: 'array', cellStyles: true }), sheet = workbook.Sheets[workbook.SheetNames[0]], rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }), headers = Object.keys(rows[0] || {}), cols = CartazColumns.detect(headers, rows), ovd = cols.ovd, fg = cols.fg, titleColumn = cols.title, productCode = cols.productCode || ovd, principal = cols.barcode, brand = cols.brand, price = cols.price, desc = cols.desc, link = cols.link, minQty = cols.minQty, divLinkCols = cols.links || {}; let needBarcode = !(S.config.layout === 'liveshop' && S.config.codeType === 'qr'); /* Live Shop com QR Code não usa código de barras */ if (!ovd || !titleColumn || (needBarcode && !principal)) throw Error('Não identifiquei na planilha: ' + [!ovd && 'código do produto', !titleColumn && 'nome/título', (needBarcode && !principal) && 'código de barras'].filter(Boolean).join(', ') + '. Colunas lidas: ' + headers.join(' | ')); let marks = CartazColumns.markedRows(sheet, ovd, rows.length), groups = [], group, latestTitle = '', useTitle = !principal || !rows.some(r => t(r[principal])); /* sem código de barras na planilha, o produto novo começa na linha com título */ rows.forEach((row, index) => { let item = { ovd: t(row[ovd]).replace(/\.\d+$/, ''), fg: t(row[fg]).replace(/\.\d+$/, ''), title: t(row[titleColumn]), code: t(row[productCode]), principal: t(row[principal]).replace(/\.\d+$/, ''), brand: t(row[brand]), price: t(row[price]), desc: t(row[desc]) }; let rowLink = t(row[link]), rowQty = t(row[minQty]); if (!item.ovd && !item.title && !item.code) return; if (item.title) latestTitle = item.title; if (useTitle ? item.title : item.principal && item.principal !== group?.principal) { group = { title: latestTitle, principal: item.principal, rows: [] }; groups.push(group) } if (!group) throw Error('Linha ' + (index + 2) + ' sem CÓDIGO PRINCIPAL antes dos produtos.'); if (!item.ovd) throw Error('Linha ' + (index + 2) + ' sem CÓDIGO OVD.'); Object.entries(divLinkCols).forEach(([id, header]) => { let value = t(row[header]); if (value) { group.divLinks = group.divLinks || {}; if (!group.divLinks[id]) group.divLinks[id] = value; } }); if (rowLink && !group.link) group.link = rowLink; if (rowQty && !group.minQty) group.minQty = rowQty; /* link e quantidade mínima valem para o box inteiro: vêm da 1ª linha preenchida do produto */ if (marks[index]) item.marked = true; group.rows.push(item) }); groups.forEach(g => { let at = g.rows.findIndex(r => r.marked); if (at > 0) g.rows.unshift(...g.rows.splice(at, 1)); }); /* a linha pintada é o produto do card: dela vêm a foto e o código FG do link */ if (!groups.length) throw Error('Nenhum produto encontrado na planilha.'); let missingFg = await fillFg(groups), brandGroups = bucketGroups(groups);
    S.pages = []; S.undo = []; updateUndo(); S.pagedWith = pagSig(S.config);
    [...brandGroups].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).forEach(([brandName, brandItems]) => S.pages.push(...paginate(brandName, brandItems)));
    S.linking = false; S.linkSel = [];
    S.page = 0; S.brand = S.pages[0]?.brand || ''; let photoCount = groups.filter(group => group.rows[0].ovd).length; if ($('photoInfo')) $('photoInfo').textContent = photoCount + ' foto' + (photoCount === 1 ? '' : 's') + ' vinculada' + (photoCount === 1 ? '' : 's') + ' pelo Código OVD'; updateDashboard(); $('work').hidden = false; $('printMenu').disabled = false; $('saveGrid').disabled = false; $('exportMenu').disabled = false; pages(); draw(); measureAllPages(); pages(); updateDashboard(); toast(groups.length + ' produto(s) distribuído(s) em ' + S.pages.length + ' página(s).' + (missingFg && S.config.layout === 'liveshop' ? ' Sem código FG no catálogo (link vazio): ' + missingFg + ' produto(s).' : '')) } catch (error) { toast(error.message) } }; reader.readAsArrayBuffer(file) } /* paginação e vínculo de marcas: cartaz-pagination.js (testado em tests/cartaz-pagination.test.html) */
    const { paginate, groupBrand, twoCodeColumns } = CartazPagination;

/* Desfazer: guarda o estado das páginas (edições de título/foto, códigos de barras, vínculos, logos) antes de cada ação; Ctrl+Z ou botão "Desfazer" volta um passo.
       Rajadas da mesma ação (digitar um título, roda do mouse na foto) valem um passo só. ponytail: sem "refazer"; guarda 30 passos como texto JSON. */
    function snapshot(burst) {
        let now = Date.now(), last = S.undo[S.undo.length - 1]; if (burst && last && last.burst === burst && now - last.at < 1500) { last.at = now; return; }
        S.undo.push({ pages: JSON.stringify(S.pages), logos: JSON.stringify(S.brandLogos || {}), brand: S.brand, burst, at: now }); if (S.undo.length > 30) S.undo.shift(); updateUndo();
    }
    function updateUndo() { let button = $('undoBtn'); if (button) button.disabled = !S.undo.length; }
    function undo() {
        let step = S.undo.pop(); if (!step) return; S.pages = JSON.parse(step.pages); S.brandLogos = JSON.parse(step.logos); S.linking = false; S.linkSel = [];
        S.brand = S.pages.some(page => page.brand === step.brand) ? step.brand : (S.pages[0]?.brand || ''); measureAllPages(); draw(); updateUndo(); toast('Ação desfeita.');
    }
    document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !event.target.closest?.('input, textarea, [contenteditable]') && S.undo.length) { event.preventDefault(); undo(); } });
    $('undoBtn').onclick = undo;
    $('preview').addEventListener('click', ev => { let button = ev.target.closest('[data-fill]'); if (button) setWide(button.dataset.fill, true); });
    function relayout(brand) { S.brand = brand; S.page = Math.max(0, S.pages.findIndex(page => page.brand === brand)); measureAllPages(); draw(); }
    /* "Por marca" gera folhas separadas para cada marca; "Sequência única" preenche as folhas em ordem, misturando as marcas. */
    const SEQUENCE_KEY = 'TODAS AS MARCAS';
    function bucketGroups(groups) {
        if (S.config.paginateBy === 'sequence') return new Map([[SEQUENCE_KEY, groups]]);
        let buckets = new Map(); groups.forEach(group => { let brandName = groupBrand(group); if (!buckets.has(brandName)) buckets.set(brandName, []); buckets.get(brandName).push(group); }); return buckets;
    }
    /* Refaz a paginação inteira com a configuração atual. ponytail: trocar entre "por marca" e "sequência" desfaz os vínculos entre marcas. */
    function repaginate(silent) {
        let prev = new Map(), order = [], byKey = new Map();
        S.pages.forEach(page => { page.items.forEach(item => prev.set(item.group, item)); if (!byKey.has(page.brand)) { byKey.set(page.brand, { members: page.brands, groups: [] }); order.push(page.brand); } byKey.get(page.brand).groups.push(...page.items.map(item => item.group)); });
        let next;
        if (S.config.paginateBy === 'sequence' || byKey.has(SEQUENCE_KEY)) next = [...bucketGroups(order.flatMap(key => byKey.get(key).groups))].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).flatMap(([key, groups]) => paginate(key, groups, null, prev));
        else next = order.flatMap(key => paginate(key, byKey.get(key).groups, byKey.get(key).members, prev));
        if (!silent) snapshot(); S.pages = next; S.pagedWith = pagSig(S.config); S.linking = false; S.linkSel = [];
        relayout(next.some(page => page.brand === S.brand) ? S.brand : (next[0]?.brand || ''));
    }
    function linkBrands(names) {
        snapshot(); let result = CartazPagination.link(S.pages, names); S.pages = result.pages; S.linking = false; S.linkSel = []; relayout(result.key);
        let linked = S.pages.filter(page => page.brand === result.key); toast(names.length + ' marcas vinculadas em ' + linked.length + ' página(s) ' + linked[0].format + '.');
    }
    function unlinkBrands(key) {
        let result = CartazPagination.unlink(S.pages, key); if (!result) return;
        snapshot(); S.pages = result.pages; relayout(result.first); toast('Marcas desvinculadas.');
    }
    function splitBrandByTitle(brand, term, newBrand) {
        let old = S.pages.filter(page => page.brand === brand), groups = old.flatMap(page => page.items.map(item => item.group)), key = n(term);
        if (!key || !newBrand || !old.length) return 0;
        let matching = groups.filter(group => n([group.title, ...group.rows.map(row => row.title)].join(' ')).includes(key));
        if (!matching.length) return 0;
        let previous = new Map(); old.forEach(page => page.items.forEach(item => previous.set(item.group, item)));
        matching.forEach(group => group.rows.forEach(row => { row.brand = newBrand; }));
        let rest = groups.filter(group => !matching.includes(group)), next = S.pages.filter(page => page.brand !== brand), first = S.pages.indexOf(old[0]);
        next.splice(first, 0, ...paginate(brand, rest, null, previous), ...paginate(newBrand, matching, null, previous));
        S.pages = next; relayout(newBrand); return matching.length;
    }
    function openSplitBrandDialog() {
        let brand = S.brand, dialog = $('splitBrandDialog'), term = $('splitBrandTerm'), name = $('splitBrandName'), status = $('splitBrandStatus');
        if (!brand || S.pages.find(page => page.brand === brand)?.brands) return;
        $('splitBrandSource').value = brand; term.value = ''; name.value = brand + ' - '; status.textContent = '';
        $('splitBrandApply').onclick = () => {
            let newBrand = t(name.value);
            if (!t(term.value) || !newBrand) { status.textContent = 'Informe a palavra do título e o nome da nova marca.'; return; }
            if (newBrand === brand || S.pages.some(page => page.brand === newBrand)) { status.textContent = 'A nova marca precisa ter outro nome e ainda não pode existir na grade.'; return; }
            snapshot(); let count = splitBrandByTitle(brand, t(term.value), newBrand);
            if (!count) { S.undo.pop(); updateUndo(); status.textContent = 'Nenhum cartão dessa marca contém essa palavra no título.'; return; }
            dialog.close(); toast(count + ' cartão(ões) movido(s) para ' + newBrand + '. Salve a grade para compartilhar.');
        };
        dialog.showModal(); term.focus();
    }
    /* Adicionar item manualmente: mesmo mecanismo de link/unlink acima - CartazPagination.insertItem() refaz a
       paginação da marca inteira, então o item novo entra respeitando formato A4/A3, colunas e última linha,
       nunca como folha avulsa. Funciona antes de importar qualquer planilha (cria a primeira marca) ou depois
       (entra junto dos itens já importados daquela marca, na posição escolhida). */
    function brandGroups(brandKey) { return S.pages.filter(page => page.brand === brandKey).flatMap(page => page.items.map(item => item.group)); }
    function manualBrandPages() { let seen = new Set(), list = []; S.pages.forEach(page => { if (!seen.has(page.brand)) { seen.add(page.brand); list.push(page); } }); return list.sort((a, b) => a.brand.localeCompare(b.brand, 'pt-BR')); }
    function updateManualItemFields() {
        let key = $('manualBrandSelect').value, isNew = key === '__new__', page = !isNew && S.pages.find(p => p.brand === key), linked = page && page.brands;
        $('manualNewBrandField').hidden = !isNew; $('manualMemberField').hidden = !linked;
        if (linked) $('manualMemberSelect').innerHTML = page.brands.map(name => '<option value="' + e(name) + '">' + e(name) + '</option>').join('');
        let groups = isNew ? [] : brandGroups(key);
        $('manualPositionField').hidden = isNew;
        $('manualPositionSelect').innerHTML = '<option value="">No fim da marca</option>' + groups.map((group, index) => '<option value="' + index + '">Antes de: ' + e(group.title || '(sem título)') + '</option>').join('');
    }
    function openManualItemDialog() {
        let select = $('manualBrandSelect'), pages = manualBrandPages();
        select.innerHTML = pages.map(page => '<option value="' + e(page.brand) + '">' + e(page.brand) + (page.brands ? ' (vínculo)' : '') + '</option>').join('') + '<option value="__new__">+ Nova marca…</option>';
        select.value = pages[0] ? pages[0].brand : '__new__'; updateManualItemFields();
        ['manualNewBrandName', 'manualTitle', 'manualOvd', 'manualCode', 'manualBarcode'].forEach(id => $(id).value = '');
        $('manualBarcodeStatus').textContent = ''; $('manualBarcodeStatus').dataset.kind = '';
        $('manualItemDialog').showModal(); $('manualTitle').focus();
    }
    $('manualItemBtn').onclick = openManualItemDialog;
    $('manualBrandSelect').onchange = updateManualItemFields;
    $('manualBarcode').oninput = () => { /* mesma checagem de addBarcode(), só que aqui o código é opcional: não bloqueia o envio */
        let digits = $('manualBarcode').value.replace(/\D/g, ''), status = $('manualBarcodeStatus');
        if (!digits) { status.textContent = ''; status.dataset.kind = ''; return; }
        let info = gtin(digits);
        if (!info) { status.textContent = digits.length + ' dígito(s): o código precisa ter 8, 12, 13 ou 14.'; status.dataset.kind = 'bad'; }
        else if (info.ok) { status.textContent = info.type + ' válido.'; status.dataset.kind = 'ok'; }
        else { let fix = digits.slice(0, -1), suggestion = ''; for (let d = 0; d < 10; d++) if (gtin(fix + d).ok) { suggestion = fix + d; break; } status.textContent = 'Dígito verificador não confere' + (suggestion ? ': o correto seria ' + suggestion + '.' : '.'); status.dataset.kind = 'bad'; }
    };
    ['manualNewBrandName', 'manualTitle', 'manualOvd', 'manualBarcode'].forEach(id => $(id).onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('manualItemSave').click(); } });
    $('manualItemSave').onclick = () => {
        let title = t($('manualTitle').value), ovd = t($('manualOvd').value);
        if (!title) { toast('Informe o título do produto.'); $('manualTitle').focus(); return; }
        if (!ovd) { toast('Informe o Código OVD do item principal.'); $('manualOvd').focus(); return; }
        let key = $('manualBrandSelect').value, isNew = key === '__new__', newName = t($('manualNewBrandName').value);
        if (isNew) {
            if (!newName) { toast('Informe o nome da nova marca.'); $('manualNewBrandName').focus(); return; }
            if (S.pages.some(page => page.brand === newName)) { toast('Já existe uma marca com esse nome.'); $('manualNewBrandName').focus(); return; }
        }
        let page = !isNew && S.pages.find(p => p.brand === key), linked = page && page.brands, rowBrand = isNew ? newName : (linked ? $('manualMemberSelect').value : key);
        let principal = $('manualBarcode').value.replace(/\D/g, ''), codes = t($('manualCode').value).split(/[,\n]+/).map(t).filter(Boolean);
        if (!codes.length) codes = [ovd];
        let group = { title, principal, rows: codes.map(code => ({ ovd, fg: '', title, code, principal, brand: rowBrand, price: '' })) };
        let groups = isNew ? [] : brandGroups(key), positionValue = $('manualPositionSelect').value, beforeGroup = positionValue ? groups[+positionValue] : null;
        let wasEmpty = !S.pages.length;
        snapshot();
        let result = CartazPagination.insertItem(S.pages, isNew ? newName : key, group, beforeGroup);
        S.pages = result.pages; S.linking = false; S.linkSel = [];
        if (wasEmpty) { $('work').hidden = false; $('printMenu').disabled = false; $('saveGrid').disabled = false; $('exportMenu').disabled = false; }
        relayout(result.key);
        $('manualItemDialog').close();
        toast('Item adicionado à marca "' + result.key + '".');
    };
    /* rodapé da folha: uma marca = o cartão de logo de sempre; marcas vinculadas = um cartão por marca que tem produto NA página */
    /* Grade fora do padrão da Feira (A4 2x3, A3 3x3): colunas/linhas vêm da página via --cols/--rows (ver .cfg-grid no CSS). */
    function customGrid(page) { return !!page.cols && !(page.format === 'A4' ? page.cols === 2 && page.rows === 3 : page.cols === 3 && page.rows === 3); }
    const gridClass = page => (customGrid(page) ? ' cfg-grid' : '') + (page.layout === 'liveshop' ? ' lb-sheet' + (page.footerLogo ? ' lb-footer' : '') + (page.header === 'full' ? ' lb-header-full' : '') : ''), gridStyle = page => customGrid(page) ? ' style="--cols:' + page.cols + ';--rows:' + page.rows + '"' : '';
    function pageFooter(page, logo) {
        if (!page.brands) return '<div class="sheet-footer" aria-hidden="true">' + (logo ? '<img src="' + e(logo) + '" alt="">' : '') + '</div>';
        let off = page.logoOff || [], shown = off.length ? page.brands.filter(brand => !off.includes(brand)) : [...new Set(page.items.map(item => groupBrand(item.group)))]; /* sem escolha manual: as marcas que têm produto na página; com escolha: as marcas marcadas, em TODAS as páginas do grupo (sempre há ao menos uma) */
        return '<div class="sheet-footer multi" aria-hidden="true">' + shown.map(brand => { let url = logoUrl(brand); return '<div class="sheet-logo-card">' + (url ? '<img src="' + e(url) + '" alt="">' : '<span>' + e(brand) + '</span>') + '</div>'; }).join('') + '</div>';
    }
    function updateDashboard() { let items = S.pages.flatMap(page => page.items), brands = new Set(S.pages.flatMap(page => page.brands || [page.brand])).size; $('metricBrands').textContent = brands; $('metricIssues').textContent = validatorFindings().reduce((sum, f) => sum + f.issues.length, 0); $('metricProducts').textContent = items.reduce((sum, item) => sum + item.group.rows.length, 0); $('metricBarcodes').textContent = items.filter(item => hasBarcodeIssue(item.group.rows[0])).length; $('metricCodes').textContent = items.reduce((sum, item) => sum + (item.hiddenCodes || 0), 0); $('metricA4').textContent = S.pages.filter(page => page.format === 'A4').length; $('metricA3').textContent = S.pages.filter(page => page.format === 'A3').length; } function title(group) { let brand = group.rows.map(r => r.brand).find(Boolean); return brand ? group.title + ', ' + brand : group.title } function code(x) { let d = t(x).replace(/\D/g, ""); return d.length === 10 ? d.replace(/(\d{2})(\d{2})(\d{3})(\d{3})/, "$1 $2 $3 $4") : t(x) }
    /* ponytail: quantas linhas uma variacao ocupa na lista de codigos e estimado por contagem de caracteres
       (30 = o maior texto que ja confirmamos coubesse numa linha só, ver "GIR - 100 m: 31 71 100 000"),
       não por medida real da fonte renderizada - pode errar por um caractere ou outro perto do limite,
       mas evita ter que desenhar o cartão pra depois medir. Path de evolução: medir de verdade
       (scrollHeight) se algum caso real cair muito longe disso. */
    function gridTitle() { return sourceName.replace(/\.[^.]+$/, '') || 'Grade sem nome'; }
    function requestGridTitle(value) { let dialog = $('saveGridDialog'), input = $('saveGridName'); input.value = value; dialog.showModal(); input.focus(); input.select(); return new Promise(resolve => dialog.onclose = () => resolve(dialog.returnValue === 'save' ? t(input.value) : '')); }
    function renderSavedGrids() { let list = $('savedGrids'); list.replaceChildren(); if (!savedGrids.length) { let empty = document.createElement('p'); empty.className = 'cg-saved-empty'; empty.textContent = 'Nenhuma planilha salva ainda.'; list.append(empty); return; } savedGrids.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach(grid => { let row = document.createElement('div'), info = document.createElement('div'), title = document.createElement('strong'), meta = document.createElement('span'), open = document.createElement('button'), remove = document.createElement('button'); row.className = 'cg-saved-grid'; title.textContent = grid.title; meta.textContent = new Date(grid.updatedAt).toLocaleString('pt-BR') + ' · ' + grid.productCount + ' produtos · ' + grid.brandCount + ' marcas'; info.append(title, meta); open.type = remove.type = 'button'; open.textContent = 'Abrir'; remove.textContent = 'Excluir'; remove.className = 'danger'; open.onclick = () => openSavedGrid(grid); remove.onclick = () => deleteSavedGrid(grid); row.append(info, open, remove); list.append(row); }); }
    async function loadSavedGrids() { try { let record = await SyncBackend.get(GRID_INDEX_KEY); savedGrids = Array.isArray(record.v) ? record.v : []; savedGridsVersion = record.updated_at || 0; } catch (_) { savedGrids = []; toast('Não foi possível carregar as planilhas salvas.'); } renderSavedGrids(); }
    async function saveGridIndex(entry) { let next = [entry, ...savedGrids.filter(grid => grid.id !== entry.id)].sort((a, b) => b.updatedAt - a.updatedAt), result = await SyncBackend.put(GRID_INDEX_KEY, next, savedGridsVersion); if (result.conflict) { let latest = await SyncBackend.get(GRID_INDEX_KEY), current = Array.isArray(latest.v) ? latest.v : [], retry = [entry, ...current.filter(grid => grid.id !== entry.id)].sort((a, b) => b.updatedAt - a.updatedAt); result = await SyncBackend.put(GRID_INDEX_KEY, retry, latest.updated_at || 0); if (result.conflict) throw Error('A lista foi alterada por outra pessoa. Tente salvar novamente.'); next = retry; } savedGrids = next; savedGridsVersion = result.updated_at || savedGridsVersion; }
    async function saveCurrentGrid() { if (!S.pages.length) return; let title = currentGridId ? (savedGrids.find(grid => grid.id === currentGridId)?.title || gridTitle()) : await requestGridTitle(gridTitle()); if (!t(title)) return; let button = $('saveGrid'); button.disabled = true; try { let now = Date.now(), id = currentGridId || crypto.randomUUID(), createdAt = currentGridCreatedAt || now, payload = { schema: 1, title: t(title), sourceName, createdAt, updatedAt: now, pages: S.pages, brandLogos: S.brandLogos, template: S.activeTemplate, config: S.templateSets[S.activeTemplate].config, header: S.templateSets[S.activeTemplate].header }; /* a configuração e o header do cartaz viajam com a grade */ let result = await SyncBackend.put(GRID_KEY + id, JSON.parse(JSON.stringify(payload)), currentGridVersion); /* o Firestore recusa valor undefined: a cópia via JSON os descarta */ if (result.conflict) throw Error('Esta grade foi alterada em outra sessão. Abra-a novamente antes de salvar.'); currentGridId = id; currentGridVersion = result.updated_at || currentGridVersion; currentGridCreatedAt = createdAt; await saveGridIndex({ id, title: payload.title, createdAt, updatedAt: now, productCount: S.pages.flatMap(page => page.items).reduce((sum, item) => sum + item.group.rows.length, 0), brandCount: new Set(S.pages.flatMap(page => page.brands || [page.brand])).size }); renderSavedGrids(); toast('Grade salva para edição compartilhada.'); } catch (error) { toast(error.message || 'Não foi possível salvar a grade.'); } finally { button.disabled = false; } }
    async function openSavedGrid(grid) { try { let record = await SyncBackend.get(GRID_KEY + grid.id), payload = record.v; if (!payload || !Array.isArray(payload.pages)) throw Error('O conteúdo desta grade não foi encontrado.'); if (payload.template && payload.template !== S.activeTemplate && S.templateSets[payload.template]) await setActiveTemplate(payload.template); let set = S.templateSets[S.activeTemplate]; /* grades antigas não trazem config/header: mantêm os do template vigente. Aplicado só em memória; vira do template em "Aplicar". */ let base = tplBase[S.activeTemplate] = tplBase[S.activeTemplate] || { config: set.config, header: set.header }; /* o que o template tinha antes de qualquer grade, para grades antigas (sem config) não herdarem a da grade anterior */ set.config = payload.config ? { ...defaultConfig(S.activeTemplate), ...payload.config } : base.config; set.header = payload.header ? { ...payload.header } : base.header; S.openCard = []; S.cardsOpen = false; S.cardFilter = ''; S.header = set.header; S.config = CartazPagination.setConfig(set.config); S.pages = payload.pages; S.pages.forEach(CartazPagination.placeLive); /* grades antigas não trazem o cálculo de espaços vazios */ S.pagedWith = pagSig(S.config); renderConfigBox(); applyTemplates(); S.undo = []; updateUndo(); S.brandLogos = payload.brandLogos || {}; S.codes = {}; S.linking = false; S.linkSel = []; S.page = 0; S.brand = S.pages[0]?.brand || ''; sourceName = payload.sourceName || grid.title; currentGridId = grid.id; currentGridVersion = record.updated_at || 0; currentGridCreatedAt = payload.createdAt || grid.createdAt || Date.now(); $('work').hidden = false; $('printMenu').disabled = false; $('saveGrid').disabled = false; $('exportMenu').disabled = false; draw(); measureAllPages(); pages(); updateDashboard(); toast('Grade aberta para edição.'); $('preview').closest('.box').scrollIntoView({ behavior: 'smooth', block: 'start' }); /* Abrir leva ao início da prévia, com rolagem animada */ } catch (error) { toast(error.message || 'Não foi possível abrir a grade.'); } }
    async function deleteSavedGrid(grid) { if (!confirm('Excluir "' + grid.title + '"? Esta ação não pode ser desfeita.')) return; try { let next = savedGrids.filter(item => item.id !== grid.id), result = await SyncBackend.put(GRID_INDEX_KEY, next, savedGridsVersion); if (result.conflict) { await loadSavedGrids(); return deleteSavedGrid(grid); } savedGrids = next; savedGridsVersion = result.updated_at || savedGridsVersion; await SyncBackend.remove(GRID_KEY + grid.id); renderSavedGrids(); toast('Grade excluída.'); } catch (error) { toast(error.message || 'Não foi possível excluir a grade.'); } }
    function rowLines(r) { return code(r.code).length > 30 ? 2 : 1 } function fitRows(rows, budget) { let used = 1, out = []; for (const r of rows) { let need = rowLines(r); if (used + need > budget) break; used += need; out.push(r) } return out } function photoUrl(ovd) { let code = t(ovd).replace(/\D/g, ''); return code ? (window.PORTAL_API || 'https://portalmktovd.pages.dev/api') + '/product-image?code=' + code : '' } /* Códigos de barras aceitos: EAN-8, UPC-A (12), EAN-13 e ITF-14. `ok` = dígito verificador (GTIN) confere. */
    const GTIN_TYPES = { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'ITF-14' };
    function gtin(code) {
        let d = t(code).replace(/\D/g, '');
        /* planilha guarda o código como número: Excel/SheetJS descarta o zero à esquerda ao importar
           (ex.: UPC-A "095969624237" vira "95969624237", 11 dígitos). Repõe o zero antes de validar
           quando isso recupera um tamanho de GTIN válido, em vez de tratar o código como ausente. */
        if (!GTIN_TYPES[d.length] && GTIN_TYPES[d.length + 1]) d = '0' + d;
        if (!GTIN_TYPES[d.length]) return null;
        let sum = 0; for (let i = 0; i < d.length - 1; i++) sum += +d[d.length - 2 - i] * (i % 2 === 0 ? 3 : 1);
        return { d, type: GTIN_TYPES[d.length], ok: (10 - sum % 10) % 10 === +d[d.length - 1] };
    }
    const NO_BARCODE_PRODUCT_CODES = new Set(['1220050000', '3890302000', '3890001002', '3890075000', '6047951010']);
    function noBarcodeFor(row) { return NO_BARCODE_PRODUCT_CODES.has(t(row.ovd).replace(/\D/g, '')); }
    function barcodeOk(code) { return !!gtin(code)?.ok; }
    const barcodeApplies = () => !(S.config.layout === 'liveshop' && S.config.codeType === 'qr'); /* no Live Shop com QR Code não há código de barras para conferir */
    function hasBarcodeIssue(row) { return barcodeApplies() && !noBarcodeFor(row) && !barcodeOk(row.principal); }
    const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'], EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'], EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'], EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'], ITF = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];
    function barcodeSvg(code) {
        let info = gtin(code); if (!info) return ''; let d = info.d, rects = '', width, label = d, center;
        if (d.length === 14) { /* ITF-14: 2 de 5 intercalado (barra larga = 3 módulos) */
            let x = 10, add = (w, bar) => { if (bar) rects += '<rect x="' + x + '" y="1" width="' + w + '" height="35"/>'; x += w; };
            add(1, 1); add(1, 0); add(1, 1); add(1, 0);
            for (let i = 0; i < 14; i += 2) for (let k = 0; k < 5; k++) { add(ITF[+d[i]][k] === '1' ? 3 : 1, 1); add(ITF[+d[i + 1]][k] === '1' ? 3 : 1, 0); }
            add(3, 1); add(1, 0); add(1, 1); width = x + 10;
        } else { /* EAN-13 (UPC-A entra com 0 na frente) e EAN-8 */
            if (d.length === 12) d = '0' + d; let eight = d.length === 8, bits = '101';
            if (eight) { for (let i = 0; i < 4; i++) bits += EAN_L[+d[i]]; bits += '01010'; for (let i = 4; i < 8; i++) bits += EAN_R[+d[i]]; }
            else { let par = EAN_P[+d[0]]; for (let i = 1; i < 7; i++) bits += (par[i - 1] === 'L' ? EAN_L : EAN_G)[+d[i]]; bits += '01010'; for (let i = 7; i < 13; i++) bits += EAN_R[+d[i]]; }
            bits += '101'; let mid = eight ? 31 : 45, end = eight ? 64 : 92;
            for (let i = 0; i < bits.length; i++) if (bits[i] === '1') { let guard = i < 3 || (i >= mid && i < mid + 5) || i >= end; rects += '<rect x="' + (9 + i) + '" y="1" width="1" height="' + (guard ? 35 : 31) + '"/>'; }
            width = bits.length + 18; label = d;
        }
        return '<svg class="ean-svg" viewBox="0 0 ' + width + ' 43" role="img" aria-label="' + info.type + ' ' + info.d + '"><g fill="#000">' + rects + '</g><text x="' + width / 2 + '" y="42" text-anchor="middle" font-family="Arial" font-size="8" letter-spacing="1.1">' + label + '</text></svg>';
    }
    /* Monta o miolo de .lines a partir de uma lista final de textos de código - usada tanto pro primeiro
       render (a partir de group.rows) quanto por updateCodes() pra reconstruir em 1 ou 2 colunas depois
       de uma edição manual, sem duplicar a regra de pareamento das duas colunas nos dois lugares. */
    function codesHtml(texts, twoCols) {
        let codeLines = texts.map(text => '<div><span class="cd">' + e(text) + '</span></div>'), pairCodes = texts.map(text => '<span class="cd">' + e(text) + '</span>'), split = Math.ceil(pairCodes.length / 2);
        return twoCols ? pairCodes.slice(0, split).map((left, index) => { let right = pairCodes[split + index]; return '<div class="code-pair">' + left + (right ? '<span class="code-separator" aria-hidden="true">|</span>' + right : '') + '</div>'; }).join('') : codeLines.join('');
    }
    function card(item, idx, pageIndex, probe = false) { if (S.pages[pageIndex].layout === 'liveshop') return liveCard(item, idx, pageIndex, probe); let group = item.group, row = group.rows[0], displayTitle = item.title || title(group).toUpperCase(), photoState = item.photo || { x: 0, y: 0, scale: 1 }, a3 = S.pages[pageIndex].format === 'A3', url = photoUrl(row.ovd), photo = probe ? '' : (url ? '<img src="' + e(url) + '" alt="' + e(group.title) + '" crossorigin="anonymous" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>Foto indisponível<br>Cód. ' + e(row.ovd) + '</span>' : '<span>Sem código</span>'), big = item.size === 2,
    /* renderiza TODAS as variacoes (nao so uma estimativa por caractere de quantas cabem) - quem decide
       o corte real e trimOverflow(), chamado em draw() depois do card estar no DOM, medindo a altura
       verdadeira renderizada (ver comentario la). Isso substitui o corte antecipado via fitRows()/
       rowLines() que so servia pra ESTIMAR - o card real de 23 variacoes que motivou essa troca media
       1 variacao a menos do que cabia de verdade na caixa (23 linhas de 15.6px cabem em max-height:390px,
       a conta de fitRows(rows,24) so permitia 22) */
    /* item.linesOverride guarda { html, count, twoCols } da edição manual (ex.: apagar um código direto
       no cartão) - sem isso o próximo draw() (troca de marca, desfazer, e principalmente a exportação,
       que sempre redesenha antes de gerar a imagem) recriava os códigos do zero a partir de group.rows
       e o card "resetava". A quantidade vem da edição, mas o número de colunas é recalculado pelo formato
       atual. Grades antigas que salvaram twoCols incorreto são reconstruídas uma vez, preservando os textos
       editados e corrigindo a prévia e a exportação. */
    override = item.linesOverride, codeCount = override ? override.count : group.rows.length, twoCols = twoCodeColumns(codeCount, a3);
    if (override && override.twoCols !== twoCols) {
        let template = document.createElement('template'); template.innerHTML = override.html; override = item.linesOverride = { html: codesHtml([...template.content.querySelectorAll('.cd')].map(span => t(span.textContent)).filter(Boolean), twoCols), count: codeCount, twoCols };
    }
    let lines = override ? override.html : codesHtml(group.rows.map(r => code(r.code)), twoCols), style = 'grid-column:' + (item.col + 1) + ';grid-row:' + (item.gridRow + 1) + ' / span ' + item.size + ';--card-extra:' + (item.extraHeight || 0) + 'px', eanSvg = noBarcodeFor(row) ? '<span class="ean-product-code">Consulte o item pelo código do produto.</span>' : barcodeSvg(row.principal), eanInfo = gtin(row.principal); return '<article class="card' + (big ? ' big' : '') + (a3 ? ' a3' : '') + (item.center ? ' center' : '') + (item.pair ? ' pair' : '') + (item.extraHeight ? ' expand' : '') + '" data-codes="' + codeCount + '"' + (hasBarcodeIssue(row) ? ' data-bad-barcode="1"' : '') + ' data-idx="' + idx + '" data-page="' + pageIndex + '" style="' + style + '">' + '<div class="cutwarn" hidden title="Esses códigos não aparecem no cartão - avise quem for revisar"></div>' + '<h3 contenteditable="true" spellcheck="true" oninput="updateTitle(this);centerPhoto(this.closest(\'.card\'))">' + (item.titleHtml ? CartazTitleFormat.clean(item.titleHtml) : e(displayTitle)) + '</h3><div class="photo" title="Dê dois cliques para editar a foto" style="transform:translate(' + photoState.x + 'px,' + photoState.y + 'px) scale(' + photoState.scale + ')">' + photo + '</div><div class="lines' + (twoCols ? ' two-cols' : '') + '" contenteditable="true" spellcheck="false" oninput="updateCodes(this)">' + lines + '</div>' + (eanSvg ? '<div class="ean' + (noBarcodeFor(row) || eanInfo.ok ? '' : ' ean-invalid') + '" onclick="addBarcode(this)" title="' + (eanInfo.ok ? 'Clique para editar o código de barras' : 'Dígito verificador não confere: clique para corrigir o código antes de imprimir') + '">' + eanSvg + '</div>' : '<div class="ean ean-missing" onclick="addBarcode(this)" title="Adicionar código de barras manualmente (EAN-8, UPC-A, EAN-13 ou ITF-14) - não aparece na impressão até ser preenchido">+ Código de barras</div>') + '<small>' + (S.codes[row.ovd] ? 'WMF ' + e(row.ovd) + ' encontrado' : 'WMF ' + e(row.ovd) + ' pendente') + '</small></article>' } /* A3: os códigos ficam numa coluna só, no tamanho normal; só reduz a fonte (.dense) se a lista alcançaria o título */
    /* Divisões (Osten, Dismatal, VONDER): cada divisão marcada em "Configurações do cartaz" repete as folhas com a faixa de cor e o link dela.
       O link sugerido de cada box é o domínio B2B da divisão + o Código FG da 1ª linha do produto (mesma linha que dá a foto); pode ser editado por box. */
    const DIVISIONS = [{ id: 'osten', name: 'Osten', color: '#ED8B00', base: 'https://b2b.osten.com.br/produtos/' }, { id: 'dismatal', name: 'Dismatal', color: '#FFED00', base: 'https://b2b.dismatal.com.br/produtos/' }, { id: 'vonder', name: 'VONDER', color: '#F6BE00', base: 'https://b2b.vonder.com.br/produtos/' },
        /* demais marcas do portal: sem loja B2B conhecida, então o link do box vem do link do grupo (ou é digitado à mão) */
        { id: 'ferramentas-gerais', name: 'Ferramentas Gerais', color: '#005745' }, { id: 'toolmix', name: 'Toolmix', color: '#F26522' }, { id: 'dwt', name: 'DWT', color: '#285C4D' },
        { id: 'nove54', name: 'Nove54', color: '#BD1D1D' }, { id: 'grupo-ovd', name: 'Grupo OVD', color: '#A6A6A6' }, { id: 'pilar-tecnologia', name: 'Pilar Tecnologia', color: '#003A5D' }];
    const divisionColor = division => S.config.divisionColors?.[division.id] || division.color;
    const activeDivisions = () => S.config.layout === 'liveshop' ? DIVISIONS.filter(division => S.config.divisions.includes(division.id)) : [];
    const suggestedLink = (item, division) => { let fg = t(item.group.rows[0].fg); return (division && item.group.divLinks?.[division.id]) || (division?.base && fg ? division.base + encodeURIComponent(fg) : t(item.group.link)); };
    const boxLink = (item, division) => item.links?.[division?.id || '_'] ?? suggestedLink(item, division);
    const validUrl = value => { try { return /^https?:$/.test(new URL(value).protocol); } catch (_) { return false; } };
    const inkFor = hex => { let n = parseInt(String(hex).replace('#', ''), 16) || 0, luma = .299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255); return luma > 150 ? '#000' : '#fff'; };
    /* QR em SVG (mesma biblioteca do Gerador de QR Codes): um só <path> com um quadradinho por módulo escuro, margem de 1 módulo. */
    function qrSvg(text) {
        try {
            if (qrcode.stringToBytesFuncs) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
            let qr = qrcode(0, 'M'); qr.addData(text); qr.make(); let size = qr.getModuleCount(), path = '';
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.isDark(y, x)) path += 'M' + (x + 1) + ' ' + (y + 1) + 'h1v1h-1z';
            return '<svg class="qr-svg" viewBox="0 0 ' + (size + 2) + ' ' + (size + 2) + '" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="100%" height="100%" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
        } catch (_) { return ''; }
    }
    function editLink(el) {
        let card = el.closest('.card'), item = S.pages[+card.dataset.page].items[+card.dataset.idx], key = el.closest('.sheet').dataset.division || '', division = DIVISIONS.find(d => d.id === key) || null, slot = key || '_',
            dialog = $('linkDialog'), input = $('linkInput'), status = $('linkStatus'), save = $('linkSave'), toggle = $('linkButtonToggle'), suggested = suggestedLink(item, division);
        $('linkDialogTitle').textContent = 'Link do box' + (division ? ' · ' + division.name : '');
        $('linkDialogText').textContent = 'Vale só para este box' + (division ? ' na folha da divisão ' + division.name : '') + (suggested ? '. Link sugerido: ' + suggested : '. Sem Código FG para sugerir um link.');
        input.value = boxLink(item, division); toggle.checked = item.showButton !== false; toggle.disabled = !S.config.button;
        let check = () => { let value = input.value.trim(), ok = !value || validUrl(value); status.textContent = ok ? (value ? '' : 'Sem link: este box fica sem QR Code e sem botão.') : 'Informe um link completo, começando com http:// ou https://.'; status.dataset.kind = ok ? '' : 'bad'; save.disabled = !ok; };
        input.oninput = check; check(); $('linkSuggest').onclick = () => { input.value = suggested; check(); };
        save.onclick = () => { let value = input.value.trim(); snapshot(); item.links = { ...item.links }; if (value === suggested) delete item.links[slot]; else item.links[slot] = value; if (toggle.checked) delete item.showButton; else item.showButton = false; draw(); updateDashboard(); toast('Link do box atualizado.'); };
        input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); if (!save.disabled) save.click(); } };
        dialog.returnValue = ''; dialog.showModal(); input.focus(); input.select();
    }
    /* Layout Live Shop do box: título, [QR/código de barras + quantidade mínima | foto] e tabela Descrição | código (linhas zebradas).
       Reaproveita a edição de título (updateTitle), foto (.photo) e código de barras (addBarcode) do box da Feira. */
    const qtyText = value => { let v = t(value), digits = /^\d+$/.test(v) ? +v : 0; return digits ? String(digits).padStart(2, '0') + (digits === 1 ? ' unidade' : ' unidades') : v; };
    /* quebra o texto do botão em 2 linhas equilibradas (ponto de quebra mais perto do meio), igual em todos os cards - inclusive no destaque, onde sobra largura */
    function balancedBreak(text) {
        let words = t(text).split(' ').filter(Boolean); if (words.length < 2) return '<span>' + e(text) + '</span>';
        let best = 1, gap = Infinity; for (let i = 1; i < words.length; i++) { let d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < gap) { gap = d; best = i; } }
        return '<span>' + e(words.slice(0, best).join(' ')) + '<br>' + e(words.slice(best).join(' ')) + '</span>'; /* span: o botão é grid, um <br> solto viraria uma linha vazia */
    }
    /* depois de um arrasto o navegador dispara um click no elemento solto: engole esse click (e solta o ouvinte se ele não vier) */
    function swallowNextClick(ms) { let eat = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', eat, true), ms); }
    /* Reordenar os cards da marca pelo menu: mesmo gesto do Gerador de Consolidado - arrastar a alça ⋮⋮ (pointer events), um cartão fantasma segue o mouse,
       o lugar vazio (tracejado) mostra onde o produto vai cair e os vizinhos deslizam (FLIP). Ao soltar, move o produto na lista da marca e
       redistribui nas folhas mantendo a quantidade de cada folha. */
    function applyCardOrder(items) {
        let pagesOfBrand = S.pages.filter(page => page.brand === S.brand);
        if (CartazCards.sameOrder(pagesOfBrand, items)) return pages();
        let before = pagesOfBrand.map(page => page.items.slice()); snapshot(); CartazCards.distribute(pagesOfBrand, items);
        redrawPages(pagesOfBrand.filter((page, i) => page.items.some((item, j) => item !== before[i][j])));
    }
    function bindCardDrag(root) {
        let panel = root.closest('.pages');
        root.querySelectorAll('.brand-card-row').forEach(card => {
            /* segurar (350ms, ou Shift na hora) em qualquer ponto do cabeçalho do cardzinho arrasta; só a seta continua abrindo/fechando o cardzinho */
            card.onpointerdown = down => {
                if (down.button || !down.target.closest('.bc-head') || down.target.closest('.bc-kebab, .bc-cut')) return;
                let x = down.clientX, y = down.clientY, hold = 0, stop = () => { clearTimeout(hold); document.removeEventListener('pointermove', watch); document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop); },
                    watch = move => { if (Math.hypot(move.clientX - down.clientX, move.clientY - down.clientY) > 6) stop(); else { x = move.clientX; y = move.clientY; } };
                if (down.shiftKey) { down.preventDefault(); return startDrag(down.clientX, down.clientY); }
                hold = setTimeout(() => { stop(); startDrag(x, y); }, 350); document.addEventListener('pointermove', watch); document.addEventListener('pointerup', stop); document.addEventListener('pointercancel', stop);
            };
            let startDrag = (startX, startY) => {
                card.querySelector('.bc-body')?.remove();
                let box = card.getBoundingClientRect(), grabX = startX - box.left, grabY = startY - box.top, ghost = card.cloneNode(true);
                ghost.classList.add('drag-ghost'); ghost.style.cssText = 'left:' + box.left + 'px;top:' + box.top + 'px;width:' + box.width + 'px'; document.body.style.cursor = 'grabbing'; panel.appendChild(ghost); /* dentro de .pages: os estilos dos controles do cardzinho são escopados nele */ card.classList.add('drag-placeholder');
                let pointerY = startY, scrollSpeed = 0, frame = 0, ended = false, rowsOf = () => [...root.querySelectorAll('.brand-card-row')];
                let place = () => {
                    let before = rowsOf().filter(entry => entry !== card).find(entry => { let r = entry.getBoundingClientRect(); return pointerY < r.top + r.height / 2; }) || null;
                    if (card.nextElementSibling === before) return;
                    let first = new Map(rowsOf().map(entry => [entry, entry.getBoundingClientRect().top]));
                    root.insertBefore(card, before);
                    first.forEach((top, entry) => { let shift = top - entry.getBoundingClientRect().top; if (!shift || entry === card) return; entry.style.transition = 'none'; entry.style.transform = 'translateY(' + shift + 'px)'; requestAnimationFrame(() => { entry.style.transition = 'transform .18s ease'; entry.style.transform = ''; }); });
                };
                let tick = () => { if (ended) return; if (scrollSpeed) { panel.scrollTop += scrollSpeed; place(); } frame = requestAnimationFrame(tick); };
                let onMove = move => { pointerY = move.clientY; ghost.style.transform = 'translate(' + (move.clientX - grabX - box.left) + 'px,' + (pointerY - grabY - box.top) + 'px) scale(1.02)'; let area = panel.getBoundingClientRect(); scrollSpeed = pointerY < area.top + 48 ? -8 : pointerY > area.bottom - 48 ? 8 : 0; place(); };
                let finish = commit => {
                    if (ended) return; ended = true; document.body.style.cursor = ''; cancelAnimationFrame(frame); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel);
                    swallowNextClick(400); /* o soltar não deve abrir/fechar o cardzinho */
                    let slot = card.getBoundingClientRect(); ghost.style.transition = 'transform .16s ease, opacity .16s ease'; ghost.style.transform = 'translate(' + (slot.left - box.left) + 'px,' + (slot.top - box.top) + 'px)'; ghost.style.opacity = '.6';
                    setTimeout(() => {
                        ghost.remove(); card.classList.remove('drag-placeholder');
                        if (!commit) { pages(); return; }
                        let at = id => cardAt(id).item;
                        applyCardOrder(rowsOf().map(row => at(row.querySelector('[data-open-card]').dataset.openCard)));
                    }, 170);
                };
                let onUp = () => finish(true), onCancel = () => finish(false);
                document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onCancel); tick();
            };
        });
    }
    /* Expandir/recolher com a mesma animação do editor de posts (grid-template-rows 1fr <-> 0fr, .25s). Abrir: renderiza fechado e solta no quadro seguinte.
       Fechar: fecha o que está na tela e só tira do estado quando a transição termina (o redesenho da lista apagaria o elemento no meio). */
    const COLLAPSE_MS = 250;
    function animateOpen() { requestAnimationFrame(() => requestAnimationFrame(() => { $('list').querySelectorAll('.bc-collapse.is-closed').forEach(el => el.classList.remove('is-closed')); S.animBrand = false; S.animCard = null; })); }
    function toggleCard(id) {
        let list = S.openCard || (S.openCard = []), item = cardAt(id).item; /* guarda o item (não a posição): excluir, desfazer ou reordenar não deslocam o cardzinho aberto */
        if (!list.includes(item)) { list.push(item); S.animCard = item; pages(); return animateOpen(); }
        let body = $('list').querySelector('[data-open-card="' + id + '"]')?.closest('.brand-card-row')?.querySelector('.bc-collapse'); if (body) body.classList.add('is-closed');
        setTimeout(() => { let at = list.indexOf(item); if (at >= 0) list.splice(at, 1); pages(); }, body ? COLLAPSE_MS : 0);
    }
    function toggleBrandCards() {
        if (!S.cardsOpen) { S.cardsOpen = true; S.animBrand = true; pages(); return animateOpen(); }
        let wrap = $('list').querySelector('.bc-collapse > .bc-collapse-inner > .brand-cards')?.closest('.bc-collapse'); if (wrap) wrap.classList.add('is-closed');
        setTimeout(() => { S.cardsOpen = false; pages(); }, wrap ? COLLAPSE_MS : 0);
    }
    /* Menu "⋮" de cada cardzinho (Editar, Destaque, Substituir foto, Excluir produto): mesmo padrão do Gerador de Consolidado, em fixed para não ser cortado pela rolagem do painel */
    const icon = paths => PortalShell.svgIcon(paths, 16);
    const KEBAB = icon('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'), MENU_ICONS = { edit: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'), star: icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'), upload: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'), trash: icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'), check: icon('<polyline points="20 6 9 17 4 12"/>'), up: icon('<path d="m18 15-6-6-6 6"/>'), down: icon('<path d="m6 9 6 6 6-6"/>') };
    let cardMenu = null, photoTarget = null; const photoInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true }); document.body.appendChild(photoInput);
    const cardAt = id => { let [pi, ii] = id.split(':').map(Number); return { page: S.pages[pi], item: S.pages[pi].items[ii] }; };
    /* mover um produto uma posição na lista da marca (menu ⋮ e Alt+↑/↓): alternativa por teclado ao arrastar */
    const brandItems = () => S.pages.filter(page => page.brand === S.brand).flatMap(page => page.items);
    function moveCard(item, step) {
        let next = CartazCards.move(brandItems(), item, step); if (!next) return; applyCardOrder(next);
        requestAnimationFrame(() => [...$('list').querySelectorAll('[data-open-card]')].find(button => cardAt(button.dataset.openCard).item === item)?.focus()); /* o redesenho recria a lista: devolve o foco ao produto movido */
    }
    /* Aviso de espaço vazio: folha Live Shop com células sem box e o atalho que transforma o último produto em destaque */
    function emptyNote(page, pageIndex, brandPageIndex, brandPages) {
        let hint = page.layout === 'liveshop' && CartazCards.emptyHint(page); if (!hint) return '';
        let where = brandPages > 1 ? 'Folha ' + (brandPageIndex + 1) + ' de ' + brandPages + ': ' : '', id = pageIndex + ':' + page.items.indexOf(hint.item);
        return '<div class="empty-note" data-html2canvas-ignore><span>' + e(where) + hint.empty + (hint.empty === 1 ? ' espaço vazio.' : ' espaços vazios.') + ' Sugestão: tornar «' + e(plainTitle(hint.item) || 'produto') + '» destaque.</span><button type="button" data-fill="' + id + '">Preencher com destaque</button></div>';
    }
    /* Redesenho incremental: troca só o card editado (em todas as divisões) em vez de refazer a prévia e a lista inteiras */
    function redrawCard(item) {
        let hiddenBefore = S.pages.reduce((sum, page) => sum + page.items.reduce((inner, entry) => inner + (entry.hiddenCodes || 0), 0), 0), division = S.curDivision;
        S.pages.forEach((page, pi) => page.items.forEach((entry, ii) => {
            if (entry !== item) return;
            document.querySelectorAll('#preview .card.lb[data-page="' + pi + '"][data-idx="' + ii + '"]').forEach(old => {
                S.curDivision = DIVISIONS.find(d => d.id === old.closest('.sheet')?.dataset.division) || null; item.hiddenCodes = 0;
                let holder = document.createElement('div'); holder.innerHTML = card(item, ii, pi); let fresh = holder.firstElementChild; old.replaceWith(fresh); trimOverflow(fresh); fresh.querySelectorAll('.photo').forEach(enablePhotoEditing);
            }); syncQr();
        }));
        S.curDivision = division; updateDashboard();
        return S.pages.reduce((sum, page) => sum + page.items.reduce((inner, entry) => inner + (entry.hiddenCodes || 0), 0), 0) !== hiddenBefore; /* true: mudou a contagem de códigos ocultos (alerta da marca) */
    }
    function setWide(id, on) { let { page, item } = cardAt(id); snapshot(); if (on) item.wide = true; else delete item.wide; CartazPagination.placeLive(page); redrawPages([page]); }
    function readPhoto(file) {
        return new Promise((resolve, reject) => {
            if (!/^image\//.test(file.type)) return reject(new Error('Envie uma imagem (PNG de preferência).')); if (file.size > 12 * 1024 * 1024) return reject(new Error('A imagem deve ter no máximo 12 MB.'));
            let reader = new FileReader(); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
            reader.onload = () => { let image = new Image(); image.onerror = () => reject(new Error('A imagem não é válida.')); image.onload = () => { let k = Math.min(1, 800 / Math.max(image.width, image.height)), canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * k); canvas.height = Math.round(image.height * k); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); /* webp com transparência: a foto vai dentro da grade salva (SyncBackend), então precisa ser pequena */
                let data = canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', .82); if (data.length > 400000) return reject(new Error('Imagem muito pesada para salvar na grade. Reduza a resolução ou o detalhe.')); resolve(data); }; image.src = reader.result; }; reader.readAsDataURL(file);
        });
    }
    photoInput.onchange = async () => { let file = photoInput.files[0], item = photoTarget; photoInput.value = ''; if (!file || !item) return; try { let data = await readPhoto(file); snapshot(); item.photoSrc = data; item.photo = { x: 0, y: 0, scale: 1 }; draw(); toast('Foto do produto substituída.'); } catch (error) { toast(error.message); } };
    function closeCardMenu() { if (!cardMenu) return; cardMenu.remove(); cardMenu = null; document.removeEventListener('pointerdown', onMenuOutside, true); document.removeEventListener('keydown', onMenuKey, true); document.removeEventListener('scroll', closeCardMenu, true); window.removeEventListener('resize', closeCardMenu); }
    function onMenuOutside(event) { if (cardMenu && !cardMenu.contains(event.target) && !event.target.closest('.bc-kebab')) closeCardMenu(); }
    function onMenuKey(event) { if (event.key === 'Escape') closeCardMenu(); }
    function openCardMenu(button) {
        let id = button.dataset.cardMenu, same = cardMenu && cardMenu.dataset.for === id; closeCardMenu(); if (same) return;
        let { page, item } = cardAt(id), entries = [
            { icon: MENU_ICONS.edit, label: 'Editar', run: () => { if (!(S.openCard || []).includes(item)) toggleCard(id); } },
            { icon: MENU_ICONS.star, label: 'Destaque', checked: item.wide, disabled: page.cols < 2, run: () => setWide(id, !item.wide) },
            { icon: MENU_ICONS.upload, label: 'Substituir foto', run: () => { photoTarget = item; photoInput.click(); } },
            { icon: MENU_ICONS.up, label: 'Mover para cima', disabled: brandItems()[0] === item, run: () => moveCard(item, -1) },
            { icon: MENU_ICONS.down, label: 'Mover para baixo', disabled: brandItems().at(-1) === item, run: () => moveCard(item, 1) },
            'separator',
            { icon: MENU_ICONS.trash, label: 'Excluir produto', danger: true, run: () => { snapshot(); page.items = page.items.filter(entry => entry !== item); repaginate(true); toast('Produto excluído. Ctrl+Z desfaz.'); } }];
        let menu = document.createElement('div'); menu.className = 'card-menu'; menu.setAttribute('role', 'menu'); menu.dataset.for = id;
        menu.innerHTML = entries.map((entry, index) => entry === 'separator' ? '<div class="card-menu-sep" role="separator"></div>' : '<button type="button" role="menuitem" class="card-menu-item' + (entry.danger ? ' danger' : '') + '" data-index="' + index + '"' + (entry.disabled ? ' disabled' : '') + '><span class="ico">' + entry.icon + '</span><span class="txt">' + entry.label + '</span>' + (entry.checked ? '<span class="check">' + MENU_ICONS.check + '</span>' : '') + '</button>').join('');
        menu.onclick = event => { let target = event.target.closest('.card-menu-item'); if (!target || target.disabled) return; let entry = entries[+target.dataset.index]; closeCardMenu(); entry.run(); };
        document.body.appendChild(cardMenu = menu);
        /* do tamanho do cardzinho e colado logo abaixo dele (acima, se não houver espaço embaixo) */
        let box = button.closest('.brand-card-row').getBoundingClientRect(), height = menu.offsetHeight; menu.style.width = box.width + 'px'; menu.style.minWidth = '0'; menu.style.left = box.left + 'px';
        menu.style.top = (box.bottom + 4 + height > innerHeight - 8 ? Math.max(8, box.top - height - 4) : box.bottom + 4) + 'px'; menu.style.transformOrigin = box.bottom + 4 + height > innerHeight - 8 ? 'bottom center' : 'top center';
        document.addEventListener('pointerdown', onMenuOutside, true); document.addEventListener('keydown', onMenuKey, true); document.addEventListener('scroll', closeCardMenu, true); window.addEventListener('resize', closeCardMenu);
    }
    const plainTitle = CartazCards.plainTitle;
    /* miniatura da foto (a trocada ou a do código) para a lista e os resultados */
    const thumb = item => { let url = item.photoSrc || photoUrl(item.group.rows[0].ovd); return url ? '<img class="bc-thumb" loading="lazy" src="' + e(url) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '<span class="bc-thumb"></span>'; };
    /* Busca em TODAS as marcas (título, códigos e nome da marca): o resultado leva à marca, abre a lista dela e expande o cardzinho do produto */
    function resultsHtml(text) {
        if (!CartazCards.t(text)) return ''; let hits = CartazCards.search(S.pages, text);
        return hits.length ? hits.slice(0, 30).map(({ page, item, id }) => '<button type="button" class="bc-result" data-result="' + id + '">' + thumb(item) + '<span class="bc-result-text"><strong>' + e(plainTitle(item) || '(sem título)') + '</strong><small>' + e(page.brand) + ' · ' + e(code(CartazCards.lines(item)[0]?.code || '')) + '</small></span></button>').join('') + (hits.length > 30 ? '<p class="bc-empty">Mostrando 30 de ' + hits.length + ' resultados: refine a busca.</p>' : '') : '<p class="bc-empty">Nenhum produto encontrado.</p>';
    }
    function bindResults() { $('list').querySelectorAll('[data-result]').forEach(button => button.onclick = () => goToResult(button.dataset.result)); }
    function goToResult(id) {
        let { page, item } = cardAt(id), cards = S.openCard || (S.openCard = []);
        S.cardFilter = ''; /* chegou ao resultado: limpa a busca e some a lista de sugestões */ S.brand = page.brand; S.page = S.pages.findIndex(entry => entry.brand === S.brand); S.cardsOpen = true; if (!cards.includes(item)) cards.push(item);
        draw();
        requestAnimationFrame(() => { let row = [...$('list').querySelectorAll('[data-open-card]')].find(button => cardAt(button.dataset.openCard).item === item)?.closest('.brand-card-row'); if (!row) return; row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('bc-flash'); setTimeout(() => row.classList.remove('bc-flash'), 1600); });
    }
    /* mesma seta do menu lateral (portal-shell.js): chevron para baixo que gira 180° quando aberto */
    const CHEVRON = PortalShell.svgIcon('<path d="m6 9 6 6 6-6"/>', 14), CLOSE = PortalShell.svgIcon('<path d="M6 6l12 12M18 6 6 18"/>', 14);
    function liveCard(item, idx, pageIndex, probe) {
        let group = item.group, row = group.rows[0], photoState = item.photo || { x: 0, y: 0, scale: 1 }, url = item.photoSrc || photoUrl(row.ovd), displayTitle = item.title || t(group.title), /* sem a marca no fim nem caixa alta forçada: o Live Shop usa o título como vem da planilha */
            photo = probe ? '' : (url ? '<img src="' + e(url) + '" alt="' + e(group.title) + '" crossorigin="anonymous" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>Foto indisponível<br>Cód. ' + e(row.ovd) + '</span>' : '<span>Sem código</span>'),
            qr = S.config.codeType === 'qr', division = S.curDivision, link = boxLink(item, division), qrImg = qr && link ? qrSvg(link) : '',
            eanInfo = gtin(row.principal), eanSvg = noBarcodeFor(row) ? '' : barcodeSvg(row.principal),
            marker = qr ? (qrImg ? '<div class="lb-qr" data-link="' + e(link) + '" onclick="editLink(this)" title="Clique para editar o link">' + qrImg + '</div>' : '<div class="lb-qr lb-qr-missing" onclick="editLink(this)" title="Sem link: clique para informar o link do QR Code - não aparece na impressão até ser preenchido">+ Link do QR Code</div>')
                : eanSvg ? '<div class="ean' + (eanInfo?.ok ? '' : ' ean-invalid') + '" onclick="addBarcode(this)" title="Clique para editar o código de barras">' + eanSvg + '</div>' : '<div class="ean ean-missing" onclick="addBarcode(this)" title="Adicionar código de barras manualmente - não aparece na impressão até ser preenchido">+ Código de barras</div>',
            button = link && S.config.button && item.showButton !== false ? '<div class="lb-btn" data-link="' + e(link) + '" onclick="editLink(this)" style="background:' + e(S.config.buttonColor) + ';color:' + inkFor(S.config.buttonColor) + '" title="Clique para editar o link">' + balancedBreak(S.config.buttonText) + '</div>' : '',
            on = key => S.config[key] !== false, asList = S.config.tableStyle === 'list', /* campos do card que o usuário pode ocultar (config do template) */
            tableHtml = list => !(on('showDesc') || on('showCode')) ? '' : '<table class="lb-table' + (asList ? ' lb-list' : '') + (item.consult ? ' lb-fit' : '') + '">' + ('<thead><tr>' + (on('showDesc') ? '<th>Descrição' + (asList ? ':' : '') + '</th>' : '') + (on('showCode') ? '<th>' + (asList ? (lines.length > 1 ? 'Códigos:' : 'Código:') : 'Código') + '</th>' : '') + '</tr></thead>') + '<tbody>' + list.map(r => '<tr>' + (on('showDesc') ? '<td>' + e(r.desc) + '</td>' : '') + (on('showCode') ? '<td>' + e(code(r.code)) + '</td>' : '') + '</tr>').join('') + '</tbody></table>',
            lines = item.rows || group.rows, half = Math.ceil(lines.length / 2), table = !(on('showDesc') || on('showCode')) ? '' : item.span > 1 && lines.length > 1 ? '<div class="lb-tables">' + tableHtml(lines.slice(0, half)) + tableHtml(lines.slice(half)) + '</div>' : tableHtml(lines), /* destaque (2 colunas): os códigos se dividem em duas tabelas lado a lado */
            style = 'grid-column:' + (item.col + 1) + (item.span > 1 ? ' / span ' + item.span : '') + ';grid-row:' + (item.gridRow + 1);
        let corner = on('showCodeBox') && S.config.codePos === 'corner', left = (on('showCodeBox') && !corner ? marker : '') + button + (on('showQty') && (item.minQty ?? group.minQty) ? '<p class="lb-qty">Quantidade mínima:<br>' + e(qtyText(item.minQty ?? group.minQty)) + '</p>' : '');
        return '<article class="card lb' + (item.flip ? ' flip' : '') + (item.span > 1 ? ' wide' : '') + '" data-codes="' + lines.length + '"' + (!qr && on('showCodeBox') && hasBarcodeIssue(row) ? ' data-bad-barcode="1"' : '') + ' data-idx="' + idx + '" data-page="' + pageIndex + '" style="' + style + '"><div class="cutwarn" hidden role="button" onclick="cutDialog(this)" title="Essas linhas não aparecem no cartão - clique para ver as opções"></div>'
            + (on('showTitle') ? '<h3 contenteditable="true" spellcheck="true" oninput="updateTitle(this)" style="text-align:' + (S.config.titleAlign || 'center') + (item.titleScale ? ';font-size:calc(' + (11.5 * item.titleScale).toFixed(2) + 'px * var(--u))' : '') + '">' + (item.titleHtml ? CartazTitleFormat.clean(item.titleHtml, { keepBr: true }) : e(displayTitle)) + '</h3>' : '')
            + (left || on('showPhoto') ? '<div class="lb-body' + (!left || !on('showPhoto') ? ' solo' : '') + '">' + (left ? '<div class="lb-left">' + left + '</div>' : '')
                + (on('showPhoto') ? '<div class="lb-right"><div class="photo" title="Dê dois cliques para editar a foto" style="transform:translate(' + photoState.x + 'px,' + photoState.y + 'px) scale(' + photoState.scale + ')">' + photo + '</div></div>' : '') + '</div>' : '')
            + (corner ? '<div class="lb-foot' + (on('showDesc') ? ' stack' : '') + '">' + table + marker + '</div>' : table) + '</article>';
    }
    /* Box de logo (1ª célula da folha): logo do evento (a "Logo" do template) + o texto de atenção da configuração. */
    function logoBoxHtml(page) { let title = S.config.attentionTitleOn !== false, text = S.config.attentionTextOn !== false, corner = page.corner || 'tl', col = corner[1] === 'l' ? 1 : page.cols, row = corner[0] === 't' ? 1 : page.rows; return '<div class="lb-logobox' + (title || text ? '' : ' solo') + '" style="grid-column:' + col + ';grid-row:' + row + '">' + (S.logo ? '<img src="' + e(S.logo) + '" alt="">' : '<span class="lb-logo-empty">Logo do evento</span>') + (title || text ? '<p class="lb-attn" style="color:' + e(S.config.attentionColor) + '">' + (title ? '<strong>' + e(S.config.attentionTitle) + '</strong>' : '') + (text ? e(S.config.attentionText).replace(/\n/g, '<br>') : '') + '</p>' : '') + '</div>'; }
    /* Corta as linhas da tabela que não cabem no box (mantém ao menos 1 e uma área mínima para a foto) e avisa, como o corte de códigos da Feira. */
    function fitButton(card) {
        let btn = card.querySelector('.lb-btn'); if (btn && btn.firstChild) { btn.style.width = ''; let range = document.createRange(); range.selectNodeContents(btn); let wide = Math.max(0, ...[...range.getClientRects()].map(r => r.width)); if (wide) btn.style.width = Math.min(btn.parentNode.clientWidth, Math.ceil(wide) + 12) + 'px'; }
    }
    /* o Live Shop foi desenhado para um card de 177 px (4 colunas no A4): em cards maiores (2 ou 3 colunas, A3) tudo cresce na mesma proporção, via --u */
    const LIVE_BASE_W = 177, LIVE_BASE_H = 199, /* altura do card de 4 colunas no A4 sem header (1123 - 40 - 56 - 4 x 8 de vão, em 5 linhas): é nela que cabem ~9 códigos */ cardScale = (card, span) => { let byWidth = card.offsetWidth / (span > 1 ? span : 1) / LIVE_BASE_W; /* card pequeno e mais baixo que o desenho (ex.: 3 colunas com header completo): o conteúdo escala pela altura, para os códigos não serem cortados; sobra largura, não altura */ return Math.max(.8, span > 1 || byWidth > 1.3 ? byWidth : Math.min(byWidth, card.offsetHeight / LIVE_BASE_H)).toFixed(3); };
    /* Cards largos (2 ou 3 colunas) não esticam até preencher a folha (nem na largura, se a altura não der): a altura vira uma proporção do card (LIVE_RATIO x a largura), o conjunto fica centralizado
       na vertical e sobra espaço vazio embaixo. Nos cards pequenos (4+ colunas) nada muda: as linhas dividem a folha. */
    const LIVE_RATIO = 1, LIVE_RATIO_TALL = 1.3;
    function fitLiveRows(sheet) {
        if (!sheet.classList.contains('lb-sheet')) return; sheet.style.removeProperty('--rowh'); sheet.style.removeProperty('--colw');
        let style = getComputedStyle(sheet), colW = parseFloat(style.gridTemplateColumns.split(' ')[0]), page = S.pages[+sheet.dataset.page]; if (!colW || !page || colW / LIVE_BASE_W <= 1.3) return;
        let gap = parseFloat(style.rowGap) || 0, room = sheet.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - gap * (page.rows - 1);
        let ratio = page.rows >= 4 ? LIVE_RATIO_TALL : LIVE_RATIO, rowH = Math.floor(Math.min(colW * ratio, room / page.rows)); sheet.style.setProperty('--rowh', rowH + 'px'); /* 4+ linhas: o card pode passar da proporção e ocupar o espaço livre da folha */
        if (rowH < Math.floor(colW * LIVE_RATIO)) sheet.style.setProperty('--colw', Math.floor(rowH / LIVE_RATIO) + 'px'); /* sem altura para o card esticar na largura: as colunas encolhem para manter a proporção do card, e o fundo aparece nas laterais */
    }
    /* QR de tamanho único no cartaz: cada card encolhe o QR até caber (trimLive guarda em data-qk) e todos adotam o menor valor */
    function syncQr() { let cards = [...document.querySelectorAll('#preview .card.lb')], min = Math.min(1, ...cards.map(card => +card.dataset.qk || 1)); cards.forEach(card => card.style.setProperty('--qk', min));
        let tk = Math.min(1, ...cards.map(card => +card.dataset.tk || 1)); /* idem para o título: todos adotam o menor encolhimento (o ajuste manual A+/A- de cada card é mantido por cima) */
        cards.forEach(card => { let h3 = card.querySelector('h3'), item = S.pages[+card.dataset.page].items[+card.dataset.idx]; if (h3) h3.style.fontSize = 'calc(' + (11.5 * (item.titleScale || 1) * tk).toFixed(2) + 'px * var(--u))'; }); }
    function trimLive(card) {
        card.style.setProperty('--u', cardScale(card, S.pages[+card.dataset.page].items[+card.dataset.idx].span));
        /* foto salva fora dos limites da coluna (zoom/posição antigos) é ajustada ao desenhar; a medição invisível não ajusta para não gravar medidas erradas */
        let ph = card.querySelector('.photo'), st = S.pages[+card.dataset.page].items[+card.dataset.idx].photo; photoFit(card, ph, st);
        /* botão com laterais rentes ao texto: mede a linha mais larga já quebrada e encolhe o botão a ela (CSS puro não encolhe a caixa depois da quebra) */
        fitButton(card);
        checkTitle(card); let body = card.querySelector('.lb-body') || card, rows = [...card.querySelectorAll('.lb-table tbody tr')], warn = card.querySelector('.cutwarn'), item = S.pages[+card.dataset.page].items[+card.dataset.idx], removed = 0;
        /* antes de cortar linhas, encolhe o título aos poucos (até 80%) para devolver espaço ao corpo */
        let h3 = card.querySelector('h3'), over = () => card.scrollHeight > card.clientHeight + 1 || body.scrollHeight > body.clientHeight + 1 || body.clientHeight < 40;
        /* o encolhimento nunca pode reduzir o nº de linhas do título: se um título que quebra em 2 linhas passaria a caber em 1 ao encolher, ele fica quebrado no tamanho cheio */
        let lineCount = () => Math.round(h3.scrollHeight / parseFloat(getComputedStyle(h3).lineHeight)), full = h3 ? lineCount() : 0;
        let titleSize = k => 'calc(' + (11.5 * (item.titleScale || 1) * k).toFixed(2) + 'px * var(--u))';
        let tk = 1;
        for (let k = 0.95; h3 && rows.length > 1 && over() && k >= 0.8; k -= 0.05) {
            h3.style.fontSize = titleSize(k); tk = k;
            if (lineCount() < full) { h3.style.fontSize = titleSize(1); tk = 1; break; }
            checkTitle(card);
        }
        /* a coluna do QR (QR + botão + quantidade mínima) é o que mais prende a altura do corpo: encolhe o QR aos poucos (até 70%) antes de cortar códigos */
        let qk = 1, left = card.querySelector('.lb-left'); card.style.removeProperty('--qk');
        while (rows.length > 1 && (card.scrollHeight > card.clientHeight + 1 || body.scrollHeight > body.clientHeight + 1 || body.clientHeight < 40)) {
            if (left && qk > .7 && left.scrollHeight >= body.clientHeight - 1 && left.querySelector('.lb-qr')) { qk = Math.round((qk - .05) * 100) / 100; card.style.setProperty('--qk', qk); continue; }
            rows.pop().remove(); removed++;
        }
        card.dataset.qk = qk; card.dataset.tk = tk; item.hiddenCodes = removed; if (warn && removed) { warn.hidden = false; warn.textContent = '⚠ +' + removed + ' linha' + (removed === 1 ? '' : 's') + ' fora do cartão'; }
        photoFit(card, ph, st); /* o rodapé já tem a altura final: reconfere a foto */
    }
    function fitLines(card) {
        let lines = card.querySelector('.lines'), h3 = card.querySelector('h3'); if (!lines || !h3) return; lines.style.maxHeight = '';
        if (card.classList.contains('a3')) { lines.classList.remove('dense', 'denser'); if (lines.scrollHeight > lines.getBoundingClientRect().bottom - h3.getBoundingClientRect().bottom - 6) lines.classList.add('dense'); if (lines.classList.contains('dense') && lines.scrollHeight > lines.clientHeight) lines.classList.add('denser'); }
        /* nunca deixa a lista subir sobre o título: se não couber, limita a altura e o excedente vira aviso "fora do cartão" */
        let room = lines.getBoundingClientRect().bottom - h3.getBoundingClientRect().bottom; if (lines.clientHeight > room) lines.style.maxHeight = Math.max(room, 0) + 'px';
    }
    function checkTitle(card) { let h3 = card.querySelector('h3'); if (!h3) return; let cut = h3.scrollHeight > h3.clientHeight + 1; card.classList.toggle('title-cut', cut); h3.title = cut ? 'Título cortado: encurte o texto para ele caber no cartão' : ''; }
    function trimOverflow(card) { if (card.classList.contains('lb')) return trimLive(card); checkTitle(card); /* mede a altura real da lista depois do layout. Em duas colunas, cada .code-col
       contem varias linhas: tratar a coluna inteira como uma unica linha apagava a coluna direita inteira.
       Por isso calcula quantas linhas cabem em CADA coluna e redistribui as linhas visiveis de forma equilibrada. */ let lines = card.querySelector('.lines'), warn = card.querySelector('.cutwarn'); fitLines(card); if (!lines || lines.scrollHeight <= lines.clientHeight) return;
    let item = S.pages[+card.dataset.page].items[+card.dataset.idx], top = lines.getBoundingClientRect().top, showWarning = removed => { item.hiddenCodes = removed; if (warn && removed > 0) { warn.hidden = false; warn.textContent = '⚠ +' + removed + ' código' + (removed === 1 ? '' : 's') + ' fora do cartão'; } };
    if (lines.classList.contains('two-cols')) { let rows = [...lines.querySelectorAll('.code-pair')], cut = rows.findIndex(row => row.getBoundingClientRect().bottom - top > lines.clientHeight); if (cut < 0) return; let removed = rows.slice(cut).reduce((sum, row) => sum + row.querySelectorAll('.cd').length, 0); rows.slice(cut).forEach(row => row.remove()); showWarning(removed); return; }
    let cut = [...lines.children].findIndex(child => child.getBoundingClientRect().bottom - top > lines.clientHeight); if (cut < 0) return; cut = Math.max(cut, 1); let removed = lines.children.length - cut; while (lines.children.length > cut) lines.removeChild(lines.lastElementChild); showWarning(removed); } function measureAllPages() { S.curDivision = activeDivisions()[0] || null; let probe = document.createElement('div'); probe.className = 'cartaz-measure'; probe.innerHTML = S.pages.map((page, pageIndex) => '<div class="sheet ' + page.format.toLowerCase() + gridClass(page) + '"' + gridStyle(page) + ' data-page="' + pageIndex + '">' + page.items.map((item, index) => card(item, index, pageIndex, true)).join('') + '</div>').join(''); document.body.append(probe); S.pages.forEach(page => page.items.forEach(item => item.hiddenCodes = 0)); probe.querySelectorAll('.sheet').forEach(sheet => { fitLiveRows(sheet); sheet.querySelectorAll('.card').forEach(trimOverflow); }); probe.remove(); } /* Linhas que não cabem no cartão: "Tratar na planilha" só fecha (a pessoa corrige a planilha); "Consulte códigos" troca a tabela do card por uma linha única (vale só neste cartaz; Ctrl+Z desfaz). */
    function cutDialog(source) {
        let item = source instanceof Element ? S.pages[+source.closest('.card').dataset.page].items[+source.closest('.card').dataset.idx] : source, dialog = $('cutDialog'), count = item.hiddenCodes || 0;
        $('cutDialogText').textContent = count + (count === 1 ? ' linha da tabela não cabe' : ' linhas da tabela não cabem') + ' no cartão e ' + (count === 1 ? 'fica' : 'ficam') + ' de fora da impressão. Corrija na planilha (por exemplo, excluindo códigos) ou troque a tabela por uma linha única.';
        dialog.returnValue = ''; dialog.onclose = () => { if (dialog.returnValue !== 'consult') return; snapshot(); item.consult = { before: item.rows || null }; item.rows = [{ desc: 'Vários modelos', code: 'Consulte códigos' }]; item.hiddenCodes = 0; draw(); measureAllPages(); pages(); updateDashboard(); toast('Tabela substituída por "Consulte códigos".'); }; dialog.showModal();
    }
    /* desfaz o "Consulte códigos" pela lista lateral: volta a tabela de antes (e o aviso de linhas fora do cartão, se ainda não couberem) */
    function undoConsult(item) { snapshot(); if (item.consult.before) item.rows = item.consult.before; else delete item.rows; delete item.consult; draw(); measureAllPages(); pages(); updateDashboard(); toast('Tabela original restaurada.'); }
    function addBarcode(el) { /* preenche na hora um EAN que faltou na planilha (coluna CODIGO PRINCIPAL vazia) - reusa
        ean13() e o proprio fluxo de render (S.pages[...].group.rows[0].principal + draw()) em vez de
        desenhar o svg na mao, pra ficar identico a um codigo que veio da planilha. So aparece na tela
        (.ean-missing tem @media print{display:none} - ver .card .ean abaixo), então quem esquecer de
        preencher continua imprimindo a área em branco de sempre, sem risco de imprimir o texto do botão */ let card = el.closest('.card'), row = S.pages[+card.dataset.page].items[+card.dataset.idx].group.rows[0], invalid = !!card.querySelector('.ean-invalid'), missing = !!card.querySelector('.ean-missing'), dialog = $('barcodeDialog'), input = $('barcodeInput'), status = $('barcodeStatus'), save = $('barcodeSave');
        $('barcodeDialogTitle').textContent = invalid ? 'Corrigir código de barras' : missing ? 'Adicionar código de barras' : 'Editar código de barras';
        $('barcodeDialogText').textContent = invalid ? 'O dígito verificador do código atual não confere. Digite o código correto (está na embalagem ou no cadastro do produto).' : missing ? 'Este produto não veio com código de barras na planilha. Digite o código para ele aparecer no cartaz.' : 'Altere o código de barras deste produto. Vale só para este cartaz.';
        /* mostra na hora o tipo reconhecido e, se o dígito verificador estiver errado, qual seria o correto */
        let check = () => { let digits = input.value.replace(/\D/g, ''), info = gtin(digits), text = '', kind = '';
            if (!digits) text = 'EAN-8, UPC-A (12), EAN-13 ou ITF-14 (14 dígitos).';
            else if (!info) text = digits.length + ' dígito(s): o código precisa ter 8, 12, 13 ou 14.';
            else if (info.ok) { text = info.type + ' válido.'; kind = 'ok'; }
            else { let fix = digits.slice(0, -1); for (let d = 0; d < 10; d++) if (gtin(fix + d).ok) { text = 'Dígito verificador não confere: o correto seria ' + fix + d + '.'; break; } kind = 'bad'; }
            status.textContent = text; status.dataset.kind = kind; save.disabled = !info?.ok; };
        input.value = missing ? '' : t(row.principal); input.oninput = check; check(); dialog.returnValue = ''; dialog.showModal(); input.focus(); input.select();
        save.onclick = () => { let info = gtin(input.value); if (!info?.ok) return; snapshot(); row.principal = info.d; draw(); updateDashboard(); toast('Código de barras ' + info.type + ' aplicado.'); }; /* o formulário method=dialog fecha o modal depois deste clique */
        input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); if (!save.disabled) save.click(); } };
    } /* Menu ⋯ da lista de Páginas: ordenar, filtrar e vincular. A ordenação/filtro só mudam a lista da tela (não as páginas do cartaz). */
    const FILTERS = { all: { label: 'Todos', test: () => true }, nologo: { label: 'Sem logo', test: entry => entry.noLogo }, nobarcode: { label: 'Sem cód. barras', test: entry => entry.missing > 0 }, hidden: { label: 'Códigos ocultos', test: entry => entry.hidden > 0 }, a3: { label: 'Páginas A3', test: entry => entry.formats.has('A3') }, a4: { label: 'Páginas A4', test: entry => entry.formats.has('A4') }, linked: { label: 'Marcas vinculadas', test: entry => !!entry.linked } }, SORTS = { az: 'A-Z', count: 'Qtd. de itens' };
    function sortLabel(key) { return key === 'az' && S.sort.key === 'az' && S.sort.dir === -1 ? 'Z-A' : SORTS[key]; }
    /* Clique no triângulo de alerta da marca: abre a marca e rola a prévia até o cartão com o problema (cliques seguintes vão para o próximo) */
    function goToProblem(kind) {
        let cards = [...document.querySelectorAll('#preview .card')].filter(card => kind === 'missing' ? card.hasAttribute('data-bad-barcode') : !card.querySelector('.cutwarn').hidden); if (!cards.length) return;
        let key = S.brand + '|' + kind; S.alertAt = S.alertKey === key ? (S.alertAt + 1) % cards.length : 0; S.alertKey = key; let card = cards[S.alertAt];
        card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    }
    function isDefaultSort() { return S.sort.key === 'az' && S.sort.dir === 1; }
    function resetView(what) { if (what !== 'filter') S.sort = { key: 'az', dir: 1 }; if (what !== 'sort') S.filter = 'all'; S.menu = false; pages(); }
    function renderPagesMenu(canLink) {
        let menu = $('pagesMenuList'), arrow = key => S.sort.key === key ? '<span class="sort-arrow" aria-label="' + (S.sort.dir === 1 ? 'crescente' : 'decrescente') + '">' + (S.sort.dir === 1 ? '↑' : '↓') + '</span>' : '',
            section = (id, label, body) => '<button type="button" role="menuitem" class="pm-item pm-section" data-pm-section="' + id + '" aria-expanded="' + (S.menuSection === id) + '">' + label + '<svg class="pm-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' + (S.menuSection === id ? '<div class="pm-sub">' + body + '</div>' : '');
        menu.innerHTML = section('sort', 'Ordenar por', Object.entries(SORTS).map(([key, label]) => '<button type="button" role="menuitemradio" aria-checked="' + (S.sort.key === key) + '" class="pm-item" data-pm-sort="' + key + '">' + sortLabel(key) + arrow(key) + '</button>').join(''))
            + section('filter', 'Filtrar por' + (S.filter === 'all' ? '' : ' · ' + FILTERS[S.filter].label), Object.entries(FILTERS).map(([key, filter]) => '<button type="button" role="menuitemradio" aria-checked="' + (S.filter === key) + '" class="pm-item" data-pm-filter="' + key + '">' + filter.label + (S.filter === key ? '<span class="sort-arrow" aria-hidden="true">✓</span>' : '') + '</button>').join(''))
            + '<button type="button" role="menuitem" class="pm-item" data-pm-link' + (canLink ? '' : ' disabled title="Precisa de 2 ou mais marcas soltas"') + '>Vincular marcas</button>'
            + '<button type="button" role="menuitem" class="pm-item" data-pm-split' + (S.brand && !S.pages.find(page => page.brand === S.brand)?.brands ? '' : ' disabled title="Selecione uma marca não vinculada"') + '>Dividir marca por título</button>'
            + '<button type="button" role="menuitem" class="pm-item pm-reset" data-pm-reset' + (isDefaultSort() && S.filter === 'all' ? ' disabled' : '') + '>Limpar filtro e ordenação</button>';
        menu.hidden = !S.menu; $('pagesMenuBtn').setAttribute('aria-expanded', String(S.menu)); Object.entries(METRIC_FILTERS).forEach(([id, key]) => { let box = $(id).parentElement; box.classList.toggle('active', S.filter === key); box.setAttribute('aria-pressed', String(S.filter === key)); });
        menu.querySelectorAll('[data-pm-section]').forEach(button => button.onclick = () => { S.menuSection = S.menuSection === button.dataset.pmSection ? '' : button.dataset.pmSection; renderPagesMenu(canLink); });
        menu.querySelectorAll('[data-pm-sort]').forEach(button => button.onclick = () => { let key = button.dataset.pmSort; S.sort = S.sort.key === key ? { key, dir: -S.sort.dir } : { key, dir: 1 }; pages(); });
        menu.querySelectorAll('[data-pm-filter]').forEach(button => button.onclick = () => { S.filter = button.dataset.pmFilter; S.menu = false; pages(); });
        menu.querySelector('[data-pm-reset]').onclick = () => resetView('all'); menu.querySelector('[data-pm-link]').onclick = () => { S.menu = false; S.linking = true; S.linkSel = []; pages(); }; menu.querySelector('[data-pm-split]').onclick = () => { S.menu = false; pages(); openSplitBrandDialog(); };
    }
    /* cartões do Resumo viram atalhos de filtro (clicar de novo limpa o filtro) */
    const METRIC_FILTERS = { metricBarcodes: 'nobarcode', metricCodes: 'hidden', metricA4: 'a4', metricA3: 'a3' };
    Object.entries(METRIC_FILTERS).forEach(([id, key]) => { let box = $(id).parentElement, go = () => { S.filter = S.filter === key ? 'all' : key; pages(); if (!$('work').hidden) $('list').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }; box.classList.add('metric-link'); box.tabIndex = 0; box.setAttribute('role', 'button'); box.title = 'Filtrar a lista de páginas: ' + FILTERS[key].label + (key === 'nobarcode' ? ' (ausente, tamanho não suportado ou dígito verificador inválido)' : ''); box.onclick = go; box.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } }; });
    $('pagesMenuBtn').onclick = event => { event.stopPropagation(); S.menu = !S.menu; S.menuSection = ''; pages(); };
    document.addEventListener('click', event => { if (S.menu && !event.composedPath().some(node => node.classList?.contains('pages-menu'))) { S.menu = false; pages(); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && S.menu) { S.menu = false; pages(); } });
    function pages() {
        let brands = [...new Set(S.pages.map(page => page.brand))], singles = brands.filter(brand => !S.pages.find(page => page.brand === brand).brands), total = new Set(S.pages.flatMap(page => page.brands || [page.brand])).size;
        S.linkSel = (S.linkSel || []).filter(brand => singles.includes(brand));
        $('count').textContent = total + ' marca' + (total === 1 ? '' : 's');
        $('linkBar').innerHTML = S.linking ? '<p>Marque 2 ou mais marcas para colocá-las nas mesmas páginas.</p><div class="link-actions"><button type="button" id="linkConfirm"' + (S.linkSel.length < 2 ? ' disabled' : '') + '>Vincular (' + S.linkSel.length + ')</button><button type="button" id="linkCancel" class="secondary">Cancelar</button></div>' : '';
        let entries = brands.map(brand => { let pages=S.pages.filter(page=>page.brand===brand), items=pages.flatMap(page=>page.items), linked=pages[0].brands; return { brand, pages, items, linked, cards: items.length, missing: barcodeApplies() ? items.filter(item=>!barcodeOk(item.group.rows[0].principal)).length : 0, hidden: items.reduce((sum,item)=>sum+(item.hiddenCodes||0),0), noLogoNames: (linked||[brand]).filter(name=>!logoUrl(name)), noLogo: (linked||[brand]).some(name=>!logoUrl(name)), formats: new Set(pages.map(page=>page.format)) }; });
        entries = entries.filter(FILTERS[S.filter].test).sort((a, b) => ((S.sort.key === 'count' ? a.cards - b.cards : 0) || a.brand.localeCompare(b.brand, 'pt-BR')) * S.sort.dir);
        /* cards da marca ativa (só Live Shop): seta no card da marca abre a lista; cada produto vira um cardzinho com "Destaque" e campos editáveis. Só monta quando aberto. */
        let live = S.config?.layout === 'liveshop', openBrand = brand => live && brand === S.brand && !!S.cardsOpen,
            caret = brand => live && brand === S.brand && !S.linking ? '<span class="brand-caret' + (openBrand(brand) ? ' open' : '') + '" role="button" tabindex="0" aria-label="Mostrar os cards da marca" aria-expanded="' + openBrand(brand) + '">' + CHEVRON + '</span>' : '',
            field = (key, label, value) => '<label class="bc-field"><span>' + label + '</span><input data-ed="' + key + '" value="' + e(value) + '"></label>',
            cardsMenu = brand => { if (!openBrand(brand)) return '';
                return '<div class="bc-collapse' + (S.animBrand ? ' is-closed' : '') + '"><div class="bc-collapse-inner"><div class="brand-cards">' + S.pages.flatMap((page, pi) => page.brand === brand ? page.items.map((item, ii) => ({ item, pi, ii, cols: page.cols })) : []).map(({ item, pi, ii, cols }, n) => {
                    let id = pi + ':' + ii, open = (S.openCard || []).includes(item), plain = plainTitle(item);
                    return '<div class="brand-card-row' + (item.wide ? ' is-wide' : '') + '"><div class="bc-head"><button type="button" class="bc-open" data-open-card="' + id + '" title="' + e(plain) + ' — segure e arraste para reordenar; Alt+↑ / Alt+↓ move" aria-expanded="' + open + '"><span class="n">' + (n + 1) + '</span>' + thumb(item) + '<span class="t">' + e(plain).replace(/\//g, '/\u200b') + '</span></button>' + (item.hiddenCodes ? '<button type="button" class="bc-cut" data-cut="' + id + '" title="' + item.hiddenCodes + ' linha(s) fora do cartão - clique para ver as opções" aria-label="Linhas fora do cartão">!</button>' : '') + (item.consult ? '<button type="button" class="bc-cut bc-undo" data-cut-undo="' + id + '" title="Voltar a tabela original (desfaz &quot;Consulte códigos&quot;)" aria-label="Desfazer Consulte códigos"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>' : '') + '<button type="button" class="bc-kebab" data-card-menu="' + id + '" aria-label="Opções do produto" aria-haspopup="menu">' + KEBAB + '</button></div>'
                        + (open ? '<div class="bc-collapse' + (S.animCard === item ? ' is-closed' : '') + '"><div class="bc-collapse-inner"><div class="bc-body">'+ field('t:' + id, 'Título', plain) + field('q:' + id, 'Quantidade mínima', CartazCards.minQty(item)) + CartazCards.lines(item).map((r, ri, all) => '<div class="bc-pair">' + field('d:' + id + ':' + ri, 'Descrição', r.desc) + field('c:' + id + ':' + ri, 'Código', r.code) + '<button type="button" class="bc-row-del" data-row-del="' + id + ':' + ri + '" aria-label="Remover linha" title="Remover linha"' + (all.length < 2 ? ' disabled' : '') + '>' + CLOSE + '</button></div>').join('') + '<button type="button" class="bc-row-add" data-row-add="' + id + '">+ Adicionar linha</button></div></div></div>' : '') + '</div>'; }).join('') + '</div></div></div>'; };
        let hintsHtml = brand => { if (!live || brand !== S.brand || S.linking) return ''; let brandPages = S.pages.filter(page => page.brand === brand); return brandPages.map((page, i) => { let pi = S.pages.indexOf(page), note = emptyNote(page, pi, i, brandPages.length); return note ? note.replace(' data-html2canvas-ignore', '').replace('empty-note', 'empty-note in-panel') : ''; }).join(''); };
        let countText = cards => '<small class="brand-count">(' + cards + (cards === 1 ? ' item' : ' itens') + ')</small>';
        let searchBox = S.pages.length ? '<input type="search" class="bc-search" placeholder="Buscar produto ou código" title="Busca em todas as marcas" value="' + e(S.cardFilter || '') + '" aria-label="Buscar produto em todas as marcas"><div class="bc-results">' + resultsHtml(S.cardFilter || '') + '</div>' : '';
        $('list').innerHTML = searchBox + (entries.length ? '' : '<p class="pages-empty">Nenhuma marca neste filtro.</p>') + entries.map(entry => { let { brand, pages, items, linked, missing, hidden, noLogoNames } = entry, alerts=(missing||hidden||noLogoNames.length)?'<span class="brand-alerts">'+(noLogoNames.length?'<span class="brand-alert nologo" data-logo-missing="'+e(noLogoNames[0])+'" title="Sem logo padrão: '+e(noLogoNames.join(', '))+' (clique para escolher)">'+NOLOGO_ICON+'</span>':'')+(missing?'<span class="brand-alert missing" title="'+missing+' código(s) de barras ausente(s) ou inválido(s)">!</span>':'')+(hidden?'<span class="brand-alert hidden" title="'+hidden+' código(s) oculto(s)">!</span>':'')+'</span>':'', gear=name=>S.config?.footerLogo === false ? '' : '<button class="brand-logo-settings" type="button" data-brand-logo="'+e(name)+'" title="Escolher logo" aria-label="Escolher logo de '+e(name)+'">⚙</button>';
            if (linked) return '<div class="linked-group"><button type="button" class="linked-main '+(brand===S.brand?'active':'')+'" data-brand="'+e(brand)+'"><span class="linked-tag">'+LINK_ICON+'Marcas vinculadas</span><span class="linked-pages">'+pages.length+' página'+(pages.length===1?'':'s')+' '+pages[0].format+'</span>'+countText(entry.cards)+alerts+caret(brand)+'</button>'+linked.map(name=>{let off=pages[0].logoOff||[], on=!off.includes(name), only=on&&linked.filter(other=>!off.includes(other)).length===1; return '<div class="linked-member"><strong>'+e(name)+'</strong>'+countText(items.filter(item=>groupBrand(item.group)===name).length)+'<label class="logo-toggle" title="'+(only?'Ao menos uma marca precisa mostrar a logo':'Mostrar o card da logo no rodapé')+'"><input type="checkbox" data-logo-key="'+e(brand)+'" data-logo-toggle="'+e(name)+'"'+(on?' checked':'')+(only?' disabled':'')+'><span>Logo</span></label>'+gear(name)+'</div>'}).join('')+'<button type="button" class="linked-unlink secondary" data-unlink="'+e(brand)+'">Desvincular</button></div>'+(openBrand(brand)?cardsMenu(brand)+hintsHtml(brand):hintsHtml(brand));
            let picked = S.linkSel.includes(brand); return '<div class="brand-entry'+(S.linking?' picking':'')+'">'+(S.linking?'<input type="checkbox" class="brand-pick" data-pick="'+e(brand)+'"'+(picked?' checked':'')+' aria-label="Selecionar '+e(brand)+' para vincular">':'')+'<button class="'+((S.linking?picked:brand===S.brand)?'active':'')+'" data-brand="'+e(brand)+'"><strong>'+e(brand)+'</strong>'+countText(entry.cards)+alerts+caret(brand)+'</button>'+gear(brand)+'</div>'+(openBrand(brand)?cardsMenu(brand)+hintsHtml(brand):hintsHtml(brand)) }).join('');
        renderPagesMenu(singles.length > 1); $('pagesStatus').innerHTML = 'Ordenado por: <b>' + sortLabel(S.sort.key) + ' ' + (S.sort.dir === 1 ? '↑' : '↓') + '</b>' + (isDefaultSort() ? '' : ' <button type="button" class="pages-reset" data-reset="sort">restaurar</button>') + (S.filter === 'all' ? '' : '<br>Filtrado por: <b>' + FILTERS[S.filter].label + '</b> <button type="button" class="pages-reset" data-reset="filter">limpar</button>'); $('pagesStatus').querySelectorAll('[data-reset]').forEach(button => button.onclick = () => resetView(button.dataset.reset));
        let togglePick = brand => { S.linkSel = S.linkSel.includes(brand) ? S.linkSel.filter(item => item !== brand) : [...S.linkSel, brand]; pages(); };
        [...$('list').querySelectorAll('[data-brand]')].forEach(button=>button.onclick=event=>{ if (event.target.closest('.brand-caret')) return toggleBrandCards(); if (S.linking && singles.includes(button.dataset.brand)) return togglePick(button.dataset.brand); let alert = event.target.closest('.brand-alert'); S.brand=button.dataset.brand;S.page=S.pages.findIndex(page=>page.brand===S.brand);pages();draw(); if (alert?.classList.contains('nologo')) chooseBrandLogo(alert.dataset.logoMissing); else if (alert) goToProblem(alert.classList.contains('missing') ? 'missing' : 'hidden');}); [...$('list').querySelectorAll('[data-brand-logo]')].forEach(button=>button.onclick=()=>chooseBrandLogo(button.dataset.brandLogo));
        [...$('list').querySelectorAll('[data-cut-undo]')].forEach(button => button.onclick = event => { event.stopPropagation(); undoConsult(cardAt(button.dataset.cutUndo).item); });
        [...$('list').querySelectorAll('[data-cut]')].forEach(button => button.onclick = event => { event.stopPropagation(); cutDialog(cardAt(button.dataset.cut).item); });
        [...$('list').querySelectorAll('[data-card-menu]')].forEach(button => button.onclick = event => { event.stopPropagation(); openCardMenu(button); });
        if ($('list').querySelector('.brand-cards')) bindCardDrag($('list').querySelector('.brand-cards'));
        [...$('list').querySelectorAll('[data-open-card]')].forEach(button => { button.onclick = () => toggleCard(button.dataset.openCard); button.onkeydown = ev => { if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); moveCard(cardAt(button.dataset.openCard).item, ev.key === 'ArrowUp' ? -1 : 1); } }; });
        [...$('list').querySelectorAll('.brand-caret')].forEach(caret => caret.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); toggleBrandCards(); } });
        $('list').querySelector('.bc-search')?.addEventListener('input', ev => { S.cardFilter = ev.target.value; $('list').querySelector('.bc-results').innerHTML = resultsHtml(ev.target.value); bindResults(); });
        bindResults();
        /* edição dos campos do cardzinho: grava ao sair do campo (Enter também) e troca só o card editado na prévia; a lista só é refeita se mudar o alerta de códigos ocultos */
        [...$('list').querySelectorAll('[data-ed]')].forEach(input => { let start = input.value; input.onkeydown = ev => { if (ev.key === 'Enter') input.blur(); }; input.onblur = ev => {
            if (input.value === start) return; let [kind, pi, ii, ri] = input.dataset.ed.split(':'), item = cardAt(pi + ':' + ii).item, next = ev.relatedTarget?.dataset?.ed; snapshot();
            CartazCards.setField(item, kind, +ri, input.value); start = input.value;
            if (kind === 't') input.closest('.brand-card-row').querySelector('.bc-open .t').textContent = plainTitle(item).replace(/\//g, '/\u200b');
            if (redrawCard(item)) { pages(); if (next) $('list').querySelector('[data-ed="' + next + '"]')?.focus(); } }; });
        [...$('list').querySelectorAll('[data-row-add]')].forEach(button => button.onclick = () => { let { item } = cardAt(button.dataset.rowAdd); snapshot(); CartazCards.addRow(item); redrawCard(item); pages(); });
        [...$('list').querySelectorAll('[data-row-del]')].forEach(button => button.onclick = () => { let [pi, ii, ri] = button.dataset.rowDel.split(':'), { item } = cardAt(pi + ':' + ii); snapshot(); if (CartazCards.removeRow(item, +ri)) { redrawCard(item); pages(); } });
        [...$('list').querySelectorAll('[data-fill]')].forEach(button => button.onclick = () => setWide(button.dataset.fill, true));
        [...$('list').querySelectorAll('[data-pick]')].forEach(input=>input.onchange=()=>togglePick(input.dataset.pick)); [...$('list').querySelectorAll('[data-unlink]')].forEach(button=>button.onclick=()=>unlinkBrands(button.dataset.unlink)); [...$('list').querySelectorAll('[data-logo-toggle]')].forEach(input=>input.onchange=()=>{ snapshot(); S.pages.filter(page=>page.brand===input.dataset.logoKey).forEach(page=>{ let off=new Set(page.logoOff||[]); input.checked?off.delete(input.dataset.logoToggle):off.add(input.dataset.logoToggle); page.logoOff=[...off]; }); draw(); });
        if ($('linkCancel')) $('linkCancel').onclick = () => { S.linking = false; S.linkSel = []; pages(); };
        if ($('linkConfirm')) $('linkConfirm').onclick = () => linkBrands(brands.filter(brand => S.linkSel.includes(brand)));
    } function centerPhoto(card) { /* posiciona a foto pelo espaco vertical REAL entre o titulo (altura varia de 1 a 3 linhas) e o
    codigo de barras - o CSS (.card .photo, top:94px) reserva sempre o pior caso (titulo de 3 linhas), entao com
    titulo curto sobrava espaco em branco acima da foto e ela parecia "grudada" mais pra baixo em vez de centralizada
    (medir via offsetHeight em vez de flex/CSS puro porque -webkit-line-clamp nao informa a altura real pro flex,
    ver .card.big h3 acima - offsetHeight nao tem esse problema, é o layout ja calculado).
    Alem disso, com 1 código só (data-codes, ver card()) a coluna direita estreita (110px) deixa um vao vazio enorme
    a esquerda da foto (o .lines - "Código: X" numa linha só - fica bem mais baixo que o teto do titulo) - nesse
    caso a foto usa a largura toda do cartao (left:28px, igual ao padding, em vez da coluna de 110px) pra ficar
    centralizada de verdade. Só se aplica com 1 código: a partir de 2, o rotulo "Códigos:" (ver .lines::before)
    entra como uma linha a mais e sozinho já estoura a folga disponível (confirmado medindo caso real: com 2
    códigos curtos ainda faltam ~13px, com 3 faltam ~29px, independente do tamanho do cartão) - por isso a trava
    de seguranca abaixo (que mede a posicao REAL de .lines depois de renderizado) nunca libera a largura toda
    com 2+ códigos, so serve pra cobrir o caso raro de um código único tao comprido que quebra em 3 linhas */ let h3 = card.querySelector('h3'), lines = card.querySelector('.lines'), photo = card.querySelector('.photo'); if (!h3 || !photo || card.classList.contains('a3') || card.classList.contains('lb')) return; let top = h3.offsetTop + h3.offsetHeight + 8, bottomBound = card.clientHeight - 66; photo.style.top = (top + Math.max(0, bottomBound - top - photo.offsetHeight) / 2) + 'px'; photo.style.bottom = 'auto'; photo.style.margin = '0'; let wide = +card.dataset.codes === 1 && lines && lines.offsetTop >= bottomBound + 8; photo.style.left = wide ? '28px' : 'auto'; photo.style.width = wide ? 'auto' : '110px' } function updateTitle(el) { snapshot('title'); let card = el.closest('.card'); fitLines(card); checkTitle(card); let item = S.pages[+card.dataset.page].items[+card.dataset.idx]; item.title = t(el.textContent); let html = CartazTitleFormat.sanitize(el, { keepBr: !!el.closest('.card.lb') }); if (html) item.titleHtml = html; else delete item.titleHtml; } /* A+ / A- da barra de formatação (cartaz-title-format.js): tamanho do título do card, em passos de 5% (60% a 160%), guardado em item.titleScale */
    document.addEventListener('titlesize', event => { let card = event.target.closest('.card.lb'); if (!card) return; let item = S.pages[+card.dataset.page].items[+card.dataset.idx], scale = Math.max(.6, Math.min(1.6, Math.round(((item.titleScale || 1) + .05 * event.detail) * 100) / 100)); snapshot('title'); if (scale === 1) delete item.titleScale; else item.titleScale = scale; draw(); }); function updateCodes(el) { snapshot('codes'); let card = el.closest('.card'), item = S.pages[+card.dataset.page].items[+card.dataset.idx],
        texts = [...el.querySelectorAll('.cd')].map(span => t(span.textContent)).filter(Boolean), twoCols = twoCodeColumns(texts.length, card.classList.contains('a3'));
        /* só reconstrói o HTML (1 <-> 2 colunas) quando apagar/adicionar código muda o layout que cabe -
           reescrever el.innerHTML a cada tecla (mesmo sem mudar o layout) jogaria o cursor pro início do
           contenteditable a cada letra digitada */
        if (twoCols !== el.classList.contains('two-cols')) { el.innerHTML = codesHtml(texts, twoCols); el.classList.toggle('two-cols', twoCols); card.dataset.codes = texts.length; }
        item.linesOverride = { html: el.innerHTML, count: texts.length, twoCols }; fitLines(card); }
    /* Geometria da foto no Live Shop, calculada sobre a IMAGEM (não sobre o campo): a moldura de edição acompanha a foto e os limites valem para ela.
       A foto fica dentro da coluna; com código no rodapé (.lb-foot) ela também pode descer pelo espaço em branco à direita do texto e acima do código de barras/QR,
       sem encostar neles, e o zoom máximo é o maior que ainda cabe numa dessas áreas. value (x, y, scale) é ajustado no lugar; devolve a caixa da imagem em px da coluna. */
    function clampPhoto(value, side) {
        let W = side.clientWidth, H = side.clientHeight, img = side.querySelector('img'), nw = img && img.naturalWidth || W, nh = img && img.naturalHeight || H, fit = Math.min(W / nw, H / nh, 1) /* object-fit: scale-down: não amplia foto menor que o campo */, w0 = nw * fit, h0 = nh * fit, card = side.closest('.card'), foot = card && card.querySelector('.lb-foot'), sx = side.offsetLeft, sy = side.offsetTop,
            box = el => el ? { l: el.offsetLeft - sx, t: el.offsetTop - sy, r: el.offsetLeft - sx + el.offsetWidth, b: el.offsetTop - sy + el.offsetHeight } : null,
            table = box(foot && foot.querySelector('.lb-table, .lb-tables')), mark = box(foot && foot.querySelector('.ean, .lb-qr')), tableR = table ? table.r : 0, markT = mark ? mark.t : foot ? box(foot).b : H;
        if (!W || !H) return { W, H, l: 0, t: 0, r: W, b: H };
        let fitA = Math.min(W / w0, H / h0), fitB = foot ? Math.min((W - tableR) / w0, markT / h0) : 0, k = Math.max(.5, Math.min(value.scale, Math.max(1, fitA, fitB))), w = w0 * k, h = h0 * k;
        let l = Math.max(0, Math.min(W - w, W / 2 + value.x - w / 2)), t = Math.max(0, H / 2 + value.y - h / 2);
        if (t + h > H + .5) { /* desceu da coluna: só vale à direita do texto do rodapé e acima do código */
            if (foot && l < tableR && tableR + w <= W) l = tableR;
            if (foot && l >= tableR - .5 && h <= markT) t = Math.min(t, markT - h); else t = Math.max(0, H - h);
        }
        value.scale = k; value.x = l + w / 2 - W / 2; value.y = t + h / 2 - H / 2;
        return { W, H, l, t, r: l + w, b: t + h };
    }
    /* Destaque (2 colunas): a foto tem o tamanho de um card comum e o zoom (roda do mouse, 0,5x a 2x) alarga a caixa dela; como o corpo do card é centralizado, o QR + botão se afastam sozinhos e o conjunto continua no meio.
       Arrastar a foto afasta os dois ao mesmo tempo, cada um para um lado (st.x = quanto cada um andou), até o primeiro encostar na borda do corpo do card. */
    function widePhoto(card, st, write) {
        let ph = card.querySelector('.photo'), side = ph && ph.parentNode; if (!side) return; let k = Math.max(.5, Math.min(2, st && st.scale || 1)), left = card.querySelector('.lb-left'), body = card.querySelector('.lb-body'), wide = card.classList.contains('wide');
        if (!wide && left && body && body.offsetWidth && !card.closest('.cartaz-measure')) { /* card comum: o zoom só cresce até o que sobra depois da coluna do QR (no mínimo, o conteúdo dela) */
            let gap = parseFloat(getComputedStyle(body).columnGap) || 0, half = (body.clientWidth - gap) / 2; left.style.flexBasis = 'min-content'; left.style.flexShrink = '0'; let minLeft = left.getBoundingClientRect().width; left.style.flexBasis = left.style.flexShrink = '';
            k = Math.min(k, Math.max(.5, (body.clientWidth - gap - minLeft) / half));
        }
        if (write && st) st.scale = k;
        if (wide) side.style.flexBasis = (22.4 * k).toFixed(1) + '%'; else side.style.setProperty('--pk', k.toFixed(3)); side.style.left = ''; side.style.alignSelf = k < 1 ? 'center' : ''; side.style.height = k < 1 ? (k * 100).toFixed(1) + '%' : ''; /* zoom menor que 1 também encurta a caixa: foto alta (ex.: lata) não fica presa à altura do corpo */ ph.style.transform = ''; if (left) left.style.left = ''; ['fl', 'ft', 'fr', 'fb'].forEach(name => side.style.setProperty('--' + name, '0px')); /* moldura da edição = a caixa inteira */
        if (!left || !body || !body.offsetWidth || card.closest('.cartaz-measure')) return;
        /* limite = a menor folga entre o QR e a borda esquerda do corpo e entre a foto e a borda direita, medida pelas caixas na tela (não por offsetLeft) */
        let flip = card.classList.contains('flip') /* lados trocados: a foto fica à esquerda e o QR à direita */, b = body.getBoundingClientRect(), l = left.getBoundingClientRect(), r = side.getBoundingClientRect(), outerL = flip ? r : l, outerR = flip ? l : r, room = Math.min(outerL.left - b.left, b.right - outerR.right), dir = flip ? -1 : 1;
        let x = Math.max(0, Math.min(room, st && st.x || 0)); if (write && st) st.x = x; /* só a edição grava; os redesenhos e as outras divisões apenas leem */
        side.style.left = dir * x + 'px'; left.style.position = 'relative'; left.style.left = -dir * x + 'px'; /* deslocamento por posição relativa, não por transform: o html2canvas corta o overflow da caixa onde ela estava antes do transform, e a foto saía cortada no PDF */
    }
    const boxMode = card => !!(card.querySelector('.lb-body > .lb-left') && card.querySelector('.lb-body > .lb-right') && !card.querySelector('.lb-foot')); /* QR e foto lado a lado: a foto é uma caixa que cresce com o zoom e se afasta do QR */
    function photoFit(card, ph, st) {
        if (!ph) return; if (boxMode(card)) return widePhoto(card, st);
        if (st && !card.closest('.cartaz-measure')) { clampPhoto(st, ph.parentNode); ph.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.scale + ')'; }
    }
    function enablePhotoEditing(photo) {
        let card = photo.closest('.card'), item = S.pages[+card.dataset.page].items[+card.dataset.idx], state = () => item.photo || (item.photo = { x: 0, y: 0, scale: 1 }), apply = () => {
            let value = state(), live = card.classList.contains('lb'), side = photo.parentNode;
            /* Live Shop: a foto NUNCA sai da própria coluna nem some. Menor que a coluna (zoom < 1) fica inteira dentro dela; maior (zoom > 1) sempre a cobre, sem vão. */
            if (live && boxMode(card)) { value.scale = Math.max(.5, Math.min(2, value.scale)); value.y = 0; document.querySelectorAll('.card.lb[data-page="' + card.dataset.page + '"][data-idx="' + card.dataset.idx + '"]').forEach(other => { if (other !== card) widePhoto(other, value); }); widePhoto(card, value, true); return; } /* destaque: o zoom aumenta a caixa da foto (e o conjunto QR + foto continua centralizado) */
            if (live) {
                let g = clampPhoto(value, side);
                /* moldura da edição = caixa da própria foto (a imagem, não o campo) */
                side.style.setProperty('--fl', g.l + 'px'); side.style.setProperty('--fr', (g.W - g.r) + 'px'); side.style.setProperty('--ft', g.t + 'px'); side.style.setProperty('--fb', (g.H - g.b) + 'px');
            }
            photo.style.transform = 'translate(' + value.x + 'px,' + value.y + 'px) scale(' + value.scale + ')';
            /* o mesmo box aparece em todas as divisões (Osten, Dismatal, VONDER) e divide o estado: replica na hora nas outras prévias */
            if (live) document.querySelectorAll('.card.lb[data-page="' + card.dataset.page + '"][data-idx="' + card.dataset.idx + '"] .photo').forEach(other => { if (other !== photo) other.style.transform = photo.style.transform; });
        };
        photo.nudgeWide = dx => { snapshot('photo'); let before = state().x || 0; state().x = before + dx; apply(); if (dx > 0 && state().x <= before) toast('Sem espaço para afastar mais a foto neste card.'); }; /* setas do teclado no destaque: mesmo afastamento do arrasto */
        photo.ondblclick = event => { event.preventDefault(); photo.classList.toggle('photo-editing'); if (card.classList.contains('lb')) apply(); toast(photo.classList.contains('photo-editing') ? 'Foto selecionada: arraste para mover e use a roda do mouse para redimensionar.' + (boxMode(card) ? ' Setas ← → afastam ou aproximam o QR.' : '') : 'Edição da foto concluída.'); };
        photo.onwheel = event => { if (!photo.classList.contains('photo-editing')) return; event.preventDefault(); snapshot('photo'); let value = state(); value.scale = Math.max(.5, Math.min(2, value.scale + (event.deltaY < 0 ? .1 : -.1))); apply(); };
        photo.onpointerdown = event => { if (!photo.classList.contains('photo-editing')) return; event.preventDefault(); snapshot('photo'); let startX = event.clientX, startY = event.clientY, value = state(), originX = value.x, originY = value.y; photo.setPointerCapture(event.pointerId); photo.onpointermove = move => { value.x = originX + move.clientX - startX; value.y = originY + move.clientY - startY; apply(); }; photo.onpointerup = () => { photo.onpointermove = null; photo.onpointerup = null; }; };
    } /* Cabeçalho: se o título/subtítulo chegariam na logo do canto, reduz a fonte (mínimo 60%) até caber */
    function fitHeaders() {
        document.querySelectorAll('#preview .sheet-heading').forEach(heading => {
            let sheet = heading.closest('.sheet'), logo = getComputedStyle(sheet, '::after'), limit = sheet.getBoundingClientRect().left + sheet.clientWidth - (parseFloat(logo.right) || 0) - (parseFloat(logo.width) || 0) - 16;
            heading.querySelectorAll('strong, span').forEach(part => { part.style.fontSize = ''; let base = parseFloat(getComputedStyle(part).fontSize), size = base; while (size > base * .6 && part.getBoundingClientRect().right > limit) { size -= base * .04; part.style.fontSize = size + 'px'; } });
        });
    }
    /* Redesenho vindo de carregamentos em segundo plano (templates compartilhados em loadShared, logos das marcas em loadBrandAssets):
       eles terminam segundos depois da importação e o draw() recria todos os cards, o que derrubava a seleção e o foco de quem já
       estava editando um título/códigos. Enquanto há um campo editável da prévia com foco, adia o redesenho até a pessoa sair dele. */
    function drawWhenIdle() {
        let box = $('preview'), active = document.activeElement;
        if (!(box && active && box.contains(active) && active.isContentEditable)) { draw(); return; }
        if (S.drawPending) return; S.drawPending = true;
        box.addEventListener('focusout', () => setTimeout(() => { S.drawPending = false; drawWhenIdle(); }, 0), { once: true });
    }
    /* HTML de UMA folha (uma divisão): usado pelo draw completo e pelo redesenho incremental das folhas alteradas */
    function sheetHtml(page, pageIndex, division) {
        S.curDivision = division; let cells = page.items.map((item, index) => card(item, index, pageIndex)), logo = logoUrl(page.brand), filled = page.items.length, live = page.layout === 'liveshop'; if (live && page.logoBox) cells.unshift(logoBoxHtml(page)); for (let i = filled; !live && i < page.capacity; i++) cells.push('<div class="placeholder" aria-hidden="true"></div>'); return '<div class="sheet ' + page.format.toLowerCase() + (S.templates[page.format] ? ' custom-bg' : '') + (S.logo ? ' custom-logo' : '') + gridClass(page) + '"' + gridStyle(page) + ' data-page="' + pageIndex + '"' + (division ? ' data-division="' + division.id + '"' : '') + '>' + (division && S.config.showStrip !== false ? '<div class="lb-strip" style="background:' + divisionColor(division) + '" aria-hidden="true"></div>' : '') + (live && !page.footerLogo ? '' : pageFooter(page, logo)) + (live && S.config.legalEnabled && t(S.config.legalText) ? '<div class="sheet-legal">' + e(S.config.legalText).replace(/\n/g, '<br>') + '</div>' : '') + '<span class="sheet-page-number" aria-hidden="true">' + (pageIndex + 1) + '</span>' + (live && page.header !== 'full' ? '' : '<div class="sheet-heading" aria-hidden="true">' + headerHtml() + '</div>') + cells.join('') + '</div>';
    }
    const brandPagesOf = page => S.pages.filter(x => x.brand === page.brand);
    const noteFor = (page, division) => !division || division === activeDivisions()[0] ? emptyNote(page, S.pages.indexOf(page), brandPagesOf(page).indexOf(page), brandPagesOf(page).length) : '';
    /* ajustes depois de inserir a folha no DOM: corte de linhas, centralização, edição de foto */
    function finishSheet(sheet) { let page = S.pages[+sheet.dataset.page]; fitLiveRows(sheet); sheet.querySelectorAll('.card').forEach(trimOverflow); sheet.querySelectorAll('.card:not(.big):not(.lb)').forEach(centerPhoto); if (page.layout !== 'liveshop' && page.items.length < page.capacity) { let cards = [...sheet.querySelectorAll('.card')], style = getComputedStyle(sheet), top = parseFloat(style.paddingTop), bottom = sheet.clientHeight - parseFloat(style.paddingBottom), contentHeight = Math.max(...cards.map(card => card.offsetTop + card.offsetHeight)) - top, offset = Math.max(0, (bottom - top - contentHeight) / 2); cards.forEach(card => card.style.transform = (card.classList.contains('pair') ? 'translateX(calc(50% + 9px)) ' : '') + 'translateY(' + offset + 'px)') } sheet.querySelectorAll('.card .photo').forEach(enablePhotoEditing); }
    /* Redesenho incremental: troca só as folhas das páginas alteradas (todas as divisões) e atualiza a lista, sem refazer título, formato de impressão e as demais folhas */
    function redrawPages(changed) {
        let current = S.curDivision;
        changed.forEach(page => {
            let pi = S.pages.indexOf(page); page.items.forEach(item => item.hiddenCodes = 0);
            document.querySelectorAll('#preview .sheet[data-page="' + pi + '"]').forEach(old => {
                let division = DIVISIONS.find(d => d.id === old.dataset.division) || null, holder = document.createElement('div'); holder.innerHTML = sheetHtml(page, pi, division);
                if (old.nextElementSibling?.classList.contains('empty-note')) old.nextElementSibling.remove();
                let fresh = holder.firstElementChild; old.replaceWith(fresh); finishSheet(fresh); fresh.insertAdjacentHTML('afterend', noteFor(page, division));
            });
        });
        S.curDivision = current; syncQr(); fitHeaders(); pages(); updateDashboard(); syncPagesHeight();
    }
    function draw() {
        let selectedPages = (S.brand ? S.pages.filter(page => page.brand === S.brand) : S.pages).filter(page => (!S.printFormat || page.format === S.printFormat) && (!S.only || S.only.includes(page.brand))); if (!selectedPages.length) return; selectedPages.forEach(page => page.items.forEach(item => item.hiddenCodes = 0));
        $('title').textContent = 'Prévia editável · ' + S.brand; $('previewFormat').textContent = selectedPages.length + ' página' + (selectedPages.length === 1 ? '' : 's') + ' da marca';
        $('preview').innerHTML = (activeDivisions().length ? activeDivisions() : [null]).flatMap(division => selectedPages.map(page => (division ? '<div class="sheet-label">' + e(division.name) + ' · ' + e(page.name) + '</div>' : '') + sheetHtml(page, S.pages.indexOf(page), division) + noteFor(page, division))).join('');
        [...$('preview').querySelectorAll('.sheet')].forEach(finishSheet); syncQr();
        fitHeaders(); pages(); updateDashboard(); let printSize = document.getElementById('printPageSize') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'printPageSize' })); printSize.textContent = '@media print { @page { size: ' + (selectedPages[0].format === 'A3' ? 'A3 portrait' : 'A4 portrait') + '; margin: 0 } }'
        syncPagesHeight();
    }
    /* Trava o max-height da caixa de marcas (aside .pages) na altura atual da caixa de prévia ao
       lado - a prévia muda de tamanho conforme a marca/formato selecionado, então isso não dá pra
       fixar só em CSS. max-height (não height) pra não forçar a lista a crescer além do que
       precisa quando ela é mais curta que a prévia. */
    function syncPagesHeight() {
        let previewBox = $('preview').closest('.box'), pagesBox = document.querySelector('.pages');
        if (!previewBox || !pagesBox) return;
        /* As duas caixas ficam na mesma linha de uma grade e esticam até a mesma altura: medir a prévia com a lista
           de marcas solta devolve a altura da própria lista (sem limite nenhum, a lista nunca rolava). Encolhe a
           caixa de marcas a 0 antes de medir para ler a altura natural da prévia; tudo no mesmo quadro, sem piscar. */
        /* Encolher a caixa a 0 faz o navegador zerar o scrollTop da lista: guarda e devolve, senão cada redesenho joga a lista ao topo. */
        let list = $('list'), scroll = list.scrollTop;
        pagesBox.style.maxHeight = '0px';
        let height = previewBox.offsetHeight;
        pagesBox.style.maxHeight = height ? height + 'px' : '';
        list.scrollTop = scroll;
    }
    window.addEventListener('resize', () => $('preview').closest('.box') && syncPagesHeight());
    function chooseBrandLogo(brand) { let options=logoCandidates(brand), dialog=$('brandLogoDialog'), list=$('brandLogoOptions'), upload=$('brandLogoUpload'), save=$('brandLogoSave'), saved=S.brandLogos[brand], pending=(saved&&(saved.startsWith('data:')||options.some(a=>a.file===saved)))?saved:(options[0]?.file||''); $('brandLogoDialogTitle').textContent='Logo · '+brand; list.replaceChildren(); upload.value=''; const select=(button,value)=>{pending=value;list.querySelectorAll('.brand-logo-option').forEach(item=>{item.classList.toggle('selected',item===button);item.setAttribute('aria-pressed',item===button)});save.disabled=!pending}; const add=(src,title,value)=>{let button=document.createElement('button'),image=document.createElement('img');button.type='button';button.className='brand-logo-option';button.title=title;image.src=src;image.alt=title;button.append(image);button.onclick=()=>select(button,value);list.append(button);if(value===pending)select(button,value);return button}; options.forEach(asset=>{let button=add('',asset.name,asset.file),image=button.querySelector('img');brandLogoDataUri(asset.file,uri=>image.src=uri);}); if(pending.startsWith('data:'))add(pending,'Logo enviada',pending); save.disabled=!pending; upload.onchange=()=>{let file=upload.files[0]; if(!file) return; if(!['image/svg+xml','image/png'].includes(file.type)||file.size>700000){upload.value='';toast('Envie um SVG ou PNG de até 700 KB.');return} let reader=new FileReader; reader.onload=()=>select(add(reader.result,file.name,reader.result),reader.result); reader.readAsDataURL(file)}; save.onclick=()=>{snapshot();S.brandLogos[brand]=pending;dialog.close();draw();toast(pending.startsWith('data:')?'Logo enviada para '+brand+'. Salve a grade para compartilhá-la.':'Logo atualizada para '+brand+'.')}; dialog.showModal(); } /* Template de fundo por formato: imagem única (fundo + cabeçalho) redimensionada no envio.
       Compartilhado entre máquinas: cada peça (template A4, A3, logo e texto do cabeçalho) é um registro do portalStore (Firestore),
       lido ao abrir a página; o localStorage segue como cache (abre na hora e funciona sem rede).
       ponytail: um registro do Firestore aceita ~1 MB, então as imagens são recomprimidas até caberem em SHARED_MAX;
       se precisarem de mais qualidade, guardar os arquivos no Firebase Storage (exige regras de Storage e o SDK). */
    const SHARED_KEY = 'cartaz-shared-v1-', SHARED_MAX = 900000, SHARED_SEEDED = 'cartaz-shared-seeded-v1', sharedVersion = {}, sharedTimers = {}, TPL_KEY = 'cartaz-template-v1-', TPL_WIDTH = { A4: 1654, A3: 1754 }, TPL_RATIO = Math.SQRT2;
    S.templates = { A4: '', A3: '' }; S.templateNames = { A4: '', A3: '' };
    ['A4', 'A3'].forEach(format => { try { let saved = JSON.parse(localStorage.getItem(TPL_KEY + format) || 'null'); if (saved?.url) { S.templates[format] = saved.url; S.templateNames[format] = saved.name || 'Template enviado'; } } catch (_) { } });
    /* Logo e texto do cabeçalho (o fundo é o template A4/A3 acima); mesmas regras de armazenamento local */
    const LOGO_KEY = 'cartaz-logo-v1', HEADER_KEY = 'cartaz-header-v1', HEADER_DEFAULT = { title: 'VITRINE DIGITAL DE OFERTAS', sub: 'AS MELHORES OPORTUNIDADES\nNA PALMA DA SUA MÃO!', stripe: '#fdc300', titleColor: '#00445c', subColor: '#fdc300' };
    S.logo = ''; S.logoName = ''; S.header = { ...HEADER_DEFAULT };
    try { let saved = JSON.parse(localStorage.getItem(LOGO_KEY) || 'null'); if (saved?.url) { S.logo = saved.url; S.logoName = saved.name || 'Logo enviada'; } } catch (_) { }
    try { let saved = JSON.parse(localStorage.getItem(HEADER_KEY) || 'null'); if (saved) S.header = { title: t(saved.title) || HEADER_DEFAULT.title, sub: saved.sub ?? HEADER_DEFAULT.sub, stripe: saved.stripe || HEADER_DEFAULT.stripe, titleColor: saved.titleColor || HEADER_DEFAULT.titleColor, subColor: saved.subColor || HEADER_DEFAULT.subColor }; } catch (_) { }
    /* Vários templates nomeados (cards) em S.templateSets; o "vigente" (S.activeTemplate) é espelhado em
       S.templates/S.logo/S.header acima, que continuam sendo o que draw()/applyTemplates() realmente
       leem - trocar o vigente ou editar o card vigente atualiza esse espelho; editar um card que não é
       o vigente só grava nele, sem afetar a prévia/exportação até ele virar vigente. "feira" é o
       template único que já existia antes desta tela; por isso nasce com o que já foi carregado acima
       (linhas anteriores) e loadShared() migra, uma única vez, o que já estava nas chaves antigas (sem
       prefixo de template) pra dentro dele, em vez de perder o que já estava no ar. */
    const TEMPLATE_SET_DEFS = [{ id: 'feira', name: 'Feira Grandes Marcas' }, { id: 'liveshop', name: 'Live Shop' }];
    const PENCIL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const CUSTOM_IDS_KEY = 'custom-ids';
    let customTemplateIds = []; try { customTemplateIds = JSON.parse(localStorage.getItem(TPL_KEY + CUSTOM_IDS_KEY) || '[]'); } catch (_) { customTemplateIds = []; }
    function defaultTemplateName(tid) { let def = TEMPLATE_SET_DEFS.find(def => def.id === tid); return def ? def.name : 'Novo template'; }
    /* Configuração do cartaz por template (produtos/colunas por folha, paginação): o Live Shop nasce com 19 boxes em 4 colunas no A4; os demais, com o layout da Feira. */
    function defaultConfig(tid) { return tid === 'liveshop' ? { ...CartazPagination.DEFAULT_CONFIG, capA4: 19, colsA4: 4, layout: 'liveshop', logoBox: true, footerLogo: false, codeType: 'qr', divisions: ['vonder'] } : { ...CartazPagination.DEFAULT_CONFIG }; }
    function blankTemplateSet(tid) { return { name: defaultTemplateName(tid), A4: '', A3: '', A4Name: '', A3Name: '', logo: '', logoName: '', header: { ...HEADER_DEFAULT }, config: defaultConfig(tid) }; }
    function allTemplateDefs() { return TEMPLATE_SET_DEFS.concat(customTemplateIds.map(id => ({ id, name: templateName(id) }))); }
    S.activeTemplate = localStorage.getItem(TPL_KEY + 'active') || 'feira';
    S.templateSets = {}; TEMPLATE_SET_DEFS.forEach(def => S.templateSets[def.id] = blankTemplateSet(def.id));
    customTemplateIds.forEach(id => S.templateSets[id] = blankTemplateSet(id));
    if (!S.templateSets[S.activeTemplate]) S.activeTemplate = 'feira';
    Object.assign(S.templateSets[S.activeTemplate], { A4: S.templates.A4, A3: S.templates.A3, A4Name: S.templateNames.A4, A3Name: S.templateNames.A3, logo: S.logo, logoName: S.logoName, header: S.header });
    function templateName(tid) { return S.templateSets[tid].name; }
    /* Aplica a configuração do template vigente à paginação. Se já há páginas montadas com outra configuração (template trocado,
       configuração carregada depois da importação), refaz a paginação preservando as edições de título, foto e códigos. */
    const pagSig = c => JSON.stringify([c.capA4, c.colsA4, c.capA3, c.colsA3, c.paginateBy, c.layout, c.logoBox, c.sheetFormats, c.headerMode, c.headerCorner, c.footerLogo]);
    function applyConfig() {
        let config = CartazPagination.setConfig(S.templateSets[S.activeTemplate].config), signature = pagSig(config); S.config = config;
        if (S.pages.length && S.pagedWith && S.pagedWith !== signature) repaginate(); else if (S.pages.length) drawWhenIdle(); /* o resto da config (QR, botão, divisões, textos) só muda o desenho, não a paginação */
        S.pagedWith = S.pages.length ? signature : null; renderConfigBox();
    }
    function headerIsDefaultValue(header) { return header.title === HEADER_DEFAULT.title && header.sub === HEADER_DEFAULT.sub && header.stripe === HEADER_DEFAULT.stripe && header.titleColor === HEADER_DEFAULT.titleColor && header.subColor === HEADER_DEFAULT.subColor; }
    function headerHtml() { return '<strong>' + e(S.header.title || HEADER_DEFAULT.title) + '</strong><span>' + e(S.header.sub).replace(/\n/g, '<br>') + '</span>'; }
    /* Card fechado: mini-prévia do cartaz (fundo + logo centralizada, proporção da folha) com o nome
       sobreposto num degradê, badge "Vigente" e o lápis - mesmo espírito do card de marketplace em
       templates.html (capa + véu + nome, botão circular no canto). A edição de verdade acontece no
       modal (#templateModalBackdrop), aberto pelo lápis - ver openTemplateModal(). */
    function templateMiniHtml(def) {
        let set = S.templateSets[def.id], vigente = S.activeTemplate === def.id, cover = set.A4 || set.A3;
        return '<div class="cg-template-card' + (vigente ? ' vigente' : '') + '" data-template-set="' + def.id + '">'
            + '<div class="cg-template-mini-cover">'
            + (set.logo ? '<div class="cg-template-mini-logo"></div>' : '')
            + (vigente ? '<span class="cg-template-mini-badge">Vigente</span>' : '')
            + '<button type="button" class="cg-template-edit-btn" data-template-edit aria-label="Editar ' + e(set.name) + '" title="Editar template">' + PENCIL_ICON + '</button>'
            + '<div class="cg-template-mini-scrim"><div class="cg-template-mini-name">' + e(set.name) + '</div></div>'
            + '</div></div>';
    }
    function templateIdOf(el) { return el.closest('[data-template-set]').dataset.templateSet; }
    /* o quadrinho mostra uma miniatura (340 px) do fundo e da logo, gerada uma vez por imagem; o fundo inteiro (1654 px, ~1 MB) só é usado na folha */
    const thumbCache = new Map(), thumbPending = new Set();
    function fillThumb(el, url, width, type) {
        if (!el || !url) return; let paint = data => { if (el.isConnected) el.style.backgroundImage = 'url("' + data + '")'; }, hit = thumbCache.get(url); if (hit) return paint(hit);
        let key = url + type, image = new Image; if (thumbPending.has(key)) { return; } thumbPending.add(key);
        image.onload = () => { let canvas = document.createElement('canvas'); canvas.width = Math.min(width, image.naturalWidth); canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); thumbCache.set(url, canvas.toDataURL(type, .8)); thumbPending.delete(key); tplSig = ''; renderTemplateCards(); };
        image.onerror = () => thumbPending.delete(key); image.src = url;
    }
    let tplSig = '';
    function renderTemplateCards() {
        if (!$('templatesFold').open) { tplSig = ''; return; } /* desenha quando o menu abre */
        let defs = allTemplateDefs(), sig = JSON.stringify([S.activeTemplate, defs.map(d => { let x = S.templateSets[d.id]; return [d.id, x.name, (x.A4 || '').length, (x.A3 || '').length, (x.logo || '').length, thumbCache.has(x.A4 || x.A3) ? 1 : 0, thumbCache.has(x.logo) ? 1 : 0]; })]);
        if (sig === tplSig) return; tplSig = sig;
        $('templateSets').innerHTML = allTemplateDefs().map(templateMiniHtml).join('') + '<button type="button" class="cg-template-card cg-template-add" id="templateAddBtn" aria-label="Criar novo template"><span class="cg-template-add-icon">+</span><span>Novo template</span></button>';
        $('templateSets').querySelectorAll('[data-template-edit]').forEach(button => button.onclick = () => openTemplateModal(templateIdOf(button)));
        $('templateAddBtn').onclick = createTemplate;
        defs.forEach(d => { let set = S.templateSets[d.id], card = $('templateSets').querySelector('[data-template-set="' + d.id + '"]'); if (!card) return; fillThumb(card.querySelector('.cg-template-mini-cover'), set.A4 || set.A3, 340, 'image/jpeg'); fillThumb(card.querySelector('.cg-template-mini-logo'), set.logo, 200, 'image/png'); });
    }
    $('templatesFold').addEventListener('toggle', () => { if (!$('templatesFold').open) return; tplSig = ''; renderTemplateCards(); Promise.all(allTemplateDefs().map(d => ensureHeavy(d.id))).then(() => renderTemplateCards()); });
    /* Box "Configurações do cartaz": edita a config do template vigente (grava junto do template, compartilhada via portalStore). */
    const CONFIG_FIELDS = { cfgCapA4: 'capA4', cfgColsA4: 'colsA4', cfgCapA3: 'capA3', cfgColsA3: 'colsA3' };
    function configIsDefault(tid) { let a = S.templateSets[tid].config, b = defaultConfig(tid); return Object.keys(b).every(key => JSON.stringify(a[key]) === JSON.stringify(b[key])); }
    function saveConfig(tid) { queueShared(tid + '-config', configIsDefault(tid) ? null : S.templateSets[tid].config); if (tid === S.activeTemplate) applyConfig(); }
    const tplBase = {};
    let cfgDraft = null; /* rascunho do painel: { tid, base, config, header }; só vira configuração do template em "Aplicar" */
    const cfgIsDirty = () => { let set = cfgDraft && S.templateSets[cfgDraft.tid]; return !!set && (JSON.stringify(cfgDraft.config) !== JSON.stringify(set.config) || JSON.stringify(cfgDraft.header) !== JSON.stringify(set.header)); };
    let cfgOpen = new Set(); /* seções abertas (todas fechadas por padrão); o painel redesenha a cada mudança */
    let divisionsOpen = false; /* o painel redesenha a cada mudança; lembra se o dropdown de divisões estava aberto */
    /* Prévia do painel: o mesmo liveCard/logoBoxHtml da folha, com um produto fictício e a configuração em edição (ainda não gravada) */
    const PREVIEW_PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#e9edef"/><path d="M22 70 40 28l18 42z" fill="#b6c0c6"/><circle cx="40" cy="22" r="8" fill="#c9d1d6"/></svg>');
    function cfgPreviewHtml(config, hd) {
        let keep = S.config, keepDivision = S.curDivision;
        try {
            S.config = { ...keep, ...config }; let division = DIVISIONS.find(d => config.divisions.includes(d.id)) || null; S.curDivision = division;
            let group = { title: 'Produto de exemplo', minQty: '2', link: 'https://exemplo.com.br/produto', rows: ['A', 'B', 'C'].map((model, i) => ({ desc: 'Modelo ' + model, code: '60 01 10' + i + ' 000', fg: '', ovd: '', principal: '7891234567895' })) },
                mode = config.logoBox ? config.headerMode : 'none', corner = config.headerCorner || 'tl', ph = '<div class="lb-ph-box"></div>', at = (col, row) => 'grid-column:' + col + ';grid-row:' + row;
            /* mini folha de 2 colunas: o card de exemplo e vagas tracejadas; o header completo vira a faixa do topo, o compacto ocupa o canto escolhido */
            let cells = mode === 'compact' ? { tl: [1, 1], tr: [2, 1], bl: [1, 2], br: [2, 2] }[corner] : null, free = [[1, 1], [2, 1], [1, 2], [2, 2]].filter(c => !cells || c[0] !== cells[0] || c[1] !== cells[1]);
            if (mode === 'full') free.length = 2, free.forEach((c, i) => { c[1] = 2; c[0] = i + 1; });
            let card = liveCard({ group, col: free[0][0] - 1, gridRow: free[0][1] - 1, span: 1, photoSrc: PREVIEW_PHOTO }, 0, 0).replace(/style="grid-column:[^"]*"/, 'style="' + at(free[0][0], free[0][1]) + '"');
            let header = mode === 'full' ? '<div class="cfg-pv-head" style="grid-column:1/-1;grid-row:1"><div style="color:' + (hd.subColor || HEADER_DEFAULT.subColor) + '"><strong style="background:' + (hd.stripe || HEADER_DEFAULT.stripe) + ';color:' + (hd.titleColor || HEADER_DEFAULT.titleColor) + '">' + e(hd.title || HEADER_DEFAULT.title) + '</strong><span>' + e(hd.sub).replace(/\n/g, '<br>') + '</span></div>' + (S.logo ? '<img src="' + e(S.logo) + '" alt="">' : '<em>Logo do evento</em>') + '</div>'
                : mode === 'compact' ? logoBoxHtml({ corner, cols: 2, rows: 2 }) : '';
            return (division && config.showStrip !== false ? '<div class="lb-strip" style="background:' + divisionColor(division) + '"></div>' : '') + header + card + free.slice(1).map(c => '<div class="lb-ph-box" style="' + at(c[0], c[1]) + '"></div>').join('')
                + (config.legalEnabled && t(config.legalText) ? '<div class="sheet-legal">' + e(config.legalText).replace(/\n/g, '<br>') + '</div>' : '');
        } finally { S.config = keep; S.curDivision = keepDivision; }
    }
    function renderConfigBox() {
        let body = $('configBody'); if (!body) return; let tid = S.activeTemplate, set = S.templateSets[tid], draft = cfgDraft = (cfgDraft && cfgDraft.tid === tid && cfgDraft.base === set.config ? cfgDraft : { tid, base: set.config, config: JSON.parse(JSON.stringify(set.config)), header: { ...set.header } }), config = draft.config, header = draft.header, resolved = CartazPagination.resolve(config), auto = !!config.a3Auto, live = config.layout === 'liveshop', qr = config.codeType === 'qr';
        let num = (id, label, value, max, disabled) => '<input type="number" id="' + id + '" aria-label="' + label + '" min="1" max="' + max + '" step="1" value="' + value + '"' + (disabled ? ' disabled' : '') + '>',
            option = (value, label, current) => '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>',
            sw = (id, label, on, off) => '<input type="checkbox" class="cfg-switch" id="' + id + '" aria-label="' + label + '"' + (on ? ' checked' : '') + (off ? ' disabled' : '') + '>',
            toggle = (id, title, hint, on) => '<div class="cfg-toggle"><span><b>' + title + '</b>' + (hint ? '<small>' + hint + '</small>' : '') + '</span>' + sw(id, title, on) + '</div>',
            seg = (key, current, opts, cls) => '<div class="cfg-seg' + (cls ? ' ' + cls : '') + '" role="group">' + opts.map(([v, l]) => '<button type="button" data-seg="' + key + '" data-value="' + v + '" aria-pressed="' + (current === v) + '">' + l + '</button>').join('') + '</div>',
            sec = (title, right, inner) => '<details class="cfg-sec" data-sec="' + title + '"' + (cfgOpen.has(title) ? ' open' : '') + '><summary><h3><i>' + String(++count).padStart(2, '0') + '</i>' + title + '</h3>' + (right || '') + CHEVRON + '</summary><div class="cfg-body">' + inner + '</div></details>',
            lab = (text, inner, cls) => '<label class="cfg-field' + (cls ? ' ' + cls : '') + '"><span>' + text + '</span>' + inner + '</label>',
            /* campo do card: dropdown interno (interruptor no cabeçalho, ajustes dentro); sem ajustes ou desligado, vira só uma linha com o interruptor */
            field = (key, title, id, on, inner, off) => on && inner ? '<details class="cfg-fld" data-sec="f:' + key + '"' + (cfgOpen.has('f:' + key) ? ' open' : '') + '><summary><b>' + title + '</b>' + sw(id, title, on, off) + CHEVRON + '</summary><div class="cfg-body">' + inner + '</div></details>' : '<div class="cfg-fld cfg-fld-flat"><b>' + title + '</b>' + sw(id, title, on, off) + '</div>',
            /* código de barras no canto inferior direito: só cabe o Código, em lista simples (a Descrição fica desligada e travada) */
            tight = config.showCodeBox && config.codeType === 'barcode' && config.codePos === 'corner',
            fmt = tight ? '<p class="cfg-hint">Com o código de barras no canto inferior direito os códigos ficam em lista simples, sem a Descrição: as informações juntas não cabem.</p>' : '<div class="cfg-field"><span>Formato dos códigos</span>' + seg('tableStyle', config.tableStyle, [['table', 'Tabela'], ['list', 'Lista simples']]) + '</div>',
            btnMax = 22, count = 0, fullCap = config.colsA4 * 4, compactCap = config.colsA4 * 5 - 1; /* o header completo ocupa uma linha inteira das 5 do A4; o compacto, uma célula */
        body.innerHTML = '<p class="cg-config-note">Vale para o template vigente: <b>' + e(set.name) + '</b>. Cada template guarda as próprias configurações; ao trocar o template vigente, o cartaz volta ao layout dele.</p><div class="cfg-layout"><div class="cfg-stack">'
            + (live ? sec('Divisões', '',
                '<p class="cfg-hint">Cada divisão marcada gera o mesmo conjunto de folhas, com a faixa na cor dela e os links dela.</p>' + toggle('cfgStrip', 'Linha colorida no topo da folha', 'Faixa na cor da divisão acima do header.', config.showStrip !== false) + '<details class="cfg-drop"' + (divisionsOpen ? ' open' : '') + '><summary><span>' + (config.divisions.length ? config.divisions.map(id => DIVISIONS.find(d => d.id === id)?.name).filter(Boolean).join(', ') : 'Nenhuma divisão') + '</span><em>' + config.divisions.length + ' de ' + DIVISIONS.length + '</em>' + PortalShell.svgIcon('<path d="m6 9 6 6 6-6"/>', 14) + '</summary><div class="cfg-chips"><div class="cfg-chips-head">Cor da faixa</div>'
                + DIVISIONS.map(d => '<label class="cfg-chip"><input type="checkbox" class="cfg-check" data-division="' + d.id + '"' + (config.divisions.includes(d.id) ? ' checked' : '') + '><b>' + d.name + '</b><input type="color" class="cfg-color" data-division-color="' + d.id + '" value="' + e(divisionColor(d)) + '" title="Cor da faixa de ' + d.name + '"></label>').join('') + '</div></details>') : '')
            + (live ? sec('Header', sw('cfgLogoBox', 'Header', config.logoBox),
                '<div class="cfg-field"><span>Modelo do header</span>' + seg('headerMode', config.headerMode, [['full', 'Header completo'], ['compact', 'Header compacto']]) + '</div>'
                + (config.headerMode === 'full'
                    ? '<p class="cfg-hint">Faixa com título e subtítulo à esquerda e a logo do evento à direita, como na Feira. Ocupa a primeira linha da folha: sugestão de ' + fullCap + ' produtos por A4 (com mais, os cards encolhem para caber). O envio da logo fica em Editar template.</p>'
                        + lab('Título', '<input id="cfgHdTitle" maxlength="60" autocomplete="off" value="' + e(header.title) + '">')
                        + lab('Subtítulo <small>(cada linha vira uma linha no cartaz)</small>', '<textarea id="cfgHdSub" rows="2" maxlength="120">' + e(header.sub) + '</textarea>')
                        + '<div class="cfg-colors">' + lab('Cor da faixa', '<input type="color" class="cfg-color" id="cfgHdStripe" value="' + header.stripe + '">') + lab('Cor do título', '<input type="color" class="cfg-color" id="cfgHdTitleColor" value="' + header.titleColor + '">') + lab('Cor do subtítulo', '<input type="color" class="cfg-color" id="cfgHdSubColor" value="' + header.subColor + '">') + '</div>'
                    : '<p class="cfg-hint">Logo do evento e aviso num único box, no espaço de um card: até ' + compactCap + ' produtos por A4.</p>'
                    + '<div class="cfg-field"><span>Posição do header</span>' + seg('headerCorner', config.headerCorner, [['tl', 'Superior esquerdo'], ['tr', 'Superior direito'], ['bl', 'Inferior esquerdo'], ['br', 'Inferior direito']], 'cfg-seg-2') + '</div>'
                    + field('attnTitle', 'Título do aviso', 'cfgAttnTitleOn', config.attentionTitleOn !== false, lab('Título', '<input id="cfgAttentionTitle" maxlength="40" value="' + e(config.attentionTitle) + '">', 'grow'))
                    + field('attnText', 'Texto do aviso', 'cfgAttnTextOn', config.attentionTextOn !== false, lab('Texto', '<textarea id="cfgAttention" rows="3" maxlength="240">' + e(config.attentionText) + '</textarea>'))
                    + (config.attentionTitleOn !== false || config.attentionTextOn !== false ? lab('Cor do aviso', '<input type="color" class="cfg-color" id="cfgAttentionColor" title="Cor do aviso" value="' + e(config.attentionColor) + '">') : ''))) : '')
            + sec('Folha e grade', '',
                '<div class="cfg-field"><span>Tipos de folha</span>' + seg('sheetFormats', config.sheetFormats, [['both', 'A4 e A3'], ['a4', 'Somente A4'], ['a3', 'Somente A3']]) + '</div>'
                + '<div class="cfg-sheet"><span></span><span class="cfg-col">Produtos por folha</span><span class="cfg-col">Colunas</span>'
                + (config.sheetFormats !== 'a3' ? '<b>A4</b>' + num('cfgCapA4', 'Produtos por folha A4', config.capA4, 60) + num('cfgColsA4', 'Colunas no A4', config.colsA4, 8) : '')
                + (config.sheetFormats !== 'a4' ? '<b>A3</b>' + num('cfgCapA3', 'Produtos por folha A3', resolved.capA3, 120, auto) + num('cfgColsA3', 'Colunas no A3', resolved.colsA3, 12, auto) : '') + '</div>'
                + (config.sheetFormats === 'both' ? toggle('cfgA3Auto', 'Calcular A3 automaticamente', 'Usa 1,5× a quantidade do A4. Desligue para definir o A3 à mão.', auto) : '')
                + '<div class="cfg-field"><span>Paginação</span>' + seg('paginateBy', config.paginateBy, [['brand', 'Por marca'], ['sequence', 'Contínua']]) + '</div>')
            + (live ? sec('Box do produto', '',
                [['title', 'Título do produto', 'cfgShowTitle', config.showTitle, '<div class="cfg-field"><span>Alinhamento</span>' + seg('titleAlign', config.titleAlign, [['left', 'À esquerda'], ['center', 'Centralizado'], ['right', 'À direita'], ['justify', 'Justificado']]) + '</div>'],
                 ['photo', 'Foto do produto', 'cfgShowPhoto', config.showPhoto, ''],
                 ['codebox', 'QR Code / Código de barras', 'cfgShowCodeBox', config.showCodeBox, '<div class="cfg-field"><span>Tipo</span>' + seg('codeType', config.codeType, [['qr', 'QR Code'], ['barcode', 'Código de barras']]) + '</div>'
                    + '<div class="cfg-field"><span>Posição no card</span>' + seg('codePos', config.codePos, [['left', 'Coluna ao lado'], ['corner', 'Canto inferior direito']]) + '</div>'
                    + '<p class="cfg-hint">' + (qr ? 'O QR leva ao link de redirecionamento do produto.' : 'Imprime o código de barras do produto. No canto inferior direito ele fica maior (como na Feira) e a foto encolhe para dar espaço; na coluna ao lado ele é bem menor.') + '</p>'],
                 ['desc', 'Descrição', 'cfgShowDesc', config.showDesc, fmt, tight],
                 ['code', 'Código', 'cfgShowCode', config.showCode, fmt],
                 ['qty', 'Quantidade mínima', 'cfgShowQty', config.showQty, ''],
                 ['button', qr ? 'Botão abaixo do QR Code' : 'Botão abaixo do código de barras', 'cfgButton', config.button, '<p class="cfg-hint">' + (qr ? 'Reforça a chamada para quem não lê QR.' : 'Leva ao link do produto (precisa de link no box).') + '</p>'
                    + '<div class="cfg-btnrow"><div class="cfg-inline">' + lab('Texto do botão <em id="cfgBtnCount" class="cfg-count">' + config.buttonText.length + '/' + btnMax + '</em>', '<input id="cfgButtonText" maxlength="40" value="' + e(config.buttonText) + '">', 'grow') + lab('Cor', '<input type="color" class="cfg-color" id="cfgButtonColor" title="Cor do botão" value="' + e(config.buttonColor) + '">') + '</div>'
                    + '<div class="cfg-field"><span>Prévia</span><span class="cfg-btnprev" id="cfgBtnPrev" style="background:' + e(config.buttonColor) + '">' + e(config.buttonText) + '</span></div></div>'
                    + '<p class="cfg-warn" id="cfgBtnWarn"' + (config.buttonText.length > btnMax ? '' : ' hidden') + '>Texto longo: acima de ' + btnMax + ' caracteres o botão pode cortar no cartaz. Ex.: “COMPRE AGORA”.</p>']
                ].map(([key, title, id, on, inner, off]) => field(key, title, id, on, inner, off)).join(''))
            + sec('Rodapé', '',
                toggle('cfgFooterLogo', 'Logo da marca', '', config.footerLogo)
                + toggle('cfgLegalOn', 'Texto legal', 'Fonte pequena, centralizada no rodapé.', config.legalEnabled)
                + (config.legalEnabled ? '<textarea id="cfgLegal" rows="3" maxlength="600" aria-label="Texto legal">' + e(config.legalText) + '</textarea>' : '')) : '')
            + '</div>' + (live ? '<aside class="cfg-preview"><h4>Prévia do card</h4><div class="cfg-pv" id="cfgPreview" aria-hidden="true"></div><p class="cfg-hint">Exemplo com dados fictícios; muda conforme você edita.</p></aside>' : '') + '</div><div class="cg-config-actions"><button type="button" class="secondary" id="cfgDiscard" disabled>Descartar</button><button type="button" class="secondary" id="cfgReset"' + (Object.keys(defaultConfig(tid)).every(key => JSON.stringify(config[key]) === JSON.stringify(defaultConfig(tid)[key])) ? ' disabled' : '') + '>Restaurar</button><button type="button" id="cfgApply" disabled>Aplicar</button><span class="cfg-dirty" id="cfgDirty" hidden>Alterações ainda não aplicadas à folha</span></div>';
        body.querySelectorAll('details.cfg-sec, details.cfg-fld').forEach(d => d.addEventListener('toggle', () => cfgOpen[d.open ? 'add' : 'delete'](d.dataset.sec)));
        /* a prévia é uma miniatura fiel: o card tem o tamanho real que terá na folha A4 desta configuração (colunas e linhas) e o conjunto é reduzido para caber no painel */
        let refresh = () => { let dirty = cfgIsDirty(); body.querySelector('#cfgApply').disabled = body.querySelector('#cfgDiscard').disabled = !dirty; body.querySelector('#cfgDirty').hidden = !dirty; };
        let paint = () => {
            let pv = body.querySelector('#cfgPreview'); if (!pv) return;
            let sheet = CartazPagination.resolve(config), cols = sheet.colsA4, rowsA4 = Math.ceil((sheet.capA4 + (config.logoBox && config.headerMode !== 'full' ? 1 : 0)) / cols), w = Math.round((794 - 60 - 8 * (cols - 1)) / cols), h = Math.round(w / LIVE_BASE_W > 1.3 ? Math.min(935 / rowsA4, w * LIVE_RATIO) : 935 / rowsA4);
            pv.style.zoom = ''; pv.style.setProperty('--pw', w + 'px'); pv.style.setProperty('--ph', h + 'px'); pv.innerHTML = cfgPreviewHtml(config, header);
            let card = pv.querySelector('.card.lb'); if (card) { card.style.setProperty('--u', cardScale(card, 1)); fitButton(card); }
            pv.style.zoom = Math.min(1, 362 / (2 * w + 28)).toFixed(3);
        }; paint();
        body.querySelector('.cfg-drop')?.addEventListener('toggle', event => { divisionsOpen = event.target.open; });
        body.querySelectorAll('[data-seg]').forEach(button => button.onclick = () => { let wasFull = config.headerMode === 'full'; config[button.dataset.seg] = button.dataset.value; if (button.dataset.seg === 'sheetFormats' && button.dataset.value === 'a3' && config.a3Auto) { config.a3Auto = false; config.capA3 = resolved.capA3; config.colsA3 = resolved.colsA3; } /* só A3: os números do A3 passam a ser seus */
            if (config.showCodeBox && config.codeType === 'barcode' && config.codePos === 'corner') { config.showDesc = false; config.showCode = true; config.tableStyle = 'list'; } /* essa combinação só comporta o Código em lista simples */
            if (button.dataset.seg === 'headerMode' && config.capA4 === (wasFull ? fullCap : compactCap)) config.capA4 = button.dataset.value === 'full' ? fullCap : compactCap; /* só troca o número se ele ainda era o sugerido do modelo anterior: um valor digitado pela pessoa é preservado */ renderConfigBox(); });
        let btnText = body.querySelector('#cfgButtonText'), btnColor = body.querySelector('#cfgButtonColor');
        if (btnText) { let sync = () => { body.querySelector('#cfgBtnCount').textContent = btnText.value.length + '/' + btnMax; body.querySelector('#cfgBtnWarn').hidden = btnText.value.length <= btnMax; body.querySelector('#cfgBtnPrev').textContent = btnText.value; body.querySelector('#cfgBtnPrev').style.background = btnColor.value; }; btnText.oninput = btnColor.oninput = () => { config.buttonText = t(btnText.value) || CartazPagination.DEFAULT_CONFIG.buttonText; config.buttonColor = btnColor.value; sync(); paint(); refresh(); }; }
        /* texto e cores do header completo ficam na peça "header" do template (mesmos dados do modal Editar template) */
        [['cfgHdTitle', 'title'], ['cfgHdSub', 'sub'], ['cfgHdStripe', 'stripe'], ['cfgHdTitleColor', 'titleColor'], ['cfgHdSubColor', 'subColor']].forEach(([id, key]) => { let el = body.querySelector('#' + id); if (!el) return; el.oninput = () => { header[key] = el.value; paint(); refresh(); }; el.onchange = refresh; });
        let commit = () => renderConfigBox(), on = (id, key, read) => { let el = body.querySelector('#' + id); if (el) { el.onchange = event => { config[key] = read(event.target); commit(); }; if (!el.oninput) el.oninput = event => { config[key] = read(event.target); paint(); refresh(); }; } };
        Object.entries(CONFIG_FIELDS).forEach(([id, key]) => on(id, key, input => Math.max(1, Math.floor(+input.value) || 1)));
        on('cfgA3Auto', 'a3Auto', input => { if (!input.checked) { config.capA3 = resolved.capA3; config.colsA3 = resolved.colsA3; } return input.checked; });
        [['cfgShowTitle', 'showTitle'], ['cfgShowPhoto', 'showPhoto'], ['cfgShowCodeBox', 'showCodeBox'], ['cfgShowQty', 'showQty'], ['cfgShowDesc', 'showDesc'], ['cfgShowCode', 'showCode'], ['cfgButton', 'button'], ['cfgStrip', 'showStrip']].forEach(([id, key]) => on(id, key, input => input.checked)); on('cfgLogoBox', 'logoBox', input => input.checked); on('cfgFooterLogo', 'footerLogo', input => input.checked);
        on('cfgAttnTitleOn', 'attentionTitleOn', input => input.checked); on('cfgAttnTextOn', 'attentionTextOn', input => input.checked); on('cfgAttention', 'attentionText', input => input.value); on('cfgAttentionTitle', 'attentionTitle', input => input.value); on('cfgAttentionColor', 'attentionColor', input => input.value); on('cfgLegalOn', 'legalEnabled', input => input.checked); on('cfgLegal', 'legalText', input => input.value); on('cfgButton', 'button', input => input.checked);
        on('cfgButtonText', 'buttonText', input => t(input.value) || CartazPagination.DEFAULT_CONFIG.buttonText); on('cfgButtonColor', 'buttonColor', input => input.value);
        body.querySelectorAll('[data-division]').forEach(input => input.onchange = () => { config.divisions = DIVISIONS.map(d => d.id).filter(id => id === input.dataset.division ? input.checked : config.divisions.includes(id)); commit(); });
        body.querySelectorAll('[data-division-color]').forEach(input => input.onchange = () => { config.divisionColors = { ...config.divisionColors, [input.dataset.divisionColor]: input.value }; commit(); });
        body.querySelector('#cfgReset').onclick = () => { draft.config = defaultConfig(tid); commit(); };
        body.querySelector('#cfgDiscard').onclick = () => { cfgDraft = null; renderConfigBox(); };
        body.querySelector('#cfgApply').onclick = () => {
            let headerChanged = JSON.stringify(header) !== JSON.stringify(set.header), configChanged = JSON.stringify(config) !== JSON.stringify(set.config);
            if (headerChanged) { set.header = { ...header }; saveTemplatePiece(tid, 'header', headerIsDefaultValue(set.header) ? null : { ...set.header }); applyTemplates(); }
            if (configChanged) { set.config = JSON.parse(JSON.stringify(config)); draft.base = set.config; saveConfig(tid); }
            delete tplBase[tid]; renderConfigBox(); toast('Configurações aplicadas à folha.');
        };
        refresh();
        let fold = $('configFold'); if (fold && !fold.dataset.dirtyHook) { fold.dataset.dirtyHook = '1'; fold.addEventListener('toggle', () => { if (!fold.open && cfgDraft && cfgIsDirty()) toast('O painel tem alterações ainda não aplicadas.'); }); }
    }
    function createTemplate() {
        let id = 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        S.templateSets[id] = blankTemplateSet(id);
        openTemplateModal(id, true);
    }
    function templateSlotHtml(format, set) {
        let url = set[format];
        return '<div class="cg-template-slot" data-format="' + format + '"><div class="cg-template-thumb" style="' + (url ? 'background-image:url(\'' + url + '\')' : '') + '" aria-hidden="true"></div><div class="cg-template-info"><strong>' + format + '</strong><span class="cg-template-name">' + (url ? e(set[format + 'Name']) : 'Padrão do portal') + '</span><div class="cg-template-actions"><label class="upload">Enviar fundo ' + format + '<input type="file" accept="image/png,image/jpeg,image/webp" data-template-file="' + format + '"></label></div></div></div>';
    }
    function logoSlotHtml(set) {
        return '<div class="cg-template-slot" data-logo-slot><div class="cg-logo-thumb" style="' + (set.logo ? 'background-image:url(\'' + set.logo + '\')' : '') + '" aria-hidden="true"></div><div class="cg-template-info"><strong>Logo do cabeçalho</strong><span class="cg-template-name">' + (set.logo ? e(set.logoName) : 'Padrão do portal') + '</span><div class="cg-template-actions"><label class="upload">Enviar logo<input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" data-logo-file></label></div></div></div>';
    }
    function headerFieldsHtml(header) {
        return '<div class="cg-header-fields"><label>Título<input type="text" maxlength="60" autocomplete="off" data-header-title value="' + e(header.title) + '"></label><label>Subtítulo <small>(cada linha do campo vira uma linha no cartaz)</small><textarea rows="2" maxlength="120" data-header-sub>' + e(header.sub) + '</textarea></label><div class="cg-header-colors"><label>Cor da faixa<input type="color" data-header-stripe value="' + header.stripe + '"></label><label>Cor do título<input type="color" data-header-title-color value="' + header.titleColor + '"></label><label>Cor do subtítulo<input type="color" data-header-sub-color value="' + header.subColor + '"></label></div></div>';
    }
    /* Modal de edição: um rascunho (modalDraft) recebe todas as mudanças - upload, restaurar, nome,
       texto e "vigente" - e só é gravado de verdade (saveTemplatePiece + espelho na prévia) quando o
       usuário clica Salvar; Cancelar/X descartam o rascunho sem tocar em S.templateSets. */
    let modalDraft = null;
    function templateModalBodyHtml(d) {
        let vigenteAgora = S.activeTemplate === d.tid;
        return '<div class="cg-template-modal-head"><input type="text" class="cg-template-name-input" maxlength="40" autocomplete="off" id="tmName" value="' + e(d.name) + '">'
            + '<label class="cg-template-active"><input type="checkbox" id="tmActive"' + (d.active ? ' checked' : '') + (vigenteAgora ? ' disabled' : '') + '>' + (vigenteAgora ? 'Este é o template vigente' : 'Usar como vigente na prévia e exportação') + '</label></div>'
            + '<div class="cg-template-groups">'
            + '<div class="cg-template-group"><h3>Fundo</h3><div class="cg-template-slots">' + templateSlotHtml('A4', d) + templateSlotHtml('A3', d) + '</div></div>'
            + '<div class="cg-template-group"><h3>Logo</h3>' + logoSlotHtml(d) + '</div>'
            + '<div class="cg-template-group"><h3>Texto do cabeçalho</h3>' + headerFieldsHtml(d.header) + '</div>'
            + '</div>';
    }
    function renderTemplateModalBody() {
        $('templateModalBody').innerHTML = templateModalBodyHtml(modalDraft);
        let body = $('templateModalBody');
        body.querySelector('#tmName').oninput = event => { modalDraft.name = event.target.value; };
        body.querySelector('#tmActive').onchange = event => { modalDraft.active = event.target.checked; };
        body.querySelectorAll('[data-template-file]').forEach(input => input.onchange = () => { let file = input.files[0], format = input.dataset.templateFile; input.value = ''; processTemplateFile(format, file, result => { modalDraft[format] = result.url; modalDraft[format + 'Name'] = result.name; renderTemplateModalBody(); }); });
        body.querySelector('[data-logo-file]').onchange = event => { let file = event.target.files[0]; event.target.value = ''; processLogoFile(file, result => { modalDraft.logo = result.url; modalDraft.logoName = result.name; renderTemplateModalBody(); }); };
        body.querySelector('[data-header-title]').oninput = event => { modalDraft.header.title = event.target.value; };
        body.querySelector('[data-header-sub]').oninput = event => { modalDraft.header.sub = event.target.value; };
        body.querySelector('[data-header-stripe]').oninput = event => { modalDraft.header.stripe = event.target.value; };
        body.querySelector('[data-header-title-color]').oninput = event => { modalDraft.header.titleColor = event.target.value; };
        body.querySelector('[data-header-sub-color]').oninput = event => { modalDraft.header.subColor = event.target.value; };
    }
    async function openTemplateModal(tid, isNew) {
        await ensureHeavy(tid); let set = S.templateSets[tid];
        modalDraft = { tid, isNew: !!isNew, name: set.name, A4: set.A4, A3: set.A3, A4Name: set.A4Name, A3Name: set.A3Name, logo: set.logo, logoName: set.logoName, header: { ...set.header }, active: S.activeTemplate === tid };
        $('templateModalTitle').textContent = isNew ? 'Novo template' : 'Editar ' + set.name;
        renderTemplateModalBody();
        $('templateModalBackdrop').style.display = 'flex';
    }
    /* Fechar sem salvar um template recém-criado (via "+ Novo template") descarta o rascunho por
       completo - ele só passa a existir de verdade (card na galeria, sincronizado com o portalStore)
       depois de "Salvar" (ver saveTemplateModal, que zera isNew antes de chamar closeTemplateModal). */
    function closeTemplateModal() {
        if (modalDraft && modalDraft.isNew) delete S.templateSets[modalDraft.tid];
        $('templateModalBackdrop').style.display = 'none'; modalDraft = null;
    }
    function saveTemplateModal() {
        let d = modalDraft, tid = d.tid, set = S.templateSets[tid];
        if (d.isNew) { d.isNew = false; customTemplateIds.push(tid); try { localStorage.setItem(TPL_KEY + CUSTOM_IDS_KEY, JSON.stringify(customTemplateIds)); } catch (_) { } queueShared(CUSTOM_IDS_KEY, customTemplateIds); }
        set.name = t(d.name) || defaultTemplateName(tid); queueShared(tid + '-name', set.name === defaultTemplateName(tid) ? null : set.name);
        set.A4 = d.A4; set.A4Name = d.A4Name; saveTemplatePiece(tid, 'A4', d.A4 ? { name: d.A4Name, url: d.A4 } : null);
        set.A3 = d.A3; set.A3Name = d.A3Name; saveTemplatePiece(tid, 'A3', d.A3 ? { name: d.A3Name, url: d.A3 } : null);
        set.logo = d.logo; set.logoName = d.logoName; saveTemplatePiece(tid, 'logo', d.logo ? { name: d.logoName, url: d.logo } : null);
        set.header = d.header; saveTemplatePiece(tid, 'header', headerIsDefaultValue(d.header) ? null : d.header);
        let switching = d.active && S.activeTemplate !== tid;
        closeTemplateModal();
        if (switching) setActiveTemplate(tid); else { applyTemplates(); toast('Template salvo.'); }
    }
    /* Processa o arquivo (valida, redimensiona/comprime) e devolve {url,name} pro chamador decidir o
       que fazer - não mexe em S.templateSets nem no portalStore, pra poder ser usado tanto num rascunho
       do modal quanto (se algum dia precisar) fora dele, sem duplicar a lógica de compressão. */
    function processTemplateFile(format, file, onDone) {
        if (!file) return; if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Envie uma imagem JPG, PNG ou WebP.'); return; }
        let source = URL.createObjectURL(file), image = new Image;
        image.onload = () => {
            URL.revokeObjectURL(source);
            if (Math.abs(image.naturalHeight / image.naturalWidth - TPL_RATIO) / TPL_RATIO > .02) { toast('O template ' + format + ' precisa ter a proporção da folha (1 : 1,414). Este tem ' + image.naturalWidth + ' × ' + image.naturalHeight + ' px.'); return; }
            let width = Math.min(image.naturalWidth, TPL_WIDTH[format]), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); canvas.width = width; canvas.height = Math.round(width * image.naturalHeight / image.naturalWidth);
            ctx.fillStyle = '#003e55'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            let encode = (w, quality) => { canvas.width = w; canvas.height = Math.round(w * image.naturalHeight / image.naturalWidth); ctx.fillStyle = '#003e55'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', quality); }, url = encode(width, .92);
            for (let quality of [.85, .78, .7, .62]) if (url.length > SHARED_MAX) url = encode(width, quality);
            while (url.length > SHARED_MAX && width > 800) { width = Math.round(width * .85); url = encode(width, .62); }
            onDone({ url, name: file.name });
        };
        image.onerror = () => { URL.revokeObjectURL(source); toast('Não foi possível ler esta imagem.'); }; image.src = source;
    }
    function processLogoFile(file, onDone) {
        if (!file) return; if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { toast('Envie a logo em PNG, JPG, WebP ou SVG.'); return; }
        let done = url => onDone({ url, name: file.name });
        if (file.type === 'image/svg+xml') { if (file.size > 700000) { toast('O SVG da logo deve ter até 700 KB.'); return; } let reader = new FileReader; reader.onload = () => done(reader.result); reader.readAsDataURL(file); return; }
        let source = URL.createObjectURL(file), image = new Image;
        image.onload = () => { URL.revokeObjectURL(source); let width = Math.min(image.naturalWidth, 800), canvas = document.createElement('canvas'), url, draw = () => { canvas.width = width; canvas.height = Math.round(width * image.naturalHeight / image.naturalWidth); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); url = canvas.toDataURL('image/png'); }; draw(); while (url.length > SHARED_MAX && width > 200) { width = Math.round(width * .75); draw(); } done(url); };
        image.onerror = () => { URL.revokeObjectURL(source); toast('Não foi possível ler esta imagem.'); }; image.src = source;
    }
    function applyTemplates() {
        let style = document.getElementById('templateStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'templateStyle' }));
        let header = S.header || HEADER_DEFAULT;
        let css = ['A4', 'A3'].filter(format => S.templates[format]).map(format => '.sheet.' + format.toLowerCase() + '.custom-bg{background-image:url("' + S.templates[format] + '")}').join('\n')
            + (S.logo ? '\n.sheet.custom-logo::after{background-image:url("' + S.logo + '")}' : '')
            + '\n.sheet-heading{color:' + (header.subColor || HEADER_DEFAULT.subColor) + '}.sheet-heading strong{background:' + (header.stripe || HEADER_DEFAULT.stripe) + ';color:' + (header.titleColor || HEADER_DEFAULT.titleColor) + '}';
        if (style.textContent !== css) style.textContent = css;
        renderTemplateCards();
        if (S.pages.length) drawWhenIdle();
    }
    /* grava a peça no portalStore (tira o registro quando value é null); o texto do cabeçalho espera 0,8 s
       parado para não gravar a cada tecla. part agora é "<template>-<peça>" (ex.: "feira-A4") ou "active". */
    function queueShared(part, value) {
        clearTimeout(sharedTimers[part]);
        sharedTimers[part] = setTimeout(async () => {
            try {
                let key = SHARED_KEY + part; if (!value) { await SyncBackend.remove(key); sharedVersion[part] = 0; return; }
                let result = await SyncBackend.put(key, value, sharedVersion[part] || 0);
                if (result.conflict) result = await SyncBackend.put(key, value, result.server.updated_at); /* a última edição vence */
                sharedVersion[part] = result.updated_at || 0;
            } catch (_) { toast('Aplicado neste navegador, mas não foi possível compartilhar com as outras máquinas.'); }
        }, part.endsWith('-header') || part.endsWith('-name') || part.endsWith('-config') ? 800 : 0);
    }
    /* Espelha a peça salva em S.templates/S.logo/S.header (o que draw()/CSS realmente leem) quando o
       template editado é o vigente, e mantém o cache local (mesmas chaves de antes) só para ele - é o
       único que precisa abrir na hora sem depender da rede. */
    function mirrorActive(tid, piece, value) {
        if (tid !== S.activeTemplate) return;
        if (piece === 'A4' || piece === 'A3') { S.templates[piece] = value?.url || ''; S.templateNames[piece] = value?.name || ''; }
        else if (piece === 'logo') { S.logo = value?.url || ''; S.logoName = value?.name || ''; }
        else S.header = value || { ...HEADER_DEFAULT };
    }
    function saveTemplatePiece(tid, piece, value) {
        queueShared(tid + '-' + piece, value);
        mirrorActive(tid, piece, value);
        if (tid === S.activeTemplate) {
            let key = piece === 'A4' || piece === 'A3' ? TPL_KEY + piece : piece === 'logo' ? LOGO_KEY : HEADER_KEY;
            try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch (_) { toast('Aplicado, mas o navegador não teve espaço para guardar: vale só até fechar esta aba.'); }
        }
    }
    /* Ao abrir: o que está no portalStore vale e atualiza o cache local. Na 1a vez deste navegador para
       cada template, o que já estava só no localStorage sobe pro portalStore (uma vez; depois disso, "sem
       registro" quer dizer que alguém restaurou o padrão nessa máquina/template, e o cache local
       correspondente é limpo). "feira" também herda, só na 1a carga de qualquer máquina, o que já estava
       nas chaves antigas (sem prefixo de template) do sistema de template único anterior - sem isso, um
       navegador sem cache local perderia de vista o template que já estava no ar. */
    /* Cada template tem 6 registros no portalStore; o fundo A4/A3 e a logo são imagens de até ~0,9 MB. O vigente carrega tudo; os demais carregam só nome, header e
       configuração e deixam as imagens (ensureHeavy) para quando o menu "Template do cartaz" ou o editor de template for aberto. */
    const HEAVY_PARTS = ['A4', 'A3', 'logo'], LIGHT_PARTS = ['header', 'name', 'config'], heavyLoaded = new Set(), tplCtx = {};
    async function loadTemplatePart(tid, part, seeded, local) {
        let set = S.templateSets[tid];
                let record = await SyncBackend.get(SHARED_KEY + tid + '-' + part), value = record.v; sharedVersion[tid + '-' + part] = record.updated_at || 0;
                if (!value && tid === 'feira' && !seeded && part !== 'name' && part !== 'config') { let legacy = await SyncBackend.get(SHARED_KEY + part); if (legacy.v) { value = legacy.v; queueShared(tid + '-' + part, value); } }
                if (!value) { if (!seeded && local[part]) queueShared(tid + '-' + part, local[part]); else if (seeded && local[part]) { if (part === 'A4' || part === 'A3') { set[part] = ''; set[part + 'Name'] = ''; } else if (part === 'logo') { set.logo = ''; set.logoName = ''; } else if (part === 'name') set.name = defaultTemplateName(tid); else set.header = { ...HEADER_DEFAULT }; } return; }
                if (part === 'A4' || part === 'A3') { set[part] = value.url; set[part + 'Name'] = value.name || 'Template enviado'; }
                else if (part === 'logo') { set.logo = value.url; set.logoName = value.name || 'Logo enviada'; }
                else if (part === 'name') set.name = value;
                else if (part === 'config') set.config = { ...defaultConfig(tid), ...value };
                else set.header = { title: t(value.title) || HEADER_DEFAULT.title, sub: value.sub ?? HEADER_DEFAULT.sub, stripe: value.stripe || HEADER_DEFAULT.stripe, titleColor: value.titleColor || HEADER_DEFAULT.titleColor, subColor: value.subColor || HEADER_DEFAULT.subColor };
    }
    async function ensureHeavy(tid) {
        let ctx = tplCtx[tid]; if (heavyLoaded.has(tid)) return; if (!ctx) { heavyLoaded.add(tid); return; }
        try { await Promise.all(HEAVY_PARTS.map(part => loadTemplatePart(tid, part, ctx.seeded, ctx.local))); heavyLoaded.add(tid); try { localStorage.setItem(ctx.seededKey, '1'); } catch (_) { } } catch (_) { /* sem rede: tenta de novo na próxima abertura */ }
    }
    async function loadShared() {
        try {
            let [activeRecord, customRecord] = await Promise.all([SyncBackend.get(SHARED_KEY + 'active'), SyncBackend.get(SHARED_KEY + CUSTOM_IDS_KEY)]);
            if (Array.isArray(customRecord.v)) { customTemplateIds = customRecord.v; customTemplateIds.forEach(id => { if (!S.templateSets[id]) S.templateSets[id] = blankTemplateSet(id); }); try { localStorage.setItem(TPL_KEY + CUSTOM_IDS_KEY, JSON.stringify(customTemplateIds)); } catch (_) { } }
            sharedVersion[CUSTOM_IDS_KEY] = customRecord.updated_at || 0;
            if (activeRecord.v && S.templateSets[activeRecord.v]) S.activeTemplate = activeRecord.v;
            sharedVersion.active = activeRecord.updated_at || 0;
            await Promise.all(allTemplateDefs().map(async def => {
                let tid = def.id, set = S.templateSets[tid], seededKey = SHARED_SEEDED + '-' + tid, seeded = localStorage.getItem(seededKey) === '1',
                    local = { A4: set.A4 && { name: set.A4Name, url: set.A4 }, A3: set.A3 && { name: set.A3Name, url: set.A3 }, logo: set.logo && { name: set.logoName, url: set.logo }, header: headerIsDefaultValue(set.header) ? null : set.header, name: set.name !== defaultTemplateName(tid) ? set.name : null },
                    vigente = tid === S.activeTemplate;
                tplCtx[tid] = { seeded, local, seededKey };
                await Promise.all((vigente ? HEAVY_PARTS.concat(LIGHT_PARTS) : LIGHT_PARTS).map(part => loadTemplatePart(tid, part, seeded, local)));
                if (vigente) { heavyLoaded.add(tid); try { localStorage.setItem(seededKey, '1'); } catch (_) { } }
            }));
            let active = S.templateSets[S.activeTemplate];
            S.templates = { A4: active.A4, A3: active.A3 }; S.templateNames = { A4: active.A4Name, A3: active.A3Name }; S.logo = active.logo; S.logoName = active.logoName; S.header = active.header;
            try {
                localStorage.setItem(TPL_KEY + 'active', S.activeTemplate);
                ['A4', 'A3'].forEach(format => localStorage.removeItem(TPL_KEY + format)); localStorage.removeItem(LOGO_KEY); localStorage.removeItem(HEADER_KEY);
                active.A4 && localStorage.setItem(TPL_KEY + 'A4', JSON.stringify({ name: active.A4Name, url: active.A4 })); active.A3 && localStorage.setItem(TPL_KEY + 'A3', JSON.stringify({ name: active.A3Name, url: active.A3 }));
                active.logo && localStorage.setItem(LOGO_KEY, JSON.stringify({ name: active.logoName, url: active.logo })); headerIsDefaultValue(active.header) || localStorage.setItem(HEADER_KEY, JSON.stringify(active.header));
            } catch (_) { }
            applyConfig(); applyTemplates();
        } catch (_) { /* sem rede/login: segue com o cache local */ }
    }
    async function setActiveTemplate(tid) {
        if (tid === S.activeTemplate || !S.templateSets[tid]) return; await ensureHeavy(tid);
        S.activeTemplate = tid; let set = S.templateSets[tid];
        S.templates = { A4: set.A4, A3: set.A3 }; S.templateNames = { A4: set.A4Name, A3: set.A3Name }; S.logo = set.logo; S.logoName = set.logoName; S.header = set.header;
        try { localStorage.setItem(TPL_KEY + 'active', tid); } catch (_) { }
        queueShared('active', tid);
        applyConfig(); applyTemplates(); toast('"' + templateName(tid) + '" agora é o template vigente na prévia e na exportação.');
    }
    $('templateModalClose').onclick = $('templateModalCancel').onclick = closeTemplateModal;
    $('templateModalSave').onclick = saveTemplateModal;
    $('templateModalBackdrop').addEventListener('click', event => { if (event.target.id === 'templateModalBackdrop') closeTemplateModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('templateModalBackdrop').style.display === 'flex') closeTemplateModal(); });
    applyConfig(); loadShared();
    /* clicar no "i" dentro do título do menu não abre/fecha o menu */
    document.querySelectorAll('.cg-fold .cg-tip-btn').forEach(button => button.addEventListener('click', event => event.preventDefault()));
    applyTemplates();
    $('sheet').onchange = x => x.target.files[0] && load(x.target.files[0]); $('saveGrid').onclick = saveCurrentGrid; loadSavedGrids(); loadBrandAssets(); if ($('codes')) $('codes').onchange = x => map(x.target.files, S.codes, 'codeInfo'); function settleImage(image) { return image.complete ? Promise.resolve() : new Promise(resolve => { let done = () => resolve(); image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); setTimeout(done, 15000); }); }
    /* O worker da foto (cloudflare-worker.js, product-image) repassa a imagem em streaming, sem Content-Length -
       uma conexão instável no meio do download trunca o JPEG, e mesmo assim o navegador pode disparar "load"
       (largura/altura ficam num marcador bem no início do arquivo, antes dos pixels). decode() detecta de
       verdade se a imagem decodificou inteira; se falhar, busca a foto de novo (até 2x, com cache-bust) antes
       de cair no aviso "Foto indisponível" de sempre (mesmo fallback do onerror inline em card()). */
    async function verifyImage(image) {
        if (image.hidden || !image.naturalWidth || !image.decode) return;
        for (let attempt = 0; attempt < 3; attempt++) {
            try { await image.decode(); return; } catch (_) { }
            if (attempt === 2) break;
            let url = new URL(image.src, location.href); url.searchParams.set('_retry', Date.now() + '-' + attempt);
            image.src = url.href; await settleImage(image);
        }
        image.hidden = true; if (image.nextElementSibling) image.nextElementSibling.hidden = false;
    }
    async function waitForImages(root) { let images = [...root.querySelectorAll('img')]; await Promise.all(images.map(settleImage)); await Promise.all(images.map(verifyImage)); }
    async function printAllBrands(format) { let brand = S.brand; S.brand = ''; S.printFormat = format; draw(); await waitForImages($('preview')); await new Promise(resolve => setTimeout(resolve, 250)); print(); S.brand = brand; S.printFormat = ''; draw(); }
    function safeName(value) { return t(value).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'SEM MARCA'; }
    function canvasBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Não foi possível gerar a imagem da página.')), 'image/jpeg', .92)); }
    /* html2canvas 1.4.1 nunca implementou object-fit (fica esticado/cortado ao ignorar a proporção da
       imagem) - por isso a exportação saía diferente da prévia: fotos "cortadas" (.photo img usa
       object-fit:scale-down ou contain, varia por card) e logos "achatadas" (.sheet-footer/.sheet-logo-card
       img usam object-fit:contain).
       Logos: sem transform nem overflow envolvidos, só redimensiona o <img> mesmo - a centralização já
       vem do grid place-items:center do pai. */
    /* O html2canvas assenta o texto do botão cerca de 0,8 px (css) mais baixo que o navegador: sobrava mais margem acima do que abaixo na exportação.
       Compensa só no clone, subindo o texto (o CSS da prévia e da impressão segue igual). Medido nos pixels do export: folga de cima 5 px x 0 px embaixo. */
    function fitClonedButtons(clonedSheet) { clonedSheet.querySelectorAll('.lb-btn').forEach(btn => { btn.style.paddingTop = 'calc(0.7px * var(--u))'; btn.style.paddingBottom = 'calc(1.3px * var(--u))'; }); }
    function fitClonedLogos(origSheet, clonedSheet) {
        let clones = [...clonedSheet.querySelectorAll('.sheet-footer img, .sheet-logo-card img')];
        [...origSheet.querySelectorAll('.sheet-footer img, .sheet-logo-card img')].forEach((origImg, i) => {
            let img = clones[i], iw = origImg.naturalWidth, ih = origImg.naturalHeight, boxW = origImg.offsetWidth, boxH = origImg.offsetHeight;
            if (!img || !iw || !ih || !boxW || !boxH) return;
            let scale = Math.min(boxW / iw, boxH / ih), w = iw * scale, h = ih * scale;
            img.style.width = w + 'px'; img.style.height = h + 'px'; img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
        });
    }
    /* Logo do cabeçalho ("FEIRA GRANDES MARCAS OVD" ou a enviada em Template do cartaz): é
       background-image num .sheet::after. O html2canvas desenha background-image passando por um canvas
       intermediário no tamanho em px CSS (250x95) e só depois amplia pela escala de 300 DPI - por isso
       sai borrada, mesmo a fonte tendo 1600px. <img> ele desenha direto na escala final (por isso
       fitClonedPhotos/fitClonedLogos acima funcionam). No clone, o ::after já virou um elemento real
       <html2canvaspseudoelement> com o estilo copiado (o html2canvas faz isso ANTES do onclone - por
       isso sobrescrever o ::after via <style> não tem efeito nenhum, testado): tira o background dele e
       põe dentro uma <img> com a logo assada no tamanho final e "contain" calculado à mão - a posição e
       o tamanho já vêm certos do próprio elemento. Cacheia por imagem+caixa: a mesma logo se repete em
       toda página exportada. */
    let headerLogoCache = { key: '', dataUrl: '' };
    function fitClonedHeaderLogo(origSheet, clonedSheet) {
        let after = getComputedStyle(origSheet, '::after'), boxW = parseFloat(after.width), boxH = parseFloat(after.height), match = /url\(["']?([^"')]+)["']?\)/.exec(after.backgroundImage);
        let pseudo = [...clonedSheet.children].reverse().find(el => el.tagName.toLowerCase() === 'html2canvaspseudoelement' && el.style.backgroundImage.includes(match && match[1]));
        if (!match || !boxW || !boxH || !pseudo) return Promise.resolve();
        let url = match[1], key = url + '|' + boxW + 'x' + boxH, place = dataUrl => new Promise(done => {
            let logo = clonedSheet.ownerDocument.createElement('img');
            logo.style.cssText = 'display:block;width:100%;height:100%;max-width:none;max-height:none;margin:0';
            pseudo.style.backgroundImage = 'none';
            logo.onload = logo.onerror = () => done(); logo.src = dataUrl; pseudo.appendChild(logo);
        });
        if (headerLogoCache.key === key) return place(headerLogoCache.dataUrl);
        return new Promise(resolve => {
            let img = new Image();
            img.onload = () => {
                try {
                    let scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight) * EXPORT_SCALE, w = img.naturalWidth * scale, h = img.naturalHeight * scale;
                    let canvas = document.createElement('canvas'); canvas.width = Math.round(boxW * EXPORT_SCALE); canvas.height = Math.round(boxH * EXPORT_SCALE);
                    let ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
                    headerLogoCache = { key, dataUrl: canvas.toDataURL('image/png') };
                } catch (_) { resolve(); return; } /* CORS ou outro erro: mantém o ::after padrão, sem travar a exportação */
                place(headerLogoCache.dataUrl).then(resolve);
            };
            img.onerror = () => resolve(); img.src = url;
        });
    }
    /* .card leva transform:translateY() (draw(), pra centralizar verticalmente a folha quando ela
       não está com a capacidade cheia - a maioria das exportações reais) e/ou translateX() (cards
       "pair" do A3). Combinado com o overflow:hidden do próprio .card (ver ".card" no css), o
       html2canvas 1.4.1 não erra só o recorte: ele pinta o card INTEIRO em branco (título, foto,
       códigos, tudo) - bug bem mais grave do que o de .photo abaixo, e que pegava toda folha que não
       fosse múltiplo exato de 6 (A4) ou 9 (A3) produtos, ou seja, quase toda exportação real. Mesma
       solução: tira o transform no clone e substitui por posição absoluta equivalente (medida no
       elemento ORIGINAL, que já reflete o transform ao vivo). */
    function fitClonedCards(origSheet, clonedSheet) {
        let cloneCards = [...clonedSheet.querySelectorAll('.card')], sheetRect = origSheet.getBoundingClientRect();
        [...origSheet.querySelectorAll('.card')].forEach((origCard, i) => {
            if (getComputedStyle(origCard).transform === 'none') return;
            let clone = cloneCards[i]; if (!clone) return;
            let rect = origCard.getBoundingClientRect();
            /* sem grid (removido junto com o transform), o card viraria "encolhe pro conteúdo" e
               .photo/.lines (right/left:20px, medidos a partir da LARGURA do card) saem do lugar -
               trava largura/altura no tamanho visual real, igual já se faz com .photo abaixo. Tira
               também grid-column/grid-row (um item de grid position:absolute que ainda tem essas
               propriedades usa a CÉLULA do grid como referência do left/top, não a folha inteira) e a
               classe "center" (".sheet.a4 .card.center" redefine grid-column com !important e
               justify-self, inline style sozinho não vence - some a classe em vez de brigar com o
               !important, já que a posição final já vem pronta do left/top calculados abaixo). */
            clone.classList.remove('center');
            clone.style.transform = 'none'; clone.style.gridColumn = 'auto'; clone.style.gridRow = 'auto'; clone.style.position = 'absolute'; clone.style.left = (rect.left - sheetRect.left) + 'px'; clone.style.top = (rect.top - sheetRect.top) + 'px'; clone.style.width = rect.width + 'px'; clone.style.height = rect.height + 'px'; clone.style.margin = '0';
        });
        clonedSheet.style.position = 'relative';
    }
    /* html2canvas recorta transform+overflow:hidden incorretamente. Assa a foto no tamanho visual final
       e substitui zoom/arraste por posicao e dimensoes absolutas equivalentes. */
    const EXPORT_SCALE = 300 / 96;
    function fitClonedPhotos(origSheet, clonedSheet) {
        let clones = [...clonedSheet.querySelectorAll('.photo img')];
        [...origSheet.querySelectorAll('.photo img')].forEach((origImg, i) => {
            if (origImg.hidden) return; /* verifyImage() não conseguiu decodificar (foto truncada) e já trocou pelo aviso "Foto indisponível" - não assar a versão quebrada no export */
            let img = clones[i], photo = origImg.parentElement, card = photo.offsetParent || photo.closest('.card'), photoRect = photo.getBoundingClientRect(), cardRect = card.getBoundingClientRect(), iw = origImg.naturalWidth, ih = origImg.naturalHeight, zoom = photoRect.width / photo.offsetWidth, boxW = Math.round(photoRect.width), boxH = Math.round(photoRect.height);
            if (!img || !iw || !ih || !boxW || !boxH || !zoom) return;
            let neverUpscale = getComputedStyle(origImg).objectFit === 'scale-down', scale = Math.min(photo.offsetWidth / iw, photo.offsetHeight / ih, neverUpscale ? 1 : Infinity) * zoom, w = iw * scale, h = ih * scale;
            try {
                let canvas = document.createElement('canvas'); canvas.width = Math.round(boxW * EXPORT_SCALE); canvas.height = Math.round(boxH * EXPORT_SCALE);
                let ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; /* o padrão 'low' (bilinear) serrilha fotos grandes reduzidas para ~240 px de cartaz */ ctx.drawImage(origImg, (boxW - w) / 2 * EXPORT_SCALE, (boxH - h) / 2 * EXPORT_SCALE, w * EXPORT_SCALE, h * EXPORT_SCALE);
                img.src = canvas.toDataURL();
                img.style.position = 'absolute'; img.style.inset = '0'; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'fill';
                let clonePhoto = img.parentElement;
                clonePhoto.style.transform = 'none'; clonePhoto.style.left = (photoRect.left - cardRect.left) + 'px'; clonePhoto.style.top = (photoRect.top - cardRect.top) + 'px'; clonePhoto.style.right = 'auto'; clonePhoto.style.bottom = 'auto'; clonePhoto.style.margin = '0'; clonePhoto.style.width = boxW + 'px'; clonePhoto.style.height = boxH + 'px';
            } catch (_) { /* canvas contaminado (CORS) - deixa como o html2canvas renderizar por conta própria em vez de travar a exportação inteira */ }
        });
    }
    let exportCancelled = false;
    const yieldExportUi = () => new Promise(resolve => setTimeout(resolve, 0));
    function updateExportProgress(percent, current, total, message) {
        $('exportProgressBar').value = percent;
        $('exportProgressPercent').textContent = Math.round(percent) + '%';
        $('exportProgressCount').textContent = current + ' de ' + total + ' páginas concluídas';
        $('exportProgressText').textContent = message;
    }
    function cancelExport() {
        if (!$('exportProgressDialog').open || $('exportCancel').disabled || exportCancelled) return;
        exportCancelled = true;
        $('exportCancel').disabled = true;
        $('exportProgressText').textContent = 'Cancelando após concluir a página atual…';
    }
    $('exportCancel').onclick = cancelExport;
    $('exportProgressDialog').addEventListener('cancel', event => { event.preventDefault(); cancelExport(); });
    function blobToDataUrl(blob) { return new Promise((resolve, reject) => { let reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
    /* PDF: reaproveita o mesmo JPEG (já comprimido a .92) usado no JPG, só embutido no PDF sem
       recodificar - é o jeito mais leve de gerar o PDF sem perder a qualidade de impressão em 300 DPI.
       Uma marca vira um único PDF (uma página por página do cartaz), agrupado por formato+marca porque
       a mesma marca pode ter páginas tanto em A3 quanto em A4. */
    async function buildPdfOutputs(rendered) {
        let groups = new Map();
        for (let item of rendered) {
            let key = item.format + '|' + item.brand;
            if (!groups.has(key)) groups.set(key, { format: item.format, brand: item.brand, items: [] });
            groups.get(key).items.push(item);
        }
        let outputs = [];
        for (let group of groups.values()) {
            let pdf = new window.jspdf.jsPDF({ unit: 'mm', format: group.format.toLowerCase(), compress: true }), size = pdf.internal.pageSize, width = size.getWidth(), height = size.getHeight();
            for (let i = 0; i < group.items.length; i++) {
                if (i > 0) pdf.addPage(group.format.toLowerCase());
                let dataUrl = await blobToDataUrl(group.items[i].blob);
                pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height, undefined, 'FAST');
                (group.items[i].links || []).forEach(link => pdf.link(link.x * width, link.y * height, link.w * width, link.h * height, { url: link.url }));
            }
            outputs.push({ path: group.format + '/' + group.brand + '_' + group.format + '.pdf', blob: pdf.output('blob') });
        }
        return outputs;
    }
    async function runExport(format, allBrands, only) {
        if (!S.pages.length || !window.html2canvas || !window.JSZip || (format === 'pdf' && !(window.jspdf && window.jspdf.jsPDF))) { toast('A exportação não está disponível agora. Recarregue a página e tente novamente.'); return; }
        let originalBrand = S.brand, originalFormat = S.printFormat, buttons = [$('printMenu'), $('exportMenu')], targets = allBrands ? S.pages.filter(page => !only || only.includes(page.brand)) : S.pages.filter(page => page.brand === originalBrand && (!originalFormat || page.format === originalFormat)); /* cada divisão marcada exporta as mesmas páginas (um arquivo por divisão); os trabalhos ficam agrupados por página para o redesenho acontecer uma vez só */
        targets = targets.flatMap(page => (activeDivisions().length ? activeDivisions() : [null]).map(division => ({ page, division })));
        if (!targets.length) { toast('Nenhuma página para exportar.'); return; }
        buttons.forEach(button => button.disabled = true);
        exportCancelled = false; $('exportCancel').disabled = false; updateExportProgress(0, 0, targets.length, 'Preparando exportação em 300 DPI…');
        if (!$('exportProgressDialog').open) $('exportProgressDialog').showModal();
        $('work').setAttribute('aria-busy', 'true');
        try {
            let preview = $('preview'), renderKey = '', rendered = [];
            for (let index = 0; index < targets.length; index++) {
                if (exportCancelled) { let error = Error('Exportação cancelada.'); error.name = 'AbortError'; throw error; }
                let { page, division } = targets[index], pageIndex = S.pages.indexOf(page), key = page.brand + '|' + page.format, sheetSelector = '.sheet[data-page="' + pageIndex + '"]' + (division ? '[data-division="' + division.id + '"]' : '');
                updateExportProgress(index / targets.length * 90, index, targets.length, 'Carregando fotos de ' + (page.brands ? page.brands.join(' + ') : page.brand) + '…');
                if (renderKey !== key) {
                    S.brand = page.brand; S.printFormat = page.format; S.only = null; draw(); renderKey = key;
                    await yieldExportUi(); await waitForImages(preview);
                }
                if (exportCancelled) { let error = Error('Exportação cancelada.'); error.name = 'AbortError'; throw error; }
                let sheet = preview.querySelector(sheetSelector);
                if (!sheet) throw Error('Não foi possível preparar a página ' + (index + 1) + '.');
                updateExportProgress(index / targets.length * 90, index, targets.length, 'Gerando página ' + (index + 1) + ' de ' + targets.length + ' - ' + page.brand);
                await yieldExportUi();
                let canvas, image, box = sheet.getBoundingClientRect(), links = [...sheet.querySelectorAll('[data-link]')].map(el => { let r = el.getBoundingClientRect(); return { url: el.dataset.link, x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height }; }); /* QR e botão viram áreas clicáveis no PDF */
                try {
                    canvas = await html2canvas(sheet, { backgroundColor: '#003e55', scale: EXPORT_SCALE, useCORS: true, logging: false, imageTimeout: 15000, onclone: async clonedDoc => { let clonedSheet = clonedDoc.querySelector(sheetSelector); if (!clonedSheet) return; fitClonedCards(sheet, clonedSheet); fitClonedButtons(clonedSheet); fitClonedPhotos(sheet, clonedSheet); fitClonedLogos(sheet, clonedSheet); await fitClonedHeaderLogo(sheet, clonedSheet); } });
                    if (exportCancelled) { let error = Error('Exportação cancelada.'); error.name = 'AbortError'; throw error; }
                    image = await canvasBlob(canvas);
                } finally {
                    if (canvas) { canvas.width = 0; canvas.height = 0; }
                }
                let pageNumber = S.pages.filter(item => item.brand === page.brand && item.format === page.format).indexOf(page) + 1, brand = safeName(page.brand) + (division ? '_' + safeName(division.name) : '');
                rendered.push({ format: page.format, brand, pageNumber, blob: image, links });
                updateExportProgress((index + 1) / targets.length * 90, index + 1, targets.length, 'Página ' + (index + 1) + ' de ' + targets.length + ' concluída.');
                await yieldExportUi();
            }
            $('exportCancel').disabled = true;
            updateExportProgress(90, targets.length, targets.length, format === 'pdf' ? 'Montando o PDF…' : 'Preparando o arquivo para download…');
            let outputs = format === 'pdf' ? await buildPdfOutputs(rendered) : rendered.map(item => ({ path: item.format + '/' + item.brand + '/' + item.brand + '_Página' + item.pageNumber + '_' + item.format + '.jpg', blob: item.blob }));
            let finalBlob, filename;
            /* Marca única (ou qualquer seleção que resulte em um só arquivo) baixa direto, sem ZIP:
               o PDF já junta as páginas de uma marca em um único arquivo; o JPG só cai nesse caso
               quando a marca tem uma única página. */
            if (outputs.length === 1) {
                finalBlob = outputs[0].blob; filename = outputs[0].path.split('/').pop();
            } else {
                let zip = new JSZip();
                outputs.forEach(output => zip.file(output.path, output.blob));
                finalBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, metadata => updateExportProgress(90 + metadata.percent / 10, targets.length, targets.length, 'Preparando o arquivo ZIP para download…'));
                filename = (only ? 'Cartaz_selecionadas' : allBrands ? 'Cartaz' : 'Cartaz_' + safeName(originalBrand)) + (format === 'pdf' ? '_PDF' : '') + '.zip';
            }
            let link = document.createElement('a'); link.href = URL.createObjectURL(finalBlob); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 5000);
            window.PortalUsage && window.PortalUsage.track('cartaz-generator', 'export', { quantity: targets.length, dedupeKey: 'cartaz:' + format + ':' + targets.map(job => job.page.brand + ':' + job.page.format + ':' + (job.division?.id || '')).join('|') });
            updateExportProgress(100, targets.length, targets.length, 'Download iniciado.');
            await new Promise(resolve => setTimeout(resolve, 350));
            toast((outputs.length === 1 ? (format === 'pdf' ? 'PDF' : 'Arquivo') : 'ZIP') + ' exportado com sucesso.');
        } catch (error) {
            if (error.name === 'AbortError') toast('Exportação cancelada.'); else { console.error(error); toast(error.message || 'Não foi possível exportar.'); }
        } finally {
            S.only = null; S.brand = originalBrand; S.printFormat = originalFormat; draw();
            $('work').removeAttribute('aria-busy');
            if ($('exportProgressDialog').open) $('exportProgressDialog').close();
            buttons.forEach(button => button.disabled = !S.pages.length);
        }
    }
    function closeActionMenus() { [['printMenu', 'printMenuList'], ['exportMenu', 'exportMenuList'], ['exportPdfMenu', 'exportPdfMenuList'], ['exportJpgMenu', 'exportJpgMenuList']].forEach(([button, menu]) => { $(menu).hidden = true; $(button).setAttribute('aria-expanded', 'false'); }); }
    function toggleActionMenu(button, menu) { let open = $(menu).hidden; closeActionMenus(); $(menu).hidden = !open; $(button).setAttribute('aria-expanded', String(open)); }
    function toggleNestedMenu(button, menu, siblings) { let open = $(menu).hidden; siblings.forEach(([siblingButton, siblingMenu]) => { $(siblingMenu).hidden = true; $(siblingButton).setAttribute('aria-expanded', 'false'); }); $(menu).hidden = !open; $(button).setAttribute('aria-expanded', String(open)); }
    $('printMenu').onclick = () => toggleActionMenu('printMenu', 'printMenuList');
    $('exportMenu').onclick = () => toggleActionMenu('exportMenu', 'exportMenuList');
    $('printBrand').onclick = () => { closeActionMenus(); print(); };
    [...$('printMenuList').querySelectorAll('[data-print-format]')].forEach(button => button.onclick = () => { closeActionMenus(); printAllBrands(button.dataset.printFormat); });
    $('exportPdfMenu').onclick = event => { event.stopPropagation(); toggleNestedMenu('exportPdfMenu', 'exportPdfMenuList', [['exportJpgMenu', 'exportJpgMenuList']]); };
    $('exportJpgMenu').onclick = event => { event.stopPropagation(); toggleNestedMenu('exportJpgMenu', 'exportJpgMenuList', [['exportPdfMenu', 'exportPdfMenuList']]); };
    $('exportPdfBrand').onclick = () => { closeActionMenus(); runExport('pdf', false); };
    $('exportPdfAll').onclick = () => { closeActionMenus(); runExport('pdf', true); };
    $('exportJpgBrand').onclick = () => { closeActionMenus(); runExport('jpg', false); };
    $('exportJpgAll').onclick = () => { closeActionMenus(); runExport('jpg', true); };
    /* Exportar marcas selecionadas: escolhe por marca (grupo vinculado = uma entrada); a ordem do arquivo segue a das páginas. */
    let normalizeSearch = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), pendingExportFormat = 'jpg';
    function openExportPick(format) { pendingExportFormat = format; closeActionMenus(); let keys = [...new Set(S.pages.map(page => page.brand))]; $('exportPickList').innerHTML = keys.map(key => { let page = S.pages.find(item => item.brand === key); return '<label><input type="checkbox" value="' + e(key) + '">' + e(page.brands ? page.brands.join(' + ') : key) + '</label>'; }).join(''); $('exportPickSearch').value = ''; $('exportPickAll').textContent = 'Marcar todas'; $('exportPickDialog').showModal(); $('exportPickSearch').focus(); }
    $('exportPdfPick').onclick = () => openExportPick('pdf');
    $('exportJpgPick').onclick = () => openExportPick('jpg');
    $('exportPickSearch').oninput = () => { let q = normalizeSearch($('exportPickSearch').value); [...$('exportPickList').querySelectorAll('label')].forEach(label => { label.hidden = q && !normalizeSearch(label.textContent).includes(q); }); };
    $('exportPickAll').onclick = () => { let boxes = [...$('exportPickList').querySelectorAll('label:not([hidden]) input')], all = boxes.every(box => box.checked); boxes.forEach(box => box.checked = !all); $('exportPickAll').textContent = all ? 'Marcar todas' : 'Desmarcar todas'; };
    $('exportPickGo').onclick = () => { let only = [...$('exportPickList').querySelectorAll('input:checked')].map(box => box.value); if (!only.length) { toast('Marque ao menos uma marca.'); return; } $('exportPickDialog').close(); runExport(pendingExportFormat, true, only); };
    document.addEventListener('click', event => { if (!event.target.closest('.action-menu')) closeActionMenus(); });
    /* inverter QR/botão e foto no box Live Shop: mesmo gesto da editoria Datas comemorativas - segurar e arrastar (Shift arrasta na hora).
       Um "fantasma" do lado segue o ponteiro, o lugar de origem fica tracejado, o outro lado desliza para abrir espaço e, ao soltar, o fantasma assenta. */
    document.addEventListener('pointerdown', event => {
        let side = event.target.closest('.photo-editing') ? null : event.target.closest('.card.lb .lb-left, .card.lb .lb-right') /* foto em edição: segurar e arrastar move a foto, não troca os lados */, card = side && side.closest('.card'); if (!card || event.button || !card.querySelector('.lb-left') || !card.querySelector('.lb-right')) return;
        let startX = event.clientX, startY = event.clientY, dragging = false, timer, ghost, grabX, grabY, box = card.querySelector('.lb-body').getBoundingClientRect(), item = S.pages[+card.dataset.page].items[+card.dataset.idx],
            other = card.querySelector(side.classList.contains('lb-left') ? '.lb-right' : '.lb-left'), isLeft = side.classList.contains('lb-left'),
            wantFlip = () => ((lastX > box.left + box.width / 2) === isLeft), lastX = startX,
            begin = () => {
                dragging = true; card.querySelectorAll('.photo-editing').forEach(photo => { photo.onpointermove = null; photo.releasePointerCapture?.(event.pointerId); photo.classList.remove('photo-editing'); }); /* segurar e arrastar o lado encerra a edição da foto (e o enquadramento em andamento): sem moldura no fantasma nem foto invadindo o QR */
                let r = side.getBoundingClientRect(); grabX = startX - r.left; grabY = startY - r.top;
                ghost = document.createElement('div'); ghost.className = 'card lb lb-ghost'; ghost.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;--u:' + getComputedStyle(card).getPropertyValue('--u');
                ghost.append(side.cloneNode(true)); document.body.append(ghost); card.classList.add('lb-dragging'); side.classList.add('lb-ph'); toast('Arraste até o outro lado e solte');
            },
            slide = change => { let from = other.getBoundingClientRect().left; change(); let dx = from - other.getBoundingClientRect().left; if (!dx) return; other.style.transition = 'none'; other.style.transform = 'translateX(' + dx + 'px)'; other.getBoundingClientRect(); other.style.transition = 'transform .18s ease'; other.style.transform = ''; },
            move = e => {
                lastX = e.clientX; if (!dragging) { if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) clear(); return; }
                ghost.style.transform = 'translate(' + (e.clientX - startX) + 'px,' + (e.clientY - startY) + 'px) scale(1.02)';
                let flip = wantFlip(); if (flip !== card.classList.contains('flip')) slide(() => card.classList.toggle('flip', flip));
            },
            clear = () => { clearTimeout(timer); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); },
            up = () => {
                clear(); if (!dragging) return;
                /* depois do arrasto o navegador dispara um click no elemento: engole, senão abriria o editor de link */
                swallowNextClick(50);
                let to = side.getBoundingClientRect(), flip = card.classList.contains('flip');
                ghost.style.transition = 'transform .16s ease, opacity .16s ease'; ghost.style.transform = 'translate(' + (to.left - parseFloat(ghost.style.left)) + 'px,' + (to.top - parseFloat(ghost.style.top)) + 'px)'; ghost.style.opacity = '.6';
                setTimeout(() => { /* sem draw(): redesenhar todas as folhas (e medir tudo de novo) travava e piscava. Os lados já trocaram de lugar na tela; só sincroniza as outras divisões. */
                    ghost.remove(); if (!!item.flip !== flip) { snapshot(); if (flip) item.flip = true; else delete item.flip; }
                    document.querySelectorAll('.card.lb[data-page="' + card.dataset.page + '"][data-idx="' + card.dataset.idx + '"]').forEach(copy => { copy.classList.toggle('flip', flip); copy.classList.remove('lb-dragging'); copy.querySelectorAll('.lb-ph').forEach(el => el.classList.remove('lb-ph')); copy.querySelectorAll('.lb-left, .lb-right').forEach(el => { el.style.transition = ''; el.style.transform = ''; }); /* o deslize do outro lado deixa a transição inline: sem limpar, ela animaria o zoom e o afastamento */ if (boxMode(copy)) widePhoto(copy, item.photo); });
                }, 170);
            };
        if (event.shiftKey) begin(); else timer = setTimeout(begin, 350);
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    });
    document.addEventListener('keydown', event => { /* foto do destaque em edição: ← → afastam/aproximam a foto e o QR (Shift = passo maior) */
        if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.target.closest('input, textarea, [contenteditable]')) return;
        let photo = document.querySelector('.card.lb .photo.photo-editing'); if (!photo || !photo.nudgeWide || !boxMode(photo.closest('.card'))) return; event.preventDefault(); photo.nudgeWide((event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 32 : 8));
    });
    document.addEventListener('pointerdown', event => { if (!event.target.closest('.card .photo')) document.querySelectorAll('.photo.photo-editing').forEach(photo => photo.classList.remove('photo-editing')); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeActionMenus(); });
    /* Validador de textos (cartaz-validator.js): observações sobre o título de cada card (acentos, pontuação, hífen, duplicidade,
       concordância, unidades de medida). Duas formas de trabalhar: o modal lista tudo (corrigir uma a uma ou tudo que for automático)
       e a barra de revisão leva de observação em observação, rolando até o título do card e fazendo o campo brilhar. */
    let validatorState = [], review = null; // review: { index } enquanto a barra de revisão está aberta
    function cardText(item) { return item.title || title(item.group).toUpperCase(); }
    function validatorFindings() {
        let out = [];
        S.pages.forEach((page, pi) => page.items.forEach((item, ii) => {
            let text = cardText(item), accepted = item.acceptedTextIssues || [], issues = CartazValidator.check(text, { codes: item.group.rows.length, html: item.titleHtml }).filter(issue => !accepted.includes(CartazValidator.key(text, issue)));
            if (issues.length) out.push({ pi, ii, page, text: cardText(item), issues });
        }));
        return out;
    }
    function applyIssue(item, issue) {
        let result = CartazValidator.apply(cardText(item), item.titleHtml, issue);
        item.title = result.title; if (result.titleHtml) item.titleHtml = result.titleHtml; else delete item.titleHtml;
        delete item.acceptedTextIssues;
    }
    const canFix = issue => issue.replace != null || !!issue.italic;
    const validatorSteps = () => validatorFindings().flatMap(f => f.issues.map(issue => ({ f, issue })));
    const KIND = { acento: 'Acentuação', caractere: 'Caractere', pontuacao: 'Pontuação', hifen: 'Hífen', duplicidade: 'Palavra repetida', concordancia: 'Concordância', unidade: 'Unidade de medida', italico: 'Itálico' };
    const LEVEL = { erro: 'Erro', aviso: 'Aviso' };
    // "antes -> depois" da correção sugerida (ou o que será aplicado, no caso do itálico)
    function issueDiff(issue) {
        if (issue.italic) return { from: issue.italic, to: issue.italic, italic: true };
        return issue.replace != null ? { from: issue.find, to: issue.replace } : null;
    }
    const diffHtml = diff => diff ? '<span class="cg-diff"><s>' + e(diff.from) + '</s><i aria-hidden="true">&rarr;</i>' + (diff.italic ? '<b><em>' + e(diff.to) + '</em> (itálico)</b>' : '<b>' + e(diff.to) + '</b>') + '</span>' : '';
    let validatorFilter = 'todos';
    function renderValidator() {
        let findings = validatorState = validatorFindings(), all = findings.flatMap(f => f.issues), total = all.length, errors = all.filter(i => i.level === 'erro').length;
        if (validatorFilter !== 'todos' && !all.some(i => i.level === validatorFilter)) validatorFilter = 'todos';
        $('validatorSummary').textContent = total ? total + ' observação(ões) em ' + findings.length + ' card(s). Erros têm correção sugerida; avisos pedem a sua conferência.' : (S.pages.length ? 'Nenhuma observação nos títulos. Tudo certo!' : 'Importe uma planilha para validar os textos.');
        $('validatorFixAll').disabled = !all.some(canFix);
        $('validatorReview').disabled = !total;
        $('validatorFilters').hidden = !total;
        $('validatorFilters').innerHTML = [['todos', 'Todas', total], ['erro', 'Erros', errors], ['aviso', 'Avisos', total - errors]].map(([key, label, count]) => '<button type="button" class="cg-vfilter' + (validatorFilter === key ? ' active' : '') + '" data-filter="' + key + '" aria-pressed="' + (validatorFilter === key) + '"' + (count ? '' : ' disabled') + '>' + label + ' <b>' + count + '</b></button>').join('');
        let step = 0;
        $('validatorList').innerHTML = findings.map((f, fi) => {
            let rows = f.issues.map((issue, xi) => {
                let index = step++; if (validatorFilter !== 'todos' && issue.level !== validatorFilter) return '';
                return '<li class="' + issue.level + '"><div class="cg-vissue"><div class="cg-vissue-tags"><span class="cg-validator-badge ' + issue.level + '">' + LEVEL[issue.level] + '</span><span class="cg-vbar-kind">' + KIND[issue.kind] + '</span></div>'
                    + '<p>' + e(issue.message) + '</p>' + diffHtml(issueDiff(issue)) + '</div><div class="cg-vissue-actions">'
                    + (canFix(issue) ? '<button type="button" class="cg-vprimary" data-fix="' + fi + ':' + xi + '">Corrigir</button>' : '') + '<button type="button" data-goto="' + index + '">Ver no cartaz</button></div></li>';
            }).join('');
            return rows ? '<section class="cg-validator-card"><header><span><b>' + e(f.page.name) + '</b> · card ' + (f.ii + 1) + '</span></header><p class="cg-validator-title">' + e(f.text) + '</p><ul>' + rows + '</ul></section>' : '';
        }).join('');
    }
    function openValidator() { closeReview(); renderValidator(); $('validatorDialog').showModal(); }
    // vai até a observação `review.index`: mostra a marca certa, rola até o título do card e o faz brilhar
    function focusStep() {
        let steps = validatorSteps(), bar = $('validatorBar');
        if (!steps.length) { closeReview(); toast('Nenhuma observação restante nos títulos.'); return; }
        review.index = (review.index + steps.length) % steps.length;
        let { f, issue } = steps[review.index], diff = issueDiff(issue);
        bar.hidden = false;
        $('vbarCount').textContent = (review.index + 1) + ' de ' + steps.length; $('vbarFill').style.width = ((review.index + 1) / steps.length * 100) + '%';
        $('vbarWhere').textContent = f.page.name + ' · card ' + (f.ii + 1);
        $('vbarBadge').textContent = LEVEL[issue.level]; $('vbarBadge').className = 'cg-validator-badge ' + issue.level; $('vbarKind').textContent = KIND[issue.kind];
        $('vbarMsg').textContent = issue.message;
        $('vbarDiff').hidden = !diff; $('vbarHint').hidden = !!diff;
        if (diff) { $('vbarFrom').textContent = diff.from; $('vbarTo').textContent = diff.italic ? diff.to + ' (itálico)' : diff.to; $('vbarTo').classList.toggle('italic', !!diff.italic); }
        let fixable = canFix(issue), fix = $('vbarFix'), next = $('vbarNext');
        fix.hidden = !fixable; fix.style.display = fixable ? '' : 'none'; fix.disabled = !fixable; fix.classList.toggle('cg-vbar-primary', fixable);
        $('vbarNextLabel').textContent = issue.level === 'aviso' ? 'Manter assim · Próximo' : 'Pular por enquanto';
        next.classList.toggle('cg-vbar-primary', !fixable); review.done = false;
        if (S.brand !== f.page.brand) relayout(f.page.brand);
        flashTitle(f.pi, f.ii);
    }
    function flashTitle(pi, ii) {
        let h3 = document.querySelector('.card[data-page="' + pi + '"][data-idx="' + ii + '"] h3');
        if (!h3) return;
        h3.scrollIntoView({ block: 'center', behavior: 'smooth' });
        h3.classList.remove('cg-flash'); void h3.offsetWidth; h3.classList.add('cg-flash'); clearTimeout(flashTitle.timer); flashTitle.timer = setTimeout(() => h3.classList.remove('cg-flash'), 3600);
    }
    // depois de Corrigir a barra fica na mesma observação, mostrando o resultado; quem decide seguir é o botão Avançar
    function showFixed(step) {
        let left = validatorSteps().length, diff = issueDiff(step.issue);
        review.done = true;
        $('vbarCount').textContent = left ? 'Corrigido · restam ' + left : 'Tudo corrigido!';
        $('vbarBadge').textContent = 'Corrigido'; $('vbarBadge').className = 'cg-validator-badge ok';
        $('vbarMsg').textContent = 'Correção aplicada no título. Siga para a próxima observação.';
        $('vbarDiff').hidden = !diff; $('vbarHint').hidden = true; $('vbarFix').hidden = false; $('vbarFix').style.display = ''; $('vbarFix').disabled = true; $('vbarFix').classList.remove('cg-vbar-primary');
        $('vbarNextLabel').textContent = left ? 'Próxima observação' : 'Concluir revisão'; $('vbarNext').classList.add('cg-vbar-primary');
        flashTitle(step.f.pi, step.f.ii);
    }
    function startReview(index) { review = { index }; $('validatorDialog').open && $('validatorDialog').close(); focusStep(); }
    function closeReview() { review = null; $('validatorBar').hidden = true; }
    $('metricIssuesBox').onclick = openValidator;
    $('metricIssuesBox').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openValidator(); } };
    $('validatorReview').onclick = () => startReview(0);
    $('validatorList').onclick = event => {
        let fix = event.target.closest('[data-fix]'), go = event.target.closest('[data-goto]');
        if (fix) { let [fi, xi] = fix.dataset.fix.split(':').map(Number), f = validatorState[fi]; snapshot(); applyIssue(S.pages[f.pi].items[f.ii], f.issues[xi]); draw(); renderValidator(); }
        else if (go) startReview(+go.dataset.goto);
    };
    $('validatorFixAll').onclick = () => {
        snapshot(); let fixed = 0;
        for (let pass = 0; pass < 5; pass++) { // em rodadas: uma correção pode mudar o texto que outra procurava
            let changed = false;
            validatorFindings().forEach(f => f.issues.filter(canFix).forEach(issue => { applyIssue(S.pages[f.pi].items[f.ii], issue); changed = true; fixed++; }));
            if (!changed) break;
        }
        draw(); renderValidator(); toast(fixed + ' correção(ões) aplicada(s). Use Desfazer se quiser voltar.');
    };
    // Corrigir ou confirmar um aviso o remove da lista; o mesmo índice passa a apontar para a próxima observação.
    $('vbarNext').onclick = () => {
        if (review.done) { focusStep(); return; }
        let step = validatorSteps()[review.index]; if (!step) return;
        if (step.issue.level !== 'aviso') { review.index++; focusStep(); return; }
        snapshot(); let item = S.pages[step.f.pi].items[step.f.ii], accepted = item.acceptedTextIssues || [];
        item.acceptedTextIssues = [...new Set([...accepted, CartazValidator.key(cardText(item), step.issue)])];
        updateDashboard(); focusStep();
    };
    $('vbarPrev').onclick = () => { review.index--; focusStep(); };
    $('vbarClose').onclick = closeReview;
    $('validatorFilters').onclick = event => { let button = event.target.closest('[data-filter]'); if (button) { validatorFilter = button.dataset.filter; renderValidator(); } };
    // Enter no título do card Live Shop quebra a linha (<br>, gravado em item.titleHtml); Alt + Enter segue sendo atalho da revisão
    document.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.altKey && !event.isComposing && event.target.closest?.('.card.lb h3[contenteditable]')) { event.preventDefault(); document.execCommand('insertLineBreak'); } });
    // atalhos da barra de revisão (Alt + seta / Enter): funcionam mesmo com o cursor num título, sem atrapalhar a digitação
    document.addEventListener('keydown', event => {
        if (!review || !event.altKey || $('validatorDialog').open) return;
        let key = { ArrowRight: 'vbarNext', ArrowLeft: 'vbarPrev', Enter: 'vbarFix' }[event.key];
        if (key && !$(key).disabled) { event.preventDefault(); $(key).click(); }
    });
    $('vbarFix').onclick = () => {
        let step = validatorSteps()[review.index]; if (!step || review.done) return;
        snapshot(); applyIssue(S.pages[step.f.pi].items[step.f.ii], step.issue); draw(); showFixed(step);
    };

    /* addBarcode/centerPhoto sao chamadas de atributo inline (onclick/oninput) no HTML que card() gera -
       esses atributos só enxergam funcao GLOBAL, nao a closure deste IIFE, entao precisam ser expostas
       aqui (sem isso o clique/edicao falhava calado, sem erro visivel, com ReferenceError so no console) */
    $('preview').addEventListener('focusout', () => { if (activeDivisions().length > 1) setTimeout(drawWhenIdle, 0); }); /* ponytail: edição de título/códigos aparece nas outras divisões ao sair do campo; foto só no próximo redesenho */
    window.editLink = editLink;  window.addBarcode = addBarcode; window.cutDialog = cutDialog; window.centerPhoto = centerPhoto; window.updateTitle = updateTitle; window.updateCodes = updateCodes
})();
