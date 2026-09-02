(function(global){
  'use strict';
  var green='#005745', red='#f20d0d';
  function value(id,fallback){var el=document.getElementById(id);return el&&el.value.trim()?el.value.trim():(fallback||'')}
  function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function titleFont(ctx,size){ctx.font='700 italic '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif'}
  function wrap(ctx,text,width){var words=String(text||'PRODUTO').toUpperCase().split(/\s+/),out=[],line='';words.forEach(function(word){var test=(line+' '+word).trim();if(line&&ctx.measureText(test).width>width){out.push(line);line=word}else line=test});if(line)out.push(line);return out.slice(0,2)}
  function drawBrand(ctx,state,helpers,x,y,w,h){rounded(ctx,x,y,w,h,14);ctx.fillStyle='#fff';ctx.fill();if(state.customAssets.brandLogo)helpers.contain(ctx,state.customAssets.brandLogo,[x+18,y+16,w-36,h-32])}
  function drawPrice(ctx,t,isStory){var mode=value('ecommercePriceMode','por'),price=value('ecommercePrice','469,90'),old=value('ecommerceOldPrice'),discount=value('ecommerceDiscount','20% OFF'),cta=value('ecommerceCta','APROVEITE!'),x=isStory?635:608,y=isStory?1435:884,w=isStory?400:420,h=isStory?250:220;
    rounded(ctx,x,y,w,h,38);ctx.fillStyle=green;ctx.fill();
    rounded(ctx,x+70,y-28,w-140,58,25);ctx.fillStyle=red;ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 italic 30px "Arial Narrow",Arial,sans-serif';ctx.fillText(cta.toUpperCase(),x+w/2,y+2);
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#fff';
    if(mode==='de-por'&&old){ctx.font='italic 24px Arial,sans-serif';ctx.fillText('De: R$ '+old,x+36,y+37);var tw=ctx.measureText('De: R$ '+old).width;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+35,y+51);ctx.lineTo(x+38+tw,y+51);ctx.stroke()}
    if(mode==='desconto'){ctx.fillStyle='#fff';ctx.font='700 italic 24px Arial,sans-serif';ctx.fillText(discount.toUpperCase(),x+36,y+37)}
    var labelY=(mode==='por')?y+46:y+77;ctx.fillStyle='#fff';ctx.font='italic 26px Arial,sans-serif';ctx.fillText('Por:',x+36,labelY);
    ctx.font='700 76px "Arial Narrow",Arial,sans-serif';ctx.fillText('R$ '+price,x+30,labelY+24);ctx.font='italic 24px Arial,sans-serif';ctx.textAlign='right';ctx.fillText('à vista',x+w-34,y+h-34);
  }
  function renderer(api){var ctx=api.ctx,t=api.t,state=api.state,isStory=api.format==='story',name=api.productName||'NOME DO PRODUTO',code=value('productCode','0000000'),titleX=isStory?505:468,titleW=isStory?520:550,titleY=isStory?162:116;
    if(state.background)api.helpers.drawCover(ctx,state.background,t,api.format);else api.helpers.drawPlaceholder(ctx,t);
    var shade=ctx.createLinearGradient(0,0,t.w,t.h);shade.addColorStop(0,'rgba(0,0,0,.50)');shade.addColorStop(.55,'rgba(0,0,0,.08)');shade.addColorStop(1,'rgba(0,0,0,.34)');ctx.fillStyle=shade;ctx.fillRect(0,0,t.w,t.h);
    drawBrand(ctx,state,api.helpers,isStory?84:90,isStory?190:94,isStory?340:340,isStory?156:156);
    titleFont(ctx,58);var size=58,lines=wrap(ctx,name,titleW);while(size>24&&(lines.length>2||lines.some(function(l){return ctx.measureText(l).width>titleW}))){size-=2;titleFont(ctx,size);lines=wrap(ctx,name,titleW)}ctx.fillStyle='#fff';ctx.textAlign='right';ctx.textBaseline='top';lines.forEach(function(line,i){ctx.fillText(line,titleX+titleW,titleY+i*(size*1.05))});var ruleY=titleY+lines.length*(size*1.05)+15;ctx.fillRect(titleX,ruleY,titleW,3);
    rounded(ctx,isStory?785:788,ruleY+42,245,62,28);ctx.fillStyle=green;ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 italic 25px "Arial Narrow",Arial,sans-serif';ctx.fillText('Cód.: '+code,isStory?907:910,ruleY+73);
    if(state.productDrawable){ctx.save();ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=22;ctx.shadowOffsetY=12;api.helpers.contain(ctx,state.productDrawable,isStory?[46,620,710,690]:[42,430,620,560]);ctx.restore()}
    drawPrice(ctx,t,isStory);
    var footerH=isStory?170:160,footerY=t.h-footerH;ctx.fillStyle=green;ctx.fillRect(0,footerY,t.w,footerH);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='700 italic '+(isStory?45:38)+'px "Arial Narrow",Arial,sans-serif';ctx.fillText('FG.com.br',isStory?78:90,footerY+footerH/2);ctx.textAlign='right';ctx.font='18px Arial,sans-serif';var note=value('ecommerceValidity','Oferta exclusiva para o site! Válida enquanto durarem os estoques promocionais.');ctx.fillText(note,t.w-50,footerY+footerH/2);
  }
  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  var all=global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']||{};
  all['Post E-commerce']={footerColor:green,supportsBrandVariant:true,supportsCodes:true,supportsProductCutout:true,ecommerce:true,renderer:renderer};
  global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']=all;
})(window);