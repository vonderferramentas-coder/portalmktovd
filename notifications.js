import { currentContext, readPortalStore, writePortalStore, subscribeNotifications, markNotificationRead } from './firebase-client.js';
const list = document.getElementById('notificationsList');
const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
function createdAt(value) { return value && value.toDate ? value.toDate().toLocaleString('pt-BR') : 'Agora'; }
const ROUTES_KEY = 'social-media-notification-routes-v1';
async function ensureOwnNotificationRoute() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const context = await currentContext();
    const record = await readPortalStore(ROUTES_KEY);
    const routes = Array.isArray(record.v) ? record.v : [];
    const current = routes.find(route => route && route.uid === context.user.uid);
    const brandIds = [...new Set(Array.isArray(context.profile.notificationBrands) ? context.profile.notificationBrands : [])];
    const shouldReceive = context.profile.status === 'active' && context.profile.role === 'social-media';
    const currentBrands = current && Array.isArray(current.brandIds) ? current.brandIds : [];
    const sameBrands = currentBrands.length === brandIds.length && brandIds.every(id => currentBrands.includes(id));
    if ((shouldReceive && current && sameBrands) || (!shouldReceive && !current)) return;
    const next = routes.filter(route => route && route.uid !== context.user.uid);
    if (shouldReceive) next.push({ uid: context.user.uid, brandIds });
    const result = await writePortalStore(ROUTES_KEY, next, record.updated_at);
    if (!result.conflict) return;
  }
}
function render(items) {
  const notifications = items.filter(item => item.kind === 'postReadyNotification').sort((a,b) => (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0));
  list.innerHTML = notifications.length ? notifications.map(item => `<button type="button" class="notification-item${item.readAt ? '' : ' unread'}" data-id="${escape(item.id)}" data-brand="${escape(item.brandId)}" data-post="${escape(item.postId)}" data-date="${escape(item.postDate)}"><span class="notification-dot" aria-hidden="true"></span><span><strong>O post ${escape(item.postTitle)} da marca ${escape(item.brandName)} está pronto para ser postado.</strong><small>${createdAt(item.createdAt)}</small></span></button>`).join('') : '<div class="notifications-empty"><strong>Nenhuma notificação por aqui.</strong><p>Quando um post das marcas que você atende ficar pronto, ele aparecerá aqui.</p></div>';
}
list.addEventListener('click', async event => { const button = event.target.closest('[data-id]'); if (!button) return; await markNotificationRead(button.dataset.id).catch(()=>{}); const params = new URLSearchParams({ brand:button.dataset.brand, post:button.dataset.post, date:button.dataset.date }); location.href = 'visual-editor.html?' + params; });
await ensureOwnNotificationRoute().catch(() => {});
subscribeNotifications(render, () => { list.innerHTML = '<p class="muted">Não foi possível carregar as notificações agora.</p>'; });
