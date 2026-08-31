(function(global){
  'use strict';
  var ORANGE='#ED8B00', BLACK='#000000', WHITE='#FFFFFF';
  function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function sheetPath(ctx,x,y,side,r,fold){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+side,y,x+side,y+r,r);ctx.lineTo(x+side,y+side-fold);ctx.lineTo(x+side-fold,y+side);ctx.lineTo(x+r,y+side);ctx.arcTo(x,y+side,x,y+side-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath()}
  function titleFont(size,weight){return (weight||'700')+' italic '+size+'px "Swiss721Editor","Arial Narrow",Arial,sans-serif'}
  function formatMonth(value){var month=String(value||'').trim().toLocaleLowerCase('pt-BR');return month?month.charAt(0).toLocaleUpperCase('pt-BR')+month.slice(1):''}
  // fontBoundingBox (métrica da fonte) em vez de actualBoundingBox (do glifo desenhado): a
  // posição do baseline não pode depender de quais letras a string tem, senão um título com
  // descendente (q, p, j...) fica num baseline diferente do resto só por causa da letra.
  function centeredBaseline(ctx,value,centerY){var m=ctx.measureText(value),a=m.fontBoundingBoxAscent||m.actualBoundingBoxAscent||0,d=m.fontBoundingBoxDescent||m.actualBoundingBoxDescent||0;return centerY-(d-a)/2}
  function wrapTitle(ctx,value,firstWidth,nextWidth){var lines=[],first=true;String(value||'').trim().split(/\r?\n/).forEach(function(part){var words=part.trim().split(/\s+/),line='',limit=first?firstWidth:nextWidth;words.forEach(function(word){var test=(line+' '+word).trim();if(line&&ctx.measureText(test).width>limit){lines.push(line);line=word;limit=nextWidth;first=false}else line=test});if(line){lines.push(line);first=false}});return lines.length?lines:['']}
  function drawCalendar(ctx,day,month,x,y){
    var side=168,monthH=47,bodyH=side-monthH,r=14,fold=31;
    // Três cantos arredondados; o inferior direito fica reto para a dobra interna da folha.
    ctx.fillStyle=WHITE;sheetPath(ctx,x,y,side,r,fold);ctx.fill();
    ctx.fillStyle=ORANGE;ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+side,y,x+side,y+r,r);ctx.lineTo(x+side,y+monthH);ctx.lineTo(x,y+monthH);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();ctx.fill();
    // Só a aba escura interna permanece; a face clara inferior foi removida. 
    ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.moveTo(x+side-fold+2,y+side);ctx.lineTo(x+side,y+side-fold+2);ctx.lineTo(x+side-fold+2,y+side-fold+2);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+side-fold,y+side);ctx.lineTo(x+side-fold,y+side-fold);ctx.lineTo(x+side,y+side-fold);ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=WHITE;ctx.font='700 29px "Swiss721Editor","Arial Narrow",Arial,sans-serif';ctx.fillText(month,x+side/2,centeredBaseline(ctx,month,y+monthH/2));
    ctx.fillStyle=BLACK;ctx.font='900 94px Arial,sans-serif';ctx.fillText(day,x+side/2,centeredBaseline(ctx,day,y+monthH+bodyH/2));
  }
  function renderer(api){
    var ctx=api.ctx,t=api.t,state=api.state,isStory=api.format==='story';
    if(state.background)api.helpers.drawCover(ctx,state.background,t,api.format);else api.helpers.drawPlaceholder(ctx,t);
    var bannerY=isStory?255:82,bannerW=isStory?804:886,calendarY=isStory?207:54,calendarX=50,textX=252,maxTextW=bannerW-textX-34;
    var day=(document.getElementById('eventDay').value||'01').replace(/\D/g,'').slice(0,2)||'01',month=formatMonth(document.getElementById('eventMonth').value||'JANEIRO'),title=(api.productName||'NOME DA DATA').trim(),prefix=(document.getElementById('eventPrefix').value||'Dia do').trim();
    var baseTitle=isStory?47:51,basePrefix=isStory?42:46;ctx.font=titleFont(basePrefix,'400');var prefixBaseW=ctx.measureText(prefix).width;ctx.font=titleFont(baseTitle,'700');var titleBaseW=ctx.measureText(title).width;
    // Chamada e título encolhem juntos; abaixo de 72% preservamos a leitura e passamos a quebrar o título.
    var scale=Math.max(.72,Math.min(1,maxTextW/(prefixBaseW+9+titleBaseW))),titleSize=Math.round(baseTitle*scale),prefixSize=Math.round(basePrefix*scale);
    ctx.font=titleFont(prefixSize,'400');var prefixW=ctx.measureText(prefix).width,firstWidth=maxTextW-prefixW-9;ctx.font=titleFont(titleSize,'700');var lines=wrapTitle(ctx,title,firstWidth,maxTextW);
    var lineH=Math.round(titleSize*1.08),bannerH=Math.max(100,Math.round(48+lines.length*lineH));
    ctx.fillStyle=ORANGE;roundedRect(ctx,-28,bannerY,bannerW+28,bannerH,24);ctx.fill();drawCalendar(ctx,day,month,calendarX,calendarY);
    var firstCenter=bannerY+(bannerH-(lines.length*lineH))/2+lineH/2;
    // O baseline de cada linha é calculado uma única vez, sempre com a fonte do título (a maior
    // da linha), e reaproveitado pela chamada — nunca cada texto com o seu próprio "centro
    // visual": senão a chamada e o título (fontes/tamanhos diferentes) acabam em baselines
    // diferentes e a linha parece torta, principalmente quando só um dos dois tem descendente.
    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font=titleFont(titleSize,'700');
    var lineBaselines=lines.map(function(line,index){ return centeredBaseline(ctx,line,firstCenter+index*lineH) });
    ctx.fillStyle=BLACK;ctx.font=titleFont(prefixSize,'400');ctx.fillText(prefix,textX,lineBaselines[0]);
    ctx.fillStyle=WHITE;ctx.font=titleFont(titleSize,'700');lines.forEach(function(line,index){var x=index===0?textX+prefixW+9:textX;ctx.fillText(line,x,lineBaselines[index])});
    var footerY=isStory?1544:1245,footerH=t.h-footerY;ctx.fillStyle=ORANGE;ctx.fillRect(0,footerY,t.w,footerH);
    var logo=(global.OVD_BRAND_LOGOS||{}).Osten_fundo_laranja;if(logo){if(!state.customAssets.ostenLogo){var im=new Image();im.onload=function(){state.customAssets.ostenLogo=im;global.PostEditor&&global.PostEditor.redraw()};im.src=logo}else api.helpers.contain(ctx,state.customAssets.ostenLogo,isStory?[214,1584,655,190]:[710,1261,300,70])}
  }
  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  global.POST_EDITOR_CUSTOM_PRESETS['__osten-ferragens']=Object.assign({},global.POST_EDITOR_CUSTOM_PRESETS['__osten-ferragens']||{}, {'Datas comemorativas':{footerColor:ORANGE,supportsCodes:false,supportsProductCutout:false,skipProductChooser:true,commemorative:true,renderer:renderer}});
})(window);