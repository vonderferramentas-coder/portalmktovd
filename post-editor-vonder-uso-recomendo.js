// Editoria "Uso e Recomendo VONDER" (marca VONDER): foto de uso a sangrar, faixa preta com a hashtag e faixa amarela com o produto e o código.
// Medidas tiradas das artes de referência (X:\temporario\Lucas\Uso E Recomendo VONDER): faixas coladas na borda esquerda, a amarela com o canto
// inferior arredondado e crescendo com o número de linhas do texto. Aqui as faixas também podem partir da borda direita (espelhadas) e andar na vertical.
(function(global){
  'use strict';
  // SPACING: a fonte da arte de referência é um pouco mais condensada que a Swiss 721 do editor; o espaçamento negativo aproxima a largura das linhas
  var YELLOW='#F6BE00',SIZE=36,SPACING=-1.2,PITCH=40,BASELINE1=65,PAD_BOTTOM=40,RADIUS=45,TAG_W=727,TAG_X=53,TAG_BASELINE=91;
  var GEO={
    feed:{blackTop:831,blackW:837,blackH:132,yellowW:540,textX:61,textW:422},
    story:{blackTop:1148,blackW:837,blackH:132,yellowW:550,textX:72,textW:422}
  };

  // quebra o texto (letras com estilo, '\n' = quebra forçada) em linhas de no máximo maxW
  function wrap(ctx,chars,maxW,rich){
    var lines=[],cur=[],curW=0,word=[];
    function width(list){return list.length?rich.width(ctx,rich.runs(list),SIZE):0}
    function flush(){
      if(!word.length)return;var w=width(word),sp=cur.length?width([{c:' ',b:word[0].b,i:word[0].i,u:false}]):0;
      if(cur.length&&curW+sp+w>maxW){lines.push(cur);cur=[];curW=0;sp=0}
      if(sp)cur.push({c:' ',b:word[0].b,i:word[0].i,u:false});cur=cur.concat(word);curW+=sp+w;word=[]
    }
    chars.forEach(function(ch){
      if(ch.c==='\n'){flush();lines.push(cur);cur=[];curW=0}
      else if(/\s/.test(ch.c))flush();
      else word.push(ch)
    });
    flush();if(cur.length||!lines.length)lines.push(cur);return lines
  }

  function drawLine(ctx,rich,chars,x,y){
    rich.runs(chars).forEach(function(r){
      ctx.font=rich.font(r,SIZE);var w=ctx.measureText(r.t).width;ctx.fillText(r.t,x,y);
      if(r.u)ctx.fillRect(x,y+SIZE*.14,w,Math.max(2,SIZE/16));x+=w
    })
  }

  // "#UsoeRecomendoVONDER": negrito+itálico condensado, com o "e" e o VONDER em amarelo; o espaçamento é ajustado pra fechar na largura da arte de referência
  function drawHashtag(ctx,x,y){
    var parts=[['#Uso','#fff'],['e',YELLOW],['Recomendo','#fff'],['VONDER',YELLOW]],all=parts.map(function(p){return p[0]}).join('');
    ctx.save();ctx.font='700 italic 78px "Swiss721Editor","Arial Narrow",Impact,sans-serif';
    if('letterSpacing' in ctx){ctx.letterSpacing='0px';var natural=ctx.measureText(all).width;ctx.letterSpacing=((TAG_W-natural)/(all.length-1))+'px'}
    parts.forEach(function(p){ctx.fillStyle=p[1];ctx.fillText(p[0],x,y);x+=ctx.measureText(p[0]).width});ctx.restore()
  }

  function renderer(api){
    var ctx=api.ctx,t=api.t,st=api.state,f=api.format,g=GEO[f],pos=st.format[f],right=st.ov[f].layout==='right',h=api.helpers;
    if(st.background)h.drawCover(ctx,st.background,t,f);else h.drawPlaceholder(ctx,t);
    if('letterSpacing' in ctx)ctx.letterSpacing=SPACING+'px';
    var lines=wrap(ctx,h.rich.chars(),g.textW,h.rich),n=lines.length,yellowH=BASELINE1+(n-1)*PITCH+PAD_BOTTOM,total=g.blackH+yellowH;
    // o arraste só desloca na vertical; o limite da arte volta pro deslocamento guardado, senão arrastar além da borda "acumularia" movimento
    var y=Math.round(Math.max(0,Math.min(t.h-total,g.blackTop+pos.overlayDy)));pos.overlayDy=y-g.blackTop;
    var bx=right?t.w-g.blackW:0,yx=right?t.w-g.yellowW:0,yTop=y+g.blackH,yBot=yTop+yellowH;
    ctx.fillStyle='#000';ctx.fillRect(bx,y,g.blackW,g.blackH);
    // faixa amarela: cantos de cima retos, o de baixo do lado de dentro arredondado
    var inner=right?yx:yx+g.yellowW,outer=right?yx+g.yellowW:yx;
    ctx.fillStyle=YELLOW;ctx.beginPath();ctx.moveTo(outer,yTop);ctx.lineTo(inner,yTop);ctx.lineTo(inner,yBot-RADIUS);ctx.arcTo(inner,yBot,right?inner+RADIUS:inner-RADIUS,yBot,RADIUS);ctx.lineTo(outer,yBot);ctx.closePath();ctx.fill();
    ctx.textBaseline='alphabetic';ctx.textAlign='left';drawHashtag(ctx,bx+TAG_X,y+TAG_BASELINE);
    ctx.fillStyle='#050505';
    if(st.usoEditing!==f)lines.forEach(function(line,k){drawLine(ctx,h.rich,line,yx+g.textX,yTop+BASELINE1+k*PITCH)});
    if('letterSpacing' in ctx)ctx.letterSpacing='0px';
    // a caixa de edição por duplo clique (post-editor.js) se posiciona por aqui
    t.uso={yx:yx,yTop:yTop,yw:g.yellowW,yh:yellowH,textX:g.textX,textW:g.textW,size:SIZE,spacing:SPACING,pitch:PITCH,baseline1:BASELINE1};
    h.setMoveBox([bx,y,g.blackW,total])
  }

  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  global.POST_EDITOR_CUSTOM_PRESETS['']=Object.assign({},global.POST_EDITOR_CUSTOM_PRESETS['']||{},{
    'Uso e Recomendo VONDER':{
      footerColor:YELLOW,
      supportsCodes:false,
      supportsProductCutout:false,
      supportsBrandVariant:false,
      supportsCompositionSuggestions:false,
      supportsOverlayScale:false,
      hideCircleControls:true,
      layoutOptions:[['left','Faixas partindo da esquerda'],['right','Faixas partindo da direita']],
      moveLabel:'Mover faixas',
      moveHint:'Arraste as faixas para cima ou para baixo e o fundo para enquadrar; duplo clique no texto amarelo para editar',
      nameLabel:'Texto da faixa amarela',
      renderer:renderer
    }
  });
})(window);
