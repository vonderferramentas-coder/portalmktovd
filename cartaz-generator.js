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
    function logoUrl(brand) { let saved=S.brandLogos[brand]; if(saved && saved.startsWith('data:')) return saved; let asset=logoCandidates(brand).find(item=>item.file===saved)||logoCandidates(brand)[0]; return asset?brandLogoDataUri(asset.file):''; } async function loadBrandAssets() { try { let assets=await fetch('post-editor-assets/brands/index.json').then(r=>r.ok?r.json():[]); S.brandAssets=Array.isArray(assets)?assets:[]; if(S.pages.length){pages();drawWhenIdle();} }catch(_){} } function load(file) { sourceName = file.name; currentGridId = null; currentGridVersion = 0; currentGridCreatedAt = 0; S.brandLogos = {}; let reader = new FileReader; reader.onload = event => { try { let workbook = XLSX.read(event.target.result, { type: 'array' }), rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }), headers = Object.keys(rows[0] || {}), cols = CartazColumns.detect(headers, rows), ovd = cols.ovd, fg = cols.fg, titleColumn = cols.title, productCode = cols.productCode || ovd, principal = cols.barcode, brand = cols.brand, price = cols.price; if (!ovd || !titleColumn || !principal) throw Error('Não identifiquei na planilha: ' + [!ovd && 'código do produto', !titleColumn && 'nome/título', !principal && 'código de barras'].filter(Boolean).join(', ') + '. Colunas lidas: ' + headers.join(' | ')); let groups = [], group, latestTitle = ''; rows.forEach((row, index) => { let item = { ovd: t(row[ovd]).replace(/\.\d+$/, ''), fg: t(row[fg]).replace(/\.\d+$/, ''), title: t(row[titleColumn]), code: t(row[productCode]), principal: t(row[principal]).replace(/\.\d+$/, ''), brand: t(row[brand]), price: t(row[price]) }; if (!item.ovd && !item.title && !item.code) return; if (item.title) latestTitle = item.title; if (item.principal && item.principal !== group?.principal) { group = { title: latestTitle, principal: item.principal, rows: [] }; groups.push(group) } if (!group) throw Error('Linha ' + (index + 2) + ' sem CÓDIGO PRINCIPAL antes dos produtos.'); if (!item.ovd) throw Error('Linha ' + (index + 2) + ' sem CÓDIGO OVD.'); group.rows.push(item) }); if (!groups.length) throw Error('Nenhum produto encontrado na planilha.'); let brandGroups = new Map();
    groups.forEach(group => { let brandName = group.rows.map(row => row.brand).find(Boolean) || 'SEM MARCA'; if (!brandGroups.has(brandName)) brandGroups.set(brandName, []); brandGroups.get(brandName).push(group) });
    S.pages = []; S.undo = []; updateUndo();
    [...brandGroups].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).forEach(([brandName, brandItems]) => S.pages.push(...paginate(brandName, brandItems)));
    S.linking = false; S.linkSel = [];
    S.page = 0; S.brand = S.pages[0]?.brand || ''; let photoCount = groups.filter(group => group.rows[0].ovd).length; if ($('photoInfo')) $('photoInfo').textContent = photoCount + ' foto' + (photoCount === 1 ? '' : 's') + ' vinculada' + (photoCount === 1 ? '' : 's') + ' pelo Código OVD'; updateDashboard(); $('work').hidden = false; $('printMenu').disabled = false; $('saveGrid').disabled = false; $('exportMenu').disabled = false; pages(); draw(); measureAllPages(); pages(); updateDashboard(); toast(groups.length + ' produto(s) distribuído(s) em ' + S.pages.length + ' página(s).') } catch (error) { toast(error.message) } }; reader.readAsArrayBuffer(file) } /* paginação e vínculo de marcas: cartaz-pagination.js (testado em tests/cartaz-pagination.test.html) */
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
    function relayout(brand) { S.brand = brand; S.page = Math.max(0, S.pages.findIndex(page => page.brand === brand)); measureAllPages(); draw(); }
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
    async function saveCurrentGrid() { if (!S.pages.length) return; let title = currentGridId ? (savedGrids.find(grid => grid.id === currentGridId)?.title || gridTitle()) : await requestGridTitle(gridTitle()); if (!t(title)) return; let button = $('saveGrid'); button.disabled = true; try { let now = Date.now(), id = currentGridId || crypto.randomUUID(), createdAt = currentGridCreatedAt || now, payload = { schema: 1, title: t(title), sourceName, createdAt, updatedAt: now, pages: S.pages, brandLogos: S.brandLogos }; let result = await SyncBackend.put(GRID_KEY + id, payload, currentGridVersion); if (result.conflict) throw Error('Esta grade foi alterada em outra sessão. Abra-a novamente antes de salvar.'); currentGridId = id; currentGridVersion = result.updated_at || currentGridVersion; currentGridCreatedAt = createdAt; await saveGridIndex({ id, title: payload.title, createdAt, updatedAt: now, productCount: S.pages.flatMap(page => page.items).reduce((sum, item) => sum + item.group.rows.length, 0), brandCount: new Set(S.pages.flatMap(page => page.brands || [page.brand])).size }); renderSavedGrids(); toast('Grade salva para edição compartilhada.'); } catch (error) { toast(error.message || 'Não foi possível salvar a grade.'); } finally { button.disabled = false; } }
    async function openSavedGrid(grid) { try { let record = await SyncBackend.get(GRID_KEY + grid.id), payload = record.v; if (!payload || !Array.isArray(payload.pages)) throw Error('O conteúdo desta grade não foi encontrado.'); S.pages = payload.pages; S.undo = []; updateUndo(); S.brandLogos = payload.brandLogos || {}; S.codes = {}; S.linking = false; S.linkSel = []; S.page = 0; S.brand = S.pages[0]?.brand || ''; sourceName = payload.sourceName || grid.title; currentGridId = grid.id; currentGridVersion = record.updated_at || 0; currentGridCreatedAt = payload.createdAt || grid.createdAt || Date.now(); $('work').hidden = false; $('printMenu').disabled = false; $('saveGrid').disabled = false; $('exportMenu').disabled = false; draw(); measureAllPages(); pages(); updateDashboard(); toast('Grade aberta para edição.'); } catch (error) { toast(error.message || 'Não foi possível abrir a grade.'); } }
    async function deleteSavedGrid(grid) { if (!confirm('Excluir "' + grid.title + '"? Esta ação não pode ser desfeita.')) return; try { let next = savedGrids.filter(item => item.id !== grid.id), result = await SyncBackend.put(GRID_INDEX_KEY, next, savedGridsVersion); if (result.conflict) { await loadSavedGrids(); return deleteSavedGrid(grid); } savedGrids = next; savedGridsVersion = result.updated_at || savedGridsVersion; await SyncBackend.remove(GRID_KEY + grid.id); renderSavedGrids(); toast('Grade excluída.'); } catch (error) { toast(error.message || 'Não foi possível excluir a grade.'); } }
    function rowLines(r) { return code(r.code).length > 30 ? 2 : 1 } function fitRows(rows, budget) { let used = 1, out = []; for (const r of rows) { let need = rowLines(r); if (used + need > budget) break; used += need; out.push(r) } return out } function photoUrl(ovd) { let code = t(ovd).replace(/\D/g, ''); return code ? 'https://ecommerce-fg.vonderferramentas.workers.dev/product-image?code=' + code : '' } /* Códigos de barras aceitos: EAN-8, UPC-A (12), EAN-13 e ITF-14. `ok` = dígito verificador (GTIN) confere. */
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
    function hasBarcodeIssue(row) { return !noBarcodeFor(row) && !barcodeOk(row.principal); }
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
    function card(item, idx, pageIndex, probe = false) { let group = item.group, row = group.rows[0], displayTitle = item.title || title(group).toUpperCase(), photoState = item.photo || { x: 0, y: 0, scale: 1 }, a3 = S.pages[pageIndex].format === 'A3', url = photoUrl(row.ovd), photo = probe ? '' : (url ? '<img src="' + e(url) + '" alt="' + e(group.title) + '" crossorigin="anonymous" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>Foto indisponível<br>Cód. ' + e(row.ovd) + '</span>' : '<span>Sem código</span>'), big = item.size === 2,
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
    function fitLines(card) {
        let lines = card.querySelector('.lines'), h3 = card.querySelector('h3'); if (!lines || !h3) return; lines.style.maxHeight = '';
        if (card.classList.contains('a3')) { lines.classList.remove('dense', 'denser'); if (lines.scrollHeight > lines.getBoundingClientRect().bottom - h3.getBoundingClientRect().bottom - 6) lines.classList.add('dense'); if (lines.classList.contains('dense') && lines.scrollHeight > lines.clientHeight) lines.classList.add('denser'); }
        /* nunca deixa a lista subir sobre o título: se não couber, limita a altura e o excedente vira aviso "fora do cartão" */
        let room = lines.getBoundingClientRect().bottom - h3.getBoundingClientRect().bottom; if (lines.clientHeight > room) lines.style.maxHeight = Math.max(room, 0) + 'px';
    }
    function checkTitle(card) { let h3 = card.querySelector('h3'); if (!h3) return; let cut = h3.scrollHeight > h3.clientHeight + 1; card.classList.toggle('title-cut', cut); h3.title = cut ? 'Título cortado: encurte o texto para ele caber no cartão' : ''; }
    function trimOverflow(card) { checkTitle(card); /* mede a altura real da lista depois do layout. Em duas colunas, cada .code-col
       contem varias linhas: tratar a coluna inteira como uma unica linha apagava a coluna direita inteira.
       Por isso calcula quantas linhas cabem em CADA coluna e redistribui as linhas visiveis de forma equilibrada. */ let lines = card.querySelector('.lines'), warn = card.querySelector('.cutwarn'); fitLines(card); if (!lines || lines.scrollHeight <= lines.clientHeight) return;
    let item = S.pages[+card.dataset.page].items[+card.dataset.idx], top = lines.getBoundingClientRect().top, showWarning = removed => { item.hiddenCodes = removed; if (warn && removed > 0) { warn.hidden = false; warn.textContent = '⚠ +' + removed + ' código' + (removed === 1 ? '' : 's') + ' fora do cartão'; } };
    if (lines.classList.contains('two-cols')) { let rows = [...lines.querySelectorAll('.code-pair')], cut = rows.findIndex(row => row.getBoundingClientRect().bottom - top > lines.clientHeight); if (cut < 0) return; let removed = rows.slice(cut).reduce((sum, row) => sum + row.querySelectorAll('.cd').length, 0); rows.slice(cut).forEach(row => row.remove()); showWarning(removed); return; }
    let cut = [...lines.children].findIndex(child => child.getBoundingClientRect().bottom - top > lines.clientHeight); if (cut < 0) return; cut = Math.max(cut, 1); let removed = lines.children.length - cut; while (lines.children.length > cut) lines.removeChild(lines.lastElementChild); showWarning(removed); } function measureAllPages() { let probe = document.createElement('div'); probe.className = 'cartaz-measure'; probe.innerHTML = S.pages.map((page, pageIndex) => '<div class="sheet ' + page.format.toLowerCase() + '" data-page="' + pageIndex + '">' + page.items.map((item, index) => card(item, index, pageIndex, true)).join('') + '</div>').join(''); document.body.append(probe); S.pages.forEach(page => page.items.forEach(item => item.hiddenCodes = 0)); probe.querySelectorAll('.sheet').forEach(sheet => sheet.querySelectorAll('.card').forEach(trimOverflow)); probe.remove(); } function addBarcode(el) { /* preenche na hora um EAN que faltou na planilha (coluna CODIGO PRINCIPAL vazia) - reusa
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
        let entries = brands.map(brand => { let pages=S.pages.filter(page=>page.brand===brand), items=pages.flatMap(page=>page.items), linked=pages[0].brands; return { brand, pages, items, linked, cards: items.length, missing: items.filter(item=>!barcodeOk(item.group.rows[0].principal)).length, hidden: items.reduce((sum,item)=>sum+(item.hiddenCodes||0),0), noLogoNames: (linked||[brand]).filter(name=>!logoUrl(name)), noLogo: (linked||[brand]).some(name=>!logoUrl(name)), formats: new Set(pages.map(page=>page.format)) }; });
        entries = entries.filter(FILTERS[S.filter].test).sort((a, b) => ((S.sort.key === 'count' ? a.cards - b.cards : 0) || a.brand.localeCompare(b.brand, 'pt-BR')) * S.sort.dir);
        let countText = cards => '<small class="brand-count">(' + cards + (cards === 1 ? ' item' : ' itens') + ')</small>';
        $('list').innerHTML = (entries.length ? '' : '<p class="pages-empty">Nenhuma marca neste filtro.</p>') + entries.map(entry => { let { brand, pages, items, linked, missing, hidden, noLogoNames } = entry, alerts=(missing||hidden||noLogoNames.length)?'<span class="brand-alerts">'+(noLogoNames.length?'<span class="brand-alert nologo" data-logo-missing="'+e(noLogoNames[0])+'" title="Sem logo padrão: '+e(noLogoNames.join(', '))+' (clique para escolher)">'+NOLOGO_ICON+'</span>':'')+(missing?'<span class="brand-alert missing" title="'+missing+' código(s) de barras ausente(s) ou inválido(s)">!</span>':'')+(hidden?'<span class="brand-alert hidden" title="'+hidden+' código(s) oculto(s)">!</span>':'')+'</span>':'', gear=name=>'<button class="brand-logo-settings" type="button" data-brand-logo="'+e(name)+'" title="Escolher logo" aria-label="Escolher logo de '+e(name)+'">⚙</button>';
            if (linked) return '<div class="linked-group"><button type="button" class="linked-main '+(brand===S.brand?'active':'')+'" data-brand="'+e(brand)+'"><span class="linked-tag">'+LINK_ICON+'Marcas vinculadas</span><span class="linked-pages">'+pages.length+' página'+(pages.length===1?'':'s')+' '+pages[0].format+'</span>'+countText(entry.cards)+alerts+'</button>'+linked.map(name=>{let off=pages[0].logoOff||[], on=!off.includes(name), only=on&&linked.filter(other=>!off.includes(other)).length===1; return '<div class="linked-member"><strong>'+e(name)+'</strong>'+countText(items.filter(item=>groupBrand(item.group)===name).length)+'<label class="logo-toggle" title="'+(only?'Ao menos uma marca precisa mostrar a logo':'Mostrar o card da logo no rodapé')+'"><input type="checkbox" data-logo-key="'+e(brand)+'" data-logo-toggle="'+e(name)+'"'+(on?' checked':'')+(only?' disabled':'')+'><span>Logo</span></label>'+gear(name)+'</div>'}).join('')+'<button type="button" class="linked-unlink secondary" data-unlink="'+e(brand)+'">Desvincular</button></div>';
            let picked = S.linkSel.includes(brand); return '<div class="brand-entry'+(S.linking?' picking':'')+'">'+(S.linking?'<input type="checkbox" class="brand-pick" data-pick="'+e(brand)+'"'+(picked?' checked':'')+' aria-label="Selecionar '+e(brand)+' para vincular">':'')+'<button class="'+((S.linking?picked:brand===S.brand)?'active':'')+'" data-brand="'+e(brand)+'"><strong>'+e(brand)+'</strong>'+countText(entry.cards)+alerts+'</button>'+gear(brand)+'</div>' }).join('');
        renderPagesMenu(singles.length > 1); $('pagesStatus').innerHTML = 'Ordenado por: <b>' + sortLabel(S.sort.key) + ' ' + (S.sort.dir === 1 ? '↑' : '↓') + '</b>' + (isDefaultSort() ? '' : ' <button type="button" class="pages-reset" data-reset="sort">restaurar</button>') + (S.filter === 'all' ? '' : '<br>Filtrado por: <b>' + FILTERS[S.filter].label + '</b> <button type="button" class="pages-reset" data-reset="filter">limpar</button>'); $('pagesStatus').querySelectorAll('[data-reset]').forEach(button => button.onclick = () => resetView(button.dataset.reset));
        let togglePick = brand => { S.linkSel = S.linkSel.includes(brand) ? S.linkSel.filter(item => item !== brand) : [...S.linkSel, brand]; pages(); };
        [...$('list').querySelectorAll('[data-brand]')].forEach(button=>button.onclick=event=>{ if (S.linking && singles.includes(button.dataset.brand)) return togglePick(button.dataset.brand); let alert = event.target.closest('.brand-alert'); S.brand=button.dataset.brand;S.page=S.pages.findIndex(page=>page.brand===S.brand);pages();draw(); if (alert?.classList.contains('nologo')) chooseBrandLogo(alert.dataset.logoMissing); else if (alert) goToProblem(alert.classList.contains('missing') ? 'missing' : 'hidden');}); [...$('list').querySelectorAll('[data-brand-logo]')].forEach(button=>button.onclick=()=>chooseBrandLogo(button.dataset.brandLogo));
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
    com 2+ códigos, so serve pra cobrir o caso raro de um código único tao comprido que quebra em 3 linhas */ let h3 = card.querySelector('h3'), lines = card.querySelector('.lines'), photo = card.querySelector('.photo'); if (!h3 || !photo || card.classList.contains('a3')) return; let top = h3.offsetTop + h3.offsetHeight + 8, bottomBound = card.clientHeight - 66; photo.style.top = (top + Math.max(0, bottomBound - top - photo.offsetHeight) / 2) + 'px'; photo.style.bottom = 'auto'; photo.style.margin = '0'; let wide = +card.dataset.codes === 1 && lines && lines.offsetTop >= bottomBound + 8; photo.style.left = wide ? '28px' : 'auto'; photo.style.width = wide ? 'auto' : '110px' } function updateTitle(el) { snapshot('title'); let card = el.closest('.card'); fitLines(card); checkTitle(card); let item = S.pages[+card.dataset.page].items[+card.dataset.idx]; item.title = t(el.textContent); let html = CartazTitleFormat.sanitize(el); if (html) item.titleHtml = html; else delete item.titleHtml; } function updateCodes(el) { snapshot('codes'); let card = el.closest('.card'), item = S.pages[+card.dataset.page].items[+card.dataset.idx],
        texts = [...el.querySelectorAll('.cd')].map(span => t(span.textContent)).filter(Boolean), twoCols = twoCodeColumns(texts.length, card.classList.contains('a3'));
        /* só reconstrói o HTML (1 <-> 2 colunas) quando apagar/adicionar código muda o layout que cabe -
           reescrever el.innerHTML a cada tecla (mesmo sem mudar o layout) jogaria o cursor pro início do
           contenteditable a cada letra digitada */
        if (twoCols !== el.classList.contains('two-cols')) { el.innerHTML = codesHtml(texts, twoCols); el.classList.toggle('two-cols', twoCols); card.dataset.codes = texts.length; }
        item.linesOverride = { html: el.innerHTML, count: texts.length, twoCols }; fitLines(card); } function enablePhotoEditing(photo) {
        let card = photo.closest('.card'), item = S.pages[+card.dataset.page].items[+card.dataset.idx], state = () => item.photo || (item.photo = { x: 0, y: 0, scale: 1 }), apply = () => { let value = state(); photo.style.transform = 'translate(' + value.x + 'px,' + value.y + 'px) scale(' + value.scale + ')' };
        photo.ondblclick = event => { event.preventDefault(); photo.classList.toggle('photo-editing'); toast(photo.classList.contains('photo-editing') ? 'Foto selecionada: arraste para mover e use a roda do mouse para redimensionar.' : 'Edição da foto concluída.'); };
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
    function draw() {
        let selectedPages = (S.brand ? S.pages.filter(page => page.brand === S.brand) : S.pages).filter(page => (!S.printFormat || page.format === S.printFormat) && (!S.only || S.only.includes(page.brand))); if (!selectedPages.length) return; selectedPages.forEach(page => page.items.forEach(item => item.hiddenCodes = 0));
        $('title').textContent = 'Prévia editável · ' + S.brand; $('previewFormat').textContent = selectedPages.length + ' página' + (selectedPages.length === 1 ? '' : 's') + ' da marca';
        $('preview').innerHTML = selectedPages.map(page => { let pageIndex = S.pages.indexOf(page), cells = page.items.map((item, index) => card(item, index, pageIndex)), logo = logoUrl(page.brand), filled = page.items.length; for (let i = filled; i < page.capacity; i++) cells.push('<div class="placeholder" aria-hidden="true"></div>'); return '<div class="sheet ' + page.format.toLowerCase() + (S.templates[page.format] ? ' custom-bg' : '') + (S.logo ? ' custom-logo' : '') + '" data-page="' + pageIndex + '">' + pageFooter(page, logo) + '<span class="sheet-page-number" aria-hidden="true">' + (pageIndex + 1) + '</span><div class="sheet-heading" aria-hidden="true">' + headerHtml() + '</div>' + cells.join('') + '</div>'; }).join('');
        [...$('preview').querySelectorAll('.sheet')].forEach(sheet => { let page = S.pages[+sheet.dataset.page]; sheet.querySelectorAll('.card').forEach(trimOverflow); sheet.querySelectorAll('.card:not(.big)').forEach(centerPhoto); if (page.items.length < page.capacity) { let cards = [...sheet.querySelectorAll('.card')], style = getComputedStyle(sheet), top = parseFloat(style.paddingTop), bottom = sheet.clientHeight - parseFloat(style.paddingBottom), contentHeight = Math.max(...cards.map(card => card.offsetTop + card.offsetHeight)) - top, offset = Math.max(0, (bottom - top - contentHeight) / 2); cards.forEach(card => card.style.transform = (card.classList.contains('pair') ? 'translateX(calc(50% + 9px)) ' : '') + 'translateY(' + offset + 'px)') } sheet.querySelectorAll('.card .photo').forEach(enablePhotoEditing); });
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
    function blankTemplateSet(tid) { return { name: defaultTemplateName(tid), A4: '', A3: '', A4Name: '', A3Name: '', logo: '', logoName: '', header: { ...HEADER_DEFAULT } }; }
    function allTemplateDefs() { return TEMPLATE_SET_DEFS.concat(customTemplateIds.map(id => ({ id, name: templateName(id) }))); }
    S.activeTemplate = localStorage.getItem(TPL_KEY + 'active') || 'feira';
    S.templateSets = {}; TEMPLATE_SET_DEFS.forEach(def => S.templateSets[def.id] = blankTemplateSet(def.id));
    customTemplateIds.forEach(id => S.templateSets[id] = blankTemplateSet(id));
    if (!S.templateSets[S.activeTemplate]) S.activeTemplate = 'feira';
    Object.assign(S.templateSets[S.activeTemplate], { A4: S.templates.A4, A3: S.templates.A3, A4Name: S.templateNames.A4, A3Name: S.templateNames.A3, logo: S.logo, logoName: S.logoName, header: S.header });
    function templateName(tid) { return S.templateSets[tid].name; }
    function headerIsDefaultValue(header) { return header.title === HEADER_DEFAULT.title && header.sub === HEADER_DEFAULT.sub && header.stripe === HEADER_DEFAULT.stripe && header.titleColor === HEADER_DEFAULT.titleColor && header.subColor === HEADER_DEFAULT.subColor; }
    function headerHtml() { return '<strong>' + e(S.header.title || HEADER_DEFAULT.title) + '</strong><span>' + e(S.header.sub).replace(/\n/g, '<br>') + '</span>'; }
    /* Card fechado: mini-prévia do cartaz (fundo + logo centralizada, proporção da folha) com o nome
       sobreposto num degradê, badge "Vigente" e o lápis - mesmo espírito do card de marketplace em
       templates.html (capa + véu + nome, botão circular no canto). A edição de verdade acontece no
       modal (#templateModalBackdrop), aberto pelo lápis - ver openTemplateModal(). */
    function templateMiniHtml(def) {
        let set = S.templateSets[def.id], vigente = S.activeTemplate === def.id, cover = set.A4 || set.A3;
        return '<div class="cg-template-card' + (vigente ? ' vigente' : '') + '" data-template-set="' + def.id + '">'
            + '<div class="cg-template-mini-cover"' + (cover ? ' style="background-image:url(\'' + cover + '\')"' : '') + '>'
            + (set.logo ? '<div class="cg-template-mini-logo" style="background-image:url(\'' + set.logo + '\')"></div>' : '')
            + (vigente ? '<span class="cg-template-mini-badge">Vigente</span>' : '')
            + '<button type="button" class="cg-template-edit-btn" data-template-edit aria-label="Editar ' + e(set.name) + '" title="Editar template">' + PENCIL_ICON + '</button>'
            + '<div class="cg-template-mini-scrim"><div class="cg-template-mini-name">' + e(set.name) + '</div></div>'
            + '</div></div>';
    }
    function templateIdOf(el) { return el.closest('[data-template-set]').dataset.templateSet; }
    function renderTemplateCards() {
        $('templateSets').innerHTML = allTemplateDefs().map(templateMiniHtml).join('') + '<button type="button" class="cg-template-card cg-template-add" id="templateAddBtn" aria-label="Criar novo template"><span class="cg-template-add-icon">+</span><span>Novo template</span></button>';
        $('templateSets').querySelectorAll('[data-template-edit]').forEach(button => button.onclick = () => openTemplateModal(templateIdOf(button)));
        $('templateAddBtn').onclick = createTemplate;
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
    function openTemplateModal(tid, isNew) {
        let set = S.templateSets[tid];
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
        style.textContent = ['A4', 'A3'].filter(format => S.templates[format]).map(format => '.sheet.' + format.toLowerCase() + '.custom-bg{background-image:url("' + S.templates[format] + '")}').join('\n')
            + (S.logo ? '\n.sheet.custom-logo::after{background-image:url("' + S.logo + '")}' : '')
            + '\n.sheet-heading{color:' + (header.subColor || HEADER_DEFAULT.subColor) + '}.sheet-heading strong{background:' + (header.stripe || HEADER_DEFAULT.stripe) + ';color:' + (header.titleColor || HEADER_DEFAULT.titleColor) + '}';
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
        }, part.endsWith('-header') || part.endsWith('-name') ? 800 : 0);
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
    async function loadShared() {
        try {
            let activeRecord = await SyncBackend.get(SHARED_KEY + 'active');
            if (activeRecord.v && S.templateSets[activeRecord.v]) S.activeTemplate = activeRecord.v;
            sharedVersion.active = activeRecord.updated_at || 0;
            let customRecord = await SyncBackend.get(SHARED_KEY + CUSTOM_IDS_KEY);
            if (Array.isArray(customRecord.v)) { customTemplateIds = customRecord.v; customTemplateIds.forEach(id => { if (!S.templateSets[id]) S.templateSets[id] = blankTemplateSet(id); }); try { localStorage.setItem(TPL_KEY + CUSTOM_IDS_KEY, JSON.stringify(customTemplateIds)); } catch (_) { } }
            sharedVersion[CUSTOM_IDS_KEY] = customRecord.updated_at || 0;
            for (let def of allTemplateDefs()) {
                let tid = def.id, set = S.templateSets[tid], seededKey = SHARED_SEEDED + '-' + tid, seeded = localStorage.getItem(seededKey) === '1',
                    local = { A4: set.A4 && { name: set.A4Name, url: set.A4 }, A3: set.A3 && { name: set.A3Name, url: set.A3 }, logo: set.logo && { name: set.logoName, url: set.logo }, header: headerIsDefaultValue(set.header) ? null : set.header, name: set.name !== defaultTemplateName(tid) ? set.name : null };
                for (let part of ['A4', 'A3', 'logo', 'header', 'name']) {
                    let record = await SyncBackend.get(SHARED_KEY + tid + '-' + part), value = record.v; sharedVersion[tid + '-' + part] = record.updated_at || 0;
                    if (!value && tid === 'feira' && !seeded && part !== 'name') { let legacy = await SyncBackend.get(SHARED_KEY + part); if (legacy.v) { value = legacy.v; queueShared(tid + '-' + part, value); } }
                    if (!value) { if (!seeded && local[part]) queueShared(tid + '-' + part, local[part]); else if (seeded && local[part]) { if (part === 'A4' || part === 'A3') { set[part] = ''; set[part + 'Name'] = ''; } else if (part === 'logo') { set.logo = ''; set.logoName = ''; } else if (part === 'name') set.name = defaultTemplateName(tid); else set.header = { ...HEADER_DEFAULT }; } continue; }
                    if (part === 'A4' || part === 'A3') { set[part] = value.url; set[part + 'Name'] = value.name || 'Template enviado'; }
                    else if (part === 'logo') { set.logo = value.url; set.logoName = value.name || 'Logo enviada'; }
                    else if (part === 'name') set.name = value;
                    else set.header = { title: t(value.title) || HEADER_DEFAULT.title, sub: value.sub ?? HEADER_DEFAULT.sub, stripe: value.stripe || HEADER_DEFAULT.stripe, titleColor: value.titleColor || HEADER_DEFAULT.titleColor, subColor: value.subColor || HEADER_DEFAULT.subColor };
                }
                try { localStorage.setItem(seededKey, '1'); } catch (_) { }
            }
            let active = S.templateSets[S.activeTemplate];
            S.templates = { A4: active.A4, A3: active.A3 }; S.templateNames = { A4: active.A4Name, A3: active.A3Name }; S.logo = active.logo; S.logoName = active.logoName; S.header = active.header;
            try {
                localStorage.setItem(TPL_KEY + 'active', S.activeTemplate);
                ['A4', 'A3'].forEach(format => localStorage.removeItem(TPL_KEY + format)); localStorage.removeItem(LOGO_KEY); localStorage.removeItem(HEADER_KEY);
                active.A4 && localStorage.setItem(TPL_KEY + 'A4', JSON.stringify({ name: active.A4Name, url: active.A4 })); active.A3 && localStorage.setItem(TPL_KEY + 'A3', JSON.stringify({ name: active.A3Name, url: active.A3 }));
                active.logo && localStorage.setItem(LOGO_KEY, JSON.stringify({ name: active.logoName, url: active.logo })); headerIsDefaultValue(active.header) || localStorage.setItem(HEADER_KEY, JSON.stringify(active.header));
            } catch (_) { }
            applyTemplates();
        } catch (_) { /* sem rede/login: segue com o cache local */ }
    }
    function setActiveTemplate(tid) {
        if (tid === S.activeTemplate || !S.templateSets[tid]) return;
        S.activeTemplate = tid; let set = S.templateSets[tid];
        S.templates = { A4: set.A4, A3: set.A3 }; S.templateNames = { A4: set.A4Name, A3: set.A3Name }; S.logo = set.logo; S.logoName = set.logoName; S.header = set.header;
        try { localStorage.setItem(TPL_KEY + 'active', tid); } catch (_) { }
        queueShared('active', tid);
        applyTemplates(); toast('"' + templateName(tid) + '" agora é o template vigente na prévia e na exportação.');
    }
    $('templateModalClose').onclick = $('templateModalCancel').onclick = closeTemplateModal;
    $('templateModalSave').onclick = saveTemplateModal;
    $('templateModalBackdrop').addEventListener('click', event => { if (event.target.id === 'templateModalBackdrop') closeTemplateModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('templateModalBackdrop').style.display === 'flex') closeTemplateModal(); });
    loadShared();
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
                    canvas.getContext('2d').drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
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
            let img = clones[i], photo = origImg.parentElement, card = photo.closest('.card'), photoRect = photo.getBoundingClientRect(), cardRect = card.getBoundingClientRect(), iw = origImg.naturalWidth, ih = origImg.naturalHeight, zoom = photoRect.width / photo.offsetWidth, boxW = Math.round(photoRect.width), boxH = Math.round(photoRect.height);
            if (!img || !iw || !ih || !boxW || !boxH || !zoom) return;
            let neverUpscale = getComputedStyle(origImg).objectFit === 'scale-down', scale = Math.min(photo.offsetWidth / iw, photo.offsetHeight / ih, neverUpscale ? 1 : Infinity) * zoom, w = iw * scale, h = ih * scale;
            try {
                let canvas = document.createElement('canvas'); canvas.width = Math.round(boxW * EXPORT_SCALE); canvas.height = Math.round(boxH * EXPORT_SCALE);
                canvas.getContext('2d').drawImage(origImg, (boxW - w) / 2 * EXPORT_SCALE, (boxH - h) / 2 * EXPORT_SCALE, w * EXPORT_SCALE, h * EXPORT_SCALE);
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
            }
            outputs.push({ path: group.format + '/' + group.brand + '_' + group.format + '.pdf', blob: pdf.output('blob') });
        }
        return outputs;
    }
    async function runExport(format, allBrands, only) {
        if (!S.pages.length || !window.html2canvas || !window.JSZip || (format === 'pdf' && !(window.jspdf && window.jspdf.jsPDF))) { toast('A exportação não está disponível agora. Recarregue a página e tente novamente.'); return; }
        let originalBrand = S.brand, originalFormat = S.printFormat, buttons = [$('printMenu'), $('exportMenu')], targets = allBrands ? S.pages.filter(page => !only || only.includes(page.brand)) : S.pages.filter(page => page.brand === originalBrand && (!originalFormat || page.format === originalFormat));
        if (!targets.length) { toast('Nenhuma página para exportar.'); return; }
        buttons.forEach(button => button.disabled = true);
        exportCancelled = false; $('exportCancel').disabled = false; updateExportProgress(0, 0, targets.length, 'Preparando exportação em 300 DPI…');
        if (!$('exportProgressDialog').open) $('exportProgressDialog').showModal();
        $('work').setAttribute('aria-busy', 'true');
        try {
            let preview = $('preview'), renderKey = '', rendered = [];
            for (let index = 0; index < targets.length; index++) {
                if (exportCancelled) { let error = Error('Exportação cancelada.'); error.name = 'AbortError'; throw error; }
                let page = targets[index], pageIndex = S.pages.indexOf(page), key = page.brand + '|' + page.format;
                updateExportProgress(index / targets.length * 90, index, targets.length, 'Carregando fotos de ' + (page.brands ? page.brands.join(' + ') : page.brand) + '…');
                if (renderKey !== key) {
                    S.brand = page.brand; S.printFormat = page.format; S.only = null; draw(); renderKey = key;
                    await yieldExportUi(); await waitForImages(preview);
                }
                if (exportCancelled) { let error = Error('Exportação cancelada.'); error.name = 'AbortError'; throw error; }
                let sheet = preview.querySelector('.sheet[data-page="' + pageIndex + '"]');
                if (!sheet) throw Error('Não foi possível preparar a página ' + (index + 1) + '.');
                updateExportProgress(index / targets.length * 90, index, targets.length, 'Gerando página ' + (index + 1) + ' de ' + targets.length + ' - ' + page.brand);
                await yieldExportUi();
                let canvas, image;
                try {
                    canvas = await html2canvas(sheet, { backgroundColor: '#003e55', scale: EXPORT_SCALE, useCORS: true, logging: false, imageTimeout: 15000, onclone: async clonedDoc => { let clonedSheet = clonedDoc.querySelector('.sheet[data-page="' + pageIndex + '"]'); if (!clonedSheet) return; fitClonedCards(sheet, clonedSheet); fitClonedPhotos(sheet, clonedSheet); fitClonedLogos(sheet, clonedSheet); await fitClonedHeaderLogo(sheet, clonedSheet); } });
                    if (exportCancelled) { let error = Error('Exportação cancelada.'); error.name = 'AbortError'; throw error; }
                    image = await canvasBlob(canvas);
                } finally {
                    if (canvas) { canvas.width = 0; canvas.height = 0; }
                }
                let pageNumber = S.pages.filter(item => item.brand === page.brand && item.format === page.format).indexOf(page) + 1, brand = safeName(page.brand);
                rendered.push({ format: page.format, brand, pageNumber, blob: image });
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
            window.PortalUsage && window.PortalUsage.track('cartaz-generator', 'export', { quantity: targets.length, dedupeKey: 'cartaz:' + format + ':' + targets.map(page => page.brand + ':' + page.format).join('|') });
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
    window.addBarcode = addBarcode; window.centerPhoto = centerPhoto; window.updateTitle = updateTitle; window.updateCodes = updateCodes
})();
