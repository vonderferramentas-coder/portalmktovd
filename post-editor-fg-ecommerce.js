(function(global){
  'use strict';
  var green='#005745', red='#f20d0d';
  // Feed e Story têm a mesma largura (1080px), então compartilham a mesma grade horizontal: a marca e a
  // logo FG saem da mesma margem esquerda, e título, régua, código, caixa de preço e texto legal fecham
  // na mesma margem direita. Só o eixo vertical muda entre os formatos — assim as duas artes batem.
  var LEFT=90,RIGHT=1001,BRAND_W=340,BRAND_H=156,TITLE_X=468,TITLE_GAP=16,TITLE_INK=.74;
  function value(id,fallback){var el=document.getElementById(id);return el&&el.value.trim()?el.value.trim():(fallback||'')}
  // Curva desenhada explicitamente: evita que o arcTo herde um caminho anterior e gere pontas triangulares.
  // r aceita um número (todos os cantos iguais) ou [sup-esq, sup-dir, inf-dir, inf-esq].
  function rounded(ctx,x,y,w,h,r){var c=typeof r==='number'?[r,r,r,r]:r,m=Math.min(w/2,h/2),tl=Math.min(c[0],m),tr=Math.min(c[1],m),br=Math.min(c[2],m),bl=Math.min(c[3],m);ctx.beginPath();ctx.moveTo(x+tl,y);ctx.lineTo(x+w-tr,y);ctx.quadraticCurveTo(x+w,y,x+w,y+tr);ctx.lineTo(x+w,y+h-br);ctx.quadraticCurveTo(x+w,y+h,x+w-br,y+h);ctx.lineTo(x+bl,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-bl);ctx.lineTo(x,y+tl);ctx.quadraticCurveTo(x,y,x+tl,y);ctx.closePath()}
  function titleFont(ctx,size){ctx.font='700 italic '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif'}
  // Quebra automática por largura, mas respeitando o Enter digitado no nome: cada trecho separado por
  // \n começa numa linha nova, e só o excedente dele é que quebra sozinho.
  function wrap(ctx,text,width){var out=[];String(text||'PRODUTO').toUpperCase().split(/\r?\n/).forEach(function(part){var line='';part.trim().split(/\s+/).forEach(function(word){if(!word)return;var test=(line+' '+word).trim();if(line&&ctx.measureText(test).width>width){out.push(line);line=word}else line=test});if(line)out.push(line)});return out.length?out:['']}
  // O canto superior direito é bem mais arredondado que os outros três — mesma assinatura do logo da
  // FG (medido no PNG: ~11px de raio nesse canto contra ~3px nos demais, numa arte de 100px).
  function drawBrand(ctx,state,helpers,x,y,w,h){rounded(ctx,x,y,w,h,[10,44,10,10]);ctx.fillStyle='#fff';ctx.fill();if(state.customAssets.brandLogo)helpers.contain(ctx,state.customAssets.brandLogo,[x+18,y+16,w-36,h-32])}
  // O bloco "R$ + valor" manda na caixa: define a largura dela (some a sobra quando o preço é curto),
  // fica centralizado, e as outras linhas se penduram nele — "De"/"Por:" pela esquerda do bloco e
  // "à vista" pela direita. Os offsets verticais saem da altura real de desenho (ink) das Korolev:
  // "De" ocupa 21px a partir de -1, "Por:" 19px a partir de +1, o valor 64px a partir de +2 e
  // "à vista" 19px a partir de -1 — por isso o mesmo GAP acima e abaixo do valor vira o mesmo respiro.
  // A altura também sai do conteúdo: BANNER_ZONE é a parte da tarja que invade a caixa e MARGIN é o
  // respiro que sobra acima da primeira linha e abaixo da última. A caixa cresce pra cima (a base fica
  // ancorada em BASE_Y), então a distância pro rodapé não muda quando o preço ganha ou perde a linha "De".
  var INK={old:[-1,21],label:[1,19],price:[2,64],vista:[-1,19]},GAP=10,OLD_GAP=6,BANNER_ZONE=28,MARGIN=15;
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
  function drawPrice(ctx,t,isStory,api){var mode=value('ecommercePriceMode','por'),price=value('ecommercePrice','469,90'),old=value('ecommerceOldPrice'),discount=value('ecommerceDiscount','20% OFF'),cta=value('ecommerceCta','APROVEITE!'),priceRight=RIGHT,hasOld=mode==='de-por'&&!!old;
    ctx.font='700 76px "Korolev Bold","Arial Narrow",Arial,sans-serif';var priceWidth=ctx.measureText(price).width;ctx.font='700 38px "Korolev Bold","Arial Narrow",Arial,sans-serif';var currencyWidth=ctx.measureText('R$').width;
    var block=currencyWidth+10+priceWidth,w=Math.max(270,Math.min(500,Math.ceil(block+64))),bannerText=(mode==='desconto'?discount:cta).toUpperCase(),
        groupH=(hasOld?INK.old[1]+OLD_GAP:0)+INK.label[1]+GAP+INK.price[1]+GAP+INK.vista[1],h=BANNER_ZONE+MARGIN*2+groupH,
        baseX=priceRight-w,baseY=(isStory?1621:1106)-h,move=(api&&api.state.format[api.format])||{},
        x=baseX+clamp(move.overlayDx||0,-baseX,t.w-baseX-w),y=baseY+clamp(move.overlayDy||0,22-baseY,t.h-baseY-h),
        blockX=Math.round(x+(w-block)/2),inkTop=y+BANNER_ZONE+MARGIN,
        oldY=inkTop-INK.old[0],labelInkTop=hasOld?inkTop+INK.old[1]+OLD_GAP:inkTop,labelY=labelInkTop-INK.label[0],priceY=labelInkTop+INK.label[1]+GAP-INK.price[0],vistaY=priceY+INK.price[0]+INK.price[1]+GAP-INK.vista[0];
    if(api&&api.helpers.setMoveBox)api.helpers.setMoveBox([x,y-22,w,h+22]);
    // Sombra só no preenchimento da caixa (save/restore antes da tarja e dos textos, senão ela suja o
    // vermelho e as letras) — serve pra descolar o verde da foto, sem virar um card flutuando.
    ctx.save();ctx.shadowColor='rgba(0,0,0,.30)';ctx.shadowBlur=26;ctx.shadowOffsetY=9;rounded(ctx,x,y,w,h,38);ctx.fillStyle=green;ctx.fill();ctx.restore();
    ctx.font='700 27px "Korolev Offer","Arial Narrow",Arial,sans-serif';var bannerW=Math.max(120,Math.min(w-96,Math.ceil(ctx.measureText(bannerText).width+56))),bannerX=x+w-bannerW-48;
    rounded(ctx,bannerX,y-22,bannerW,50,22);ctx.fillStyle=red;ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(bannerText,bannerX+bannerW/2,y+3);
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#fff';
    if(hasOld){var oldLabel='De: R$ '+old;ctx.font='500 24px "Korolev Medium","Arial Narrow",Arial,sans-serif';ctx.fillText(oldLabel,blockX,oldY);var tw=ctx.measureText(oldLabel).width,strikeY=inkTop+Math.round(INK.old[1]/2);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(blockX,strikeY);ctx.lineTo(blockX+tw,strikeY);ctx.stroke()}
    ctx.fillStyle='#fff';ctx.font='500 26px "Korolev Medium","Arial Narrow",Arial,sans-serif';ctx.fillText('Por:',blockX,labelY);
    ctx.font='700 38px "Korolev Bold","Arial Narrow",Arial,sans-serif';ctx.fillText('R$',blockX,priceY+31);ctx.font='700 76px "Korolev Bold","Arial Narrow",Arial,sans-serif';ctx.fillText(price,blockX+currencyWidth+10,priceY);
    ctx.font='300 24px "Korolev Light","Arial Narrow",Arial,sans-serif';ctx.textAlign='right';ctx.fillText('à vista',blockX+block,vistaY);
  }
  // Altura de desenho do bloco: do topo da primeira linha até a base da última.
  function blockH(n,size){return(n-1)*size*1.05+size*TITLE_INK}
  // Reduz o corpo até o nome caber em no máximo 3 linhas E dentro de maxH (a folga entre o topo da
  // caixa da marca e a régua). Como o texto é montado de baixo pra cima, esse teto de altura faz o
  // nome comprido crescer até encostar no topo da logo em vez de encolher pra caber em 2 linhas.
  function fitTitle(ctx,text,width,maxH,maxLines){var size=58,lines;titleFont(ctx,size);lines=wrap(ctx,text,width);
    while(size>24&&(lines.length>maxLines||blockH(lines.length,size)>maxH||lines.some(function(l){return ctx.measureText(l).width>width}))){size-=2;titleFont(ctx,size);lines=wrap(ctx,text,width)}
    return{size:size,lines:lines}}
  function codeFont(ctx,size){ctx.font='500 '+size+'px "Korolev Medium","Arial Narrow",Arial,sans-serif'}
  function drawCodeBox(ctx,x,y,w,text,size){rounded(ctx,x,y,w,62,28);ctx.fillStyle=green;ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';codeFont(ctx,size);ctx.fillText(text,x+w/2,y+32)}
  function renderer(api){var ctx=api.ctx,t=api.t,state=api.state,isStory=api.format==='story',name=api.productName||'NOME DO PRODUTO',codes=[value('productCode','0000000'),value('productCode2','0000000')],dual=(document.getElementById('codeCount')||{}).value==='2';
    if(state.background)api.helpers.drawCover(ctx,state.background,t,api.format);else api.helpers.drawPlaceholder(ctx,t);
    var shadeH=isStory?420:300,shade=ctx.createLinearGradient(0,0,0,shadeH);shade.addColorStop(0,'rgba(0,0,0,.70)');shade.addColorStop(.6,'rgba(0,0,0,.55)');shade.addColorStop(.85,'rgba(0,0,0,.25)');shade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shade;ctx.fillRect(0,0,t.w,shadeH);
    var brandY=isStory?190:94,titleW=RIGHT-TITLE_X;
    drawBrand(ctx,state,api.helpers,LEFT,brandY,BRAND_W,BRAND_H);
    // Primeiro tenta respeitando os Enters; só se nem no menor corpo couber é que ignora as quebras
    // manuais e deixa o nome fluir sozinho.
    // Duas linhas é o padrão; a terceira só entra quando em duas a fonte teria que ficar pequena demais
    // (nome muito comprido) — aí ela usa a altura que sobra e o texto encosta no topo da caixa da marca.
    var titleMaxH=BRAND_H-3-TITLE_GAP,fit=fitTitle(ctx,name,titleW,titleMaxH,2);
    if(fit.size<40)fit=fitTitle(ctx,name,titleW,titleMaxH,3);
    if(fit.lines.length>3)fit=fitTitle(ctx,String(name).replace(/\s+/g,' '),titleW,titleMaxH,3);
    var size=fit.size,lines=fit.lines.slice(0,3);titleFont(ctx,size);
    // A régua fecha o cabeçalho pela base do quadrado branco da marca, e o título é montado de baixo
    // pra cima a partir dela: nome curto, longo ou com a fonte reduzida sempre encosta na régua, sem
    // sobra embaixo. TITLE_INK (0.74 do corpo) é a altura real de desenho da Swiss721, medida na fonte.
    var ruleY=brandY+BRAND_H-3,lineH=size*1.05,lastTop=ruleY-TITLE_GAP-size*TITLE_INK,firstTop=lastTop-(lines.length-1)*lineH;
    ctx.fillStyle='#fff';ctx.textAlign='right';ctx.textBaseline='top';lines.forEach(function(line,i){ctx.fillText(line,RIGHT,firstTop+i*lineH)});
    ctx.fillRect(TITLE_X,ruleY,titleW,3);
    // Com 2 códigos a pastilha também mostra a variação (110 V~ / 220 V~) que o formulário já pedia; as
    // duas dividem a largura da régua e usam o mesmo corpo de texto, reduzido até caber na mais cheia.
    var codeY=ruleY+42,codeW=dual?256:245,
        codeTexts=dual?['Cód. '+value('codeVariant1','110 V~')+': '+codes[0],'Cód. '+value('codeVariant2','220 V~')+': '+codes[1]]:['Cód.: '+codes[0]],
        codeSize=22;
    codeFont(ctx,codeSize);while(codeSize>13&&codeTexts.some(function(txt){return ctx.measureText(txt).width>codeW-32})){codeSize--;codeFont(ctx,codeSize)}
    if(dual){drawCodeBox(ctx,RIGHT-codeW*2-21,codeY,codeW,codeTexts[0],codeSize);drawCodeBox(ctx,RIGHT-codeW,codeY,codeW,codeTexts[1],codeSize)}
    else drawCodeBox(ctx,RIGHT-codeW,codeY,codeW,codeTexts[0],codeSize);
    if(state.productDrawable){ctx.save();ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=22;ctx.shadowOffsetY=12;api.helpers.contain(ctx,state.productDrawable,isStory?[46,620,710,690]:[42,430,620,560]);ctx.restore()}
    drawPrice(ctx,t,isStory,api);
    // A caixa do logo FG usa a proporção exata do PNG (100x145) pra que o contain não centralize nada
    // e a borda esquerda caia exatamente em LEFT — a mesma da caixa branca da marca lá em cima.
    var footerY=isStory?1701:1126,footerH=t.h-footerY;ctx.fillStyle=green;ctx.fillRect(0,footerY,t.w,footerH);
    if(state.customAssets.fgLogo)api.helpers.contain(ctx,state.customAssets.fgLogo,[LEFT,footerY-82,98,142]);
    ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='top';ctx.font='700 italic 38px "Swiss721Editor","Arial Narrow",Arial,sans-serif';ctx.fillText('.com.br',LEFT+106,footerY+12);
    ctx.textAlign='right';ctx.font='400 18px "Swiss721Editor","Arial Narrow",Arial,sans-serif';var date=value('ecommerceValidity'),parts=date?date.split('-'):null,until=parts?parts[2]+'/'+parts[1]+'/'+parts[0]:'--/--/----',legalY=footerY+24;ctx.fillText('Oferta exclusiva para o site! Válida até '+until,RIGHT,legalY);ctx.fillText('ou enquanto durarem os estoques promocionais.',RIGHT,legalY+24);
  }
  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  var all=global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']||{};
  all['Post E-commerce']={footerColor:green,supportsBrandVariant:true,supportsCodes:true,supportsProductCutout:false,supportsCompositionSuggestions:false,supportsBrandBadgeColor:false,supportsOverlayScale:false,ecommerce:true,assetSources:{fgLogo:'post-editor-assets/fg-ecommerce/fg-logo.png'},renderer:renderer};
  global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']=all;
})(window);