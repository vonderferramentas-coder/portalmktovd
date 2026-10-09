(function(){
'use strict';
// Tema (claro/escuro) e cor de destaque já vêm aplicados pelo portal-shell.js (primeiro
// script da página, com acesso à marca ativa e ao tema Personalizado) - nada a fazer aqui.
var $=function(s){return document.querySelector(s)}, $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var canvases={feed:$('#feedCanvas'),story:$('#storyCanvas')};
var templates={
 feed:{w:1080,h:1350,footerY:1184,footerH:166,textX:66,titleY:1227,subY:1278,titleMax:625,codeX:731,codeY:1228,dualCodeY:1227,codeW:390,codeH:49,safeX:66},
 story:{w:1080,h:1920,footerY:1458,footerH:173,textX:67,titleY:1504,subY:1557,titleMax:620,codeX:714,codeY:1520,dualCodeY:1503,codeW:410,codeH:49,safeX:66}
};
var positions={
 feed:{left:{badge:[68,108,484,313],product:[458,128,410,333]},stacked:{badge:[42,338,484,313],product:[92,147,340,276]},right:{badge:[528,108,484,313],product:[212,128,410,333]}},
 story:{left:{badge:[64,246,471,306],product:[450,286,430,349]},stacked:{badge:[42,548,471,306],product:[88,333,370,300]},right:{badge:[545,246,471,306],product:[200,286,430,349]}}
};
var state={srcFile:{bg:null,product:null},titleScale:1,editoriaName:null,editoriaColor:null,footerColor:'#FFBE00',brandBadgeColor:'#fbc400',background:null,product:null,productDrawable:null,productHasCircle:true,guides:{feed:false,story:false},badgeFeed:null,badgeStory:null,customAssets:{},autoLayout:'left',bgZoom:{feed:1,story:1},ov:{feed:{scale:1,photo:1,layout:'auto',circleFront:false,circleStyle:'yellow'},story:{scale:1,photo:1,layout:'auto',circleFront:false,circleStyle:'yellow'}},format:{feed:{bgDx:0,bgDy:0,overlayDx:0,overlayDy:0},story:{bgDx:0,bgDy:0,overlayDx:0,overlayDy:0}}};
var lastProductBox={feed:null,story:null},lastBadgeBox={feed:null,story:null};
var INCOMING_COMM=(function(){
 var q=new URLSearchParams(location.search);if(!q.get('eventTitle'))return null;
 return{day:q.get('eventDay')||'01',month:q.get('eventMonth')||'JANEIRO',prefix:q.get('eventPrefix')||'',title:q.get('eventTitle')||'NOME DA DATA',cardId:q.get('cardId')||''};
})();
var catalog=[],selectedProduct=null,catalogFocus=0,catalogLoading=true;
// ============================================================
// EDITORIAS - mesma fonte usada em Configurações → Editorias no Calendário (app.js), lida
// direto da mesma chave de localStorage (cada marca tem sua própria lista, ver BRAND_SUFFIX).
// Cada editoria só é selecionável aqui se tiver um preset registrado em EDITORIA_PRESETS;
// as demais aparecem desabilitadas ("Em breve") até ganharem composição própria.
// ============================================================
var BRAND_SUFFIX=(window.PortalBrand&&window.PortalBrand.suffix)||'';
var CALENDAR_SETTINGS_KEY='calendar_settings_v1'+BRAND_SUFFIX;
// mapeia o sufixo de marca (ver app.js/portal-shell.js) pro "slug" do catálogo correspondente
// em data/catalog-{slug}.json (ver catalog-provider.js). Uma marca sem entrada aqui cai no
// próprio sufixo sem "__" como slug - se o arquivo ainda não existir, CatalogProvider.load()
// resolve pra lista vazia (mesmo estado de "sem catálogo" que já existia antes)
var CATALOG_SLUG_BY_BRAND_SUFFIX={ '':'vonder', '__ferramentas-gerais':'fg', '__dismatal':'dismatal' };
var CATALOG_SLUG=CATALOG_SLUG_BY_BRAND_SUFFIX[BRAND_SUFFIX]||BRAND_SUFFIX.replace(/^__/,'');
// FG e Dismatal revendem produto VONDER e seus códigos de catálogo apontam pro mesmo sistema
// de fotos (app.ovd.com.br), então usam o mesmo proxy de fotos por código que a VONDER. Se
// algum dia ganharem catálogo de código próprio (outro fornecedor de foto), tira a marca daqui.
var CATALOG_PHOTO_SLUG=({ fg:'vonder', dismatal:'vonder' })[CATALOG_SLUG]||CATALOG_SLUG;
// editorias são exclusivas de cada marca (ver app.js, EDITORIAS_BY_BRAND) - este fallback só
// entra quando a marca ainda não tem configurações salvas. Trend e Personalizado são
// universais (toda marca tem as duas, cada uma com sua própria cópia independente); as
// demais só existem pra marca listada, e uma marca sem entrada aqui cai só nas universais
var UNIVERSAL_FALLBACK_EDITORIAS=[{name:'Trend',color:'#db2777'},{name:'Personalizado',color:'#64748b'}];
var FALLBACK_EDITORIAS_BY_BRAND={
 '':[{name:'Informativo',color:'#7c3aed'},{name:'Destaques',color:'#0284c7'},{name:'Lançamentos',color:'#16a34a'},
     {name:'Dica VONDER',color:'#b45309'},{name:'Uso e Recomendo VONDER',color:'#0d9488'},{name:'Datas comemorativas',color:'#db2777'}],
 '__ferramentas-gerais':[{name:'Post E-commerce',color:'#0284c7'},{name:'Lançamentos',color:'#16a34a'},
     {name:'Destaques',color:'#7c3aed'},{name:'Blog - Conecta FG',color:'#4f46e5'},{name:'Datas comemorativas',color:'#db2777'}],
 '__osten-ferragens':[{name:'Datas comemorativas',color:'#db2777'}],
 '__dismatal':[{name:'Datas comemorativas',color:'#db2777'}],
 '__dwt':[{name:'Datas comemorativas',color:'#AB2328'}]
};
var FALLBACK_EDITORIAS=(FALLBACK_EDITORIAS_BY_BRAND[BRAND_SUFFIX]||[]).concat(UNIVERSAL_FALLBACK_EDITORIAS);
// A editoria nova nasce no calendário (app.js a acrescenta às configurações já salvas ao abrir lá); aqui ela já aparece
// mesmo que o calendário ainda não tenha sido aberto depois da novidade.
var USO_NAME='Uso e Recomendo VONDER';
function withUso(list){var d=FALLBACK_EDITORIAS.filter(function(e){return e.name===USO_NAME})[0];return d&&!list.some(function(e){return e.name===USO_NAME})?list.concat(d):list}
function readEditoriaList(){
 var raw=localStorage.getItem(CALENDAR_SETTINGS_KEY);if(!raw)return FALLBACK_EDITORIAS;
 try{var s=JSON.parse(raw),eds=Array.isArray(s.editorias)?s.editorias:null;if(!eds||!eds.length)return FALLBACK_EDITORIAS;
  return withUso(eds.map(function(e,i){return typeof e==='string'?{name:e,color:(FALLBACK_EDITORIAS.length?FALLBACK_EDITORIAS[i%FALLBACK_EDITORIAS.length].color:'#64748b')}:e}))
 }catch(e){return FALLBACK_EDITORIAS}
}
var EDITORIAS=readEditoriaList();
// a lista acima só reflete o que já estava salvo NESTE navegador (pode estar desatualizada,
// já que esta página nunca chamou o servidor até agora) - assim que o SyncBackend
// responder, atualiza a lista e o cache local, e redesenha a grade se ainda estiver visível
var SYNC_ENABLED=location.protocol!=='file:';
function refreshEditoriasFromServer(){
 if(!SYNC_ENABLED||typeof SyncBackend==='undefined')return;
 SyncBackend.get('settings'+BRAND_SUFFIX).then(function(res){
  if(!res||res.v===null)return;
  var eds=Array.isArray(res.v.editorias)?res.v.editorias:null;if(!eds||!eds.length)return;
  var normalized=eds.map(function(e,i){return typeof e==='string'?{name:e,color:(FALLBACK_EDITORIAS.length?FALLBACK_EDITORIAS[i%FALLBACK_EDITORIAS.length].color:'#64748b')}:e});
  EDITORIAS=withUso(normalized);
  try{var raw=localStorage.getItem(CALENDAR_SETTINGS_KEY),s=raw?JSON.parse(raw):{};s.editorias=normalized;localStorage.setItem(CALENDAR_SETTINGS_KEY,JSON.stringify(s))}catch(e){}
  renderEditoriaGrid()
 }).catch(function(){})
}
// preset visual de cada editoria (selo do feed/story + cor do rodapé) - exclusivo por marca:
// cada marca tem seu próprio catálogo de editorias, então uma editoria "Destaques" da VONDER
// não tem nada a ver com uma "Destaques" da Ferramentas Gerais, mesmo com o mesmo nome. Por
// isso o registro é indexado primeiro por BRAND_SUFFIX e só depois por nome da editoria.
// Novas editorias/marcas ganham entrada aqui à medida que a arte for feita.
var EDITORIA_PRESETS_BY_BRAND={
 '':{ // VONDER (marca padrão)
  'Destaques':{
   footerColor:'#F6BE00',
   badgeFeed:'post-editor-assets/destaques-feed.png',
   badgeStory:'post-editor-assets/destaques-story.png'
  }
 }
};
var EXTERNAL_EDITORIA_PRESETS=window.POST_EDITOR_CUSTOM_PRESETS||{};
Object.keys(EXTERNAL_EDITORIA_PRESETS).forEach(function(brand){
 EDITORIA_PRESETS_BY_BRAND[brand]=Object.assign({},EDITORIA_PRESETS_BY_BRAND[brand]||{},EXTERNAL_EDITORIA_PRESETS[brand])
});
var EDITORIA_PRESETS=EDITORIA_PRESETS_BY_BRAND[BRAND_SUFFIX]||{};
function escapeHtml(value){return String(value||'').replace(/[&<>\"]/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]})}
function normalizeText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function normalizeCode(value){return String(value||'').replace(/\D/g,'')}
// tamanho pedido ao proxy de fotos para as miniaturas de pré-visualização (grade de busca,
// resumo do produto selecionado etc. nunca passam de ~58px na tela, então isso evita baixar
// a foto original - que pode ter vários MB - só para exibi-la minúscula)
var CATALOG_THUMB_WIDTH=160;
// tamanho pedido pra foto usada de fato na arte (recorte do produto). O maior lado desenhado
// nunca passa de ~1920px (Story) e o zoom do produto vai até 135%, então 1600px de origem já
// cobre com folga - mas é uma fração do tamanho da foto original (que pode ter 4000px+),
// então o recorte fica pronto bem mais rápido sem perda de qualidade perceptível.
var CATALOG_PRODUCT_WIDTH=1600;
// mesmo proxy CORS público usado pelo coletor de ofertas FG (ver cloudflare-worker.js), com uma
// rota extra pra foto de produto. Não reduz o tamanho da foto (sem 'w'), então só entra pro
// recorte automático (CATALOG_PRODUCT_WIDTH), nunca pras miniaturas do catálogo.
function workerProductImageUrl(code){var digits=normalizeCode(code);if(!digits)return'';return'https://ecommerce-fg.vonderferramentas.workers.dev/product-image?code='+encodeURIComponent(digits)}
// Regra do portal: só web. Nenhuma requisição à máquina do usuário nem à rede local (endereços de loopback, IPs privados, nomes
// internos como o do app de fotos): o Chrome pediria "Acessar outros dispositivos na sua rede local". A foto do produto vem do Worker
// (HTTPS público), que busca no app.ovd. O workflow de testes barra a volta desses endereços no código das páginas.
function itemImageUrls(item,width){
 var codes=catalogCodes(item),code=codes[0]&&codes[0].code,direct=(item&&(item.imageUrl||item.image||item.photo))||'',urls=[];
 if(CATALOG_PHOTO_SLUG==='vonder'&&code&&width===CATALOG_PRODUCT_WIDTH)urls.push(workerProductImageUrl(code));
 // URL direta só quando não é do app.ovd (que resolve para IP interno na rede da empresa).
 if(direct&&!/^https?:\/\/app\.ovd\.com\.br\//i.test(direct))urls.push(direct);
 return urls.filter(function(url,index){return url&&urls.indexOf(url)===index})
}
// A foto do app.ovd tem de 2 a 15 MB (via worker, 2-4 s cada), então a lista NÃO a carrega de cara; as miniaturas leves
// vêm em lote de /product-thumbs (applyThumbs).
function hostedThumbs(){return CATALOG_PHOTO_SLUG==='vonder'}
function itemThumbnailUrls(item){return(item&&item.thumbnail)?[item.thumbnail]:hostedThumbs()?[]:itemImageUrls(item,CATALOG_THUMB_WIDTH)}
var thumbCache={},thumbPending={},thumbFailUntil=0;
function thumbKey(item){var first=catalogCodes(item)[0];return first?normalizeCode(first.code):''}
function applyThumbs(){$$('#catalogResults [data-thumb]').forEach(function(slot){var url=thumbCache[slot.dataset.thumb];if(!url)return;var img=document.createElement('img');img.alt='';img.decoding='async';img.src=url;img.onerror=function(){img.replaceWith(slot)};slot.replaceWith(img)})}
// Produto que o site não tem: a única foto é a do app.ovd (1 a 15 MB, via worker). Carrega só as das linhas ainda visíveis,
// 2 por vez, e fica no cache do navegador (7 dias); enquanto não chega, a linha mostra o "+".
var heavyQueue=[],heavyActive=0,heavyTried={};
function queueHeavy(keys){keys.forEach(function(key){if(!heavyTried[key]&&heavyQueue.indexOf(key)<0)heavyQueue.push(key)});pumpHeavy()}
function startHeavy(key){
 var url=workerProductImageUrl(key),im=new Image(),done=function(ok){heavyActive--;if(ok){thumbCache[key]=url;applyThumbs()}pumpHeavy()};
 heavyActive++;heavyTried[key]=1;im.decoding='async';im.onload=function(){done(true)};im.onerror=function(){done(false)};im.src=url
}
function pumpHeavy(){while(heavyActive<2&&heavyQueue.length){var key=heavyQueue.shift();if($('#catalogResults [data-thumb="'+key+'"]'))startHeavy(key)}}
function loadThumbs(items){
 var need=items.map(thumbKey).filter(function(key){return key&&!(key in thumbCache)&&!thumbPending[key]}).slice(0,20);
 if(!need.length||Date.now()<thumbFailUntil)return;
 need.forEach(function(key){thumbPending[key]=1});
 fetch(SITE_API+'/product-thumbs?codes='+need.join(',')).then(function(res){if(!res.ok)throw new Error('thumbs');return res.json()}).then(function(data){
  need.forEach(function(key){delete thumbPending[key];thumbCache[key]=(data.thumbs&&data.thumbs[key])||''});applyThumbs();queueHeavy(need.filter(function(key){return!thumbCache[key]}));loadThumbs(items)
 }).catch(function(){need.forEach(function(key){delete thumbPending[key]});thumbFailUntil=Date.now()+30000})
}
// tenta cada URL da lista em sequência quando a anterior falhar (onerror) - usado pelas
// miniaturas do catálogo pra cair pra foto original quando a miniatura do proxy não responde
// (ex.: página aberta por um servidor estático que não executa o PHP do proxy nem tem o
// helper local rodando)
function setImgWithFallback(img,urls,onAllFail){
 var list=(urls||[]).filter(Boolean),i=0;
 if(!list.length){if(onAllFail)onAllFail();return}
 img.onerror=function(){i++;if(i<list.length)img.src=list[i];else{img.onerror=null;if(onAllFail)onAllFail()}};
 img.src=list[0]
}
function itemBackgroundUrl(item){return(item&&(item.background||item.usageImage||item.applicationImage||item.sceneImage))||''}
function catalogCodes(item){
 var raw=Array.isArray(item&&item.codes)?item.codes:(Array.isArray(item&&item.variants)?item.variants:null),out=[];
 if(raw)raw.slice(0,2).forEach(function(entry){if(typeof entry==='string')out.push({code:entry,label:''});else if(entry&&entry.code)out.push({code:entry.code,label:entry.label||entry.name||entry.variant||''})});
 if(!out.length&&item&&item.code)out.push({code:item.code,label:item.variant||''});return out
}
// Código que vai pra arte. Na FERRAMENTAS GERAIS é o do e-commerce da FG (codeFG, 7 dígitos), não o
// código Vonder do catálogo - esse continua saindo de catalogCodes() porque é ele que busca a foto no
// proxy (CATALOG_PHOTO_SLUG mapeia fg → vonder). Os 49 produtos sem codeFG caem no código do catálogo.
function editorCodes(item){
 if(CATALOG_SLUG==='fg'&&item&&item.codeFG)return[{code:String(item.codeFG),label:item.variant||''}];
 return catalogCodes(item)
}
function editorNameFor(item){var title=item&&(item.title||item.shortName),sub=item&&(item.subtitle||item.shortDescription||item.descriptionShort);if(title)return title+(sub?'\n'+sub:'');var parsed=splitName(item&&item.name);return parsed.title+(parsed.sub?'\n'+parsed.sub:'')}
// escolher o produto com duplo clique na lista abre o editor e o 2º clique cai na prévia: o duplo clique logo após abrir é ignorado
var editOpenedAt=0;
var FLOW_STEP_ORDER={editoria:0,choose:1,edit:2,banner:3};
var currentFlowMode='editoria',maxFlowOrder=0,pendingLeaveEditTarget=null;
function setFlow(mode){
 currentFlowMode=mode;if(mode==='edit')editOpenedAt=Date.now();maxFlowOrder=Math.max(maxFlowOrder,FLOW_STEP_ORDER[mode]);
 $('#editoriaChooser').hidden=mode!=='editoria';$('#productChooser').hidden=mode!=='choose';$('#editorWorkspace').hidden=mode!=='edit'&&mode!=='banner';
 // etapa "Desdobrar para banner": mesma área de trabalho, com o painel e a prévia do banner no lugar dos do post
 document.body.classList.toggle('is-banner-step',mode==='banner');$$('.pe-bn').forEach(function(el){el.hidden=mode!=='banner'});
 if(mode==='edit'&&!$('[data-flow-step="banner"]').hidden)maxFlowOrder=Math.max(maxFlowOrder,FLOW_STEP_ORDER.banner);
 if(mode==='banner')setTimeout(drawAll,0);
 $('#editorIntro').textContent=mode==='editoria'?'Primeiro, escolha qual editoria você vai postar.':mode==='choose'?'Agora, escolha qual produto será usado na arte.':mode==='banner'?'Banner da intranet montado com as mesmas fotos e textos da arte.':'Dados carregados. Revise a arte e ajuste o que precisar.';
 var cur=FLOW_STEP_ORDER[mode];
 $$('[data-flow-step]').forEach(function(el){var own=FLOW_STEP_ORDER[el.dataset.flowStep];el.classList.toggle('is-active',own===cur);el.classList.toggle('is-complete',own<cur);el.classList.toggle('is-clickable',own!==cur&&own<=maxFlowOrder)});
 if(mode==='choose'){renderCatalogResults();scheduleSiteSearch($('#catalogSearch').value);setTimeout(function(){$('#catalogSearch').focus()},20)}
}
// navegação entre etapas iniciada pelo usuário (clique nos passos do topo ou nos botões
// "Trocar") - sair da etapa "Editar post" pede confirmação, porque a composição em tela
// nunca é salva automaticamente; indo pra frente (ou entre editoria/produto) não há nada a perder
function goToStep(mode){
 if(mode===currentFlowMode)return;
 // entre editar a arte (passo 2) e desdobrar para o banner (passo 3) a troca é livre: salva e segue, sem pedir confirmação
 if((currentFlowMode==='edit'&&mode==='banner')||(currentFlowMode==='banner'&&mode==='edit')){if(window.PostEditorSaved&&window.PostEditorSaved.available())window.PostEditorSaved.saveNow();setFlow(mode);return}
 if((currentFlowMode==='edit'||currentFlowMode==='banner')&&editDirty){pendingLeaveEditTarget=mode;showLeaveConfirm();return}
 setFlow(mode)
}
// Editorias com artes salvas (post-editor-saved-arts.js) oferecem salvar antes de sair; as outras mantêm o aviso de perda de sempre
var LEAVE_TEXT={title:$('#confirmLeaveEditTitle').textContent,desc:$('#confirmLeaveEditDesc').textContent,ok:$('#confirmLeaveEditOk').textContent};
function showLeaveConfirm(){
 var S=window.PostEditorSaved,canSave=!!(S&&S.available());
 $('#confirmLeaveEditSave').hidden=!canSave;
 $('#confirmLeaveEditTitle').textContent=canSave?'Salvar a arte antes de sair?':LEAVE_TEXT.title;
 $('#confirmLeaveEditDesc').textContent=canSave?'As últimas alterações desta arte ainda não foram salvas. Salve para continuar de onde parou depois, ou volte e perca o que mudou desde o último salvamento.':LEAVE_TEXT.desc;
 $('#confirmLeaveEditOk').textContent=canSave?'Voltar sem salvar':LEAVE_TEXT.ok;
 $('#confirmLeaveEdit').hidden=false
}
$('#confirmLeaveEditSave').addEventListener('click',function(){
 var button=this;button.disabled=true;
 window.PostEditorSaved.saveNow().then(function(ok){button.disabled=false;if(!ok)return;editDirty=false;var target=pendingLeaveEditTarget;closeConfirmLeaveEdit();if(target)setFlow(target)})
});
function closeConfirmLeaveEdit(){$('#confirmLeaveEdit').hidden=true;pendingLeaveEditTarget=null}
$('#confirmLeaveEditCancel').addEventListener('click',closeConfirmLeaveEdit);$('#confirmLeaveEditClose').addEventListener('click',closeConfirmLeaveEdit);
$('#confirmLeaveEditOk').addEventListener('click',function(){var target=pendingLeaveEditTarget;closeConfirmLeaveEdit();if(target)setFlow(target)});
$('#confirmLeaveEdit').addEventListener('click',function(ev){if(ev.target===ev.currentTarget)closeConfirmLeaveEdit()});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&!$('#confirmLeaveEdit').hidden)closeConfirmLeaveEdit()});
$$('[data-flow-step]').forEach(function(el){el.addEventListener('click',function(){if(el.classList.contains('is-clickable'))goToStep(el.dataset.flowStep)})});
function syncEditoriaBadges(){
 [['selectedEditoriaDotChoose','selectedEditoriaNameChoose'],['selectedEditoriaDotEdit','selectedEditoriaNameEdit']].forEach(function(ids){
  var dot=$('#'+ids[0]),name=$('#'+ids[1]);if(!dot||!name)return;dot.style.background=state.editoriaColor||'#64748b';name.textContent=state.editoriaName||'Editoria'
 })
}
function renderEditoriaGrid(){
 var box=$('#editoriaGrid');
 box.innerHTML=EDITORIAS.map(function(e){
  var available=!!EDITORIA_PRESETS[e.name];
  return '<button type="button" class="pe-editoria-item" data-editoria="'+escapeHtml(e.name)+'"'+(available?'':' disabled')+'><span class="pe-editoria-dot" style="background:'+(e.color||'#64748b')+'"></span><span><strong>'+escapeHtml(e.name)+'</strong><small>'+(available?'Preset disponível':'Em breve')+'</small></span></button>'
 }).join('');
 $$('#editoriaGrid [data-editoria]:not(:disabled)').forEach(function(btn){
  btn.addEventListener('click',function(){var e=EDITORIAS.filter(function(x){return x.name===btn.dataset.editoria})[0];if(e)chooseEditoria(e)})
 })
}
// cada escolha de editoria começa uma sessão de edição nova (as artes salvas se amarram a ela, ver post-editor-saved-arts.js)
var editSession=0;
function chooseEditoria(editoria,keepFlow){
 var preset=EDITORIA_PRESETS[editoria.name];if(!preset)return;editSession++;
 state.srcFile={bg:null,product:null};state.editoriaName=editoria.name;state.titleScale=1;state.editoriaColor=editoria.color||'#64748b';state.footerColor=preset.footerColor||'#FFBE00';
 state.brandBadgeColor=preset.brandBadgeColor||'#fbc400';if($('#brandBadgeColor'))$('#brandBadgeColor').value=state.brandBadgeColor;
 state.customAssets={};var brandField=$('#brandVariantField');if(brandField)brandField.hidden=!preset.supportsBrandVariant;
 var brandBadgeColorField=$('#brandBadgeColorField');if(brandBadgeColorField)brandBadgeColorField.hidden=preset.supportsBrandBadgeColor===false;
 var suggestionsSection=$('#compositionSuggestionsSection');if(suggestionsSection)suggestionsSection.hidden=preset.supportsCompositionSuggestions===false;
 var usesCodes=preset.supportsCodes!==false,usesCutout=preset.supportsProductCutout!==false,isCommemorative=!!preset.commemorative;
 $('#codeControls').hidden=!usesCodes;$('#selectedProductCode').hidden=!usesCodes;$('#productDrop').hidden=!usesCutout;$('#removeWhiteField').hidden=!usesCutout;$('#removeHolesField').hidden=!usesCutout;var ecommerceField=$('#ecommercePricing');if(ecommerceField)ecommerceField.hidden=!preset.ecommerce;var fgEcommerce=BRAND_SUFFIX==='__ferramentas-gerais'&&preset.ecommerce,fgOfferImport=$('#fgOfferProductImport');if(fgOfferImport)fgOfferImport.hidden=!fgEcommerce;['#catalogSearchArea','#catalogMeta','#catalogResults'].forEach(function(selector){var element=$(selector);if(element)element.hidden=fgEcommerce});['#layoutModeField','#moveModeControls','#overlayFormatField'].forEach(function(selector){var element=$(selector);if(element)element.hidden=fgEcommerce});state.moveEnabled=true;state.priceMoveOnly=fgEcommerce;var stageMoveHint=$('#stageMoveHint');if(stageMoveHint)stageMoveHint.textContent=fgEcommerce?'Arraste a box de preço ou a foto de fundo para reposicionar':'Arraste direto sobre a arte para reposicionar';var chooserDescription=$('#productChooserDescription');if(chooserDescription)chooserDescription.textContent=fgEcommerce?'Cole o link da oferta da FG para preencher os dados comerciais automaticamente.':'Busque pelo nome ou código do produto para preencher os dados automaticamente.';
 $('#commemorativeFields').hidden=!isCommemorative;if($('#eventPrefixField'))$('#eventPrefixField').hidden=!!preset.singleCommemorativeText;if($('#eventTitleSizeField')){$('#eventTitleSizeField').hidden=!preset.titleSizeControl;if(preset.titleSizeControl){['Feed','Story'].forEach(function(format){var input=$('#eventTitleSize'+format),output=$('#eventTitleSize'+format+'Out');if(input)input.value=100;if(output)output.value='100%'})}}$('#selectedProductSummary').hidden=isCommemorative;$('#productNameLabel').textContent=isCommemorative?(preset.singleCommemorativeText?'Texto da data comemorativa':'Título da data comemorativa'):'Nome completo';
 $('#detailsSectionTitle').textContent=isCommemorative?'Data comemorativa':'Produto';$('#detailsSectionHint').textContent=isCommemorative?(preset.singleCommemorativeText?'Data, mês e texto editáveis':'Data, mês e título editáveis'):'Dados preenchidos pelo catálogo, mas editáveis';var imageHint=$('#imageSectionHint');if(imageHint)imageHint.textContent=usesCutout?'Envie a cena e, se tiver, o produto recortado':'A imagem oficial do produto é carregada junto com a oferta';
 // Editorias com skipProductChooser (ex: Datas comemorativas) nunca passam pela etapa "Escolher
 // produto" - o passo 2 do topo e o "Tamanho do destaque" (que só se aplica ao destaque de
 // produto/logo movível, inexistente nesse preset) somem do fluxo pra essa editoria.
 $('[data-flow-step="choose"]').hidden=!!preset.skipProductChooser;$('#flowSepChoose').hidden=!!preset.skipProductChooser;
 $('#flowStepEditNumber').textContent=preset.skipProductChooser?'2':'3';
 $('[data-flow-step="banner"]').hidden=!preset.banner;$('#flowSepBanner').hidden=!preset.banner;$('#flowStepBannerNumber').textContent=preset.skipProductChooser?'3':'4';
 $('#overlayScaleField').hidden=isCommemorative||preset.supportsOverlayScale===false;if(!fgEcommerce)$('#overlayFormatField').hidden=$('#overlayScaleField').hidden;
 $('#imageSectionHint').textContent=usesCutout?'Envie a cena e, se tiver, o produto recortado':'Envie somente a imagem de uso do produto';
 applyPresetUi(preset);syncEditoriaBadges();status('Carregando preset de '+editoria.name+'…',true);
 var assetNames=Object.keys(preset.assetSources||{}),sources=[preset.badgeFeed,preset.badgeStory].concat(assetNames.map(function(name){return preset.assetSources[name]}));
 Promise.all(sources.map(function(src){return src?loadImage(src):Promise.resolve(null)})).then(function(v){state.badgeFeed=v[0];state.badgeStory=v[1];assetNames.forEach(function(name,index){state.customAssets[name]=v[index+2]});drawAll();status('Preset de '+editoria.name+' carregado',false)}).catch(function(){drawAll();status('Preset de '+editoria.name+' carregado; algumas imagens não abriram',false)});
 if(preset.skipProductChooser){
  selectedProduct=null;state.product=null;state.productDrawable=null;state.productHasCircle=false;state.background=null;
$('#productName').value=(INCOMING_COMM&&INCOMING_COMM.title)||'NOME DA DATA';$('#eventDay').value=(INCOMING_COMM&&INCOMING_COMM.day)||'01';$('#eventMonth').value=(INCOMING_COMM&&INCOMING_COMM.month)||'JANEIRO';$('#eventPrefix').value=(INCOMING_COMM&&INCOMING_COMM.prefix)||'Dia do';
  $('#backgroundFileName').textContent='Clique ou arraste uma imagem';showEditor({},true);status('Preencha a data e envie a imagem de fundo',false);if(preset.setup)preset.setup({state:state,redraw:drawAll,status:status,incoming:INCOMING_COMM})
 }else if(!keepFlow)setFlow('choose')
}
function setProductFilePreview(src,text,fallbacks){
 var preview=$('#productFilePreview'),drop=$('#productDrop');if(!preview||!drop)return;
 preview.hidden=!src;drop.classList.toggle('has-preview',!!src);
 if(src)setImgWithFallback(preview,[src].concat(fallbacks||[]));else{preview.removeAttribute('src');preview.onerror=null}
 if(text)$('#productFileName').textContent=text
}
function setProductFilePreviewFromFile(file){
 var reader=new FileReader();reader.onload=function(){setProductFilePreview(reader.result,file.name+' · clique para alterar')};reader.readAsDataURL(file)
}
function updateSelectedSummary(item,manual){
 var thumb=$('#selectedProductThumb');thumb.innerHTML='＋';$('#selectedProductName').textContent=manual?'Produto manual':(item.name||'Produto sem nome');$('#selectedProductCode').textContent=manual?'Sem vínculo com o catálogo':(editorCodes(item).map(function(v){return v.code}).join(' · ')||'Sem código');
 var urls=!manual&&itemThumbnailUrls(item);if(urls&&urls.length){var im=document.createElement('img');im.alt='';thumb.innerHTML='';thumb.appendChild(im);setImgWithFallback(im,urls,function(){thumb.textContent='＋'})}
}
function showEditor(item,manual){updateSelectedSummary(item||{},!!manual);syncRichFromText();setFlow('edit');setTimeout(function(){drawAll()},0)}
// ===== artes salvas das demais editorias: hash do arquivo (SHA-256, 128 bits) e origem das fotos enviadas =====
var restoringSaved=false;
function hashFile(blob){return blob.arrayBuffer().then(function(b){return crypto.subtle.digest('SHA-256',b)}).then(function(d){return Array.prototype.map.call(new Uint8Array(d).slice(0,16),function(x){return('0'+x.toString(16)).slice(-2)}).join('')})}
function trackSrc(slot,file,o){o=o||{};var m={file:file,name:o.name||file.name||'',size:file.size||0,hash:o.hash||'',reduced:!!o.reduced,p:null};m.p=m.hash?Promise.resolve(m.hash):hashFile(file).then(function(h){m.hash=h;return h}).catch(function(){return''});state.srcFile[slot]=m}
// produto novo = arte nova: as fotos enviadas antes não valem mais e a arte salva anterior não é sobrescrita
function newArtSession(){state.srcFile={bg:null,product:null};if(!restoringSaved)editSession++}
function chooseManualProduct(){
 newArtSession();selectedProduct=null;$('#productName').value='';state.originalTitle='';$('#productCode').value='';$('#productCode2').value='';$('#codeCount').value='1';selectBrandLogo('VONDER');state.product=null;state.productDrawable=null;state.productHasCircle=false;state.background=null;setProductFilePreview('','PNG transparente ou foto em fundo branco');$('#backgroundFileName').textContent='Clique ou arraste uma imagem';syncCodeFields();showEditor({},true);drawAll();status('Preencha os dados e envie as imagens',false)
}
// Produto novo: fundo e destaque voltam ao centro.
function resetFormatForNewProduct(){
 ['feed','story'].forEach(function(f){var p=state.format[f]||{};state.format[f]={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0}});
 undoStack=[];updateUndoButton();editDirty=false
}
function chooseCatalogProduct(item){
 newArtSession();rememberProduct(item);selectedProduct=item;var codes=editorCodes(item);$('#productName').value=usoOn()?usoText(item,codes):editorNameFor(item);state.originalTitle=$('#productName').value;$('#productCode').value=codes[0]?codes[0].code:'';$('#productCode2').value=codes[1]?codes[1].code:'';$('#codeVariant1').value=(codes[0]&&codes[0].label)||'110 V~';$('#codeVariant2').value=(codes[1]&&codes[1].label)||'220 V~';$('#codeCount').value=codes.length>1?'2':'1';syncCodeFields();
 selectBrandLogo(normalizeBrandVariant(item.brandVariant)||(/vonder\s*plus/i.test(item.name||'')?'Vonder_plus':'VONDER'));
 state.product=null;state.productDrawable=null;state.productHasCircle=false;state.background=null;resetFormatForNewProduct();var thumbUrls=itemThumbnailUrls(item);setProductFilePreview(thumbUrls[0],'Carregada automaticamente · clique para alterar',thumbUrls.slice(1));showEditor(item,false);drawAll();
 var bgP=Promise.resolve(),bgUrl=itemBackgroundUrl(item);if(bgUrl){$('#backgroundFileName').textContent='Foto de aplicação do catálogo';bgP=loadImage(bgUrl).then(function(im){if(selectedProduct!==item)return;
  if(!im.exportSafe){$('#backgroundFileName').textContent='Envie a foto de fundo manualmente';status('Essa foto de aplicação não pode ser usada automaticamente (o servidor de origem não libera para exportação) - envie manualmente abaixo',false);return}
  state.background=trimBackgroundMargins(im);state.bgZoom.feed=1;state.bgZoom.story=1;if(item.preferredLayout){state.autoLayout=item.preferredLayout;drawAll();status('Produto e foto de aplicação carregados',false)}else analyze()
 }).catch(function(){if(selectedProduct!==item)return;$('#backgroundFileName').textContent='Envie a foto de fundo manualmente';status('Produto carregado; a foto de aplicação não abriu',false)})}else{$('#backgroundFileName').textContent='Clique ou arraste uma imagem'}
 var urls=usoOn()?[]:itemImageUrls(item,CATALOG_PRODUCT_WIDTH);if(!urls.length){status(usoOn()?'Dados preenchidos; envie a foto de fundo':'Dados preenchidos; envie a foto do produto',false);return bgP}status(bgUrl?'Carregando produto e foto de aplicação…':'Carregando e recortando a foto do catálogo…',true);$('#productFileName').textContent='Foto do catálogo · '+(codes[0]?codes[0].code:'produto')+' · clique para alterar';
 return Promise.all([bgP,loadExportSafeImage(urls).then(function(im){if(selectedProduct!==item)return;
  state.product=im;$('#productFileName').textContent='Foto do catálogo carregada · clique para alterar';$('#removeWhite').checked=!hasTransparency(im);$('#removeHoles').checked=false;return updateProduct()
 }).catch(function(err){if(selectedProduct!==item)return;console.warn('[post-editor] recorte automático falhou para',codes[0]&&codes[0].code,'-',err&&err.message,urls);status('Dados preenchidos; não foi possível carregar a foto automaticamente. Verifique a conexão e tente novamente, ou envie a foto manualmente.',false);$('#productFileName').textContent='Foto visível, mas o recorte automático falhou'})])
}
// resultados que começam pelo termo buscado (no nome ou em algum código) vêm antes dos que só
// contêm o termo em outro ponto - ex.: buscar "aspirador" mostra "Aspirador de pó..." antes de
// "Escova para aspirador"
// Busca por palavras soltas, em qualquer ordem ("aspirador 1200" acha "Aspirador de pó 1.200 W"; "1.200" e "1200" são o mesmo
// número). Texto só de números/pontos é tratado como código. O nome normalizado fica guardado no item (10 mil itens x normalize()
// a cada tecla travava a digitação) e a última busca fica memorizada.
function nameKey(item){return item._n||(item._n=normalizeText(item.name||'').replace(/(\d)[.,](\d)/g,'$1$2'))}
function queryTokens(query){return normalizeText(query).replace(/(\d)[.,](\d)/g,'$1$2').split(/[^a-z0-9\/+]+/).filter(Boolean)}
function productMatchRank(item,phrase,qc){
 var key=nameKey(item);
 if(phrase&&key.indexOf(phrase)===0)return 0;
 if(qc&&(catalogCodes(item).some(function(v){return normalizeCode(v.code).indexOf(qc)===0})||(item.codeFG&&normalizeCode(item.codeFG).indexOf(qc)===0)))return 0;
 return phrase&&key.indexOf(phrase)>0?1:2
}
var matchMemo={query:null,catalog:null,results:[]};
function matchingProducts(query){if(matchMemo.query===query&&matchMemo.catalog===catalog)return matchMemo.results;var results=computeMatchingProducts(query);matchMemo={query:query,catalog:catalog,results:results};return results}
function computeMatchingProducts(query){
 var raw=query.trim(),qc=normalizeCode(raw),tokens=queryTokens(raw),phrase=tokens.join(' '),codeQuery=/^[\d.\-\s]+$/.test(raw)&&qc.length>0;
 if(!raw)return catalog.slice(0,10);
 return catalog.filter(function(item){
  if(codeQuery)return catalogCodes(item).some(function(v){return normalizeCode(v.code).includes(qc)})||(item.codeFG&&normalizeCode(item.codeFG).includes(qc))||nameKey(item).includes(phrase);
  return tokens.length>0&&tokens.every(function(token){return nameKey(item).includes(token)})
 }).sort(function(a,b){return productMatchRank(a,phrase,codeQuery?qc:'')-productMatchRank(b,phrase,codeQuery?qc:'')})
}
// Busca no site (só perfil VONDER): complementa o catálogo quando ele não tem o produto. Lista nome+código via worker
// (/product-search); ao escolher, /product-catalog traz os mesmos campos do catalog.json e a foto vem do app.ovd pelo código.
var SITE_API='https://ecommerce-fg.vonderferramentas.workers.dev',siteSearch={q:'',status:'idle',items:[]},siteTimer=0,siteToken=0,siteAbort=null,siteCache={};
// O editor escolhe a logo pelo nome do produto; as linhas VONDER do site têm marca própria (VONDER AT e VONDER/TMX não têm logo própria).
var SITE_BRAND_LOGO={'VONDER':'VONDER','VONDER PLUS':'Vonder_plus','VONDER CONSTRUTOR':'vonder_construtor','VONDER AT':'VONDER','VONDER/TMX':'VONDER'};
function siteEligible(query){return CATALOG_SLUG==='vonder'&&query.trim().length>=3}
function usageTrack(tool,action,key){try{window.PortalUsage&&window.PortalUsage.track(tool,action,key?{dedupeKey:key}:{})}catch(e){}}
// Cancela a consulta ao site em andamento e a espera pendente (o usuário continuou digitando).
function abortSite(){siteToken++;clearTimeout(siteTimer);if(siteAbort){siteAbort.abort();siteAbort=null}}
function runSiteSearch(query){
 var q=query.trim(),token=++siteToken;
 if(siteCache[q]){siteSearch={q:q,status:'done',items:siteCache[q]};renderCatalogResults();return}
 if(siteAbort)siteAbort.abort();siteAbort=window.AbortController?new AbortController():null;
 siteSearch={q:q,status:'loading',items:[]};renderCatalogResults();
 fetch(SITE_API+'/product-search?q='+encodeURIComponent(q),siteAbort?{signal:siteAbort.signal}:{}).then(function(res){return res.json().then(function(data){return{ok:res.ok,data:data}})}).then(function(r){
  if(token!==siteToken)return;if(r.ok)siteCache[q]=r.data.items||[];siteSearch.status=r.ok?'done':'error';siteSearch.items=(r.ok&&r.data.items)||[];renderCatalogResults()
 }).catch(function(){if(token!==siteToken)return;siteSearch.status='error';renderCatalogResults()})
}
// Só dispara sozinho quando o catálogo não tem nada para o termo; com resultados locais fica o link "Buscar no site".
function scheduleSiteSearch(value){
 clearTimeout(siteTimer);
 if(siteEligible(value)&&!matchingProducts(value).length&&siteSearch.q!==value.trim())siteTimer=setTimeout(function(){
  // Medida de lacuna do catálogo: só a contagem (sem o texto buscado), uma vez por termo na sessão.
  usageTrack('post-editor-busca-sem-resultado','sem_resultado','miss:'+normalizeText(value.trim()));runSiteSearch(value)
 },500)
}
function openSiteProduct(code,button){
 var note=button.querySelector('small'),label=note.textContent;button.disabled=true;note.textContent='Consultando o site…';
 fetch(SITE_API+'/product-catalog?code='+encodeURIComponent(normalizeCode(code))).then(function(res){return res.json().then(function(data){return{ok:res.ok,data:data}})}).then(function(r){
  if(!r.ok){button.disabled=false;note.textContent=label+' · não foi possível carregar este produto';return}
  var item=r.data;item.imageUrl='https://app.ovd.com.br/fotos/produto?codigo='+normalizeCode(item.code);item.fromSite=true;item.brandVariant=SITE_BRAND_LOGO[String(item.brand||'').toUpperCase()]||item.brandVariant;
  usageTrack('post-editor-produto-do-site','escolhido','site:'+normalizeCode(item.code));chooseCatalogProduct(item);status('Produto vindo do site, fora do catálogo: revise os dados antes de usar.',false)
 }).catch(function(){button.disabled=false;note.textContent=label+' · não foi possível consultar o site agora'})
}
function skeletonHtml(){return'<div class="pe-catalog-group">Buscando no site…</div>'+'<div class="pe-catalog-item pe-skeleton" aria-hidden="true"><span class="pe-selected-thumb"></span><span><strong>&nbsp;</strong><small>&nbsp;</small></span></div>'.repeat(4)}
function visibleSiteItems(query){return siteEligible(query)&&siteSearch.q===query.trim()&&siteSearch.status==='done'?siteSearch.items:[]}
function siteResultsHtml(query,hasLocal,localCount){
 var state=siteSearch.q===query.trim()?siteSearch.status:'idle',note=function(title,text,action){return'<div class="pe-catalog-empty"><strong>'+title+'</strong>'+(text?'<p>'+text+'</p>':'')+(action||'')+'</div>'};
 if(state==='idle')return hasLocal?'<button type="button" class="pe-catalog-more" id="siteMore">Não encontrou? Buscar no site</button>':skeletonHtml();
 if(state==='loading')return hasLocal?'<div class="pe-catalog-group">Buscando no site…</div>':skeletonHtml();
 if(state==='error')return note('Não foi possível consultar o site agora','Tente novamente ou use "Continuar sem catálogo".','<button type="button" class="pe-catalog-site" id="siteRetry">Tentar novamente</button>');
 if(!siteSearch.items.length)return note('Nenhum produto encontrado no site','Confira o nome ou o código, ou use "Continuar sem catálogo".');
 return'<div class="pe-catalog-group">Encontrados no site</div>'+siteSearch.items.map(function(item,index){var focused=localCount+index===catalogFocus;return'<button type="button" class="pe-catalog-item'+(focused?' is-focused':'')+'" data-site-index="'+index+'" role="option" aria-selected="'+focused+'">'+(item.thumb?'<img alt="" loading="lazy" decoding="async">':'<span class="pe-selected-thumb">＋</span>')+'<span><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(item.code)+'</small></span><span>›</span></button>'}).join('')
}
// Usados recentemente (neste navegador, por marca): aparecem quando o campo está vazio. Guarda o produto inteiro, sem os campos internos "_".
var RECENT_KEY='pe_recent_products_v1'+BRAND_SUFFIX,RECENT_MAX=6;
function recentProducts(){try{var list=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(list)?list:[]}catch(e){return[]}}
function rememberProduct(item){try{var list=recentProducts().filter(function(r){return r.code!==item.code});list.unshift(item);localStorage.setItem(RECENT_KEY,JSON.stringify(list.slice(0,RECENT_MAX),function(key,value){return key.charAt(0)==='_'?undefined:value}))}catch(e){}}
var CATALOG_VISIBLE=40;
function resultList(query){
 var q=query.trim(),base=q?matchingProducts(query):[],recents=q?[]:recentProducts(),all=q?base:recents;
 return{all:all,recents:recents.length,local:all.slice(0,CATALOG_VISIBLE)}
}
// Sem texto digitado não lista produtos fixos (eram sempre os mesmos): mostra os recentes e atalhos por tipo de produto,
// tirados da primeira palavra do nome (as mais frequentes do catálogo).
var chipMemo={catalog:null,html:''};
function categoryChipsHtml(){
 if(chipMemo.catalog===catalog)return chipMemo.html;
 var counts={},label={};
 catalog.forEach(function(item){var word=(item.name||'').trim().split(/\s+/)[0]||'',key=nameKey({name:word});if(key.length<4||/\d/.test(key))return;counts[key]=(counts[key]||0)+1;label[key]=label[key]||word.charAt(0).toUpperCase()+word.slice(1).toLowerCase()});
 var top=Object.keys(counts).filter(function(k){return counts[k]>=3}).sort(function(a,b){return counts[b]-counts[a]}).slice(0,14);
 chipMemo={catalog:catalog,html:top.length?'<div class="pe-catalog-group">Explorar sugestões</div><div class="pe-catalog-chips">'+top.map(function(k){return'<button type="button" class="pe-catalog-chip" data-browse="'+escapeHtml(label[k])+'">'+escapeHtml(label[k])+'</button>'}).join('')+'</div>':''};
 return chipMemo.html
}
function renderCatalogResults(){
 var query=$('#catalogSearch').value,rl=resultList(query),matches=rl.local,all=rl.all,box=$('#catalogResults'),siteItems=visibleSiteItems(query);
 catalogFocus=Math.min(catalogFocus,Math.max(0,matches.length+siteItems.length-1));
 if(catalogLoading){box.innerHTML='<div class="pe-catalog-empty"><strong>Carregando catálogo…</strong>Buscando os produtos disponíveis.</div>';return}
 var siteState=siteEligible(query)&&siteSearch.q===query.trim()?siteSearch.status:'idle',found=matchingProducts(query).length;
 if(!catalog.length){box.innerHTML='<div class="pe-catalog-empty"><strong>O catálogo ainda está vazio</strong>Cadastre produtos em Configurações no calendário ou continue sem catálogo.</div>';return}
 var site=siteEligible(query)?siteResultsHtml(query,matches.length>0,matches.length):'';
 var browse=query.trim()?'':categoryChipsHtml();
 if(!matches.length&&!site&&!browse){box.innerHTML='<div class="pe-catalog-empty"><strong>Nenhum produto encontrado</strong><p>Tente buscar apenas uma parte do nome ou os números do código.</p></div>';return}
 box.innerHTML=matches.map(function(item,index){var hasImage=!!itemThumbnailUrls(item).length,heading=rl.recents&&index===0?'<div class="pe-catalog-group">Usados recentemente</div>':'';return heading+'<button type="button" class="pe-catalog-item'+(index===catalogFocus?' is-focused':'')+'" data-catalog-index="'+index+'" role="option" aria-selected="'+(index===catalogFocus)+'">'+(hasImage?'<img alt="" loading="lazy" decoding="async">':'<span class="pe-selected-thumb" data-thumb="'+thumbKey(item)+'">＋</span>')+'<span><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(editorCodes(item).map(function(v){return v.code}).join(' · '))+'</small></span><span>›</span></button>'}).join('')+(all.length>matches.length?'<div class="pe-catalog-group">Mostrando os '+matches.length+' primeiros de '+all.length+' · refine a busca</div>':'')+site+browse;
 if(hostedThumbs()){applyThumbs();loadThumbs(matches);queueHeavy(matches.map(thumbKey).filter(function(key){return key&&thumbCache[key]===''}))}
 $$('#catalogResults [data-catalog-index]').forEach(function(btn){
  var item=matches[Number(btn.dataset.catalogIndex)];
  btn.addEventListener('click',function(){chooseCatalogProduct(item)});
  var img=btn.querySelector('img');if(img)setImgWithFallback(img,itemThumbnailUrls(item))
 });
 $$('#catalogResults [data-site-index]').forEach(function(btn){var item=siteSearch.items[Number(btn.dataset.siteIndex)],img=btn.querySelector('img');btn.addEventListener('click',function(){openSiteProduct(item.code,btn)});if(img)setImgWithFallback(img,[item.thumb],function(){var ph=document.createElement('span');ph.className='pe-selected-thumb';ph.textContent='＋';img.replaceWith(ph)})});
 $$('#catalogResults [data-browse]').forEach(function(btn){btn.addEventListener('click',function(){var input=$('#catalogSearch');input.value=btn.dataset.browse;input.dispatchEvent(new Event('input'));input.focus()})});
 var more=$('#siteMore'),retry=$('#siteRetry');if(more)more.addEventListener('click',function(){runSiteSearch(query)});if(retry)retry.addEventListener('click',function(){runSiteSearch(query)})
}
// carrega o catálogo desta marca via CatalogProvider (ver catalog-provider.js) - nunca lê
// JSON nem localStorage diretamente aqui, só consome a Promise; assim, se a origem do
// catálogo mudar no futuro (API própria, scraping agendado, etc.), só CatalogProvider muda
var catalogReady=Promise.resolve();
function loadCatalog(){
 catalog=[];catalogFocus=0;catalogLoading=true;renderCatalogResults();
 if(typeof CatalogProvider==='undefined'){catalogLoading=false;renderCatalogResults();return}
 catalogReady=CatalogProvider.load(CATALOG_SLUG).then(function(result){
  catalog=result.items;catalogFocus=0;catalogLoading=false;renderCatalogResults();
  if(result.source==='cache')status('Catálogo carregado da cópia local (sem conexão com o servidor)',false)
 }).catch(function(){})
}
function status(message,busy){var el=$('#editorStatus');el.classList.toggle('is-busy',!!busy);el.querySelector('span:last-child').textContent=message}
// carrega uma imagem e marca em im.exportSafe se ela pode ser desenhada no canvas sem
// "contaminar" a exportação (toBlob/toDataURL). Mesma origem e data: URI são sempre seguras;
// uma origem externa só é segura se o servidor permitir CORS (daí o XHR como blob funcionar -
// nesse caso os bytes já vieram pra cá, então a imagem final é local pro navegador). Quando o
// servidor de origem não manda CORS (caso do endpoint de fotos usado pelo catálogo da VONDER,
// ver data/catalog-vonder.json), a única forma de exibir a imagem é via <img src> direto - o
// que funciona pra pré-visualização, mas deixa qualquer canvas que a desenhar permanentemente
// impedido de exportar (é uma trava do próprio navegador, não tem como contornar sem o
// servidor de origem cooperar). Por isso quem chama loadImage() para desenhar em canvas
// (chooseCatalogProduct) precisa checar im.exportSafe ANTES de desenhar, e não depois.
function loadImage(src){return new Promise(function(resolve,reject){
 function direct(safe){var im=new Image();im.onload=function(){im.exportSafe=safe;resolve(im)};im.onerror=reject;im.src=src}
 if(/^data:/.test(src)){direct(true);return}
 var sameOrigin=true;try{sameOrigin=new URL(src,location.href).origin===location.origin}catch(e){}
 if(sameOrigin){direct(true);return}
 try{var xhr=new XMLHttpRequest();xhr.open('GET',src,true);xhr.responseType='blob';xhr.onload=function(){if(!xhr.response||(xhr.status&&xhr.status>=400)){direct(false);return}var u=URL.createObjectURL(xhr.response),im=new Image();im.onload=function(){URL.revokeObjectURL(u);im.exportSafe=true;resolve(im)};im.onerror=function(){URL.revokeObjectURL(u);direct(false)};im.src=u};xhr.onerror=function(){direct(false)};xhr.send()}catch(e){direct(false)}
})}
function loadExportSafeImage(urls){return new Promise(function(resolve,reject){
 var list=(urls||[]).filter(Boolean),index=0;
 function next(){if(index>=list.length){reject(new Error('Nenhuma origem exportável'));return}loadImage(list[index++]).then(function(im){if(im.exportSafe)resolve(im);else next()}).catch(next)}
 next()
})}
// ============================================================
// MARCA NO CABEÇALHO - biblioteca de logos em post-editor-assets/brands/*.svg (centenas de
// marcas). Os SVGs brutos são fontes locais e ficam fora do Git. Cada um tem um "wrapper"
// publicado em post-editor-assets/brands-js/ (mesmo nome + .js), que registra uma data: URI em
// window.OVD_BRAND_LOGOS. Uma tag <script> carrega o wrapper sem restrição de CORS sob file://;
// a mesma data: URI alimenta canvas e miniaturas sem depender da pasta-fonte ignorada.
var BRAND_MANIFEST=window.OVD_BRAND_MANIFEST||['VONDER','Vonder_plus'];
var BRAND_LOGO_CACHE={};
function displayBrandName(name){return String(name||'').replace(/_/g,' ')}
// compatibilidade com o antigo valor de item.brandVariant salvo no catálogo ('vonder'/'vonder-plus')
function normalizeBrandVariant(value){if(!value)return null;if(/^vonder-plus$/i.test(value))return'Vonder_plus';if(/^vonder$/i.test(value))return'VONDER';return value}
function brandLogoForOffer(brand,title){var target=normalizeText(String(brand||'')),exact=target&&BRAND_MANIFEST.filter(function(name){return normalizeText(displayBrandName(name))===target})[0];if(exact)return exact;if(target)return null;var haystack=normalizeText(String(title||'')),matches=BRAND_MANIFEST.filter(function(name){var candidate=normalizeText(displayBrandName(name));return candidate.length>1&&new RegExp('(^|[^a-z0-9])'+candidate.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^a-z0-9])').test(haystack)});matches.sort(function(a,b){return normalizeText(displayBrandName(b)).length-normalizeText(displayBrandName(a)).length});return matches[0]||null}
function loadBrandLogoImage(name){
 if(!name)return Promise.resolve(null);
 if(BRAND_LOGO_CACHE[name])return BRAND_LOGO_CACHE[name];
 var p=new Promise(function(resolve,reject){
  if(window.OVD_BRAND_LOGOS&&window.OVD_BRAND_LOGOS[name]){resolve(window.OVD_BRAND_LOGOS[name]);return}
  var script=document.createElement('script');
  script.src='post-editor-assets/brands-js/'+encodeURIComponent(name)+'.js';
  script.onload=function(){var uri=window.OVD_BRAND_LOGOS&&window.OVD_BRAND_LOGOS[name];if(uri)resolve(uri);else reject(new Error('Logo não encontrado: '+name))};
  script.onerror=function(){reject(new Error('Falha ao carregar o logo de '+name))};
  document.head.appendChild(script)
 }).then(function(dataUri){return loadImage(dataUri)});
 BRAND_LOGO_CACHE[name]=p;return p
}
// O logo carrega de forma assíncrona, então o drawAll() de quem chamou (chooseManualProduct/
// chooseCatalogProduct) sempre roda antes da imagem existir. Por isso o redraw daqui, quando ela
// termina de carregar, é obrigatório: sem ele a arte fica sem o logo até algo redesenhar por acaso.
function selectBrandLogo(name){
 state.brandLogoName=name;
 var nameEl=$('#brandLogoName');if(nameEl)nameEl.textContent=displayBrandName(name);
 var thumb=$('#brandLogoThumb');
 if(thumb){thumb.innerHTML='';var im=document.createElement('img');im.alt='';thumb.appendChild(im)}
 loadBrandLogoImage(name).then(function(img){
  if(state.brandLogoName!==name)return;
  var thumbImg=$('#brandLogoThumb img');if(thumbImg)thumbImg.src=img.src;
  state.customAssets.brandLogo=img;
  drawAll()
 }).catch(function(){
  if(state.brandLogoName===name)status('Não foi possível carregar o logo de '+displayBrandName(name),false)
 })
}
function matchingBrandLogos(query){
 var q=normalizeText(String(query||'').trim());
 var results=BRAND_MANIFEST.filter(function(name){return!q||normalizeText(name).indexOf(q)>=0});
 results.sort(function(a,b){var ar=normalizeText(a).indexOf(q)===0?0:1,br=normalizeText(b).indexOf(q)===0?0:1;return ar-br||a.localeCompare(b)});
 return results.slice(0,q?40:20)
}
function renderBrandLogoResults(){
 var input=$('#brandLogoSearch'),box=$('#brandLogoResults');if(!input||!box)return;
 var matches=matchingBrandLogos(input.value);
 if(!matches.length){box.innerHTML='<div class="pe-catalog-empty"><strong>Nenhuma marca encontrada</strong>Tente buscar por outro termo.</div>';return}
 box.innerHTML=matches.map(function(name,index){
  return '<button type="button" class="pe-catalog-item" data-brand-index="'+index+'"><img alt="" loading="lazy" decoding="async"><span><strong>'+escapeHtml(displayBrandName(name))+'</strong></span><span>›</span></button>'
 }).join('');
 $$('#brandLogoResults [data-brand-index]').forEach(function(btn){
  var name=matches[Number(btn.dataset.brandIndex)];
  loadBrandLogoImage(name).then(function(img){var thumb=btn.querySelector('img');if(thumb)thumb.src=img.src}).catch(function(){btn.classList.add('is-unavailable')});
  btn.addEventListener('click',function(){
   selectBrandLogo(name);
   $('#brandLogoPicker').hidden=true;$('#brandLogoSummary').hidden=false
  })
 })
}
function trimBackgroundMargins(im){var c=document.createElement('canvas');c.width=im.width;c.height=im.height;var ctx=c.getContext('2d');ctx.drawImage(im,0,0);var pixels=ctx.getImageData(0,0,c.width,c.height).data,minX=c.width,minY=c.height,maxX=-1,maxY=-1;for(var y=0;y<c.height;y++)for(var x=0;x<c.width;x++){var i=(y*c.width+x)*4;if(pixels[i+3]>8&&(pixels[i]<245||pixels[i+1]<245||pixels[i+2]<245)){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}}if(maxX<minX||maxY<minY)return im;var cropW=maxX-minX+1,cropH=maxY-minY+1;if(cropW>=c.width*.98&&cropH>=c.height*.98)return im;var inset=3;minX=Math.min(maxX,minX+inset);minY=Math.min(maxY,minY+inset);maxX=Math.max(minX,maxX-inset);maxY=Math.max(minY,maxY-inset);cropW=maxX-minX+1;cropH=maxY-minY+1;var out=document.createElement('canvas');out.width=cropW;out.height=cropH;out.getContext('2d').drawImage(c,minX,minY,cropW,cropH,0,0,cropW,cropH);return out}
function drawPlaceholder(ctx,t){
 var g=ctx.createLinearGradient(0,0,t.w,t.h);g.addColorStop(0,'#202427');g.addColorStop(.48,'#5a5f5d');g.addColorStop(1,'#1d201f');ctx.fillStyle=g;ctx.fillRect(0,0,t.w,t.h);
 ctx.save();ctx.globalAlpha=.13;ctx.fillStyle='#fff';for(var i=0;i<8;i++){ctx.fillRect(i*170-120,t.h*.62,100,t.h*.38)}ctx.restore()
}
// limita o deslocamento de arraste (bgDx/bgDy) pra imagem desenhada com largura/altura w×h
// nunca deixar de cobrir o quadro w0×h0 - sem isso, arrastar no zoom mínimo (onde a imagem só
// encosta nas bordas, sem sobra) expõe canvas vazio/transparente pra fora da arte. Uma margem
// mínima de folga.
function clampOffset(d,size,frameSize){var slack=Math.max(0,(size-frameSize)/2);return Math.max(-slack,Math.min(slack,d))}
// zoom nunca pode ir abaixo de 1 (o necessário pra cobrir 100% do frame): a imagem de fundo
// sempre cobre o quadro inteiro, nunca aparece fundo auxiliar/blur, e o arraste (clampOffset)
// atua só sobre essa imagem real, nunca sobre uma camada de preenchimento separada. Em 100% a
// escala é exatamente a de cobertura, então o recorte é o menor possível - quem precisar de folga
// pra arrastar nos dois eixos aumenta o zoom.
// visibleH: altura que de fato precisa ser coberta. Presets com rodapé opaco (faixa que tampa a
// base da arte) passam o topo do rodapé, senão a foto seria ampliada e travada por causa de uma
// faixa que ninguém enxerga - o que corta imagem à toa e engessa o arraste.
function drawCover(ctx,img,t,format,visibleH){
 var frameH=visibleH>0?visibleH:t.h,cover=Math.max(t.w/img.width,frameH/img.height),p=state.format[format],zoom=Math.max(1,state.bgZoom[format]);
 ctx.save();ctx.beginPath();ctx.rect(0,0,t.w,t.h);ctx.clip();
 var s=cover*zoom,w=img.width*s,h=img.height*s,dx=clampOffset(p.bgDx,w,t.w),dy=clampOffset(p.bgDy,h,frameH),x=(t.w-w)/2+dx,y=(frameH-h)/2+dy;ctx.drawImage(img,x,y,w,h);
 ctx.restore()
}
function roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function splitName(raw){
 raw=String(raw||'').trim();var lines=raw.split(/\r?\n/).map(function(v){return v.trim()}).filter(Boolean);if(lines.length>1)return{title:lines[0],sub:lines.slice(1).join(' ')};
 var clean=raw.replace(/\s+/g,' '),digit=clean.search(/\d/),desc=clean.toLowerCase().search(/\scom\s+(proteção|protecao|revestimento|acabamento)/),range=clean.match(/\b\d+\s*(?:a|x)\s*\d+\s*(?:mm|cm|m|ml|l|kg|g|pol)\b/i),cut=range&&clean.slice(range.index+range[0].length).trim()?range.index+range[0].length:-1;if(cut<0&&digit>3&&clean.slice(0,digit).trim().length<=38)cut=digit;if(desc>4&&(cut<0||desc<cut))cut=desc;if(cut>0)return{title:clean.slice(0,cut).replace(/[,\s]+$/,''),sub:clean.slice(cut).trim()};if(clean.length<=28)return{title:clean,sub:''};var words=clean.split(' '),title='',i=0;
 for(;i<words.length;i++){var next=(title+' '+words[i]).trim();if(next.length>30&&title)break;title=next}return{title:title,sub:words.slice(i).join(' ')}
}
function font(size){return '700 italic '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif'}
function fitFont(ctx,text,max,size,min){ctx.font=font(size);while(size>min&&ctx.measureText(text).width>max){size-=2;ctx.font=font(size)}return size}
function layout(format){var l=state.ov[format].layout;return l==='auto'?state.autoLayout:l}
// mesma ideia do clampOffset da imagem de fundo, mas pra posição absoluta (não deslocamento a
// partir do centro): mantém a caixa do selo/produto sempre dentro do frame, deslizando de
// encostada-na-borda-esquerda/topo (0) até encostada-na-borda-direita/baixo (frame-size); se a
// caixa for maior que o frame (fora do uso normal), ainda assim nunca deixa ela sair de vez
function clampBoxPos(pos,size,frame){var lo=Math.min(0,frame-size),hi=Math.max(0,frame-size);return Math.max(lo,Math.min(hi,pos))}
// escala em torno de um único ponto (anchor) compartilhado entre produto e selo, em vez do
// centro de cada caixa isoladamente - assim a distância entre as duas encolhe na mesma
// proporção do "Tamanho do destaque" e, se já estavam encostadas/sobrepostas, continuam
// encostadas/sobrepostas em qualquer zoom (sem abrir vão entre elas)
function scaled(box,format,anchor){var s=state.ov[format].scale,p=state.format[format],t=templates[format],ax=anchor[0],ay=anchor[1],w=box[2]*s,h=box[3]*s,x=clampBoxPos(ax+(box[0]-ax)*s+p.overlayDx,w,t.w),y=clampBoxPos(ay+(box[1]-ay)*s+p.overlayDy,h,t.h);return[x,y,w,h]}
function contain(ctx,img,box){
 var s=Math.min(box[2]/img.width,box[3]/img.height),w=img.width*s,h=img.height*s;ctx.drawImage(img,box[0]+(box[2]-w)/2,box[1]+(box[3]-h)/2,w,h)
}
function drawProduct(ctx,box,format){
 var im=state.productDrawable;if(!im)return;if(state.productHasCircle){contain(ctx,im,box);return}
 var cx=box[0]+box[2]/2,cy=box[1]+box[3]/2,r=Math.min(box[2],box[3])*.48,style=state.ov[format].circleStyle;ctx.save();ctx.fillStyle=style==='yellow'?'#F6BE00':'#FFFFFF';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
 // borda desenhada pra dentro (centro do traço em r-w/2): o círculo mantém o tamanho original
 if(style==='white-border'){var bw=r*.08;ctx.strokeStyle='#F6BE00';ctx.lineWidth=bw;ctx.beginPath();ctx.arc(cx,cy,r-bw/2,0,Math.PI*2);ctx.stroke()}
 ctx.shadowColor='rgba(0,0,0,.38)';ctx.shadowBlur=18;ctx.shadowOffsetY=12;var k=state.ov[format].photo,iw=box[2]*.84*k,ih=box[3]*.84*k;contain(ctx,im,[box[0]+box[2]*.5-iw/2,box[1]+box[3]*.47-ih/2,iw,ih]);ctx.restore()
}
// 2 códigos: as pastilhas seguem sangrando até a borda direita da arte (como a de 1 código), mas o texto
// termina na margem lateral (t.w-safeX); a borda esquerda nunca chega no nome do produto (minLeft) e, se
// não couber, a fonte reduz até 20px.
function drawDualCodes(ctx,t,y,rows,minLeft){
 var h=42,right=t.w-t.safeX,size=29,labelFont,codeFont,m,left;rows=rows.map(function(r){return{label:(r[0]||'').toUpperCase(),code:r[1]||''}});
 do{labelFont='700 italic '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif';codeFont='400 italic '+size+'px "Swiss721Editor","Arial Narrow",Arial,sans-serif';
  m=rows.map(function(r){ctx.font=labelFont;var lw=ctx.measureText(r.label).width;ctx.font=codeFont;return{lw:lw,total:lw+16+20+ctx.measureText(r.code).width}});
  left=right-(Math.max.apply(null,m.map(function(v){return v.total}))+20);size--}while(size>=20&&left<minLeft);
 rows.forEach(function(r,i){var ry=y+i*49;roundRect(ctx,left,ry,t.w+40-left,h,22);ctx.fillStyle='#fff';ctx.fill();
  var x=left+20;ctx.fillStyle='#080808';ctx.textBaseline='middle';ctx.textAlign='left';ctx.font=labelFont;ctx.fillText(r.label,x,ry+h/2+1);x+=m[i].lw+16;ctx.font='700 18px Arial,sans-serif';ctx.fillText('•',x,ry+h/2);x+=20;ctx.font=codeFont;ctx.fillText(r.code,x,ry+h/2+1)})
}
// ===== Título editável (só Destaques da VONDER): negrito/itálico/sublinhado + minúsculas, revisão de texto =====
// A base da arte é negrito+itálico MAIÚSCULO; o texto entra em maiúsculas e a pessoa pode mudar. O #productName (oculto) guarda o
// texto puro (nomes de arquivo, etc.) e state.titleHtml só as marcas <b>/<i>/<u> (CartazTitleFormat, o mesmo do Gerador de Cartazes).
function usoOn(){return BRAND_SUFFIX===''&&state.editoriaName===USO_NAME}
function richOn(){return BRAND_SUFFIX===''&&state.editoriaName==='Destaques'||usoOn()}
// Uso e Recomendo: o texto da faixa amarela é itálico regular (Destaques é negrito+itálico) e já traz o código no fim ("NOME - 00.00.000.000")
function usoText(item,codes){var name=String(item.name||'').replace(/[,\s]*VONDER\s*$/i,'').replace(/\s+/g,' ').trim(),code=codes[0]&&codes[0].code;return(name+(code?' - '+code:'')).toUpperCase()}
function richPlain(root){var out='';(function walk(n){n.childNodes.forEach(function(c){if(c.nodeType===3)out+=c.nodeValue;else if(c.nodeType===1){if(c.tagName==='BR')out+='\n';else walk(c)}})})(root);return out.replace(/ /g,' ')}
function richHtmlFromText(text){return escapeHtml(text).replace(/\n/g,'<br>')}
function syncRichFromText(){
 var on=richOn(),rich=$('#productNameRich'),ta=$('#productName');rich.hidden=!on;rich.classList.toggle('is-regular',usoOn());ta.hidden=on;$('#titleReviewBox').hidden=!on;$('#titleReviewList').hidden=true;
 if(!on)return;state.titleHtml='';ta.value=ta.value.toUpperCase();rich.innerHTML=richHtmlFromText(ta.value);normalizeTitle(rich);
 if(document.fonts)Promise.all(['400 20px','italic 400 20px','700 20px','italic 700 20px'].map(function(f){return document.fonts.load(f+' "Swiss721Editor"')})).then(drawAll)
}
function richChars(){
 var chars=[],box=document.createElement('div');box.innerHTML=state.titleHtml||richHtmlFromText($('#productName').value);
 (function walk(n,st){n.childNodes.forEach(function(c){
  if(c.nodeType===3){c.nodeValue.split('').forEach(function(ch){chars.push({c:ch,b:st.b,i:st.i,u:st.u})})}
  else if(c.nodeType===1){if(c.tagName==='BR'){chars.push({c:'\n'});return}
   var s={b:st.b,i:st.i,u:st.u},cl=c.classList;if(c.tagName==='B'||c.tagName==='STRONG')s.b=true;if(c.tagName==='I'||c.tagName==='EM')s.i=true;if(c.tagName==='U')s.u=true;if(cl.contains('fn'))s.i=false;if(cl.contains('wn'))s.b=false;walk(c,s)}})})(box,{b:!usoOn(),i:true,u:false});
 return chars
}
// mesma divisão título/subtítulo do splitName (Enter = nova linha), mas carregando o estilo de cada letra
function richParts(){
 var chars=richChars(),lines=[[]];chars.forEach(function(ch){if(ch.c==='\n')lines.push([]);else lines[lines.length-1].push(ch)});
 function tidy(arr){var out=[];arr.forEach(function(ch){if(/\s/.test(ch.c)){if(out.length&&out[out.length-1].c!==' ')out.push({c:' ',b:ch.b,i:ch.i,u:ch.u})}else out.push(ch)});if(out.length&&out[out.length-1].c===' ')out.pop();return out}
 lines=lines.map(tidy).filter(function(l){return l.length});if(!lines.length)return{title:[],sub:[]};
 // 3 linhas: as duas primeiras são o título (2 linhas) e a terceira o subtítulo; 2 linhas: título + subtítulo; a 4ª em diante emenda no subtítulo
 function join(ls){var out=[];ls.forEach(function(l,k){if(k)out.push({c:' ',b:true,i:true,u:false});out=out.concat(l)});return out}
 if(lines.length>2)return{title:lines[0],title2:lines[1],sub:join(lines.slice(2))};
 if(lines.length>1)return{title:lines[0],sub:join(lines.slice(1))};
 var line=lines[0],sp=splitName(line.map(function(ch){return ch.c}).join(''));return{title:line.slice(0,sp.title.length),sub:sp.sub?line.slice(line.length-sp.sub.length):[]}
}
function richRuns(chars){var runs=[];chars.forEach(function(ch){var r=runs[runs.length-1];if(r&&r.b===ch.b&&r.i===ch.i&&r.u===ch.u)r.t+=ch.c;else runs.push({t:ch.c,b:ch.b,i:ch.i,u:ch.u})});return runs}
function richFont(r,size){return(r.b?'700':'400')+' '+(r.i?'italic':'normal')+' '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif'}
function richWidth(ctx,runs,size){return runs.reduce(function(w,r){ctx.font=richFont(r,size);return w+ctx.measureText(r.t).width},0)}
// desenha uma linha de runs encolhendo a fonte (de size até min) até caber em maxW; devolve o x final
function drawRich(ctx,chars,x,y,maxW,size,min){
 var runs=richRuns(chars);if(!runs.length)return x;while(size>min&&richWidth(ctx,runs,size)>maxW)size-=2;drawRich.size=size;
 runs.forEach(function(r){ctx.font=richFont(r,size);var w=ctx.measureText(r.t).width;ctx.fillText(r.t,x,y);if(r.u)ctx.fillRect(x,y+size*.98,w,Math.max(2,size/16));x+=w});return x
}
// A arte aceita até 3 linhas: 2 de título (o texto encolhe para caber) e 1 de subtítulo. Para o campo e a caixa sobre a arte mostrarem o mesmo
// que a arte, só as 2 primeiras quebras de linha valem (as outras viram espaço) e Enter não cria uma 4ª linha. Texto digitado numa linha só
// que a arte divide sozinha em título + subtítulo (splitName) ganha essa quebra de verdade, para a caixa não discordar da arte.
function capBreaks(root){var brs=root.querySelectorAll('br'),changed=false;for(var n=2;n<brs.length;n++){brs[n].replaceWith(document.createTextNode(' '));changed=true}return changed}
function normalizeTitle(root){if(usoOn())return false;var changed=capBreaks(root);if(!root.querySelector('br')&&!state.titleHtml){var sp=splitName(richPlain(root));if(sp.sub){root.innerHTML=escapeHtml(sp.title)+'<br>'+escapeHtml(sp.sub);changed=true}}if(changed)applyRichInput(root);return changed}
function enterKey(ev,root){if(ev.key!=='Enter')return;ev.preventDefault();if(usoOn()||root.querySelectorAll('br').length<2)document.execCommand('insertLineBreak')}
// src = o campo do painel ou a caixa de edição sobre a arte: os dois mostram o mesmo texto e o mesmo state, então Feed e Story mudam juntos
function applyRichInput(src){var rich=$('#productNameRich');if(src!==rich)rich.innerHTML=CartazTitleFormat.sanitize(src,{keepBr:true,always:true});$('#productName').value=richPlain(src);state.titleHtml=CartazTitleFormat.sanitize(src,{keepBr:true});$('#titleReviewList').hidden=true;drawAll()}
$('#productNameRich').addEventListener('keydown',function(ev){enterKey(ev,this)});
$('#productNameRich').addEventListener('input',function(){applyRichInput(this)});
// Duplo clique no texto do rodapé (nome ou código) abre uma caixa de edição em cima dele. Só Destaques da VONDER.
var footerEdit=null;
function closeFooterEdit(){if(footerEdit){var el=footerEdit;footerEdit=null;if(el.parentNode)el.parentNode.removeChild(el);if(el.onClose)el.onClose();
 // a barra flutuante B/I/U (cartaz-title-format.js) só se esconde quando a seleção muda; ao remover a caixa ela ficava na tela
 getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'))}}
// Uso e Recomendo: o texto da faixa amarela é um parágrafo que quebra sozinho, então a caixa de edição mostra o próprio texto (não é transparente
// como a do rodapé do Destaques) e a arte deixa de desenhá-lo enquanto ela está aberta (state.usoEditing); a faixa segue crescendo com as linhas.
function openUsoEdit(format,c,px,py){
 var t=templates[format],u=t.uso;if(!u||!boxHit([u.yx,u.yTop,u.yw,u.yh],px,py))return false;
 closeFooterEdit();var el=document.createElement('div');el.className='pe-uso-edit';el.contentEditable='true';el.spellcheck=true;el.innerHTML=$('#productNameRich').innerHTML;
 el.place=function(){var rect=c.getBoundingClientRect(),wr=c.parentNode.getBoundingClientRect(),k=rect.width/c.width,u=t.uso;
  el.style.left=(rect.left-wr.left+(u.yx+u.textX)*k)+'px';el.style.width=(u.textW*k)+'px';el.style.fontSize=u.size*k+'px';el.style.letterSpacing=u.spacing*k+'px';el.style.lineHeight=u.pitch*k+'px';el.style.top=(rect.top-wr.top+u.yTop*k)+'px';
  // a fonte posiciona a linha de base de um jeito no HTML e de outro no canvas: mede onde o navegador pôs a 1ª e empurra até a da arte
  var probe=document.createElement('span');probe.style.cssText='display:inline-block;width:0;height:0';el.insertBefore(probe,el.firstChild);
  var delta=rect.top+(u.yTop+u.baseline1)*k-probe.getBoundingClientRect().bottom;el.removeChild(probe);el.style.top=(parseFloat(el.style.top)+delta)+'px'};
 el.addEventListener('keydown',function(ev){if(ev.key==='Enter')enterKey(ev,el);else if(ev.key==='Escape')closeFooterEdit()});
 el.addEventListener('input',function(){applyRichInput(el);el.place()});el.addEventListener('blur',function(){setTimeout(function(){if(footerEdit===el)closeFooterEdit()},0)});
 el.onClose=function(){state.usoEditing=null;autoFormatTextCodes();drawAll()};state.usoEditing=format;drawAll();
 c.parentNode.appendChild(el);el.place();footerEdit=el;el.focus();getSelection().selectAllChildren(el);return true
}
// conteúdo da caixa sobre a arte: cada linha no tamanho de fonte que a arte usou nela (em relação à última linha, que é o tamanho-base da caixa)
function overlayTitleHtml(t){var L=t.richLines||[{size:48},{size:30}],base=L[L.length-1].size;
 return $('#productNameRich').innerHTML.split(/<br\s*\/?>/i).map(function(piece,i){var d=document.createElement('div');d.innerHTML=piece;var ln=L[Math.min(i,L.length-1)];return'<span style="font-size:'+(ln.size/base)+'em;vertical-align:top;position:relative">'+d.innerHTML+'</span>'}).join('<br>')}
// A fonte tem métricas próprias (área do texto acima/abaixo da linha de base) e o canvas e o HTML as posicionam de formas diferentes: depois
// de montar a caixa, mede onde o navegador pôs cada linha e a empurra até o topo da área do texto que a arte desenha (textBaseline 'top').
function calibrateTitleEdit(el,t,k,rect){
 var L=t.richLines;if(!L)return;var cx=document.createElement('canvas').getContext('2d'),brs=el.querySelectorAll('br');cx.textBaseline='top';
 Array.prototype.forEach.call(el.children,function(sp){if(sp.tagName!=='SPAN')return;
  var idx=0;Array.prototype.forEach.call(brs,function(b){if(sp.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING)idx++});idx=Math.min(idx,L.length-1);
  cx.font=richFont({b:true,i:true},L[idx].size);var fba=cx.measureText('H').fontBoundingBoxAscent||0,rs=sp.getClientRects();if(!rs.length)return;
  var delta=rect.top+(L[idx].y-fba)*k-rs[0].top;sp.style.top=((parseFloat(sp.style.top)||0)+delta)+'px'})
}
function openFooterEdit(format,c,px,py){
 var t=templates[format],dual=$('#codeCount').value==='2',kind=null,getBox,size;
 // A caixa fica exatamente sobre o texto da arte (mesma fonte, tamanho e posição), só com um contorno tracejado avisando que a edição está
 // ativa. O texto da caixa é invisível e a própria arte, redesenhada a cada tecla, mostra o resultado: só o cursor e a seleção aparecem.
 if(px>=t.textX-12&&px<=t.textX+t.titleMax+12&&py>=t.titleY-20&&py<=t.footerY+t.footerH){kind='title';getBox=function(){var L=t.richLines||[{y:t.titleY,size:48},{y:t.subY,size:30}],st=t.richStep||51,n=Math.max(2,Math.min(3,L.length));return[t.textX,L[0].y-(st-L[0].size)/2,t.titleMax,st*n]}}
 else if(dual){for(var r=0;r<2;r++){var ry=t.dualCodeY+r*49;if(px>=t.w*.5&&py>=ry&&py<=ry+42){kind='code'+r;(function(ry){getBox=function(){return[t.w*.6,ry,t.w-t.safeX-t.w*.6,42]}})(ry);size=29}}}
 else if(boxHit([t.codeX,t.codeY,t.codeW,t.codeH],px,py)){kind='code0';getBox=function(){return[t.codeNumX||t.codeX+100,t.codeY,(t.codeNumW||150)+4,t.codeH]};size=30}
 if(!kind)return false;closeFooterEdit();
 var el=document.createElement(kind==='title'?'div':'input');el.className='pe-footer-edit'+(kind==='title'?' pe-rich-title':'');
 // a posição acompanha o tamanho da prévia na tela (janela redimensionada, barra de rolagem que aparece) e o texto que re-centraliza
 el.place=function(){var rect=c.getBoundingClientRect(),wr=c.parentNode.getBoundingClientRect(),k=rect.width/c.width,box=getBox();
  el.style.left=(rect.left-wr.left+box[0]*k)+'px';el.style.top=(rect.top-wr.top+box[1]*k)+'px';el.style.width=(box[2]*k)+'px';el.style.height=(box[3]*k)+'px';
  if(kind==='title'){var L=t.richLines||[{size:48},{size:30}];el.style.fontSize=L[L.length-1].size*k+'px';el.style.lineHeight=(t.richStep||51)*k+'px';calibrateTitleEdit(el,t,k,rect)}else el.style.fontSize=size*k+'px'};
 if(kind==='title'){el.contentEditable='true';normalizeTitle($('#productNameRich'));el.innerHTML=overlayTitleHtml(t);el.addEventListener('keydown',function(ev){if(ev.key==='Enter')enterKey(ev,el);else if(ev.key==='Escape')closeFooterEdit()});el.addEventListener('input',function(){applyRichInput(el);el.place()})}
 else{var field=$(kind==='code1'?'#productCode2':'#productCode');el.type='text';el.value=field.value;el.style.textAlign='left';el.addEventListener('input',function(){field.value=el.value;drawAll();el.place()});el.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key==='Escape')closeFooterEdit()})}
 el.addEventListener('blur',function(){setTimeout(function(){if(footerEdit===el)closeFooterEdit()},0)});
 c.parentNode.appendChild(el);el.place();footerEdit=el;el.focus();if(kind!=='title')el.select();else{var sel=getSelection();sel.selectAllChildren(el)}return true
}
// reposiciona a caixa de edição quando a prévia muda de tamanho
if(window.ResizeObserver){var feReso=new ResizeObserver(function(){if(footerEdit&&footerEdit.place)footerEdit.place()});Object.keys(canvases).forEach(function(f){feReso.observe(canvases[f])})}

// Revisor de texto (cartaz-validator.js, o mesmo do Gerador de Cartazes: regras locais, sem IA). Itálico é ignorado: a base da arte já é itálica.
// vocabulário do catálogo da marca (palavras dos nomes dos produtos), montado uma vez por catálogo; marca sem catálogo = sem verificação de grafia.
// Código sem pontos só é formatado na VONDER (10 dígitos viram 00.00.000.000); os 7 dígitos da FG e os códigos das outras marcas nunca são mexidos.
var vocabMemo={catalog:null,vocab:null};
function catalogVocab(){if(vocabMemo.catalog!==catalog){vocabMemo={catalog:catalog,vocab:catalog.length?CartazValidator.buildVocab(catalog.map(function(i){return i.name})):null}}return vocabMemo.vocab}
function titleIssues(){return CartazValidator.check($('#productName').value,{codes:$('#codeCount').value==='2'?2:1,formatCodes:BRAND_SUFFIX==='',vocab:catalogVocab()}).filter(function(i){return i.kind!=='italico'})}
// 10 dígitos soltos no texto viram 00.00.000.000 sozinhos (campo de código ao sair dele; texto da faixa do Uso e Recomendo ao fechar a edição)
function formatCodesIn(text){return BRAND_SUFFIX===''?String(text||'').replace(/(?<![\d.])\d{10}(?![\d.])/g,CartazValidator.formatCode):text}
function autoFormatTextCodes(){
 var name=$('#productName').value,next=formatCodesIn(name);if(next===name)return;
 $('#productName').value=next;if(state.titleHtml)state.titleHtml=formatCodesIn(state.titleHtml);$('#productNameRich').innerHTML=state.titleHtml||richHtmlFromText(next);drawAll()
}
['#productCode','#productCode2'].forEach(function(s){$(s).addEventListener('blur',function(){this.value=formatCodesIn(this.value);drawAll()})});
$('#productNameRich').addEventListener('blur',function(){if(usoOn())autoFormatTextCodes()});
// Botões A↑/A↓ da barra flutuante: aumentam/reduzem o texto da faixa/rodapé INTEIRO (não só a seleção), de 5 em 5%. Destaques tem o rodapé de altura fixa,
// então só até 110%; na Uso e Recomendo a faixa amarela cresce, então vai até 130%.
function titleScaleRange(){return usoOn()?[.7,1.3]:[.7,1.1]}
function setTitleScale(next){var r=titleScaleRange();state.titleScale=Math.round(Math.max(r[0],Math.min(r[1],next))*100)/100;drawAll();if(footerEdit&&footerEdit.place)footerEdit.place();status('Tamanho do texto: '+Math.round(state.titleScale*100)+'%',false)}
document.addEventListener('titlesize',function(ev){if(richOn())setTitleScale(state.titleScale+.05*ev.detail)});
// volta ao texto que o produto escolhido gerou (state.originalTitle), desfazendo edições, quebras e formatação
$('#titleRestoreBtn').addEventListener('click',function(){
 if(state.originalTitle==null)return;
 $('#productName').value=state.originalTitle.toUpperCase();state.titleHtml='';state.titleScale=1;$('#productNameRich').innerHTML=richHtmlFromText($('#productName').value);normalizeTitle($('#productNameRich'));$('#titleReviewList').hidden=true;drawAll();status('Texto original restaurado',false)
});
function renderTitleReview(){
 var list=$('#titleReviewList'),issues=titleIssues();list.hidden=false;
 if(!issues.length){list.innerHTML='<span>Nenhuma observação no texto. Tudo certo!</span>';return}
 list.innerHTML='<ul>'+issues.map(function(i,k){return'<li><span>'+escapeHtml(i.message)+'</span>'+(i.replace!=null?'<button type="button" data-fix="'+k+'">Corrigir</button>':'')+'</li>'}).join('')+'</ul>'
}
$('#titleReviewBtn').addEventListener('click',renderTitleReview);
$('#titleReviewList').addEventListener('click',function(ev){
 var b=ev.target.closest('[data-fix]');if(!b)return;var issue=titleIssues()[+b.dataset.fix];if(!issue)return;
 var r=CartazValidator.apply($('#productName').value,state.titleHtml||undefined,issue);
 $('#productName').value=r.title;state.titleHtml=r.titleHtml||'';$('#productNameRich').innerHTML=state.titleHtml||richHtmlFromText(r.title);drawAll();renderTitleReview()
});
function drawFooter(ctx,t){
 var txt=splitName($('#productName').value),code=($('#productCode').value||'').trim(),dual=$('#codeCount').value==='2';ctx.fillStyle=state.footerColor||'#FFBE00';ctx.fillRect(0,t.footerY,t.w,t.footerH);
 ctx.fillStyle='#050505';ctx.textBaseline='top';ctx.textAlign='left';var textEnd;
 if(richOn()){var parts=richParts(),ks=state.titleScale||1,sc=function(n){return Math.round(n*ks)};
  if(parts.title2){var sz=sc(40),r1=richRuns(parts.title),r2=richRuns(parts.title2),stp;while(sz>sc(24)&&(richWidth(ctx,r1,sz)>t.titleMax||richWidth(ctx,r2,sz)>t.titleMax))sz-=2;stp=Math.round(sz*1.04);var y1=t.titleY-12,sub2=26;
   textEnd=Math.max(drawRich(ctx,parts.title,t.textX,y1,t.titleMax,sz,sz),drawRich(ctx,parts.title2,t.textX,y1+stp,t.titleMax,sz,sz));
   if(parts.sub.length){textEnd=Math.max(textEnd,drawRich(ctx,parts.sub,t.textX,y1+2*stp,t.titleMax,sc(26),sc(18)));sub2=drawRich.size}
   t.richLines=[{y:y1,size:sz},{y:y1+stp,size:sz},{y:y1+2*stp,size:sub2}];t.richStep=stp}
  else{textEnd=drawRich(ctx,parts.title,t.textX,t.titleY,t.titleMax,sc(48),sc(28));var ts=drawRich.size,ss=30;if(parts.sub.length){textEnd=Math.max(textEnd,drawRich(ctx,parts.sub,t.textX,t.subY,t.titleMax,sc(30),sc(20)));ss=drawRich.size}
   t.richLines=[{y:t.titleY,size:ts},{y:t.subY,size:ss}];t.richStep=t.subY-t.titleY}}
 else{ctx.font=font(fitFont(ctx,txt.title.toUpperCase(),t.titleMax,48,28));ctx.fillText(txt.title.toUpperCase(),t.textX,t.titleY);textEnd=t.textX+ctx.measureText(txt.title.toUpperCase()).width;
 if(txt.sub){ctx.font=font(fitFont(ctx,txt.sub.toUpperCase(),t.titleMax,30,20));ctx.fillText(txt.sub.toUpperCase(),t.textX,t.subY);textEnd=Math.max(textEnd,t.textX+ctx.measureText(txt.sub.toUpperCase()).width)}}
 if(dual)drawDualCodes(ctx,t,t.dualCodeY,[[$('#codeVariant1').value,code],[$('#codeVariant2').value,($('#productCode2').value||'').trim()]],textEnd+28);
 else{roundRect(ctx,t.codeX,t.codeY,t.codeW,t.codeH,25);ctx.fillStyle='#fff';ctx.fill();ctx.fillStyle='#080808';ctx.textBaseline='middle';ctx.textAlign='left';ctx.font=font(30);var labelW=ctx.measureText('CÓD.:').width;ctx.font='400 italic 30px "Swiss721Editor","Arial Narrow",Arial,sans-serif';var codeW=ctx.measureText(code).width,total=labelW+8+codeW,startX=Math.max(t.codeX+20,Math.min((t.codeX+t.w)/2-total/2,t.w-t.safeX-total));t.codeNumX=startX+labelW+8;t.codeNumW=codeW;ctx.font=font(30);ctx.fillText('CÓD.:',startX,t.codeY+t.codeH/2+1);ctx.font='400 italic 30px "Swiss721Editor","Arial Narrow",Arial,sans-serif';ctx.fillText(code,startX+labelW+8,t.codeY+t.codeH/2+1)}
}
function drawArt(format){
 var c=canvases[format],ctx=c.getContext('2d'),t=templates[format],pos=positions[format][layout(format)];ctx.clearRect(0,0,t.w,t.h);ctx.imageSmoothingQuality='high';
 var activePreset=EDITORIA_PRESETS[state.editoriaName];
 if(activePreset&&typeof activePreset.renderer==='function'){
  lastProductBox[format]=null;lastBadgeBox[format]=null;
  // setMoveBox: o preset diz qual área dele é arrastável, e ela entra no mesmo hit-test do duplo
  // clique usado pelas outras editorias - quem move o elemento é o overlayDx/overlayDy de sempre.
  activePreset.renderer({format:format,canvas:c,ctx:ctx,t:t,state:state,item:selectedProduct,productName:$('#productName').value,helpers:{drawCover:drawCover,drawPlaceholder:drawPlaceholder,contain:contain,roundRect:roundRect,font:font,fitFont:fitFont,setMoveBox:function(box){lastProductBox[format]=box},rich:{chars:richChars,runs:richRuns,font:richFont,width:richWidth}}});return
 }
 if(state.background)drawCover(ctx,state.background,t,format);else drawPlaceholder(ctx,t);
 var group=unionBox(pos.product,pos.badge),anchor=[group[0]+group[2]/2,group[1]+group[3]/2];
 var productBox=scaled(pos.product,format,anchor),badgeBox=scaled(pos.badge,format,anchor);lastProductBox[format]=productBox;lastBadgeBox[format]=badgeBox;
 // mesmo clipping do frame aplicado na imagem de fundo (drawCover), agora também no selo e no
 // produto recortado: mesmo com a posição já limitada por clampBoxPos, sombra/blur desses
 // desenhos poderiam sujar pixels perto da borda do frame - o clip garante que nada deles
 // apareça fora da área final de exportação
 ctx.save();ctx.beginPath();ctx.rect(0,0,t.w,t.h);ctx.clip();
 var badge=format==='feed'?state.badgeFeed:state.badgeStory;function drawBadge(){if(badge)ctx.drawImage(badge,badgeBox[0],badgeBox[1],badgeBox[2],badgeBox[3])}
 if(canCircleFront(format)&&state.ov[format].circleFront){drawBadge();drawProduct(ctx,productBox,format)}else{drawProduct(ctx,productBox,format);drawBadge()}
 ctx.restore();
 drawFooter(ctx,t)
}
// Guias de margem de segurança (ciano, como as do Photoshop): só aparecem enquanto o usuário arrasta ou
// redimensiona o destaque (state.guides[format]) e só a(s) borda(s) que o elemento tocou/ultrapassou,
// igual às guias do Instagram. Ficam fora da arte exportada porque somem quando a interação termina.
var SAFE_MARGINS={feed:{top:135,side:templates.feed.safeX,bottom:190},story:{top:190,side:templates.story.safeX,bottom:190}};
// Bordas VISÍVEIS do destaque (não da caixa de layout): o PNG do selo tem margem transparente e o círculo
// do produto é menor que a caixa dele, então travar na caixa deixava o elemento parado longe das guias.
function alphaBox(im){
 if(im._alphaBox)return im._alphaBox;var box=[0,0,1,1];
 try{var w=320,h=Math.max(1,Math.round(320*im.height/im.width)),c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');x.drawImage(im,0,0,w,h);var d=x.getImageData(0,0,w,h).data,x0=w,y0=h,x1=-1,y1=-1;
  for(var j=0;j<h;j++)for(var i=0;i<w;i++)if(d[(j*w+i)*4+3]>16){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;if(j>y1)y1=j}
  if(x1>=0)box=[x0/w,y0/h,(x1+1-x0)/w,(y1+1-y0)/h]}catch(e){}
 return im._alphaBox=box
}
function fitRect(im,box){var s=Math.min(box[2]/im.width,box[3]/im.height),w=im.width*s,h=im.height*s,x=box[0]+(box[2]-w)/2,y=box[1]+(box[3]-h)/2,a=alphaBox(im);return[x+w*a[0],y+h*a[1],w*a[2],h*a[3]]}
function visibleBox(format){
 var pb=lastProductBox[format],bb=lastBadgeBox[format],preset=EDITORIA_PRESETS[state.editoriaName];
 if(!pb||!bb||(preset&&typeof preset.renderer==='function'))return unionBox(pb,bb);
 var badge=format==='feed'?state.badgeFeed:state.badgeStory,im=state.productDrawable,vb=bb,vp=pb;
 if(badge){var a=alphaBox(badge);vb=[bb[0]+bb[2]*a[0],bb[1]+bb[3]*a[1],bb[2]*a[2],bb[3]*a[3]]}
 if(im){if(state.productHasCircle)vp=fitRect(im,pb);else{var r=Math.min(pb[2],pb[3])*.48,cx=pb[0]+pb[2]/2,cy=pb[1]+pb[3]/2,k=state.ov[format].photo,iw=pb[2]*.84*k,ih=pb[3]*.84*k;vp=unionBox([cx-r,cy-r,2*r,2*r],fitRect(im,[cx-iw/2,pb[1]+pb[3]*.47-ih/2,iw,ih]))}}
 return unionBox(vb,vp)
}
// Uso e Recomendo: as faixas sangram até a borda da arte e só andam na vertical, então só as guias de cima e de baixo valem pra elas
function vOnly(){var p=EDITORIA_PRESETS[state.editoriaName];return!!(p&&p.verticalOnly)}
function guideBox(format){var b=visibleBox(format);if(b&&(usoOn()||vOnly())){var m=SAFE_MARGINS[format];return[m.side+1,b[1],templates[format].w-2*m.side-2,b[3]]}return b}
function drawGuides(format){
 var box=guideBox(format);if(!state.guides[format]||!box)return;
 var ctx=canvases[format].getContext('2d'),t=templates[format],m=SAFE_MARGINS[format],edges=[];
 if(box[1]<=m.top+.5)edges.push([0,m.top,t.w,m.top]);
 if(box[1]+box[3]>=t.h-m.bottom-.5)edges.push([0,t.h-m.bottom,t.w,t.h-m.bottom]);
 if(box[0]<=m.side+.5)edges.push([m.side,0,m.side,t.h]);
 if(box[0]+box[2]>=t.w-m.side-.5)edges.push([t.w-m.side,0,t.w-m.side,t.h]);
 if(!edges.length)return;ctx.save();ctx.strokeStyle='#00E5FF';ctx.lineWidth=3;ctx.beginPath();edges.forEach(function(e){ctx.moveTo(e[0],e[1]);ctx.lineTo(e[2],e[3])});ctx.stroke();ctx.restore()
}
// Barra o avanço do elemento na guia (como no Instagram): ao encostar na margem ele para; empurrar mais
// GUIDE_PUSH px (acumulados em push[axis]) na mesma direção solta o elemento pra passar da guia.
// Voltar na direção oposta também solta. Só barra quem vem de dentro da margem.
var GUIDE_PUSH=40;
function guideResist(push,axis,lo,hi,d,minLimit,maxLimit){
 var held=push[axis];
 if(held){var total=held+d;if(total===0||(total>0)!==(held>0)||Math.abs(total)>=GUIDE_PUSH){push[axis]=0;return total}push[axis]=total;return 0}
 if(d<0&&lo>=minLimit-.5&&lo+d<minLimit){push[axis]=lo+d-minLimit;return minLimit-lo}
 if(d>0&&hi<=maxLimit+.5&&hi+d>maxLimit){push[axis]=hi+d-maxLimit;return maxLimit-hi}
 return d
}
function draw(format){drawArt(format);drawGuides(format)}
function drawAll(){draw('feed');draw('story');updateDropHint();if(window.PostEditorSaved)window.PostEditorSaved.touch()}
// Aviso (só na tela, não sai na exportação) de que dá pra soltar a foto de fundo na prévia enquanto não há nenhuma
function updateDropHint(){$$('.pe-canvas-wrap').forEach(function(w){var h=w.querySelector('.pe-drop-hint');if(!h){h=document.createElement('div');h.className='pe-drop-hint';h.innerHTML='<span aria-hidden="true">＋</span><strong>Arraste a foto de fundo aqui</strong><small>ou dê dois cliques para escolher o arquivo</small>';w.appendChild(h)}h.hidden=!!state.background||!!(EDITORIA_PRESETS[state.editoriaName]||{}).noBackground})}
function regionScore(img,rect){
 var c=document.createElement('canvas');c.width=120;c.height=120;var x=c.getContext('2d');x.drawImage(img,rect[0]*img.width,rect[1]*img.height,rect[2]*img.width,rect[3]*img.height,0,0,120,120);
 var d=x.getImageData(0,0,120,120).data,total=0,count=0;for(var y=1;y<119;y+=3)for(var q=1;q<119;q+=3){var i=(y*120+q)*4,j=i+4,k=i+480;total+=Math.abs(d[i]-d[j])+Math.abs(d[i+1]-d[j+1])+Math.abs(d[i+2]-d[j+2])+Math.abs(d[i]-d[k])+Math.abs(d[i+1]-d[k+1])+Math.abs(d[i+2]-d[k+2]);count++}return total/count
}
function analyze(){
 if(!state.background||usoOn()){state.autoLayout='left';drawAll();return}var candidates={left:[.02,.04,.8,.43],stacked:[.01,.03,.5,.48],right:[.5,.16,.49,.54]},best='left',score=Infinity;
 Object.keys(candidates).forEach(function(k){var s=regionScore(state.background,candidates[k]);if(s<score){score=s;best=k}});state.autoLayout=best;syncOverlayControls();drawAll();status('Composição automática: '+({left:'esquerda',stacked:'superior',right:'direita'}[best]),false)
}
function fileImage(file){return new Promise(function(resolve,reject){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){URL.revokeObjectURL(u);resolve(im)};im.onerror=function(){URL.revokeObjectURL(u);reject(new Error('Imagem inválida'))};im.src=u})}
// true se a imagem já vier com transparência de verdade (PNG já recortado no catálogo) - nesse
// caso o recorte automático não deve rodar de novo em cima dela: sem fundo sobrando pras bordas
// calibrarem a cor "de fundo", o algoritmo (baseado na cor média dos 4 cantos) perde a referência
// e passa a comer partes claras/escuras do próprio produto. Amostra em baixa resolução (mesmo
// teto de removeWhite) só pra decidir rápido, sem pesar no carregamento.
function hasTransparency(im){
 var max=200,s=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
 var x=c.getContext('2d');x.drawImage(im,0,0,c.width,c.height);
 try{var d=x.getImageData(0,0,c.width,c.height).data;for(var i=3;i<d.length;i+=4)if(d[i]<250)return true;return false}catch(e){return false}
}
// holes: apaga também o branco enclausurado cercado de região clara (vão de alça/furo em produto branco). O recorte não consegue
// distinguir esse fundo de uma superfície branca do próprio produto (copo, bandeja), então é escolha da pessoa, com a prévia na tela.
function removeWhite(im,holes){
 var max=900,s=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);var x=c.getContext('2d');x.drawImage(im,0,0,c.width,c.height);var data=x.getImageData(0,0,c.width,c.height),d=data.data,w=c.width,h=c.height,corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]],avg=[0,0,0];
 corners.forEach(function(p){var i=(p[1]*w+p[0])*4;avg[0]+=d[i]/4;avg[1]+=d[i+1]/4;avg[2]+=d[i+2]/4});var seen=new Uint8Array(w*h),queue=new Int32Array(w*h),head=0,tail=0;
 // Tolerância larga (78) dá conta de fundo cinza/sombreado, mas em foto de estúdio de fundo branco puro (cantos ~255) ela
 // entra pela parte clara do próprio produto (ex.: bandeja branca do refrigerador, corpo prateado da pistola) e o parte
 // em dois pedaços grandes. Se a tolerância larga deixa o produto fragmentado, usa a justa (15) + halo de 2 px.
 function largestShare(t){
  var gone=new Uint8Array(w*h),st=new Int32Array(w*h),hd=0,tl=0,i;
  function push(px){if(px<0||px>=w*h||gone[px]||!isBackground(px,t,62))return;gone[px]=1;st[tl++]=px}
  for(i=0;i<w;i++){push(i);push((h-1)*w+i)}for(i=0;i<h;i++){push(i*w);push(i*w+w-1)}
  while(hd<tl){var p=st[hd++],px=p%w,py=(p/w)|0;if(px)push(p-1);if(px<w-1)push(p+1);if(py)push(p-w);if(py<h-1)push(p+w)}
  var mark=new Uint8Array(w*h),total=0,biggest=0;
  for(var s0=0;s0<w*h;s0++){if(gone[s0]||mark[s0])continue;hd=0;tl=0;mark[s0]=1;st[tl++]=s0;
   while(hd<tl){var q=st[hd++],qx=q%w,qy=(q/w)|0,nb=[qx?q-1:-1,qx<w-1?q+1:-1,qy?q-w:-1,qy<h-1?q+w:-1];for(var k=0;k<4;k++){var nx=nb[k];if(nx>=0&&!gone[nx]&&!mark[nx]){mark[nx]=1;st[tl++]=nx}}}
   total+=tl;if(tl>biggest)biggest=tl}
  return total?biggest/total:1
 }
 var tight=avg[0]>=250&&avg[1]>=250&&avg[2]>=250&&largestShare(78)<.95,tol=tight?15:78;
 function isBackground(px,tolerance,spreadLimit){var i=px*4,dist=Math.sqrt((d[i]-avg[0])**2+(d[i+1]-avg[1])**2+(d[i+2]-avg[2])**2),spread=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);return d[i+3]>0&&dist<=tolerance&&spread<=spreadLimit}
 function add(px){if(px<0||px>=w*h||seen[px])return;seen[px]=1;queue[tail++]=px}for(var xx=0;xx<w;xx++){add(xx);add((h-1)*w+xx)}for(var yy=0;yy<h;yy++){add(yy*w);add(yy*w+w-1)}
 while(head<tail){var p=queue[head++];if(!isBackground(p,tol,62))continue;d[p*4+3]=0;var px=p%w,py=(p/w)|0;if(px)add(p-1);if(px<w-1)add(p+1);if(py)add(p-w);if(py<h-1)add(p+w)}
 // Tolerância justa: sobra um halo claro de 1-2 px de anti-aliasing em volta do recorte; apaga só os
 // pixels de fundo (tolerância larga) colados no que já foi removido, sem entrar no produto.
 if(tight)for(var pass=0;pass<2;pass++){var halo=[];for(var hp=0;hp<w*h;hp++){if(d[hp*4+3]===0||!isBackground(hp,78,62))continue;var hx=hp%w,hy=(hp/w)|0;if((hx&&d[(hp-1)*4+3]===0)||(hx<w-1&&d[(hp+1)*4+3]===0)||(hy&&d[(hp-w)*4+3]===0)||(hy<h-1&&d[(hp+w)*4+3]===0))halo.push(hp)}halo.forEach(function(hp){d[hp*4+3]=0})}
 // A primeira passagem alcança somente o fundo ligado às bordas. Esta segunda encontra
 // ilhas internas da mesma cor, como vãos de alças, cabos e estruturas vazadas.
 // Os limites preservam letras claras pequenas e grandes áreas de produtos brancos.
 var skippedHoles=0,innerSeen=new Uint8Array(w*h),minArea=Math.max(24,Math.round(w*h*.00025)),maxArea=Math.round(w*h*.08);
 for(var start=0;start<w*h;start++){
  if(innerSeen[start])continue;innerSeen[start]=1;if(d[start*4+3]===0||!isBackground(start,tol,62))continue;
  head=0;tail=0;queue[tail++]=start;var members=[],minX=w,maxX=0,minY=h,maxY=0,edgeLum=0,edgeCount=0;
  while(head<tail){var q=queue[head++],qx=q%w,qy=(q/w)|0;members.push(q);if(qx<minX)minX=qx;if(qx>maxX)maxX=qx;if(qy<minY)minY=qy;if(qy>maxY)maxY=qy;
   var neighbors=[qx?q-1:-1,qx<w-1?q+1:-1,qy?q-w:-1,qy<h-1?q+w:-1];for(var n=0;n<4;n++){var next=neighbors[n];if(next<0||innerSeen[next])continue;innerSeen[next]=1;if(isBackground(next,tol,62))queue[tail++]=next;else if(d[next*4+3]>0){edgeLum+=(d[next*4]+d[next*4+1]+d[next*4+2])/3;edgeCount++}}
  }
  // Tolerância justa: só vira vão (alça, cabo) se cercado de região escura; branco cercado de claro é parte do produto (copos, bandeja).
  if(members.length>=minArea&&members.length<=maxArea&&(maxX-minX)>=3&&(maxY-minY)>=3){if(!tight||holes||(edgeCount&&edgeLum/edgeCount<150))for(var m=0;m<members.length;m++)d[members[m]*4+3]=0;else skippedHoles++}
 }
 x.putImageData(data,0,0);
 // A máscara é calculada em até 900px (rápido), mas o resultado sai na resolução da foto: a máscara é ampliada com suavização
 // (borda com anti-aliasing) e aplicada sobre os pixels originais. Antes saía em 900px com borda de 1 bit, e serrilhava ao exportar.
 var bs=Math.min(1,2400/Math.max(im.width,im.height)),big=document.createElement('canvas');big.width=Math.round(im.width*bs);big.height=Math.round(im.height*bs);var bx=big.getContext('2d');bx.imageSmoothingQuality='high';bx.drawImage(im,0,0,big.width,big.height);bx.globalCompositeOperation='destination-in';bx.drawImage(c,0,0,big.width,big.height);big.skippedHoles=skippedHoles;return big
}
// Dica quando o recorte manteve uma área branca cercada pelo produto (pode ser alça/furo ou parte do produto: a pessoa decide).
var holesDismissedFor=null;
function updateHolesHint(){
 var hint=$('#holesHint');if(!hint)return;
 var skipped=(state.productDrawable&&state.productDrawable.skippedHoles)||0;
 hint.hidden=!(skipped>0&&!$('#removeHoles').checked&&holesDismissedFor!==state.product)
}
$('#holesHintYes').addEventListener('click',function(){$('#removeHoles').checked=true;updateProduct()});
$('#holesHintNo').addEventListener('click',function(){holesDismissedFor=state.product;updateHolesHint()});
// Desfazer / restaurar posições (arraste de fundo e destaque). Pilha de até 30 estados do state.format.
var undoStack=[];
function updateUndoButton(){var b=$('#undoMove');if(b)b.disabled=!undoStack.length}
function pushUndo(){undoStack.push(JSON.stringify(state.format));if(undoStack.length>30)undoStack.shift();updateUndoButton()}
var dragSnapshot=null;
function commitDrag(){if(dragSnapshot!==null&&JSON.stringify(state.format)!==dragSnapshot){undoStack.push(dragSnapshot);if(undoStack.length>30)undoStack.shift();updateUndoButton();editDirty=true}dragSnapshot=null}
function undoMove(){if(!undoStack.length)return;state.format=JSON.parse(undoStack.pop());updateUndoButton();drawAll();status('Movimento desfeito',false)}
function resetPositions(){
 var empty=function(){return{bgDx:0,bgDy:0,overlayDx:0,overlayDy:0}};
 pushUndo();state.format.feed=empty();state.format.story=empty();drawAll();status('Posições restauradas',false)
}
$('#undoMove').addEventListener('click',undoMove);$('#resetPositions').addEventListener('click',resetPositions);
document.addEventListener('keydown',function(ev){
 if(!(ev.ctrlKey||ev.metaKey)||ev.key.toLowerCase()!=='z'||ev.shiftKey||currentFlowMode!=='edit')return;
 var tag=(ev.target&&ev.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select'||(ev.target&&ev.target.isContentEditable))return;
 ev.preventDefault();undoMove()
});
// Sair da etapa de edição só pede confirmação se algo mudou desde a última exportação (a composição não é salva sozinha).
var editDirty=false;
function markDirty(ev){if(ev&&ev.type==='click'&&ev.target.closest&&ev.target.closest('[data-download],#downloadBoth,#downloadFeed,#downloadStory,#nextProduct,#changeProduct,#changeEditoriaEdit'))return;editDirty=true}
['input','change','click'].forEach(function(type){$('#editorWorkspace').addEventListener(type,markDirty,true)});
function updateProduct(){
 if(!state.product){state.productDrawable=state.productHasCircle?state.productDrawable:null;var holesHintEl=$('#holesHint');if(holesHintEl)holesHintEl.hidden=true;drawAll();return}status('Preparando o produto…',true);return new Promise(function(done){setTimeout(function(){try{state.productDrawable=$('#removeWhite').checked?removeWhite(state.product,$('#removeHoles').checked):state.product;updateHolesHint();status('Produto pronto',false)}catch(e){state.productDrawable=state.product;status('Produto carregado sem recorte automático',false)}state.productHasCircle=false;drawAll();done()},30)})
}
function setupDrop(dropSel,inputSel,nameSel,handler){
 var drop=$(dropSel),input=$(inputSel),name=$(nameSel);input.addEventListener('change',function(){if(input.files[0])handler(input.files[0],name)});['dragenter','dragover'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('is-dragging')})});['dragleave','drop'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove('is-dragging')})});drop.addEventListener('drop',function(ev){var f=ev.dataTransfer.files[0];if(f)handler(f,name)})
}
function rankedLayouts(){
 var rects={left:[.02,.04,.8,.43],stacked:[.01,.03,.5,.48],right:[.5,.16,.49,.54]};if(!state.background)return['left','stacked','right'];return Object.keys(rects).map(function(layout){return{layout:layout,score:regionScore(state.background,rects[layout])}}).sort(function(a,b){return a.score-b.score}).map(function(x){return x.layout})
}
function compositionPresets(){var layouts=rankedLayouts();return{balanced:{layout:layouts[0],feed:1,story:1,scale:1,label:'Equilibrada'},product:{layout:layouts[1]||layouts[0],feed:1.08,story:1.4,scale:1.14,label:'Produto em destaque'},full:{layout:layouts[2]||layouts[0],feed:1,story:1.8,scale:1.05,label:'Preenchimento total'}}}
// os controles de layout/tamanho/círculo do destaque valem só pro formato escolhido em #overlayFormat
// círculo à frente do selo cobriria a escrita da logo quando o produto fica acima dela: combinação proibida
function canCircleFront(format){return layout(format)!=='stacked'}
function ovFormat(){return $('#overlayFormat').value}
// Sempre individuais (formato escolhido em #overlayFormat): tamanho e posição do destaque na arte. Layout (logo x
// círculo) e círculo à frente/atrás seguem os dois formatos enquanto #linkFormats estiver marcado (padrão).
// Tamanho da foto no círculo também segue #linkFormats; só a cor do círculo vale sempre pros dois (BOTH).
function linkedTargets(){return $('#linkFormats').checked?BOTH:[ovFormat()]}
var BOTH=['feed','story'];
function syncOverlayControls(){var o=state.ov[ovFormat()],pct=Math.round(o.scale*100),photo=Math.round(o.photo*100),j=state.ov.feed,canFront=canCircleFront(ovFormat());$('#layoutMode').value=o.layout;$('#overlayScale').value=pct;$('#overlayScaleOut').value=pct+'%';$('#productScale').value=photo;$('#productScaleOut').value=photo+'%';$('#circleLayer').querySelector('[value=front]').disabled=!canFront;$('#circleLayer').value=o.circleFront&&canFront?'front':'back';$('#circleStyle').value=j.circleStyle}
function syncCompositionControls(){syncOverlayControls()}
function applyComposition(key){var preset=compositionPresets()[key];if(!preset)return;state.autoLayout=preset.layout;['feed','story'].forEach(function(f){state.ov[f].layout=preset.layout;state.ov[f].scale=preset.scale});state.bgZoom.feed=preset.feed;state.bgZoom.story=preset.story;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};syncCompositionControls();$$('[data-composition]').forEach(function(button){button.classList.toggle('is-active',button.dataset.composition===key)});drawAll();status('Composição aplicada: '+preset.label,false)}
function generateCompositions(){var box=$('#compositionOptions');box.hidden=false;$$('[data-composition]').forEach(function(button){button.classList.remove('is-active')});status('Três sugestões prontas para escolher',false)}
function safePart(value){return((value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'').toUpperCase()||'PRODUTO')}
function exportBaseName(){var title=splitName($('#productName').value||'produto').title,codes=[normalizeCode($('#productCode').value)];if($('#codeCount').value==='2')codes.push(normalizeCode($('#productCode2').value));codes=codes.filter(Boolean);return safePart(title)+(codes.length?'_'+codes.join('_'):'')}
function exportFileName(format){return exportBaseName()+'_'+format.toUpperCase()+'.jpg'}
function canvasBlob(format){return new Promise(function(resolve,reject){canvases[format].toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('Falha ao gerar '+format))},'image/jpeg',1)})}
function triggerBlob(blob,name){var a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1200)}
function download(format){var name=exportFileName(format);status('Gerando '+name+'…',true);canvasBlob(format).then(function(blob){triggerBlob(blob,name);window.PortalUsage&&window.PortalUsage.track('post-editor','export',{dedupeKey:'post-editor:'+exportBaseName()});editDirty=false;status(name+' baixado',false)}).catch(function(){status('Não foi possível gerar '+name,false)})}
var ZIP_CRC_TABLE=(function(){var table=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
function zipCrc(bytes){var crc=0xffffffff;for(var i=0;i<bytes.length;i++)crc=ZIP_CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
function zipHeader(size){var bytes=new Uint8Array(size),view=new DataView(bytes.buffer);return{bytes:bytes,u16:function(offset,value){view.setUint16(offset,value,true)},u32:function(offset,value){view.setUint32(offset,value>>>0,true)}}}
function zipDate(){var d=new Date(),year=Math.max(1980,d.getFullYear());return{time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()}}
function makeZip(files){var encoder=new TextEncoder(),stamp=zipDate(),locals=[],centrals=[],offset=0;files.forEach(function(file){var name=encoder.encode(file.name),data=file.data,crc=zipCrc(data),local=zipHeader(30);local.u32(0,0x04034b50);local.u16(4,20);local.u16(6,0x800);local.u16(8,0);local.u16(10,stamp.time);local.u16(12,stamp.date);local.u32(14,crc);local.u32(18,data.length);local.u32(22,data.length);local.u16(26,name.length);local.u16(28,0);locals.push(local.bytes,name,data);var central=zipHeader(46);central.u32(0,0x02014b50);central.u16(4,20);central.u16(6,20);central.u16(8,0x800);central.u16(10,0);central.u16(12,stamp.time);central.u16(14,stamp.date);central.u32(16,crc);central.u32(20,data.length);central.u32(24,data.length);central.u16(28,name.length);central.u16(30,0);central.u16(32,0);central.u16(34,0);central.u16(36,0);central.u32(38,0);central.u32(42,offset);centrals.push(central.bytes,name);offset+=30+name.length+data.length});var centralSize=centrals.reduce(function(total,part){return total+part.length},0),end=zipHeader(22);end.u32(0,0x06054b50);end.u16(4,0);end.u16(6,0);end.u16(8,files.length);end.u16(10,files.length);end.u32(12,centralSize);end.u32(16,offset);end.u16(20,0);return new Blob(locals.concat(centrals,[end.bytes]),{type:'application/zip'})}
function downloadZip(){var base=exportBaseName();status('Montando pacote ZIP…',true);Promise.all([canvasBlob('feed'),canvasBlob('story')]).then(function(blobs){return Promise.all(blobs.map(function(blob){return blob.arrayBuffer()}))}).then(function(buffers){var zip=makeZip([{name:base+'_FEED.jpg',data:new Uint8Array(buffers[0])},{name:base+'_STORY.jpg',data:new Uint8Array(buffers[1])}]);triggerBlob(zip,base+'_FEED_STORY.zip');window.PortalUsage&&window.PortalUsage.track('post-editor','export',{dedupeKey:'post-editor:'+base});editDirty=false;status('Pacote ZIP baixado',false)}).catch(function(){status('Não foi possível gerar o pacote ZIP',false)})}
function loadBackgroundFile(file,name){name.textContent=file.name;status('Analisando a foto…',true);trackSrc('bg',file);fileImage(file).then(function(im){state.background=im;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};analyze()}).catch(function(){status('Não foi possível abrir a foto',false)})}
setupDrop('#backgroundDrop','#backgroundFile','#backgroundFileName',loadBackgroundFile);
// soltar a foto de fundo direto na prévia, enquanto ainda não há nenhuma (depois disso, soltar não faz nada: troca-se pelo campo de upload)
$$('.pe-canvas-wrap').forEach(function(wrap){var over=function(ev){return!state.background&&!(EDITORIA_PRESETS[state.editoriaName]||{}).noBackground&&ev.dataTransfer&&Array.prototype.indexOf.call(ev.dataTransfer.types||[],'Files')>=0};['dragenter','dragover'].forEach(function(e){wrap.addEventListener(e,function(ev){if(over(ev)){ev.preventDefault();wrap.classList.add('is-dragging')}})});wrap.addEventListener('dragleave',function(){wrap.classList.remove('is-dragging')});wrap.addEventListener('drop',function(ev){wrap.classList.remove('is-dragging');if(!over(ev))return;ev.preventDefault();var f=ev.dataTransfer.files[0];if(f&&/^image/.test(f.type))loadBackgroundFile(f,$('#backgroundFileName'))})});
setupDrop('#productDrop','#productFile','#productFileName',function(file,name){setProductFilePreviewFromFile(file);trackSrc('product',file);fileImage(file).then(function(im){state.product=im;updateProduct()}).catch(function(){status('Não foi possível abrir o produto',false)})});
['#productName','#productCode','#productCode2','#codeVariant1','#codeVariant2','#eventDay','#eventMonth','#eventPrefix','#ecommerceDiscount','#ecommerceCta','#ecommerceValidity'].forEach(function(s){var el=$(s);if(el)el.addEventListener('input',drawAll)});
function formatCurrencyInput(el){var digits=el.value.replace(/\D/g,'');if(!digits){el.value='';return}digits=digits.replace(/^0+(?=\d)/,'');while(digits.length<3)digits='0'+digits;var cents=digits.slice(-2),intPart=(digits.slice(0,-2).replace(/^0+(?=\d)/,'')||'0').replace(/\B(?=(\d{3})+(?!\d))/g,'.');el.value=intPart+','+cents}
['#ecommerceOldPrice','#ecommercePrice'].forEach(function(s){var el=$(s);if(el)el.addEventListener('input',function(){formatCurrencyInput(this);drawAll()})});if($('#eventMonth'))$('#eventMonth').addEventListener('blur',function(){var month=this.value.trim().toLocaleLowerCase('pt-BR');this.value=month?month.charAt(0).toLocaleUpperCase('pt-BR')+month.slice(1):'';drawAll()});function syncCodeFields(){var dual=$('#codeCount').value==='2';$('#codeVariantField1').hidden=!dual;$('#codeRow1').classList.toggle('is-dual',dual);$('#codeRow2').hidden=!dual;$('#productCodeLabel').textContent=dual?'Código 1':'Código';drawAll()}$('#codeCount').addEventListener('change',syncCodeFields);if($('#ecommercePriceMode'))$('#ecommercePriceMode').addEventListener('change',function(){var mode=this.value;$('#ecommerceOldPriceField').hidden=mode!=='de-por';$('#ecommerceDiscountField').hidden=mode!=='desconto';drawAll()});syncCodeFields();$('#layoutMode').addEventListener('change',function(){var v=this.value;linkedTargets().forEach(function(f){state.ov[f].layout=v;if(!canCircleFront(f))state.ov[f].circleFront=false});syncOverlayControls();drawAll()});
$('#linkFormats').addEventListener('change',function(){if(this.checked){var o=state.ov[ovFormat()];BOTH.forEach(function(f){state.ov[f].layout=o.layout;state.ov[f].photo=o.photo;state.ov[f].circleFront=o.circleFront&&canCircleFront(f)});syncOverlayControls();drawAll()}});$('#removeWhite').addEventListener('change',updateProduct);$('#removeHoles').addEventListener('change',updateProduct);['Feed','Story'].forEach(function(format){var input=$('#eventTitleSize'+format),output=$('#eventTitleSize'+format+'Out');if(input)input.addEventListener('input',function(){if(output)output.value=this.value+'%';draw(format.toLowerCase())})});
$('#overlayScale').addEventListener('change',function(){var f=ovFormat();state.guides[f]=false;draw(f)});$('#overlayScale').addEventListener('input',function(){var f=ovFormat();$('#overlayScaleOut').value=this.value+'%';state.ov[f].scale=this.value/100;state.guides[f]=true;draw(f)});$('#overlayFormat').addEventListener('change',syncOverlayControls);
if($('#brandBadgeColor'))$('#brandBadgeColor').addEventListener('input',function(){state.brandBadgeColor=this.value;drawAll()});
$('#circleLayer').addEventListener('change',function(){var v=this.value==='front';linkedTargets().forEach(function(f){state.ov[f].circleFront=v});drawAll()});$('#productScale').addEventListener('input',function(){var v=this.value/100;linkedTargets().forEach(function(f){state.ov[f].photo=v});$('#productScaleOut').value=this.value+'%';drawAll()});$('#circleStyle').addEventListener('change',function(){var v=this.value;BOTH.forEach(function(f){state.ov[f].circleStyle=v});drawAll()});
$('#autoCompose').addEventListener('click',analyze);$('#generateCompositions').addEventListener('click',generateCompositions);$$('[data-composition]').forEach(function(button){button.addEventListener('click',function(){applyComposition(button.dataset.composition)})});$('#resetPosition').addEventListener('click',function(){state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};drawAll();status('Posições centralizadas',false)});
// Ajustes do painel que dependem do preset (hoje só Uso e Recomendo): layout reaproveitado como "de que lado partem as faixas", sem os controles de círculo
var LAYOUT_OPTIONS_HTML=$('#layoutMode').innerHTML,MOVE_OVERLAY_LABEL=$('[data-move-mode="overlay"]').textContent;
function applyPresetUi(preset){
 var opts=preset.layoutOptions;$('#layoutMode').innerHTML=opts?opts.map(function(o){return'<option value="'+o[0]+'">'+o[1]+'</option>'}).join(''):LAYOUT_OPTIONS_HTML;
 if(opts||state.layoutCustom)BOTH.forEach(function(f){state.ov[f].layout=opts?opts[0][0]:'auto'});state.layoutCustom=!!opts;
 ['#circleLayerField','#productScaleField','#circleStyleField','#autoCompose'].forEach(function(s){var el=$(s);if(el)el.hidden=!!preset.hideCircleControls});
 $('[data-move-mode="overlay"]').textContent=preset.moveLabel||MOVE_OVERLAY_LABEL;document.body.classList.toggle('is-uso',!!preset.hideCircleControls&&!preset.panel);document.body.classList.toggle('is-vcomm',!!preset.panel);var vcPanel=$('#vcPanel');if(vcPanel)vcPanel.hidden=!preset.panel;
 if(preset.moveHint)$('#stageMoveHint').textContent=preset.moveHint;if(preset.nameLabel)$('#productNameLabel').textContent=preset.nameLabel;
 syncOverlayControls()
}
function setMoveMode(mode){$('#moveTarget').value=mode;$$('[data-move-mode]').forEach(function(x){x.classList.toggle('is-active',x.dataset.moveMode===mode)})}
function boxHit(box,px,py){return box&&px>=box[0]&&px<=box[0]+box[2]&&py>=box[1]&&py<=box[1]+box[3]}
function unionBox(a,b){if(!a)return b;if(!b)return a;var x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]);return[x,y,Math.max(a[0]+a[2],b[0]+b[2])-x,Math.max(a[1]+a[3],b[1]+b[3])-y]}
function flashMoveTarget(format,cap,hit,canvasRect,box,label){
 var el=$('#moveFlash'+cap);if(!el)return;
 var scale=canvasRect.width/canvases[format].width,x=0,y=0,w=canvasRect.width,h=canvasRect.height;
 if(box&&(hit||label)){x=box[0]*scale;y=box[1]*scale;w=box[2]*scale;h=box[3]*scale}
 el.style.left=x+'px';el.style.top=y+'px';el.style.width=w+'px';el.style.height=h+'px';
 el.querySelector('span').textContent=label||(hit?(state.priceMoveOnly?'Preço selecionado':usoOn()?'Faixas selecionadas':'Destaque selecionado'):'Fundo selecionado');
 el.classList.toggle('is-background',!hit);
 el.classList.remove('is-firing');void el.offsetWidth;el.classList.add('is-firing')
}
$$('[data-move-mode]').forEach(function(b){b.addEventListener('click',function(){setMoveMode(b.dataset.moveMode)})});$('#moveTarget').addEventListener('change',function(){setMoveMode($('#moveTarget').value)});
Object.keys(canvases).forEach(function(format){
 var c=canvases[format],cap=format[0].toUpperCase()+format.slice(1),drag=null,dragTarget=null,guideTimer=0;
 c.addEventListener('pointerdown',function(e){if(ovFormat()!==format){$('#overlayFormat').value=format;syncOverlayControls()}if(!state.moveEnabled)return;clearTimeout(guideTimer);dragSnapshot=JSON.stringify(state.format);drag={x:e.clientX,y:e.clientY,push:{x:0,y:0}};dragTarget=$('#moveTarget').value;var pk=EDITORIA_PRESETS[state.editoriaName];if(pk&&pk.pickTarget){var pr=c.getBoundingClientRect();dragTarget=pk.pickTarget(format,(e.clientX-pr.left)*c.width/pr.width,(e.clientY-pr.top)*c.height/pr.height,e)||dragTarget}state.guides[format]=dragTarget==='overlay';c.setPointerCapture(e.pointerId)});
 c.addEventListener('pointermove',function(e){if(!drag)return;var scale=c.width/c.getBoundingClientRect().width,dx=(e.clientX-drag.x)*scale,dy=(e.clientY-drag.y)*scale;drag={x:e.clientX,y:e.clientY,push:drag.push};if(dragTarget==='background'){state.format[format].bgDx+=dx;state.format[format].bgDy+=dy}else if(dragTarget!=='overlay'){var pm=EDITORIA_PRESETS[state.editoriaName];if(pm&&pm.onDrag){var pmr=c.getBoundingClientRect();pm.onDrag(format,dragTarget,dx,dy,(e.clientX-pmr.left)*c.width/pmr.width,(e.clientY-pmr.top)*c.height/pmr.height)}}else{var gb=guideBox(format);if(usoOn()||vOnly())dx=0;if(gb){var gm=SAFE_MARGINS[format],gt=templates[format];dx=guideResist(drag.push,'x',gb[0],gb[0]+gb[2],dx,gm.side,gt.w-gm.side);dy=guideResist(drag.push,'y',gb[1],gb[1]+gb[3],dy,gm.top,gt.h-gm.bottom)}state.format[format].overlayDx+=dx;state.format[format].overlayDy+=dy}drawAll()});
 ['pointerup','pointercancel'].forEach(function(ev){c.addEventListener(ev,function(){var pu=EDITORIA_PRESETS[state.editoriaName];if(pu&&pu.onDragEnd&&dragTarget)pu.onDragEnd(format,dragTarget);commitDrag();drag=null;dragTarget=null;state.guides[format]=false;draw(format)})});
 c.addEventListener('dblclick',function(e){
  if(Date.now()-editOpenedAt<700){e.preventDefault();return}
  var pd=EDITORIA_PRESETS[state.editoriaName];if(pd&&pd.dblclick){var dr=c.getBoundingClientRect();var fl=pd.dblclick(format,(e.clientX-dr.left)*c.width/dr.width,(e.clientY-dr.top)*c.height/dr.height);if(fl)flashMoveTarget(format,cap,fl.hit,dr,fl.box,fl.label);e.preventDefault();return}
  if(usoOn()){var ur=c.getBoundingClientRect();if(openUsoEdit(format,c,(e.clientX-ur.left)*c.width/ur.width,(e.clientY-ur.top)*c.height/ur.height)){e.preventDefault();return}}
  else if(richOn()){var fr=c.getBoundingClientRect();if(openFooterEdit(format,c,(e.clientX-fr.left)*c.width/fr.width,(e.clientY-fr.top)*c.height/fr.height)){e.preventDefault();return}}
  if(!state.moveEnabled)return;var rect=c.getBoundingClientRect(),scaleX=c.width/rect.width,scaleY=c.height/rect.height,px=(e.clientX-rect.left)*scaleX,py=(e.clientY-rect.top)*scaleY,destaqueBox=state.priceMoveOnly?lastProductBox[format]:visibleBox(format),hit=boxHit(destaqueBox,px,py);
  // sem foto de fundo ainda, o duplo clique no fundo/placeholder abre a escolha do arquivo (com foto, segue selecionando fundo/destaque pra mover)
  if(!state.background&&!hit){$('#backgroundFile').click();return}
  setMoveMode(hit?'overlay':'background');status(hit?(usoOn()?'Faixas selecionadas para mover':'Box de preço selecionada para mover'):'Fundo selecionado para mover',false);
  flashMoveTarget(format,cap,hit,rect,destaqueBox)
 });
 c.addEventListener('wheel',function(e){
  var pw=EDITORIA_PRESETS[state.editoriaName];if(pw&&pw.wheel){var wr=c.getBoundingClientRect();e.preventDefault();if(pw.wheel(format,(e.clientX-wr.left)*c.width/wr.width,(e.clientY-wr.top)*c.height/wr.height,e.deltaY<0?1:-1))draw(format);return}
  // com o destaque selecionado (Arrastar: Logo e produto) a roda ajusta o tamanho dele, só neste formato
  if(state.moveEnabled&&!state.priceMoveOnly&&$('#moveTarget').value==='overlay'&&!$('#overlayScaleField').hidden){
   e.preventDefault();var pct=Math.max(70,Math.min(135,Math.round(state.ov[format].scale*100)+(e.deltaY<0?5:-5)));
   state.ov[format].scale=pct/100;state.guides[format]=true;draw(format);if(ovFormat()===format)syncOverlayControls();clearTimeout(guideTimer);guideTimer=setTimeout(function(){if(drag)return;state.guides[format]=false;draw(format)},600);return
  }
  e.preventDefault();// zoom do fundo: 100% a 180%
  state.bgZoom[format]=Math.max(100,Math.min(180,Math.round(state.bgZoom[format]*100)+(e.deltaY<0?5:-5)))/100;draw(format)
 },{passive:false});
});
$('#downloadFeed').onclick=function(){download('feed')};$('#downloadStory').onclick=function(){download('story')};$('#downloadBoth').onclick=downloadZip;$$('[data-download]').forEach(function(b){b.onclick=function(){download(b.dataset.download)}});
$('#catalogSearch').addEventListener('input',function(){catalogFocus=0;abortSite();siteSearch={q:'',status:'idle',items:[]};renderCatalogResults();scheduleSiteSearch(this.value)});
$('#catalogSearch').addEventListener('keydown',function(ev){
 var q=this.value,rl=resultList(q),n=rl.local.length,sites=visibleSiteItems(q),total=n+sites.length;if(!total)return;
 if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){catalogFocus=ev.key==='ArrowDown'?Math.min(total-1,catalogFocus+1):Math.max(0,catalogFocus-1);renderCatalogResults();var focused=$('#catalogResults .is-focused');if(focused)focused.scrollIntoView({block:'nearest'});ev.preventDefault()}
 else if(ev.key==='Enter'){if(catalogFocus<n)chooseCatalogProduct(rl.local[catalogFocus]||rl.local[0]);else{var idx=catalogFocus-n,btn=$('#catalogResults [data-site-index="'+idx+'"]');if(btn)openSiteProduct(sites[idx].code,btn)}ev.preventDefault()}
});
$('#manualProduct').addEventListener('click',chooseManualProduct);$('#changeProduct').addEventListener('click',function(){goToStep('choose')});$('#nextProduct').addEventListener('click',function(){goToStep('choose')});
if($('#changeBrandLogo'))$('#changeBrandLogo').addEventListener('click',function(){$('#brandLogoSummary').hidden=true;$('#brandLogoPicker').hidden=false;$('#brandLogoSearch').value='';renderBrandLogoResults();setTimeout(function(){$('#brandLogoSearch').focus()},20)});
if($('#brandLogoSearch'))$('#brandLogoSearch').addEventListener('input',renderBrandLogoResults);
$('#changeEditoriaChoose').addEventListener('click',function(){goToStep('editoria')});$('#changeEditoriaEdit').addEventListener('click',function(){goToStep('editoria')});
setFlow('editoria');renderEditoriaGrid();loadCatalog();refreshEditoriasFromServer();
if(INCOMING_COMM){var incomingEditoria=EDITORIAS.filter(function(e){return /comemorat/i.test(e.name||'')})[0];if(incomingEditoria&&EDITORIA_PRESETS[incomingEditoria.name])chooseEditoria(incomingEditoria)}
loadImage('post-editor-assets/demo-product.png').then(function(im){if(!selectedProduct&&!state.product&&$('#editorWorkspace').hidden)state.productDrawable=im;drawAll();try{canvases.feed.toDataURL('image/jpeg',.1);document.body.dataset.exportReady='true';status('Editor pronto',false)}catch(e){document.body.dataset.exportReady='false';status('Prévia pronta; exportação bloqueada pelo navegador',false)}}).catch(function(){drawAll();status('Editor aberto; alguns elementos não carregaram',false)});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(drawAll);else drawAll();
// ===== artes salvas das demais editorias (post-editor-saved-arts.js) =====
// Receita genérica: campos do painel + posições/zooms + produto do catálogo (o editor recarrega as fotos dele) + fotos enviadas (hash;
// o arquivo vai para o IndexedDB e para a nuvem pelo módulo das artes salvas). As editorias com serialize()/restore() próprios (Datas
// comemorativas da VONDER) usam os delas.
var SAVE_SKIP=/^(vc|catalogSearch|brandLogoSearch|moveTarget|layoutMode|circleLayer|overlayScale|productScale|circleStyle|overlayFormat)/;
function r1(n){return Math.round((+n||0)*10)/10}
function nm(v,lo,hi,def){v=+v;return isFinite(v)?Math.max(lo,Math.min(hi,v)):def}
function savedSerialize(){
 var fields={};$$('#editorWorkspace input[id],#editorWorkspace select[id],#editorWorkspace textarea[id]').forEach(function(el){if(el.type==='file'||SAVE_SKIP.test(el.id))return;fields[el.id]=el.type==='checkbox'?el.checked:el.value});
 var ov={},fm={};
 ['feed','story'].forEach(function(f){var a=state.ov[f],p=state.format[f]||{};ov[f]={scale:Math.round(a.scale*100)/100,photo:Math.round(a.photo*100)/100,layout:String(a.layout),circleFront:!!a.circleFront,circleStyle:String(a.circleStyle)};fm[f]={bgDx:r1(p.bgDx),bgDy:r1(p.bgDy),overlayDx:r1(p.overlayDx),overlayDy:r1(p.overlayDy)}});
 var item=null;if(selectedProduct){try{var js=JSON.stringify(selectedProduct);if(js.length<=6000)item=JSON.parse(js)}catch(e){}}
 var photos=[],blobs=[],waits=['bg','product'].map(function(k){return state.srcFile[k]&&state.srcFile[k].p}).filter(Boolean);
 function fill(){photos.length=0;blobs.length=0;['bg','product'].forEach(function(k){var m=state.srcFile[k];if(!m)return;photos.push({slot:k,name:m.name,size:m.size,hash:m.hash});if(m.file&&m.hash&&!m.reduced)blobs.push({hash:m.hash,blob:m.file})})}
 fill();
 return{
  title:(String($('#productName').value||'').split('\n')[0]||'').trim().slice(0,80)||'Arte sem título',
  recipe:{v:1,fields:fields,item:item,st:{titleScale:state.titleScale,titleHtml:state.titleHtml||'',originalTitle:state.originalTitle||'',autoLayout:String(state.autoLayout),brandLogoName:state.brandLogoName||'',brandBadgeColor:state.brandBadgeColor,bgZoom:{feed:Math.round(state.bgZoom.feed*100)/100,story:Math.round(state.bgZoom.story*100)/100},ov:ov,fm:fm}},
  photos:photos,blobs:blobs,maxSide:1600,ready:Promise.all(waits).then(fill)
 }
}
function savedRestore(d,getBlob){
 var r=d.recipe||{};if(r.v!==1)return Promise.resolve();
 restoringSaved=true;
 function done(){restoringSaved=false}
 var item=null;
 return catalogReady.then(function(){
  if(r.item&&typeof r.item==='object'){var c=catalogCodes(r.item)[0],code=c&&c.code;item=(code&&catalog.filter(function(i){var k=catalogCodes(i)[0];return k&&k.code===code})[0])||r.item}
  if(currentFlowMode==='edit'||currentFlowMode==='banner')return;
  return item?chooseCatalogProduct(item):chooseManualProduct()
 }).then(function(){
  var f=r.fields||{};
  Object.keys(f).forEach(function(id){var el=document.getElementById(id);if(!el||el.type==='file'||SAVE_SKIP.test(id)||!$('#editorWorkspace').contains(el))return;if(el.type==='checkbox')el.checked=!!f[id];else if(typeof f[id]==='string')el.value=f[id].slice(0,2000)});
  var st=r.st||{};
  state.titleScale=nm(st.titleScale,.5,1.5,1);state.originalTitle=String(st.originalTitle||'').slice(0,2000);
  syncRichFromText();
  if(richOn()&&st.titleHtml){var rich=$('#productNameRich');rich.innerHTML=CartazTitleFormat.clean(String(st.titleHtml),{keepBr:true,always:true});applyRichInput(rich)}
  var logo=String(st.brandLogoName||'');if(logo){if(BRAND_MANIFEST.indexOf(logo)>=0)selectBrandLogo(logo);else{state.brandLogoName=logo.slice(0,80);state.customAssets.brandLogo=null;var ln=$('#brandLogoName');if(ln)ln.textContent=state.brandLogoName}}
  syncCodeFields();var pm=$('#ecommercePriceMode');if(pm)pm.dispatchEvent(new Event('change'));
  ['Feed','Story'].forEach(function(n){var i=$('#eventTitleSize'+n);if(i)i.dispatchEvent(new Event('input'))});
  var photos=d.photos||[];
  return Promise.all(['bg','product'].map(function(slot){
   var ph=photos.filter(function(x){return x.slot===slot})[0];if(!ph||!ph.hash)return;
   var nameEl=$(slot==='bg'?'#backgroundFileName':'#productFileName');
   return getBlob(ph.hash).then(function(got){
    if(!got){state.srcFile[slot]={file:null,name:String(ph.name||''),size:+ph.size||0,hash:String(ph.hash),reduced:false,p:null};nameEl.textContent='Reenviar a foto: '+String(ph.name||'');return}
    return fileImage(got.blob).then(function(im){trackSrc(slot,got.blob,{name:String(ph.name||''),hash:String(ph.hash),reduced:got.reduced});if(slot==='bg')state.background=im;else state.product=im;nameEl.textContent=String(ph.name||'')+(got.reduced?' · qualidade reduzida (envie a original para melhorar)':'')})
   })
  })).then(function(){return state.product?updateProduct():null}).then(function(){
   ['feed','story'].forEach(function(k){
    var o=(st.ov&&st.ov[k])||{},a=state.ov[k],m=(st.fm&&st.fm[k])||{};
    a.scale=nm(o.scale,.5,1.5,1);a.photo=nm(o.photo,.4,1.6,1);if(/^[a-z-]{1,20}$/.test(o.layout||''))a.layout=o.layout;a.circleFront=!!o.circleFront;if(o.circleStyle==='white'||o.circleStyle==='yellow')a.circleStyle=o.circleStyle;
    state.format[k]={bgDx:nm(m.bgDx,-6000,6000,0),bgDy:nm(m.bgDy,-6000,6000,0),overlayDx:nm(m.overlayDx,-6000,6000,0),overlayDy:nm(m.overlayDy,-6000,6000,0)};
    state.bgZoom[k]=nm(st.bgZoom&&st.bgZoom[k],1,1.8,1)
   });
   if(/^[a-z-]{1,20}$/.test(st.autoLayout||''))state.autoLayout=st.autoLayout;
   if(/^#[0-9a-fA-F]{6}$/.test(st.brandBadgeColor||'')){state.brandBadgeColor=st.brandBadgeColor;var bc=$('#brandBadgeColor');if(bc)bc.value=st.brandBadgeColor}
   syncOverlayControls();undoStack=[];updateUndoButton();editDirty=false;drawAll()
  })
 }).then(done,function(e){done();throw e})
}
var SAVED_ADAPTER={active:function(){return(currentFlowMode==='edit'||currentFlowMode==='banner')&&!!state.editoriaName},serialize:savedSerialize,restore:savedRestore};
window.PostEditor={goToStep:goToStep,markSaved:function(){editDirty=false},redraw:drawAll,state:state,status:status,incoming:function(){return INCOMING_COMM},session:function(){return editSession},preset:function(){var p=EDITORIA_PRESETS[state.editoriaName];return p&&!p.serialize?SAVED_ADAPTER:p},editoriaName:function(){return state.editoriaName},chooseEditoria:function(name,keepFlow){var e=EDITORIAS.filter(function(x){return x.name===name})[0];if(!e||!EDITORIA_PRESETS[e.name])return false;chooseEditoria(e,keepFlow);return true},chooseProduct:chooseCatalogProduct,getCatalog:function(){return catalog.slice()},makeZip:makeZip,exportBaseName:exportBaseName};







// Importação de ofertas FG: o site é estático, então consulta o Worker do Cloudflare (/product-offer).
// O resultado é sempre revisável nos campos da oferta.
(function(){
 var button=$('#importEcommerceOffer'),urlField=$('#ecommerceProductUrl'),modal=$('#offerSkuModal');if(!button||!urlField||!modal)return;
 function money(value){return Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
 function importStatus(message){var el=$('#fgOfferImportStatus');if(el)el.textContent=message}
 function sameCommercialOffer(a,b){return Number(a.price)===Number(b.price)&&Number(a.listPrice||0)===Number(b.listPrice||0)&&Number(a.discountPercent||0)===Number(b.discountPercent||0)&&!!a.available===!!b.available}
 function offerCta(sku){if(sku.offerCta)return sku.offerCta;var price=Number(sku.price),old=Number(sku.listPrice);return old>price?Math.round((old-price)*100/old)+'% OFF':'APROVEITE!'}
 function applySku(offer,sku,dual){
  if(currentFlowMode!=='edit')chooseManualProduct();
  $('#productName').value=offer.title||$('#productName').value;var importedBrand=brandLogoForOffer(offer.brand,offer.title),brandHint=$('#brandLogoSummary small');if(importedBrand){selectBrandLogo(importedBrand);$('#brandLogoName').textContent=offer.brand||displayBrandName(importedBrand).toUpperCase();if(brandHint)brandHint.textContent=offer.brand?'Preenchida automaticamente da oferta FG':'Identificada automaticamente pelo título da oferta'}else if(offer.brand){state.brandLogoName=offer.brand;state.customAssets.brandLogo=null;$('#brandLogoName').textContent=offer.brand;$('#brandLogoThumb').textContent='＋';if(brandHint)brandHint.textContent='Logo ainda não disponível - selecione manualmente'}$('#productCode').value=sku.sku||'';$('#codeVariant1').value=sku.variation||'';
  $('#codeCount').value=dual?'2':'1';if(dual){var other=offer.skus[1];$('#productCode2').value=other.sku||'';$('#codeVariant2').value=other.variation||''}else{$('#productCode2').value=''}
  $('#ecommercePrice').value=money(sku.price);$('#ecommerceOldPrice').value=sku.listPrice?money(sku.listPrice):'';$('#ecommercePriceMode').value=sku.listPrice?'de-por':'por';$('#ecommerceDiscount').value=sku.discountPercent>0?Math.round(sku.discountPercent)+'% OFF':'';$('#ecommerceCta').value=offerCta(sku);syncCodeFields();$('#ecommercePriceMode').dispatchEvent(new Event('change'));drawAll();status('Oferta FG carregada. Revise os dados antes de baixar.',false)

 }
 function close(){modal.hidden=true}
 $('#offerSkuModalCancel').addEventListener('click',close);modal.addEventListener('click',function(ev){if(ev.target===modal)close()});
 function chooseSku(offer){var box=$('#offerSkuOptions');$('#offerSkuModalDesc').textContent='Os SKUs possuem condições comerciais diferentes. Escolha qual oferta será divulgada; a arte terá apenas um código.';box.innerHTML='';offer.skus.forEach(function(sku){var item=document.createElement('button');item.type='button';item.innerHTML='<strong>'+escapeHtml(sku.variation||'SKU '+sku.sku)+' · Cód. '+escapeHtml(sku.sku)+'</strong><small>Por R$ '+money(sku.price)+(sku.listPrice?' · De R$ '+money(sku.listPrice):'')+(sku.available?'':' · indisponível')+'</small>';item.addEventListener('click',function(){close();applySku(offer,sku,false)});box.appendChild(item)});modal.hidden=false
 }
 button.addEventListener('click',function(){var url=urlField.value.trim();if(!url){urlField.focus();status('Cole o link da oferta da FG para continuar.',false);return};button.disabled=true;button.textContent='Consultando…';importStatus('Consultando a oferta no site da FG…');status('Consultando oferta no site da FG…',true);fetch('https://ecommerce-fg.vonderferramentas.workers.dev/product-offer?url='+encodeURIComponent(url)).then(function(res){return res.json().then(function(data){if(!res.ok)throw new Error(data.error||'Não foi possível consultar a oferta.');return data})}).then(function(offer){var skus=(offer.skus||[]).filter(function(s){return s.available});if(!skus.length)throw new Error('Nenhum SKU disponível foi encontrado.');offer.skus=skus;if(skus.length>1&&!skus.every(function(s){return sameCommercialOffer(s,skus[0])})){importStatus('Escolha um SKU para continuar.');chooseSku(offer)}else{applySku(offer,skus[0],skus.length>1)}}).catch(function(err){var message=err.message||'Não foi possível consultar a oferta.';importStatus(message);status(message,false)}).finally(function(){button.disabled=false;button.textContent='Puxar dados'})
 })
})();
})();
// Módulos do painel esquerdo: seta no canto do cabeçalho recolhe/abre o conteúdo (abertos por padrão).
document.querySelectorAll('.pe-panel .pe-section>.pe-step').forEach(function(step){
 var section=step.parentNode,button=document.createElement('button'),body=document.createElement('div'),inner=document.createElement('div');
 body.className='pe-collapse-body';inner.className='pe-collapse-inner';
 while(step.nextSibling)inner.appendChild(step.nextSibling);
 body.appendChild(inner);section.appendChild(body);
 button.type='button';button.className='pe-collapse';button.setAttribute('aria-expanded','true');
 button.setAttribute('aria-label','Recolher ou abrir: '+((step.querySelector('strong')||{}).textContent||'módulo'));
 button.innerHTML='<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 button.addEventListener('click',function(){
  var closed=section.classList.toggle('is-collapsed');button.setAttribute('aria-expanded',closed?'false':'true');
  // overflow só recorta durante a animação e quando fechado, para não cortar o foco dos campos quando aberto
  section.classList.add('is-animating');clearTimeout(section._peAnim);section._peAnim=setTimeout(function(){section.classList.remove('is-animating')},300)
 });
 step.appendChild(button)
});
// Numeração dos módulos visíveis (Oferta só aparece em algumas editorias): 1, 2, 3...
(function(){
 var panel=document.querySelector('.pe-panel');
 function renumber(){var n=0;panel.querySelectorAll('.pe-section>.pe-step>span').forEach(function(span){if(span.closest('.pe-section').offsetParent!==null)span.textContent=++n})}
 renumber();new MutationObserver(renumber).observe(panel,{attributes:true,attributeFilter:['hidden'],subtree:true})
})();
