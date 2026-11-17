// Biblioteca de marcas de folheto/post (NÃO são os perfis do portal): agrupa os logos que já existem em
// post-editor-assets/brands-js/ em marcas e aplica os ajustes salvos em portalStore/brand-library-v1.
// Formato salvo: { brands: [{ id, name, logos: [{ name, label, custom?, docId?, hidden? }] }] }
// - logo estático (arquivo do código): `name` é o nome do arquivo; excluir = hidden:true (reversível)
// - logo enviado pela tela: custom:true, imagem em brandLogos/<docId>; excluir apaga de verdade
(function (global) {
  'use strict';

  const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Palavras que indicam só uma versão do logo (fundo, orientação, cor...). ponytail: heurística simples; quem usa corrige na tela (mover logo / renomear).
  const VARIANT = new Set(['vertical', 'horizontal', 'horiz', 'branco', 'branca', 'bco', 'slogan', 'fundo', 'escuro', 'escura', 'claro', 'pb', 'color', 'colorido', 'cor', 'preto', 'preta', 'pto', 'azul', 'vermelho', 'laranja', 'amarelo', 'negativo', 'positivo', 'fp', 'red', 'sem', 'cromado', 'logo', 'old', 'novo', 'antigo', 'b', 'c', 'box', 'eps', 'tip', 'mono', 'versoes', 'versões']);

  function tokens(name) {
    return String(name || '').split(/[_\s]+/).filter(Boolean).map(token => token.replace(/-\d+$/, '')).filter(Boolean);
  }
  // Quantos tokens do começo formam a "marca" (o resto é versão).
  function baseCount(name) {
    const list = tokens(name); let count = list.length;
    while (count > 1 && (VARIANT.has(fold(list[count - 1])) || /^\d+$/.test(list[count - 1]))) count--;
    return count;
  }
  const baseKey = name => tokens(name).slice(0, baseCount(name)).map(fold).join(' ');
  const baseDisplay = name => tokens(name).slice(0, baseCount(name)).join(' ');
  function versionLabel(name) {
    const list = tokens(name), rest = list.slice(baseCount(name)).join(' ');
    return rest || 'Principal';
  }
  const slug = value => fold(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marca';

  // Agrupa nomes de logo estáticos em marcas, em ordem alfabética.
  function autoGroup(names) {
    const groups = new Map();
    names.forEach(name => {
      const key = baseKey(name);
      if (!groups.has(key)) groups.set(key, { id: slug(key), name: baseDisplay(name), logos: [] });
      groups.get(key).logos.push({ name, label: versionLabel(name) });
    });
    const used = new Set();
    return [...groups.values()].sort((a, b) => fold(a.name).localeCompare(fold(b.name))).map(brand => {
      let id = brand.id, n = 2; while (used.has(id)) id = brand.id + '-' + n++; used.add(id); brand.id = id;
      brand.logos.sort((a, b) => (a.label === 'Principal' ? -1 : b.label === 'Principal' ? 1 : a.label.localeCompare(b.label)));
      return brand;
    });
  }

  // Junta o que foi salvo com os logos estáticos atuais: logo novo no código entra agrupado; logo que sumiu do código sai.
  function merge(saved, staticNames) {
    if (!saved || !Array.isArray(saved.brands)) return { brands: autoGroup(staticNames) };
    const present = new Set(staticNames), known = new Set();
    const brands = saved.brands.map(brand => ({ ...brand, logos: (brand.logos || []).filter(logo => logo.custom || present.has(logo.name)) }));
    brands.forEach(brand => brand.logos.forEach(logo => { if (!logo.custom) known.add(logo.name); }));
    const fresh = autoGroup(staticNames.filter(name => !known.has(name)));
    fresh.forEach(group => {
      const home = brands.find(brand => baseKey(brand.name) === fold(group.name) || brand.id === group.id);
      if (home) home.logos.push(...group.logos); else brands.push(group);
    });
    return { brands };
  }

  // O que as telas de uso (editor de posts, cartaz) precisam saber: o que esconder e o que foi enviado.
  function visibility(library) {
    const hidden = new Set(), custom = [];
    ((library && library.brands) || []).forEach(brand => (brand.logos || []).forEach(logo => {
      if (logo.custom) { if (logo.docId && logo.name) custom.push({ name: logo.name, docId: logo.docId }); } else if (logo.hidden) hidden.add(logo.name);
    }));
    return { hidden, custom };
  }

  // Nome único para um logo enviado: "<Marca>" na versão Principal, "<Marca>_<Versão>" nas demais (o editor e o cartaz procuram logo pelo nome).
  function customName(brandName, label, taken) {
    const base = String(brandName || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ');
    const version = String(label || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ');
    let name = version && fold(version) !== 'principal' ? base + '_' + version : base, candidate = name, n = 2;
    while (taken.has(fold(candidate))) candidate = name + '_' + n++;
    return candidate;
  }

  global.BrandLibraryModel = { autoGroup, merge, visibility, customName, versionLabel, baseKey, slug, fold };
})(window);
