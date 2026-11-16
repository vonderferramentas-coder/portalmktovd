(function(global){
  'use strict';
  // Destaques da FERRAMENTAS GERAIS. Mesma montagem da Lançamentos (post-editor-fg-lancamentos.js): foto de fundo, quadrado da
  // marca no canto, título à direita sobre uma régua branca e rodapé verde; muda o selo ("DESTAQUES") e o título, que tem
  // duas linhas (nome em negrito itálico e complemento em itálico regular) e traz o "Cód.:" logo abaixo da régua.
  // Medidas tiradas dos PSDs de downloads/Destaques (Feed 1080x1350; Story 1080x1920, que no PSD fica em x=1202):
  // título Swiss721 BoldCondensedItalic 55 px + ItalicCondensed 42 px, entrelinha 47, tracking -20; código 33 px.
  var GREEN='#005b44',RIGHT=1001,RULE_X=281,RULE_W=750,TITLE_MAX_W=RIGHT-RULE_X,SIZE_MAIN=55,SIZE_SUB=42,LEAD=47;
  var FONT='"Swiss721Editor","Arial Narrow",Impact,sans-serif';
  function font(weight,size){return weight+' italic '+size+'px '+FONT}
  function spacing(ctx,size){if('letterSpacing' in ctx)ctx.letterSpacing=(size*-.02)+'px'}
  // logo da marca encostada na base do quadrado (como no PSD) e centralizada na largura; nunca estica
  function drawBrandLogo(ctx,img,x,y,w,h){
    var s=Math.min(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;
    ctx.drawImage(img,x+(w-dw)/2,y+h-dh,dw,dh)
  }
  // quebra o texto em até maxLines linhas que caibam em maxW; devolve null se não couber
  function wrap(ctx,text,maxW,maxLines){
    var words=text.split(' '),lines=[],line='';
    for(var i=0;i<words.length;i++){
      var test=line?line+' '+words[i]:words[i];
      if(line&&ctx.measureText(test).width>maxW){lines.push(line);line=words[i]}else line=test
    }
    if(line)lines.push(line);
    return lines.length<=maxLines&&lines.every(function(l){return ctx.measureText(l).width<=maxW})?lines:null
  }
  // Nome em negrito + complemento regular. Reduz os dois corpos juntos até caber na régua; o complemento pode ocupar 2 linhas.
  function layoutTitle(ctx,name){
    var parts=typeof splitName==='function'?splitName(name):{title:String(name||''),sub:''};
    var main=String(parts.title||'PRODUTO').replace(/\s+/g,' ').trim().toUpperCase(),sub=String(parts.sub||'').replace(/\s+/g,' ').trim().toUpperCase();
    for(var scale=1;scale>=.5;scale-=.04){
      var sm=SIZE_MAIN*scale,ss=SIZE_SUB*scale;
      ctx.font=font(700,sm);spacing(ctx,sm);
      if(ctx.measureText(main).width>TITLE_MAX_W)continue;
      var subLines=[];
      if(sub){ctx.font=font(400,ss);spacing(ctx,ss);subLines=wrap(ctx,sub,TITLE_MAX_W,scale>.8?1:2);if(!subLines)continue}
      return{main:main,sub:subLines,sm:sm,ss:ss,lead:LEAD*scale}
    }
    ctx.font=font(700,SIZE_MAIN*.5);spacing(ctx,SIZE_MAIN*.5);
    return{main:main,sub:[],sm:SIZE_MAIN*.5,ss:SIZE_SUB*.5,lead:LEAD*.5}
  }
  function codeText(){
    var one=document.getElementById('productCode'),two=document.getElementById('productCode2'),count=document.getElementById('codeCount');
    var a=one&&one.value.trim(),b=two&&two.value.trim();
    if(!a)return'';
    return'Cód.: '+(count&&count.value==='2'&&b?a+' / '+b:a)
  }
  function renderer(api){
    var ctx=api.ctx,t=api.t,state=api.state,assets=state.customAssets,isStory=api.format==='story';
    // medidas por formato (Story = Feed deslocado pelas alturas maiores do cabeçalho e do rodapé)
    var m=isStory
      ?{footerY:1456,headerY:-7,brandY:-31,brandH:392,logoBox:[66,210,191,140],base:291.8,ruleY:358,codeBase:405.2,shadowY:1373,seloY:1419,seloX:55}
      :{footerY:1249,headerY:-157,brandY:-1,brandH:182,logoBox:[66,30,191,140],base:111.8,ruleY:178,codeBase:225.2,shadowY:1173,seloY:1212,seloX:52};
    ctx.fillStyle='#252a29';ctx.fillRect(0,0,t.w,t.h);
    if(state.background)api.helpers.drawCover(ctx,state.background,t,api.format,m.footerY);else api.helpers.drawPlaceholder(ctx,t);

    if(assets.header)ctx.drawImage(assets.header,-50,m.headerY,1192,476);
    ctx.fillStyle=state.brandBadgeColor||'#f6be00';ctx.fillRect(51,m.brandY,222,m.brandH);
    if(assets.brandLogo)drawBrandLogo(ctx,assets.brandLogo,m.logoBox[0],m.logoBox[1],m.logoBox[2],m.logoBox[3]);

    // título ancorado na régua: a última linha sempre fica na mesma altura e o resto cresce para cima
    var title=layoutTitle(ctx,api.productName);
    ctx.fillStyle='#fff';ctx.textAlign='right';ctx.textBaseline='alphabetic';
    var lines=[{text:title.main,weight:700,size:title.sm}].concat(title.sub.map(function(text){return{text:text,weight:400,size:title.ss}}));
    // m.base é a linha de base da 1ª linha no desenho de 2 linhas; a última linha (base + entrelinha) é a âncora e
    // o texto cresce para cima, então nome de uma linha só também fica encostado na régua
    var firstBase=m.base+LEAD-(lines.length-1)*title.lead;
    lines.forEach(function(line,i){
      ctx.font=font(line.weight,line.size);spacing(ctx,line.size);
      ctx.fillText(line.text,RIGHT,firstBase+i*title.lead)
    });
    ctx.fillRect(RULE_X,m.ruleY,RULE_W,3);

    var code=codeText();
    if(code){
      var size=33;ctx.font=font(400,size);spacing(ctx,size);
      while(size>18&&ctx.measureText(code).width>TITLE_MAX_W){size--;ctx.font=font(400,size);spacing(ctx,size)}
      ctx.fillText(code,1000.3,m.codeBase)
    }
    if('letterSpacing' in ctx)ctx.letterSpacing='0px';

    if(assets.shadow)ctx.drawImage(assets.shadow,-146,m.shadowY,1375,177);
    ctx.fillStyle=GREEN;ctx.fillRect(0,m.footerY,t.w,t.h-m.footerY);
    if(assets.selo)ctx.drawImage(assets.selo,m.seloX,m.seloY,264,83);
    if(isStory){if(assets.fgHorizontal)ctx.drawImage(assets.fgHorizontal,185,1581,714,162)}
    else if(assets.fgBrasao)ctx.drawImage(assets.fgBrasao,931,1166,100,145)
  }

  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']=Object.assign({},global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']||{}, {
    'Destaques':{
      footerColor:GREEN,
      brandBadgeColor:'#f6be00',
      supportsBrandVariant:true,
      supportsCodes:true,
      supportsProductCutout:false,
      assetSources:{
        header:'post-editor-assets/fg-destaques/header.png',
        shadow:'post-editor-assets/fg-destaques/sombra.png',
        selo:'post-editor-assets/fg-destaques/selo-destaques.png',
        fgBrasao:'post-editor-assets/fg-lancamentos/footer-fg.png',
        fgHorizontal:'post-editor-assets/fg-destaques/fg-horizontal.png'
      },
      renderer:renderer
    }
  });
})(window);
