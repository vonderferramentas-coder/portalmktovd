// Aplica a biblioteca de marcas (tela Marcas, em Administração) nas telas de uso: esconde os logos ocultos e acrescenta os logos enviados.
// Editor de posts: altera no lugar a lista window.OVD_BRAND_MANIFEST. Gerador de cartaz: chama BrandLibrary.overlayAssets(lista de brands/index.json).
// Sem login, sem rede ou sem biblioteca salva, nada muda (continua a lista estática do código).
// ponytail: carrega a imagem de todos os logos enviados de uma vez; se passarem de ~50, trocar por carga sob demanda.
(function (global) {
  'use strict';
  const KEY = 'brand-library-v1';
  let loading = null;

  async function gateway() {
    if (global.PortalFirebase) return global.PortalFirebase;
    await new Promise(resolve => global.addEventListener('portal-firebase-ready', resolve, { once: true }));
    return global.PortalFirebase;
  }

  function load() {
    return loading || (loading = (async () => {
      const empty = { hidden: new Set(), custom: [] };
      try {
        const api = await gateway(), record = await api.readPortalStore(KEY);
        const { hidden, custom } = global.BrandLibraryModel.visibility(record && record.v);
        global.OVD_BRAND_LOGOS = global.OVD_BRAND_LOGOS || {};
        await Promise.all(custom.map(async logo => { try { const uri = await api.readBrandLogo(logo.docId); if (uri) global.OVD_BRAND_LOGOS[logo.name] = uri; } catch (_) { /* esse logo fica de fora */ } }));
        const usable = custom.filter(logo => global.OVD_BRAND_LOGOS[logo.name]), manifest = global.OVD_BRAND_MANIFEST;
        if (Array.isArray(manifest)) {
          for (let index = manifest.length - 1; index >= 0; index--) if (hidden.has(manifest[index])) manifest.splice(index, 1);
          usable.forEach(logo => { if (!manifest.includes(logo.name)) manifest.push(logo.name); });
        }
        return { hidden, custom: usable };
      } catch (_) { return empty; }
    })());
  }

  async function overlayAssets(assets) {
    const library = await load();
    return assets.filter(asset => !library.hidden.has(asset.name)).concat(library.custom.filter(logo => !assets.some(asset => asset.name === logo.name)).map(logo => ({ name: logo.name, file: logo.name + '.svg' })));
  }

  global.BrandLibrary = { load, overlayAssets };
  load();
})(window);
