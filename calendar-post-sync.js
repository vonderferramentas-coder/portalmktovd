(function(global){
  'use strict';

  function clone(value){
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function stableValue(value){
    if(Array.isArray(value)) return value.map(stableValue);
    if(value && typeof value === 'object'){
      return Object.keys(value).sort().reduce((result,key)=>{ result[key]=stableValue(value[key]); return result; },{});
    }
    return value;
  }

  function fingerprint(value){
    return JSON.stringify(stableValue(value));
  }

  function postsMap(posts){
    return new Map((Array.isArray(posts)?posts:[]).filter(post=>post&&post.id).map(post=>[String(post.id),clone(post)]));
  }

  async function firebaseGateway(){
    if(global.PortalFirebase) return global.PortalFirebase;
    await new Promise(resolve=>global.addEventListener('portal-firebase-ready',resolve,{once:true}));
    if(!global.PortalFirebase) throw new Error('Firebase indisponível para sincronizar o calendário.');
    return global.PortalFirebase;
  }

  function create(options){
    const startupPosts = postsMap(options.getPosts());
    const serverPosts = new Map();
    const revisions = new Map();
    const outbox = new Map();
    const deferredRemoteIds = new Set();
    let api = null;
    let ready = false;
    let running = false;
    let retryTimer = null;
    let unsubscribe = null;
    let editingId = null;
    let editingBaseRevision = 0;

    try{
      const saved = JSON.parse(localStorage.getItem(options.outboxKey)||'[]');
      (Array.isArray(saved)?saved:[]).forEach(item=>{
        if(item&&item.id) outbox.set(String(item.id),{
          post:item.post==null?null:clone(item.post),
          expectedRevision:Number(item.expectedRevision||0)
        });
      });
    }catch(_){ localStorage.removeItem(options.outboxKey); }

    function persistOutbox(){
      const value = Array.from(outbox,([id,item])=>({id,post:item.post,expectedRevision:item.expectedRevision}));
      if(value.length) localStorage.setItem(options.outboxKey,JSON.stringify(value));
      else localStorage.removeItem(options.outboxKey);
    }

    function commitLocal(map,notify){
      const posts = Array.from(map.values(),clone);
      options.applyPosts(posts);
      localStorage.setItem(options.localKey,JSON.stringify(posts));
      if(notify) options.onRemoteChange();
    }

    function localPost(id){
      return postsMap(options.getPosts()).get(String(id))||null;
    }

    function setServerResult(id,post,revision){
      id=String(id);
      if(post==null){ serverPosts.delete(id); revisions.delete(id); }
      else { serverPosts.set(id,clone(post)); revisions.set(id,Number(revision||0)); }
    }

    function applyServerPost(id,notify){
      const local = postsMap(options.getPosts());
      if(serverPosts.has(id)) local.set(id,clone(serverPosts.get(id)));
      else local.delete(id);
      commitLocal(local,notify);
    }

    function markChangesAgainst(baseline,useKnownRevisions){
      const local = postsMap(options.getPosts());
      const ids = new Set([...baseline.keys(),...local.keys()]);
      ids.forEach(id=>{
        const desired = local.get(id)||null;
        const base = baseline.get(id)||null;
        if(fingerprint(desired)===fingerprint(base)){
          outbox.delete(id);
          return;
        }
        const existing = outbox.get(id);
        const expectedRevision = existing ? existing.expectedRevision
          : (editingId===id ? editingBaseRevision : (useKnownRevisions ? Number(revisions.get(id)||0) : 0));
        outbox.set(id,{post:clone(desired),expectedRevision});
      });
      persistOutbox();
    }

    function schedule(delay){
      clearTimeout(retryTimer);
      retryTimer=setTimeout(reconcile,delay==null?0:delay);
    }

    function save(){
      localStorage.setItem(options.localKey,JSON.stringify(options.getPosts()));
      markChangesAgainst(ready?serverPosts:startupPosts,ready);
      if(ready) schedule(0);
    }

    async function reconcile(){
      if(!ready||running||!api||outbox.size===0) return;
      running=true;
      options.onStatus('Salvando no servidor…');
      let failed=false;
      const entries=Array.from(outbox.entries());
      await Promise.all(entries.map(async ([id,item])=>{
        try{
          const desired=clone(item.post);
          const notification=desired&&options.getReadyNotificationRecipients ? await options.getReadyNotificationRecipients(desired) : null;
          const result=desired==null
            ? await api.deletePost(options.storeKey,id,item.expectedRevision)
            : await api.writePost(options.storeKey,desired,item.expectedRevision,notification);
          const currentEntry=outbox.get(id);
          if(!currentEntry) return;
          if(result.conflict){
            const server=result.server||{post:null,revision:0};
            setServerResult(id,server.post,server.revision);
            outbox.delete(id);
            deferredRemoteIds.delete(id);
            applyServerPost(id,true);
            options.onConflict(id,desired,server.post);
            return;
          }
          setServerResult(id,desired,result.revision);
          const current=localPost(id);
          if(fingerprint(current)===fingerprint(desired)) outbox.delete(id);
          else outbox.set(id,{post:clone(current),expectedRevision:Number(result.revision||0)});
        }catch(error){
          failed=true;
          console.error('[calendar-post-sync] falha ao salvar card',id,error);
        }
      }));
      persistOutbox();
      running=false;
      if(failed){
        options.onStatus('Sem conexão — alteração guardada neste navegador','warn');
        schedule(5000);
      }else if(outbox.size){
        schedule(0);
      }else{
        options.onStatus('Sincronizado em tempo real','ok');
      }
    }

    function applySnapshot(payload){
      if(payload.initial){
        serverPosts.clear(); revisions.clear();
        payload.changes.forEach(change=>setServerResult(change.id,change.type==='removed'?null:change.post,change.revision));
        const merged=new Map(serverPosts);
        outbox.forEach((item,id)=>{
          const confirmed=serverPosts.get(id)||null;
          if(fingerprint(item.post)===fingerprint(confirmed)){ outbox.delete(id); return; }
          if(item.post==null) merged.delete(id); else merged.set(id,clone(item.post));
        });
        persistOutbox();
        ready=true;
        commitLocal(merged,true);
        options.onStatus(payload.fromCache?'Reconectando ao servidor…':'Sincronizado em tempo real',payload.fromCache?'warn':'ok');
        schedule(0);
        return;
      }

      let changed=false;
      payload.changes.forEach(change=>{
        const id=String(change.id);
        setServerResult(id,change.type==='removed'?null:change.post,change.revision);
        if(outbox.has(id)||editingId===id){ deferredRemoteIds.add(id); return; }
        const local=postsMap(options.getPosts());
        if(serverPosts.has(id)) local.set(id,clone(serverPosts.get(id))); else local.delete(id);
        commitLocal(local,false);
        changed=true;
      });
      if(changed) options.onRemoteChange();
      if(!payload.fromCache&&!outbox.size) options.onStatus('Sincronizado em tempo real','ok');
    }

    async function start(){
      try{
        options.onStatus('Conectando sincronização em tempo real…');
        api=await firebaseGateway();
        const legacy=await options.readLegacy();
        const legacyPosts=legacy&&Array.isArray(legacy.v)?legacy.v:Array.from(startupPosts.values());
        await api.ensurePostsStore(options.storeKey,legacyPosts);
        unsubscribe=await api.subscribeToPosts(options.storeKey,applySnapshot,error=>{
          console.error('[calendar-post-sync] assinatura interrompida',error);
          options.onStatus('Sem conexão — usando cópia local','warn');
        });
      }catch(error){
        console.error('[calendar-post-sync] falha ao iniciar',error);
        options.onStatus('Sem conexão — usando cópia local','warn');
        setTimeout(start,5000);
      }
    }

    function beginEdit(id){
      editingId=String(id);
      editingBaseRevision=Number(revisions.get(editingId)||0);
    }

    function endEdit(id){
      const ended=String(id||editingId||'');
      editingId=null; editingBaseRevision=0;
      if(!ended||!deferredRemoteIds.has(ended)||outbox.has(ended)) return;
      deferredRemoteIds.delete(ended);
      applyServerPost(ended,true);
    }

    function flush(){
      clearTimeout(retryTimer);
      reconcile();
    }

    global.addEventListener('online',()=>schedule(0));
    global.addEventListener('pagehide',flush);

    return {start,save,flush,beginEdit,endEdit,destroy(){ if(unsubscribe) unsubscribe(); }};
  }

  global.CalendarPostSync={create};
})(window);
