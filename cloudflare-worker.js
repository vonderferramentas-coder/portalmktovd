// Cloudflare Worker — coletor público de ofertas da Ferramentas Gerais.
const ALLOWED_ORIGINS=new Set(['https://vonderferramentas-coder.github.io','http://localhost:5500','http://127.0.0.1:5500']);
const FG_HOST=/(^|\.)fg\.com\.br$/i;
function cors(request){const origin=request.headers.get('Origin')||'';const allowed=ALLOWED_ORIGINS.has(origin)?origin:'https://vonderferramentas-coder.github.io';return {'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};}
function reply(request,body,status=200,extra={}){return new Response(body,{status,headers:{...cors(request),...extra}});}
function json(request,data,status=200){return reply(request,JSON.stringify(data),status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});}
function embeddedObject(html,marker){const at=html.toLowerCase().indexOf(marker.toLowerCase());if(at<0)return null;const start=html.indexOf('{',at);if(start<0)return null;let depth=0,quote=false,escape=false;for(let i=start;i<html.length;i++){const ch=html[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quote=false;continue;}if(ch==='"')quote=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return html.slice(start,i+1);}return null;}
function productBrand(html){const match=html.match(/itemprop=["']brand["'][\s\S]{0,700}?itemprop=["']name["']\s+content=["']([^"']+)/i);return match?match[1].trim():'';}
function discountProductPrice(html){const at=html.toLowerCase().indexOf('discountproductprice');if(at<0)return '';const start=html.indexOf('>',at),end=start<0?-1:html.indexOf('<',start);return end<0?'':html.slice(start+1,end).replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();}
function money(cents){return Number.isFinite(Number(cents))?Math.round(Number(cents))/100:null;}
function productUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&FG_HOST.test(url.hostname)?url:null;}catch{return null;}}
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
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/product-image'){if(request.method==='OPTIONS')return imageReply(null,204);try{return await productImage(request);}catch{return imageReply('Não foi possível carregar a imagem do produto.',502,{'Content-Type':'text/plain; charset=utf-8'});}}
 if(request.method==='OPTIONS')return reply(request,null,204);
 try{if(path==='/product-offer')return offer(request);return json(request,{error:'Rota não encontrada.'},404);}catch{return json(request,{error:'Não foi possível consultar a oferta.'},502);}
}};