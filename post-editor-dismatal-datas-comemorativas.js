(function(global){
  'use strict';
  // Clone independente do preset de Datas comemorativas da Osten Ferragens (ver
  // post-editor-osten-datas-comemorativas.js) — nenhuma função, cor ou asset é compartilhado
  // entre os dois: o layout de cada marca muda sem afetar a outra. Faixa/calendário laranja
  // viram amarelo (#FFED1C) e o texto que era branco vira preto, para manter contraste.
  var YELLOW='#FFED1C', BLACK='#000000', WHITE='#FFFFFF', CAL_SIDE=168, CAL_SHADOW=10;
  function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function titleFont(size,weight){return (weight||'700')+' italic '+size+'px "Swiss721Editor","Arial Narrow",Arial,sans-serif'}
  function formatMonth(value){var month=String(value||'').trim().toLocaleLowerCase('pt-BR');return month?month.charAt(0).toLocaleUpperCase('pt-BR')+month.slice(1):''}
  // fontBoundingBox (métrica da fonte) em vez de actualBoundingBox (do glifo desenhado): a
  // posição do baseline não pode depender de quais letras a string tem, senão "Moniq" (com
  // descendente no q) fica num baseline diferente de "Cliente" só por causa da letra.
  function centeredBaseline(ctx,value,centerY){var m=ctx.measureText(value),a=m.fontBoundingBoxAscent||m.actualBoundingBoxAscent||0,d=m.fontBoundingBoxDescent||m.actualBoundingBoxDescent||0;return centerY-(d-a)/2}
  function wrapTitle(ctx,value,firstWidth,nextWidth){var lines=[],first=true;String(value||'').trim().split(/\r?\n/).forEach(function(part){var words=part.trim().split(/\s+/),line='',limit=first?firstWidth:nextWidth;words.forEach(function(word){var test=(line+' '+word).trim();if(line&&ctx.measureText(test).width>limit){lines.push(line);line=word;limit=nextWidth;first=false}else line=test});if(line){lines.push(line);first=false}});return lines.length?lines:['']}
  function drawCalendar(ctx,day,month,x,y){
    var side=CAL_SIDE,monthH=51,bodyH=side-monthH,r=20;
    // Bloco amarelo cheio, deslocado embaixo/à direita do calendário branco — sombra "dura"
    // (sem blur), técnica de pop art / flat design que simula profundidade em vez de um
    // drop-shadow tradicional. Cantos 100% arredondados e iguais, sem dobra de página.
    ctx.fillStyle=YELLOW;roundedRect(ctx,x+CAL_SHADOW,y+CAL_SHADOW,side,side,r);ctx.fill();
    ctx.fillStyle=WHITE;roundedRect(ctx,x,y,side,side,r);ctx.fill();
    ctx.fillStyle=YELLOW;ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+side,y,x+side,y+r,r);ctx.lineTo(x+side,y+monthH);ctx.lineTo(x,y+monthH);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();ctx.fill();
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=BLACK;ctx.font='700 29px "Swiss721Editor","Arial Narrow",Arial,sans-serif';ctx.fillText(month,x+side/2,centeredBaseline(ctx,month,y+monthH/2));
    ctx.fillStyle=BLACK;ctx.font='900 94px Arial,sans-serif';ctx.fillText(day,x+side/2,centeredBaseline(ctx,day,y+monthH+bodyH/2));
  }
  function renderer(api){
    var ctx=api.ctx,t=api.t,state=api.state,isStory=api.format==='story';
    if(state.background)api.helpers.drawCover(ctx,state.background,t,api.format);else api.helpers.drawPlaceholder(ctx,t);
    // Diferente da Osten (calendário embutido na faixa, que sangra pela esquerda), aqui o
    // calendário é um cartão solto e a faixa é outra peça independente que nasce depois dele
    // (com um vão entre as duas) e sangra pela direita — nunca por baixo do calendário.
    var calendarY=isStory?207:54,calendarX=50,bannerGap=26,bannerStartX=calendarX+CAL_SIDE+CAL_SHADOW+bannerGap,textX=bannerStartX+34,rightMargin=isStory?150:110,maxTextW=t.w-rightMargin-textX;
    var day=(document.getElementById('eventDay').value||'01').replace(/\D/g,'').slice(0,2)||'01',month=formatMonth(document.getElementById('eventMonth').value||'JANEIRO'),title=(api.productName||'NOME DA DATA').trim(),prefix=(document.getElementById('eventPrefix').value||'Dia do').trim();
    var baseTitle=isStory?47:51,basePrefix=isStory?42:46;ctx.font=titleFont(basePrefix,'400');var prefixBaseW=ctx.measureText(prefix).width;ctx.font=titleFont(baseTitle,'700');var titleBaseW=ctx.measureText(title).width;
    // Chamada e título encolhem juntos; abaixo de 72% preservamos a leitura e passamos a quebrar o título.
    var scale=Math.max(.72,Math.min(1,maxTextW/(prefixBaseW+9+titleBaseW))),titleSize=Math.round(baseTitle*scale),prefixSize=Math.round(basePrefix*scale);
    ctx.font=titleFont(prefixSize,'400');var prefixW=ctx.measureText(prefix).width,firstWidth=maxTextW-prefixW-9;ctx.font=titleFont(titleSize,'700');var lines=wrapTitle(ctx,title,firstWidth,maxTextW);
    var lineH=Math.round(titleSize*1.08),bannerH=Math.max(100,Math.round(48+lines.length*lineH));
    // A faixa é centralizada verticalmente no bloco do calendário (cartão branco + sombra
    // amarela deslocada abaixo dele) — não numa posição fixa — porque a altura da faixa muda
    // conforme o título quebra em 1 ou mais linhas.
    var bannerY=calendarY+(CAL_SIDE+CAL_SHADOW)/2-bannerH/2;
    ctx.fillStyle=YELLOW;roundedRect(ctx,bannerStartX,bannerY,t.w+60-bannerStartX,bannerH,24);ctx.fill();drawCalendar(ctx,day,month,calendarX,calendarY);
    var firstCenter=bannerY+(bannerH-(lines.length*lineH))/2+lineH/2;
    // O baseline de cada linha é calculado uma única vez, sempre com a fonte do título (a maior
    // da linha), e reaproveitado pela chamada — nunca cada texto com o seu próprio "centro
    // visual": senão a chamada e o título (fontes/tamanhos diferentes) acabam em baselines
    // diferentes e a linha parece torta, principalmente quando só um dos dois tem descendente.
    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font=titleFont(titleSize,'700');
    var lineBaselines=lines.map(function(line,index){ return centeredBaseline(ctx,line,firstCenter+index*lineH) });
    ctx.fillStyle=BLACK;ctx.font=titleFont(prefixSize,'400');ctx.fillText(prefix,textX,lineBaselines[0]);
    ctx.fillStyle=BLACK;ctx.font=titleFont(titleSize,'700');lines.forEach(function(line,index){var x=index===0?textX+prefixW+9:textX;ctx.fillText(line,x,lineBaselines[index])});
    var footerY=isStory?1544:1245,footerH=t.h-footerY;ctx.fillStyle=YELLOW;ctx.fillRect(0,footerY,t.w,footerH);
    var logo=(global.OVD_BRAND_LOGOS||{}).Dismatal;if(logo){if(!state.customAssets.dismatalLogo){var im=new Image();im.onload=function(){state.customAssets.dismatalLogo=im;global.PostEditor&&global.PostEditor.redraw()};im.src=logo}else api.helpers.contain(ctx,state.customAssets.dismatalLogo,isStory?[214,1584,655,190]:[710,1261,300,70])}
  }
  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  global.POST_EDITOR_CUSTOM_PRESETS['__dismatal']=Object.assign({},global.POST_EDITOR_CUSTOM_PRESETS['__dismatal']||{}, {'Datas comemorativas':{footerColor:YELLOW,supportsCodes:false,supportsProductCutout:false,skipProductChooser:true,commemorative:true,renderer:renderer}});
})(window);
