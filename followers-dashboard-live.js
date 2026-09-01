(() => {
  'use strict';

  const source = 'data/social-followers.json';
  const activeBrand = window.PortalBrand && (window.PortalBrand.list || []).find(item => item.id === window.PortalBrand.activeId);
  const brandId = (activeBrand && activeBrand.id) || 'default';
  if (brandId !== 'default') return;

  const storageKey = 'social_followers_' + brandId;
  // rótulo no mesmo formato da série ('ago/26'); Intl em pt-BR devolve "ago. de 26" e não casa
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const monthLabel = isoDate => {
    const date = new Date(isoDate + 'T12:00:00Z');
    return `${MONTHS[date.getUTCMonth()]}/${String(date.getUTCFullYear()).slice(-2)}`;
  };

  fetch(source + '?v=' + Date.now(), { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(remote => {
      if (!remote || !Array.isArray(remote.history) || !remote.history.length) return;
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const rows = JSON.parse(raw);
      if (!Array.isArray(rows) || !rows.length) return;
      let changed = false;
      remote.history.forEach(entry => {
        const followers = Number(entry && entry.followers && entry.followers.Instagram);
        if (!entry || !entry.date || !Number.isFinite(followers)) return;
        const label = monthLabel(entry.date);
        let row = rows.find(item => item[0] === label);
        if (!row) {
          row = rows.at(-1).slice();
          row[0] = label;
          rows.push(row);
        }
        if (Number(row[1]) !== followers) {
          row[1] = followers;
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(storageKey, JSON.stringify(rows));
        location.reload();
      }
    })
    .catch(() => { /* Sem snapshot publicado: mantém o último dado local. */ });
})();
