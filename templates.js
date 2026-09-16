(() => {
  'use strict';

  const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svgIcon = (paths, size) => `<svg width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  // mesmo ícone de "Editar marca" em portal-shell.js
  const PENCIL_PATH = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
  // mesmo ícone de .period-caret em intelligence-center.html
  const CHEVRON_PATH = '<path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>';
  const CHEVRON_RIGHT_PATH = '<path d="m9 18 6-6-6-6"/>';
  const COPY_PATH = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
  const CHECK_PATH = '<path d="M20 6 9 17l-5-5"/>';
  const STORE_PATH = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  const ADS_PATH = '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>';
  const LOCK_PATH = '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
  const X_PATH = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
  // mesmo ícone de "Mais ações" em admin-users.js
  const MENU_DOTS_PATH = '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>';
  const TRASH_PATH = '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>';
  const IMAGE_PATH = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L5 21"/>';
  // Tamanho comum aos ícones de botão de ação (fechar, adicionar, editar, copiar) — cada um usava
  // um número diferente (13 a 16px) e o "×" do fechar nem era SVG (era o caractere de texto "×",
  // que renderiza com peso/tamanho visual diferente de um SVG mesmo em font-size igual), então os
  // quatro ficavam visivelmente desalinhados lado a lado no cabeçalho do modal.
  const ACTION_ICON_SIZE = 15;

  // ---------------------------------------------------------------- marca ativa
  const brand = (window.PortalBrand && (window.PortalBrand.list || []).find(item => item.id === window.PortalBrand.activeId)) || {};
  const brandKey = brand.id || 'default';

  // Marketplaces por marca — cada marca do grupo vende em canais diferentes, mesmo padrão de
  // mapa por marca que BRAND_INTEGRATIONS usa em followers-dashboard.js. Hoje só a VONDER tem
  // marketplaces cadastrados; as demais mostram o estado vazio até alguém cadastrar os delas.
  // bg/ink = identidade visual pública de cada marketplace (usada no card e no cabeçalho do
  // modal); image = foto de capa do card, proporção 3:4 — fica vazia até a arte chegar, e o card
  // cai num gradiente com a própria cor da marca enquanto isso (ver cardBackground).
  const MARKETPLACES_BY_BRAND = {
    default: [
      { id: 'mercado-livre', name: 'Mercado Livre', bg: '#FFE600', ink: '#2D3277', image: '' },
      { id: 'shopee', name: 'Shopee', bg: '#EE4D2D', ink: '#ffffff', image: '' },
      { id: 'magalu', name: 'Magalu', bg: '#0086FF', ink: '#ffffff', image: '' },
      { id: 'temu', name: 'Temu', bg: '#FB7701', ink: '#ffffff', image: '' },
      { id: 'tiktok-shop', name: 'TikTok Shop', bg: '#010101', ink: '#ffffff', image: '' }
    ]
  };
  // BASE_* são o ponto de partida fixo (nunca mutado); admin pode editar nome/foto (patch em
  // overrides.channels), duplicar (vira um registro completo em overrides.customChannels) ou
  // excluir (marca deleted:true nos BASE_* — não dá pra remover do array fixo; ou remove de
  // customChannels direto, já que esses não têm base nenhuma). Ver visibleMarketplaces/
  // visibleInstitucionais logo depois da seção de persistência.
  const BASE_MARKETPLACES = MARKETPLACES_BY_BRAND[brandKey] || [];

  // Canais institucionais (sites/portais próprios da VONDER, não marketplaces de terceiros) — mesmo
  // padrão de card/modal/cadeado dos marketplaces acima, só numa seção própria e sem identidade
  // visual de marca externa (usam a paleta neutra da própria VONDER), exceto o Reclame AQUI, que
  // tem cor de marca real.
  const INSTITUCIONAIS_BY_BRAND = {
    default: [
      { id: 'site-institucional', name: 'Site Institucional', bg: '#0F172A', ink: '#ffffff', image: '' },
      { id: 'b2b', name: 'B2B', bg: '#1D4ED8', ink: '#ffffff', image: '' },
      { id: 'intranet', name: 'Intranet', bg: '#047857', ink: '#ffffff', image: '' },
      { id: 'reclame-aqui', name: 'Reclame AQUI', bg: '#FFC629', ink: '#1a1a1a', image: '' }
    ]
  };
  const BASE_INSTITUCIONAIS = INSTITUCIONAIS_BY_BRAND[brandKey] || [];

  // Área de atuação dentro do marketplace — os formatos de Loja Oficial e de Ads são peças
  // diferentes (medidas, contexto de uso), então cada marketplace tem os dois conjuntos
  // separados. Igual pra todo marketplace, por isso não entra no mapa por marca acima.
  const CATEGORIES = [
    { id: 'loja-oficial', name: 'Loja Oficial', desc: 'Peças usadas na página oficial da marca dentro do marketplace.', icon: STORE_PATH },
    { id: 'ads', name: 'Ads', desc: 'Peças usadas em anúncios patrocinados dentro do marketplace.', icon: ADS_PATH }
  ];

  // ---------------------------------------------------------------- conteúdo padrão dos "formatos"
  // Cada formato (Banner principal, Logotipo...) tem uma ou duas versões: Desktop+Mobile quando o
  // arquivo muda por tela — é a mesma peça, só preparada pra dispositivos diferentes — ou uma
  // única ("Arquivo único") quando a mesma peça serve pras duas. Boas práticas são POR VERSÃO
  // (Desktop e Mobile podem ter orientações diferentes), não do formato como um todo. A ordem do
  // array é a ordem em que aparecem no dropdown e no formulário de edição — Desktop antes de Mobile.
  const JPG_PNG_WEBP = '.jpg, .png ou .webp';
  const JPG_PNG = '.jpg e/ou .png';
  const MARGENS_DESKTOP = 'No desktop, a peça tem 1920px de largura, mas a arte deve ficar concentrada nos 1180px centrais, com margens laterais de 370px pensando na aplicação dentro da página oficial. Nessas margens, use só elementos de composição — nada de texto ou informação essencial.';
  function bannerPrincipalDefault() {
    return {
      id: 'banner-principal', name: 'Banner principal',
      formats: [
        { id: 'desktop', label: 'Desktop', min: '1920x480 px', peso: '5 MB', formatos: JPG_PNG_WEBP, boasPraticas: MARGENS_DESKTOP },
        { id: 'mobile', label: 'Mobile', min: '600x338 px', peso: '5 MB', formatos: JPG_PNG_WEBP, boasPraticas: '' }
      ]
    };
  }
  function logotipoDefault() {
    return {
      id: 'logotipo', name: 'Logotipo',
      formats: [{ id: 'unico', label: 'Arquivo único (Desktop e Mobile)', min: '500x500 px', peso: '5 MB', formatos: JPG_PNG_WEBP, boasPraticas: '' }]
    };
  }
  function capaDesktopDefault() {
    return {
      id: 'capa-desktop', name: 'Capa - Imagem para desktop',
      formats: [{ id: 'unico', label: 'Arquivo único (Desktop e Mobile)', min: '1920x100 px', peso: '5 MB', formatos: JPG_PNG_WEBP, boasPraticas: '' }]
    };
  }
  function bannerSecundarioDefault() {
    return {
      id: 'banner-secundario', name: 'Banner secundário',
      formats: [
        { id: 'desktop', label: 'Desktop', min: '1180x196 px', peso: '5 MB', formatos: JPG_PNG_WEBP, boasPraticas: '' },
        { id: 'mobile', label: 'Mobile', min: '414x138 px', peso: '5 MB', formatos: JPG_PNG_WEBP, boasPraticas: '' }
      ]
    };
  }
  function adsLogoPrincipalDefault() {
    return {
      id: 'logo-principal', name: 'Logo principal',
      formats: [{ id: 'unico', label: 'Arquivo único', min: '258x192 px', peso: '1 MB', formatos: JPG_PNG, boasPraticas: '' }]
    };
  }
  function adsDisplayDefault() {
    return {
      id: 'display', name: 'Display',
      formats: [
        { id: 'retangular', label: 'Versão retangular', min: '1008x528 px', peso: '1 MB', formatos: JPG_PNG, boasPraticas: '' },
        { id: 'quadrada', label: 'Versão quadrada', min: '528x528 px', peso: '1 MB', formatos: JPG_PNG, boasPraticas: '' }
      ]
    };
  }
  // Conjunto-base por área (Loja Oficial x Ads são peças diferentes de verdade — medidas próprias
  // cada uma), igual pra todo marketplace por ora, editável (lápis) em vez de vir vazio.
  // Ordem = ordem de exibição na lista.
  function defaultFormatsFor(categoryId) {
    if (categoryId === 'ads') return [adsLogoPrincipalDefault(), adsDisplayDefault()];
    return [logotipoDefault(), capaDesktopDefault(), bannerPrincipalDefault(), bannerSecundarioDefault()];
  }
  function defaultCategoriesFor() {
    const byCategory = {};
    CATEGORIES.forEach(c => { byCategory[c.id] = defaultFormatsFor(c.id); });
    return byCategory;
  }
  // Só o Mercado Livre tem instruções levantadas até agora — os demais (inclusive os canais
  // institucionais) entram travados (cadeado no card, sem abrir modal) até alguém cadastrar as
  // medidas reais deles. Ver isChannelLocked.
  const DEFAULT_MODULES = {
    'mercado-livre': defaultCategoriesFor()
  };
  function isChannelLocked(channelId) {
    return !DEFAULT_MODULES[channelId];
  }
  function defaultsFor(marketplaceId, categoryId) {
    return ((DEFAULT_MODULES[marketplaceId] || {})[categoryId]) || [];
  }
  function isCustomModule(marketplaceId, categoryId, moduleId) {
    return !defaultsFor(marketplaceId, categoryId).some(b => b.id === moduleId);
  }
  function newModuleDraft() {
    return {
      id: 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: 'Novo formato',
      formats: [
        { id: 'desktop', label: 'Desktop', min: '', peso: '', formatos: '', boasPraticas: '' },
        { id: 'mobile', label: 'Mobile', min: '', peso: '', formatos: '', boasPraticas: '' }
      ]
    };
  }

  // ---------------------------------------------------------------- persistência (portalStore)
  // Documento único compartilhado entre marcas (mesma mecânica de conflito por versão que
  // social-goals-v1-* usa em followers-dashboard.js).
  // overrides[marketplaceId][categoryId][moduleId] guarda só as edições feitas pelo lápis nos
  // formatos padrão (DEFAULT_MODULES); formatos criados pelo botão "+" não têm base nenhuma pra
  // herdar, então ficam inteiros em overrides[marketplaceId][categoryId].custom[id] — ver
  // reloadCurrentModules/saveCustomModule.
  const STORE_KEY = 'marketplace-templates-v1';
  let storeVersion = 0;
  let fullStore = {}; // documento inteiro (todas as marcas)
  let overrides = {}; // fullStore[brandKey] — só as edições desta marca

  function moduleData(marketplaceId, categoryId, base) {
    const ov = (((overrides[marketplaceId] || {})[categoryId]) || {})[base.id];
    if (!ov) return base;
    const formats = base.formats.map(f => (ov.formats && ov.formats[f.id]) ? Object.assign({}, f, ov.formats[f.id]) : f);
    return Object.assign({}, base, { formats });
  }

  function loadOverrides() {
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.readPortalStore !== 'function') return Promise.resolve();
    return gateway.readPortalStore(STORE_KEY).then(record => {
      storeVersion = record.updated_at || 0;
      fullStore = record.v || {};
      overrides = fullStore[brandKey] || {};
    }).catch(() => {});
  }

  function saveModule(marketplaceId, categoryId, moduleId, patch) {
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.writePortalStore !== 'function') {
      return Promise.reject(new Error('A conexão segura com os dados ainda não está pronta. Tente novamente em instantes.'));
    }
    const brandOverrides = Object.assign({}, overrides);
    brandOverrides[marketplaceId] = Object.assign({}, brandOverrides[marketplaceId]);
    brandOverrides[marketplaceId][categoryId] = Object.assign({}, brandOverrides[marketplaceId][categoryId]);
    brandOverrides[marketplaceId][categoryId][moduleId] = Object.assign({}, brandOverrides[marketplaceId][categoryId][moduleId], patch);
    const nextFull = Object.assign({}, fullStore, { [brandKey]: brandOverrides });
    return gateway.writePortalStore(STORE_KEY, nextFull, storeVersion).then(result => {
      if (result.conflict) return Promise.reject(Object.assign(new Error('conflict'), { conflict: true }));
      storeVersion = result.updated_at;
      fullStore = nextFull;
      overrides = brandOverrides;
    });
  }

  function saveCustomModule(marketplaceId, categoryId, moduleId, fullModule) {
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.writePortalStore !== 'function') {
      return Promise.reject(new Error('A conexão segura com os dados ainda não está pronta. Tente novamente em instantes.'));
    }
    const brandOverrides = Object.assign({}, overrides);
    brandOverrides[marketplaceId] = Object.assign({}, brandOverrides[marketplaceId]);
    brandOverrides[marketplaceId][categoryId] = Object.assign({}, brandOverrides[marketplaceId][categoryId]);
    brandOverrides[marketplaceId][categoryId].custom = Object.assign({}, brandOverrides[marketplaceId][categoryId].custom);
    brandOverrides[marketplaceId][categoryId].custom[moduleId] = fullModule;
    const nextFull = Object.assign({}, fullStore, { [brandKey]: brandOverrides });
    return gateway.writePortalStore(STORE_KEY, nextFull, storeVersion).then(result => {
      if (result.conflict) return Promise.reject(Object.assign(new Error('conflict'), { conflict: true }));
      storeVersion = result.updated_at;
      fullStore = nextFull;
      overrides = brandOverrides;
    });
  }

  // Cards de marketplace/institucional (nome + foto), só pra admin (ver applyAdminVisibility) —
  // mesma mecânica de overrides acima, só que por canal em vez de por formato.
  // overrides.channels[id] = patch (name/image) por cima de um BASE_* existente, ou {deleted:true}
  // pra "excluir" um BASE_* (não dá pra remover de um array fixo no código).
  // overrides.customChannels[id] = registro completo (duplicado pelo admin), sem base nenhuma pra
  // herdar — excluir aqui é remover a chave de verdade, não só marcar deleted.
  function saveChannelPatch(channelId, patch) {
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.writePortalStore !== 'function') {
      return Promise.reject(new Error('A conexão segura com os dados ainda não está pronta. Tente novamente em instantes.'));
    }
    const brandOverrides = Object.assign({}, overrides);
    brandOverrides.channels = Object.assign({}, brandOverrides.channels);
    brandOverrides.channels[channelId] = Object.assign({}, brandOverrides.channels[channelId], patch);
    const nextFull = Object.assign({}, fullStore, { [brandKey]: brandOverrides });
    return gateway.writePortalStore(STORE_KEY, nextFull, storeVersion).then(result => {
      if (result.conflict) return Promise.reject(Object.assign(new Error('conflict'), { conflict: true }));
      storeVersion = result.updated_at;
      fullStore = nextFull;
      overrides = brandOverrides;
    });
  }
  function saveCustomChannel(channelId, fullRecord) {
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.writePortalStore !== 'function') {
      return Promise.reject(new Error('A conexão segura com os dados ainda não está pronta. Tente novamente em instantes.'));
    }
    const brandOverrides = Object.assign({}, overrides);
    brandOverrides.customChannels = Object.assign({}, brandOverrides.customChannels);
    brandOverrides.customChannels[channelId] = fullRecord;
    const nextFull = Object.assign({}, fullStore, { [brandKey]: brandOverrides });
    return gateway.writePortalStore(STORE_KEY, nextFull, storeVersion).then(result => {
      if (result.conflict) return Promise.reject(Object.assign(new Error('conflict'), { conflict: true }));
      storeVersion = result.updated_at;
      fullStore = nextFull;
      overrides = brandOverrides;
    });
  }
  function deleteCustomChannel(channelId) {
    const gateway = window.PortalFirebase;
    if (!gateway || typeof gateway.writePortalStore !== 'function') {
      return Promise.reject(new Error('A conexão segura com os dados ainda não está pronta. Tente novamente em instantes.'));
    }
    const brandOverrides = Object.assign({}, overrides);
    brandOverrides.customChannels = Object.assign({}, brandOverrides.customChannels);
    delete brandOverrides.customChannels[channelId];
    const nextFull = Object.assign({}, fullStore, { [brandKey]: brandOverrides });
    return gateway.writePortalStore(STORE_KEY, nextFull, storeVersion).then(result => {
      if (result.conflict) return Promise.reject(Object.assign(new Error('conflict'), { conflict: true }));
      storeVersion = result.updated_at;
      fullStore = nextFull;
      overrides = brandOverrides;
    });
  }
  function isCustomChannel(channelId) {
    return !!(overrides.customChannels && overrides.customChannels[channelId]);
  }
  function channelData(base) {
    const ov = overrides.channels && overrides.channels[base.id];
    if (!ov) return base;
    return Object.assign({}, base, {
      name: ov.name != null ? ov.name : base.name,
      image: ov.image != null ? ov.image : base.image
    });
  }
  function isChannelDeleted(channelId) {
    const ov = overrides.channels && overrides.channels[channelId];
    return !!(ov && ov.deleted);
  }
  function customChannelsFor(group) {
    return Object.values(overrides.customChannels || {}).filter(c => c.group === group);
  }
  function visibleMarketplaces() {
    return BASE_MARKETPLACES.filter(b => !isChannelDeleted(b.id)).map(channelData).concat(customChannelsFor('marketplaces'));
  }
  function visibleInstitucionais() {
    return BASE_INSTITUCIONAIS.filter(b => !isChannelDeleted(b.id)).map(channelData).concat(customChannelsFor('institucionais'));
  }
  // Lookup único usado pelo modal de formatos (card clicado pode vir de qualquer uma das duas
  // galerias, mas reaproveitam o mesmo modal — ver openModal/showCategoryView/showFormatsView).
  function allVisibleChannels() {
    return visibleMarketplaces().concat(visibleInstitucionais());
  }

  // ---------------------------------------------------------------- galeria
  // Composição do card seguindo a referência anexada: foto de capa 3:4, gradiente escuro por
  // cima pra legibilidade do texto, nome + estatística, e um botão pill semi-transparente no
  // rodapé. Sem a foto de capa ainda (image vazio em MARKETPLACES_BY_BRAND), cai num gradiente
  // com a própria cor da marca — dá pra trocar por uma foto real a qualquer momento sem mexer em
  // mais nada além do campo `image`.
  function shade(hex, amount) {
    const n = parseInt(hex.replace('#', ''), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const r = clamp(((n >> 16) & 255) + amount);
    const g = clamp(((n >> 8) & 255) + amount);
    const b = clamp((n & 255) + amount);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function cardBackground(m) {
    if (m.image) return `url('${m.image}') center/cover`;
    return `linear-gradient(155deg, ${m.bg}, ${shade(m.bg, -55)})`;
  }
  function channelStats(m) {
    let formatsCount = 0;
    CATEGORIES.forEach(c => defaultsFor(m.id, c.id).forEach(mod => { formatsCount += mod.formats.length; }));
    return `${CATEGORIES.length} áreas · ${formatsCount} formatos`;
  }
  // Canal travado: card em tons de cinza com cadeado no lugar da seta, sem clique — ainda não
  // temos as medidas reais dele pra mostrar (ver DEFAULT_MODULES/isChannelLocked). Mesma função
  // desenha tanto a galeria de Marketplaces quanto a de Institucionais — ambas reaproveitam o
  // mesmo modal de formatos (ver allVisibleChannels/openModal).
  //
  // O card virou <div role="button"> em vez de <button> pra caber o botão de reticências (só
  // admin, ver applyAdminVisibility) como filho de verdade — um <button> dentro de outro <button>
  // é HTML inválido e o navegador "recupera" fechando o de fora cedo, quebrando o clique. O div
  // replica o comportamento de botão nativo (tabindex, Enter/Espaço) só quando não está travado.
  function renderChannelGallery(rowId, emptyId, list, group, emptyMessage) {
    const row = document.getElementById(rowId);
    const empty = document.getElementById(emptyId);
    if (!list.length) {
      row.innerHTML = '';
      empty.style.display = '';
      empty.textContent = emptyMessage;
      return;
    }
    empty.style.display = 'none';
    row.innerHTML = list.map(m => {
      const locked = isChannelLocked(m.id);
      return `
      <div class="tpl-card${locked ? ' is-locked' : ''}" data-channel="${m.id}" data-channel-group="${group}"
        role="button" tabindex="${locked ? '-1' : '0'}" aria-disabled="${locked}"
        aria-label="${locked ? 'Formatos ainda não cadastrados' : 'Ver formatos de ' + escapeHtml(m.name)}"
        style="background:${cardBackground(m)}">
        <span class="tpl-card-scrim" aria-hidden="true"></span>
        <button type="button" class="tpl-card-menu-btn" data-channel-menu="${m.id}" hidden title="Mais ações" aria-label="Mais ações de ${escapeHtml(m.name)}">${svgIcon(MENU_DOTS_PATH, ACTION_ICON_SIZE)}</button>
        ${locked ? `<span class="tpl-card-lock" aria-hidden="true">${svgIcon(LOCK_PATH, 15)}</span>` : ''}
        <span class="tpl-card-body">
          <span class="tpl-card-name">${escapeHtml(m.name)}</span>
          <span class="tpl-card-stats">${locked ? 'Sem instruções cadastradas' : escapeHtml(channelStats(m))}</span>
          ${locked
          ? `<span class="tpl-card-cta">Em breve ${svgIcon(LOCK_PATH, 13)}</span>`
          : `<span class="tpl-card-cta">Ver formatos ${svgIcon(CHEVRON_RIGHT_PATH, 15)}</span>`}
        </span>
      </div>`;
    }).join('');
    row.querySelectorAll('.tpl-card:not(.is-locked)').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.channel));
      card.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        openModal(card.dataset.channel);
      });
    });
    row.querySelectorAll('.tpl-card-menu-btn').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        openChannelMenu(btn, btn.dataset.channelMenu, btn.closest('.tpl-card').dataset.channelGroup);
      });
    });
    applyAdminVisibility();
  }
  function renderGalleries() {
    renderChannelGallery('tplInstGalleryRow', 'tplInstGalleryEmpty', visibleInstitucionais(), 'institucionais', 'Nenhum canal institucional configurado para esta marca ainda.');
    renderChannelGallery('tplGalleryRow', 'tplGalleryEmpty', visibleMarketplaces(), 'marketplaces', 'Nenhum marketplace configurado para esta marca ainda.');
  }

  // ---------------------------------------------------------------- admin: editar/duplicar/excluir card
  // "... " só aparece pra quem está logado como admin (ver auth-guard.js, que grava o papel em
  // document.body.dataset.userRole depois que a sessão resolve — como é um script módulo, pode
  // resolver depois deste script clássico, daí o polling, mesmo padrão que a badge de notificação
  // usa em portal-shell.js).
  let isAdmin = false;
  function applyAdminVisibility() {
    document.querySelectorAll('.tpl-card-menu-btn').forEach(btn => { btn.hidden = !isAdmin; });
  }
  function checkAdminRole(attempt) {
    if (document.body.dataset.authenticated !== 'true') {
      if ((attempt || 0) < 50) window.setTimeout(() => checkAdminRole((attempt || 0) + 1), 200);
      return;
    }
    isAdmin = document.body.dataset.userRole === 'admin';
    applyAdminVisibility();
  }

  // Menu flutuante "Editar / Duplicar / Excluir" — mesmo componente (.portal-brand-popover /
  // .portal-account-menu) e mecânica de posicionamento/fechamento (fixed sob o botão, fecha ao
  // clicar fora/rolar/redimensionar) do menu "Mais ações" de admin-users.js.
  let channelMenuEl = null;
  function closeChannelMenu() {
    if (!channelMenuEl) return;
    channelMenuEl.remove();
    channelMenuEl = null;
    document.removeEventListener('mousedown', onDocClickCloseChannelMenu);
    window.removeEventListener('scroll', closeChannelMenu, true);
    window.removeEventListener('resize', closeChannelMenu);
  }
  function onDocClickCloseChannelMenu(ev) {
    if (channelMenuEl && !channelMenuEl.contains(ev.target) && !ev.target.closest('[data-channel-menu]')) closeChannelMenu();
  }
  function openChannelMenu(anchor, channelId, group) {
    const reopening = channelMenuEl && channelMenuEl.dataset.forChannel === channelId;
    closeChannelMenu();
    if (reopening) return;
    channelMenuEl = document.createElement('div');
    channelMenuEl.className = 'portal-brand-popover portal-account-menu';
    channelMenuEl.dataset.forChannel = channelId;
    channelMenuEl.innerHTML = `
      <button type="button" class="portal-account-menu-item" data-channel-action="edit">${svgIcon(PENCIL_PATH, ACTION_ICON_SIZE)}<span>Editar</span></button>
      <button type="button" class="portal-account-menu-item" data-channel-action="duplicate">${svgIcon(COPY_PATH, ACTION_ICON_SIZE)}<span>Duplicar</span></button>
      <div class="portal-account-menu-divider"></div>
      <button type="button" class="portal-account-menu-item danger" data-channel-action="delete">${svgIcon(TRASH_PATH, ACTION_ICON_SIZE)}<span>Excluir</span></button>
    `;
    document.body.appendChild(channelMenuEl);
    const r = anchor.getBoundingClientRect();
    channelMenuEl.style.position = 'fixed';
    channelMenuEl.style.top = (r.bottom + 6) + 'px';
    channelMenuEl.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    channelMenuEl.querySelector('[data-channel-action="edit"]').addEventListener('click', () => { closeChannelMenu(); openChannelEditModal(channelId, group); });
    channelMenuEl.querySelector('[data-channel-action="duplicate"]').addEventListener('click', () => { closeChannelMenu(); openChannelConfirm('duplicate', channelId, group); });
    channelMenuEl.querySelector('[data-channel-action="delete"]').addEventListener('click', () => { closeChannelMenu(); openChannelConfirm('delete', channelId, group); });
    document.addEventListener('mousedown', onDocClickCloseChannelMenu);
    window.addEventListener('scroll', closeChannelMenu, true);
    window.addEventListener('resize', closeChannelMenu);
  }
  function findChannelInGroup(channelId, group) {
    const list = group === 'marketplaces' ? visibleMarketplaces() : visibleInstitucionais();
    return list.find(c => c.id === channelId) || null;
  }

  // ---------------------------------------------------------------- admin: modal de editar (nome + foto)
  function readChannelPhoto(file, cb) {
    if (!/^image\//.test(file.type)) { alert('Envie um arquivo de imagem.'); return; }
    if (file.size > 6 * 1024 * 1024) { alert('Imagem muito grande (máx. 6MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // recorta pro mesmo 3:4 do card (cover, sem distorcer) antes de comprimir — assim a foto
        // usada em cardBackground já chega pronta pro enquadramento, sem depender do CSS pra cortar.
        const targetRatio = 3 / 4;
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) { sw = img.height * targetRatio; sx = (img.width - sw) / 2; }
        else { sh = img.width / targetRatio; sy = (img.height - sh) / 2; }
        const outW = 480, outH = Math.round(outW / targetRatio);
        const canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        cb(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }
  function setChannelPhotoPreview(image) {
    const preview = document.getElementById('tplChannelEditPhotoPreview');
    preview.innerHTML = image ? `<img src="${image}" alt="" />` : svgIcon(IMAGE_PATH, 22);
    preview.dataset.image = image || '';
  }
  let editingChannel = null;
  function openChannelEditModal(channelId, group) {
    const ch = findChannelInGroup(channelId, group);
    if (!ch) return;
    editingChannel = { id: channelId, group, isCustom: isCustomChannel(channelId), base: ch };
    document.getElementById('tplChannelEditTitle').textContent = 'Editar ' + ch.name;
    document.getElementById('tplChannelEditName').value = ch.name;
    setChannelPhotoPreview(ch.image);
    document.getElementById('tplChannelEditBackdrop').style.display = 'flex';
    document.getElementById('tplChannelEditName').focus();
  }
  function closeChannelEditModal() {
    document.getElementById('tplChannelEditBackdrop').style.display = 'none';
    editingChannel = null;
  }
  document.getElementById('tplChannelEditPhotoInput').addEventListener('change', ev => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    readChannelPhoto(file, dataUrl => setChannelPhotoPreview(dataUrl));
  });
  document.getElementById('tplChannelEditForm').addEventListener('submit', ev => {
    ev.preventDefault();
    if (!editingChannel) return;
    const name = document.getElementById('tplChannelEditName').value.trim();
    if (!name) return;
    const image = document.getElementById('tplChannelEditPhotoPreview').dataset.image || '';
    const saveBtn = ev.target.querySelector('[type=submit]');
    saveBtn.disabled = true;
    const { id, isCustom, base } = editingChannel;
    const request = isCustom
      ? saveCustomChannel(id, Object.assign({}, base, { name, image }))
      : saveChannelPatch(id, { name, image });
    request.then(() => {
      closeChannelEditModal();
      renderGalleries();
    }).catch(err => {
      saveBtn.disabled = false;
      if (err && err.conflict) {
        alert('Alguém salvou outra edição antes de você. Recarregando os valores mais recentes.');
        loadOverrides().then(renderGalleries);
      } else {
        alert((err && err.message) || 'Não foi possível salvar. Tente novamente.');
      }
    });
  });
  document.getElementById('tplChannelEditCancel').addEventListener('click', closeChannelEditModal);
  document.getElementById('tplChannelEditClose').addEventListener('click', closeChannelEditModal);
  document.getElementById('tplChannelEditBackdrop').addEventListener('click', ev => { if (ev.target.id === 'tplChannelEditBackdrop') closeChannelEditModal(); });

  // ---------------------------------------------------------------- admin: confirmação (duplicar/excluir)
  let pendingChannelAction = null;
  function openChannelConfirm(action, channelId, group) {
    const ch = findChannelInGroup(channelId, group);
    if (!ch) return;
    pendingChannelAction = { action, id: channelId, group, ch };
    const isDelete = action === 'delete';
    document.getElementById('tplChannelConfirmTitle').textContent = isDelete ? 'Excluir card?' : 'Duplicar card?';
    document.getElementById('tplChannelConfirmMessage').textContent = isDelete
      ? `"${ch.name}" será removido desta lista. Essa ação não pode ser desfeita.`
      : `Será criada uma cópia de "${ch.name}" com o mesmo nome e foto — fica pendente (com cadeado) até alguém cadastrar os formatos dela.`;
    const okBtn = document.getElementById('tplChannelConfirmOk');
    okBtn.textContent = isDelete ? 'Excluir' : 'Duplicar';
    okBtn.classList.toggle('ghost', isDelete);
    okBtn.classList.toggle('danger', isDelete);
    document.getElementById('tplChannelConfirmBackdrop').style.display = 'flex';
  }
  function closeChannelConfirm() {
    document.getElementById('tplChannelConfirmBackdrop').style.display = 'none';
    pendingChannelAction = null;
  }
  function performChannelDuplicate(id, group, ch) {
    const newId = 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return saveCustomChannel(newId, { id: newId, name: ch.name + ' (cópia)', image: ch.image || '', bg: ch.bg, ink: ch.ink, group });
  }
  function performChannelDelete(id) {
    return isCustomChannel(id) ? deleteCustomChannel(id) : saveChannelPatch(id, { deleted: true });
  }
  document.getElementById('tplChannelConfirmOk').addEventListener('click', () => {
    if (!pendingChannelAction) return;
    const { action, id, group, ch } = pendingChannelAction;
    const okBtn = document.getElementById('tplChannelConfirmOk');
    okBtn.disabled = true;
    const request = action === 'duplicate' ? performChannelDuplicate(id, group, ch) : performChannelDelete(id);
    request.then(() => {
      okBtn.disabled = false;
      closeChannelConfirm();
      renderGalleries();
    }).catch(err => {
      okBtn.disabled = false;
      if (err && err.conflict) {
        alert('Alguém salvou outra edição antes de você. Recarregando os valores mais recentes.');
        closeChannelConfirm();
        loadOverrides().then(renderGalleries);
      } else {
        alert((err && err.message) || 'Não foi possível concluir. Tente novamente.');
      }
    });
  });
  document.getElementById('tplChannelConfirmCancel').addEventListener('click', closeChannelConfirm);
  document.getElementById('tplChannelConfirmClose').addEventListener('click', closeChannelConfirm);
  document.getElementById('tplChannelConfirmBackdrop').addEventListener('click', ev => { if (ev.target.id === 'tplChannelConfirmBackdrop') closeChannelConfirm(); });

  // ---------------------------------------------------------------- forma em escala real
  // A pré-visualização de cada versão é desenhada na proporção EXATA do tamanho mínimo daquela
  // versão — mas "caber sozinha na própria coluna" (contain isolado) engana: um banner 1920×480
  // (bem largo, então baixo dentro da coluna) e um logotipo 500×500 (quadrado, então alto dentro
  // da MESMA coluna) acabavam desenhados em escalas diferentes um do outro — o menor parecia
  // maior. A largura de cada versão aqui é uma fração da LARGURA do maior formato de TODA A
  // LISTA aberta no momento (não só das versões do mesmo formato — ver currentListMaxWidth), pra
  // um bloco não parecer maior ou menor que os vizinhos por acaso da altura disponível; quem tem
  // a largura mínima maior desenha maior. O resto (altura) vem do viewBox/preserveAspectRatio,
  // que garante que a proporção real da versão nunca é distorcida.
  function parseMin(minStr) {
    const m = /(\d+)\s*[x×]\s*(\d+)/i.exec(minStr || '');
    return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1, h: 1 };
  }
  function shapeBoxSvg(minStr, groupMaxWidth) {
    const { w, h } = parseMin(minStr);
    const widthPct = groupMaxWidth ? Math.max(10, Math.round((w / groupMaxWidth) * 100)) : 100;
    return `<svg class="tpl-shape-box" style="width:${widthPct}%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x="0" y="0" width="${w}" height="${h}" rx="${Math.max(2, Math.min(w, h) * .03)}" /></svg>`;
  }

  // ---------------------------------------------------------------- estado do modal
  let currentChannelId = null;
  let currentCategoryId = null;
  let currentModules = []; // formatos da área (padrão + criados), já com overrides aplicados
  let selectedModuleId = null;

  function reloadCurrentModules() {
    const catOverrides = ((overrides[currentChannelId] || {})[currentCategoryId]) || {};
    const defaults = defaultsFor(currentChannelId, currentCategoryId).map(base => moduleData(currentChannelId, currentCategoryId, base));
    const custom = Object.values(catOverrides.custom || {});
    currentModules = defaults.concat(custom);
  }
  function currentModule() { return currentModules.find(m => m.id === selectedModuleId) || null; }

  // ---------------------------------------------------------------- lista de formatos (dropdowns)
  function copyFormatText(m, f) {
    let text = `${m.name} — ${f.label}\nTamanho mínimo: ${f.min}\nPeso máximo: ${f.peso}\nArquivo: ${f.formatos}`;
    if (f.boasPraticas) text += `\nBoas práticas: ${f.boasPraticas}`;
    return text;
  }
  function copyToClipboard(text, btn) {
    const original = btn.innerHTML;
    const done = () => {
      btn.innerHTML = svgIcon(CHECK_PATH, ACTION_ICON_SIZE);
      btn.classList.add('is-copied');
      window.setTimeout(() => { btn.innerHTML = original; btn.classList.remove('is-copied'); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* clipboard indisponível */ }
    document.body.removeChild(ta);
  }

  // Cada versão (Desktop/Mobile/Arquivo único) vira um bloco de duas colunas do mesmo tamanho:
  // a pré-visualização na proporção real à esquerda, e tamanho mínimo + peso + arquivo + boas
  // práticas daquela versão à direita — boas práticas é por versão porque Desktop e Mobile podem
  // pedir orientações diferentes.
  function formatBlockHtml(f, groupMaxWidth) {
    return `
      <div class="tpl-format-block" data-format-id="${f.id}">
        <div class="tpl-format-block-head">
          <h4 class="tpl-spec-title">${escapeHtml(f.label)}</h4>
          <button type="button" class="btn-icon tpl-copy-btn" data-copy-format="${f.id}" title="Copiar informações" aria-label="Copiar informações de ${escapeHtml(f.label)}">${svgIcon(COPY_PATH, ACTION_ICON_SIZE)}</button>
        </div>
        <div class="tpl-format-grid">
          <div class="tpl-format-preview">${shapeBoxSvg(f.min, groupMaxWidth)}</div>
          <div class="tpl-format-info">
            <ul class="tpl-spec-list">
              <li>Tamanho mínimo: <b>${escapeHtml(f.min)}</b></li>
              <li>Peso máximo: <b>${escapeHtml(f.peso)}</b></li>
              <li>Arquivo: <b>${escapeHtml(f.formatos)}</b></li>
            </ul>
            ${f.boasPraticas ? `<div class="tpl-practices"><h5 class="tpl-spec-title">Boas práticas</h5><p>${escapeHtml(f.boasPraticas)}</p></div>` : ''}
          </div>
        </div>
      </div>`;
  }

  // Largura mínima real (não a maior entre largura/altura — a real DIMENSÃO DE LARGURA, já que
  // todas as versões cadastradas são paisagem ou quadradas) do maior formato de TODA a lista
  // aberta no momento — referência de escala única compartilhada por todos os blocos, pra um
  // formato pequeno (ex.: Logotipo) nunca desenhar maior que um formato grande (ex.: Banner
  // principal) só porque calhou de ter menos texto ao lado e uma coluna mais baixa.
  function currentListMaxWidth() {
    return Math.max(1, ...currentModules.flatMap(m => m.formats.map(f => parseMin(f.min).w)));
  }
  function moduleFormatsHtml(m, groupMaxWidth) {
    return m.formats.map(f => formatBlockHtml(f, groupMaxWidth)).join('');
  }

  function moduleAccordionHtml(m, groupMaxWidth) {
    const open = selectedModuleId === m.id;
    return `
      <div class="tpl-module" data-module-id="${m.id}">
        <div class="tpl-module-head-row">
          <button type="button" class="tpl-module-toggle" aria-expanded="${open}">
            <span class="tpl-module-chevron">${svgIcon(CHEVRON_PATH, 14)}</span>
            <span class="tpl-module-name">${escapeHtml(m.name)}</span>
          </button>
          <button type="button" class="btn-icon" data-edit-module title="Editar informações" aria-label="Editar informações de ${escapeHtml(m.name)}">${svgIcon(PENCIL_PATH, ACTION_ICON_SIZE)}</button>
        </div>
        <div class="tpl-module-panel" style="height:${open ? 'auto' : '0'}">
          <div class="tpl-module-panel-inner">${open ? moduleFormatsHtml(m, groupMaxWidth) : ''}</div>
        </div>
      </div>`;
  }

  function wireCopyButtons(host, m) {
    host.querySelectorAll('.tpl-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = m.formats.find(x => x.id === btn.dataset.copyFormat);
        if (f) copyToClipboard(copyFormatText(m, f), btn);
      });
    });
  }

  function renderModuleList() {
    const wrap = document.getElementById('tplModuleList');
    if (!currentModules.length) {
      wrap.innerHTML = '<p class="bg-section-desc">Nenhum formato cadastrado para esta área ainda.</p>';
      return;
    }
    const groupMaxWidth = currentListMaxWidth();
    wrap.innerHTML = currentModules.map(m => moduleAccordionHtml(m, groupMaxWidth)).join('');
    currentModules.forEach(m => {
      const host = wrap.querySelector(`.tpl-module[data-module-id="${m.id}"]`);
      host.querySelector('.tpl-module-toggle').addEventListener('click', () => toggleModule(m.id));
      host.querySelector('[data-edit-module]').addEventListener('click', () => enterEditMode(m.id));
      wireCopyButtons(host, m);
    });
  }

  // Abre/fecha sem reconstruir a lista inteira — só anima a altura do painel (ver
  // openPanel/closePanel) e preenche o conteúdo do formato que está abrindo. Reconstruir tudo a
  // cada clique (como antes) recriava os nós na hora do clique, então não havia "de" pra "para"
  // pro CSS animar — os nós dos outros formatos agora sobrevivem ao toggle.
  //
  // A altura é medida em pixels (scrollHeight) em vez de usar só CSS (ex.: grid-template-rows
  // 0fr/1fr) porque o painel tem conteúdo com min-height próprio (a caixa de pré-visualização) —
  // esse mínimo contamina o cálculo automático do CSS e o painel nunca chegava a 0 de verdade,
  // deixando uma sobra visível do formato fechado por baixo do próximo. Medir em pixel não tem
  // essa ambiguidade.
  // "from" é medido ANTES de qualquer troca de conteúdo (quem chama garante isso) — se
  // medíssemos depois de já ter reescrito o innerHTML (ex.: ao cancelar uma edição, voltando pro
  // modo leitura, mais curto), a caixa já teria pulado pro tamanho novo instantaneamente e não
  // haveria "de" nenhum pra animar, só um "para".
  function openPanelFrom(panel, from) {
    const target = panel.scrollHeight;
    panel.style.height = from + 'px';
    panel.getBoundingClientRect(); // força o reflow antes de mudar pro valor final, senão não anima
    panel.style.height = target + 'px';
    panel.addEventListener('transitionend', function onEnd(ev) {
      if (ev.target !== panel || ev.propertyName !== 'height') return;
      panel.style.height = 'auto';
      panel.removeEventListener('transitionend', onEnd);
    });
  }
  function closePanel(panel) {
    panel.style.height = panel.getBoundingClientRect().height + 'px';
    panel.getBoundingClientRect(); // reflow
    panel.style.height = '0px';
  }
  function currentPanelHeight(panel) {
    return panel.style.height === 'auto' || !panel.style.height
      ? panel.getBoundingClientRect().height
      : parseFloat(panel.style.height) || 0;
  }

  function toggleModule(id) {
    setOpenModule(selectedModuleId === id ? null : id);
  }
  function setOpenModule(id) {
    const previousId = selectedModuleId;
    selectedModuleId = id;
    const wrap = document.getElementById('tplModuleList');
    const groupMaxWidth = currentListMaxWidth();
    currentModules.forEach(m => {
      const host = wrap.querySelector(`.tpl-module[data-module-id="${m.id}"]`);
      if (!host) return;
      const isOpen = m.id === id;
      host.querySelector('.tpl-module-toggle').setAttribute('aria-expanded', String(isOpen));
      const panel = host.querySelector('.tpl-module-panel');
      if (isOpen) {
        const from = currentPanelHeight(panel);
        panel.querySelector('.tpl-module-panel-inner').innerHTML = moduleFormatsHtml(m, groupMaxWidth);
        wireCopyButtons(host, m);
        openPanelFrom(panel, from);
      } else if (m.id === previousId) {
        closePanel(panel);
      }
    });
  }

  // ---------------------------------------------------------------- edição
  // showModuleName só aparece pra formatos criados pelo botão "+" (sem nome fixo em
  // DEFAULT_MODULES) — os formatos padrão (Banner principal etc.) mantêm o nome fixo.
  function editFormHtml(m, showModuleName) {
    return `
      <form class="tpl-edit-form">
        ${showModuleName ? `<div class="form-group"><label>Nome do formato<input type="text" name="moduleName" value="${escapeHtml(m.name)}" required /></label></div>` : ''}
        ${m.formats.map(f => `
          <div class="form-group">
            <label>Nome da versão<input type="text" name="label__${f.id}" value="${escapeHtml(f.label)}" required /></label>
            <label>Tamanho mínimo<input type="text" name="min__${f.id}" value="${escapeHtml(f.min)}" required /></label>
            <label>Peso máximo<input type="text" name="peso__${f.id}" value="${escapeHtml(f.peso)}" required /></label>
            <label>Arquivo<input type="text" name="formatos__${f.id}" value="${escapeHtml(f.formatos)}" required /></label>
            <label>Boas práticas<textarea name="boasPraticas__${f.id}" rows="3">${escapeHtml(f.boasPraticas || '')}</textarea></label>
          </div>`).join('')}
        <div class="tpl-edit-actions">
          <button type="button" class="btn ghost" data-cancel-edit>Cancelar</button>
          <button type="submit" class="btn">Salvar</button>
        </div>
      </form>`;
  }

  // justCreated: se Cancelar for clicado antes do primeiro Salvar, o rascunho criado pelo botão
  // "+" some da lista em vez de ficar como uma linha vazia.
  function wireEditForm(panel, m, isCustom, justCreated) {
    panel.querySelector('[data-cancel-edit]').addEventListener('click', () => {
      if (justCreated) {
        currentModules = currentModules.filter(x => x.id !== m.id);
        selectedModuleId = null;
        renderModuleList();
      } else {
        setOpenModule(m.id);
      }
    });
    panel.querySelector('form').addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const formats = m.formats.map(f => ({
        id: f.id,
        label: fd.get('label__' + f.id).trim(),
        min: fd.get('min__' + f.id).trim(),
        peso: fd.get('peso__' + f.id).trim(),
        formatos: fd.get('formatos__' + f.id).trim(),
        boasPraticas: fd.get('boasPraticas__' + f.id).trim()
      }));
      const saveBtn = ev.target.querySelector('[type=submit]');
      saveBtn.disabled = true;

      const afterSave = () => {
        reloadCurrentModules();
        selectedModuleId = m.id;
        renderModuleList();
      };
      const onConflict = () => {
        alert('Alguém salvou outra edição antes de você. Recarregando os valores mais recentes.');
        loadOverrides().then(() => {
          reloadCurrentModules();
          renderModuleList();
        });
      };
      const onError = err => {
        saveBtn.disabled = false;
        alert((err && err.message) || 'Não foi possível salvar. Tente novamente.');
      };

      const request = isCustom
        ? saveCustomModule(currentChannelId, currentCategoryId, m.id, { name: fd.get('moduleName').trim() || 'Novo formato', formats })
        : saveModule(currentChannelId, currentCategoryId, m.id, { formats: Object.fromEntries(formats.map(f => [f.id, f])) });

      request.then(afterSave).catch(err => { if (err && err.conflict) onConflict(); else onError(err); });
    });
  }

  function enterEditMode(moduleId) {
    const m = currentModules.find(x => x.id === moduleId);
    if (!m) return;
    const isCustom = isCustomModule(currentChannelId, currentCategoryId, moduleId);
    setOpenModule(moduleId);
    const outer = document.querySelector(`#tplModuleList .tpl-module[data-module-id="${moduleId}"] .tpl-module-panel`);
    const inner = outer.querySelector('.tpl-module-panel-inner');
    inner.innerHTML = editFormHtml(m, isCustom);
    outer.style.height = 'auto'; // o formulário tem altura diferente da leitura — não vale a pena animar essa troca
    wireEditForm(inner, m, isCustom, false);
  }

  function addNewModule() {
    if (!currentChannelId || !currentCategoryId) return;
    const draft = newModuleDraft();
    currentModules.push(draft);
    selectedModuleId = draft.id;
    renderModuleList();
    const outer = document.querySelector(`#tplModuleList .tpl-module[data-module-id="${draft.id}"] .tpl-module-panel`);
    const inner = outer.querySelector('.tpl-module-panel-inner');
    inner.innerHTML = editFormHtml(draft, true);
    wireEditForm(inner, draft, true, true);
    const firstField = inner.querySelector('input[name="moduleName"]');
    if (firstField) firstField.focus();
  }

  // ---------------------------------------------------------------- categorias (Loja Oficial / Ads)
  function renderCategoryGrid() {
    const grid = document.getElementById('tplCategoryGrid');
    grid.innerHTML = CATEGORIES.map(c => `
      <button type="button" class="tpl-category-card" data-category="${c.id}">
        <span class="tpl-category-icon">${svgIcon(c.icon, 22)}</span>
        <span class="tpl-category-name">${escapeHtml(c.name)}</span>
        <span class="tpl-category-desc">${escapeHtml(c.desc)}</span>
      </button>
    `).join('');
    grid.querySelectorAll('.tpl-category-card').forEach(btn => {
      btn.addEventListener('click', () => openCategory(btn.dataset.category));
    });
  }

  function showCategoryView() {
    document.getElementById('tplCategoryView').style.display = '';
    document.getElementById('tplFormatsView').style.display = 'none';
    document.getElementById('tplBackBtn').style.display = 'none';
    document.getElementById('tplAddModuleBtn').style.display = 'none';
    const mk = allVisibleChannels().find(m => m.id === currentChannelId);
    document.getElementById('tplModalTitle').textContent = mk ? mk.name : '';
  }
  function showFormatsView() {
    document.getElementById('tplCategoryView').style.display = 'none';
    document.getElementById('tplFormatsView').style.display = '';
    document.getElementById('tplBackBtn').style.display = '';
    document.getElementById('tplAddModuleBtn').style.display = '';
    const mk = allVisibleChannels().find(m => m.id === currentChannelId);
    const cat = CATEGORIES.find(c => c.id === currentCategoryId);
    document.getElementById('tplModalTitle').textContent = `${mk ? mk.name : ''} · ${cat ? cat.name : ''}`;
  }

  function openCategory(categoryId) {
    currentCategoryId = categoryId;
    reloadCurrentModules();
    selectedModuleId = currentModules.length ? currentModules[0].id : null;
    showFormatsView();
    renderModuleList();
  }

  // ---------------------------------------------------------------- modal
  const modalBackdrop = document.getElementById('tplModalBackdrop');
  let modalLastFocus = null;

  function openModal(channelId) {
    const mk = allVisibleChannels().find(m => m.id === channelId);
    if (!mk || isChannelLocked(channelId)) return;
    modalLastFocus = document.activeElement;
    const logo = document.getElementById('tplModalLogo');
    logo.textContent = mk.name.slice(0, 2).toUpperCase();
    logo.style.background = mk.bg;
    logo.style.color = mk.ink;
    // --tpl-modal-ink é a cor de texto/ícone do cabeçalho inteiro (título, Voltar, fechar,
    // adicionar) — ver comentário de .tpl-modal .modal-header em templates.html pra saber por quê.
    const header = document.getElementById('tplModalHeader');
    header.style.setProperty('--tpl-modal-accent', mk.bg);
    header.style.setProperty('--tpl-modal-ink', mk.ink);

    currentChannelId = channelId;
    currentCategoryId = null;
    renderCategoryGrid();
    showCategoryView();

    modalBackdrop.style.display = 'flex';
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.getElementById('tplModalClose').focus();
  }
  function closeModal() {
    modalBackdrop.style.display = 'none';
    modalBackdrop.setAttribute('aria-hidden', 'true');
    if (modalLastFocus) modalLastFocus.focus();
  }
  modalBackdrop.addEventListener('click', ev => { if (ev.target === modalBackdrop) closeModal(); });
  document.getElementById('tplModalClose').addEventListener('click', closeModal);
  document.getElementById('tplAddModuleBtn').addEventListener('click', addNewModule);
  document.getElementById('tplBackBtn').addEventListener('click', () => { currentCategoryId = null; showCategoryView(); });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (modalBackdrop.style.display === 'flex') closeModal();
    else if (document.getElementById('tplChannelEditBackdrop').style.display === 'flex') closeChannelEditModal();
    else if (document.getElementById('tplChannelConfirmBackdrop').style.display === 'flex') closeChannelConfirm();
  });

  // ---------------------------------------------------------------- init
  renderGalleries();
  checkAdminRole();
  // templates.js é script clássico (sem defer) e sempre executa antes de auth-guard.js (type=module,
  // só roda após o parsing do HTML terminar) importar firebase-client.js — chamar loadOverrides()
  // direto aqui sempre encontrava window.PortalFirebase indefinido, e a função desistia sem erro
  // (ver guarda no início dela), deixando overrides/fullStore vazios a sessão inteira: toda foto de
  // capa salva no editar do card sumia no próximo carregamento, e cada salvamento passava a reescrever
  // o documento inteiro (todas as marcas) a partir de {} em vez de por cima do que já existia. Mesmo
  // padrão de espera por 'portal-firebase-ready' já usado em intelligence-center.js.
  const startLoadingOverrides = () => loadOverrides().then(renderGalleries);
  if (window.PortalFirebase) startLoadingOverrides();
  else window.addEventListener('portal-firebase-ready', startLoadingOverrides, { once: true });
})();
