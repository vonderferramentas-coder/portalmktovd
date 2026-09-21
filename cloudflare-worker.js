// Cloudflare Worker — coletor público de ofertas da Ferramentas Gerais.
// ponytail: /product-image e /product-offer têm gêmeos sem código compartilhado em
// product-image.php e scripts/{product-image-proxy,fg-offer-proxy}.ps1 (3 runtimes distintos,
// sem build step neste projeto pra unificar). Já divergiram de verdade uma vez (arredondamento
// de desconto e campo offerCta ausente no PowerShell, corrigido em 15/09/2026) — ao mudar regra
// de parsing/cálculo aqui, replicar nos outros arquivos.
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
// CORS, então uma página em outra origem — GitHub Pages, ou file:// local — consegue exibir a
// foto via <img> mas não consegue desenhá-la num canvas para exportar/recortar; ver
// post-editor.js/itemImageUrls). Origem liberada com '*' porque é uma foto pública de produto,
// sem dado sensível — igual a um CDN de imagens comum.
const PRODUCT_PHOTO_UPSTREAM='https://app.ovd.com.br/fotos/produto';
function imageReply(body,status,extra={}){return new Response(body,{status,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS',...extra}});}
async function productImage(request){
 const code=(new URL(request.url).searchParams.get('code')||'').replace(/\D/g,'');
 if(code.length<5||code.length>20)return imageReply('Código de produto inválido.',400,{'Content-Type':'text/plain; charset=utf-8'});
 const upstream=await fetch(PRODUCT_PHOTO_UPSTREAM+'?codigo='+encodeURIComponent(code),{headers:{Accept:'image/jpeg,image/png,image/webp'}});
 if(!upstream.ok)return imageReply('Imagem do produto não encontrada.',404,{'Content-Type':'text/plain; charset=utf-8'});
 const contentType=upstream.headers.get('Content-Type')||'';
 if(!/^image\//.test(contentType))return imageReply('Formato de imagem não reconhecido.',415,{'Content-Type':'text/plain; charset=utf-8'});
 return imageReply(upstream.body,200,{'Content-Type':contentType,'Cache-Control':'public, max-age=604800'});
}
async function offer(request){const url=productUrl(new URL(request.url).searchParams.get('url')||'');if(!url)return json(request,{error:'Use um link válido de fg.com.br.'},400);const upstream=await fetch(url,{headers:{Accept:'text/html'}});if(!upstream.ok)return json(request,{error:'A página da oferta não pôde ser carregada.'},502);const html=await upstream.text(),raw=embeddedObject(html,'skuJson_0');if(!raw)return json(request,{error:'Os dados de SKU não foram encontrados nesta página.'},422);let data;try{data=JSON.parse(raw);}catch{return json(request,{error:'Os dados de SKU recebidos estão inválidos.'},422);}const displayedCta=discountProductPrice(html),skus=(data.skus||[]).map((item,index)=>{const price=money(item.bestPrice),list=money(item.listPrice),old=list&&list>price?list:null,discount=old?Math.round((old-price)*100/old):null;return {sku:String(item.sku||''),variation:Object.values(item.dimensions||{}).filter(Boolean).join(' · '),price,listPrice:old,discountPercent:discount,available:Boolean(item.available),offerCta:old?(index===0&&displayedCta?displayedCta:discount+'% OFF'):'APROVEITE!'};}).filter(item=>item.sku&&item.price!==null);if(!skus.length)return json(request,{error:'Nenhum SKU com preço disponível foi encontrado.'},422);return json(request,{sourceUrl:url.href,title:data.name||'',brand:productBrand(html),skus,fetchedAt:Date.now()});}
// Nome, código e link oficial de um produto do site FG, a partir do código (?code=) ou do link da
// página do produto (?url=) — Conecta FG: conecta-fg.js. Também extrai uma sugestão curta
// de uso da descrição pública para o card editorial. A API pública de catálogo da VTEX não envia
// CORS, então o navegador só chega nela por aqui. O código do texto é o do produto ou o do SKU
// (iguais nos produtos de SKU único), por isso tenta os dois filtros. Por link, a busca é pelo
// "slug" da página (/{slug}/p); o host do link é validado por productUrl (só fg.com.br).
// ponytail: sem gêmeo em product-image.php/scripts/*.ps1 — só o Conecta FG usa, e ele cai num link
// deduzido do nome do produto quando o Worker não responde; se um dia precisar rodar sem o Worker,
// replicar aqui e lá.
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
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/product-image'){if(request.method==='OPTIONS')return imageReply(null,204);try{return await productImage(request);}catch{return imageReply('Não foi possível carregar a imagem do produto.',502,{'Content-Type':'text/plain; charset=utf-8'});}}
 if(request.method==='OPTIONS')return reply(request,null,204);
 try{if(path==='/product-offer')return offer(request);if(path==='/product-link')return await productLink(request);return json(request,{error:'Rota não encontrada.'},404);}catch{return json(request,{error:'Não foi possível consultar a oferta.'},502);}
}};