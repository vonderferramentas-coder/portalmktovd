/* Coleta mínima de entregas concluídas. Este arquivo não observa navegação, cliques genéricos
 * nem tempo de tela; os próprios fluxos de exportação/salvamento o chamam após o sucesso. */
(function () {
  const prefix = 'portal_usage_v1:';
  function activeBrand() { return (window.PortalBrand && window.PortalBrand.activeId) || ''; }
  function once(key) {
    try { if (sessionStorage.getItem(prefix + key)) return false; sessionStorage.setItem(prefix + key, '1'); }
    catch (_) { /* sessão privada/bloqueada: a entrega continua, só perde a deduplicação */ }
    return true;
  }
  function submit(payload) { const api = window.PortalFirebase; if (api && api.recordUsageEvent) api.recordUsageEvent(payload).catch(() => {}); }
  window.PortalUsage = { track(tool, action, options) {
    const settings = options || {}, key = settings.dedupeKey;
    if (key && !once(String(key))) return;
    submit({ tool, action, quantity: settings.quantity, brandId: settings.brandId || activeBrand() });
  } };
})();
