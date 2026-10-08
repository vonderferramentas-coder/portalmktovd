// Artes salvas do Editor de Posts: salva sozinho a "receita" da arte (textos, grade, enquadramento...) num documento pequeno do portalStore
// ("art-draft-{marca}-{id}") e as fotos em duas camadas: o arquivo original no IndexedDB deste navegador (pelo hash) e uma cópia comprimida
// no Firestore (coleção artPhotos, id = hash), para outra pessoa ou máquina reabrir sem reenviar nada. Só presets com serialize()/restore()
// participam (hoje: Datas comemorativas da VONDER). Também cuida do bloqueio "fulano está editando" e da lixeira de 7 dias.
(function(global){
  'use strict';
  var AUTOSAVE_MS=8000,MIN_GAP_MS=30000,RETRY_MS=30000,LIST_TTL_MS=120000,PHOTO_KEEP_MS=30*24*3600*1000,MAX_LIST=100;
  var LOCK_BEAT_MS=5*60*1000,UPLOAD_TIMEOUT_MS=20000,STATS_TTL_MS=10*60*1000,PHOTO_BUDGET=400*1024*1024,CLOUD_MAX_BYTES=350000,TRASH_DAYS=7;
  var BRAND=(global.PortalBrand&&global.PortalBrand.suffix)||'',KEY='art-drafts-v1'+BRAND;
  var cur=fresh(-1),localOnly=false,timer=0,listCache=null,conflictBox=null,myCtx=null,statsCache=null,showTrash=false;
  function fresh(session){return{session:session,id:null,revision:0,baseline:null,lastJson:null,createdAt:0,cardId:'',saving:null,conflict:false,savedAt:0,thumb:'',thumbTried:false,cloud:{}}}
  function $(s){return document.querySelector(s)}
  function gateway(){return global.PortalFirebase?Promise.resolve(global.PortalFirebase):new Promise(function(res){global.addEventListener('portal-firebase-ready',function(){res(global.PortalFirebase)},{once:true})})}
  function E(){return global.PostEditor}
  function preset(){var e=E(),p=e&&e.preset();return p&&p.serialize?p:null}
  function newId(){return global.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2)}
  function hhmm(ms){return new Date(ms||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
  function setState(text){var el=$('#artSaveState');if(!el)return;el.hidden=!text;el.textContent=text||''}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
  // quem está usando: { uid, name } (guardado depois da primeira vez)
  function me(){
    if(myCtx)return Promise.resolve(myCtx);
    return gateway().then(function(g){return g.currentContext()}).then(function(ctx){var p=ctx.profile||{};return myCtx={uid:ctx.user.uid,name:p.name||p.displayName||ctx.user.email||'Alguém'}})
  }

  // ===== fotos no navegador (IndexedDB): o original pelo hash e a cópia baixada da nuvem em "c:hash"; as de mais de 30 dias sem uso saem =====
  function db(){
    return new Promise(function(res,rej){
      if(!global.indexedDB)return rej(new Error('IndexedDB indisponível'));
      var r=indexedDB.open('portal-artes',1);r.onupgradeneeded=function(){r.result.createObjectStore('photos',{keyPath:'hash'})};
      r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}
    })
  }
  function tx(mode,fn){return db().then(function(d){return new Promise(function(res,rej){var t=d.transaction('photos',mode),out=fn(t.objectStore('photos'));t.oncomplete=function(){d.close();res(out&&out.result)};t.onerror=t.onabort=function(){d.close();rej(t.error)}})})}
  function putPhoto(hash,blob){return tx('readwrite',function(s){s.put({hash:hash,blob:blob,savedAt:Date.now()})}).catch(function(){})}
  function getLocal(hash){return tx('readonly',function(s){return s.get(hash)}).then(function(rec){if(rec&&rec.blob){putPhoto(hash,rec.blob);return rec.blob}return null}).catch(function(){return null})}
  function purgePhotos(){
    tx('readwrite',function(s){var r=s.openCursor();r.onsuccess=function(){var c=r.result;if(!c)return;if(Date.now()-c.value.savedAt>PHOTO_KEEP_MS)c.delete();c.continue()};return r}).catch(function(){})
  }
  // devolve { blob, reduced }: o original deste navegador, ou (reduced) a cópia comprimida da nuvem; null se não existe em lugar nenhum
  function getPhoto(hash){
    return getLocal(hash).then(function(blob){
      if(blob)return{blob:blob,reduced:false};
      return getLocal('c:'+hash).then(function(cached){
        if(cached)return{blob:cached,reduced:true};
        return gateway().then(function(g){return g.readArtPhoto(hash)}).then(function(p){
          if(!p)return null;var b=new Blob([p.bytes],{type:p.type});putPhoto('c:'+hash,b);return{blob:b,reduced:true}
        })
      })
    }).catch(function(){return null})
  }

  // ===== fotos na nuvem: comprimidas no navegador (lado maior limitado, JPEG), 1 documento por foto =====
  function fitSize(w,h,max){var k=Math.min(1,max/Math.max(w,h));return[Math.max(1,Math.round(w*k)),Math.max(1,Math.round(h*k))]}
  // reduz o lado maior a maxSide e baixa a qualidade até caber em CLOUD_MAX_BYTES (se ainda passar, encolhe mais 15% por rodada)
  function compress(blob,maxSide){
    return new Promise(function(res,rej){
      var url=URL.createObjectURL(blob),im=new Image();
      im.onerror=function(){URL.revokeObjectURL(url);rej(new Error('Foto inválida'))};
      im.onload=function(){
        URL.revokeObjectURL(url);var side=maxSide,qualities=[.72,.62,.52];
        (function attempt(qi){
          var sz=fitSize(im.width,im.height,side),c=document.createElement('canvas');c.width=sz[0];c.height=sz[1];
          var x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(im,0,0,sz[0],sz[1]);
          c.toBlob(function(b){
            if(!b)return rej(new Error('Não foi possível comprimir a foto'));
            if(b.size>CLOUD_MAX_BYTES&&(qi<qualities.length-1||side>400)){return attempt(qi<qualities.length-1?qi+1:(side=Math.round(side*.85),qi))}
            b.arrayBuffer().then(function(buf){res({bytes:new Uint8Array(buf),w:sz[0],h:sz[1],type:'image/jpeg'})})
          },'image/jpeg',qualities[qi])
        })(0)
      };
      im.src=url
    })
  }
  // trava de orçamento: a limpeza diária grava o total de bytes de fotos; acima do teto, o editor guarda só no navegador e avisa
  function overBudget(g){
    if(statsCache&&Date.now()-statsCache.at<STATS_TTL_MS)return Promise.resolve(statsCache.over);
    return g.readArtStats().then(function(s){statsCache={at:Date.now(),over:(+s.photoBytes||0)>PHOTO_BUDGET};return statsCache.over}).catch(function(){return false})
  }
  function uploadPhotos(g,blobs,maxSide){
    var todo=blobs.filter(function(b){return!cur.cloud[b.hash]});
    if(!todo.length)return Promise.resolve();
    return overBudget(g).then(function(over){
      if(over){localOnly=true;return}
      return Promise.all(todo.map(function(b){
        return compress(b.blob,maxSide).then(function(c){return g.writeArtPhoto(b.hash,c)}).then(function(){cur.cloud[b.hash]=true}).catch(function(){})
      }))
    })
  }

  // ===== miniatura da arte (200 px de largura, JPEG ~8-15 KB) guardada no próprio documento e mostrada nas listas =====
  var THUMB_W=200,THUMB_MAX_CHARS=24000,THUMB_RE=/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/;
  function makeThumb(){
    var c=document.getElementById('feedCanvas');if(!c||!c.width)return'';
    try{
      var t=document.createElement('canvas');t.width=THUMB_W;t.height=Math.round(THUMB_W*c.height/c.width);
      var x=t.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(c,0,0,t.width,t.height);
      for(var q=.7;q>=.4;q-=.1){var u=t.toDataURL('image/jpeg',q);if(u.length<=THUMB_MAX_CHARS)return u}
    }catch(_){}
    return''
  }
  function currentThumb(){
    // com a caixa de edição de texto aberta, o texto em edição não é desenhado no canvas: nesse caso fica a miniatura da versão anterior
    var t=document.querySelector('.pe-vc-edit')?cur.thumb:makeThumb();cur.thumb=t||cur.thumb;cur.thumbTried=true;return cur.thumb
  }
  // o valor vem do banco: só aceita imagem JPEG em data URL (nunca um endereço externo)
  function thumbEl(draft){
    var el=document.createElement(draft&&THUMB_RE.test(draft.thumb||'')?'img':'span');el.className='pe-saved-thumb';
    if(el.tagName==='IMG'){el.src=draft.thumb;el.alt=''}else{el.classList.add('is-empty');el.textContent='▣'}
    return el
  }

  // ===== salvar =====
  function snapshot(p){var s=p.serialize();return JSON.stringify([s.recipe,s.photos])}
  // chamado pelo desenho da arte (post-editor.js, drawAll): reinicia o relógio do salvamento a cada alteração
  function touch(){
    var e=E(),p=preset(),btn=$('#saveArt');if(btn)btn.hidden=!p;
    if(!p)return;
    if(cur.session!==e.session()){
      clearTimeout(timer);if(cur.id)release(cur.id);
      var inc=e.incoming&&e.incoming();cur=fresh(e.session());cur.cardId=(e.session()===1&&inc&&inc.cardId)||'';setState('Salvamento automático ligado');hideConflict()
    }
    if(cur.baseline===null)cur.baseline=snapshot(p);
    if(cur.conflict)return;
    clearTimeout(timer);timer=setTimeout(function(){save()},Math.max(AUTOSAVE_MS,cur.savedAt+MIN_GAP_MS-Date.now()))
  }
  // force = salvar mesmo sem alterações desde o começo da edição (botão "Salvar arte"). Devolve true se a arte está salva (ou não havia nada a salvar).
  function save(force){
    var p=preset(),e=E();if(!p)return Promise.resolve(true);
    if(cur.saving)return cur.saving.then(function(){return save(force)});
    if(cur.conflict)return Promise.resolve(false);
    var session=cur.session,s=p.serialize();
    return s.ready.then(function(){
      var json=JSON.stringify([s.recipe,s.photos]);
      // arte já salva e sem mudanças só grava de novo se ainda não tem miniatura (artes salvas antes da miniatura existir); thumbTried evita insistir se ela falhar
      if(session!==e.session()||(json===cur.lastJson&&(cur.thumb||cur.thumbTried))||(!cur.id&&!force&&json===cur.baseline))return true;
      setState('Salvando…');
      cur.saving=gateway().then(function(g){
        return Promise.all(s.blobs.map(function(b){return putPhoto(b.hash,b.blob)})).then(function(){return me()}).then(function(user){
          // as fotos sobem antes do documento, mas sem travar o salvamento: passou de UPLOAD_TIMEOUT_MS, segue sem esperar
          return Promise.race([uploadPhotos(g,s.blobs,s.maxSide||1280).catch(function(){}),sleep(UPLOAD_TIMEOUT_MS)]).then(function(){
            var id=cur.id||newId(),now=Date.now();
            var draft={id:id,schema:1,editoria:e.editoriaName(),title:s.title,recipe:JSON.stringify(s.recipe),photos:s.photos,cardId:cur.cardId||'',thumb:currentThumb(),createdAt:cur.createdAt||now,updatedAt:now,updatedBy:{uid:user.uid,name:user.name},deletedAt:null};
            return g.writeArtDraft(KEY,draft,cur.revision,user).then(function(res){
              if(res.conflict){cur.conflict=true;setState('Alterada por outra pessoa');showConflict('rev');return false}
              if(res.locked){cur.conflict=true;setState(res.locked.name+' está editando');showConflict('lock',res.locked.name);return false}
              cur.id=id;cur.revision=res.revision;cur.lastJson=json;cur.createdAt=draft.createdAt;cur.savedAt=now;listCache=null;
              setState('Salvo às '+hhmm(now)+(localOnly&&s.blobs.length?' · fotos só neste navegador (armazenamento cheio)':''));e.markSaved();return true
            })
          })
        })
      }).catch(function(err){console.warn('[artes salvas] salvar:',err);setState('Não foi possível salvar agora'+why(err)+'; tentando de novo');clearTimeout(timer);timer=setTimeout(function(){save()},RETRY_MS);return false}).then(function(ok){cur.saving=null;return ok});
      return cur.saving
    })
  }
  // botão "Salvar arte" e "Salvar e voltar": salva na hora, sem esperar o relógio do salvamento automático
  function saveNow(){clearTimeout(timer);return save(true)}
  function available(){return!!preset()}

  // ===== bloqueio "fulano está editando" =====
  function release(id){if(!id||!myCtx)return;gateway().then(function(g){return g.releaseArtDraftLock(KEY,id,myCtx.uid)}).catch(function(){})}
  // enquanto a arte está aberta e a aba visível, renova o bloqueio a cada 5 min (o salvamento também renova); sem renovação ele vence em 10 min
  setInterval(function(){
    if(!cur.id||cur.conflict||document.visibilityState!=='visible'||!preset())return;
    me().then(function(user){return gateway().then(function(g){return g.lockArtDraft(KEY,cur.id,user,false)})}).then(function(r){
      if(r&&r.locked){cur.conflict=true;setState(r.locked.name+' assumiu a edição');showConflict('lock',r.locked.name)}
    }).catch(function(){})
  },LOCK_BEAT_MS);

  // aviso no topo do painel: outra pessoa salvou (rev) ou assumiu a edição (lock); nada é sobrescrito sem você decidir
  function showConflict(kind,name){
    if(!conflictBox){
      conflictBox=document.createElement('div');conflictBox.className='pe-hint pe-art-conflict';
      conflictBox.innerHTML='<span data-msg></span><button type="button" data-act="take">Assumir a edição</button><button type="button" data-act="copy">Salvar como cópia</button><button type="button" data-act="reload">Recarregar a versão salva</button>';
      var bar=$('#selectedEditoriaBarEdit');bar.parentNode.insertBefore(conflictBox,bar.nextSibling);
      conflictBox.addEventListener('click',function(ev){
        var b=ev.target.closest('button');if(!b)return;
        if(b.dataset.act==='copy'){cur.id=null;cur.revision=0;cur.lastJson=null;cur.conflict=false;hideConflict();save()}
        else if(b.dataset.act==='take'){
          me().then(function(user){return gateway().then(function(g){return g.lockArtDraft(KEY,cur.id,user,true)})}).then(function(){cur.conflict=false;hideConflict();save()}).catch(function(){setState('Não foi possível assumir a edição')})
        }else if(confirm('Descartar as alterações feitas aqui e abrir a versão salva?')){var id=cur.id;cur.conflict=false;hideConflict();open(id,true)}
      })
    }
    conflictBox.querySelector('[data-msg]').textContent=kind==='lock'
      ?(name||'Outra pessoa')+' está editando esta arte agora. O salvamento automático está pausado para não sobrescrever o trabalho dela.'
      :'Outra pessoa alterou esta arte depois que você a abriu. O salvamento automático está pausado.';
    conflictBox.querySelector('[data-act=take]').hidden=kind!=='lock';
    conflictBox.hidden=false
  }
  function hideConflict(){if(conflictBox)conflictBox.hidden=true}
  // ao sair da aba ou fechar a página, salva na hora e solta o bloqueio (melhor esforço: o navegador pode cortar a gravação)
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&preset()){clearTimeout(timer);save()}});
  global.addEventListener('pagehide',function(){if(preset()){clearTimeout(timer);save().then(function(){release(cur.id)})}});

  // ===== abrir =====
  // skipLock: o bloqueio já é seu (recarregar a própria versão)
  function open(id,skipLock){
    var g,user;
    return gateway().then(function(gw){g=gw;return me()}).then(function(u){user=u;return g.readArtDraft(KEY,id)}).then(function(r){
      var d=r.draft,e=E(),recipe;
      if(!d){e.status('Esta arte não existe mais',false);return}
      try{recipe=JSON.parse(d.recipe)}catch(_){e.status('Não foi possível ler esta arte salva',false);return}
      var locking=skipLock?Promise.resolve({locked:null}):g.lockArtDraft(KEY,id,user,false);
      return locking.then(function(lk){
        if(lk.locked){
          if(!confirm(lk.locked.name+' está editando esta arte agora (bloqueio até '+hhmm(lk.locked.until)+'). Deseja assumir a edição? A outra pessoa será avisada quando for salvar.'))return;
          return g.lockArtDraft(KEY,id,user,true).then(function(){return r})
        }
        return r
      }).then(function(ok){
        if(!ok)return;
        if(!e.chooseEditoria(d.editoria)){e.status('A editoria desta arte não está disponível',false);return}
        var p=preset();if(!p){e.status('Esta editoria não suporta artes salvas',false);return}
        cur=fresh(e.session());cur.id=d.id;cur.revision=r.revision;cur.createdAt=d.createdAt||0;cur.cardId=d.cardId||'';cur.thumb=d.thumb||'';cur.thumbTried=!!d.thumb;cur.savedAt=Date.now();
        return p.restore({recipe:recipe,photos:d.photos||[]},getPhoto).then(function(){
          var s=p.serialize();return s.ready.then(function(){cur.baseline=cur.lastJson=JSON.stringify([s.recipe,s.photos]);setState('Arte salva aberta');e.status('Arte salva aberta',false);
          // arte salva antes da miniatura existir: gera a miniatura sozinha, uma vez, depois que as fotos já estão na tela
          if(!cur.thumb)setTimeout(function(){save()},1500)})
        })
      })
    }).catch(function(){E().status('Não foi possível abrir a arte salva',false)})
  }

  // ===== lista na escolha de editoria =====
  function loadList(){
    if(listCache&&Date.now()-listCache.at<LIST_TTL_MS)return Promise.resolve(listCache.items);
    // ponytail: o filtro é só por marca e a lista vem sem ordem do servidor (índice composto exigiria configuração); até MAX_LIST, ordena no navegador
    return gateway().then(function(g){return g.listArtDrafts(KEY,MAX_LIST)}).then(function(items){
      items=items.filter(function(i){return i.draft}).sort(function(a,b){return(b.draft.updatedAt||0)-(a.draft.updatedAt||0)});
      listCache={at:Date.now(),items:items};return items
    })
  }
  function trashDays(i){return Math.max(0,Math.ceil((i.draft.deletedAt+TRASH_DAYS*86400000-Date.now())/86400000))}
  function setDeleted(i,at){
    return me().then(function(user){return gateway().then(function(g){return g.setArtDraftDeleted(KEY,i.id,at,user)})}).then(function(r){
      if(r&&r.locked)alert(r.locked.name+' está editando esta arte agora. Tente de novo quando ela terminar.');
      listCache=null;refreshList()
    }).catch(function(){alert('Não foi possível concluir. Tente de novo.')})
  }
  function renderList(items){
    var box=$('#savedArts'),list=$('#savedArtsList'),toggle=$('#savedArtsTrash');if(!box)return;
    var live=items.filter(function(i){return!i.draft.deletedAt}),trashed=items.filter(function(i){return i.draft.deletedAt});
    var q=($('#savedArtsSearch').value||'').toLowerCase(),source=showTrash?trashed:live;
    var shown=source.filter(function(i){return!q||String(i.draft.title||'').toLowerCase().indexOf(q)>=0});
    box.hidden=false;list.textContent='';
    toggle.hidden=!trashed.length&&!showTrash;toggle.textContent=showTrash?'‹ Voltar às artes salvas':'Lixeira ('+trashed.length+')';
    if(!shown.length){var p=document.createElement('p');p.className='pe-field-hint';p.textContent=showTrash?'A lixeira está vazia.':items.length?'Nenhuma arte encontrada.':'Nenhuma arte salva ainda. Elas aparecem aqui sozinhas assim que você editar uma arte de Datas comemorativas.';list.appendChild(p)}
    shown.forEach(function(i){
      var row=document.createElement('div');row.className='pe-saved-row';
      var b=document.createElement('button');b.type='button';b.className='pe-saved-item';
      var t=document.createElement('strong'),m=document.createElement('small');
      t.textContent=i.draft.title||'Arte sem título';
      var busy=i.lock&&i.lock.until>Date.now()&&(!myCtx||i.lock.uid!==myCtx.uid)?' · editando agora: '+i.lock.name:'';
      m.textContent=showTrash
        ?'Na lixeira'+(i.draft.deletedBy?' por '+i.draft.deletedBy:'')+' · some em '+trashDays(i)+' dia(s)'
        :i.draft.editoria+' · '+new Date(i.draft.updatedAt||0).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+(i.draft.updatedBy&&i.draft.updatedBy.name?' · '+i.draft.updatedBy.name:'')+busy;
      var text=document.createElement('span');text.className='pe-saved-text';text.appendChild(t);text.appendChild(m);b.appendChild(thumbEl(i.draft));b.appendChild(text);
      var a=document.createElement('button');a.type='button';a.className='pe-saved-del';
      if(showTrash){a.textContent='Restaurar';a.addEventListener('click',function(){setDeleted(i,null)});b.disabled=true}
      else{a.textContent='Excluir';a.title='Mover para a lixeira (dá para restaurar por '+TRASH_DAYS+' dias)';a.addEventListener('click',function(){if(confirm('Mover “'+(i.draft.title||'esta arte')+'” para a lixeira? Dá para restaurar por '+TRASH_DAYS+' dias.'))setDeleted(i,Date.now())});b.addEventListener('click',function(){open(i.id)})}
      row.appendChild(b);row.appendChild(a);list.appendChild(row)
    })
  }
  function why(e){return e&&(e.code||e.message)?' ('+String(e.code||e.message).slice(0,80)+')':''}
  function refreshList(){me().catch(function(){}).then(function(){return loadList()}).then(renderList).catch(function(e){console.warn('[artes salvas] lista:',e);var l=$('#savedArtsList');if(l){l.textContent='';var p=document.createElement('p');p.className='pe-field-hint';p.textContent='Não foi possível carregar as artes salvas'+why(e)+'.';l.appendChild(p)}})}
  function init(){
    var chooser=$('#editoriaChooser');if(!chooser)return;
    new MutationObserver(function(){if(!chooser.hidden)refreshList()}).observe(chooser,{attributes:true,attributeFilter:['hidden']});
    $('#savedArtsSearch').addEventListener('input',function(){loadList().then(renderList).catch(function(){})});
    $('#savedArtsTrash').addEventListener('click',function(){showTrash=!showTrash;loadList().then(renderList).catch(function(){})});
    // confirmação no próprio botão: "Salvando…" -> "✓ Arte salva às 12:33" por alguns segundos (ou "Não foi possível salvar" em vermelho)
    var saveBtn=$('#saveArt'),saveLabel=saveBtn.textContent,saveReset=0;
    function flash(text,cls){clearTimeout(saveReset);saveBtn.textContent=text;saveBtn.classList.remove('is-saved','is-failed');if(cls)saveBtn.classList.add(cls);if(cls)saveReset=setTimeout(function(){saveBtn.textContent=saveLabel;saveBtn.classList.remove('is-saved','is-failed')},3500)}
    saveBtn.addEventListener('click',function(){
      saveBtn.disabled=true;flash('Salvando…');
      saveNow().then(function(ok){
        saveBtn.disabled=false;
        if(ok&&!cur.conflict){flash('✓ Arte salva às '+hhmm(cur.savedAt),'is-saved');E().status('Arte salva às '+hhmm(cur.savedAt),false)}
        else flash('Não foi possível salvar','is-failed')
      })
    });
    purgePhotos();refreshList();
    var id=new URLSearchParams(location.search).get('art');if(id)open(id)
  }
  global.PostEditorSaved={touch:touch,save:save,saveNow:saveNow,available:available,open:open,current:function(){return cur},test:{fitSize:fitSize}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(init,0)});else setTimeout(init,0);
})(window);
