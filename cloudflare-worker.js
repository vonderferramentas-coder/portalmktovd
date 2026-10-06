// Cloudflare Worker - coletor público de ofertas da Ferramentas Gerais.
// Único proxy de foto/oferta/catálogo do portal (o PHP e os proxies PowerShell locais foram removidos em 06/10/2026: o portal só fala com a web).
const ALLOWED_ORIGINS=new Set(['https://vonderferramentas-coder.github.io','https://portalmktovd.pages.dev','https://hml.portalmktovd.pages.dev','http://localhost:5500','http://127.0.0.1:5500']);
const FG_HOST=/(^|\.)fg\.com\.br$/i;
function cors(request){const origin=request.headers.get('Origin')||'';const allowed=ALLOWED_ORIGINS.has(origin)?origin:'https://vonderferramentas-coder.github.io';return {'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};}
function reply(request,body,status=200,extra={}){return new Response(body,{status,headers:{...cors(request),...extra}});}
function json(request,data,status=200){return reply(request,JSON.stringify(data),status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});}
function embeddedObject(html,marker){const at=html.toLowerCase().indexOf(marker.toLowerCase());if(at<0)return null;const start=html.indexOf('{',at);if(start<0)return null;let depth=0,quote=false,escape=false;for(let i=start;i<html.length;i++){const ch=html[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quote=false;continue;}if(ch==='"')quote=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return html.slice(start,i+1);}return null;}
function productBrand(html){const match=html.match(/itemprop=["']brand["'][\s\S]{0,700}?itemprop=["']name["']\s+content=["']([^"']+)/i);return match?match[1].trim():'';}
function discountProductPrice(html){const at=html.toLowerCase().indexOf('discountproductprice');if(at<0)return '';const start=html.indexOf('>',at),end=start<0?-1:html.indexOf('<',start);return end<0?'':html.slice(start+1,end).replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();}
function money(cents){return Number.isFinite(Number(cents))?Math.round(Number(cents))/100:null;}
function productUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&FG_HOST.test(url.hostname)?url:null;}catch{return null;}}
function plainText(html){return String(html||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<\/li>/gi,'; ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();}
function shorten(text,max=360){if(text.length<=max)return text;const cut=text.slice(0,max+1),sentence=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('; ')),space=cut.lastIndexOf(' ');return cut.slice(0,sentence>max*.55?sentence+1:space>0?space:max).trim()+'…';}
function productUsage(html){const sections=[],pattern=/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[1-6]\b|$)/gi;let match;while((match=pattern.exec(String(html||''))))sections.push({title:plainText(match[2]),body:plainText(match[3])});const useful=sections.find(section=>/(aplica|indica|dica|uso|desempenho|versatilidade)/i.test(section.title)&&section.body)||sections.find(section=>section.body);return shorten(useful?useful.body:plainText(html));}
// Proxy CORS público da foto oficial de produto Vonder (app.ovd.com.br não envia cabeçalhos
// CORS, então uma página em outra origem - GitHub Pages, ou file:// local - consegue exibir a
// foto via <img> mas não consegue desenhá-la num canvas para exportar/recortar; ver
// post-editor.js/itemImageUrls). Origem liberada com '*' porque é uma foto pública de produto,
// sem dado sensível - igual a um CDN de imagens comum.
const PRODUCT_PHOTO_UPSTREAM='https://app.ovd.com.br/fotos/produto';
function imageReply(body,status,extra={}){return new Response(body,{status,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS',...extra}});}
async function productImage(request){
 const code=(new URL(request.url).searchParams.get('code')||'').replace(/\D/g,'');
 if(code.length<5||code.length>20)return imageReply('Código de produto inválido.',400,{'Content-Type':'text/plain; charset=utf-8'});
 const upstream=await fetch(PRODUCT_PHOTO_UPSTREAM+'?codigo='+encodeURIComponent(code),{headers:{Accept:'image/jpeg,image/png,image/webp'}});
 if(!upstream.ok)return imageReply('Imagem do produto não encontrada.',404,{'Content-Type':'text/plain; charset=utf-8'});
 const contentType=upstream.headers.get('Content-Type')||'';
 if(!/^image\//.test(contentType))return imageReply('Formato de imagem não reconhecido.',415,{'Content-Type':'text/plain; charset=utf-8'});
 // Bufferiza a imagem inteira em vez de repassar upstream.body em streaming: sem isso, uma conexão
 // cortada no meio do download vira um JPEG truncado que o navegador às vezes ainda trata como
 // carregado com sucesso (largura/altura ficam num marcador logo no início do arquivo, antes dos
 // pixels) - o cartaz exportado saía com a foto pela metade sem nenhum erro visível. arrayBuffer()
 // rejeita se a origem cair no meio, e cai no catch de productImage() (responde 502) em vez de
 // mandar bytes incompletos pro cliente; a Response abaixo também ganha Content-Length correto,
 // então uma eventual truncagem entre o Worker e o navegador vira erro no <img> também.
 const bytes=await upstream.arrayBuffer();
 return imageReply(bytes,200,{'Content-Type':contentType,'Cache-Control':'public, max-age=604800'});
}
async function offer(request){const url=productUrl(new URL(request.url).searchParams.get('url')||'');if(!url)return json(request,{error:'Use um link válido de fg.com.br.'},400);const upstream=await fetch(url,{headers:{Accept:'text/html'}});if(!upstream.ok)return json(request,{error:'A página da oferta não pôde ser carregada.'},502);const html=await upstream.text(),raw=embeddedObject(html,'skuJson_0');if(!raw)return json(request,{error:'Os dados de SKU não foram encontrados nesta página.'},422);let data;try{data=JSON.parse(raw);}catch{return json(request,{error:'Os dados de SKU recebidos estão inválidos.'},422);}const displayedCta=discountProductPrice(html),skus=(data.skus||[]).map((item,index)=>{const price=money(item.bestPrice),list=money(item.listPrice),old=list&&list>price?list:null,discount=old?Math.round((old-price)*100/old):null;return {sku:String(item.sku||''),variation:Object.values(item.dimensions||{}).filter(Boolean).join(' · '),price,listPrice:old,discountPercent:discount,available:Boolean(item.available),offerCta:old?(index===0&&displayedCta?displayedCta:discount+'% OFF'):'APROVEITE!'};}).filter(item=>item.sku&&item.price!==null);if(!skus.length)return json(request,{error:'Nenhum SKU com preço disponível foi encontrado.'},422);return json(request,{sourceUrl:url.href,title:data.name||'',brand:productBrand(html),skus,fetchedAt:Date.now()});}
// Nome, código e link oficial de um produto do site FG, a partir do código (?code=) ou do link da
// página do produto (?url=) - Conecta FG: conecta-fg.js. Também extrai uma sugestão curta
// de uso da descrição pública para o card editorial. A API pública de catálogo da VTEX não envia
// CORS, então o navegador só chega nela por aqui. O código do texto é o do produto ou o do SKU
// (iguais nos produtos de SKU único), por isso tenta os dois filtros. Por link, a busca é pelo
// "slug" da página (/{slug}/p); o host do link é validado por productUrl (só fg.com.br).
// ponytail: só o Conecta FG usa; ele cai num link deduzido do nome do produto quando o Worker não responde.
async function productLink(request){
 const params=new URL(request.url).searchParams;
 const code=(params.get('code')||'').replace(/\D/g,'');
 const page=productUrl(params.get('url')||''),slug=page&&/^\/([^/]+)\/p\/?$/.exec(page.pathname);
 const queries=slug?['/'+slug[1]+'/p']:code.length>=5&&code.length<=20?['?fq=productId:'+code,'?fq=skuId:'+code]:[];
 if(!queries.length)return json(request,{error:'Informe um código de 5 a 20 dígitos ou o link de um produto do site FG.'},400);
 for(const query of queries){
  const upstream=await fetch('https://www.fg.com.br/api/catalog_system/pub/products/search'+query,{headers:{Accept:'application/json'}});
  if(!upstream.ok)return json(request,{error:'O site FG não respondeu.'},502);
  const product=(await upstream.json())[0];
  if(product&&product.linkText)return json(request,{code:slug?product.productId:code,name:product.productName,url:'https://www.fg.com.br/'+product.linkText+'/p',usage:productUsage(product.description)});
 }
 return json(request,{error:'Produto não encontrado no site FG.',notFound:true},404);
}
// Perfil VONDER: só entram produtos das marcas VONDER do site FG (IDs fixos, ativas em 06/10/2026: VONDER, VONDER PLUS,
// VONDER AT, VONDER/TMX, VONDER CONSTRUTOR). Marca nova com "VONDER" no nome precisa ser acrescentada aqui (lista de marcas:
// /api/catalog_system/pub/brand/list). O filtro por nome da marca é a 2ª barreira: nada de outra marca passa.
const VONDER_BRAND_FQ=[2959,29859,29360,29639,37264].map(id=>'fq=B:'+id).join('&');
const isVonderBrand=product=>/^vonder\b/i.test(String(product&&product.brand||''));
// Consultas ao site FG pelas rotas novas: cache de borda de 10 min (mesma URL = mesma resposta, sem nova ida ao site; acelera buscas
// repetidas e protege o site e a cota do Worker). Barreira de origem: só o portal chama (o Origin é falsificável fora de um navegador,
// então isto só barra uso casual; contra abuso de verdade há a regra de limite de requisições do Cloudflare, ver ARQUITETURA seção do Worker).
const vtexFetch=url=>fetch(url,{headers:{Accept:'application/json'},cf:{cacheTtl:600,cacheEverything:true}});
const originAllowed=request=>ALLOWED_ORIGINS.has(request.headers.get('Origin')||'');
const formatCode=digits=>digits.length===10?digits.replace(/^(\d{2})(\d{2})(\d{3})(\d{3})$/,'$1.$2.$3.$4'):digits;
// Tabela de especificações do site (descrição do produto): linhas [rótulo, valor] em texto limpo.
const specRows=product=>[...String(product.description||'').matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>[plainText(m[1]),plainText(m[2])]);
const specTake=rows=>pattern=>(rows.find(([label])=>pattern.test(label))||['',''])[1];
// Produto fora do catálogo.json (portal: post-editor.js, "Buscar no site da FG"): devolve os mesmos campos
// de data/catalog-*.json a partir da tabela de especificações do site FG, achada pela REFERÊNCIA
// (código OVD, 10 dígitos; é o RefId do SKU, por isso o filtro alternateIds_RefId e não productId). A foto
// NÃO vem daqui: o portal a busca em /product-image pelo mesmo código (app.ovd.com.br).
// ponytail: "qualificacaoTecnica" junta
// as linhas técnicas do site e pode divergir do catálogo (que tem linhas comerciais a mais).
async function productCatalog(request){
 const code=(new URL(request.url).searchParams.get('code')||'').replace(/\D/g,'');
 if(code.length<5||code.length>20)return json(request,{error:'Informe um código de 5 a 20 dígitos.'},400);
 if(!originAllowed(request))return json(request,{error:'Origem não permitida.'},403);
 const upstream=await vtexFetch('https://www.fg.com.br/api/catalog_system/pub/products/search?fq=alternateIds_RefId:'+code);
 if(!upstream.ok)return json(request,{error:'O site FG não respondeu.'},502);
 const product=(await upstream.json()).find(isVonderBrand);
 if(!product)return json(request,{error:'Produto não encontrado no site FG.',notFound:true},404);
 const rows=specRows(product),take=specTake(rows);
 const named=/^(descri[cç][aã]o completa|refer[eê]ncia|conte[uú]do da embalagem|aplica[cç][oõ]es|destaques)/i;
 // O código buscado pode ser de uma variação (SKU) do produto; vale o que foi pedido, não o do 1º SKU.
 const skuMatch=(product.items||[]).some(item=>(item.referenceId||[]).some(ref=>String(ref.Value||'').replace(/\D/g,'')===code)),ref=(((product.items||[])[0]||{}).referenceId||[]).find(r=>r.Key==='RefId'),digits=skuMatch?code:String((ref&&ref.Value)||code).replace(/\D/g,'');
 return json(request,{
  name:take(/^descri[cç][aã]o completa/i)||product.productName,
  code:formatCode(digits),
  codeFG:String(product.productId),
  brand:product.brand,
  destaques:take(/^destaques/i),aplicacoes:take(/^aplica[cç][oõ]es/i),conteudoEmbalagem:take(/^conte[uú]do da embalagem/i),
  qualificacaoTecnica:rows.filter(([label,value])=>value&&!named.test(label)).map(([label,value])=>label+': '+value).join(' | '),
 });
}
// Miniatura da lista: a CDN pública da VTEX redimensiona pela URL (/arquivos/ids/ID-120-120/arquivo, ~3 KB). A foto oficial
// do app.ovd tem vários MB e só é carregada depois que o usuário escolhe o produto.
const thumbUrl=(product,item=(product.items||[])[0])=>{const image=((item||{}).images||[])[0],match=image&&/^(https:\/\/[\w.-]+\.vteximg\.com\.br)\/arquivos\/ids\/(\d+)\/([^?]+)/.exec(image.imageUrl||'');return match?match[1]+'/arquivos/ids/'+match[2]+'-120-120/'+match[3]:'';};
// Busca por nome (ou código) de produto VONDER no site FG, para a lista "Encontrados no site" do editor de posts. Devolve só
// nome e código (a foto e os demais dados vêm depois, em /product-catalog e /product-image, quando o usuário escolhe um item).
// ponytail: sem gêmeo em PHP/PowerShell; no máximo 12 itens, sem paginação.
async function productSearch(request){
 const q=(new URL(request.url).searchParams.get('q')||'').trim().slice(0,60),digits=q.replace(/\D/g,''),byCode=digits.length>=5&&/^[\d.\s-]+$/.test(q);
 if(!byCode&&q.length<3)return json(request,{error:'Digite ao menos 3 letras ou um código.'},400);
 const query=byCode?'?fq=alternateIds_RefId:'+digits:'?ft='+encodeURIComponent(q)+'&'+VONDER_BRAND_FQ+'&_from=0&_to=14';
 if(!originAllowed(request))return json(request,{error:'Origem não permitida.'},403);
 const upstream=await vtexFetch('https://www.fg.com.br/api/catalog_system/pub/products/search'+query);
 if(!upstream.ok)return json(request,{error:'O site FG não respondeu.'},502);
 const items=(await upstream.json()).filter(isVonderBrand).slice(0,12).map(product=>({name:specTake(specRows(product))(/^descri[cç][aã]o completa/i)||product.productName,brand:product.brand,code:formatCode(String(product.productReference||'').replace(/\D/g,'')),thumb:thumbUrl(product)})).filter(item=>item.code);
 return json(request,{items});
}
// Miniaturas (3 KB) de vários produtos do catálogo de uma vez, para a lista do editor de posts: a foto do app.ovd tem de 2 a 15 MB e
// travava a busca. A consulta é uma só (várias referências em OU). Produto que o site não tem volta sem miniatura.
// ponytail: sem gêmeo em PHP/PowerShell; no máximo 20 códigos por chamada.
async function productThumbs(request){
 const codes=[...new Set((new URL(request.url).searchParams.get('codes')||'').split(',').map(code=>code.replace(/\D/g,'')).filter(code=>code.length>=5&&code.length<=20))].slice(0,20);
 if(!codes.length)return json(request,{error:'Informe os códigos separados por vírgula.'},400);
 if(!originAllowed(request))return json(request,{error:'Origem não permitida.'},403);
 const upstream=await vtexFetch('https://www.fg.com.br/api/catalog_system/pub/products/search?'+codes.map(code=>'fq=alternateIds_RefId:'+code).join('&')+'&_from=0&_to=19');
 if(!upstream.ok)return json(request,{error:'O site FG não respondeu.'},502);
 const thumbs={};
 // Variações (127 V / 220 V...) são SKUs do mesmo produto: cada uma tem a sua referência e as suas fotos.
 for(const product of await upstream.json())for(const item of product.items||[])for(const ref of item.referenceId||[]){const code=String(ref.Value||'').replace(/\D/g,'');if(codes.includes(code)&&thumbUrl(product,item))thumbs[code]=thumbUrl(product,item);}
 return json(request,{thumbs});
}
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/product-image'){if(request.method==='OPTIONS')return imageReply(null,204);try{return await productImage(request);}catch{return imageReply('Não foi possível carregar a imagem do produto.',502,{'Content-Type':'text/plain; charset=utf-8'});}}
 if(request.method==='OPTIONS')return reply(request,null,204);
 try{if(path==='/product-offer')return offer(request);if(path==='/product-link')return await productLink(request);if(path==='/product-catalog')return await productCatalog(request);if(path==='/product-search')return await productSearch(request);if(path==='/product-thumbs')return await productThumbs(request);return json(request,{error:'Rota não encontrada.'},404);}catch{return json(request,{error:'Não foi possível consultar a oferta.'},502);}
}};