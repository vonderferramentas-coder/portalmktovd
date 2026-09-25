/**
 * Casca do portal — carregado ANTES de app.js/intelligence-center.js em toda página.
 *
 * Duas responsabilidades:
 * 1) Resolver a marca ativa de forma síncrona (só localStorage, sem esperar rede) e expor
 *    `window.PortalBrand.suffix` — é isso que app.js/intelligence-data.js usam para montar suas
 *    próprias chaves de localStorage/api.php sufixadas por marca, logo no topo desses arquivos.
 *    Por isso o <script src="portal-shell.js"> precisa vir ANTES dos scripts das ferramentas.
 * 2) Montar o menu lateral (navegação entre ferramentas + seletor de marca) dentro do
 *    <aside id="portalSidebar"></aside> que cada página já traz vazio.
 *
 * Trocar de marca não tenta atualizar o estado em memória da ferramenta atual — troca o id
 * salvo em localStorage e recarrega a página, reaproveitando 100% da lógica de bootstrap que
 * app.js já tem (loadState/loadSettings/syncPull) sem precisar mexer nela.
 */
(function(){

  function $(id){ return document.getElementById(id); }
  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function svgIcon(paths, size){
    return `<svg width="${size||16}" height="${size||16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  // Aviso compartilhado de conflito de sincronização. Mantém o feedback dentro do portal
  // (em vez do alert() nativo) e permite que cada tela explique qual área foi atualizada.
  let syncConflictReturnFocus = null;
  function ensureSyncConflictModal(){
    let backdrop = $('portalSyncConflictBackdrop');
    if(backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'portalSyncConflictBackdrop';
    backdrop.className = 'modal-backdrop sync-conflict-backdrop';
    backdrop.innerHTML = `
      <div class="modal modal-sm sync-conflict-modal" role="alertdialog" aria-modal="true" aria-labelledby="portalSyncConflictTitle" aria-describedby="portalSyncConflictMessage portalSyncConflictHint">
        <div class="modal-header">
          <div class="modal-header-title sync-conflict-title">
            <span class="sync-conflict-icon" aria-hidden="true">${svgIcon('<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M5.1 9A8 8 0 0 1 18.4 5.6L20 7"/><path d="M18.9 15A8 8 0 0 1 5.6 18.4L4 17"/>', 20)}</span>
            <div><span>ATUALIZAÇÃO DA EQUIPE</span><h2 id="portalSyncConflictTitle">Alterações sincronizadas</h2></div>
          </div>
          <div class="modal-header-actions"><button type="button" class="modal-close" id="portalSyncConflictClose" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 15)}</button></div>
        </div>
        <div class="modal-body sync-conflict-body">
          <p id="portalSyncConflictMessage"></p>
          <div class="sync-conflict-hint">${svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>', 17)}<span id="portalSyncConflictHint">Confira sua última ação. Se ela não aparecer, faça-a novamente.</span></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn" id="portalSyncConflictOk">Entendi</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = ()=> hideSyncConflictModal();
    $('portalSyncConflictClose').addEventListener('click', close);
    $('portalSyncConflictOk').addEventListener('click', close);
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.addEventListener('keydown', ev=>{
      if(ev.key==='Escape'){ ev.preventDefault(); close(); return; }
      if(ev.key!=='Tab') return;
      const focusable = [$('portalSyncConflictClose'), $('portalSyncConflictOk')];
      const first = focusable[0], last = focusable[focusable.length-1];
      if(ev.shiftKey && document.activeElement===first){ ev.preventDefault(); last.focus(); }
      else if(!ev.shiftKey && document.activeElement===last){ ev.preventDefault(); first.focus(); }
    });
    return backdrop;
  }
  function showSyncConflictModal(options){
    const context = (options && options.context) || 'posts';
    const messages = {
      posts: 'Outra pessoa atualizou o calendário desta marca enquanto você trabalhava. Carregamos a versão mais recente do servidor.',
      settings: 'Outra pessoa atualizou as configurações desta marca enquanto você trabalhava. Carregamos a versão mais recente do servidor.',
      intelligence: 'Outra pessoa atualizou a Central de Inteligência enquanto você trabalhava. Carregamos a versão mais recente do servidor.'
    };
    const backdrop = ensureSyncConflictModal();
    if(!backdrop.classList.contains('is-open')) syncConflictReturnFocus = document.activeElement;
    $('portalSyncConflictMessage').textContent = messages[context] || messages.posts;
    backdrop.classList.add('is-open');
    requestAnimationFrame(()=> $('portalSyncConflictOk').focus());
  }
  function hideSyncConflictModal(){
    const backdrop = $('portalSyncConflictBackdrop');
    if(!backdrop || !backdrop.classList.contains('is-open')) return;
    backdrop.classList.remove('is-open');
    if(syncConflictReturnFocus && syncConflictReturnFocus.isConnected) syncConflictReturnFocus.focus();
    syncConflictReturnFocus = null;
  }
  window.PortalSyncConflict = { show:showSyncConflictModal, hide:hideSyncConflictModal };

  // ============================================================
  // MARCA ATIVA — resolvida já no topo do arquivo, de forma síncrona (precisa vir ANTES da
  // seção de TEMA logo abaixo: cada marca pode ter uma cor de destaque própria, então é preciso
  // saber qual é a marca ativa antes de aplicar o tema pela primeira vez, pra não haver flash)
  // ============================================================
  const BRANDS_KEY = 'portal_brands_v1';
  const ACTIVE_BRAND_KEY = 'portal_active_brand_v1';
  const COLLAPSE_KEY = 'portal_sidebar_collapsed_v1';
  // a marca "default" é a base de dados que já existia antes do portal (posts/settings/guia
  // sem sufixo) — por isso ela nunca é migrada, só vira a primeira entrada da lista. As demais
  // marcas do grupo já vêm pré-cadastradas aqui, com id fixo (não gerado por generateBrandId())
  // pra que qualquer navegador/computador que abra o portal pela primeira vez monte a mesma
  // lista, com os mesmos ids — essencial pro sufixo de isolamento (posts__{id}, settings__{id})
  // bater entre máquinas diferentes antes da lista ainda ter sido sincronizada pelo servidor.
  // Cada marca tem calendário, editorias, catálogo de produtos e metas 100% independentes —
  // isso já vem de graça do sufixo por marca que app.js aplica em toda chave de
  // localStorage/api.php (ver BRAND_SUFFIX no topo de app.js).
  // themeColor/themeColorInk = tema pré-definido da marca (ver seção TEMA logo abaixo): dois
  // tons — destaque (botões/links) e ênfase (rótulos/textos em destaque) — a partir da
  // identidade visual de cada marca. Fixo por marca (o grid de cores não grava mais aqui) —
  // quem quiser uma cor diferente da identidade oficial usa o tema "Personalizado" em
  // Configurações, que vale globalmente sem alterar este valor — ver getThemeSource().
  // onAccent (opcional) = cor do texto sobre botões da cor de destaque, quando a marca precisa
  // de algo diferente do que o cálculo automático de contraste escolheria (ex: TOOLMIX pediu
  // fonte branca nos botões laranja mesmo o preto tendo contraste técnico maior) — ver applyColorTheme().
  // GRUPO OVD usa a mesma identidade da VONDER (é o grupo por trás da marca) — pra diferenciar
  // sem herdar o amarelo da Vonder (a 1ª sugestão foi um dourado mais escuro, mas não agradou),
  // o destaque é um cinza claro neutro, sem tom de cor — reconhecível como "o grupo" (mais
  // institucional/neutro) em vez de "a marca" (mais vibrante/amarela).
  const DEFAULT_BRANDS = [
    { id:'default', name:'VONDER', shortName:'VD', photo:'icons/icon_vonder.jpg', themeColor:{ dark:'#F6BE00', light:'#F6BE00' }, themeColorInk:'#000000' },
    { id:'ferramentas-gerais', name:'FERRAMENTAS GERAIS', shortName:'FG', photo:'icons/icon_ferramentas_gerais.png', themeColor:{ dark:'#005745', light:'#005745' }, themeColorInk:'#005745' },
    { id:'osten-ferragens', name:'OSTEN FERRAGENS', shortName:'OF', photo:'icons/icon_osten_ferragens.jpg', themeColor:{ dark:'#ED8B00', light:'#ED8B00' }, themeColorInk:'#2E2E2E' },
    { id:'dismatal', name:'DISMATAL', shortName:'DM', photo:'icons/icon_dismatal.jpg', themeColor:{ dark:'#FFED00', light:'#FFED00' }, themeColorInk:'#000000' },
    { id:'toolmix', name:'TOOLMIX', shortName:'TM', photo:'icons/icon_toolmix.jpg', themeColor:{ dark:'#F26522', light:'#F26522' }, themeColorInk:'#FFFFFF', onAccent:'#FFFFFF' },
    { id:'dwt', name:'DWT', shortName:'DWT', photo:'icons/icon_dwt.jpg', themeColor:{ dark:'#285C4D', light:'#285C4D' }, themeColorInk:'#AB2328' },
    { id:'nove54', name:'NOVE54', shortName:'N54', photo:'icons/icon_nove54.jpg', themeColor:{ dark:'#BD1D1D', light:'#BD1D1D' }, themeColorInk:'#000000' },
    { id:'grupo-ovd', name:'GRUPO OVD', shortName:'GOVD', photo:'icons/icon_grupo_ovd.jpg', themeColor:{ dark:'#A6A6A6', light:'#A6A6A6' }, themeColorInk:'#000000' },
    { id:'pilar-tecnologia', name:'PILAR TECNOLOGIA', shortName:'PT', photo:'icons/icon_pilar_tecnologia.svg', themeColor:{ dark:'#003A5D', light:'#003A5D' }, themeColorInk:'#FFFFFF', onAccent:'#FFFFFF' }
  ];

  // paleta de fundo do avatar quando a marca não tem foto — escolhida por hash do id, só
  // pra dar alguma variedade visual entre marcas sem foto (não é mais configurável pelo usuário)
  const AVATAR_COLORS = ['#F6BE00','#0ea5e9','#8b5cf6','#f97316','#10b981','#ec4899','#6366f1','#14b8a6'];
  function colorForBrand(id){
    let h = 0; for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function brandAvatarHtml(b, extraClass){
    const initials = escapeHtml((b.shortName||b.name||'?').slice(0,2).toUpperCase());
    const cls = 'portal-brand-dot' + (extraClass ? (' '+extraClass) : '');
    if(b.photo) return `<span class="${cls}"><img src="${b.photo}" alt="" /></span>`;
    return `<span class="${cls}" style="background:${colorForBrand(b.id||b.name||'?')}">${initials}</span>`;
  }
  // valida e decodifica um arquivo de imagem, devolvendo o <img> na resolução original (usado
  // tanto pelo recorte automático de readBrandPhoto quanto pelo ajuste manual de zoom/posição
  // do modal "Perfil", que precisa da imagem cheia pra deixar o usuário escolher o enquadramento)
  function loadImageFile(file, cb){
    if(!/^image\//.test(file.type)){ alert('Envie um arquivo de imagem.'); return; }
    if(file.size > 5*1024*1024){ alert('Imagem muito grande (máx. 5MB).'); return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>cb(img);
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }
  // lê um arquivo de imagem, recorta um quadrado central e reduz pra um avatar leve (evita
  // guardar fotos grandes no localStorage/SQLite, que aqui é só uma coluna de texto). size é
  // opcional (padrão 160, suficiente pros avatares pequenos de marca/tabela) — o modal "Perfil"
  // passa um valor maior porque exibe a mesma foto cobrindo o modal inteiro, não só um avatar.
  function readBrandPhoto(file, cb, size){
    loadImageFile(file, img=>{
      const dim = size || 160;
      const canvas = document.createElement('canvas');
      canvas.width = dim; canvas.height = dim;
      const ctx = canvas.getContext('2d');
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side)/2, sy = (img.height - side)/2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim);
      cb(canvas.toDataURL('image/jpeg', 0.85));
    });
  }
  // Exposto para admin-users.js (script clássico, roda antes dele) reaproveitar o mesmo
  // recorte quadrado + compressão ao editar a foto de outro usuário pela tela de admin.
  window.PortalShell = { readBrandPhoto };

  function loadBrands(){
    try{
      const raw = localStorage.getItem(BRANDS_KEY);
      if(!raw) return DEFAULT_BRANDS.slice();
      const parsed = JSON.parse(raw);
      return (Array.isArray(parsed) && parsed.length) ? parsed : DEFAULT_BRANDS.slice();
    }catch(e){ return DEFAULT_BRANDS.slice(); }
  }

  let BRANDS = loadBrands();
  const requestedBrandId = new URLSearchParams(location.search).get('brand');
  let ACTIVE_ID = BRANDS.some(b=>b.id===requestedBrandId) ? requestedBrandId : (localStorage.getItem(ACTIVE_BRAND_KEY) || 'default');
  if(!BRANDS.some(b=>b.id===ACTIVE_ID)) ACTIVE_ID = 'default';
  if(requestedBrandId && ACTIVE_ID===requestedBrandId) localStorage.setItem(ACTIVE_BRAND_KEY, ACTIVE_ID);

  window.PortalBrand = {
    activeId: ACTIVE_ID,
    suffix: ACTIVE_ID === 'default' ? '' : ('__' + ACTIVE_ID),
    list: BRANDS
  };

  function activeBrand(){ return BRANDS.find(b=>b.id===ACTIVE_ID) || BRANDS[0]; }
  function generateBrandId(){ return 'b' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
  function switchToBrand(id){
    localStorage.setItem(ACTIVE_BRAND_KEY, id);
    location.reload();
  }
  // Troca de marca sem recarregar — só a Início usa (os cards mudam na hora); as demais telas
  // carregam dados por marca (sufixo de posts/settings) e continuam usando switchToBrand.
  window.PortalShell.setActiveBrand = function(id){
    if(!BRANDS.some(b=>b.id===id)) return;
    ACTIVE_ID = id;
    window.PortalBrand.activeId = id;
    window.PortalBrand.suffix = id === 'default' ? '' : ('__' + id);
    localStorage.setItem(ACTIVE_BRAND_KEY, id);
    applyColorTheme(getColorTheme());
  };

  // ============================================================
  // TEMA (claro/escuro) e cor de destaque — aplicado o quanto antes (portal-shell.js é o
  // primeiro script de cada página, e é o único que ainda aplica essas chaves — app.js não
  // mexe nisso, e post-editor.js/intelligence-center.js pararam de reaplicar por conta própria
  // pra não sobrescrever o resultado já correto deste arquivo) pra evitar flash. O botão
  // "Configurações" no rodapé da sidebar abre um modal próprio (só a aba Aparência por
  // enquanto) que grava nessas chaves.
  // Duas fontes possíveis pra cor de destaque, escolhidas por THEME_SOURCE_KEY (padrão "brand")
  // — ver getThemeSource()/setThemeSource():
  // - "brand": usa activeBrand().themeColor/themeColorInk, a identidade pré-setada de cada
  //   marca (ver DEFAULT_BRANDS acima) — troca de marca troca de cor automaticamente, e cada
  //   marca sempre volta pra própria cor ao reativar esta fonte.
  // - "custom": ignora a marca ativa e usa COLOR_THEME_KEY/CUSTOM_COLOR_KEY (grid de cores ou
  //   cor livre, escolhidos em Configurações) — a mesma cor vale em qualquer marca que o
  //   usuário acessar depois, respeitando o modo claro/escuro selecionado.
  // ============================================================
  const THEME_KEY = 'calendar_theme_v1';
  const COLOR_THEME_KEY = 'calendar_color_theme_v1';
  const CUSTOM_COLOR_KEY = 'calendar_color_theme_custom_v1';
  const THEME_SOURCE_KEY = 'calendar_theme_source_v1'; // 'brand' (padrão) | 'custom'
  const COLOR_THEMES = [
    { id:'dourado',  name:'Dourado',   dark:'#F6BE00', light:'#F6BE00' },
    { id:'azul',     name:'Azul',      dark:'#2f6fed', light:'#7fb0f2' },
    { id:'cinza',    name:'Cinza',     dark:'#6b6b70', light:'#a8a8ae' },
    { id:'petroleo', name:'Petróleo',  dark:'#3c5878', light:'#8fa8c4' },
    { id:'ardosia',  name:'Ardósia',   dark:'#3e4f63', light:'#8898a8' },
    { id:'esverdeado',name:'Esverdeado',dark:'#3f5a52', light:'#a0b4ac' },
    { id:'turquesa', name:'Turquesa',  dark:'#0f9488', light:'#5fd6c4' },
    { id:'verde',    name:'Verde',     dark:'#2f8a3a', light:'#8fd68a' },
    { id:'oliva',    name:'Oliva',     dark:'#5a6a3a', light:'#b0c090' },
    { id:'laranja',  name:'Laranja',   dark:'#d9720f', light:'#f5b878' },
    { id:'marrom',   name:'Marrom',    dark:'#8a5a3a', light:'#d0ac8c' },
    { id:'vinho',    name:'Vinho',     dark:'#a8264a', light:'#f0a0be' },
    { id:'rose',     name:'Rosé',      dark:'#7a4650', light:'#cfa8ae' },
    { id:'magenta',  name:'Magenta',   dark:'#a52a92', light:'#f0a8e4' },
    { id:'roxo',     name:'Roxo',      dark:'#6a3fa0', light:'#c4a8f0' },
  ];
  function hexToRgbObj(hex){
    const h = (hex||'#000000').replace('#','');
    const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(full,16) || 0;
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function rgbToHex(r,g,b){
    return '#'+[r,g,b].map(v=> Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  }
  function mixHex(hex, withHex, amount){
    const a = hexToRgbObj(hex), b = hexToRgbObj(withHex);
    return rgbToHex(a.r+(b.r-a.r)*amount, a.g+(b.g-a.g)*amount, a.b+(b.b-a.b)*amount);
  }
  function relLuminance(hex){
    const { r, g, b } = hexToRgbObj(hex);
    const chan = v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*chan(r) + 0.7152*chan(g) + 0.0722*chan(b);
  }
  function contrastRatio(l1, l2){ const a = Math.max(l1,l2), b = Math.min(l1,l2); return (a+0.05)/(b+0.05); }
  function pickOnColor(hex){
    const l = relLuminance(hex);
    return contrastRatio(l,0) >= contrastRatio(l,1) ? '#1a1a1a' : '#ffffff';
  }
  function hexToRgba(hex, alpha){
    const h = (hex||'#F6BE00').replace('#','');
    const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(full,16) || 0xF6BE00;
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  }
  function getColorTheme(){ return localStorage.getItem(COLOR_THEME_KEY) || 'dourado'; }
  function getThemeSource(){ return localStorage.getItem(THEME_SOURCE_KEY) || 'brand'; }
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
  }
  function applyColorTheme(id){
    // fonte "brand": marca ativa manda na cor (identidade pré-setada, ver DEFAULT_BRANDS na
    // seção MARCA ATIVA acima). Fonte "custom": ignora a marca e usa sempre a escolha global,
    // pra valer em qualquer marca que o usuário acessar — ver getThemeSource()/THEME_SOURCE_KEY
    const b = activeBrand();
    const brandTheme = getThemeSource()==='brand' ? (b && b.themeColor) : null;
    let dark, light, inkOverride = null;
    if(brandTheme){
      dark = brandTheme.dark; light = brandTheme.light;
      inkOverride = b.themeColorInk || null;
    } else if(id === 'custom'){
      const hex = localStorage.getItem(CUSTOM_COLOR_KEY) || '#F6BE00';
      dark = hex; light = hex;
    } else {
      const palette = COLOR_THEMES.find(p=>p.id===id) || COLOR_THEMES[0];
      dark = palette.dark; light = palette.light;
    }
    const mode = document.documentElement.getAttribute('data-theme') || 'light';
    const accent = mode === 'dark' ? dark : light;
    const root = document.documentElement.style;
    root.setProperty('--accent', accent);
    root.setProperty('--accent-hover', mixHex(accent, '#000000', 0.15));
    root.setProperty('--accent-weak', hexToRgba(accent, 0.16));
    root.setProperty('--on-accent', (brandTheme && b.onAccent) || pickOnColor(accent));
    // Seleção de texto exige contraste AA inclusive em cores personalizadas. Não reutiliza
    // --on-accent porque algumas marcas têm uma exceção visual deliberada para botões.
    root.setProperty('--selection-text', contrastRatio(relLuminance(accent), 0) >= contrastRatio(relLuminance(accent), 1) ? '#000000' : '#ffffff');
    // no escuro, a ênfase (--accent-ink, usada em texto/ícone sobre fundo escuro — ex: item
    // ativo do menu lateral, botão ativo de Mês/Quinzena/Semana) sempre usa a própria cor de
    // destaque em vez da cor de ênfase da marca: um tom claro (como o amarelo da Vonder) lê bem
    // sobre fundo escuro, mas a cor de ênfase de várias marcas é um tom escuro/preto (pensado
    // pra contrastar em fundo CLARO) — usá-la também no escuro deixava o texto quase invisível.
    // no claro, --accent-ink também é sempre texto sobre fundo claro (menu lateral, rótulos) —
    // por isso só usa a ênfase da marca se ela própria for escura o bastante pra ler; uma ênfase
    // clara (ex: branco da TOOLMIX, pensada pra ler sobre o botão laranja, não sobre fundo
    // branco) cai pro mesmo tom escurecido do destaque usado quando não há ênfase definida.
    const inkFallback = relLuminance(dark) <= 0.18 ? dark : mixHex(dark, '#000000', 0.4);
    const inkOverrideLegible = inkOverride && contrastRatio(relLuminance(inkOverride), 1) >= 3;
    const ink = mode === 'dark'
      ? dark
      : (inkOverrideLegible ? inkOverride : inkFallback);
    root.setProperty('--accent-ink', ink);
  }
  // visual-editor.html tem sua própria aba Aparência (dentro de #settingsBackdrop, controlada
  // por app.js) com os mesmos dados — reflete a troca lá também, senão o radio/grid daquele
  // modal fica desatualizado até a próxima vez que a página carregar
  function syncLegacySettingsUi(){
    const theme = localStorage.getItem(THEME_KEY) || 'light';
    const legacyRadio = document.querySelector(`#settingsBackdrop input[name="sTheme"][value="${theme}"]`);
    if(legacyRadio) legacyRadio.checked = true;
    if(typeof window.renderColorThemeGrid === 'function') window.renderColorThemeGrid();
  }
  function setTheme(theme){
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    applyColorTheme(getColorTheme());
    syncLegacySettingsUi();
    syncSidebarThemeToggle();
  }
  // Seletor claro/escuro da sidebar (acima da barra de conta) — funil único é setTheme() acima,
  // então trocar por aqui, pelo modal de Configurações ou pela aba legada do calendário mantém
  // os três em sincronia entre si.
  function wireThemeToggle(){
    const wrap = $('portalThemeToggle'); if(!wrap) return;
    wrap.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=> setTheme(btn.dataset.themeBtn));
    });
  }
  function syncSidebarThemeToggle(){
    const wrap = $('portalThemeToggle'); if(!wrap) return;
    const theme = localStorage.getItem(THEME_KEY) || 'light';
    wrap.querySelectorAll('button').forEach(btn=>{
      const active = btn.dataset.themeBtn === theme;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }
  function setColorTheme(id){
    // só é chamado com a fonte "custom" ativa (o grid fica oculto na fonte "brand" — ver
    // renderPortalColorGrid) — grava sempre numa chave global, nunca na marca ativa, pra essa
    // escolha valer em qualquer marca que o usuário acessar depois (ver applyColorTheme acima)
    localStorage.setItem(COLOR_THEME_KEY, id);
    applyColorTheme(id);
    if(portalSettingsModalEl) renderPortalColorGrid();
    syncLegacySettingsUi();
  }
  function setThemeSource(src){
    localStorage.setItem(THEME_SOURCE_KEY, src);
    applyColorTheme(getColorTheme());
    if(portalSettingsModalEl) renderPortalColorGrid();
    syncLegacySettingsUi();
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  applyColorTheme(getColorTheme());

  // ============================================================
  // SINCRONIZAÇÃO DA LISTA DE MARCAS (api.php?k=brands) — mesma mecânica de sync de chave
  // única que intelligence-data.js já usa pra "intel" (fetch/push/versão otimista)
  // ============================================================
  const SYNC_ENABLED = location.protocol !== 'file:';
  let syncVersion = 0;
  let syncPushTimer = null;
  async function syncFetchBrands(){
    return SyncBackend.get('brands');
  }
  async function syncPushBrands(value){
    const result = await SyncBackend.put('brands', value, syncVersion);
    if(result.conflict) return { conflict:true, server:result.server };
    syncVersion = result.updated_at;
    return { conflict:false };
  }
  function saveBrands(list){
    BRANDS = list;
    window.PortalBrand.list = BRANDS;
    localStorage.setItem(BRANDS_KEY, JSON.stringify(BRANDS));
    if(!SYNC_ENABLED) return;
    clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(async ()=>{
      try{
        const result = await syncPushBrands(BRANDS);
        if(result.conflict){
          if(result.server.v === null){
            // chave ainda vazia no servidor: não apaga a lista local, só adota a versão
            // e reagenda o envio pra essa cópia acabar subindo
            syncVersion = result.server.updated_at;
            saveBrands(BRANDS);
          } else {
            // outra pessoa salvou a lista de marcas primeiro: adota a versão do servidor
            BRANDS = result.server.v;
            window.PortalBrand.list = BRANDS;
            localStorage.setItem(BRANDS_KEY, JSON.stringify(BRANDS));
            syncVersion = result.server.updated_at;
            if(!brandPopoverOpen) renderBrandTrigger();
          }
        }
      }catch(e){ /* offline — fica salvo só neste navegador, sem travar a UI */ }
    }, 700);
  }
  // completa a lista já carregada (local ou do servidor) com marcas padrão novas que ainda não
  // existiam nela, por id — mesma lógica de "somar sem sobrescrever" que app.js/loadSettings()
  // já usa pra editorias/redes: preserva qualquer customização (nome, foto) de marcas
  // existentes, só acrescenta as que faltam. Assim, uma marca nova do grupo aparece pra quem já
  // tinha uma lista salva (deste navegador ou vinda do servidor), sem precisar recriar tudo pela
  // UI de "Nova marca". A renomeação "Vonder" → "VONDER" só é aplicada se o nome ainda for
  // exatamente o valor padrão anterior — não sobrescreve um nome que alguém já tenha customizado.
  (function mergeDefaultBrands(){
    let changed = false;
    let activeChanged = false;
    const defaultEntry = BRANDS.find(b=>b.id==='default');
    if(defaultEntry && defaultEntry.name==='Vonder'){ defaultEntry.name = 'VONDER'; changed = true; }
    // correções pontuais de sugestões anteriores que não agradaram — só substitui se a cor
    // ainda for exatamente a sugestão antiga (não mexe se alguém já tiver escolhido outra pelo
    // seletor): GRUPO OVD saiu do dourado escuro pro cinza claro, TOOLMIX ganhou ênfase branca,
    // FERRAMENTAS GERAIS trocou a ênfase vermelha por um verde escuro
    const govdEntry = BRANDS.find(b=>b.id==='grupo-ovd');
    if(govdEntry && govdEntry.themeColor && govdEntry.themeColor.light==='#C09400'){ govdEntry.themeColor = { dark:'#A6A6A6', light:'#A6A6A6' }; changed = true; if(govdEntry.id===ACTIVE_ID) activeChanged = true; }
    const toolmixEntry = BRANDS.find(b=>b.id==='toolmix');
    if(toolmixEntry && toolmixEntry.themeColorInk==='#3C3C3B'){ toolmixEntry.themeColorInk = '#FFFFFF'; changed = true; if(toolmixEntry.id===ACTIVE_ID) activeChanged = true; }
    const fgEntry = BRANDS.find(b=>b.id==='ferramentas-gerais');
    if(fgEntry && fgEntry.themeColor && ['#004E32','#135844'].includes(fgEntry.themeColor.light)){ fgEntry.themeColor = { dark:'#005745', light:'#005745' }; changed = true; if(fgEntry.id===ACTIVE_ID) activeChanged = true; }
    if(fgEntry && ['#E42313','#0A6C43'].includes(fgEntry.themeColorInk)){ fgEntry.themeColorInk = '#005745'; changed = true; if(fgEntry.id===ACTIVE_ID) activeChanged = true; }
    DEFAULT_BRANDS.forEach(def=>{
      const existing = BRANDS.find(b=>b.id===def.id);
      if(!existing){
        BRANDS.push(Object.assign({}, def));
        changed = true;
        if(def.id===ACTIVE_ID) activeChanged = true;
        return;
      }
      // preenche a cor/foto pré-definida em quem ainda não tinha uma (sem sobrescrever o que
      // o usuário já tenha customizado) — mesma lógica de "completar sem sobrescrever"
      if(existing.themeColor==null && def.themeColor){ existing.themeColor = def.themeColor; changed = true; if(existing.id===ACTIVE_ID) activeChanged = true; }
      if(existing.themeColorInk==null && def.themeColorInk){ existing.themeColorInk = def.themeColorInk; changed = true; if(existing.id===ACTIVE_ID) activeChanged = true; }
      if(existing.onAccent==null && def.onAccent){ existing.onAccent = def.onAccent; changed = true; if(existing.id===ACTIVE_ID) activeChanged = true; }
      if(existing.photo==null && def.photo){ existing.photo = def.photo; changed = true; }
    });
    if(changed) saveBrands(BRANDS);
    // se a marca atualmente ativa ganhou uma cor pré-definida agora (lista carregada antes
    // desta atualização do portal-shell.js), reaplica o tema pra não precisar recarregar a
    // página pra ver a cor certa
    if(activeChanged) applyColorTheme(getColorTheme());
  })();
  async function syncPullBrands(){
    if(!SYNC_ENABLED || brandPopoverOpen) return;
    try{
      const res = await syncFetchBrands();
      if(res.v!==null && Array.isArray(res.v) && res.v.length && res.updated_at!==syncVersion){
        // A lista remota pode ter sido salva antes da inclusão de uma marca-padrão nova.
        // Completa-a antes de adotá-la, para que a sincronização não faça perfis como a
        // Pilar Tecnologia desaparecerem da listagem local após o carregamento.
        const remoteBrands = res.v.slice();
        let completedDefaults = false;
        DEFAULT_BRANDS.forEach(def=>{
          if(!remoteBrands.some(item=>item.id===def.id)){
            remoteBrands.push(Object.assign({}, def));
            completedDefaults = true;
          }
        });
        BRANDS = remoteBrands;
        window.PortalBrand.list = BRANDS;
        localStorage.setItem(BRANDS_KEY, JSON.stringify(BRANDS));
        if(completedDefaults) saveBrands(BRANDS);
        renderBrandTrigger();
      }
      syncVersion = res.updated_at;
    }catch(e){ /* sem conexão — segue com a cópia local */ }
  }

  // ============================================================
  // MENU DE NAVEGAÇÃO ENTRE FERRAMENTAS
  // ============================================================
  const NAV_ITEMS = [
    { href:'index.html', label:'Início', icon:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>' },
    // Seções de navegação: só um rótulo estático acima dos itens (sem ícone, sem recolher —
    // referência: rótulo "Projects" da sidebar do animate-ui.com/docs/components/radix/sidebar).
    { group:'Criação', items:[
      { href:'photoshop-actions.html', label:'Ações do Photoshop', icon:'<path d="M4 4h16v16H4z"/><path d="M8 8h3.5a2.5 2.5 0 1 1 0 5H8z"/><path d="M14.5 15.5h2.7"/>' },
      { href:'post-editor.html', label:'Editor de Posts', icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/><path d="m14 18 3-3"/>' },
      // brands: página exclusiva dessas marcas (ids de DEFAULT_BRANDS) — nas demais some do menu
      // e da Início e a própria página é bloqueada; quem aplica é auth-guard.js
      { href:'cartaz-generator.html', label:'Gerador de Cartazes', brands:['grupo-ovd'], icon:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="m8 17 3-4 2 2.5 1.5-2 1.5 3.5"/>' },
      { href:'barcode-generator.html', label:'Código de Barras', icon:'<path d="M4 5v14M8 5v14M12 5v14M15 5v14M20 5v14"/><path d="M6 5v14" stroke-width="3"/><path d="M17.5 5v14" stroke-width="3"/>' },
      { href:'business-card-generator.html', label:'Gerador de Cartões', icon:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h5M7 14h3M15.5 10.5h2M15.5 14h2"/>' },
      { href:'templates.html', label:'Templates', icon:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' }
    ] },
    { group:'Mídias Sociais', items:[
      { href:'visual-editor.html', label:'Calendário de Postagens', icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
      { href:'intelligence-center.html', label:'Central de Inteligência', icon:'<path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/><path d="M9 18h6"/><path d="M10 22h4"/>' },
      { href:'conecta-fg.html', label:'Conecta FG', brands:['ferramentas-gerais'], icon:'<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>' },
      { href:'followers-dashboard.html', label:'Redes sociais', icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' }
    ] },

    { group:'Administração', items:[
      // página sensível: fica de fora por padrão pro perfil Usuário (ver defaultHidden em
      // auth-guard.js/admin-users.js) até um administrador marcá-la em Usuários e acessos >
      // Permissões por perfil — deixou de ser um bloqueio fixo de código (ver histórico) porque
      // agora é o próprio admin quem decide, por perfil, se ela fica visível ou não
      { href:'admin-users.html', label:'Usuários e acessos', icon:'<path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6Z"/>', defaultHidden:true }
    ] }
  ];
  // fonte única da lista de páginas do menu (achatando os grupos acima), pra Usuários e acessos
  // montar o checklist de "quais páginas cada perfil pode ver" sem duplicar href/label — ver
  // admin-users.js (renderPermPages) e auth-guard.js (aplica o resultado escondendo item/card +
  // a própria página); permissão continua por página, nunca por grupo.
  const NAV_LEAF_ITEMS = NAV_ITEMS.flatMap(entry => entry.items || [entry]);
  window.PortalNavItems = NAV_LEAF_ITEMS.map(item => ({ href: item.href, label: item.label, defaultHidden: !!item.defaultHidden, brands: item.brands || null }));
  function currentPageFile(){
    return (location.pathname.split('/').pop() || 'index.html');
  }
  function renderNavItemHtml(item, cur){
    const active = cur === item.href;
    return `<a href="${item.href}" class="portal-nav-item${active?' active':''}">${svgIcon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`;
  }
  function renderNavHtml(){
    const cur = currentPageFile();
    const html = NAV_ITEMS.map(entry=>{
      if(!entry.items) return renderNavItemHtml(entry, cur);
      return `<div class="portal-nav-section">
        <div class="portal-nav-section-label">${escapeHtml(entry.group)}</div>
        ${entry.items.map(sub=>renderNavItemHtml(sub, cur)).join('')}
      </div>`;
    }).join('');
    return `<nav class="portal-nav">${html}</nav>`;
  }

  // ============================================================
  // SELETOR DE MARCA — trigger + popover ancorado no <body> (mesma mecânica de
  // .icon-picker-trigger/.icon-picker-popover em app.js: a sidebar tem overflow-y:auto, que
  // cortaria um popover position:absolute preso nela)
  // ============================================================
  let brandPopoverOpen = false;
  let brandPopoverEl = null;

  function renderBrandTrigger(){
    const trigger = $('portalBrandTrigger'); if(!trigger) return;
    const b = activeBrand();
    trigger.innerHTML = `${brandAvatarHtml(b)}<span class="portal-brand-trigger-body"><span class="portal-brand-trigger-name">${escapeHtml(b.name)}</span></span><span class="portal-brand-trigger-chevron">${svgIcon('<path d="m6 9 6 6 6-6"/>', 14)}</span>`;
  }

  function closeBrandPopover(){
    if(brandPopoverEl && brandPopoverEl.parentNode) brandPopoverEl.parentNode.removeChild(brandPopoverEl);
    brandPopoverEl = null;
    brandPopoverOpen = false;
    const trigger = $('portalBrandTrigger');
    if(trigger) trigger.classList.remove('open');
    document.removeEventListener('mousedown', onDocClickClosePopover);
    window.removeEventListener('scroll', closeBrandPopover, true);
    window.removeEventListener('resize', closeBrandPopover);
  }
  function onDocClickClosePopover(ev){
    const trigger = $('portalBrandTrigger');
    if(brandPopoverEl && brandPopoverEl.contains(ev.target)) return;
    if(trigger && trigger.contains(ev.target)) return;
    closeBrandPopover();
  }

  // uma linha da lista: nome/curto/foto viram campos editáveis ao clicar no lápis (mesmo
  // padrão do botão de editar nome/nome curto/ícone de uma rede em Configurações > Redes, no app.js)
  let editingBrandId = null;

  function buildBrandRow(b){
    const row = document.createElement('div');
    if(editingBrandId === b.id){
      row.className = 'portal-brand-edit-fields';
      row.innerHTML = `<label class="pb-edit-photo" title="Alterar foto de perfil">${brandAvatarHtml(b)}<input type="file" accept="image/*" class="pb-edit-photo-input" style="display:none" /></label>
        <input type="text" class="pb-edit-name" value="${escapeHtml(b.name)}" placeholder="Nome da marca" />
        <input type="text" class="pb-edit-short" value="${escapeHtml(b.shortName||'')}" maxlength="4" placeholder="Curto" style="flex:0 0 52px" />`;
      const nameInput = row.querySelector('.pb-edit-name');
      const shortInput = row.querySelector('.pb-edit-short');
      const photoInput = row.querySelector('.pb-edit-photo-input');
      const commit = ()=>{
        const newName = nameInput.value.trim(); if(!newName) return;
        b.name = newName;
        b.shortName = shortInput.value.trim().toUpperCase() || newName.slice(0,2).toUpperCase();
        editingBrandId = null;
        saveBrands(BRANDS.slice());
        renderBrandTrigger();
        renderBrandPopoverList();
      };
      nameInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') commit(); if(ev.key==='Escape'){ editingBrandId=null; renderBrandPopoverList(); } });
      nameInput.addEventListener('blur', ()=> setTimeout(commit, 120));
      shortInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') commit(); });
      photoInput.addEventListener('click', ev=> ev.stopPropagation());
      photoInput.addEventListener('change', ()=>{
        const file = photoInput.files && photoInput.files[0]; if(!file) return;
        // a foto salva na hora, independente do nome/curto (que só commitam no blur/Enter) —
        // evita que trocar o foco pro seletor de arquivo dispare um commit de nome pela metade
        readBrandPhoto(file, dataUrl=>{
          b.photo = dataUrl;
          saveBrands(BRANDS.slice());
          renderBrandTrigger();
          renderBrandPopoverList();
        });
      });
    } else {
      // Editar/duplicar/excluir marca fica só pra Admin — mesma checagem de
      // document.body.dataset.userRole (setado por auth-guard.js) usada em checkAdminRole
      // (templates.js) e no botão de recolher/etc. deste arquivo.
      const isAdmin = document.body.dataset.userRole === 'admin';
      row.className = 'portal-brand-row' + (b.id===ACTIVE_ID ? ' active' : '');
      row.innerHTML = `${brandAvatarHtml(b)}<span class="portal-brand-row-name">${escapeHtml(b.name)}</span>${isAdmin ? `<button type="button" class="portal-brand-row-edit" title="Editar marca" aria-label="Editar marca">${svgIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 13)}</button>` : ''}`;
      row.addEventListener('click', ()=>{ if(b.id!==ACTIVE_ID) switchToBrand(b.id); });
      if(isAdmin) row.querySelector('.portal-brand-row-edit').addEventListener('click', ev=>{ ev.stopPropagation(); editingBrandId = b.id; renderBrandPopoverList(); });
    }
    return row;
  }

  function renderBrandPopoverList(){
    if(!brandPopoverEl) return;
    const list = brandPopoverEl.querySelector('.portal-brand-list');
    list.innerHTML = '';
    BRANDS.forEach(b=> list.appendChild(buildBrandRow(b)));
  }

  function positionPopover(el, anchor){
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${r.left}px`;
  }

  function openBrandPopover(){
    const trigger = $('portalBrandTrigger'); if(!trigger) return;
    // Criar marca nova também é só pra Admin — mesma checagem de buildBrandRow acima.
    const isAdmin = document.body.dataset.userRole === 'admin';
    brandPopoverEl = document.createElement('div');
    brandPopoverEl.className = 'portal-brand-popover';
    brandPopoverEl.innerHTML = `<div class="portal-brand-list"></div>${isAdmin ? `<div class="portal-brand-divider"></div><button type="button" class="portal-brand-add">${svgIcon('<path d="M12 5v14M5 12h14"/>', 14)}<span>Nova marca</span></button>` : ''}`;
    document.body.appendChild(brandPopoverEl);
    renderBrandPopoverList();
    positionPopover(brandPopoverEl, trigger);
    if(isAdmin) brandPopoverEl.querySelector('.portal-brand-add').addEventListener('click', ()=>{ closeBrandPopover(); openNewBrandModal(); });
    trigger.classList.add('open');
    brandPopoverOpen = true;
    document.addEventListener('mousedown', onDocClickClosePopover);
    window.addEventListener('scroll', closeBrandPopover, true);
    window.addEventListener('resize', closeBrandPopover);
  }

  // ============================================================
  // BARRA DE CONTA — linha única no rodapé da sidebar, com quem está logado. Nome/e-mail só são
  // conhecidos depois que auth-guard.js confirma a sessão (portal-shell.js roda antes disso, ver
  // topo do arquivo) — por isso nasce com texto neutro e é preenchida de fora, em
  // #portalProfileName/#portalProfileEmail (e no data-user-email do <body>, usado pela
  // confirmação de redefinir senha); a página inteira já fica escondida por auth-pending até lá,
  // então não há flash de conteúdo vazio.
  //
  // A barra inteira é clicável e abre um menu pra CIMA (fica no rodapé, ver
  // positionPopoverAbove) com "Redefinir senha" e "Sair" — igual ao seletor de marca no topo da
  // sidebar, só que ancorado embaixo. O ícone de sair continua também solto na própria barra,
  // como atalho de um clique só; por isso seu clique precisa de stopPropagation, senão abriria o
  // menu por cima ao mesmo tempo que desloga. Ambos chamam window.PortalFirebase.* — exposto por
  // firebase-client.js — em vez de um import, porque este arquivo é um script clássico (não
  // módulo) de propósito: a marca ativa precisa ficar disponível de forma síncrona pros scripts
  // que vêm depois dele.
  // ============================================================
  async function doLogout(){
    try{ if(window.PortalFirebase) await window.PortalFirebase.logout(); }catch(e){}
    location.replace('login.html');
  }

  let accountMenuOpen = false;
  let accountMenuEl = null;

  function closeAccountMenu(){
    if(accountMenuEl && accountMenuEl.parentNode) accountMenuEl.parentNode.removeChild(accountMenuEl);
    accountMenuEl = null;
    accountMenuOpen = false;
    const bar = $('portalAccountBar');
    if(bar){ bar.setAttribute('aria-expanded', 'false'); bar.classList.remove('open'); }
    document.removeEventListener('mousedown', onDocClickCloseAccountMenu);
    window.removeEventListener('scroll', closeAccountMenu, true);
    window.removeEventListener('resize', closeAccountMenu);
  }
  function onDocClickCloseAccountMenu(ev){
    const bar = $('portalAccountBar');
    if(accountMenuEl && accountMenuEl.contains(ev.target)) return;
    if(bar && bar.contains(ev.target)) return;
    closeAccountMenu();
  }
  function openAccountMenu(){
    const bar = $('portalAccountBar'); if(!bar) return;
    accountMenuEl = document.createElement('div');
    accountMenuEl.className = 'portal-brand-popover portal-account-menu';
    accountMenuEl.innerHTML = `<button type="button" class="portal-account-menu-item" id="portalMenuProfileBtn">${svgIcon('<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="5"/>', 15)}<span>Perfil</span></button><a href="notifications.html" class="portal-account-menu-item">${svgIcon('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>', 15)}<span>Notificações</span><span class="portal-account-menu-dot"${unreadNotifications?'':' hidden'}>${notificationBadgeLabel()}</span></a><button type="button" class="portal-account-menu-item" id="portalMenuSettingsBtn">${svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>', 15)}<span>Configurações</span></button><div class="portal-account-menu-divider"></div><button type="button" class="portal-account-menu-item" id="portalResetPasswordRow">${svgIcon('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>', 15)}<span>Redefinir senha</span></button><div class="portal-account-menu-divider"></div><button type="button" class="portal-account-menu-item danger" id="portalMenuLogoutBtn">${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>', 15)}<span>Sair</span></button>`;
    document.body.appendChild(accountMenuEl);
    positionPopoverAbove(accountMenuEl, bar);
    accountMenuEl.querySelector('#portalMenuProfileBtn').addEventListener('click', ()=>{ closeAccountMenu(); openProfileModal(); });
    accountMenuEl.querySelector('#portalMenuSettingsBtn').addEventListener('click', ()=>{ closeAccountMenu(); openPortalSettingsModal(); });
    accountMenuEl.querySelector('#portalResetPasswordRow').addEventListener('click', ()=>{ closeAccountMenu(); openResetPasswordModal(); });
    accountMenuEl.querySelector('#portalMenuLogoutBtn').addEventListener('click', ()=>{ closeAccountMenu(); doLogout(); });
    bar.setAttribute('aria-expanded', 'true');
    bar.classList.add('open');
    accountMenuOpen = true;
    document.addEventListener('mousedown', onDocClickCloseAccountMenu);
    window.addEventListener('scroll', closeAccountMenu, true);
    window.addEventListener('resize', closeAccountMenu);
  }
  function positionPopoverAbove(el, anchor){
    const r = anchor.getBoundingClientRect();
    el.style.left = `${r.left}px`;
    el.style.bottom = `${window.innerHeight - r.top + 6}px`;
  }
  function wireAccountBar(){
    const bar = $('portalAccountBar'); if(!bar) return;
    bar.addEventListener('click', ()=>{ accountMenuOpen ? closeAccountMenu() : openAccountMenu(); });
    bar.addEventListener('keydown', ev=>{ if(ev.key==='Enter' || ev.key===' '){ ev.preventDefault(); accountMenuOpen ? closeAccountMenu() : openAccountMenu(); } });
    const logoutBtn = $('portalLogoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', ev=>{ ev.stopPropagation(); doLogout(); });
  }

  // ============================================================
  // MODAL "REDEFINIR SENHA" — confirmação antes de disparar o e-mail (mesmo padrão
  // .modal-backdrop/.modal do resto do app). Único jeito de trocar senha para quem não é admin
  // (a área de administração é só pra quem já é admin) — reaproveita o mesmo e-mail de
  // redefinição que "Esqueci minha senha" usa em login.html, só que sem precisar sair da sessão.
  // ============================================================
  let resetPasswordModalEl = null;
  function buildResetPasswordModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'resetPasswordBackdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Redefinir senha</h2>
        <div class="modal-header-actions">
          <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 15)}</button>
        </div>
      </div>
      <div class="modal-body">
        <p>Enviaremos um e-mail para <strong id="resetPasswordEmail"></strong> com um link seguro para você definir uma nova senha.</p>
      </div>
      <div class="modal-footer">
        <button type="button" id="cancelResetPassword" class="btn ghost">Cancelar</button>
        <button type="button" id="confirmResetPassword" class="btn">Confirmar</button>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = ()=>{ backdrop.style.display = 'none'; };
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('#cancelResetPassword').addEventListener('click', close);
    backdrop.querySelector('#confirmResetPassword').addEventListener('click', async ()=>{
      const email = document.body.dataset.userEmail;
      const btn = backdrop.querySelector('#confirmResetPassword');
      if(!email || !window.PortalFirebase) { close(); return; }
      btn.disabled = true;
      try{
        await window.PortalFirebase.requestPasswordReset(email);
        close();
        alert('Enviamos um link para redefinir sua senha para ' + email + '.');
      }catch(e){
        close();
        alert('Não foi possível enviar o link agora. Tente novamente em instantes.');
      }finally{
        btn.disabled = false;
      }
    });
    return backdrop;
  }
  function openResetPasswordModal(){
    if(!resetPasswordModalEl) resetPasswordModalEl = buildResetPasswordModal();
    resetPasswordModalEl.querySelector('#resetPasswordEmail').textContent = document.body.dataset.userEmail || '';
    resetPasswordModalEl.style.display = 'flex';
  }

  // ============================================================
  // MODAL "PERFIL" — autoatendimento: nome e foto do próprio usuário, gravados em users/{uid}
  // (window.PortalFirebase.updateOwnProfile) em vez de localStorage, pra continuarem valendo em
  // qualquer navegador/dispositivo e sobreviverem a um F5.
  //
  // O modal inteiro é sempre a foto do usuário (leitura E edição) — cabeçalho, nome, Perfil
  // (role) e as ações ficam sobrepostos a ela; só o conteúdo do rodapé/nome troca entre os dois
  // modos (ver setProfileEditing). Na edição, um badge de câmera sobre a própria foto abre o
  // seletor de arquivo, e o nome vira um campo editável no lugar do texto. O Perfil (role) nunca
  // é editável aqui de propósito: só muda pelo admin, em Usuários e acessos > Perfis, então esta
  // tela só exibe o nome dele (resolveProfileRoleName).
  // ============================================================
  let profileModalEl = null;
  let profilePhotoDataUrl = null;
  let profileSavedName = '';
  let profileSavedPhoto = null;
  let profileCurrentUid = null;
  // Foto original (não recortada) + enquadramento (zoom/posição) por trás da foto atualmente
  // exibida em profilePhotoDataUrl — permite reabrir o ajuste de zoom/posição já no ponto onde
  // o usuário parou, em vez de reiniciar sempre do zero sobre o quadrado já recortado (sem
  // "memória" disso, reduzir o zoom nunca revelaria de volta o que já tinha sido cortado).
  //
  // ponytail: fica só em localStorage (não em Firestore) pra não precisar alargar a regra de
  // segurança users/{uid} (hoje trava affectedKeys a ['lastAccessAt','name','photo']) nem correr
  // risco de estourar o limite de 1MB por documento do Firestore guardando a foto original
  // dentro do doc do usuário. Limitação real: essa "memória" de enquadramento é por navegador,
  // não sincroniza entre dispositivos — troque de navegador/computador e o próximo ajuste parte
  // do quadrado já salvo (zoom=1, sem prejuízo à foto em si, só à conveniência de desfazer um
  // recorte antigo). Evolução natural seria mover a foto original pro Firebase Storage e guardar
  // só a URL no Firestore, o que já resolveria os dois limites de uma vez.
  const PROFILE_PHOTO_SRC_KEY = 'portal_profile_photo_src_v1';
  let profilePhotoOriginalUrl = null;
  let profilePhotoCrop = null;
  function loadCachedPhotoSrc(uid, forPhoto){
    if(!uid || !forPhoto) return null;
    try{
      const all = JSON.parse(localStorage.getItem(PROFILE_PHOTO_SRC_KEY) || '{}');
      const entry = all[uid];
      return (entry && entry.forPhoto === forPhoto) ? entry : null;
    }catch(e){ return null; }
  }
  function saveCachedPhotoSrc(uid, forPhoto, original, crop){
    if(!uid) return;
    try{
      const all = JSON.parse(localStorage.getItem(PROFILE_PHOTO_SRC_KEY) || '{}');
      all[uid] = { forPhoto, original, crop };
      localStorage.setItem(PROFILE_PHOTO_SRC_KEY, JSON.stringify(all));
    }catch(e){ /* localStorage indisponível (privado/bloqueado/cheio) — só perde a conveniência */ }
  }
  // Sincroniza profilePhotoOriginalUrl/profilePhotoCrop com o cache pra uma foto específica —
  // se o cache não bate com a foto atual (outro navegador, ou o rascunho que estava em edição
  // foi descartado), volta ao estado seguro de "sem original conhecido" em vez de mostrar um
  // enquadramento que não corresponde à foto de verdade.
  function syncProfilePhotoSrc(uid, forPhoto){
    const cached = loadCachedPhotoSrc(uid, forPhoto);
    profilePhotoOriginalUrl = cached ? cached.original : null;
    profilePhotoCrop = cached ? cached.crop : null;
  }
  // reduz a foto recém-enviada pra um teto razoável antes de guardá-la como "original" — evita
  // carregar/guardar arquivos de câmera de vários MB só pra permitir reabrir o ajuste depois
  function resizeImageForStorage(img, cb){
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const resized = new Image();
    resized.onload = ()=>cb(resized, dataUrl);
    resized.src = dataUrl;
  }
  // Mesmos perfis padrão de admin-users.js (DEFAULT_PROFILES) — cópia mínima só pro rótulo,
  // porque este arquivo é script clássico e não importa módulos. Perfis customizados batem
  // certo assim mesmo: resolveProfileRoleName busca a lista real em portalStore antes de cair
  // aqui.
  const DEFAULT_PROFILE_NAMES = { admin:'Administrador', user:'Usuário', gestao:'Gestão', criacao:'Criação', 'social-media':'Social Media' };
  let profileRoleNamesCache = null;
  async function resolveProfileRoleName(role){
    if(!role) return '';
    if(!profileRoleNamesCache && window.PortalFirebase){
      try{
        const record = await window.PortalFirebase.readPortalStore('user-profiles-v1');
        if(Array.isArray(record.v) && record.v.length) profileRoleNamesCache = record.v;
      }catch(e){ /* offline — usa só os nomes padrão abaixo */ }
    }
    const found = profileRoleNamesCache && profileRoleNamesCache.find(p=>p.id===role);
    return found ? found.name : (DEFAULT_PROFILE_NAMES[role] || role);
  }
  function setProfileCardPhoto(url){
    profileModalEl.querySelector('#profileCardPhoto').innerHTML = url ? `<img src="${url}" alt="" />` : svgIcon('<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="5"/>', 40);
  }
  let profileIsEditing = false;
  // O badge de reposicionar só faz sentido havendo uma foto pra reposicionar — some/aparece
  // conforme profilePhotoDataUrl muda (upload novo, ajuste aplicado, ou saída do modo edição).
  function updateProfileCropBadge(){
    profileModalEl.querySelector('#profilePhotoCropBadge').style.display = (profileIsEditing && profilePhotoDataUrl) ? '' : 'none';
  }
  function setProfileEditing(editing){
    // display:none via estilo inline, não hidden — .portal-profile-edit-toggle/-actions já têm
    // display definido no CSS, mesma especificidade de [hidden] só que de origem "autor" (vence
    // a stylesheet do navegador), então o atributo hidden sozinho não escondia esses elementos.
    profileIsEditing = editing;
    profileModalEl.querySelector('#profileCardName').style.display = editing ? 'none' : '';
    profileModalEl.querySelector('#profileNameField').style.display = editing ? '' : 'none';
    profileModalEl.querySelector('#profileEditToggle').style.display = editing ? 'none' : '';
    profileModalEl.querySelector('#profileEditActions').style.display = editing ? 'flex' : 'none';
    profileModalEl.querySelector('#profilePhotoEditBadge').style.display = editing ? '' : 'none';
    if(!editing){
      profilePhotoDataUrl = profileSavedPhoto;
      syncProfilePhotoSrc(profileCurrentUid, profileSavedPhoto);
      profileModalEl.querySelector('#profileNameInput').value = profileSavedName;
      setProfileCardPhoto(profileSavedPhoto);
    }
    updateProfileCropBadge();
  }

  // ============================================================
  // AJUSTE DE FOTO (reposicionar + zoom) — janela circular igual ao avatar final
  // (.portal-account-avatar/.admin-table-avatar são círculos via CSS), pra escolher exatamente
  // qual parte da foto aparece dentro dele em vez de confiar só no recorte central automático
  // de readBrandPhoto. Funciona tanto sobre uma foto recém-selecionada (upload ainda não
  // processado, imagem original em resolução cheia) quanto sobre a foto já salva (reabre a
  // imagem atual como fonte, pra "reajuste de posicionamento" sem precisar reenviar o arquivo).
  // Arrastar (pointer) e a roda do mouse pra zoom seguem o mesmo padrão de post-editor.js
  // (drag do fundo + wheel-zoom no canvas).
  // ============================================================
  const CROP_STAGE = 280, CROP_OUT = 640;
  let cropModalEl = null, cropImage = null, cropZoom = 1, cropOffsetX = 0, cropOffsetY = 0, cropOnConfirm = null, cropDrag = null;
  function cropCoverScale(){
    return Math.max(CROP_STAGE/cropImage.width, CROP_STAGE/cropImage.height);
  }
  function cropClamp(){
    const scale = cropCoverScale() * cropZoom;
    const w = cropImage.width*scale, h = cropImage.height*scale;
    cropOffsetX = Math.min(0, Math.max(CROP_STAGE - w, cropOffsetX));
    cropOffsetY = Math.min(0, Math.max(CROP_STAGE - h, cropOffsetY));
    return scale;
  }
  function renderCropPreview(){
    if(!cropImage || !cropModalEl) return;
    const scale = cropClamp();
    const canvas = cropModalEl.querySelector('#cropCanvas');
    canvas.getContext('2d').clearRect(0,0,CROP_STAGE,CROP_STAGE);
    canvas.getContext('2d').drawImage(cropImage, cropOffsetX, cropOffsetY, cropImage.width*scale, cropImage.height*scale);
  }
  function setCropZoomPct(pct){
    // mantém o centro do enquadramento ao trocar o zoom — sem isso a imagem "pula" a cada ajuste
    const oldScale = cropClamp();
    const centerImgX = (CROP_STAGE/2 - cropOffsetX) / oldScale;
    const centerImgY = (CROP_STAGE/2 - cropOffsetY) / oldScale;
    cropZoom = pct/100;
    const newScale = cropCoverScale() * cropZoom;
    cropOffsetX = CROP_STAGE/2 - centerImgX*newScale;
    cropOffsetY = CROP_STAGE/2 - centerImgY*newScale;
    renderCropPreview();
  }
  function buildCropModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'profilePhotoCropBackdrop';
    backdrop.innerHTML = `<div class="modal profile-photo-crop-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Ajustar foto</h2>
        <div class="modal-header-actions">
          <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 15)}</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="portal-photo-crop-stage" id="cropStage">
          <canvas id="cropCanvas" width="${CROP_STAGE}" height="${CROP_STAGE}"></canvas>
        </div>
        <div class="portal-photo-crop-zoom-row">
          ${svgIcon('<circle cx="10" cy="10" r="6"/><path d="M7 10h6"/><path d="m21 21-4.3-4.3"/>', 15)}
          <input type="range" id="cropZoomSlider" min="100" max="300" value="100" />
          ${svgIcon('<circle cx="10" cy="10" r="6"/><path d="M7 10h6M10 7v6"/><path d="m21 21-4.3-4.3"/>', 15)}
        </div>
        <p class="portal-photo-crop-hint">Arraste a foto pra posicionar e use o controle pra dar zoom — é assim que ela vai aparecer no avatar.</p>
      </div>
      <div class="modal-footer">
        <button type="button" id="cropCancel" class="btn ghost">Cancelar</button>
        <button type="button" id="cropConfirm" class="btn">Aplicar</button>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const stage = backdrop.querySelector('#cropStage');
    const close = ()=>{ backdrop.style.display = 'none'; cropImage = null; cropOnConfirm = null; };
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('#cropCancel').addEventListener('click', close);
    stage.addEventListener('pointerdown', ev=>{
      cropDrag = { x:ev.clientX, y:ev.clientY, ox:cropOffsetX, oy:cropOffsetY };
      stage.setPointerCapture(ev.pointerId);
    });
    stage.addEventListener('pointermove', ev=>{
      if(!cropDrag) return;
      cropOffsetX = cropDrag.ox + (ev.clientX - cropDrag.x);
      cropOffsetY = cropDrag.oy + (ev.clientY - cropDrag.y);
      renderCropPreview();
    });
    ['pointerup','pointercancel'].forEach(evt=>stage.addEventListener(evt, ()=>{ cropDrag = null; }));
    stage.addEventListener('wheel', ev=>{
      ev.preventDefault();
      const slider = backdrop.querySelector('#cropZoomSlider');
      const pct = Math.max(100, Math.min(300, Number(slider.value) + (ev.deltaY < 0 ? 10 : -10)));
      slider.value = pct;
      setCropZoomPct(pct);
    }, { passive:false });
    backdrop.querySelector('#cropZoomSlider').addEventListener('input', ev=>setCropZoomPct(Number(ev.target.value)));
    backdrop.querySelector('#cropConfirm').addEventListener('click', ()=>{
      const ratio = CROP_OUT/CROP_STAGE;
      const stageScale = cropClamp();
      const outCanvas = document.createElement('canvas');
      outCanvas.width = CROP_OUT; outCanvas.height = CROP_OUT;
      outCanvas.getContext('2d').drawImage(cropImage, cropOffsetX*ratio, cropOffsetY*ratio, cropImage.width*stageScale*ratio, cropImage.height*stageScale*ratio);
      const dataUrl = outCanvas.toDataURL('image/jpeg', 0.85);
      // guarda o enquadramento como fração do tamanho da imagem original (não em px do stage),
      // pra continuar válido mesmo que a imagem "original" seja recarregada com outras dimensões
      const centerImgX = (CROP_STAGE/2 - cropOffsetX) / stageScale;
      const centerImgY = (CROP_STAGE/2 - cropOffsetY) / stageScale;
      const cropMeta = { zoom: cropZoom, cx: centerImgX/cropImage.width, cy: centerImgY/cropImage.height };
      const cb = cropOnConfirm;
      close();
      if(cb) cb(dataUrl, cropMeta);
    });
    return backdrop;
  }
  // savedCrop (opcional) = { zoom, cx, cy } de um ajuste anterior sobre esta mesma imagem —
  // reabre exatamente de onde o usuário parou em vez de sempre recomeçar centralizado em 100%
  function openCropModal(img, onConfirm, savedCrop){
    if(!cropModalEl) cropModalEl = buildCropModal();
    cropImage = img;
    const cover = cropCoverScale();
    if(savedCrop){
      cropZoom = Math.max(1, Math.min(3, savedCrop.zoom || 1));
      const scale = cover * cropZoom;
      cropOffsetX = CROP_STAGE/2 - (savedCrop.cx||0.5)*img.width*scale;
      cropOffsetY = CROP_STAGE/2 - (savedCrop.cy||0.5)*img.height*scale;
    }else{
      cropZoom = 1;
      cropOffsetX = (CROP_STAGE - img.width*cover)/2;
      cropOffsetY = (CROP_STAGE - img.height*cover)/2;
    }
    cropModalEl.querySelector('#cropZoomSlider').value = Math.round(cropZoom*100);
    cropOnConfirm = onConfirm;
    cropModalEl.style.display = 'flex';
    renderCropPreview();
  }
  function buildProfileModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'profileBackdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Perfil</h2>
        <div class="modal-header-actions">
          <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 15)}</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="portal-profile-photo" id="profileCardPhoto"></div>
        <button type="button" class="portal-profile-photo-edit-badge portal-profile-photo-crop-badge" id="profilePhotoCropBadge" style="display:none" title="Reposicionar e dar zoom" aria-label="Reposicionar e dar zoom">${svgIcon('<path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4"/>', 16)}</button>
        <button type="button" class="portal-profile-photo-edit-badge" id="profilePhotoEditBadge" style="display:none" title="Alterar foto" aria-label="Alterar foto">${svgIcon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>', 16)}</button>
        <input id="profilePhotoInput" type="file" accept="image/*" style="display:none" />
        <div class="portal-profile-overlay">
          <div class="portal-profile-card-name" id="profileCardName"></div>
          <div class="portal-profile-name-field" id="profileNameField" style="display:none">
            <input id="profileNameInput" type="text" placeholder="Seu nome" />
          </div>
          <div class="portal-profile-card-role" id="profileCardRole"></div>
          <button type="button" class="btn ghost portal-profile-edit-toggle" id="profileEditToggle">${svgIcon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>', 14)}<span>Editar</span></button>
          <div class="portal-profile-edit-actions" id="profileEditActions" style="display:none">
            <button type="button" id="cancelProfile" class="btn ghost">Cancelar</button>
            <button type="button" id="saveProfile" class="btn">Salvar</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = ()=>{ backdrop.style.display = 'none'; setProfileEditing(false); };
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('#profileEditToggle').addEventListener('click', ()=>setProfileEditing(true));
    backdrop.querySelector('#cancelProfile').addEventListener('click', ()=>setProfileEditing(false));
    backdrop.querySelector('#profilePhotoEditBadge').addEventListener('click', ()=>backdrop.querySelector('#profilePhotoInput').click());
    backdrop.querySelector('#profilePhotoInput').addEventListener('change', ev=>{
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = ''; // permite escolher o mesmo arquivo de novo depois de cancelar o ajuste
      if(!file) return;
      // abre no ajuste de zoom/posição em vez de recortar o centro automaticamente — a imagem
      // aqui ainda é a original (reduzida a um teto razoável, ver resizeImageForStorage), não o
      // quadrado final — é ela que fica guardada pra permitir reabrir o ajuste depois
      loadImageFile(file, rawImg=>{
        resizeImageForStorage(rawImg, (img, originalDataUrl)=>{
          openCropModal(img, (dataUrl, cropMeta)=>{
            profilePhotoDataUrl = dataUrl;
            profilePhotoOriginalUrl = originalDataUrl;
            profilePhotoCrop = cropMeta;
            saveCachedPhotoSrc(profileCurrentUid, dataUrl, originalDataUrl, cropMeta);
            setProfileCardPhoto(dataUrl);
            updateProfileCropBadge();
          });
        });
      });
    });
    // reaproveita a original conhecida (se ainda corresponder à foto atual) como fonte pro
    // ajuste, com o mesmo zoom/posição de antes — sem original conhecido, cai no quadrado atual
    // como se fosse a imagem inteira (mesmo comportamento de antes desta funcionalidade)
    backdrop.querySelector('#profilePhotoCropBadge').addEventListener('click', ()=>{
      if(!profilePhotoDataUrl) return;
      const sourceUrl = profilePhotoOriginalUrl || profilePhotoDataUrl;
      const savedCrop = profilePhotoOriginalUrl ? profilePhotoCrop : null;
      const img = new Image();
      img.onload = ()=>openCropModal(img, (dataUrl, cropMeta)=>{
        profilePhotoDataUrl = dataUrl;
        profilePhotoOriginalUrl = sourceUrl;
        profilePhotoCrop = cropMeta;
        saveCachedPhotoSrc(profileCurrentUid, dataUrl, sourceUrl, cropMeta);
        setProfileCardPhoto(dataUrl);
      }, savedCrop);
      img.src = sourceUrl;
    });
    backdrop.querySelector('#saveProfile').addEventListener('click', async ()=>{
      const nameInput = $('profileNameInput');
      const name = nameInput.value.trim();
      if(!name){ nameInput.focus(); return; }
      if(!window.PortalFirebase){ close(); return; }
      const btn = backdrop.querySelector('#saveProfile');
      btn.disabled = true;
      try{
        const patch = { name };
        if(profilePhotoDataUrl != null) patch.photo = profilePhotoDataUrl;
        await window.PortalFirebase.updateOwnProfile(patch);
        applyOwnProfileToUI(patch);
        profileSavedName = name;
        profileSavedPhoto = profilePhotoDataUrl;
        backdrop.querySelector('#profileCardName').textContent = name;
        close();
      }catch(e){
        alert('Não foi possível salvar. Tente novamente.');
      }finally{
        btn.disabled = false;
      }
    });
    return backdrop;
  }
  // Aplica nome/foto salvos direto na sidebar, sem esperar um reload — mesma dupla de elementos
  // (#portalProfileName + avatar da barra "Conta") que auth-guard.js já preenche no primeiro
  // carregamento com o que veio do Firestore.
  function applyOwnProfileToUI(patch){
    const nameEl = $('portalProfileName');
    if(nameEl && patch.name) nameEl.textContent = patch.name;
    if(patch.photo){
      const avatar = document.querySelector('#portalAccountBar .portal-account-avatar');
      if(avatar){
        let img = avatar.querySelector('img');
        if(!img){ img = document.createElement('img'); img.alt = ''; avatar.insertBefore(img, avatar.firstChild); }
        img.src = patch.photo;
      }
    }
  }
  async function openProfileModal(){
    if(!profileModalEl) profileModalEl = buildProfileModal();
    setProfileEditing(false);
    profileSavedName = '';
    profileSavedPhoto = null;
    profileCurrentUid = null;
    profilePhotoOriginalUrl = null;
    profilePhotoCrop = null;
    profileModalEl.querySelector('#profileCardName').textContent = '';
    profileModalEl.querySelector('#profileCardRole').textContent = '';
    setProfileCardPhoto(null);
    profileModalEl.style.display = 'flex';
    if(!window.PortalFirebase) return;
    try{
      const context = await window.PortalFirebase.currentContext();
      profileCurrentUid = context.user.uid;
      profileSavedName = context.profile.name || '';
      profileSavedPhoto = context.profile.photo || null;
      syncProfilePhotoSrc(profileCurrentUid, profileSavedPhoto);
      profileModalEl.querySelector('#profileNameInput').value = profileSavedName;
      profilePhotoDataUrl = profileSavedPhoto;
      profileModalEl.querySelector('#profileCardName').textContent = profileSavedName;
      setProfileCardPhoto(profileSavedPhoto);
      resolveProfileRoleName(context.profile.role).then(roleName=>{
        profileModalEl.querySelector('#profileCardRole').textContent = roleName;
      });
    }catch(e){ /* mantém o cartão vazio — usuário ainda consegue preencher pelo Editar */ }
  }

  // ============================================================
  // MODAL "NOVA MARCA" — mesmo padrão .modal-backdrop/.modal usado pelo resto do app,
  // criado uma vez e reaproveitado a cada abertura
  // ============================================================
  let newBrandModalEl = null;
  let newBrandPhotoDataUrl = null;
  function buildNewBrandModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'newBrandBackdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Nova marca</h2>
        <div class="modal-header-actions">
          <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 15)}</button>
        </div>
      </div>
      <div class="modal-body">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label>Nome da marca</label>
            <input id="newBrandName" type="text" placeholder="Ex: Vonder Pro" />
          </div>
          <div>
            <label>Nome curto</label>
            <input id="newBrandShort" type="text" placeholder="Ex: VP" maxlength="4" />
          </div>
          <div>
            <label>Foto de perfil</label>
            <label class="portal-brand-photo-upload" id="newBrandPhotoLabel">
              <span class="portal-brand-photo-preview" id="newBrandPhotoPreview">${svgIcon('<path d="M12 5v14M5 12h14"/>', 15)}</span>
              <span id="newBrandPhotoLabelText">Escolher foto</span>
              <input id="newBrandPhotoInput" type="file" accept="image/*" style="display:none" />
            </label>
          </div>
          <div style="font-size:11.5px;color:var(--text-faint)">Cria um Calendário de Postagens e uma Central de Inteligência próprios, sem nenhum dado das outras marcas.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" id="cancelNewBrand" class="btn ghost">Cancelar</button>
        <button type="button" id="saveNewBrand" class="btn">Criar marca</button>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = ()=>{ backdrop.style.display = 'none'; };
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('#cancelNewBrand').addEventListener('click', close);
    backdrop.querySelector('#newBrandPhotoInput').addEventListener('change', (ev)=>{
      const file = ev.target.files && ev.target.files[0]; if(!file) return;
      readBrandPhoto(file, dataUrl=>{
        newBrandPhotoDataUrl = dataUrl;
        $('newBrandPhotoPreview').innerHTML = `<img src="${dataUrl}" alt="" />`;
        $('newBrandPhotoLabelText').textContent = 'Trocar foto';
      });
    });
    backdrop.querySelector('#saveNewBrand').addEventListener('click', ()=>{
      const nameInput = $('newBrandName');
      const name = nameInput.value.trim();
      if(!name){ alert('Digite o nome da marca.'); return; }
      const shortInput = $('newBrandShort');
      const shortName = shortInput.value.trim().toUpperCase() || name.slice(0,2).toUpperCase();
      const id = generateBrandId();
      const next = BRANDS.concat([{ id, name, shortName, photo: newBrandPhotoDataUrl }]);
      saveBrands(next);
      switchToBrand(id);
    });
    return backdrop;
  }
  function openNewBrandModal(){
    if(!newBrandModalEl) newBrandModalEl = buildNewBrandModal();
    $('newBrandName').value = '';
    $('newBrandShort').value = '';
    newBrandPhotoDataUrl = null;
    $('newBrandPhotoInput').value = '';
    $('newBrandPhotoPreview').innerHTML = svgIcon('<path d="M12 5v14M5 12h14"/>', 15);
    $('newBrandPhotoLabelText').textContent = 'Escolher foto';
    newBrandModalEl.style.display = 'flex';
    $('newBrandName').focus();
  }

  // ============================================================
  // MODAL "CONFIGURAÇÕES" DO PORTAL — aberto pelo botão no rodapé da sidebar, em toda
  // página. Por enquanto só tem a aba Aparência (mesma funcionalidade da aba Aparência de
  // Configurações do calendário); a estrutura de abas já fica pronta pra receber mais seções
  // depois. IDs próprios (prefixo "portal") pra não colidir com o #settingsBackdrop que
  // visual-editor.html/app.js já tem na própria tela.
  // ============================================================
  let portalSettingsModalEl = null;
  function renderPortalColorGrid(){
    const grid = $('portalColorThemeGrid'); if(!grid) return;
    const hint = $('portalThemeSourceHint');
    if(getThemeSource() !== 'custom'){
      // fonte "brand": grid escondido — a cor vem da identidade pré-setada da marca ativa,
      // sem opção de escolha aqui (ver applyColorTheme/DEFAULT_BRANDS)
      grid.innerHTML = '';
      if(hint) hint.textContent = 'Cada marca usa a cor da própria identidade visual.';
      return;
    }
    if(hint) hint.textContent = 'Essa cor vale em qualquer marca que você acessar, no modo claro e escuro selecionado.';
    const current = getColorTheme();
    const customHex = localStorage.getItem(CUSTOM_COLOR_KEY) || '#F6BE00';
    const checkSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const swatches = COLOR_THEMES.map(p=>{
      const selected = current === p.id;
      return `<button type="button" class="color-swatch${selected?' selected':''}" data-color-theme="${p.id}" title="${escapeHtml(p.name)}" style="--sw-dark:${p.dark};--sw-light:${p.light}">${selected? `<span class="color-swatch-check">${checkSvg}</span>` : ''}</button>`;
    }).join('');
    const customSelected = current === 'custom';
    const customSwatch = `<button type="button" class="color-swatch color-swatch-custom${customSelected?' selected':''}" data-color-theme="custom" title="Personalizada" style="--sw-dark:${customHex};--sw-light:${customHex}">${customSelected? `<span class="color-swatch-check">${checkSvg}</span>` : svgIcon('<path d="m2 22 1-4 12.5-12.5a2.12 2.12 0 0 1 3 3L6 21l-4 1Z"/><path d="m14.5 5.5 4 4"/>', 16)}<input type="color" id="portalCustomColorInput" value="${customHex}" title="Escolher cor personalizada" /></button>`;
    grid.innerHTML = swatches + customSwatch;
    grid.querySelectorAll('.color-swatch:not(.color-swatch-custom)').forEach(btn=>{
      btn.addEventListener('click', ()=> setColorTheme(btn.dataset.colorTheme));
    });
    const customInput = $('portalCustomColorInput');
    if(customInput){
      customInput.addEventListener('click', ev=> ev.stopPropagation());
      // ao vivo, enquanto arrasta o seletor: só reflete a cor na tela (sem gravar ainda, pra
      // não gravar um valor por pixel arrastado) — a gravação de fato acontece só no "change",
      // quando o usuário solta o seletor
      customInput.addEventListener('input', ()=>{
        localStorage.setItem(CUSTOM_COLOR_KEY, customInput.value);
        localStorage.setItem(COLOR_THEME_KEY, 'custom');
        applyColorTheme('custom');
      });
      customInput.addEventListener('change', ()=> renderPortalColorGrid());
    }
  }
  function buildPortalSettingsModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'portalSettingsBackdrop';
    backdrop.innerHTML = `<div class="modal modal--wide" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Configurações</h2>
        <div class="modal-header-actions">
          <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 15)}</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="settings-layout">
          <div class="settings-sidebar" role="tablist">
            <button type="button" class="settings-nav-btn active" data-panel="portalSecAparencia">Aparência</button>
          </div>
          <div class="settings-content">
            <div class="settings-panel active" id="portalSecAparencia">
              <label>Modo</label>
              <div style="display:flex;gap:8px">
                <label class="chip"><input type="radio" name="portalSTheme" value="light" /> Claro</label>
                <label class="chip"><input type="radio" name="portalSTheme" value="dark" /> Escuro</label>
              </div>
              <label style="margin-top:10px">Tema de cor</label>
              <div style="display:flex;gap:8px">
                <label class="chip"><input type="radio" name="portalThemeSource" value="brand" /> Por marca</label>
                <label class="chip"><input type="radio" name="portalThemeSource" value="custom" /> Personalizado</label>
              </div>
              <div id="portalThemeSourceHint" style="font-size:11.5px;color:var(--text-faint);margin-top:6px"></div>
              <div id="portalColorThemeGrid" class="color-theme-grid"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = ()=>{ backdrop.style.display = 'none'; };
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    // aba lateral escopada a este modal — não usa document.querySelectorAll pra não
    // interferir (nem sofrer interferência) do menu de Configurações do calendário, que já
    // faz sua própria troca de aba de forma global em app.js
    backdrop.querySelectorAll('.settings-nav-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        backdrop.querySelectorAll('.settings-nav-btn').forEach(b=> b.classList.remove('active'));
        backdrop.querySelectorAll('.settings-panel').forEach(p=> p.classList.remove('active'));
        btn.classList.add('active');
        const panel = backdrop.querySelector('#'+btn.dataset.panel); if(panel) panel.classList.add('active');
      });
    });
    backdrop.querySelectorAll('input[name="portalSTheme"]').forEach(el=>{
      el.addEventListener('change', ()=> setTheme(el.value));
    });
    backdrop.querySelectorAll('input[name="portalThemeSource"]').forEach(el=>{
      el.addEventListener('change', ()=> setThemeSource(el.value));
    });
    return backdrop;
  }
  function openPortalSettingsModal(){
    if(!portalSettingsModalEl) portalSettingsModalEl = buildPortalSettingsModal();
    const current = localStorage.getItem(THEME_KEY) || 'light';
    const radio = portalSettingsModalEl.querySelector(`input[name="portalSTheme"][value="${current}"]`);
    if(radio) radio.checked = true;
    const sourceRadio = portalSettingsModalEl.querySelector(`input[name="portalThemeSource"][value="${getThemeSource()}"]`);
    if(sourceRadio) sourceRadio.checked = true;
    renderPortalColorGrid();
    portalSettingsModalEl.style.display = 'flex';
  }

  // ============================================================
  // RECOLHER/EXPANDIR A SIDEBAR — estado persistido, aplicado como classe no <aside>
  // ============================================================
  let sidebarCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
  function applyCollapsedClass(){
    const el = $('portalSidebar'); if(!el) return;
    el.classList.toggle('collapsed', sidebarCollapsed);
  }
  function renderCollapseBtn(){
    const btn = $('portalCollapseBtn'); if(!btn) return;
    btn.title = sidebarCollapsed ? 'Expandir menu' : 'Recolher menu';
    btn.setAttribute('aria-label', btn.title);
    // ícone-only (sem texto), no estilo do botão quadradinho de recolher da referência
    btn.innerHTML = sidebarCollapsed
      ? svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m14 10 2 2-2 2"/>', 14)
      : svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m16 10-2 2 2 2"/>', 14);
  }
  function toggleSidebarCollapsed(){
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem(COLLAPSE_KEY, sidebarCollapsed ? '1' : '0');
    applyCollapsedClass();
    renderCollapseBtn();
  }

  // ============================================================
  // MONTAGEM DA SIDEBAR
  // ============================================================
  function renderSidebar(){
    const el = $('portalSidebar'); if(!el) return;
    el.innerHTML = `
      <div class="portal-topbar">
        <div class="portal-logo"><span class="portal-logo-mark">${svgIcon('<path d="m12 2 8.5 5-8.5 5-8.5-5Z"/><path d="m3.5 12 8.5 5 8.5-5"/><path d="m3.5 17 8.5 5 8.5-5"/>', 15)}</span><span class="portal-logo-text">Marketing OVD</span></div>
        <button type="button" class="portal-collapse-btn" id="portalCollapseBtn"></button>
      </div>
      <div>
        <button type="button" class="portal-brand-trigger" id="portalBrandTrigger" aria-haspopup="true" aria-expanded="false"></button>
      </div>
      <div>
        ${renderNavHtml()}
      </div>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px">
        <div class="portal-theme-toggle view-toggle" id="portalThemeToggle" role="radiogroup" aria-label="Aparência">
          <button type="button" data-theme-btn="light" role="radio" aria-label="Tema claro" title="Tema claro">${svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', 15)}</button>
          <button type="button" data-theme-btn="dark" role="radio" aria-label="Tema escuro" title="Tema escuro">${svgIcon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', 15)}</button>
        </div>
        <div class="portal-account-bar" id="portalAccountBar" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false">
          <span class="portal-account-avatar">${svgIcon('<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="5"/>', 14)}<span class="portal-account-avatar-dot" id="portalAccountAvatarDot" hidden></span></span>
          <span class="portal-account-info"><span class="portal-account-name" id="portalProfileName">Conta</span><span class="portal-account-email" id="portalProfileEmail"></span></span>
          <button type="button" class="portal-account-btn" id="portalLogoutBtn" title="Sair" aria-label="Sair">${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>', 15)}</button>
        </div>
      </div>
    `;
    renderBrandTrigger();
    renderCollapseBtn();
    applyCollapsedClass();
    applyNotificationDot();
    $('portalBrandTrigger').addEventListener('click', ()=>{ brandPopoverOpen ? closeBrandPopover() : openBrandPopover(); });
    $('portalCollapseBtn').addEventListener('click', toggleSidebarCollapsed);
    wireAccountBar();
    wireThemeToggle();
    syncSidebarThemeToggle();
  }

  // ============================================================
  // INDICADOR DE NOTIFICAÇÃO NÃO LIDA — badge com a quantidade (não só um ponto) no avatar da
  // barra "Conta" e, quando o dropdown abre, o mesmo badge ao lado de "Notificações" (é de lá
  // que o alerta vem). Só pro perfil social-media, mesma restrição que o badge antigo tinha.
  // ============================================================
  let unreadNotifications = 0;
  function notificationBadgeLabel(){ return unreadNotifications>9 ? '9+' : String(unreadNotifications); }
  function applyNotificationDot(){
    const avatarDot = $('portalAccountAvatarDot');
    if(avatarDot){ avatarDot.hidden = !unreadNotifications; avatarDot.textContent = notificationBadgeLabel(); }
    if(accountMenuEl){
      const menuDot = accountMenuEl.querySelector('.portal-account-menu-dot');
      if(menuDot){ menuDot.hidden = !unreadNotifications; menuDot.textContent = notificationBadgeLabel(); }
    }
  }
  let notificationWatchStarted = false;
  function startPortalNotificationWatch(attempt){
    if(notificationWatchStarted) return;
    if(!window.PortalFirebase || document.body.dataset.authenticated!=='true'){
      if((attempt||0)<50) setTimeout(()=>startPortalNotificationWatch((attempt||0)+1),200);
      return;
    }
    if(document.body.dataset.userRole!=='social-media') return;
    notificationWatchStarted = true;
    const retry = ()=>{ notificationWatchStarted=false; if((attempt||0)<50) setTimeout(()=>startPortalNotificationWatch((attempt||0)+1),500); };
    window.PortalFirebase.subscribeNotifications(items=>{
      unreadNotifications = (Array.isArray(items) ? items : []).filter(item=>item.kind==='postReadyNotification' && !item.readAt).length;
      applyNotificationDot();
    }, retry).catch(retry);
  }

  renderSidebar();
  startPortalNotificationWatch();

  if(SYNC_ENABLED){
    syncPullBrands();
    setInterval(syncPullBrands, 20000);
  }

})();
