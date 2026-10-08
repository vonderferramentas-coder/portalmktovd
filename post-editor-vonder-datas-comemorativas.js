// Editoria "Datas comemorativas" (marca VONDER): grade de 1, 2 ou 4 fotos de fundo, losango escuro com a data, faixa preta com o título,
// forma amarela de pontas com texto e forma branca opcional com texto. Medidas tiradas das artes de referência
// (X:\temporario\Lucas\Data Comemorativa VONDER). Fontes do PSD: Montserrat (data e textos) e Swiss 721 Bold Condensed Italic (título).
// Exclusiva da VONDER: registrada só em POST_EDITOR_CUSTOM_PRESETS[''] e sem referência cruzada com as datas comemorativas das outras marcas.
(function(global){
  'use strict';
  var YELLOW='#F6BE00',INK='#000000';
  var SW='"Swiss721Editor","Arial Narrow",Impact,sans-serif',MO='"MontserratEditor",Montserrat,Arial,sans-serif';
  // cy: centro vertical da faixa preta/losango; y0: referência do topo da forma amarela; whiteX: borda esquerda da forma branca
  var GEO={feed:{w:1080,h:1350,cy:209,y0:515,whiteX:123,dW:0,dWhite:0},story:{w:1080,h:1920,cy:290,y0:825,whiteX:110,dW:-37,dWhite:40}};
  var AX=335,APEX_R=65,PILL_H=80,TEXT_X=346,PILL_PAD=39;
  var FIELDS={
    day:{id:'vcDay',font:MO,b:true,i:false,caps:false},
    month:{id:'vcMonth',font:MO,b:false,i:false,caps:true},
    prefix:{id:'vcPrefix',font:SW,b:true,i:true,caps:true},
    title:{id:'vcTitle',font:SW,b:true,i:true,caps:true},
    yellow:{id:'vcYellow',font:MO,b:false,i:false,caps:false},
    white:{id:'vcWhite',font:MO,b:false,i:false,caps:false}
  };
  var SINGLE_SHIFT=390;
  var SINGLE_LINE={day:1,month:1,prefix:1,title:1};
  var SLOT_NAMES={single:['Foto'],two:['Foto de cima','Foto de baixo'],four:['Superior esquerda','Superior direita','Inferior esquerda','Inferior direita']};
  // pontas (desvios em px da referência do topo/da base; x em fração da largura): 0 e 1 = as duas artes de referência, o resto sai sorteado
  var SHAPES=[
    {top:[[0,27],[.272,-36],[.45,5],[.727,-1],[1,58]],bot:[[0,12],[.148,16],[.33,-6],[.435,14],[.56,-13],[.659,6],[.92,-19],[.989,-3]]},
    {top:[[0,-14],[.108,-16],[.299,11],[.413,-13],[.541,18],[.638,-3],[.923,26],[1,18]],bot:[[0,-16],[.246,48],[.431,0],[.72,7],[1,-62]]}
  ];
  var V,API=null,fontsAsked=false,last={feed:null,story:null},rec=[],editEl=null;

  function fresh(){return{layout:'four',photos:[null,null,null,null],names:['','','',''],urls:['','','',''],loading:[false,false,false,false],files:[null,null,null,null],sizes:[0,0,0,0],hashes:['','','',''],hashPromises:[null,null,null,null],missing:[null,null,null,null],reduced:[false,false,false,false],scale:{day:1,month:1,prefix:1,title:1,yellow:1,white:1},textW:595,whiteOn:true,whiteAuto:true,whiteW:470,seed:0,loz:1,side:'left'}}
  V=fresh();
  function $(id){return document.getElementById(id)}
  function $$(sel){return Array.prototype.slice.call(document.querySelectorAll(sel))}
  // enquadramento da foto i no formato (deslocamento e zoom ficam em state.format: desfazer e "Restaurar posições" cobrem tudo)
  function phOf(pos,i){var l=pos.ph=pos.ph||[];return l[i]||(l[i]={dx:0,dy:0,z:1})}
  function isTitle(key){return key==='prefix'||key==='title'}
  // ===== artes salvas (post-editor-saved-arts.js): o que vai para o documento e como volta =====
  // A receita é guardada como texto JSON (o Firestore não aceita listas dentro de listas); os campos de texto passam pelo mesmo filtro de
  // <b>/<i>/<u> da edição, na ida e na volta, então um documento alterado por fora nunca injeta HTML.
  function round1(n){return Math.round((+n||0)*10)/10}
  // enquadramento padrão (centrado, sem zoom) = null: o desenho cria essas entradas sozinho, e o documento não pode mudar por causa disso
  function framing(e){if(!e)return null;var o={dx:round1(e.dx),dy:round1(e.dy),z:Math.round(e.z*100)/100};return!o.dx&&!o.dy&&o.z===1?null:o}
  function serialize(){
    var st=API.state.format,format={};
    ['feed','story'].forEach(function(f){
      var p=st[f]||{},ph=[];for(var i=0;i<4;i++)ph.push(framing(p.ph&&p.ph[i]));
      format[f]={overlayDy:Math.round(p.overlayDy||0),ph:ph}
    });
    var fields={};Object.keys(FIELDS).forEach(function(k){fields[k]=global.CartazTitleFormat.sanitize($(FIELDS[k].id),{keepBr:true,always:true})});
    var photos=[],blobs=[];
    for(var i=0;i<4;i++){
      if(V.photos[i]){photos.push({slot:i,name:V.names[i],size:V.sizes[i],hash:V.hashes[i]||''});if(V.files[i]&&V.hashes[i]&&!V.reduced[i])blobs.push({hash:V.hashes[i],blob:V.files[i]})}
      else if(V.missing[i])photos.push({slot:i,name:V.missing[i].name,size:V.missing[i].size,hash:V.missing[i].hash})
    }
    return{
      title:($('productName')&&$('productName').value)||'Data comemorativa',
      recipe:{v:1,layout:V.layout,side:V.side,seed:V.seed,loz:V.loz,textW:V.textW,whiteOn:V.whiteOn,whiteAuto:V.whiteAuto,whiteW:V.whiteW,scale:V.scale,fields:fields,format:format},
      photos:photos,blobs:blobs,maxSide:V.layout==='single'?1600:1280,
      // o hash de cada foto é calculado em segundo plano: só salva depois que todos estiverem prontos
      ready:Promise.all(V.hashPromises.filter(Boolean)).then(function(){photos.forEach(function(p){if(!p.hash&&V.hashes[p.slot]){p.hash=V.hashes[p.slot];if(!V.reduced[p.slot])blobs.push({hash:p.hash,blob:V.files[p.slot]})}})})
    }
  }
  function num(v,lo,hi,def){v=+v;return isFinite(v)?Math.max(lo,Math.min(hi,v)):def}
  // d = {recipe, photos}; getBlob(hash) devolve a foto guardada neste navegador (ou null: a foto vira "Reenviar")
  function restore(d,getBlob){
    var r=d.recipe||{};if(r.v!==1)return Promise.resolve();
    V.layout=SLOT_NAMES[r.layout]?r.layout:'four';V.side=r.side==='right'?'right':'left';V.seed=Math.max(0,Math.floor(num(r.seed,0,1e6,0)));V.loz=num(r.loz,0,1.4,1);
    V.textW=num(r.textW,300,860,595);V.whiteW=num(r.whiteW,300,860,470);V.whiteOn=r.whiteOn!==false;V.whiteAuto=!!r.whiteAuto;
    Object.keys(V.scale).forEach(function(k){V.scale[k]=num(r.scale&&r.scale[k],.6,1.6,1)});
    Object.keys(FIELDS).forEach(function(k){setField(k,global.CartazTitleFormat.clean(String((r.fields&&r.fields[k])||''),{keepBr:true,always:true}))});
    $('vcGrid').value=V.layout;$('vcSide').value=V.side;$('vcLoz').value=Math.round(V.loz*100);$('vcLozOut').value=Math.round(V.loz*100)+'%';
    $('vcTextW').value=V.textW;$('vcTextWOut').value=V.textW;$('vcWhiteW').value=V.whiteW;$('vcWhiteWOut').value=V.whiteW;$('vcWhiteOn').checked=V.whiteOn;$('vcWhiteBox').hidden=!V.whiteOn;
    ['feed','story'].forEach(function(f){
      var s=(r.format&&r.format[f])||{};
      API.state.format[f]={bgDx:0,bgDy:0,overlayDx:0,overlayDy:num(s.overlayDy,-2000,2000,0),ph:(Array.isArray(s.ph)?s.ph.slice(0,4):[]).map(function(p){return p?{dx:num(p.dx,-5000,5000,0),dy:num(p.dy,-5000,5000,0),z:num(p.z,1,3,1)}:null})}
    });
    syncName();renderSlots();
    return Promise.all((d.photos||[]).map(function(p){
      var slot=+p.slot;if(!(slot>=0&&slot<4)||!p.hash)return;
      return getBlob(p.hash).then(function(got){if(got)return loadPhoto(slot,got.blob,p.hash,true,String(p.name||''),got.reduced);V.missing[slot]={name:String(p.name||''),size:+p.size||0,hash:String(p.hash)}})
    })).then(function(){renderSlots();API.redraw()})
  }
  function capital(t){t=String(t||'').trim().toLocaleLowerCase('pt-BR');return t?t.charAt(0).toLocaleUpperCase('pt-BR')+t.slice(1):''}
  // "Feliz Dia do Vendedor!": enquanto ninguém mexe no texto da forma branca, ele acompanha a chamada e o título
  // título todo em maiúsculas vira "Vendedor"; título já em caixa mista ("São João Batista") fica como está
  function titleCase(t){t=String(t||'').trim();return t===t.toLocaleUpperCase('pt-BR')?capital(t):t}
  function whiteText(prefix,title){return'Feliz '+(String(prefix||'').trim()?String(prefix).trim()+' ':'')+titleCase(title)+'!'}
  function autoWhite(){if(V.whiteAuto)setField('white','<b>'+esc(whiteText($(FIELDS.prefix.id).textContent,$(FIELDS.title.id).textContent))+'</b>')}
  // A↑/A↓ (dir = +1/-1): tamanho de um texto, de 5 em 5% entre 60% e 160%
  function bump(key,dir){V.scale[key]=Math.max(.6,Math.min(1.6,Math.round((V.scale[key]+.05*dir)*100)/100));return V.scale[key]}
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function rng(seed){var a=seed*2654435761>>>0;return function(){a=(a+0x6D2B79F5)>>>0;var t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  function shapeFor(seed){
    if(seed<SHAPES.length)return SHAPES[seed];
    var r=rng(seed+1),pts=function(n,lo,hi,start,end,xEnd){
      var xs=[0],k;for(k=1;k<n;k++)xs.push(k/n+(r()-.5)*.5/n);xs.push(xEnd);
      var out=[],dy=start,sign=r()<.5?-1:1;
      xs.forEach(function(x,i){if(i===0)dy=start;else if(i===xs.length-1)dy=end;else{dy=Math.max(lo,Math.min(hi,dy+sign*(18+r()*34)));sign=-sign}out.push([x,Math.round(dy)])});return out};
    return{top:pts(3+Math.floor(r()*3),-45,40,Math.round(r()*40-10),Math.round(20+r()*40),1),bot:pts(3+Math.floor(r()*4),-25,50,Math.round(r()*30-14),Math.round(-60+r()*50),.99)}
  }

  // ===== texto rico: cada campo do painel é um contenteditable com <b>/<i>/<u> (CartazTitleFormat) =====
  function chars(key){
    var f=FIELDS[key],el=$(f.id),out=[];if(!el)return out;
    var box=document.createElement('div');box.innerHTML=global.CartazTitleFormat?global.CartazTitleFormat.sanitize(el,{keepBr:true,always:true}):esc(el.textContent);
    (function walk(n,st){n.childNodes.forEach(function(c){
      if(c.nodeType===3)c.nodeValue.split('').forEach(function(ch){out.push({c:f.caps?ch.toLocaleUpperCase('pt-BR'):ch,b:st.b,i:st.i,u:st.u})});
      else if(c.nodeType===1){if(c.tagName==='BR'){out.push({c:'\n'});return}
        var s={b:st.b,i:st.i,u:st.u},cl=c.classList;if(c.tagName==='B'||c.tagName==='STRONG')s.b=true;if(c.tagName==='I'||c.tagName==='EM')s.i=true;if(c.tagName==='U')s.u=true;if(cl.contains('fn'))s.i=false;if(cl.contains('wn'))s.b=false;walk(c,s)}})})(box,{b:f.b,i:f.i,u:false});
    return out
  }
  function runs(list){var r=[];list.forEach(function(ch){var l=r[r.length-1];if(l&&l.b===ch.b&&l.i===ch.i&&l.u===ch.u)l.t+=ch.c;else r.push({t:ch.c,b:ch.b,i:ch.i,u:ch.u})});return r}
  function fontOf(key,r,size){return(r.b?'700':'400')+' '+(r.i?'italic':'normal')+' '+size+'px '+FIELDS[key].font}
  function width(ctx,key,list,size){return runs(list).reduce(function(w,r){ctx.font=fontOf(key,r,size);return w+ctx.measureText(r.t).width},0)}
  function drawRuns(ctx,key,list,x,y,size){
    var show=key!==V.editing;runs(list).forEach(function(r){ctx.font=fontOf(key,r,size);var w=ctx.measureText(r.t).width;if(show){ctx.fillText(r.t,x,y);if(r.u)ctx.fillRect(x,y+size*.12,w,Math.max(2,size/16))}x+=w});return x
  }
  // largura só da tinta (sem o espaço lateral do primeiro e do último caractere) e recuo da tinta no início
  function bearings(ctx,key,list,size){
    var r=runs(list);if(!r.length)return{l:0,r:0};
    ctx.font=fontOf(key,r[0],size);var a=ctx.measureText(r[0].t.charAt(0)),l=-a.actualBoundingBoxLeft;
    var lr=r[r.length-1],ch=lr.t.charAt(lr.t.length-1);ctx.font=fontOf(key,lr,size);var b=ctx.measureText(ch);return{l:l,r:b.width-b.actualBoundingBoxRight}
  }
  function ink(ctx,key,list,size){var b=bearings(ctx,key,list,size);return width(ctx,key,list,size)-b.l-b.r}
  // quebra em linhas de no máximo maxW ('\n' = quebra forçada)
  function wrap(ctx,key,list,maxW,size){
    var lines=[],cur=[],curW=0,word=[];
    function flush(){
      if(!word.length)return;var w=width(ctx,key,word,size),sp=cur.length?width(ctx,key,[{c:' ',b:word[0].b,i:word[0].i,u:false}],size):0;
      if(cur.length&&curW+sp+w>maxW){lines.push(cur);cur=[];curW=0;sp=0}
      if(sp)cur.push({c:' ',b:word[0].b,i:word[0].i,u:false});cur=cur.concat(word);curW+=sp+w;word=[]
    }
    list.forEach(function(ch){if(ch.c==='\n'){flush();lines.push(cur);cur=[];curW=0}else if(/\s/.test(ch.c))flush();else word.push(ch)});
    flush();if(cur.length||!lines.length)lines.push(cur);return lines
  }

  // ===== peças da arte =====
  function lozengePath(ctx,cy,keep){
    var r=APEX_R,u=r/Math.SQRT2,far=60;if(!keep)ctx.beginPath();
    ctx.moveTo(AX-cy-far,-far);ctx.lineTo(AX-u,cy-u);ctx.arc(AX-r*Math.SQRT2,cy,r,-Math.PI/4,Math.PI/4);ctx.lineTo(-far,AX+cy+far)
  }
  // regiões de texto desta renderização (duplo clique abre a edição em cima delas)
  function text(key,x,base,size,w,color,spacing,o){rec.push(Object.assign({key:key,x:x,base:base,size:size,w:w,pitch:size*1.2,color:color,spacing:spacing||0,align:'left',box:[x-8,base-size*.85,w+16,size*1.1]},o))}
  function drawHeader(ctx,g){
    var cy=g.cy,sc=V.scale,pre=chars('prefix'),tit=chars('title'),sp=pre.length?15:0;
    // faixa preta (só fora do losango); a fonte encolhe junto se a chamada + o título passarem da margem direita
    var psz=46.8*sc.prefix,tsz=46.8*sc.title,room=g.w-40-PILL_PAD-TEXT_X,need=width(ctx,'prefix',pre,psz)+sp+width(ctx,'title',tit,tsz),k=need>room?room/need:1;psz*=k;tsz*=k;
    // linha de base: o centro das maiúsculas (75% do corpo da Swiss) cai no centro da faixa, qualquer que seja o tamanho do texto
    var tb=cy+.375*Math.max(psz,tsz),pw=width(ctx,'prefix',pre,psz),tw=width(ctx,'title',tit,tsz),right=TEXT_X+pw+(pre.length?sp*k:0)+tw+PILL_PAD;
    ctx.save();ctx.beginPath();ctx.rect(0,0,g.w,g.h);lozengePath(ctx,cy,true);ctx.lineTo(-60,-60);ctx.closePath();ctx.clip('evenodd');
    var top=cy-PILL_H/2,rr=PILL_H/2;ctx.fillStyle='#000';ctx.beginPath();ctx.moveTo(AX-80,top);ctx.lineTo(right-rr,top);ctx.arc(right-rr,cy,rr,-Math.PI/2,Math.PI/2);ctx.lineTo(AX-80,top+PILL_H);ctx.closePath();ctx.fill();ctx.restore();
    // losango: preto translúcido (o fundo aparece), mais fechado na ponta de fora, com contorno branco fino
    var gr=ctx.createLinearGradient(0,0,AX,0);gr.addColorStop(0,'rgba(0,0,0,'+Math.min(1,.78*V.loz)+')');gr.addColorStop(1,'rgba(0,0,0,'+Math.min(1,.40*V.loz)+')');
    lozengePath(ctx,cy);ctx.save();ctx.lineTo(-60,-60);ctx.closePath();ctx.fillStyle=gr;ctx.fill();ctx.restore();
    lozengePath(ctx,cy);ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
    ctx.textBaseline='alphabetic';ctx.textAlign='left';
    // título: chamada branca + título amarelo, na mesma linha de base
    ctx.fillStyle='#fff';var x=drawRuns(ctx,'prefix',pre,TEXT_X,tb,psz);ctx.fillStyle=YELLOW;var tx=x+(pre.length?sp*k:0);drawRuns(ctx,'title',tit,tx,tb,tsz);
    // chamada vazia: o começo da faixa preta (36px antes do título) abre a edição dela
    text('prefix',TEXT_X,tb,psz,pre.length?pw:30,'#fff',0,pre.length?null:{box:[TEXT_X-36,cy-26,36,52]});text('title',tx,tb,tsz,tw,YELLOW);
    // dia grande e mês com o espaçamento aberto até a largura do número
    // o número tem sempre ~112px de largura (dois dígitos mais largos, como 27 e 28, usam fonte menor); a tinta começa na margem de 99px
    var day=chars('day'),mon=chars('month'),msz=21*sc.month,dsz=Math.max(60,Math.min(130,112*(112/Math.max(1,ink(ctx,'day',day,112))))*sc.day),dw=ink(ctx,'day',day,dsz);
    var dx=99-bearings(ctx,'day',day,dsz).l;ctx.fillStyle=YELLOW;drawRuns(ctx,'day',day,dx,cy+17,dsz);text('day',dx,cy+17,dsz,dw,YELLOW);
    if(mon.length){var nat=ink(ctx,'month',mon,msz),spc=mon.length>1?Math.max(0,Math.min(14,(dw-nat)/(mon.length-1))):0;if('letterSpacing' in ctx)ctx.letterSpacing=spc+'px';var mx=99-bearings(ctx,'month',mon,msz).l;drawRuns(ctx,'month',mon,mx,cy+50,msz);text('month',mx,cy+50,msz,dw,YELLOW,spc);if('letterSpacing' in ctx)ctx.letterSpacing='0px'}
  }
  // right = a forma parte da borda direita (espelhada); gw = largura da arte
  function drawShapePath(ctx,W,topY,botY,shape,right,gw){
    var X=function(p){return right?gw-p*W:p*W},bleed=right?gw+30:-30;
    ctx.beginPath();ctx.moveTo(bleed,topY+shape.top[0][1]);
    shape.top.forEach(function(p){ctx.lineTo(X(p[0]),topY+p[1])});
    for(var i=shape.bot.length-1;i>=0;i--)ctx.lineTo(X(shape.bot[i][0]),botY+shape.bot[i][1]);
    ctx.lineTo(bleed,botY+shape.bot[0][1]);ctx.closePath()
  }
  function min(list,i){return Math.min.apply(null,list.map(function(p){return p[i]}))}
  function max(list,i){return Math.max.apply(null,list.map(function(p){return p[i]}))}

  function drawShapes(ctx,g,pos,roundRect){
    var sc=V.scale,shape=shapeFor(V.seed),ysz=29.2*sc.yellow,ypitch=35*sc.yellow;
    var ylines=wrap(ctx,'yellow',chars('yellow'),V.textW,ysz),maxLine=Math.max.apply(null,ylines.map(function(l){return width(ctx,'yellow',l,ysz)})),W=Math.max(300,Math.round(maxLine+99+117+g.dW));
    var wsz=29*sc.white,wpitch=35*sc.white,wlines=null,wcenter=true,whiteW=V.whiteW+g.dWhite;
    if(V.whiteOn){wlines=wrap(ctx,'white',chars('white'),whiteW-120,wsz);if(wlines.length>1){wcenter=false;wlines=wrap(ctx,'white',chars('white'),whiteW-162,wsz)}}
    // lado de partida: a forma amarela sangra pela borda esquerda (padrão) ou pela direita; o texto e a forma branca espelham junto
    var R=V.side==='right',ox=R?g.w-W:0,tx=R?ox+117:99,wx0=R?g.w-g.whiteX-whiteW:g.whiteX;
    // alturas relativas à referência do topo (0): primeira linha, base da forma amarela, forma branca
    var base1=67+.72*ysz,lastY=base1+(ylines.length-1)*ypitch,botRef=lastY+.19*ysz+67;
    var wBase1=botRef+40+wsz,wBottom=wlines?wBase1+(wlines.length-1)*wpitch+42:0;
    var topEdge=min(shape.top,1),bottom=Math.max(botRef+max(shape.bot,1),wBottom);
    // o arraste só desloca na vertical; o limite da arte volta pro deslocamento guardado, senão arrastar além da borda "acumularia" movimento
    var y=g.y0+pos.overlayDy;y=Math.max(-topEdge,Math.min(g.h-bottom,y));pos.overlayDy=y-g.y0;
    // forma branca primeiro: o topo dela fica escondido atrás da amarela
    if(wlines){ctx.fillStyle='#fff';roundRect(ctx,wx0,y+botRef-60,whiteW,wBottom-botRef+60,45);ctx.fill()}
    ctx.save();ctx.shadowColor='rgba(0,0,0,.22)';ctx.shadowBlur=14;ctx.shadowOffsetY=4;ctx.fillStyle=YELLOW;drawShapePath(ctx,W,y,y+botRef,shape,R,g.w);ctx.fill();ctx.restore();
    ctx.fillStyle=INK;ctx.textBaseline='alphabetic';ctx.textAlign='left';
    ylines.forEach(function(l,i){drawRuns(ctx,'yellow',l,tx,y+base1+i*ypitch,ysz)});text('yellow',tx,y+base1,ysz,V.textW,INK,0,{pitch:ypitch,box:[tx-8,y+base1-ysz,V.textW+16,(ylines.length-1)*ypitch+ysz*1.3]});
    if(wlines){wlines.forEach(function(l,i){var lw=width(ctx,'white',l,wsz);drawRuns(ctx,'white',l,wcenter?wx0+(whiteW-lw)/2:wx0+82,y+wBase1+i*wpitch,wsz)});var wx=wcenter?wx0:wx0+82,ww=wcenter?whiteW:whiteW-162;text('white',wx,y+wBase1,wsz,ww,INK,0,{pitch:wpitch,align:wcenter?'center':'left',box:[wx0,y+wBase1-wsz,whiteW,(wlines.length-1)*wpitch+wsz*1.5]})}
    var yb=[ox,y+topEdge,W,botRef-topEdge+max(shape.bot,1)],wb=wlines?[wx0,y+botRef-60,whiteW,wBottom-botRef+60]:null;
    if(!wb)return{move:yb,rects:[yb]};
    var mx=Math.min(ox,wx0),mr=Math.max(ox+W,wx0+whiteW);
    return{move:[mx,yb[1],mr-mx,Math.max(yb[1]+yb[3],wb[1]+wb[3])-yb[1]],rects:[yb,wb]}
  }

  // ===== fotos =====
  // grade: colunas x linhas; a célula k fica em (k % colunas, k / colunas) e o deslizamento usa posições fracionárias
  function gridOf(layout){return layout==='single'?{c:1,r:1}:layout==='two'?{c:1,r:2}:{c:2,r:2}}
  function colRow(layout,k){var G=gridOf(layout);return[k%G.c,Math.floor(k/G.c)]}
  function rectAt(g,layout,col,row){var G=gridOf(layout),w=g.w/G.c,h=g.h/G.r;return[col*w,row*h,w,h]}
  function cellsFor(layout,g){return SLOT_NAMES[layout].map(function(_,k){var p=colRow(layout,k);return rectAt(g,layout,p[0],p[1])})}
  function clampOff(d,size,frame){var s=Math.max(0,(size-frame)/2);return Math.max(-s,Math.min(s,d))}
  function drawCell(ctx,i,r,pos){
    var img=V.photos[i];ctx.save();ctx.beginPath();ctx.rect(r[0],r[1],r[2],r[3]);ctx.clip();
    if(img){
      var ph=phOf(pos,i),s=Math.max(r[2]/img.width,r[3]/img.height)*ph.z,w=img.width*s,h=img.height*s;
      ph.dx=clampOff(ph.dx,w,r[2]);ph.dy=clampOff(ph.dy,h,r[3]);ctx.drawImage(img,r[0]+(r[2]-w)/2+ph.dx,r[1]+(r[3]-h)/2+ph.dy,w,h)
    }else{
      var gr=ctx.createLinearGradient(r[0],r[1],r[0]+r[2],r[1]+r[3]);gr.addColorStop(0,'#2a2e31');gr.addColorStop(1,'#4b504e');ctx.fillStyle=gr;ctx.fillRect(r[0],r[1],r[2],r[3]);
      ctx.fillStyle='rgba(255,255,255,.55)';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 34px '+MO;ctx.fillText(V.missing[i]?'Reenviar a foto':'＋ '+SLOT_NAMES[V.layout][i],r[0]+r[2]/2,r[1]+r[3]/2);ctx.font='400 22px '+MO;ctx.fillText(V.missing[i]?V.missing[i].name:'dê dois cliques para enviar',r[0]+r[2]/2,r[1]+r[3]/2+36)
    }
    ctx.restore()
  }

  // lugar vazio da foto que está sendo arrastada (tracejado amarelo, como o cartão do Gerador de Consolidado)
  function drawGap(ctx,r){
    ctx.save();ctx.fillStyle='rgba(246,190,0,.16)';ctx.fillRect(r[0],r[1],r[2],r[3]);
    ctx.strokeStyle=YELLOW;ctx.lineWidth=6;ctx.setLineDash([26,16]);ctx.strokeRect(r[0]+8,r[1]+8,r[2]-16,r[3]-16);ctx.restore()
  }
  function renderer(api){
    var ctx=api.ctx,f=api.format,g=GEO[f],pos=api.state.format[f],h=api.helpers;
    if(!fontsAsked&&document.fonts){fontsAsked=true;Promise.all(['400 20px MontserratEditor','700 20px MontserratEditor','italic 700 20px "Swiss721Editor"','400 20px "Swiss721Editor"'].map(function(x){return document.fonts.load(x)})).then(function(){if(API)API.redraw()}).catch(function(){})}
    ctx.textAlign='left';ctx.textBaseline='alphabetic';rec=[];
    var cells=cellsFor(V.layout,g),d=V.drag,now=performance.now();
    // durante o arraste cada foto é desenhada na posição animada dela; a que está sendo arrastada deixa só o lugar tracejado
    if(d)SLOT_NAMES[V.layout].forEach(function(_,id){var q=animPos(id,now),r=rectAt(g,V.layout,q[0],q[1]);if(id===d.id)drawGap(ctx,r);else drawCell(ctx,id,r,pos)});
    else cells.forEach(function(r,i){drawCell(ctx,i,r,pos)});
    var sh=drawShapes(ctx,g,pos,h.roundRect);drawHeader(ctx,g);
    last[f]={cells:cells,rects:sh.rects,texts:rec,move:sh.move};h.setMoveBox(sh.move);if(f==='feed')syncZooms(pos)
  }

  // ===== interação na arte (ganchos chamados por post-editor.js) =====
  function hit(r,x,y){return x>=r[0]&&x<=r[0]+r[2]&&y>=r[1]&&y<=r[1]+r[3]}
  function cellAt(format,x,y){var L=last[format];if(!L)return-1;for(var i=0;i<L.cells.length;i++)if(hit(L.cells[i],x,y))return i;return-1}
  // Clicar e arrastar enquadra a foto; clicar, SEGURAR (parado por HOLD_MS) e arrastar muda a foto de posição (Shift faz isso na hora).
  // Mesmo gesto do Gerador de Consolidado: um "fantasma" da foto segue o ponteiro, o lugar dela fica tracejado, as outras fotos deslizam
  // para abrir espaço (a ordem muda ao vivo) e, ao soltar, o fantasma assenta na posição nova.
  var HOLD_MS=350,HOLD_SLOP=6,SLIDE_MS=180;
  function clearPress(){if(V.press){clearTimeout(V.press.timer);V.press=null}}
  function startPress(format,i,x,y){
    clearPress();var p=V.press={format:format,i:i,dx:0,dy:0,mode:null};
    p.timer=setTimeout(function(){if(V.press===p&&!p.mode){p.mode='drag';beginDrag(format,i,x,y)}},HOLD_MS)
  }
  function easeOut(t){return 1-Math.pow(1-t,3)}
  // posição (coluna, linha) da foto id agora: a da ordem atual, ou no meio do deslizamento até ela
  function animPos(id,now){
    var d=V.drag,to=colRow(V.layout,d.order.indexOf(id)),a=d.anim[id];if(!a)return to;
    var e=easeOut(Math.min(1,(now-a.t0)/SLIDE_MS));return[a.from[0]+(to[0]-a.from[0])*e,a.from[1]+(to[1]-a.from[1])*e]
  }
  function slideLoop(){
    var d=V.drag;if(!d)return;API.redraw();var now=performance.now();
    if(Object.keys(d.anim).some(function(id){return now-d.anim[id].t0<SLIDE_MS}))requestAnimationFrame(slideLoop)
  }
  function beginDrag(format,i,x,y){
    var c=$(format+'Canvas'),rect=c.getBoundingClientRect(),k=rect.width/c.width,cell=last[format].cells[i];
    var d=V.drag={format:format,id:i,order:SLOT_NAMES[V.layout].map(function(_,n){return n}),anim:{},grab:[(x-cell[0])*k,(y-cell[1])*k],box:[rect.left+cell[0]*k,rect.top+cell[1]*k,cell[2]*k,cell[3]*k]};
    // fantasma: retrato da foto na própria célula, com o enquadramento dela neste formato
    var snap=document.createElement('canvas');snap.width=Math.max(1,Math.round(d.box[2]));snap.height=Math.max(1,Math.round(d.box[3]));
    var sx=snap.getContext('2d');sx.scale(k,k);drawCell(sx,i,[0,0,cell[2],cell[3]],API.state.format[format]);
    d.ghost=document.createElement('div');d.ghost.className='pe-vc-ghost';d.ghost.style.cssText='left:'+d.box[0]+'px;top:'+d.box[1]+'px;width:'+d.box[2]+'px;height:'+d.box[3]+'px';
    d.ghost.appendChild(snap);document.body.appendChild(d.ghost);API.redraw();API.status('Arraste até a posição desejada e solte',false)
  }
  function moveDrag(cx,cy){
    var d=V.drag,c=$(d.format+'Canvas'),rect=c.getBoundingClientRect(),k=rect.width/c.width;
    d.ghost.style.transform='translate('+(rect.left+cx*k-d.grab[0]-d.box[0])+'px,'+(rect.top+cy*k-d.grab[1]-d.box[1])+'px) scale(1.02)';
    var j=cellAt(d.format,cx,cy),cur=d.order.indexOf(d.id);if(j<0||j===cur)return;
    var now=performance.now(),from={};d.order.forEach(function(id){from[id]=animPos(id,now)});
    d.order.splice(cur,1);d.order.splice(j,0,d.id);d.anim={};
    d.order.forEach(function(id,n){var to=colRow(V.layout,n);if(from[id][0]!==to[0]||from[id][1]!==to[1])d.anim[id]={from:from[id],t0:now}});
    slideLoop()
  }
  function finishDrag(){
    var d=V.drag;clearPress();if(!d)return;
    var c=$(d.format+'Canvas'),rect=c.getBoundingClientRect(),k=rect.width/c.width,cell=last[d.format].cells[d.order.indexOf(d.id)];
    d.ghost.style.transition='transform .16s ease, opacity .16s ease';
    d.ghost.style.transform='translate('+(rect.left+cell[0]*k-d.box[0])+'px,'+(rect.top+cell[1]*k-d.box[1])+'px)';d.ghost.style.opacity='.6';
    setTimeout(function(){
      if(d.ghost.parentNode)d.ghost.parentNode.removeChild(d.ghost);
      if(V.drag!==d)return;V.drag=null;
      if(d.order.some(function(id,n){return id!==n}))permute(d.order);else API.redraw()
    },170)
  }
  function pickTarget(format,x,y,e){
    var L=last[format];if(!L||V.drag)return null;
    var i=cellAt(format,x,y);
    if(e&&e.shiftKey&&i>=0&&V.photos[i]){beginDrag(format,i,x,y);return'swap'+i}
    if(L.rects.some(function(r){return hit(r,x,y)}))return'overlay';
    if(i<0)return null;
    if(V.photos[i])startPress(format,i,x,y);
    return'photo'+i
  }
  function onDrag(format,target,dx,dy,cx,cy){
    if(V.drag){moveDrag(cx,cy);return}
    if(target.indexOf('swap')===0)return;
    var p=V.press;
    // antes de segurar, um tremor de até HOLD_SLOP px não enquadra a foto; passou disso é enquadramento e o tempo de segurar não vale mais
    if(p&&!p.mode){p.dx+=dx;p.dy+=dy;if(Math.hypot(p.dx,p.dy)<HOLD_SLOP)return;p.mode='pan';clearTimeout(p.timer);dx=p.dx;dy=p.dy}
    var ph=phOf(API.state.format[format],+target.slice(5));ph.dx+=dx;ph.dy+=dy
  }
  function onDragEnd(){finishDrag()}
  // reordena as fotos (e o enquadramento delas): order[k] = de qual posição antiga vem a foto que fica na posição k
  function permute(order){
    ['photos','names','urls','loading','files','sizes','hashes','hashPromises','missing','reduced'].forEach(function(k){var old=V[k].slice();order.forEach(function(from,to){V[k][to]=old[from]})});
    ['feed','story'].forEach(function(f){var p=API.state.format[f],old=(p.ph||[]).slice();p.ph=[];order.forEach(function(from,to){if(old[from])p.ph[to]=old[from]})});
    renderSlots();API.redraw();API.status('Fotos reordenadas',false)
  }
  // copia o enquadramento mantendo o ponto de foco: a folga da foto na célula do outro formato tem outra proporção
  function slack(img,cell,z){var s=Math.max(cell[2]/img.width,cell[3]/img.height)*z;return[(img.width*s-cell[2])/2,(img.height*s-cell[3])/2]}
  function copyFraming(from,to){
    var cf=cellsFor(V.layout,GEO[from]),ct=cellsFor(V.layout,GEO[to]),n=0;
    cf.forEach(function(cell,i){
      var img=V.photos[i];if(!img)return;
      var a=phOf(API.state.format[from],i),b=phOf(API.state.format[to],i),sa=slack(img,cell,a.z);b.z=a.z;var sb=slack(img,ct[i],b.z);
      b.dx=sa[0]>0?a.dx/sa[0]*sb[0]:0;b.dy=sa[1]>0?a.dy/sa[1]*sb[1]:0;n++
    });
    API.redraw();API.status(n?'Enquadramento copiado para '+(to==='story'?'o Story':'o Feed'):'Envie ao menos uma foto antes de copiar',false)
  }
  function wheel(format,x,y,dir){
    var i=cellAt(format,x,y);if(i<0||!V.photos[i])return false;
    var ph=phOf(API.state.format[format],i);ph.z=Math.max(1,Math.min(3,Math.round((ph.z+dir*.05)*100)/100));API.redraw();return false
  }
  function dblclick(format,x,y){
    var L=last[format];if(!L)return;
    var t=L.texts.filter(function(t){return hit(t.box,x,y)})[0];if(t){openEdit(format,t.key);return}
    // o retângulo amarelo que pisca (como nas outras editorias) mostra o que o arraste vai mover
    if(L.rects.some(function(r){return hit(r,x,y)}))return{hit:true,box:L.move,label:'Formas selecionadas'};
    var i=cellAt(format,x,y);if(i<0)return;
    if(V.photos[i])return{hit:false,box:L.cells[i],label:'Foto selecionada'};
    var input=document.querySelector('#vcSlots [data-slot="'+i+'"] input[type=file]');if(input)input.click()
  }

  // ===== edição do texto por duplo clique: caixa em cima do texto (mesma fonte e tamanho), com a barra B/I/U e A↑/A↓ =====
  function closeEdit(){
    if(!editEl)return;var el=editEl;editEl=null;V.editing=null;if(el.parentNode)el.parentNode.removeChild(el);
    getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'));API&&API.redraw()
  }
  function openEdit(format,key){
    closeEdit();var c=document.getElementById(format+'Canvas'),f=FIELDS[key],src=$(f.id);if(!c||!src)return;
    var el=document.createElement('div');el.className='pe-uso-edit pe-vc-edit';el.contentEditable='true';el.spellcheck=true;el.innerHTML=src.innerHTML;
    el.place=function(){
      var t=last[format].texts.filter(function(t){return t.key===key})[0];if(!t)return;
      var rect=c.getBoundingClientRect(),wr=c.parentNode.getBoundingClientRect(),k=rect.width/c.width,s=el.style,single=!!SINGLE_LINE[key];
      s.fontFamily=f.font;s.fontWeight=f.b?700:400;s.fontStyle=f.i?'italic':'normal';s.color=t.color;s.caretColor=t.color;s.setProperty('--vc-ink',t.color);s.setProperty('--vc-sel',(key==='yellow'||key==='white')?'rgba(0,0,0,.25)':'rgba(255,255,255,.4)');s.textTransform=f.caps?'uppercase':'none';
      s.fontSize=t.size*k+'px';s.lineHeight=t.pitch*k+'px';s.letterSpacing=t.spacing*k+'px';s.textAlign=t.align;s.whiteSpace=single?'nowrap':'normal';
      s.left=(rect.left-wr.left+t.x*k)+'px';s.width=(single&&t.align!=='center')?'auto':t.w*k+'px';s.minWidth='24px';s.top=(rect.top-wr.top+(t.base-t.size)*k)+'px';
      // a linha de base no HTML não cai onde a do canvas cai: mede onde o navegador pôs a 1ª e empurra até a da arte
      var probe=document.createElement('span');probe.style.cssText='display:inline-block;width:0;height:0';el.insertBefore(probe,el.firstChild);
      s.top=(parseFloat(s.top)+rect.top+t.base*k-probe.getBoundingClientRect().bottom)+'px';el.removeChild(probe)
    };
    el.addEventListener('keydown',function(ev){if(ev.key==='Escape')closeEdit();else if(ev.key==='Enter'&&SINGLE_LINE[key]){ev.preventDefault();closeEdit()}});
    el.addEventListener('input',function(){src.innerHTML=global.CartazTitleFormat.sanitize(el,{keepBr:true,always:true});if(isTitle(key)){syncName();autoWhite()}if(key==='white')V.whiteAuto=false;API.redraw();el.place()});
    el.addEventListener('titlesize',function(ev){ev.stopPropagation();var v=bump(key,ev.detail);API.redraw();el.place();API.status('Tamanho do texto: '+Math.round(v*100)+'%',false)});
    el.addEventListener('blur',function(){setTimeout(function(){if(editEl===el)closeEdit()},0)});
    V.editing=key;API.redraw();c.parentNode.appendChild(el);el.place();editEl=el;el.focus();getSelection().selectAllChildren(el)
  }

  // ===== painel =====
  function setField(key,html){var el=$(FIELDS[key].id);if(el)el.innerHTML=html}
  function syncName(){var pre=chars('prefix').map(function(c){return c.c}).join(''),tit=chars('title').map(function(c){return c.c}).join(''),name=$('productName');if(name)name.value=(pre+' '+tit).trim()||'DATA COMEMORATIVA'}
  function syncZooms(pos){$$('#vcSlots [data-slot]').forEach(function(row){var z=row.querySelector('input[type=range]');if(z&&document.activeElement!==z)z.value=Math.round(phOf(pos,+row.dataset.slot).z*100)})}
  // Reordenar arrastando o ícone de três linhas (mesmo gesto do Gerador de Consolidado): um cartão fantasma segue o mouse, o lugar vazio
  // (tracejado) mostra onde a foto vai cair e os vizinhos deslizam (FLIP).
  function bindSlotReorder(row){
    var root=$('vcSlots'),panel=root.closest('.pe-panel')||root.parentNode,handle=row.querySelector('.pe-vc-handle');
    handle.onpointerdown=function(event){
      if(event.button)return;event.preventDefault();
      var box=row.getBoundingClientRect(),grabX=event.clientX-box.left,grabY=event.clientY-box.top;
      var ghost=row.cloneNode(true);ghost.classList.add('drag-ghost');ghost.style.cssText='left:'+box.left+'px;top:'+box.top+'px;width:'+box.width+'px';
      document.body.appendChild(ghost);row.classList.add('drag-placeholder');
      var pointerY=event.clientY,scrollSpeed=0,frame=0,ended=false;
      function rows(){return Array.prototype.slice.call(root.querySelectorAll('.pe-vc-slot'))}
      function place(){
        var before=rows().filter(function(e){return e!==row}).filter(function(e){var r=e.getBoundingClientRect();return pointerY<r.top+r.height/2})[0]||null;
        if(row.nextElementSibling===before)return;
        var first=new Map(rows().map(function(e){return[e,e.getBoundingClientRect().top]}));
        root.insertBefore(row,before);
        first.forEach(function(top,e){var shift=top-e.getBoundingClientRect().top;if(!shift||e===row)return;e.style.transition='none';e.style.transform='translateY('+shift+'px)';requestAnimationFrame(function(){e.style.transition='transform .18s ease';e.style.transform=''})})
      }
      function tick(){if(ended)return;if(scrollSpeed){panel.scrollTop+=scrollSpeed;place()}frame=requestAnimationFrame(tick)}
      function onMove(move){
        pointerY=move.clientY;ghost.style.transform='translate('+(move.clientX-grabX-box.left)+'px,'+(pointerY-grabY-box.top)+'px) scale(1.02)';
        var area=panel.getBoundingClientRect();scrollSpeed=pointerY<area.top+48?-8:pointerY>area.bottom-48?8:0;place()
      }
      function finish(commit){
        if(ended)return;ended=true;cancelAnimationFrame(frame);document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);document.removeEventListener('pointercancel',onCancel);
        var slot=row.getBoundingClientRect();ghost.style.transition='transform .16s ease, opacity .16s ease';ghost.style.transform='translate('+(slot.left-box.left)+'px,'+(slot.top-box.top)+'px)';ghost.style.opacity='.6';
        setTimeout(function(){
          ghost.remove();row.classList.remove('drag-placeholder');
          var order=rows().map(function(e){return+e.dataset.slot});
          if(commit&&order.some(function(id,n){return id!==n}))permute(order);else renderSlots()
        },170)
      }
      function onUp(){finish(true)}function onCancel(){finish(false)} // no document: mover o cartão no DOM solta a captura do ponteiro no ícone
      document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onUp);document.addEventListener('pointercancel',onCancel);tick()
    }
  }
  function renderSlots(){
    var box=$('vcSlots');if(!box)return;box.innerHTML='';
    SLOT_NAMES[V.layout].forEach(function(label,i){
      var row=document.createElement('div');row.className='pe-vc-slot';row.dataset.slot=i;
      row.innerHTML='<button type="button" class="pe-vc-handle" title="Arraste para reordenar" aria-label="Reordenar foto"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><label class="pe-vc-thumb" title="Enviar foto"><input type="file" accept="image/*">'+(V.photos[i]?'<img alt="">':'＋')+'</label><div><strong>'+esc(label)+'</strong><small>'+esc(V.reduced[i]?'Qualidade reduzida: reenvie o original ('+(V.names[i]||'foto')+')':V.names[i]||(V.missing[i]?'Reenviar: '+V.missing[i].name:'Clique no quadrado ou dê dois cliques na arte'))+'</small><div class="pe-vc-row"><input type="range" min="100" max="300" value="100" aria-label="Zoom da foto"><button type="button" data-act="center">Centralizar</button><button type="button" data-act="clear">Remover</button></div></div>';
      if(V.photos[i])row.querySelector('img').src=V.urls[i];
      row.querySelector('input[type=file]').addEventListener('change',function(){if(this.files[0])loadPhoto(i,this.files[0])});
      bindSlotReorder(row);
      row.querySelector('input[type=range]').addEventListener('input',function(){var z=this.value/100;['feed','story'].forEach(function(f){phOf(API.state.format[f],i).z=z});API.redraw()});
      row.querySelector('[data-act=center]').addEventListener('click',function(){resetPhoto(i);API.redraw()});
      row.querySelector('[data-act=clear]').addEventListener('click',function(){dropPhoto(i);V.missing[i]=null;resetPhoto(i);renderSlots();API.redraw()});
      box.appendChild(row)
    })
  }
  // próxima célula vazia depois de i (ou antes, se não houver); -1 se todas estiverem cheias
  function nextEmpty(i){var n=SLOT_NAMES[V.layout].length,k;for(k=1;k<n;k++)if(!V.photos[(i+k)%n]&&!V.loading[(i+k)%n])return(i+k)%n;return-1}
  function resetPhoto(i){['feed','story'].forEach(function(f){API.state.format[f].ph&&delete API.state.format[f].ph[i]})}
  function dropPhoto(i){if(V.urls[i])URL.revokeObjectURL(V.urls[i]);V.photos[i]=null;V.names[i]='';V.urls[i]='';V.files[i]=null;V.sizes[i]=0;V.hashes[i]='';V.hashPromises[i]=null;V.reduced[i]=false}
  // fotos de câmera têm milhares de pixels e seriam redesenhadas inteiras a cada movimento do arraste: acima de MAX_PHOTO o maior lado é reduzido
  var MAX_PHOTO=2200;
  function shrink(im){
    var k=MAX_PHOTO/Math.max(im.width,im.height);if(k>=1)return im;
    var c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);var x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(im,0,0,c.width,c.height);return c
  }
  // hash do arquivo (SHA-256, 128 bits): identifica a foto nas artes salvas e no cache do navegador
  function hashFile(blob){return blob.arrayBuffer().then(function(b){return crypto.subtle.digest('SHA-256',b)}).then(function(d){return Array.prototype.map.call(new Uint8Array(d).slice(0,16),function(x){return('0'+x.toString(16)).slice(-2)}).join('')})}
  // known/keep/name: usados ao reabrir uma arte salva (hash já conhecido, enquadramento preservado, nome guardado)
  // devolve uma promessa que termina quando a foto já está na célula (ou falhou): reabrir uma arte espera por isso antes de conferir o estado
  function loadPhoto(i,file,known,keep,name,reduced){
    return new Promise(function(done){
    var u=URL.createObjectURL(file),im=new Image();V.loading[i]=true;
    im.onload=function(){
      V.loading[i]=false;var gone=V.missing[i]||V.reduced[i];dropPhoto(i);V.missing[i]=null;V.reduced[i]=!!reduced;V.photos[i]=shrink(im);V.names[i]=file.name||name||'';V.urls[i]=u;V.files[i]=file;V.sizes[i]=file.size||0;
      V.hashPromises[i]=(known?Promise.resolve(known):hashFile(file)).then(function(h){V.hashes[i]=h;if(gone&&gone.hash&&gone.hash!==h)API.status('Atenção: este arquivo não é o mesmo da arte salva ('+gone.name+')',false);return h});
      if(!keep&&!gone)resetPhoto(i);renderSlots();API.redraw();if(!keep)API.status('Foto carregada: '+V.names[i],false);done()};
    im.onerror=function(){V.loading[i]=false;URL.revokeObjectURL(u);API.status('Não foi possível abrir a foto',false);done()};im.src=u
    })
  }
  function setup(api){
    API=api;var inc=api.incoming;V.urls.forEach(function(u){if(u)URL.revokeObjectURL(u)});V=fresh();
    var prefix=inc?inc.prefix:'Dia do',title=inc?inc.title:'Nome da data';
    setField('day',esc(inc?inc.day:'01'));setField('month',esc(capital(inc?inc.month:'Janeiro')));setField('prefix',esc(prefix));setField('title',esc(title));
    setField('yellow','Escreva aqui a mensagem da data comemorativa. Selecione palavras para destacar em <b>negrito</b>.');
    autoWhite();
    $('vcGrid').value=V.layout;$('vcSide').value=V.side;$('vcLoz').value=100;$('vcLozOut').value='100%';$('vcTextW').value=V.textW;$('vcTextWOut').value=V.textW;$('vcWhiteW').value=V.whiteW;$('vcWhiteWOut').value=V.whiteW;$('vcWhiteOn').checked=true;$('vcWhiteBox').hidden=false;
    renderSlots();syncName();api.status('Envie as fotos e ajuste os textos',false);api.redraw()
  }
  function bind(){
    if(!$('vcPanel'))return;
    Object.keys(FIELDS).forEach(function(key){
      var el=$(FIELDS[key].id);
      el.addEventListener('input',function(){if(isTitle(key)){syncName();autoWhite()}if(key==='white')V.whiteAuto=false;API&&API.redraw()});
      if(SINGLE_LINE[key])el.addEventListener('keydown',function(ev){if(ev.key==='Enter')ev.preventDefault()});
      // A↑/A↓ da barra flutuante (cartaz-title-format.js): mexem só no tamanho deste texto
      el.addEventListener('titlesize',function(ev){ev.stopPropagation();bump(key,ev.detail);API&&API.redraw()})
    });
    // com 1 foto a forma amarela nasce embaixo (arte do Agricultor); só acompanha se ainda estiver na posição inicial
    $('vcGrid').addEventListener('change',function(){
      var was=V.layout;V.layout=this.value;
      if(API)['feed','story'].forEach(function(f){var p=API.state.format[f];if(V.layout==='single'&&was!=='single'&&!p.overlayDy)p.overlayDy=SINGLE_SHIFT;else if(V.layout!=='single'&&was==='single'&&p.overlayDy===SINGLE_SHIFT)p.overlayDy=0});
      renderSlots();API&&API.redraw()
    });
    $('vcTextW').addEventListener('input',function(){V.textW=+this.value;$('vcTextWOut').value=this.value;API&&API.redraw()});
    $('vcWhiteW').addEventListener('input',function(){V.whiteW=+this.value;$('vcWhiteWOut').value=this.value;API&&API.redraw()});
    $('vcWhiteOn').addEventListener('change',function(){V.whiteOn=this.checked;$('vcWhiteBox').hidden=!this.checked;API&&API.redraw()});
    $('vcSide').addEventListener('change',function(){V.side=this.value;API&&API.redraw()});
    $('vcShape').addEventListener('click',function(){V.seed++;API&&API.redraw()});
    $('vcShapeRef').addEventListener('click',function(){V.seed=0;API&&API.redraw()});
    $('vcCopyFS').addEventListener('click',function(){API&&copyFraming('feed','story')});
    $('vcCopySF').addEventListener('click',function(){API&&copyFraming('story','feed')});
    function setLoz(v){V.loz=v/100;$('vcLoz').value=v;$('vcLozOut').value=v+'%';API&&API.redraw()}
    $('vcLoz').addEventListener('input',function(){setLoz(+this.value)});
    $('vcLozReset').addEventListener('click',function(){setLoz(100)});
    // soltar o arquivo direto na célula da foto (vários arquivos preenchem as células seguintes que estiverem vazias)
    ['feed','story'].forEach(function(format){
      var c=$(format+'Canvas'),wrap=c.parentNode;
      function mine(ev){return API&&API.state.editoriaName==='Datas comemorativas'&&ev.dataTransfer&&Array.prototype.indexOf.call(ev.dataTransfer.types||[],'Files')>=0}
      function cellOf(ev){var r=c.getBoundingClientRect();return cellAt(format,(ev.clientX-r.left)*c.width/r.width,(ev.clientY-r.top)*c.height/r.height)}
      ['dragenter','dragover'].forEach(function(t){wrap.addEventListener(t,function(ev){if(mine(ev)){ev.preventDefault();wrap.classList.add('is-dragging')}})});
      wrap.addEventListener('dragleave',function(){wrap.classList.remove('is-dragging')});
      wrap.addEventListener('drop',function(ev){
        wrap.classList.remove('is-dragging');if(!mine(ev))return;ev.preventDefault();
        var i=cellOf(ev);if(i<0)return;
        var files=Array.prototype.filter.call(ev.dataTransfer.files,function(f){return/^image\//.test(f.type)});
        files.forEach(function(file,n){var target=n===0?i:nextEmpty(i);if(target>=0)loadPhoto(target,file)})
      })
    })
  }
  bind();

  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  global.POST_EDITOR_CUSTOM_PRESETS['']=Object.assign({},global.POST_EDITOR_CUSTOM_PRESETS['']||{},{
    'Datas comemorativas':{
      footerColor:YELLOW,
      supportsCodes:false,
      supportsProductCutout:false,
      supportsBrandVariant:false,
      supportsCompositionSuggestions:false,
      supportsOverlayScale:false,
      hideCircleControls:true,
      skipProductChooser:true,
      commemorative:true,
      panel:true,
      noBackground:true,
      verticalOnly:true,
      moveHint:'Arraste cada foto para enquadrar (roda do mouse = zoom; clicar, segurar e arrastar muda a foto de posição) e as formas para subir ou descer; duplo clique em um texto para editar',
      setup:setup,
      pickTarget:pickTarget,
      onDrag:onDrag,
      onDragEnd:onDragEnd,
      wheel:wheel,
      dblclick:dblclick,
      renderer:renderer,
      serialize:serialize,
      restore:restore,
      test:{whiteText:whiteText,wrap:wrap,runs:runs,ink:ink,width:width,shapeFor:shapeFor,clampOff:clampOff,bump:bump}
    }
  });
})(window);
