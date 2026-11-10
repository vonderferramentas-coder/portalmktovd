// Baixar logo da tela Marcas: PNG sem fundo (qualquer logo), SVG (logos vetoriais) e EPS vetorial.
// O EPS é gerado no navegador a partir do SVG: caminhos, retângulos/círculos, transformações, preenchimento/contorno em cor sólida, recortes (clip-path) e <use>.
// Logo com imagem embutida, gradiente, máscara, filtro, texto ou transparência não vira EPS vetorial (erro explicando) - nesses casos use PNG ou SVG.
// ponytail: cor sempre em RGB (sem CMYK/Pantone) e sem transparência; se a gráfica pedir CMYK, converter no Illustrator.
(function (global) {
  'use strict';
  const NS_XLINK = 'http://www.w3.org/1999/xlink';
  const UNSUPPORTED = { image: 'imagem embutida', mask: 'máscara', filter: 'filtro', text: 'texto', tspan: 'texto', pattern: 'padrão', linearGradient: 'gradiente', radialGradient: 'gradiente', foreignObject: 'conteúdo HTML', symbol: 'símbolo', marker: 'marcador' };

  function svgText(uri) {
    if (!/^data:image\/svg\+xml/.test(uri)) return null;
    const body = uri.slice(uri.indexOf(',') + 1);
    return /;base64,/.test(uri.slice(0, uri.indexOf(',') + 1)) ? new TextDecoder().decode(Uint8Array.from(atob(body), c => c.charCodeAt(0))) : decodeURIComponent(body);
  }
  function parse(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
    if (!root || root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('O SVG não é válido.');
    return root;
  }
  // Área do desenho: viewBox (ou width/height) e o tamanho em pontos.
  function boxOf(root) {
    const num = value => parseFloat(value), vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const hasVb = vb.length === 4 && vb.every(Number.isFinite);
    const w = hasVb ? vb[2] : num(root.getAttribute('width')), h = hasVb ? vb[3] : num(root.getAttribute('height'));
    if (!(w > 0 && h > 0)) throw new Error('O SVG não tem tamanho definido.');
    const outW = num(root.getAttribute('width')) || w, outH = num(root.getAttribute('height')) || h;
    return { x: hasVb ? vb[0] : 0, y: hasVb ? vb[1] : 0, w, h, sx: outW / w, sy: outH / h, outW, outH };
  }

  // ---- matrizes [a b c d e f] ----
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  function matrixOf(text) {
    let m = [1, 0, 0, 1, 0, 0];
    String(text || '').replace(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g, (_, kind, args) => {
      const v = args.split(/[\s,]+/).filter(Boolean).map(Number); let n;
      if (kind === 'matrix') n = v; else if (kind === 'translate') n = [1, 0, 0, 1, v[0], v[1] || 0]; else if (kind === 'scale') n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
      else { const a = v[0] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); n = [c, s, -s, c, 0, 0]; if (v.length === 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]); }
      if (n.length !== 6 || n.some(x => !Number.isFinite(x))) throw new Error('Transformação do SVG não suportada.');
      m = mul(m, n);
    });
    return m;
  }
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  // ---- formas -> segmentos absolutos: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z'] ----
  function pathSegments(d) {
    const tokens = String(d || '').match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [], out = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
    const take = n => { const v = tokens.slice(i, i + n).map(Number); if (v.length < n || v.some(Number.isNaN)) throw new Error('Caminho do SVG inválido.'); i += n; return v; };
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase(), up = cmd.toUpperCase();
      if (up === 'Z') { out.push(['Z']); x = sx; y = sy; continue; }
      if (up === 'M') { let [a, b] = take(2); if (rel) { a += x; b += y; } out.push(['M', a, b]); x = sx = a; y = sy = b; cmd = rel ? 'l' : 'L'; }
      else if (up === 'L') { let [a, b] = take(2); if (rel) { a += x; b += y; } out.push(['L', a, b]); x = a; y = b; }
      else if (up === 'H') { let [a] = take(1); if (rel) a += x; out.push(['L', a, y]); x = a; }
      else if (up === 'V') { let [b] = take(1); if (rel) b += y; out.push(['L', x, b]); y = b; }
      else if (up === 'C') { const v = take(6); if (rel) for (let k = 0; k < 6; k += 2) { v[k] += x; v[k + 1] += y; } out.push(['C', ...v]); x = v[4]; y = v[5]; }
      else throw new Error('Curva do tipo ' + cmd + ' não suportada no EPS.');
    }
    return out;
  }
  function shapeSegments(el) {
    const n = name => parseFloat(el.getAttribute(name) || 0), tag = el.localName;
    if (tag === 'path') return pathSegments(el.getAttribute('d'));
    if (tag === 'rect') { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']]; }
    if (tag === 'polygon' || tag === 'polyline') { const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), s = []; for (let k = 0; k + 1 < v.length; k += 2) s.push([k ? 'L' : 'M', v[k], v[k + 1]]); if (tag === 'polygon') s.push(['Z']); return s; }
    if (tag === 'line') return [['M', n('x1'), n('y1')], ['L', n('x2'), n('y2')]];
    if (tag === 'circle' || tag === 'ellipse') { // 4 curvas de Bézier
      const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry'), k = .5522847498;
      return [['M', cx + rx, cy], ['C', cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry], ['C', cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy], ['C', cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry], ['C', cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy], ['Z']];
    }
    return null;
  }

  let colorContext = null;
  function colorOf(value) { // qualquer cor CSS -> [r,g,b] 0..1 (o canvas faz a conversão)
    colorContext = colorContext || document.createElement('canvas').getContext('2d');
    colorContext.fillStyle = '#000'; colorContext.fillStyle = value;
    const hex = colorContext.fillStyle, m = /^#([0-9a-f]{6})$/i.exec(hex) || (() => { throw new Error('Cor do SVG não suportada: ' + value); })();
    return [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16) / 255);
  }

  // ---- percurso do SVG -> lista de operações (o mesmo resultado serve ao EPS e ao teste, que redesenha no canvas) ----
  function toOps(root) {
    const ops = [], byId = new Map([...root.querySelectorAll('[id]')].map(el => [el.getAttribute('id'), el]));
    const refId = value => { const m = /url\(\s*['"]?#([^'")]+)/.exec(value || ''); return m && m[1]; };
    const hrefOf = el => (el.getAttribute('href') || el.getAttributeNS(NS_XLINK, 'href') || '').replace(/^#/, '');
    const pick = (el, name, fallback) => el.hasAttribute(name) ? el.getAttribute(name) : fallback;

    function clipOps(id) { // recorte: junta as formas do <clipPath> num caminho só (união aproximada pelo preenchimento não-zero)
      const clip = byId.get(id); if (!clip || clip.localName !== 'clipPath') throw new Error('Recorte do SVG não encontrado.');
      const own = matrixOf(clip.getAttribute('transform')), segs = [];
      let evenodd = false;
      clip.querySelectorAll('*').forEach(child => {
        const s = shapeSegments(child); if (!s) return;
        const m = mul(own, matrixOf(child.getAttribute('transform'))); if (child.getAttribute('clip-rule') === 'evenodd') evenodd = true;
        s.forEach(seg => segs.push(seg[0] === 'Z' ? seg : [seg[0], ...seg.slice(1).flatMap((v, k, all) => k % 2 ? [] : apply(m, v, all[k + 1]))]));
      });
      ops.push({ op: 'clip', segs, evenodd });
    }

    function walk(el, style) {
      const tag = el.localName;
      if (['defs', 'clipPath', 'title', 'desc', 'metadata', 'style'].includes(tag)) return;
      if (UNSUPPORTED[tag]) throw new Error('Este logo tem ' + UNSUPPORTED[tag] + ' e não pode virar EPS vetorial.');
      ['opacity', 'fill-opacity', 'stroke-opacity'].forEach(name => { if (el.hasAttribute(name) && Number(el.getAttribute(name)) !== 1) throw new Error('Este logo tem transparência e não pode virar EPS vetorial.'); });
      const s = { fill: pick(el, 'fill', style.fill), fillRule: pick(el, 'fill-rule', style.fillRule), stroke: pick(el, 'stroke', style.stroke), width: pick(el, 'stroke-width', style.width), join: pick(el, 'stroke-linejoin', style.join), cap: pick(el, 'stroke-linecap', style.cap), miter: pick(el, 'stroke-miterlimit', style.miter) };
      ops.push({ op: 'save' });
      const m = matrixOf(el.getAttribute('transform')); if (m.some((v, k) => v !== [1, 0, 0, 1, 0, 0][k])) ops.push({ op: 'concat', m });
      const clip = refId(el.getAttribute('clip-path')); if (clip) clipOps(clip);
      const segs = shapeSegments(el);
      if (segs) {
        if (s.fill !== 'none') ops.push({ op: 'fill', segs, color: colorOf(s.fill), evenodd: s.fillRule === 'evenodd' });
        if (s.stroke !== 'none') ops.push({ op: 'stroke', segs, color: colorOf(s.stroke), width: parseFloat(s.width), join: s.join, cap: s.cap, miter: parseFloat(s.miter) });
      } else if (tag === 'use') {
        const target = byId.get(hrefOf(el)); if (!target) throw new Error('Referência <use> não encontrada.');
        const x = parseFloat(el.getAttribute('x') || 0), y = parseFloat(el.getAttribute('y') || 0); if (x || y) ops.push({ op: 'concat', m: [1, 0, 0, 1, x, y] });
        walk(target, s);
      } else Array.from(el.children).forEach(child => walk(child, s));
      ops.push({ op: 'restore' });
    }
    walk(root, { fill: '#000', fillRule: 'nonzero', stroke: 'none', width: 1, join: 'miter', cap: 'butt', miter: 4 });
    return ops;
  }

  // ---- operações -> PostScript ----
  const f = value => (Math.round(value * 1000) / 1000).toString();
  function pathPs(segs) {
    return 'newpath ' + segs.map(seg => seg[0] === 'M' ? f(seg[1]) + ' ' + f(seg[2]) + ' moveto' : seg[0] === 'L' ? f(seg[1]) + ' ' + f(seg[2]) + ' lineto' : seg[0] === 'C' ? seg.slice(1).map(f).join(' ') + ' curveto' : 'closepath').join(' ');
  }
  const JOIN = { miter: 0, round: 1, bevel: 2 }, CAP = { butt: 0, round: 1, square: 2 };
  function opPs(op) {
    if (op.op === 'save') return 'gsave';
    if (op.op === 'restore') return 'grestore';
    if (op.op === 'concat') return '[' + op.m.map(f).join(' ') + '] concat';
    if (op.op === 'clip') return pathPs(op.segs) + (op.evenodd ? ' eoclip' : ' clip') + ' newpath';
    const color = op.color.map(f).join(' ') + ' setrgbcolor';
    if (op.op === 'fill') return pathPs(op.segs) + ' ' + color + (op.evenodd ? ' eofill' : ' fill');
    return pathPs(op.segs) + ' ' + color + ' ' + f(op.width) + ' setlinewidth ' + (JOIN[op.join] ?? 0) + ' setlinejoin ' + (CAP[op.cap] ?? 0) + ' setlinecap ' + f(op.miter) + ' setmiterlimit stroke';
  }
  // Lança Error com o motivo quando o logo não pode virar EPS vetorial.
  function svgToEps(text, title) {
    const root = parse(text), box = boxOf(root), ops = toOps(root);
    const flip = [box.sx, 0, 0, -box.sy, -box.x * box.sx, (box.h + box.y) * box.sy]; // origem do EPS é embaixo à esquerda
    const eps = ['%!PS-Adobe-3.0 EPSF-3.0', '%%Title: ' + String(title || 'logo').replace(/[^\x20-\x7e]/g, '?'), '%%Creator: Portal de Marketing OVD (tela Marcas)',
      '%%BoundingBox: 0 0 ' + Math.ceil(box.outW) + ' ' + Math.ceil(box.outH), '%%HiResBoundingBox: 0 0 ' + f(box.outW) + ' ' + f(box.outH), '%%LanguageLevel: 2', '%%EndComments',
      'gsave', '[' + flip.map(f).join(' ') + '] concat', ...ops.map(opPs), 'grestore', 'showpage', '%%EOF', ''].join('\n');
    return { eps, ops, box, flip };
  }

  // ---- PNG sem fundo ----
  function loadImage(uri) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('A imagem do logo não pôde ser lida.')); img.src = uri; }); }
  async function toPngBlob(uri, longSide = 2000) {
    const text = svgText(uri), img = await loadImage(uri);
    let w = img.naturalWidth, h = img.naturalHeight;
    if (text) { const box = boxOf(parse(text)); w = box.outW; h = box.outH; } // SVG sem tamanho próprio: usa o do desenho
    const scale = text ? longSide / Math.max(w, h) : Math.min(1, longSide / Math.max(w, h)); // vetor cresce até 2000 px; imagem não é ampliada
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); // canvas novo é transparente: sem fundo
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0)); // toDataURL é síncrono (toBlob depende de callback)
    return new Blob([bytes], { type: 'image/png' });
  }

  function download(blob, filename) {
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  global.BrandExport = { svgText, svgToEps, toPngBlob, download };
})(window);
