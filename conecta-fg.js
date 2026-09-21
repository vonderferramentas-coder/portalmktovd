// ============================================================
// CONECTA FG — converte o .docx do texto do blog (conecta.fg.com.br) no código da aba "Texto"
// do WordPress: parágrafos com o negrito/itálico/links do próprio Word, listas, títulos e os
// produtos do documento como [caption] (foto + link do site FG), no mesmo formato dos posts
// já publicados (ex.: /pulverizadores-hortas-em-casa/).
//
// Os documentos não seguem um padrão único de produto, então o que a tela recebe é uma lista de
// produtos (parseDocument.products) montada a partir de qualquer um destes jeitos, e cada
// produto sabe onde entra no texto (`at`) — ver parseDocument:
//   - linha de tabela "nome | código";
//   - parágrafo só com o link do produto no site FG (com ou sem foto colada antes);
//   - parágrafo em negrito com o nome + parágrafo seguinte só com o link.
// Produto que o redator não indicou (ou indicou errado) a tela adiciona/corrige por link ou código.
//
// Tudo roda no navegador. Rede: só o Worker (nome/código/link oficial do produto, ver
// lookupLink; e as fotos da miniatura/prévia, ver previewPhotoUrl) — no código do WordPress as
// fotos entram como <img> de app.ovd.com.br e quem as baixa é o WordPress/leitor. O navegador do
// usuário NÃO carrega app.ovd.com.br direto: na rede da empresa esse nome aponta para IP interno
// (10.x) e o Chrome pediria "Acessar outros dispositivos na sua rede local". A tela fica em
// conecta-fg.html; aqui só a lógica, pra ser testável sozinha
// (tests/conecta-fg.test.html).
// ============================================================
(function(global){
  'use strict';

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const WORKER = 'https://ecommerce-fg.vonderferramentas.workers.dev';

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/ /g, '&nbsp;');
  const photoUrl = code => 'https://app.ovd.com.br/fotos/produto?codigo=' + encodeURIComponent(code);
  // mesma foto, pelo Worker (host público): é o que a miniatura e a prévia da tela carregam
  const previewPhotoUrl = code => WORKER + '/product-image?code=' + encodeURIComponent(code);
  const isHttp = url => /^https?:\/\//i.test(url || '');
  const digits = value => String(value || '').replace(/\D/g, '');

  function catalogProduct(items, code){
    const wanted = digits(code);
    if(!wanted || !Array.isArray(items)) return null;
    return items.find(item => digits(item.codeFG) === wanted || digits(item.code) === wanted) || null;
  }

  // Mesmo "slug" da VTEX (loja da FG): sem acento, minúsculo, e cada caractere fora de a-z/0-9
  // vira "-" sem colapsar — por isso " - " vira "---" e "3,6" vira "3-6". Só serve de plano B
  // quando o Worker não responde; o link oficial vem de lookupLink.
  const slug = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const guessLink = name => 'https://www.fg.com.br/' + slug(name) + '/p';
  const alnum = s => slug(s).replace(/-/g, '');

  // Página de produto do site FG (/{slug}/p) — no docx costuma vir sozinha num parágrafo.
  const PRODUCT_URL = /^https?:\/\/(www\.)?fg\.com\.br\/([^/?#\s]+)\/p\/?$/i;
  // O que a tela aceita em "Adicionar produto": só o código ou só o link da página do produto.
  const productRef = text => { const t = String(text).trim(); return /^\d{5,20}$/.test(t) ? { code: t } : PRODUCT_URL.test(t) ? { url: t } : null; };


  // Nome, código e link oficial pelo Worker (o site não libera CORS pro navegador). `ref` é
  // { code } ou { url }. Rejeita com { notFound:true } quando o produto não existe; qualquer
  // outra falha (Worker antigo sem a rota/parâmetro, fora do ar, origem não permitida) é
  // "indisponível".
  async function lookupLink(ref){
    const query = ref.code ? 'code=' + encodeURIComponent(ref.code) : 'url=' + encodeURIComponent(ref.url);
    const res = await fetch(WORKER + '/product-link?' + query, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    if(res.ok && data.url) return data;
    throw Object.assign(new Error(data.notFound ? 'notFound' : 'indisponível'), { notFound: !!data.notFound });
  }

  // ---- .docx (zip) --------------------------------------------------------------------------
  // Lê só as entradas pedidas. O diretório central dá posição e tamanho de cada arquivo (o
  // cabeçalho local pode vir zerado quando o Word usa "data descriptor") e o
  // DecompressionStream do navegador faz o deflate — sem biblioteca.
  async function unzip(buf, names){
    const u8 = new Uint8Array(buf), dv = new DataView(buf), out = {};
    let end = u8.length - 22;
    while(end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
    if(end < 0) throw new Error('Este arquivo não parece ser um .docx.');
    let pos = dv.getUint32(end + 16, true);
    for(let n = dv.getUint16(end + 10, true); n--;){
      const method = dv.getUint16(pos + 10, true), size = dv.getUint32(pos + 20, true);
      const nameLen = dv.getUint16(pos + 28, true), extraLen = dv.getUint16(pos + 30, true), commentLen = dv.getUint16(pos + 32, true);
      const local = dv.getUint32(pos + 42, true);
      const name = new TextDecoder().decode(u8.subarray(pos + 46, pos + 46 + nameLen));
      pos += 46 + nameLen + extraLen + commentLen;
      if(!names.includes(name)) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = u8.subarray(start, start + size);
      out[name] = await new Response(method === 0 ? data : new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    return out;
  }

  // ---- texto do Word → HTML do WordPress ----------------------------------------------------
  const kids = (el, name) => Array.from(el.children).filter(c => c.localName === name);
  const attr = (el, name) => el.getAttributeNS(W, name);
  const textOf = el => Array.from(el.getElementsByTagNameNS(W, 't')).map(t => t.textContent).join('');
  // <w:b/> liga; <w:b w:val="0"/> desliga — o Word grava o "desligar" de forma explícita, e
  // ele vence o estilo de caractere (a chamada do exemplo é "Forte" com negrito desligado).
  const isOn = el => !['0', 'false', 'off'].includes(attr(el, 'val'));

  function parseDocument(docXml, relsXml, numberingXml){
    const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
    const body = parse(docXml).getElementsByTagNameNS(W, 'body')[0];
    if(!body) throw new Error('Não encontrei o texto neste arquivo — envie um .docx do Word.');

    // Só link http(s)/mailto vira <a>: um "javascript:" num documento não pode ir pro blog.
    const rels = {};
    for(const rel of parse(relsXml).getElementsByTagName('Relationship')){
      const target = rel.getAttribute('Target');
      if(/^(https?:\/\/|mailto:)/i.test(target)) rels[rel.getAttribute('Id')] = target;
    }

    // Lista com marcadores ou numerada: o formato de cada nível fica em numbering.xml
    // (numId → abstractNum → nível → numFmt). "bullet" vira <ul>; qualquer outro, <ol>.
    const absOf = {}, formatOf = {};
    if(numberingXml){
      const numbering = parse(numberingXml);
      const valOf = (el, name) => { const child = kids(el, name)[0]; return child ? attr(child, 'val') : ''; };
      for(const abs of numbering.getElementsByTagNameNS(W, 'abstractNum'))
        for(const lvl of kids(abs, 'lvl')) formatOf[attr(abs, 'abstractNumId') + ':' + attr(lvl, 'ilvl')] = valOf(lvl, 'numFmt');
      for(const num of numbering.getElementsByTagNameNS(W, 'num')) absOf[attr(num, 'numId')] = valOf(num, 'abstractNumId');
    }

    function collectRuns(node, href, runs){
      for(const c of node.children){
        if(c.localName === 'r'){
          const props = kids(c, 'rPr')[0], styleEl = props && kids(props, 'rStyle')[0], style = styleEl ? attr(styleEl, 'val') : '';
          const flag = name => { const el = props && kids(props, name)[0]; return el ? isOn(el) : null; };
          let text = '';
          for(const t of c.children) text += t.localName === 't' ? t.textContent : t.localName === 'br' ? '\n' : t.localName === 'tab' ? ' ' : '';
          if(!text) continue;
          runs.push({
            text: flag('caps') ? text.toLocaleUpperCase('pt-BR') : text,
            strong: flag('b') ?? /^(Forte|Strong)$/.test(style),
            em: flag('i') ?? /^(nfase|Emphasis)$/.test(style),
            href
          });
        }else if(c.localName === 'hyperlink') collectRuns(c, rels[c.getAttributeNS(R, 'id')] || href, runs);
        // ins = trecho inserido com "controlar alterações"; del fica de fora (só tem w:delText)
        else if(['ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple', 'customXml'].includes(c.localName)) collectRuns(c, href, runs);
      }
    }

    // Emenda runs vizinhos com a mesma formatação (o Word parte "CON"+"h"+"eça" em três) para
    // sair <strong>Acesse o segmento de </strong> e não um <strong> por pedaço.
    function paragraphHtml(runs){
      const groups = [];
      for(const r of runs){
        const last = groups[groups.length - 1];
        if(last && last.strong === r.strong && last.em === r.em && last.href === r.href) last.text += r.text;
        else groups.push({ ...r });
      }
      return groups.map(g => {
        let html = esc(g.text).replace(/\n/g, '<br />');
        if(!g.text.trim()) return html;
        if(g.em) html = `<em>${html}</em>`;
        if(g.strong) html = `<strong>${html}</strong>`;
        return g.href ? `<a href="${esc(g.href)}">${html}</a>` : html;
      }).join('').trim();
    }

    // 1ª passada: parágrafos com texto (ou só imagem) na ordem do documento + tabelas à parte.
    const items = [], tables = [], unsupported = new Set();
    for(const el of body.children){
      if(el.localName === 'tbl'){
        tables.push(kids(el, 'tr').map(tr => kids(tr, 'tc').map(tc => kids(tc, 'p').map(textOf).join(' ').trim())));
      }else if(el.localName === 'p'){
        const pPr = kids(el, 'pPr')[0], styleEl = pPr && kids(pPr, 'pStyle')[0], numPr = pPr && kids(pPr, 'numPr')[0];
        const numId = numPr && kids(numPr, 'numId')[0], ilvl = numPr && kids(numPr, 'ilvl')[0];
        const runs = [];
        collectRuns(el, undefined, runs);
        const text = runs.map(r => r.text).join('').trim();
        const hasImage = !!(el.getElementsByTagNameNS(W, 'drawing').length || el.getElementsByTagNameNS(W, 'pict').length);
        if(hasImage && text) unsupported.add('imagens');
        if(!text){ if(hasImage) items.push({ image: true }); continue; }
        items.push({
          runs, text, style: styleEl ? attr(styleEl, 'val') : '',
          list: numId && attr(numId, 'val') !== '0' ? formatOf[absOf[attr(numId, 'val')] + ':' + (ilvl ? attr(ilvl, 'val') : '0')] || 'bullet' : null
        });
      }
    }

    // 2ª passada: título, blocos de texto e produtos indicados no meio do texto.
    // Rótulo de categoria que vem antes do título ("FG News"): não é título nem texto do post.
    const LABEL = /^(fg news|dica fg|fg dicas?)$/i;
    const isUrl = it => !!it && !it.image && PRODUCT_URL.test(it.text);
    // nome do produto = parágrafo só em negrito, sem pontuação final, logo antes do parágrafo do link
    const isName = (it, next) => !!it && !it.image && !it.list && !isUrl(it) && isUrl(next) && !/[.:!?]$/.test(it.text) && it.runs.every(r => r.strong || !r.text.trim());
    // foto de produto colada no Word (uma ou mais) logo antes do produto: some, a foto vem do código
    const productAhead = i => { while(items[i] && items[i].image) i++; return isUrl(items[i]) || isName(items[i], items[i + 1]); };

    const blocks = [], notes = [], found = [];
    let title = '', category = '', list = null;
    // ponytail: lista dentro de lista (nível 2+) vira uma lista só, sem aninhar.
    const flush = () => {
      if(list) blocks.push(`<${list.tag}>\n${list.items.map(html => `<li>${html}</li>`).join('\n')}\n</${list.tag}>`);
      list = null;
    };

    for(let i = 0; i < items.length; i++){
      const it = items[i];
      if(it.image){ if(!productAhead(i)) unsupported.add('imagens'); continue; }
      // recado do redator para quem publica ("FAVOR INSERIR FOTO…"): não vai pro post
      if(/^favor\b/i.test(it.text)){ notes.push(it.text); continue; }
      if(!title){
        if(!category && LABEL.test(it.text.replace(/\s+/g, ' ')) && items[i + 1]) category = it.text; else title = it.text;
        continue;
      }
      if(isUrl(it) || isName(it, items[i + 1])){
        flush();
        found.push({ name: isUrl(it) ? '' : it.text, url: (isUrl(it) ? it : items[++i]).text, at: blocks.length });
        continue;
      }
      if(it.list){
        const tag = it.list === 'bullet' ? 'ul' : 'ol';
        if(list && list.tag !== tag) flush();
        list = list || { tag, items: [] };
        list.items.push(paragraphHtml(it.runs));
        continue;
      }
      flush();
      const heading = /^(?:Heading|Ttulo)([1-6])$/.exec(it.style);
      if(heading){
        const n = Math.max(2, +heading[1]); // o título do post já é o h1 do tema
        blocks.push(`<h${n}>${paragraphHtml(it.runs)}</h${n}>`);
      }else if(!blocks.length && it.runs.every(r => r.em || !r.text.trim())){
        // chamada: sai sempre em caixa-alta + itálico + ponto final, como nos posts publicados
        // (o Word costuma marcar caixa-alta só em parte dos trechos)
        for(const r of it.runs){ r.text = r.text.toLocaleUpperCase('pt-BR'); r.em = true; }
        blocks.push(paragraphHtml(it.runs) + (/[.!?…:]$/.test(it.text) ? '' : '.'));
      }else blocks.push(paragraphHtml(it.runs));
    }
    flush();
    if(!title) throw new Error('O documento não tem texto.');

    // Produtos: linhas de tabela com um código (nome + código) e/ou links soltos no texto. A
    // tabela sozinha não diz onde o produto entra (at = null); o link solto diz (at = quantos
    // blocos de texto vêm antes). Link que bate com o nome de uma linha da tabela completa essa
    // linha; link repetido vale só na primeira posição.
    // A outra tabela é o cabeçalho do documento (redação / revisão técnica / data de publicação);
    // qualquer tabela além dessas (ex.: caixas "Vantagens") fica de fora e é avisada.
    const products = [];
    let meta = [];
    for(const rows of tables){
      const rowProducts = rows.map(cells => {
        const code = cells.find(c => /^\d{5,}$/.test(c));
        return code && { code, name: cells.find(c => c && c !== code) || '', url: '', at: null };
      }).filter(Boolean);
      if(rowProducts.length) products.push(...rowProducts);
      else if(!meta.length && rows.length > 1) meta = rows[0].map((h, i) => [h, rows[1][i] || '']).filter(([h, v]) => h && v);
      else unsupported.add('tabelas de texto');
    }
    for(const f of found){
      const key = alnum(PRODUCT_URL.exec(f.url)[2]);
      const same = products.find(p => p.url ? alnum(PRODUCT_URL.exec(p.url)[2]) === key : alnum(p.name) === key);
      if(!same) products.push({ code: '', name: f.name, url: f.url, at: f.at });
      else if(!same.url){ same.url = f.url; same.at = f.at; }
    }

    return { title, category, blocks, products, meta, notes, unsupported: [...unsupported] };
  }

  async function readDocx(buf){
    const files = await unzip(buf, ['word/document.xml', 'word/_rels/document.xml.rels', 'word/numbering.xml']);
    if(!files['word/document.xml']) throw new Error('Não encontrei o texto neste arquivo — envie um .docx do Word.');
    return parseDocument(files['word/document.xml'], files['word/_rels/document.xml.rels'] || '', files['word/numbering.xml'] || '');
  }

  // ---- onde cada produto entra ------------------------------------------------------------------
  // Posição (nº de blocos antes) logo depois do 1º bloco que cita o produto, ou -1. O nome no
  // texto quase nunca é idêntico ao da tabela ("20 L" x "20L", "com precisão de" x "precisão"),
  // então vale o bloco com maior fração das palavras do nome (mín. 75%), ignorando acento,
  // caixa e pontuação.
  // ponytail: heurística de palavras — não entende sinônimo nem ordem; o usuário ajusta na tela.
  function mentionAt(blocks, name){
    const need = slug(name).split('-').filter(Boolean);
    if(!need.length) return -1;
    let best = -1, top = 0.75 - 1e-9;
    blocks.forEach((html, i) => {
      const text = html.replace(/<[^>]+>/g, ' '), have = new Set(slug(text).split('-'));
      const score = alnum(text).includes(alnum(name)) ? 1 : need.filter(w => have.has(w)).length / need.length;
      if(score > top){ top = score; best = i + 1; }
    });
    return best;
  }

  // ---- montagem do código ---------------------------------------------------------------------
  // Devolve o código pro WordPress (wp) e uma prévia em HTML (view) a partir dos mesmos
  // pedaços. Cada produto (p.at = nº de blocos de texto antes dele) vira um card editorial
  // responsivo; produtos na mesma posição ficam empilhados na ordem da lista. Produto
  // desmarcado ou sem
  // código (sem código não há foto) fica de fora; dados editoriais opcionais simplesmente somem.
  function assemble(blocks, products, box, showUsage = true){
    const card = p => {

      const label = p.name || p.url || p.code;
      const url = isHttp(p.url) ? esc(p.url) : '';
      const img = `<img src="${esc(photoUrl(p.code))}" alt="${esc(label)}" width="${box}" height="${box}" style="display:block;width:100%;height:100%;object-fit:contain" />`;
      const photo = url ? `<a href="${url}" style="display:block;width:100%;height:100%">${img}</a>` : img;
      const name = url ? `<a href="${url}" style="color:#17171a;text-decoration:none">${esc(label)}</a>` : esc(label);
      const usage = showUsage ? String(p.usage || '').trim() : '';
      const usageHtml = usage ? `<div style="margin:0 0 18px;padding:12px 14px;border-radius:8px;background:#eff6f2"><strong style="display:block;margin:0 0 4px;color:#004e32;font-size:13px">Aplicações e dicas de uso</strong><span style="display:block;color:#3f5149;font-size:14px;line-height:1.55">${esc(usage).replace(/\r?\n/g, '<br />')}</span></div>` : '';
      const cta = url ? `<a href="${url}" style="display:inline-block;padding:11px 18px;border-radius:7px;background:#004e32;color:#fff;font-size:13px;font-weight:700;text-decoration:none">Ver produto</a>` : '';
      const html = `<div class="fg-product-card" style="display:flex;flex-wrap:wrap;width:100%;max-width:100%;box-sizing:border-box;gap:24px;align-items:center;margin:28px 0;padding:24px;border:1px solid #d5e2db;border-left:5px solid #004e32;border-radius:12px;background:#fff"><div style="flex:0 1 ${box}px;width:${box}px;max-width:100%;aspect-ratio:1;text-align:center">${photo}</div><div style="flex:1 1 280px;min-width:0"><span style="display:block;margin:0 0 7px;color:#004e32;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Produto em destaque</span><h3 style="margin:0 0 12px;color:#17171a;font-size:21px;line-height:1.3">${name}</h3>${usageHtml}${cta}</div></div>`;
      // só o src da foto muda entre o código publicado (wp) e a prévia na tela (view)
      return { wp: html, view: html.replace(esc(photoUrl(p.code)), esc(previewPhotoUrl(p.code))) };
    };
    const block = html => /^<(h\d|ul|ol)\b/.test(html) ? html : `<p>${html}</p>`;
    const shop = products.filter(p => p.on && p.code);
    const items = [];
    for(let i = 0; i <= blocks.length; i++){
      items.push(...shop.filter(p => Math.min(p.at, blocks.length) === i).map(p => card(p)));
      if(i < blocks.length) items.push({ wp: blocks[i], view: block(blocks[i]) });
    }
    return { wp: items.map(i => i.wp).join('\n\n'), view: items.map(i => i.view).join('') };
  }
  // Firestore aceita arrays de valores, mas não uma matriz como meta: [[chave, valor]].
  function storageModel(value){
    const pairs = Array.isArray(value.meta) ? value.meta : Object.entries(value.meta || {});
    return { ...value, meta: Object.fromEntries(pairs) };
  }
  function restoreModel(value){
    return { ...value, meta: Array.isArray(value.meta) ? value.meta : Object.entries(value.meta || {}) };
  }
  global.ConectaFg = { esc, slug, guessLink, photoUrl, previewPhotoUrl, catalogProduct, productRef, lookupLink, readDocx, parseDocument, mentionAt, assemble, storageModel, restoreModel };
})(window);
