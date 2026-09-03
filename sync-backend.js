// Camada única de sincronização. O Firestore avalia permissões no servidor Firebase.
(function(global){
  'use strict';
  async function gateway(){
    if(global.PortalFirebase) return global.PortalFirebase;
    await new Promise(resolve => global.addEventListener('portal-firebase-ready', resolve, { once:true }));
    if(!global.PortalFirebase) throw new Error('Autenticação Firebase indisponível.');
    return global.PortalFirebase;
  }
  async function get(key){ return (await gateway()).readPortalStore(key); }
  async function put(key, value, expectedVersion){ return (await gateway()).writePortalStore(key, value, expectedVersion); }
  global.SyncBackend = { get, put };
})(window);
