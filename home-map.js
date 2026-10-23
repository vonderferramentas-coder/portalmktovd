// Mapa 3D da Início, no padrão visual do WareTrack (referência aprovada pelo Marketing): uma CIDADE do Grupo OVD em
// que cada ferramenta do portal é um galpão na própria quadra, e CADA USUÁRIO É UM CAMINHÃO. Point and click: o seu
// caminhão (destacado) dirige pelas ruas até onde você clica; clicando num galpão ele vai até a sua doca, dá ré pela
// calçada rebaixada, estaciona e a ferramenta abre. Os outros usuários (simulados) também são caminhões: entram pela
// portaria da cidade, estacionam nas docas das ferramentas que usam e vão embora. A pauta é a CARGA do caminhão de
// quem trabalha nela e avança quando ele estaciona no galpão da etapa seguinte
// (Calendário > Editor > Gerador > Redes sociais > Monitoramento).
//
// Camadas:
//   1) STORE (store + tick): única fonte de dados. 1 tick = 1 s de simulação, com pausa e 1x/2x/4x. Números só mudam
//      em eventos (entra, estaciona, sai da doca, vai embora, pega pauta, etapa, atraso, conclusão).
//   2) CENA: lê o store. Caminhão anda só pela rua (A* numa grade em que só o eixo das ruas é livre), na mão da
//      direita, e entra de ré na doca. Peças repetidas da cidade usam instancing.
//   3) UI: cards de vidro (simulação, estado, zoom, detalhes) lendo o store.
// A grade de cards (#toolGrid) segue como "Ver como lista" e é a fonte dos galpões: nome, rota, descrição,
// permissão ([hidden] do auth-guard) e busca (.is-filtered do index.js).
// ponytail: outros usuários, pautas e acessos são SIMULADOS (nomes fictícios). Evolução: trocar tick() por eventos
// reais do Firestore (abertura/fechamento de ferramenta por usuário e etapa da pauta no calendário).
// Three.js r149 pela CDN já liberada no CSP (jsdelivr), carregado só quando o mapa é aberto.
(function(){
  const hero = document.getElementById('homeHero');
  if(!hero) return;
  const stage = document.getElementById('hmStage'), canvas = document.getElementById('hmCanvas'), ui = document.getElementById('hmUi');
  const toggle = document.getElementById('hmToggle'), input = document.getElementById('homeSearchInput');
  const cards = Array.from(document.querySelectorAll('#toolGrid .tool-card'));
  const KEY = 'homeView', LIGHT_KEY = 'homeMapLeve';
  let started = false;

  function setList(on, save){
    hero.classList.toggle('is-list', on);
    toggle.textContent = on ? 'Ver mapa' : 'Ver como lista';
    if(save){ try{ localStorage.setItem(KEY, on ? 'list' : 'map'); }catch(e){} }
    if(!on) start();
  }
  function hasWebGL(){ try{ return !!document.createElement('canvas').getContext('webgl'); }catch(e){ return false; } }
  function start(){
    if(started) return;
    started = true;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
    s.onload = function(){ hasWebGL() ? init() : setList(true, false); };
    s.onerror = function(){ setList(true, false); };
    document.head.appendChild(s);
  }
  toggle.addEventListener('click', function(){ setList(!hero.classList.contains('is-list'), true); });

  // o mapa é só para o perfil admin: o botão fica oculto para os demais (o papel chega do auth-guard, de forma assíncrona)
  const adminGate = function(){ toggle.hidden = document.body.dataset.userRole !== 'admin'; };
  adminGate(); new MutationObserver(adminGate).observe(document.body, { attributes: true, attributeFilter: ['data-user-role'] });
  const small = matchMedia('(max-width:720px)').matches || (navigator.hardwareConcurrency || 4) <= 2;
  // a lista é sempre o padrão ao abrir a Início; o mapa só aparece se o admin clicar em "Ver mapa" (a escolha não é lembrada)
  setList(true, false);

  // ---------- DOM helpers ----------
  const I = {
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    rotL: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', rotR: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>', close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    truck: '<path d="M2 6h12v10H2z"/><path d="M14 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="2"/><circle cx="18" cy="17.5" r="2"/>',
    building: '<path d="M3 21h18"/><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>',
    gate: '<path d="M4 21V5h4v16M8 9h12"/><path d="M12 9v4M16 9v4"/>',
    play: '<path d="m7 4 13 8-13 8Z"/>', pause: '<path d="M8 5v14M16 5v14"/>'
  };
  const icon = function(name, size){ return window.PortalShell ? PortalShell.svgIcon(I[name], size || 18) : ''; };
  function h(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function ico(name, size){ const e = h('span', 'hm-ico'); e.innerHTML = icon(name, size); return e; }
  function iconBtn(name, label, fn){ const b = h('button', 'hm-iconbtn'); b.type = 'button'; b.innerHTML = icon(name, 17); b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; }
  function row(main, sub, chip, chipCls, right, onClick){
    const r = h('div', 'hm-row'), a = h('span');
    a.append(h('b', null, main), h('small', null, sub)); r.append(a);
    if(chip) r.append(h('span', 'hm-chip ' + (chipCls || ''), chip));
    if(right != null) r.append(h('small', null, right));
    if(onClick){
      r.tabIndex = 0; r.setAttribute('role', 'button'); r.addEventListener('click', onClick);
      r.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onClick(); } });
    }
    return r;
  }
  // troca o conteúdo só se mudou (preserva foco/hover entre as atualizações periódicas)
  function swap(host, node){ if(host._last === node.innerHTML) return; host._last = node.innerHTML; host.replaceChildren.apply(host, Array.from(node.childNodes)); }
  const fold = function(t){ return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  const rand = function(a, b){ return a + Math.random() * (b - a); };
  const pickOne = function(arr){ return arr[Math.floor(Math.random() * arr.length)]; };

  // ---------- rotas: polilinha + comprimento acumulado ----------
  function mkPath(pts, revFrom){
    const p = pts.filter(function(q, i){ return !i || Math.abs(q[0] - pts[i - 1][0]) + Math.abs(q[1] - pts[i - 1][1]) > 1e-6; }), L = [0];
    for(let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    return { pts: p, L: L, len: L[L.length - 1], revFrom: revFrom == null ? Infinity : revFrom };
  }
  function pathAt(path, s){
    s = Math.max(0, Math.min(path.len, s));
    let i = 1; while(i < path.L.length - 1 && path.L[i] < s) i++;
    const a = path.pts[i - 1], b = path.pts[i] || a, seg = path.L[i] - path.L[i - 1] || 1, t = (s - path.L[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function dist(a, b){ return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function unit(a, b){ const l = dist(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
  function right(a, b){ const u = unit(a, b); return [-u[1], u[0]]; } // andando pra +z, a direita é -x
  // mão de direção: desloca a polilinha inteira (pontas inclusive) pra faixa da direita, com esquina em meia-esquadria
  function laneLine(c, off){
    return c.map(function(p, i){
      const n1 = i > 0 ? right(c[i - 1], p) : right(p, c[i + 1] || p), n2 = i < c.length - 1 ? right(p, c[i + 1]) : n1;
      const nx = n1[0] + n2[0], nz = n1[1] + n2[1], L = Math.hypot(nx, nz) || 1, k = off / Math.max(.6, (n1[0] * nx + n1[1] * nz) / L);
      return [p[0] + nx / L * k, p[1] + nz / L * k];
    });
  }
  // curva de Bézier quadrática amostrada (manobras de entrada e saída da doca)
  function bez(a, c, b, n){ const out = []; for(let i = 0; i <= n; i++){ const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return out; }
  (function(){
    const t = mkPath([[0, 0], [0, 0], [3, 4], [3, 10]]), k = laneLine([[0, 0], [0, 10]], 1), b = bez([0, 0], [1, 0], [1, 1], 4);
    console.assert(t.len === 11 && pathAt(t, 5)[1] === 4 && pathAt(t, 8)[1] === 7 && pathAt(t, 99)[1] === 10 && k[0][0] === -1 && k[1][0] === -1 && b[4][1] === 1, 'home-map: polilinha/faixa/curva');
  })();

  // ---------- grade + A* (heap, 8 vizinhos, sem cortar quina) + "puxar barbante" pra suavizar ----------
  function makeGrid(x0, z0, x1, z1, cell){
    const nx = Math.round((x1 - x0) / cell), nz = Math.round((z1 - z0) / cell), blocked = new Uint8Array(nx * nz);
    const G = { x0: x0, z0: z0, nx: nx, nz: nz, cell: cell, blocked: blocked };
    G.ix = function(x){ return Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / cell))); };
    G.iz = function(z){ return Math.max(0, Math.min(nz - 1, Math.floor((z - z0) / cell))); };
    G.cx = function(i){ return x0 + (i + .5) * cell; }; G.cz = function(j){ return z0 + (j + .5) * cell; };
    G.free = function(x, z){ return x >= x0 && x < x1 && z >= z0 && z < z1 && !blocked[G.iz(z) * nx + G.ix(x)]; };
    G.rect = function(ax, az, bx, bz, val){
      for(let j = G.iz(Math.min(az, bz)); j <= G.iz(Math.max(az, bz)); j++) for(let i = G.ix(Math.min(ax, bx)); i <= G.ix(Math.max(ax, bx)); i++) blocked[j * nx + i] = val == null ? 1 : val;
    };
    G.lineFree = function(a, b){
      const n = Math.ceil(dist(a, b) / (cell * .5));
      for(let k = 1; k < n; k++){ const t = k / n; if(!G.free(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; }
      return true;
    };
    G.nearest = function(x, z){ // célula livre mais próxima (busca em anel)
      if(G.free(x, z)) return [x, z];
      const ci = G.ix(x), cj = G.iz(z);
      for(let r = 1; r < 60; r++) for(let j = cj - r; j <= cj + r; j++) for(let i = ci - r; i <= ci + r; i++){
        if(i < 0 || j < 0 || i >= nx || j >= nz || (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r)) continue;
        if(!blocked[j * nx + i]) return [G.cx(i), G.cz(j)];
      }
      return [x, z];
    };
    G.path = function(from, to){
      const a = G.nearest(from[0], from[1]), b = G.nearest(to[0], to[1]);
      const si = G.iz(a[1]) * nx + G.ix(a[0]), ti = G.iz(b[1]) * nx + G.ix(b[0]), N = nx * nz;
      const g = new Float32Array(N).fill(Infinity), f = new Float32Array(N), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap = [];
      const hfn = function(k){ const dx = Math.abs(k % nx - ti % nx), dz = Math.abs(Math.floor(k / nx) - Math.floor(ti / nx)); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
      function push(k){ heap.push(k); let i = heap.length - 1; while(i){ const p = (i - 1) >> 1; if(f[heap[p]] <= f[heap[i]]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
      function pop(){ const top = heap[0], last = heap.pop(); if(heap.length){ heap[0] = last; let i = 0; for(;;){ const l = 2 * i + 1, r = l + 1; let m = i; if(l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if(r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if(m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; }
      g[si] = 0; f[si] = hfn(si); push(si);
      while(heap.length){
        const cur = pop();
        if(cur === ti) break;
        if(closed[cur]) continue; closed[cur] = 1;
        const ci = cur % nx, cj = Math.floor(cur / nx);
        for(let dj = -1; dj <= 1; dj++) for(let di = -1; di <= 1; di++){
          if(!di && !dj) continue;
          const i = ci + di, j = cj + dj; if(i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const k = j * nx + i; if(blocked[k] || closed[k]) continue;
          if(di && dj && (blocked[cj * nx + i] || blocked[j * nx + ci])) continue;
          const ng = g[cur] + (di && dj ? 1.414 : 1);
          if(ng < g[k]){ g[k] = ng; f[k] = ng + hfn(k); par[k] = cur; push(k); }
        }
      }
      if(si !== ti && par[ti] < 0) return null;
      const cellsPath = []; for(let k = ti; k >= 0; k = k === si ? -1 : par[k]) cellsPath.unshift([G.cx(k % nx), G.cz(Math.floor(k / nx))]);
      const raw = [from].concat(cellsPath.slice(1, -1), [to]), out = [raw[0]];
      let i = 0;
      while(i < raw.length - 1){ let j = raw.length - 1; while(j > i + 1 && !G.lineFree(raw[i], raw[j])) j--; out.push(raw[j]); i = j; }
      return out;
    };
    return G;
  }
  (function(){ // teste mínimo: desvia de uma parede e não atravessa célula bloqueada
    const G = makeGrid(0, 0, 10, 10, .5); G.rect(4.6, 0, 5.4, 8);
    const p = G.path([1, 1], [9, 1]), path = p && mkPath(p);
    let ok = !!p; if(ok) for(let s = 0; s <= path.len; s += .2){ const q = pathAt(path, s); if(!G.free(q[0], q[1])) ok = false; }
    console.assert(ok && path.len > 8 && p[p.length - 1][0] === 9, 'home-map: A*');
  })();

  function init(){
    // =====================================================================================
    // CIDADE: 5 x 4 quadras de 10 x 10, ruas de 4,4 (mão dupla). Cada ferramenta numa quadra; as outras viram cidade.
    // =====================================================================================
    const PITCH = 14.4, BLOCK = 10, WALK = .9, STREET = 4.4, D = 3, SLOT = 1.85, LANE = 1.1;
    const COLS = [-28.8, -14.4, 0, 14.4, 28.8], ROWS = [-21.6, -7.2, 7.2, 21.6];
    const SX = [-36, -21.6, -7.2, 7.2, 21.6, 36], SZ = [-28.8, -14.4, 0, 14.4, 28.8];
    const CITY = [
      ['parque', 'visual-editor.html', 'post-editor.html', 'gerador.html', 'obra'],
      ['portaria', 'conecta-fg.html', 'photoshop-actions.html', 'templates.html', 'followers-dashboard.html'],
      ['conteineres', 'intelligence-center.html', 'usage-dashboard.html', 'monitoramento.html', 'armazem'],
      ['obra', 'marcas.html', 'admin-users.html', 'estacionamento', 'parque']];
    const GATE_OUT = [-47, 0], GATE_IN = [-38.5, 0];
    const STAGES = [['Briefing', 'visual-editor.html'], ['Em criação', 'post-editor.html'], ['Em arte', 'gerador.html'],
      ['Publicado', 'followers-dashboard.html'], ['Medindo', 'monitoramento.html']];

    const tools = [], blocks = [];
    CITY.forEach(function(r, ri){ r.forEach(function(kind, ci){
      const bx = COLS[ci], bz = ROWS[ri];
      if(kind.indexOf('.html') < 0){ blocks.push({ kind: kind, x: bx, z: bz }); return; }
      const card = cards.find(function(c){ return c.getAttribute('href') === kind; });
      const flow = STAGES.some(function(s){ return s[1] === kind; });
      blocks.push({ kind: 'tool', x: bx, z: bz });
      if(!card) return;
      tools.push({ id: kind, card: card, x: bx, z: bz, w: flow ? 5.4 : 4.2, flow: flow, facing: 1,
        name: card.querySelector('strong').textContent.replace(/\s+/g, ' ').trim(), tag: card.querySelector('.tool-tag').textContent,
        desc: (card.querySelector('small') || {}).textContent || '', docks: [], people: 0, hits: 3 + Math.floor(Math.random() * 10) });
    }); });
    const toolById = function(id){ return tools.find(function(t){ return t.id === id; }); };
    const stageIdx = function(tool){ return STAGES.findIndex(function(s){ return s[1] === tool.id; }); };

    // =====================================================================================
    // CENA BASE (materiais pelo tema do portal)
    // =====================================================================================
    const cs = getComputedStyle(document.documentElement);
    const col = function(name){ return new THREE.Color(cs.getPropertyValue(name).trim()); };
    const cardC = col('--card'), dark = cardC.r + cardC.g + cardC.b < 1.2, W1 = new THREE.Color('#ffffff');
    // o chão é a própria cor de fundo da página: a cidade parece desenhada no fundo da Início
    const C = { ground: col('--bg'), lot: cardC, walk: col('--surface-muted'), curb: col('--border-strong'),
      road: dark ? col('--border') : col('--border-strong').lerp(new THREE.Color('#9a9a98'), .25), line: dark ? col('--muted') : W1.clone(),
      // no escuro, galpão mais claro que o chão pra não sumir
      wall: dark ? col('--border-strong').lerp(W1, .3) : cardC, trim2: col('--muted'), vent: col('--border-strong'), accent: col('--accent'), ink: dark ? col('--bg') : col('--text'),
      late: new THREE.Color('#ef6b5b'),
      roofDark: dark ? col('--border-strong').lerp(W1, .18) : col('--text').lerp(W1, .16),
      glass: new THREE.Color(dark ? '#56616e' : '#3a4350'), wood: new THREE.Color(dark ? '#8a6a48' : '#c49a6c'),
      // ilustração (vegetação, terra, caixas, lâmpada) não tem variável no tema: tom claro/escuro fixo
      grass: new THREE.Color(dark ? '#24402c' : '#cfe8c9'), leaf: new THREE.Color(dark ? '#3f7a52' : '#8fcf98'), trunk: new THREE.Color(dark ? '#5b4a3a' : '#b89a7a'),
      box: new THREE.Color(dark ? '#a8794a' : '#dcae74'), sand: new THREE.Color(dark ? '#8c7a55' : '#e2cf9f'), lamp: new THREE.Color('#fff1c2'), water: new THREE.Color(dark ? '#3c5f78' : '#a9cfe6') };
    const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
    let leve = small;
    try{ const l = localStorage.getItem(LIGHT_KEY); if(l) leve = l === '1'; }catch(e){}

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    // modo escuro = noite: céu azulado, lua no lugar do sol; janelas, postes e faróis acendem
    const GLOW = new THREE.Color('#ffd98a'), RED = new THREE.Color('#ff3b30');
    function glow(mesh, color){ mesh.material.color.copy(color); mesh.material.emissive = color.clone(); return mesh; }
    scene.add(new THREE.HemisphereLight(dark ? 0x93a8e6 : 0xffffff, dark ? C.walk : C.ground, dark ? 1.05 : .62));
    // o sol acompanha a câmera: sombra nítida perto de onde se está olhando, mesmo numa cidade grande
    const sun = new THREE.DirectionalLight(dark ? 0xb4c6ff : 0xffffff, dark ? .65 : .55);
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 }); sun.shadow.bias = -.0006;
    scene.add(sun, sun.target);

    function box(w, hh, d, color, x, y, z, parent){
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), new THREE.MeshLambertMaterial({ color: color }));
      mesh.position.set(x || 0, y || 0, z || 0); mesh.castShadow = mesh.receiveShadow = true;
      (parent || scene).add(mesh); return mesh;
    }
    function cyl(r, hh, color, x, y, z, parent, rotZ){
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 14), new THREE.MeshLambertMaterial({ color: color }));
      mesh.position.set(x, y, z); if(rotZ) mesh.rotation.z = Math.PI / 2; mesh.castShadow = true;
      (parent || scene).add(mesh); return mesh;
    }

    // ---------- kit de modelagem dos galpões (chapa ondulada, docas, paletes, porta-paletes, janelas, emblema) ----------
    // chapa ondulada: textura em tons de cinza multiplicada pela cor do material (parede, telhado, porta de enrolar)
    const RIB = (function(){ const cv = document.createElement('canvas'); cv.width = 32; cv.height = 4; const x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 32, 4); x.fillStyle = 'rgba(0,0,0,.13)'; x.fillRect(21, 0, 7, 4); x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(19, 0, 2, 4); return cv; })();
    // caixa de papelão com fita
    const CARTON = (function(){ const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(0,0,0,.26)'; x.fillRect(0, 0, 64, 3); x.fillRect(0, 0, 3, 64);
      x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(28, 0, 9, 64); return cv; })();
    function glowTex(grad, w, hh){ const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; const x = cv.getContext('2d'); grad(x); return new THREE.CanvasTexture(cv); }
    function tex(cv, rx, ry, rot){ const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; if(rot){ t.center.set(.5, .5); t.rotation = rot; } return t; }
    const GEO = {};
    function geoBox(w, hh, d){ const k = w + '|' + hh + '|' + d; return GEO[k] || (GEO[k] = new THREE.BoxGeometry(w, hh, d)); }
    const accentHex = '#' + C.accent.getHexString(), onAccentHex = cs.getPropertyValue('--on-accent').trim() || '#1a1a1a';
    // emblema do telhado: ícone da própria ferramenta (o SVG do card) num disco nas cores do portal
    function badgeTex(t){
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const x = cv.getContext('2d'), tx = new THREE.CanvasTexture(cv);
      function base(){ x.fillStyle = t.flow ? '#141414' : accentHex; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
        x.lineWidth = 9; x.strokeStyle = '#ffffff'; x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.stroke(); tx.needsUpdate = true; }
      base();
      const svg = t.card && t.card.querySelector('.tool-icon svg');
      if(svg){
        let s = svg.outerHTML.replace(/currentColor/g, t.flow ? accentHex : onAccentHex).replace(/width="\d+"/, 'width="132"').replace(/height="\d+"/, 'height="132"');
        if(s.indexOf('xmlns=') < 0) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        const img = new Image();
        img.onload = function(){ x.drawImage(img, 62, 62, 132, 132); try{ x.getImageData(0, 0, 1, 1); }catch(e){ base(); } tx.needsUpdate = true; };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      }
      tx.anisotropy = 4; return tx;
    }
    function signTex(text){
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const x = cv.getContext('2d');
      x.fillStyle = accentHex; x.fillRect(0, 0, 512, 160); x.fillStyle = onAccentHex; x.font = '800 84px "Plus Jakarta Sans", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 86);
      const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
    }
    // cada galpão tem materiais próprios (o esmaecimento de busca/permissão mexe na opacidade só dele)
    function makeKit(t){
      const g = new THREE.Group(), mats = [], trim = t.flow ? C.accent : C.trim2, roof = t.flow ? C.accent : C.roofDark;
      function mat(color, map, side, lit){ const m = new THREE.MeshLambertMaterial({ color: color, map: map || null, transparent: true, side: side || THREE.FrontSide }); if(lit && dark){ m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = map; m.emissiveIntensity = .75; } mats.push(m); return m; }
      function add(geo, m, x, y, z){ const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = o.receiveShadow = true; g.add(o); return o; }
      const K = { g: g, mats: mats, roof: roof, top: 0, docks: [] };
      const up = function(y){ K.top = Math.max(K.top, y); };
      K.box = function(w, hh, d, color, x, y, z){ return add(geoBox(w, hh, d), mat(color), x, y, z); };
      K.cyl = function(r1, r2, hh, color, x, y, z, seg){ return add(new THREE.CylinderGeometry(r1, r2, hh, seg || 18), mat(color), x, y, z); };
      // volume com parede em chapa ondulada, faixa de cor no beiral e rodapé
      K.body = function(w, hh, d, x, z, color){
        add(geoBox(w, hh, d), mat(color || C.wall, tex(RIB, w * 3, 1)), x, hh / 2, z);
        K.box(w + .03, .1, d + .03, trim, x, hh - .05, z); K.box(w + .02, .07, d + .02, trim, x, .035, z); up(hh);
      };
      K.tube = function(r, hh, x, z, color){ add(new THREE.CylinderGeometry(r, r, hh, 22), mat(color || C.wall, tex(RIB, 9, 1)), x, hh / 2, z); up(hh); };
      // telhado de duas águas em chapa ondulada (cumeeira no eixo x) + oitões
      K.gable = function(w, d, hh, rise, x, z, color){
        const run = d / 2 + .15, L = Math.hypot(run, rise), ang = Math.atan2(rise, run), m = mat(color || roof, tex(RIB, (w + .2) * 3, 1));
        [1, -1].forEach(function(s){ const o = add(geoBox(w + .2, .07, L), m, x, hh + rise / 2, z + s * run / 2); o.rotation.x = s * ang; });
        K.box(w + .24, .09, .14, trim, x, hh + rise + .02, z);
        const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, rise); sh.closePath();
        const tri = new THREE.ShapeGeometry(sh), wm = mat(C.wall, null, THREE.DoubleSide);
        [-1, 1].forEach(function(s){ const o = add(tri, wm, x + s * w / 2, hh, z); o.rotation.y = Math.PI / 2; });
        up(hh + rise);
        // emblema deitado na água voltada pra câmera
        K.badgeSlope = function(bx){ K.badge(bx, hh + rise / 2 + .07, z + run / 2, ang, .48); };
      };
      // telhado em arco (abóbada) + tampas
      K.arch = function(w, d, hh, rise, x, z, color){
        const r = d / 2 + .12, o = add(new THREE.CylinderGeometry(r, r, w + .2, 28, 1, true, 0, Math.PI), mat(color || roof, tex(RIB, 12, 1), THREE.DoubleSide), x, hh, z);
        o.rotation.z = Math.PI / 2; o.scale.x = rise / r;
        const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, Math.PI, false); sh.closePath();
        const cap = new THREE.ShapeGeometry(sh, 16), wm = mat(C.wall, null, THREE.DoubleSide);
        [-1, 1].forEach(function(s){ const c = add(cap, wm, x + s * (w + .2) / 2, hh, z); c.rotation.y = Math.PI / 2; c.scale.y = rise / r; });
        up(hh + rise);
      };
      // telhado dente-de-serra (ateliê): águas inclinadas + vidro vertical voltado pra frente
      K.saw = function(w, d, hh, n, rise, x, z){
        const step = d / n, L = Math.hypot(step, rise), ang = Math.atan2(rise, step), m = mat(roof, tex(RIB, w * 3, 1)), gm = mat(C.glass), wm = mat(C.wall, null, THREE.DoubleSide);
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(step, 0); sh.lineTo(step, rise); sh.closePath();
        const tri = new THREE.ShapeGeometry(sh);
        for(let i = 0; i < n; i++){
          const z0 = z - d / 2 + i * step;
          const o = add(geoBox(w, .06, L), m, x, hh + rise / 2, z0 + step / 2); o.rotation.x = -ang;
          add(geoBox(w - .1, rise - .05, .03), gm, x, hh + rise / 2 - .02, z0 + step);
          [-1, 1].forEach(function(s){ const c = add(tri, wm, x + s * w / 2, hh, z0); c.rotation.y = -Math.PI / 2; });
        }
        up(hh + rise);
      };
      // laje plana com platibanda
      K.flat = function(w, d, hh, x, z, color){
        K.box(w, .05, d, color || C.roofDark, x, hh + .025, z);
        [[w + .1, .06, 0, d / 2 + .02], [w + .1, .06, 0, -d / 2 - .02], [.06, d, w / 2 + .02, 0], [.06, d, -w / 2 - .02, 0]].forEach(function(p){ K.box(p[0], .18, p[1], C.wall, x + p[2], hh + .09, z + p[3]); });
        up(hh + .18);
      };
      // porta de doca: batente na cor da faixa, vão escuro, porta de enrolar. Cada porta é uma doca de caminhão.
      K.door = function(x, zf, open){
        K.box(.86, 1.06, .06, trim, x, .53, zf + .02);
        K.box(.7, .92, .04, C.ink, x, .46, zf + .045);
        add(geoBox(.7, open ? .3 : .9, .05), mat(C.wall, tex(RIB, 2.4, 1, Math.PI / 2)), x, open ? .77 : .46, zf + .06);
        K.docks.push({ x: x, zf: zf });
      };
      // marquise das docas: alta o bastante pro baú passar por baixo
      K.canopy = function(w, x, zf, y){ K.box(w, .05, .36, C.roofDark, x, y || 1.66, zf + .18); K.box(w, .08, .03, trim, x, (y || 1.66) - .01, zf + .37); if(dark) glow(K.box(w * .9, .02, .1, C.glass, x, (y || 1.66) - .04, zf + .24), GLOW); };
      // palete de madeira + pilha de caixas
      K.stack = function(x, z, s, hh, y0){
        K.box(s + .04, .07, s + .04, C.wood, x, y0 + .035, z);
        add(geoBox(s, hh, s), mat(C.box, tex(CARTON, Math.max(1, Math.round(s / .22)), Math.max(1, Math.round(hh / .2)))), x, y0 + .07 + hh / 2, z);
      };
      // porta-paletes: colunas escuras, prateleiras amarelas, pilhas em quase todas as posições
      K.rack = function(x, z, len, levels, alongZ){
        const n = Math.max(2, Math.round(len / .62)), H = levels * .55 + .45, dx = alongZ ? 0 : 1, dz = alongZ ? 1 : 0;
        for(let i = 0; i <= n; i++){ const o = -len / 2 + i * len / n; [-.24, .24].forEach(function(e){ K.box(.05, H, .05, C.ink, x + dx * o + dz * e, H / 2, z + dz * o + dx * e); }); }
        for(let l = 0; l <= levels; l++){
          if(l) K.box(alongZ ? .52 : len, .04, alongZ ? len : .52, C.accent, x, l * .55, z);
          for(let i = 0; i < n; i++){ const o = -len / 2 + (i + .5) * len / n; if((i + l) % 3 !== 2) K.stack(x + dx * o, z + dz * o, .38, .3, l * .55 + .02); }
        }
        up(H);
      };
      K.hvac = function(x, y, z){ K.box(.5, .22, .4, C.vent, x, y + .11, z); K.cyl(.13, .13, .03, C.ink, x - .1, y + .235, z); };
      // faixas de vidro: f = frente, b = fundos, l/r = laterais
      // à noite a maioria das janelas está acesa (algumas apagadas)
      const pane = function(a, b, c, x, y, z){ const o = K.box(a, b, c, C.glass, x, y, z); if(dark && Math.random() < .8) glow(o, GLOW); };
      K.windows = function(w, d, x, z, ys, faces){
        ys.forEach(function(y){
          if(faces.indexOf('f') >= 0) pane(w * .78, .26, .03, x, y, z + d / 2 + .015);
          if(faces.indexOf('b') >= 0) pane(w * .78, .26, .03, x, y, z - d / 2 - .015);
          if(faces.indexOf('l') >= 0) pane(.03, .26, d * .7, x - w / 2 - .015, y, z);
          if(faces.indexOf('r') >= 0) pane(.03, .26, d * .7, x + w / 2 + .015, y, z);
        });
      };
      K.badge = function(x, y, z, tilt, r){
        const o = add(new THREE.CylinderGeometry(r || .45, r || .45, .05, 40), [mat(C.wall), mat(new THREE.Color(1, 1, 1), badgeTex(t), null, true), mat(C.wall)], x, y, z);
        o.rotation.x = tilt || 0; up(y + .05); return o;
      };
      K.chimney = function(x, z, hh){ K.cyl(.14, .19, hh, C.ink, x, hh / 2, z); K.cyl(.2, .2, .14, C.accent, x, hh - .3, z); up(hh); };
      K.silo = function(x, z, r, hh){ K.tube(r, hh, x, z); K.cyl(r * .18, r + .03, r * .6, roof, x, hh + r * .3, z, 22); [.35, .72].forEach(function(f){ K.cyl(r + .025, r + .025, .06, trim, x, hh * f, z, 22); }); up(hh + r * .6); };
      K.mast = function(x, y, z, hh){
        const m = mat(C.ink); m.wireframe = true; add(new THREE.CylinderGeometry(.04, .17, hh, 4, 6), m, x, y + hh / 2, z);
        add(new THREE.SphereGeometry(.08, 12, 8), mat(C.accent), x, y + hh + .06, z); up(y + hh);
      };
      K.dish = function(x, y, z, rotY){
        K.cyl(.03, .03, .32, C.ink, x, y + .16, z);
        const o = add(new THREE.SphereGeometry(.34, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), mat(C.wall, null, THREE.DoubleSide), x, y + .4, z);
        o.rotation.set(-1.05, rotY || 0, 0, 'YXZ');
      };
      K.flag = function(x, z, color){ K.cyl(.02, .02, 1.6, C.ink, x, .8, z); K.box(.44, .26, .015, color, x + .23, 1.42, z); up(1.6); };
      K.sign = function(text, w, hh, x, y, z, rotY){
        const m = mat(new THREE.Color(1, 1, 1), signTex(text), null, true), f = mat(C.ink);
        const o = add(geoBox(w, hh, .06), [f, f, f, f, m, f], x, y, z); o.rotation.y = rotY || 0;
        [-w / 3, w / 3].forEach(function(px){ K.box(.05, y - hh / 2, .05, C.ink, x + Math.cos(rotY || 0) * px, (y - hh / 2) / 2, z - Math.sin(rotY || 0) * px); });
        up(y + hh / 2);
      };
      K.cctv = function(x, z){ K.cyl(.03, .03, 1.6, C.ink, x, .8, z); const c = K.box(.14, .1, .26, C.wall, x, 1.62, z + .08); c.rotation.x = .35; };
      K.conveyor = function(x, z, len){
        K.box(.36, .06, len, C.ink, x, .42, z);
        [-1, 1].forEach(function(s){ K.box(.04, .4, .04, C.ink, x - .14, .2, z + s * (len / 2 - .12)); K.box(.04, .4, .04, C.ink, x + .14, .2, z + s * (len / 2 - .12)); });
        for(let i = 0; i < Math.floor(len / .6); i++) add(geoBox(.24, .18, .24), mat(C.box, tex(CARTON, 1, 1)), x, .54, z - len / 2 + .35 + i * .6);
      };
      return K;
    }

    // uma estrutura por ferramenta, ligada ao que ela faz. Frente (+z local) = docas, voltada pra rua.
    const MODELS = {
      'visual-editor.html': function(K){ // Calendário: armazém de duas águas + escritório de planejamento anexo
        K.body(4, 1.8, 3, .7, 0); K.gable(4, 3, 1.8, .75, .7, 0); K.badgeSlope(.7);
        [-.6, .7, 2].forEach(function(x, i){ K.door(x, 1.5, i !== 1); }); K.canopy(4, .7, 1.5);
        K.windows(4, 3, .7, 0, [1.3], 'br');
        K.body(1.3, 1.25, 2.4, -2.05, .3); K.flat(1.3, 2.4, 1.25, -2.05, .3); K.windows(1.3, 2.4, -2.05, .3, [.85], 'flb');
        K.box(.4, .7, .03, C.glass, -2.05, .35, 1.515);
      },
      'post-editor.html': function(K){ // Editor de Posts: ateliê de criação com telhado dente-de-serra
        K.body(5.4, 1.85, 3, 0, 0); K.saw(5.4, 3, 1.85, 4, .6, 0, 0);
        [-1.6, 0, 1.6].forEach(function(x, i){ K.door(x, 1.5, i !== 1); }); K.canopy(5.4, 0, 1.5);
        K.windows(5.4, 3, 0, 0, [1.2], 'lrb');
        K.box(1, .3, 1, C.wall, 2.1, 2.6, -.9); K.badge(2.1, 2.78, -.9, 0, .42);
      },
      'gerador.html': function(K){ // Gerador: fábrica gráfica com abóbada e chaminés
        K.body(5.4, 1.85, 3, 0, 0); K.arch(5.4, 3, 1.85, .85, 0, 0);
        K.chimney(-2.35, -1.05, 3.4); K.chimney(-1.75, -1.05, 3);
        [-1.35, 0, 1.35].forEach(function(x, i){ K.door(x, 1.5, i !== 1); }); K.canopy(5.4, 0, 1.5);
        K.windows(5.4, 3, 0, 0, [1.3], 'rb');
        K.badge(1.1, 2.75, 0, 0, .45);
      },
      'followers-dashboard.html': function(K){ // Redes sociais: estúdio de transmissão com torre e parabólicas
        K.body(5.4, 1.85, 3, 0, 0); K.flat(5.4, 3, 1.85, 0, 0, K.roof);
        K.mast(1.9, 1.9, -.6, 2.3); K.dish(-1.9, 1.9, -.6, .7); K.dish(-1, 1.9, -.8, -.2); K.hvac(.5, 1.9, -.9);
        [-1.35, 0, 1.35].forEach(function(x, i){ K.door(x, 1.5, i !== 1); }); K.canopy(5.4, 0, 1.5);
        K.windows(5.4, 3, 0, 0, [1.25], 'rb');
        K.badge(-.2, 1.93, .55, 0, .42);
      },
      'monitoramento.html': function(K){ // Monitoramento: galpão + torre de controle com radar
        K.body(4.2, 1.85, 3, -.6, 0); K.gable(4.2, 3, 1.85, .6, -.6, 0); K.badgeSlope(-.6);
        K.tube(.32, 2.6, 2.15, -.6); K.cyl(.55, .5, .5, C.glass, 2.15, 2.85, -.6, 22); K.cyl(.62, .62, .08, K.roof, 2.15, 3.14, -.6, 22);
        K.box(.95, .05, .12, C.ink, 2.15, 3.3, -.6); K.cyl(.03, .03, .14, C.ink, 2.15, 3.22, -.6);
        [-1.9, -.6, .7].forEach(function(x, i){ K.door(x, 1.5, i !== 1); }); K.canopy(4.2, -.6, 1.5);
        K.windows(4.2, 3, -.6, 0, [1.25], 'b');
      },
      'conecta-fg.html': function(K){ // Conecta FG: redação do blog, escritório de 2 andares com letreiro
        K.body(4.2, 2.3, 2.6, 0, -.2); K.flat(4.2, 2.6, 2.3, 0, -.2);
        K.windows(4.2, 2.6, 0, -.2, [1.85], 'f'); K.windows(4.2, 2.6, 0, -.2, [.75, 1.65], 'lrb');
        K.box(.7, .85, .03, C.glass, -.2, .43, 1.115); K.canopy(1.1, -.2, 1.1, 1.05);
        K.door(-1.4, 1.1, true); K.door(1.2, 1.1, false);
        K.sign('BLOG', 1.8, .5, 0, 2.88, -.2, 0);
      },
      'photoshop-actions.html': function(K){ // Ações do Photoshop: linha de automação, fábrica baixa com HVAC e esteira
        K.body(4.2, 1.85, 3, 0, 0); K.flat(4.2, 3, 1.85, 0, 0);
        [[-1.4, -.8], [-.5, -.8], [.4, -.8], [-1.4, .3]].forEach(function(p){ K.hvac(p[0], 1.9, p[1]); });
        K.badge(.95, 1.95, .4, 0, .42);
        K.door(-1, 1.5, true); K.door(1, 1.5, false); K.canopy(4.2, 0, 1.5);
        K.conveyor(2.35, 0, 2.6); K.windows(4.2, 3, 0, 0, [1.2], 'lb');
      },
      'templates.html': function(K){ // Templates: depósito de referência com porta-paletes externo
        K.body(3.4, 1.85, 3, .4, 0); K.gable(3.4, 3, 1.85, .6, .4, 0); K.badgeSlope(.4);
        K.rack(-1.68, 0, 2.8, 2, true);
        K.door(-.4, 1.5, true); K.door(1.2, 1.5, false); K.canopy(3.4, .4, 1.5);
        K.windows(3.4, 3, .4, 0, [1.25], 'rb');
      },
      'intelligence-center.html': function(K){ // Central de Inteligência: sede envidraçada
        K.box(3.8, 2.7, 2.6, C.glass, 0, 1.35, .1);
        [.9, 1.8].forEach(function(y){ K.box(3.86, .09, 2.66, C.wall, 0, y, .1); });
        for(let i = -3; i <= 3; i++) [1.42, -1.22].forEach(function(z){ K.box(.06, 2.7, .05, C.wall, i * .6, 1.35, z); });
        for(let j = -2; j <= 2; j++) [-1.93, 1.93].forEach(function(x){ K.box(.05, 2.7, .06, C.wall, x, 1.35, .1 + j * .5); });
        K.box(3.86, .08, 2.66, C.accent, 0, .04, .1); K.flat(3.8, 2.6, 2.7, 0, .1);
        K.box(1, .4, .8, C.wall, 1.1, 2.95, -.4); K.mast(-1.3, 2.75, -.5, 1.1); K.badge(-.1, 2.8, .4, 0, .48);
        K.door(-1.35, 1.4, false); K.door(1.35, 1.4, false); K.canopy(.9, 0, 1.4, 1);
      },
      'usage-dashboard.html': function(K){ // Métricas de performance: silos de dados com passarela
        K.body(4.2, 1.85, 2, 0, .5); K.flat(4.2, 2, 1.85, 0, .5);
        [-1.3, 0, 1.3].forEach(function(x){ K.silo(x, -.95, .42, 2.5); });
        K.box(3.1, .05, .22, C.ink, 0, 2.55, -.95); K.box(3.1, .18, .02, C.ink, 0, 2.66, -1.06);
        K.door(-1, 1.5, true); K.door(1, 1.5, false); K.canopy(4.2, 0, 1.5); K.windows(4.2, 2, 0, .5, [1.25], 'lr');
        K.badge(.9, 1.93, .5, 0, .42);
      },
      'marcas.html': function(K){ // Marcas: showroom com vitrine lateral, painel e bandeiras
        K.body(4.2, 1.85, 3, 0, 0); K.flat(4.2, 3, 1.85, 0, 0);
        K.box(.03, 1.1, 2.4, C.glass, 2.115, .75, 0); [-.8, 0, .8].forEach(function(z){ K.box(.05, 1.1, .05, C.wall, 2.13, .75, z); });
        K.sign('MARCAS', 2.6, .75, 0, 2.5, -.3, 0);
        K.flag(-2.45, 1.9, C.accent); K.flag(-2.45, 1.2, C.ink); K.flag(-2.45, .5, C.wall);
        K.door(-1, 1.5, true); K.door(1, 1.5, false); K.canopy(4.2, 0, 1.5); K.windows(4.2, 3, 0, 0, [1.25], 'b');
        K.badge(1.5, 1.93, -.8, 0, .4);
      },
      'admin-users.html': function(K){ // Usuários e acessos: prédio administrativo, guarita e câmeras
        K.body(3.2, 1.9, 2.6, -.5, .2); K.flat(3.2, 2.6, 1.9, -.5, .2);
        K.windows(3.2, 2.6, -.5, .2, [.8, 1.45], 'lb'); K.windows(3.2, 2.6, -.5, .2, [1.45], 'f');
        K.box(.6, .85, .03, C.glass, -.5, .43, 1.515); K.canopy(.8, -.5, 1.5, 1.05);
        K.door(-1.6, 1.5, false); K.door(.6, 1.5, true);
        K.body(.8, .9, .8, 1.55, -.7); K.box(1, .07, 1, C.accent, 1.55, .94, -.7); K.box(.03, .3, .5, C.glass, 1.15, .6, -.7);
        K.cctv(1.9, 1.1); K.cctv(-2.15, -1.1); K.badge(-.5, 2, .2, 0, .45);
      }
    };

    // ---------- peças repetidas da cidade (instancing): lajes/faixas, objetos, postes, cones, copas, caixas ----------
    const DEC = { slab: [], prop: [], pole: [], cone: [], crown: [], carton: [], pool: [], bulb: [] };
    // item: [x, y, z, sx, sy, sz, cor, giro]
    function slab(x, z, w, d, y, color){ DEC.slab.push([x, y, z, w, .02, d, color]); }
    function prop(x, y, z, w, hh, d, color, rot){ DEC.prop.push([x, y + hh / 2, z, w, hh, d, color, rot || 0]); }
    function tree(x, z, s){ s = s || 1; DEC.pole.push([x, .3 * s, z, .14 * s, .6 * s, .14 * s, C.trunk]); DEC.crown.push([x, (.95 + Math.random() * .15) * s, z, .95 * s, (.95 + Math.random() * .2) * s, .95 * s, C.leaf]); }
    function lamp(x, z, rot){ // poste de luz com braço voltado pra rua
      DEC.pole.push([x, 1.25, z, .07, 2.5, .07, C.ink]);
      const ax = Math.sin(rot), az = Math.cos(rot);
      DEC.prop.push([x + ax * .35, 2.47, z + az * .35, .05, .05, .7, C.ink, rot]);
      (dark ? DEC.bulb : DEC.prop).push([x + ax * .68, 2.43, z + az * .68, .2, .07, .32, C.lamp, rot]);
      if(dark) DEC.pool.push([x + ax * .9, .15, z + az * .9, 5.4, 1, 5.4, C.lamp, 0]);
    }
    function crate(x, z, n){ for(let i = 0; i < n; i++) DEC.carton.push([x + (i % 2) * .48 - .24, .37 + Math.floor(i / 4) * .46, z + (Math.floor(i / 2) % 2) * .48 - .24, .44, .44, .44, null, 0]); }
    function car(x, z, rot, color){ const ax = Math.sin(rot), az = Math.cos(rot);
      prop(x, .12, z, .78, .32, 1.6, color, rot); prop(x - ax * .12, .44, z - az * .12, .7, .28, .85, C.glass, rot);
      [[-.4, .5], [.4, .5], [-.4, -.5], [.4, -.5]].forEach(function(w){ DEC.pole.push([x + w[0] * az + w[1] * ax, .14, z - w[0] * ax + w[1] * az, .26, .12, .26, C.ink]); }); }
    function cone(x, z){ DEC.cone.push([x, .36, z, .2, .44, .2, C.late]); }
    // cenário em tons neutros: o amarelo fica só pro que é clicável (galpões e caminhões)
    const CARS = [C.wall, C.roofDark, C.trim2, C.glass, C.curb];

    // ruas, calçadas com meio-fio, faixas tracejadas, faixas de pedestre
    const cityX0 = SX[0] - STREET / 2, cityX1 = SX[SX.length - 1] + STREET / 2, cityZ0 = SZ[0] - STREET / 2, cityZ1 = SZ[SZ.length - 1] + STREET / 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 180), new THREE.MeshLambertMaterial({ color: C.ground }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.06; ground.receiveShadow = true; scene.add(ground);
    SX.forEach(function(x){ slab(x, 0, STREET, cityZ1 - cityZ0, .0, C.road); });
    SZ.forEach(function(z){ slab(0, z, cityX1 - cityX0, STREET, .001, C.road); });
    slab((GATE_OUT[0] - 3 + cityX0) / 2, 0, cityX0 - GATE_OUT[0] + 3, STREET, .002, C.road); // avenida de entrada (portaria)
    SX.forEach(function(x){ for(let z = cityZ0 + 1; z < cityZ1 - 1; z += 1.8) if(SZ.every(function(sz){ return Math.abs(z - sz) > STREET / 2 + .6; })) slab(x, z, .1, .8, .03, C.line); });
    SZ.forEach(function(z){ for(let x = cityX0 + 1; x < cityX1 - 1; x += 1.8) if(SX.every(function(sx){ return Math.abs(x - sx) > STREET / 2 + .6; })) slab(x, z, .8, .1, .03, C.line); });
    for(let x = GATE_OUT[0]; x < cityX0 - 1; x += 1.8) slab(x, 0, .8, .1, .03, C.line);
    SX.forEach(function(x){ SZ.forEach(function(z){ // faixas de pedestre nas 4 bocas do cruzamento
      for(let k = -2; k <= 2; k++){
        if(z > cityZ0 + 1) slab(x + k * .55, z - STREET / 2 - .7, .3, 1.1, .03, C.line);
        if(z < cityZ1 - 1) slab(x + k * .55, z + STREET / 2 + .7, .3, 1.1, .03, C.line);
        if(x > cityX0 + 1) slab(x - STREET / 2 - .7, z + k * .55, 1.1, .3, .03, C.line);
        if(x < cityX1 - 1) slab(x + STREET / 2 + .7, z + k * .55, 1.1, .3, .03, C.line);
      }
    }); });
    const HB = BLOCK / 2, IN = HB - WALK;
    blocks.forEach(function(b){
      prop(b.x, 0, b.z, BLOCK, .12, BLOCK, C.walk);                  // calçada (meio-fio levantado)
      DEC.slab.push([b.x, .13, b.z, BLOCK - 2 * WALK, .02, BLOCK - 2 * WALK, b.kind === 'parque' ? C.grass : C.lot]);
      // postes nas 4 esquinas, árvores na calçada (menos na frente das docas)
      [[-1, -1], [1, 1]].forEach(function(c){ lamp(b.x + c[0] * (HB - .35), b.z + c[1] * (HB - .35), Math.atan2(c[0], c[1])); });
      tree(b.x - HB + .45, b.z, .85); tree(b.x + HB - .45, b.z, .85); tree(b.x, b.z - HB + .45, .85); if(b.kind !== 'tool') tree(b.x, b.z + HB - .45, .85);
    });
    // quadras que não são ferramenta: cada uma vira um pedaço da cidade
    const labels = document.getElementById('hmLabels');
    const cranes = [];
    blocks.forEach(function(b, bi){
      const x = b.x, z = b.z;
      if(b.kind === 'parque'){
        DEC.slab.push([x, .14, z, 1.2, .02, IN * 2, C.walk]); DEC.slab.push([x, .14, z, IN * 2, .02, 1.2, C.walk]);
        prop(x, .12, z, 2.2, .3, 2.2, C.curb); DEC.slab.push([x, .43, z, 1.9, .02, 1.9, C.water]); DEC.pole.push([x, .7, z, .14, .6, .14, C.wall]);
        [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6], [-1.4, -3.2], [3.2, 1.2], [-3.3, .9], [1.3, 3.3]].forEach(function(p){ tree(x + p[0], z + p[1], 1.15); });
        [[-1.7, 0, 0], [1.7, 0, 0], [0, -1.7, Math.PI / 2], [0, 1.7, Math.PI / 2]].forEach(function(p){ prop(x + p[0], .12, z + p[1], .3, .22, .9, C.wood, p[2]); });
      } else if(b.kind === 'obra'){
        // tapume listrado, esqueleto de prédio, grua, areia, cones, escavadeira
        for(let i = -4; i < 4; i++){ const c = i % 2 ? C.wall : C.curb; prop(x + i + .5, .12, z - IN + .05, 1, .7, .06, c); prop(x + i + .5, .12, z + IN - .05, 1, .7, .06, c); prop(x - IN + .05, .12, z + i + .5, .06, .7, 1, c); prop(x + IN - .05, .12, z + i + .5, .06, .7, 1, c); }
        for(let fl = 0; fl < 3; fl++){
          [-1.6, 0, 1.6].forEach(function(cx){ [-1.2, 1.2].forEach(function(cz){ prop(x - 1 + cx, .12 + fl * 1.1, z - 1 + cz, .16, 1.1, .16, C.curb); }); });
          if(fl < 2) prop(x - 1, .12 + (fl + 1) * 1.1, z - 1, 3.6, .1, 2.8, C.wall);
        }
        DEC.cone.push([x + 2.3, .55, z + 2.4, 1.3, .9, 1.3, C.sand]); DEC.cone.push([x + 1.3, .45, z + 2.9, .9, .7, .9, C.sand]);
        [[1, 3.6], [-.4, 3.6], [-1.8, 3.6]].forEach(function(p){ cone(x + p[0], z + p[1]); });
        prop(x + 2.6, .12, z - 1.6, 1.2, .5, .8, C.trim2); prop(x + 2.6, .62, z - 1.75, .6, .45, .5, C.trim2); prop(x + 1.7, .7, z - 1.6, 1.3, .12, .16, C.ink, .4);
        crate(x - 2.9, z + 2.6, 6);
        cranes.push([x - 3, z + 1.2, bi]);
      } else if(b.kind === 'conteineres'){
        const CC = [C.trim2, C.roofDark, C.curb, C.wall];
        for(let r = 0; r < 3; r++) for(let c = 0; c < 2; c++) for(let l = 0; l < (r + c) % 3 + 1; l++)
          prop(x - 1.6 + c * 3.2, .12 + l * 1.02, z - 2.6 + r * 2.4, 2.8, 1, 1.1, CC[(r * 2 + c + l) % 4]);
        crate(x + 3.3, z + 3.2, 8);
      } else if(b.kind === 'armazem'){
        const K = makeKit({ flow: false, facing: 1, card: null });
        K.body(6.4, 2.2, 4.2, 0, 0); K.gable(6.4, 4.2, 2.2, .9, 0, 0); [-2, 0, 2].forEach(function(dx, i){ K.door(dx, 2.1, i === 1); }); K.canopy(6.4, 0, 2.1, 1.75);
        K.g.position.set(x, .12, z - 1.4); scene.add(K.g);
        crate(x - 3.3, z + 3, 8); crate(x + 3.3, z + 3, 6); crate(x + 3.4, z - 3.6, 4);
      } else if(b.kind === 'estacionamento' || b.kind === 'portaria'){
        DEC.slab.push([x, .14, z, IN * 2, .02, IN * 2, C.road]);
        for(let i = -3; i <= 3; i++){ slab(x + i * 1.15 + .55, z - 1.6, .06, 2.4, .16, C.line); slab(x + i * 1.15 + .55, z + 2, .06, 2.4, .16, C.line); }
        for(let i = -3; i < 3; i++){
          if(Math.random() < .75) car(x + i * 1.15 + 1.1, z - 1.6, 0, CARS[(i + 3 + bi) % CARS.length]);
          if(b.kind === 'estacionamento' && Math.random() < .7) car(x + i * 1.15 + 1.1, z + 2, Math.PI, CARS[(i + 7) % CARS.length]);
        }
      }
    });
    // portaria: guarita e cancela na avenida de entrada da cidade
    const gate = { kind: 'g', g: new THREE.Group(), name: 'Portaria' };
    gate.g.position.set(-41.5, 0, -STREET / 2 - 1); scene.add(gate.g);
    const booth = box(1.4, 1.1, 1.2, C.wall, 0, .55, 0, gate.g); box(1.7, .1, 1.5, C.accent, 0, 1.15, 0, gate.g); const bwin = box(.06, .45, 1, C.glass, .71, .65, 0, gate.g); if(dark) glow(bwin, GLOW);
    box(.16, .8, .16, C.ink, .6, .4, .9, gate.g); const arm = box(.07, .07, 3.6, C.accent, .6, 1.7, 2.4, gate.g); arm.rotation.x = -1.1;
    prop(-41.5, 0, STREET / 2 + .9, 6, .12, 1.6, C.walk); lamp(-39, STREET / 2 + .7, Math.PI); lamp(-44, -STREET / 2 - .7, 0);
    booth.userData.sel = gate;
    gate.el = h('div', 'hm-label', 'Portaria'); labels.appendChild(gate.el);

    // gruas das obras (malha em arame, lança, contrapeso e cabine)
    cranes.forEach(function(c){
      const m = new THREE.MeshLambertMaterial({ color: C.trim2, wireframe: true });
      const mast = new THREE.Mesh(new THREE.BoxGeometry(.5, 8, .5, 1, 12, 1), m); mast.position.set(c[0], 4, c[1]); scene.add(mast);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(7.5, .45, .45, 14, 1, 1), m); jib.position.set(c[0] + 2.5, 8.2, c[1]); scene.add(jib);
      box(1.2, .6, .6, C.ink, c[0] - 1.6, 8.1, c[1]); box(.7, .6, .6, C.wall, c[0] + .2, 7.6, c[1]);
      if(dark) glow(box(.22, .22, .22, C.late, c[0] - 1.6, 8.55, c[1]), RED);
      cyl(.02, 3, C.ink, c[0] + 5, 6.6, c[1]); box(.6, .3, .6, C.box, c[0] + 5, 5, c[1]);
    });

    // galpões das ferramentas: no fundo da quadra, docas voltadas pra rua da frente; caixas e caçamba no pátio
    const picks = [], buildings = [];
    picks.push(booth);
    const SCALE = 1.35; // galpões grandes: são o assunto do mapa (o caminhão fica do tamanho real)
    tools.forEach(function(t){
      const K = makeKit(t), gz = t.z - IN + D * SCALE / 2 + .05;
      K.g.position.set(t.x, .12, gz); K.g.scale.setScalar(SCALE); scene.add(K.g);
      MODELS[t.id](K);
      t.g = K.g; t.mats = K.mats; t.h = K.top * SCALE + .12; t.kind = 'b'; t.op = 1;
      K.docks.forEach(function(d){
        const x = t.x + d.x * SCALE, z = gz + d.zf * SCALE + SLOT, a = [x, t.z + PITCH / 2];
        t.docks.push({ x: x, z: z, a: a, head: 0, tool: t, by: null, mine: false });
        slab(x - .55, z, .05, 3.4, .15, C.accent); slab(x + .55, z, .05, 3.4, .15, C.accent); // vaga pintada no pátio
      });
      t.docks[Math.floor(t.docks.length / 2)].mine = true;
      // calçada rebaixada na frente das docas (o caminhão entra de ré por ela)
      const dx0 = Math.min.apply(null, t.docks.map(function(d){ return d.x; })) - .9, dx1 = Math.max.apply(null, t.docks.map(function(d){ return d.x; })) + .9;
      DEC.slab.push([(dx0 + dx1) / 2, .125, t.z + HB - WALK / 2, dx1 - dx0, .01, WALK + .02, C.road]);
      t.el = h('div', 'hm-label is-tool', t.name); labels.appendChild(t.el);
      K.g.traverse(function(o){ if(o.isMesh){ o.userData.sel = t; picks.push(o); } });
      buildings.push(t);
    });

    // equipe do pátio (decorativa, não é dado): um recebimento de mercadoria em cada galpão, no maior vão do pátio que não
    // é vaga de doca. Paletes chegam na pilha de RECEBIMENTO (perto da rua); a empilhadeira leva um por vez, do topo, até a
    // CONFERÊNCIA (junto à fachada, até 3); o conferente confere cada palete novo na prancheta; o carregador puxa com a
    // paleteira só os já conferidos para dentro do galpão, pela porta. Recebimento vazio = nova entrega depois de uns segundos.
    const crew = [], U = .3, TRAVEL = .06;
    const SKIN = new THREE.Color(dark ? '#a57a5c' : '#e0b08a'), PANTS = new THREE.Color(dark ? '#2b3b57' : '#3b5578'),
      VEST = new THREE.Color('#ff7a1a'), STRIPE = new THREE.Color('#e9eef2'), HAT = new THREE.Color('#ffc61a');
    const CMAT = {};
    function pb(w, hh, d, color, x, y, z, parent){ // peça da equipe: geometria e material compartilhados
      const k = color.getHexString(), m = new THREE.Mesh(geoBox(w, hh, d), CMAT[k] || (CMAT[k] = new THREE.MeshLambertMaterial({ color: color })));
      m.position.set(x, y, z); parent.add(m); return m; // sem sombra: são ~70 peças por galpão (a sombra dobraria o custo)
    }
    function pallet(parent){ const u = new THREE.Group(); pb(.34, .04, .34, C.wood, 0, .02, 0, u); pb(.3, .24, .3, C.box, 0, .16, 0, u); parent.add(u); return u; }
    function stackAt(x, z){ const g = new THREE.Group(); g.position.set(x, .13, z); scene.add(g); return [0, 1, 2].map(function(i){ const u = pallet(g); u.position.y = i * U; return u; }); }
    function person(){
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      // membro articulado no ombro/quadril: segmento + ponta (bota ou mão)
      const limb = function(x, y, len, color, end, foot){ const p = new THREE.Group(); p.position.set(x, y, 0); pb(.07, len, .08, color, 0, -len / 2, 0, p); pb(.075, .05, foot ? .12 : .07, end, 0, -len - .02, foot ? .02 : 0, p); body.add(p); return p; };
      const legL = limb(-.05, .27, .22, PANTS, C.ink, true), legR = limb(.05, .27, .22, PANTS, C.ink, true);
      pb(.2, .22, .12, VEST, 0, .38, 0, body); pb(.205, .03, .125, STRIPE, 0, .35, 0, body); pb(.205, .03, .125, STRIPE, 0, .42, 0, body);
      const armL = limb(-.135, .48, .19, VEST, SKIN), armR = limb(.135, .48, .19, VEST, SKIN);
      pb(.11, .11, .11, SKIN, 0, .555, 0, body); pb(.16, .025, .17, HAT, 0, .62, .015, body); pb(.13, .06, .13, HAT, 0, .65, 0, body);
      const clip = pb(.1, .13, .015, C.wall, .06, .4, .13, body); clip.visible = false;
      const cargo = new THREE.Group(); cargo.position.set(0, 0, .32); g.add(cargo); pallet(cargo).position.y = .02;
      pb(.03, .3, .03, C.ink, 0, .17, -.17, cargo).rotation.x = .5; cargo.visible = false; // paleteira: palete + cabo
      scene.add(g); return { g: g, body: body, legL: legL, legR: legR, armL: armL, armR: armR, clip: clip, cargo: cargo, x: 0, z: 0, ang: 0, ph: 0 };
    }
    function forklift(){
      const g = new THREE.Group();
      pb(.42, .2, .62, C.trim2, 0, .2, -.06, g); pb(.4, .17, .2, C.ink, 0, .385, -.29, g); // chassi e contrapeso
      [[-.18, .08], [.18, .08], [-.18, -.24], [.18, -.24]].forEach(function(p){ pb(.03, .34, .03, C.ink, p[0], .5, p[1], g); }); pb(.42, .03, .42, C.ink, 0, .68, -.08, g);
      pb(.14, .15, .1, VEST, 0, .37, -.1, g); pb(.09, .09, .09, SKIN, 0, .49, -.1, g); pb(.12, .03, .12, HAT, 0, .55, -.1, g); // motorista
      pb(.04, .62, .04, C.ink, -.15, .39, .24, g); pb(.04, .62, .04, C.ink, .15, .39, .24, g); // torre
      const lift = new THREE.Group(); lift.position.set(0, TRAVEL, .27); g.add(lift);
      pb(.34, .12, .03, C.ink, 0, .07, 0, lift); pb(.05, .025, .4, C.ink, -.1, .015, .2, lift); pb(.05, .025, .4, C.ink, .1, .015, .2, lift);
      const load = pallet(lift); load.position.set(0, .03, .2); load.visible = false;
      [-.22, .22].forEach(function(x){ [.14, -.24].forEach(function(z){ cyl(.08, .06, C.ink, x, .08, z, g, true).castShadow = false; }); });
      scene.add(g); return { g: g, lift: lift, load: load, x: 0, z: 0, ang: 0, fork: true };
    }
    // passos das rotinas: cada um recebe (ator, dt) e devolve true quando terminou
    const turnBy = function(a, ang, dt){ let da = ang - a.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); a.ang += Math.sign(da) * Math.min(Math.abs(da), dt * 4); return Math.abs(da); };
    const goTo = function(x, z, v){ return function(a, dt){
      const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
      if(d < .01){ a.walking = false; return true; }
      const off = turnBy(a, Math.atan2(dx, dz), dt);
      a.walking = off < .2;
      if(!a.walking) return false; // manobra parado antes de andar
      const st = Math.min(d, dt * v); a.x += dx / d * st; a.z += dz / d * st; a.ph += dt * 9; return false;
    }; };
    // ré: anda sem virar (empilhadeira saindo da pilha de frente para ela)
    const backTo = function(x, z, v){ return function(a, dt){ const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz); if(d < .01) return true; const st = Math.min(d, dt * v); a.x += dx / d * st; a.z += dz / d * st; return false; }; };
    const face = function(ang){ return function(a, dt){ a.walking = false; return turnBy(a, ang, dt) < .02; }; };
    const raise = function(level){ return function(a, dt){ const d = level() - a.lift.position.y; a.lift.position.y += Math.sign(d) * Math.min(Math.abs(d), dt * .5); return Math.abs(d) < .005; }; };
    const until = function(ok){ return function(a){ a.walking = false; return ok(); }; };
    const pause = function(s){ let t = 0; return function(a, dt){ t += dt; if(t < s) return false; t = 0; return true; }; };
    const act = function(fn){ return function(a){ fn(a); return true; }; };
    const pose = function(name, s){ let t = 0; return function(a, dt){ a.pose = name; t += dt; a.pt = t; if(t < s) return false; a.pose = null; t = 0; return true; }; };
    // ponytail: a rotina é uma lista fixa de passos repetida em laço (sem replanejar no meio); serve para cena decorativa
    function run(a, dt){ if(!dt) return; if(a.i == null) a.i = 0; let n = a.steps.length; while(n-- && a.steps[a.i](a, dt)) a.i = (a.i + 1) % a.steps.length; }

    buildings.forEach(function(t){
      const front = t.docks[0].z - SLOT, back = t.z + IN, lanes = t.docks.map(function(d){ return [d.x - .7, d.x + .7]; }).sort(function(a, b){ return a[0] - b[0]; });
      let x0 = t.x - IN + .3, gap = null;
      lanes.concat([[t.x + IN - .3, Infinity]]).forEach(function(l){ if(!gap || l[0] - x0 > gap[1] - gap[0]) gap = [x0, l[0]]; x0 = Math.max(x0, l[1]); });
      const wide = gap[1] - gap[0] > 1.2, fx = wide ? gap[0] + .45 : (gap[0] + gap[1]) / 2, side = wide || fx < t.x ? 1 : -1;
      const zA = back - .35, zB = front + .45, doorX = fx + side * 1.05, R0 = .47; // R0: do centro da empilhadeira ao centro do palete no garfo
      // porta de pessoal na fachada, se a fachada passa por ali
      const bb = new THREE.Box3().setFromObject(t.g), doors = [];
      if(doorX > bb.min.x + .3 && doorX < bb.max.x - .3) doors.push(box(.5, .66, .03, C.trim2, doorX, .13 + .33, front + .015), box(.4, .58, .03, C.ink, doorX, .13 + .29, front + .03));
      const Y = { yard: true, t: t, A: 1 + Math.floor(Math.random() * 3), B: 0, fresh: 0, ok: 0, wait: 0, unitsA: stackAt(fx, zA), unitsB: stackAt(fx, zB), doors: doors };
      const f = forklift(); f.x = fx; f.z = zB + R0 + .5; f.ang = 0;
      f.steps = [goTo(fx, zA - R0, .8), until(function(){ return Y.A > 0; }), raise(function(){ return (Y.A - 1) * U; }),
        act(function(a){ Y.A--; a.load.visible = true; }), raise(function(){ return TRAVEL + .04; }), backTo(fx, zA - R0 - .5, .5),
        goTo(fx, zB + R0 + .5, .8), goTo(fx, zB + R0, .5), until(function(){ return Y.B < 3; }), raise(function(){ return Y.B * U; }),
        act(function(a){ Y.B++; Y.fresh++; a.load.visible = false; }), raise(function(){ return TRAVEL; }), backTo(fx, zB + R0 + .5, .5)];
      const cf = person(); cf.x = fx + side * .55; cf.z = zB + .55; cf.ang = Math.atan2(-side, -.6); cf.clip.visible = true;
      cf.steps = [until(function(){ return Y.fresh > 0; }), face(Math.atan2(-side, -.3)), pose('confere', 1.4), act(function(){ Y.fresh--; Y.ok++; }), face(Math.atan2(-side, -.6))];
      const home = [fx + side * 1.15, zB + 1.35], cg = person(); cg.x = home[0]; cg.z = home[1]; cg.ang = Math.PI;
      cg.steps = [until(function(){ return Y.ok > 0; }), goTo(fx + side * .5, zB + .02, .45), face(-side * Math.PI / 2),
        act(function(a){ Y.B--; Y.ok--; a.cargo.visible = true; }), goTo(doorX, front + .45, .4), goTo(doorX, front + .12, .3),
        act(function(a){ a.inside = true; }), pause(1.6), act(function(a){ a.inside = false; a.cargo.visible = false; }),
        goTo(home[0], home[1], .45), face(Math.PI)];
      [f, cf, cg].forEach(function(a){ a.y = Y; crew.push(a); });
      crew.push(Y);
    });
    function poseActor(a){
      a.g.position.set(a.x, .13, a.z); a.g.rotation.y = a.ang;
      if(a.fork) return;
      const sw = a.walking ? Math.sin(a.ph) * .6 : 0;
      a.legL.rotation.x = sw; a.legR.rotation.x = -sw;
      a.body.position.y = a.walking ? Math.abs(Math.sin(a.ph)) * .018 : 0;
      if(a.cargo.visible) a.armL.rotation.x = a.armR.rotation.x = -.7; // segura o cabo da paleteira
      else if(a.pose === 'confere'){ a.armL.rotation.x = -1; a.armR.rotation.x = a.pt < .5 ? -.9 : -2.6 + Math.sin(a.pt * 12) * .15; } // ergue o braço: conferido
      else if(a.clip.visible){ a.armL.rotation.x = -1; a.armR.rotation.x = -.8 + Math.sin(performance.now() / 160) * .12; } // anota na prancheta
      else { a.armL.rotation.x = -sw * .8; a.armR.rotation.x = sw * .8; }
    }
    // dt 0 (pausado / movimento reduzido) só atualiza visibilidade e pose. No modo leve a equipe some e não anda (~70 peças por galpão)
    function moveCrew(dt){
      if(leve) dt = 0;
      crew.forEach(function(a){
        if(a.yard){ // pilhas do recebimento e da conferência; recebimento vazio = nova entrega
          const on = !leve && !a.t.card.hidden && a.t.g.visible;
          if(a.A === 0 && (a.wait += dt) > 4){ a.A = 3; a.wait = 0; }
          a.unitsA.forEach(function(u, i){ u.visible = on && i < a.A; }); a.unitsB.forEach(function(u, i){ u.visible = on && i < a.B; });
          a.doors.forEach(function(m){ m.visible = a.t.g.visible; });
          return;
        }
        run(a, dt);
        a.g.visible = !leve && !a.inside && !a.y.t.card.hidden && a.y.t.g.visible;
        poseActor(a);
      });
    }

    // instancia tudo que foi acumulado
    function instanced(geo, list, opts){
      if(!list.length) return;
      const mat = new (opts && opts.basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)(Object.assign({ color: 0xffffff }, opts && opts.mat));
      const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
      list.forEach(function(it, i){ o.position.set(it[0], it[1], it[2]); o.rotation.set(0, it[7] || 0, 0); o.scale.set(it[3], it[4], it[5]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if(it[6]) m.setColorAt(i, it[6]); });
      m.castShadow = !(opts && opts.flat); m.receiveShadow = true; scene.add(m); return m;
    }
    instanced(new THREE.BoxGeometry(1, 1, 1), DEC.slab, { flat: true });
    // halo de luz dos postes no chão (só à noite)
    const haloTex = glowTex(function(x){ const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }, 128, 128);
    instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), DEC.pool, { flat: true, basic: true, mat: { map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55 } });
    instanced(new THREE.BoxGeometry(1, 1, 1), DEC.prop);
    instanced(new THREE.BoxGeometry(1, 1, 1), DEC.bulb, { flat: true, basic: true });
    instanced(new THREE.CylinderGeometry(.5, .5, 1, 10), DEC.pole);
    instanced(new THREE.ConeGeometry(.5, 1, 14), DEC.cone);
    instanced(new THREE.IcosahedronGeometry(.5, 1), DEC.crown, { mat: { flatShading: true } });
    instanced(new THREE.BoxGeometry(1, 1, 1), DEC.carton, { mat: { map: tex(CARTON, 1, 1), color: C.box } });

    // grade de navegação: só o eixo das ruas é livre (o caminhão sai dele só pra entrar/sair de ré da doca)
    const G = makeGrid(GATE_OUT[0] - 2, cityZ0, cityX1, cityZ1, .5);
    G.blocked.fill(1);
    SX.forEach(function(x){ G.rect(x - .8, SZ[0] - .8, x + .8, SZ[SZ.length - 1] + .8, 0); });
    SZ.forEach(function(z){ G.rect(SX[0] - .8, z - .8, SX[SX.length - 1] + .8, z + .8, 0); });
    G.rect(GATE_OUT[0] - 1, -.8, SX[0], .8, 0);
    const unreachable = [];
    tools.forEach(function(t){ t.docks.forEach(function(d){ if(!G.path(GATE_IN, d.a)) unreachable.push(t.name); }); });
    // sua vaga: no estacionamento da portaria
    const portaria = blocks.find(function(b){ return b.kind === 'portaria'; });
    const ME_HOME = [portaria.x + 1.15 + 1.1, portaria.z + 2], HOME_EXIT = [ME_HOME[0], portaria.z + PITCH / 2];

    // =====================================================================================
    // STORE: única fonte de dados (cena e cards só leem daqui)
    // =====================================================================================
    const PERFIS = ['VONDER', 'FERRAMENTAS GERAIS', 'OSTEN FERRAGENS', 'DISMATAL', 'TOOLMIX', 'DWT', 'NOVE54', 'GRUPO OVD'];
    const NOMES = ['Ana Paula', 'Bruno Costa', 'Carla Mendes', 'Diego Rocha', 'Elisa Ramos', 'Felipe Nunes', 'Gabriela Lima', 'Henrique Alves'];
    const TEMAS = [['Torque certo na parafusadeira', 'Parafusadeira VONDER', 'Blog + Instagram'], ['Lavadora e aspirador LAV 1580', 'LAV 1580 VONDER', 'Instagram'],
      ['Carrinhos, painéis e armários', 'Carrinhos de ferramentas VONDER', 'Facebook'], ['Nivelamento com nível a laser', 'Nível a laser VONDER', 'YouTube'],
      ['Hortas em casa com pulverizadores', 'Pulverizadores VONDER', 'Instagram'], ['Compactadores na construção civil', 'Compactador VONDER', 'LinkedIn'],
      ['Estética automotiva: portfólio FG', 'Linha automotiva FG', 'Instagram'], ['Perfurar parede sem erro', 'Brocas VONDER', 'Blog']];
    const V_BOT = 4.2, V_ME = 7, MAX_PAUTAS = 3;
    // só o <span> do nome: o slot também tem o botão "Sair" (home-auth.js), que vazava pro rótulo ("LucasSair")
    const myName = ((document.querySelector('#homeUserSlot > span') || {}).textContent || '').trim().split(/\s+/)[0] || 'Você';
    const store = { t: 0, speed: 1, paused: false, clock0: Date.now(), kpi: { mes: 41, atrasadas: 0, concluidas: 0 },
      tools: tools, trucks: [], log: [], nextPauta: 1040 };
    const clock = function(t){ const d = new Date(store.clock0 + t * 60000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }; // 1 s simulado = 1 min
    function log(text){ store.log.unshift(clock(store.t) + '  ' + text); store.log.length = Math.min(store.log.length, 8); }
    function newPauta(T){
      const tema = TEMAS[(store.nextPauta - 1040) % TEMAS.length];
      store.kpi.mes++;
      return { id: 'PAU-' + store.nextPauta++, titulo: tema[0], produto: tema[1], canal: tema[2], stage: 0, created: T, prazo: T + rand(55, 95), late: false, at: [T] };
    }
    const pautas = function(){ return store.trucks.filter(function(tr){ return tr.pauta; }).map(function(tr){ return tr.pauta; }); };

    // caminhão = usuário. Estados: fora (ainda não entrou), dirigindo, doca, parado (só o seu), saindo.
    function newTruck(id, name, perfil, me){ return { kind: 't', id: id, name: name, perfil: perfil, me: me, state: 'fora', pos: GATE_OUT.slice(), head: 0,
      path: null, s: 0, dest: null, dock: null, since: 0, end: 0, pauta: null }; }
    const me = newTruck('VOCÊ', myName, ((document.getElementById('profilePickerName') || {}).textContent || '').trim() || 'Seu perfil', true);
    me.state = 'parado'; me.pos = ME_HOME.slice(); me.head = 0;
    store.trucks.push(me);
    NOMES.forEach(function(n, i){ store.trucks.push(newTruck('TRK-0' + (i + 1), n, PERFIS[i % PERFIS.length], false)); });
    const bots = store.trucks.filter(function(tr){ return !tr.me; });
    function freeDock(tool, mine){ return tool.docks.find(function(d){ return !d.by && d.mine === !!mine; }); }
    // a cidade não abre vazia: alguns caminhões já estão estacionados, dois com pauta na carga
    [[0, 'visual-editor.html', 0], [1, 'gerador.html', 2], [2, 'templates.html', -1], [3, 'monitoramento.html', 4], [4, 'marcas.html', -1]].forEach(function(s){
      const tr = bots[s[0]], tool = toolById(s[1]), d = tool && freeDock(tool, false);
      if(!d) return;
      Object.assign(tr, { state: 'doca', dock: d, pos: [d.x, d.z], head: d.head, since: -rand(2, 12), end: rand(4, 14) }); d.by = tr; tool.people++;
      if(s[2] >= 0){ tr.pauta = newPauta(0); tr.pauta.stage = s[2]; tr.pauta.prazo = rand(40, 80) - s[2] * 10; }
    });
    store.kpi.mes = 41;

    // ponto exato no eixo da rua mais próxima (clique no chão, posição atual)
    function snapStreet(p){
      let best = null, bd = Infinity;
      const test = function(q){ const d = dist(p, q); if(d < bd){ bd = d; best = q; } };
      SZ.forEach(function(z){ test([Math.max(SX[0], Math.min(SX[SX.length - 1], p[0])), z]); });
      SX.forEach(function(x){ test([x, Math.max(SZ[0], Math.min(SZ[SZ.length - 1], p[1]))]); });
      test([Math.max(GATE_OUT[0], Math.min(SX[0], p[0])), 0]);
      return best;
    }
    // rota: A* pelo eixo das ruas, deslocada inteira pra faixa da direita.
    // Saindo da doca: de frente, numa curva suave até a faixa do sentido em que vai.
    // Chegando na doca: passa um pouco dela, encosta na faixa de lá e dá ré numa curva suave até a vaga.
    function routeTo(tr, dest){
      const atHome = tr.me && !tr.dock && dist(tr.pos, ME_HOME) < .5;
      const start = tr.dock ? tr.dock.a : atHome ? HOME_EXIT : snapStreet(tr.pos);
      const end = dest.dock ? dest.dock.a : snapStreet(dest.point);
      const center = G.path(start, end);
      if(!center) return false;
      let lane = laneLine(center, LANE), pts;
      if(tr.dock){
        const a = tr.dock.a, nx = (center[1] || end)[0], sx = Math.sign(nx - a[0]) || 1, out0 = [a[0], a[1] - 1.4];
        pts = [[tr.dock.x, tr.dock.z], out0].concat(bez(out0, [a[0], a[1] + .4], [a[0] + sx * 3.2, a[1] + LANE * sx], 8).slice(1), lane.slice(1));
      } else if(atHome) pts = [ME_HOME].concat(lane);
      else pts = (dist(tr.pos, lane[0]) > .3 ? [tr.pos] : []).concat(lane);
      if(dest.dock){
        const a = dest.dock.a, prev = center.length > 1 ? center[center.length - 2] : start, sx = Math.sign(a[0] - prev[0]) || 1;
        const pf = [a[0] + sx * 3.2, a[1] + LANE], in0 = [a[0], a[1] - 1.4];
        pts.pop(); pts.push(pf);
        const revFrom = mkPath(pts).len;
        tr.path = mkPath(pts.concat(bez(pf, [a[0], a[1] + LANE], in0, 10).slice(1), [[dest.dock.x, dest.dock.z]]), revFrom);
      } else tr.path = mkPath(pts);
      tr.s = 0; tr.dest = dest; return true;
    }
    function leaveDock(tr){ if(tr.dock){ tr.dock.by = null; if(!tr.me) tr.dock.tool.people--; tr.dock = null; } }
    function driveBot(tr, tool, T){
      const d = tool && freeDock(tool, false);
      // doca cheia: quem leva pauta espera na doca atual e tenta de novo; quem não leva vai embora
      if(!d){ if(tr.pauta && tr.state === 'doca'){ tr.end = T + 3; return; } return driveOut(tr, T); }
      d.by = tr;
      if(!routeTo(tr, { dock: d })){ d.by = null; return; }
      leaveDock(tr); tr.state = 'dirigindo';
      log(tr.name + ' → ' + tool.name + (tr.pauta ? ' (' + tr.pauta.id + ')' : ''));
    }
    function driveOut(tr){
      if(!routeTo(tr, { point: GATE_OUT, out: true })) return;
      leaveDock(tr); tr.state = 'saindo'; log(tr.name + ' saiu do portal');
    }
    function arrive(tr, T){
      const dest = tr.dest; tr.path = null; tr.dest = null;
      if(dest.out){ tr.state = 'fora'; tr.dock = null; tr.pos = GATE_OUT.slice(); return; }
      if(!dest.dock){ tr.state = 'parado'; tr.dock = null; return; }
      const d = dest.dock, tool = d.tool;
      tr.dock = d; tr.state = 'doca'; tr.pos = [d.x, d.z]; tr.since = T; tool.hits++;
      if(tr.me){ enterTool(tool); return; }
      tool.people++; tr.end = T + rand(9, 22);
      log(tr.name + ' estacionou em ' + tool.name);
      const si = stageIdx(tool);
      if(si === 0 && !tr.pauta && pautas().length < MAX_PAUTAS){ tr.pauta = newPauta(T); log(tr.name + ' pegou ' + tr.pauta.id + ' (' + tr.pauta.titulo + ')'); }
      else if(tr.pauta && si === tr.pauta.stage + 1){
        const p = tr.pauta; p.stage = si; p.at[si] = T; log(p.id + ' → ' + STAGES[si][0]);
        if(si === 3 && p.late){ store.kpi.atrasadas--; log(p.id + ' publicada com atraso'); }
      }
    }

    // um passo = 1 segundo de simulação: decisões dos outros usuários, prazos
    function tick(T){
      bots.forEach(function(tr){
        if(tr.state === 'doca' && T >= tr.end){
          const p = tr.pauta;
          if(p && p.stage >= 4){ store.kpi.concluidas++; log(p.id + ' concluída'); tr.pauta = null; }
          if(tr.pauta) driveBot(tr, toolById(STAGES[tr.pauta.stage + 1][1]), T);
          else if(Math.random() < .6) driveBot(tr, Math.random() < .35 && pautas().length < MAX_PAUTAS ? toolById(STAGES[0][1]) : pickOne(tools.filter(function(t){ return !t.card.hidden; })), T);
          else driveOut(tr);
        }
      });
      // alguém entra na cidade (pela portaria), se a entrada estiver livre
      const gateBusy = store.trucks.some(function(o){ return o.state !== 'fora' && Math.hypot(o.pos[0] - GATE_IN[0], o.pos[1] - GATE_IN[1]) < 5; });
      const out = bots.filter(function(tr){ return tr.state === 'fora'; });
      if(out.length && !gateBusy && Math.random() < .3){
        const tr = pickOne(out); tr.pos = GATE_OUT.slice(); tr.head = Math.PI / 2;
        const want = pautas().length < MAX_PAUTAS && Math.random() < .5 ? toolById(STAGES[0][1]) : pickOne(tools.filter(function(t){ return !t.card.hidden; }));
        log(tr.name + ' (' + tr.perfil + ') entrou no portal'); driveBot(tr, want, T);
      }
      pautas().forEach(function(p){ if(p.stage < 3 && !p.late && T > p.prazo){ p.late = true; store.kpi.atrasadas++; log(p.id + ' atrasou (prazo ' + clock(p.prazo) + ')'); } });
    }

    // movimento: cada caminhão anda na própria rota. Quem tem prioridade passa; o outro espera.
    // ponytail: prioridade fixa (você > TRK-01 > TRK-02 ...), só vale entre caminhões em movimento e sem desvio lateral;
    // quem tem prioridade pode passar "por cima" de um caminhão parado esperando. Evolução: reservar trechos da grade no
    // tempo (cooperative A*).
    const prio = function(tr){ return tr.me ? -1 : store.trucks.indexOf(tr); };
    function blockedAhead(tr){
      const p = pathAt(tr.path, tr.s + 2.4);
      return store.trucks.some(function(o){ return o !== tr && (o.state === 'dirigindo' || o.state === 'saindo') && prio(o) < prio(tr) && Math.hypot(o.pos[0] - p[0], o.pos[1] - p[1]) < 1.6; });
    }
    function move(tr, dt, T){
      if(!tr.path) return;
      if(!tr.me && blockedAhead(tr)) return;
      tr.s = Math.min(tr.path.len, tr.s + (tr.me ? V_ME : V_BOT) * (tr.s > tr.path.revFrom ? .45 : 1) * dt);
      const p = pathAt(tr.path, tr.s), ahead = tr.s + .6 <= tr.path.len, q = ahead ? pathAt(tr.path, tr.s + .6) : p, o = ahead ? p : pathAt(tr.path, tr.s - .6);
      tr.pos = p;
      if(Math.abs(q[0] - o[0]) + Math.abs(q[1] - o[1]) > 1e-4) tr.target = Math.atan2(q[0] - o[0], q[1] - o[1]) + (tr.s > tr.path.revFrom ? Math.PI : 0);
      if(tr.s >= tr.path.len) arrive(tr, T);
    }
    let nextTick = 1;
    function advance(dt){
      if(store.paused) return;
      const step = dt * store.speed;
      store.t += step;
      bots.forEach(function(tr){ move(tr, step, store.t); });
      while(store.t >= nextTick){ tick(nextTick); nextTick++; }
    }
    // conferência: números do store batem com o estado de cada item (aparece no painel "Estado")
    function invariants(){
      const errs = [];
      tools.forEach(function(t){ const n = bots.filter(function(tr){ return tr.state === 'doca' && tr.dock.tool === t; }).length; if(n !== t.people) errs.push(t.name + ' ' + t.people + '≠' + n); });
      const late = pautas().filter(function(p){ return p.late && p.stage < 3; }).length;
      if(late !== store.kpi.atrasadas) errs.push('atrasadas ' + store.kpi.atrasadas + '≠' + late);
      tools.forEach(function(t){ t.docks.forEach(function(d){ if(d.by && d.by.dock !== d && !(d.by.dest && d.by.dest.dock === d)) errs.push('doca órfã em ' + t.name); }); });
      if(unreachable.length) errs.push('doca sem rota: ' + unreachable.join(', '));
      return errs;
    }

    // ---------- caminhões (frota VONDER real; o seu tem anel amarelo e nome) ----------
    const VD = { white: new THREE.Color('#f2f2f0'), black: new THREE.Color('#141414'), yellow: new THREE.Color('#F6BE00'), off: new THREE.Color('#3a3a3a') };
    function trailerTexture(){
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 436;
      const x = cv.getContext('2d'), tx = new THREE.CanvasTexture(cv);
      tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
      function shape(fn){ x.beginPath(); fn(); x.fill(); x.stroke(); }
      function paint(logo){
        x.fillStyle = '#141414'; x.fillRect(0, 0, 1024, 436);
        x.fillStyle = '#F6BE00'; x.fillRect(0, 392, 1024, 44);
        x.fillStyle = '#141414'; x.font = '700 22px sans-serif'; x.fillText('www.vonder.com.br', 40, 422);
        // furadeira estilizada, no lugar da ilustração do baú real
        x.fillStyle = '#F6BE00'; x.strokeStyle = '#141414'; x.lineWidth = 8; x.lineJoin = 'round';
        shape(function(){ x.moveTo(705, 222); x.lineTo(660, 340); x.lineTo(760, 340); x.lineTo(805, 222); x.closePath(); });
        shape(function(){ x.roundRect(630, 328, 175, 54, 12); });
        shape(function(){ x.roundRect(590, 108, 305, 124, 54); });
        shape(function(){ x.roundRect(888, 134, 72, 72, 14); });
        shape(function(){ x.rect(960, 158, 64, 24); });
        x.beginPath(); for(let i = 0; i < 4; i++){ x.moveTo(640 + i * 26, 140); x.lineTo(640 + i * 26, 200); } x.stroke();
        x.fillStyle = '#ffffff';
        if(logo) x.drawImage(logo, 40, 96, 470, 470 * 227 / 807);
        else { x.font = '800 150px "Plus Jakarta Sans", sans-serif'; x.fillText('vonder', 40, 230); }
        tx.needsUpdate = true;
      }
      paint(null);
      const img = new Image();
      img.onload = function(){ paint(img); try{ x.getImageData(0, 0, 1, 1); }catch(e){ paint(null); } }; // canvas "contaminado" (file://) não sobe pra GPU
      img.src = 'post-editor-assets/brands/vonder_tip_bco.svg';
      return tx;
    }
    const sideMat = new THREE.MeshLambertMaterial({ map: trailerTexture() }), blackMat = new THREE.MeshLambertMaterial({ color: VD.black });
    const beamGeo = new THREE.PlaneGeometry(2.8, 5).rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .5, map: glowTex(function(x){
      const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,240,190,.9)'); g.addColorStop(1, 'rgba(255,240,190,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(20, 0); x.lineTo(44, 0); x.lineTo(64, 128); x.lineTo(0, 128); x.closePath(); x.fill(); }, 64, 128) });
    // modelo do caminhão-baú de cabine avançada (referência: "Seaside Town Truck", phi-sato), nas cores da frota VONDER.
    // Frente pra +z. Montado uma vez: as peças de cada material viram uma geometria só, compartilhada pelos 9 caminhões
    // (~15 chamadas de desenho por caminhão em vez de ~80).
    const TRUCK = (function(){
      const M = { white: VD.white, black: VD.black, trim: new THREE.Color('#4a4a4a'), metal: new THREE.Color('#9aa0a6'), seat: new THREE.Color('#5d6670'),
        dash: new THREE.Color('#2b2b2b'), yellow: VD.yellow, plate: new THREE.Color('#dfe3e6'), amber: new THREE.Color('#ffb020'), head: new THREE.Color('#fffbe8'), tail: new THREE.Color('#d83a2e') };
      const parts = {}, put = function(m, geo, x, y, z){ geo.translate(x, y, z); (parts[m] = parts[m] || []).push(geo); };
      const b = function(m, w, hh, d, x, y, z){ put(m, new THREE.BoxGeometry(w, hh, d), x, y, z); };
      const both = function(fn){ [-1, 1].forEach(fn); };
      // rodas: pneu + cubo; atrás, rodado duplo
      const wheel = function(x, z){ put('black', new THREE.CylinderGeometry(.2, .2, .12, 18).rotateZ(Math.PI / 2), x, .2, z); put('metal', new THREE.CylinderGeometry(.09, .09, .13, 12).rotateZ(Math.PI / 2), x, .2, z); };
      both(function(s){ wheel(s * .42, 1.13); wheel(s * .43, -1.08); wheel(s * .3, -1.08); });
      both(function(s){ b('black', .06, .1, 3.2, s * .28, .32, -.15); });                       // longarinas do chassi
      // cabine: saia na frente da roda, corpo, faixa VONDER amarela/preta, grade, faróis, para-choque e placa
      b('white', .98, .16, .36, 0, .3, 1.54); b('white', .98, .48, .77, 0, .62, 1.335);
      b('yellow', .99, .07, .775, 0, .5, 1.335); b('black', .99, .03, .775, 0, .555, 1.335);
      both(function(s){ b('black', .02, .05, .5, s * .495, .4, 1.13); b('black', .012, .025, .08, s * .493, .78, 1.12); }); // arco da roda e maçaneta
      b('dash', .3, .12, .02, 0, .72, 1.725); [.69, .72, .75].forEach(function(y){ b('metal', .26, .015, .012, 0, y, 1.737); });
      both(function(s){ b('dash', .16, .11, .015, s * .3, .42, 1.722); b('head', .13, .08, .02, s * .3, .42, 1.728); b('amber', .06, .05, .02, s * .43, .42, 1.725); }); // farol com moldura escura
      b('black', 1.04, .12, .12, 0, .24, 1.77); b('plate', .2, .06, .012, 0, .24, 1.836);
      // vidros com o interior à mostra: colunas, para-brisa, laterais, parede de trás, teto, painel, bancos e volante
      both(function(s){ b('white', .05, .42, .05, s * .465, 1.07, 1.695); b('white', .05, .42, .05, s * .465, 1.07, .975); b('glass', .015, .4, .68, s * .47, 1.07, 1.335); });
      b('glass', .88, .4, .015, 0, 1.07, 1.7); b('white', .98, .42, .03, 0, 1.07, .965); b('white', 1, .05, .8, 0, 1.305, 1.335);
      b('dash', .9, .1, .14, 0, .91, 1.6);
      both(function(s){ b('seat', .26, .08, .24, s * .22, .9, 1.15); b('seat', .26, .3, .06, s * .22, 1.07, 1.02); });
      put('dash', new THREE.TorusGeometry(.07, .012, 6, 14).rotateX(-Math.PI / 2 + .55), .22, 1.0, 1.47);
      both(function(s){ b('black', .12, .018, .018, s * .55, 1, 1.66); b('black', .035, .15, .07, s * .62, 1, 1.64); }); // retrovisores
      // baú: piso, cantoneiras e frisos, portas traseiras (vão, dobradiças, trancas), lanternas e para-choque
      b('black', .96, .06, 2.7, 0, .39, -.45);
      both(function(s){ b('trim', .045, 1.16, .045, s * .5, .99, .9); b('trim', .045, 1.16, .045, s * .5, .99, -1.8); b('trim', .045, .045, 2.7, s * .5, 1.56, -.45); b('trim', .045, .045, 2.7, s * .5, .42, -.45); });
      b('trim', .015, 1.06, .012, 0, .99, -1.807);
      both(function(s){
        [.6, .99, 1.38].forEach(function(y){ b('metal', .07, .025, .012, s * .47, y, -1.807); });
        [.1, .36].forEach(function(x){ b('metal', .018, 1.04, .014, s * x, .99, -1.81); });
        b('tail', .1, .06, .02, s * .32, .32, -1.81); b('amber', .05, .06, .02, s * .43, .32, -1.81);
        b('metal', .02, .02, 1.55, s * .49, .27, -.1); b('metal', .02, .02, 1.55, s * .49, .35, -.1); // proteção lateral
      });
      b('metal', .92, .05, .05, 0, .25, -1.76);
      b('dash', .1, .14, .3, .4, .32, .55); b('black', .04, .04, .3, -.38, .26, .6); // tanque e escapamento
      // une as peças por material (todas indexadas, com position/normal/uv)
      const merge = function(list){
        const pos = [], nor = [], uv = [], idx = []; let off = 0;
        list.forEach(function(g){
          pos.push.apply(pos, g.attributes.position.array); nor.push.apply(nor, g.attributes.normal.array); uv.push.apply(uv, g.attributes.uv.array);
          g.index.array.forEach(function(i){ idx.push(i + off); }); off += g.attributes.position.count;
        });
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        out.setIndex(idx); return out;
      };
      return Object.keys(parts).map(function(m){
        const mat = m === 'glass' ? new THREE.MeshLambertMaterial({ color: C.glass, transparent: true, opacity: .4 }) : new THREE.MeshLambertMaterial({ color: M[m] });
        if(dark && (m === 'head' || m === 'tail')) glow({ material: mat }, m === 'head' ? new THREE.Color('#fff4d0') : RED); // faróis e lanternas acesos à noite
        return { geo: merge(parts[m]), mat: mat, glass: m === 'glass' };
      });
    })();
    store.trucks.forEach(function(tr){
      const g = new THREE.Group();
      TRUCK.forEach(function(p){ const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = !p.glass; m.receiveShadow = true; g.add(m); });
      const trailer = new THREE.Mesh(new THREE.BoxGeometry(1, 1.14, 2.7), [sideMat, sideMat, blackMat, blackMat, blackMat, blackMat]);
      trailer.position.set(0, .99, -.45); trailer.castShadow = trailer.receiveShadow = true; g.add(trailer);
      // feixe de luz dos faróis (só à noite; some quando está de ré ou parado)
      if(dark){ tr.beam = new THREE.Mesh(beamGeo, beamMat); tr.beam.position.set(0, .05, 4.3); g.add(tr.beam); }
      // carga: 5 luzes no teto do baú = etapa da pauta que ele leva (laranja = atrasada)
      tr.lights = [-1.55, -1.05, -.55, -.05, .45].map(function(z){ return box(.62, .05, .36, VD.off, 0, 1.585, z, g).material; });
      if(tr.me){
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.05, 48), new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: .9 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = .03; g.add(ring);
      }
      scene.add(g);
      tr.g = g; tr.el = h('div', 'hm-label ' + (tr.me ? 'is-me' : 'is-truck')); labels.appendChild(tr.el);
      g.traverse(function(o){ if(o.isMesh && o.geometry.type !== 'RingGeometry'){ o.userData.sel = tr; picks.push(o); } });
    });
    // pino do destino do seu caminhão (clique no chão)
    const pin = new THREE.Group();
    const pinHead = new THREE.Mesh(new THREE.SphereGeometry(.32, 20, 14), new THREE.MeshLambertMaterial({ color: C.accent })); pinHead.position.y = 1.15;
    const pinTip = new THREE.Mesh(new THREE.ConeGeometry(.3, .75, 20), new THREE.MeshLambertMaterial({ color: C.accent })); pinTip.rotation.x = Math.PI; pinTip.position.y = .7;
    const pinDot = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffffff })); pinDot.position.set(0, 1.2, .26);
    pin.add(pinHead, pinTip, pinDot); pin.visible = false; pin.traverse(function(o){ o.castShadow = true; }); scene.add(pin);

    const stateLabel = { dirigindo: 'Dirigindo', doca: 'Na doca', parado: 'Parado', saindo: 'Saindo', fora: 'Fora do portal' };
    function stageName(p){ return STAGES[p.stage][0]; }
    function onBlock(p){ return blocks.some(function(b){ return Math.abs(p[0] - b.x) < HB && Math.abs(p[1] - b.z) < HB; }); }
    function placeTrucks(dt){
      store.trucks.forEach(function(tr){
        // na vista do galpão, caminhão entre a câmera e o pátio taparia a cena: some
        tr.g.visible = tr.state !== 'fora' && !(visit && (tr.pos[0] - visit.x) * Math.sin(VISIT_PHI) + (tr.pos[1] - visit.z) * Math.cos(VISIT_PHI) > HB);
        if(!tr.g.visible) return;
        if(tr.target != null){ let d = tr.target - tr.head; d = Math.atan2(Math.sin(d), Math.cos(d)); tr.head += d * Math.min(1, dt * 7); }
        // dentro da quadra (doca, estacionamento) o piso é mais alto que a rua: sobe suave ao passar pela calçada rebaixada
        const yT = onBlock(tr.pos) ? .13 : 0; tr.y = tr.y == null ? yT : tr.y + (yT - tr.y) * Math.min(1, dt * 10);
        tr.g.position.set(tr.pos[0], tr.y, tr.pos[1]); tr.g.rotation.y = tr.head;
        if(tr.beam) tr.beam.visible = !!tr.path && tr.s <= tr.path.revFrom;
        const p = tr.pauta, late = p && p.late && p.stage < 3;
        tr.lights.forEach(function(m, i){ m.color.copy(p && i <= p.stage ? (late ? C.late : VD.yellow) : VD.off); });
        tr.el.textContent = tr.me ? (tr.name === 'Você' ? 'Você' : 'Você · ' + tr.name) : tr.name.split(' ')[0] + (p ? ' · ' + p.id + ' ' + stageName(p) : '');
        tr.el.classList.toggle('is-late', !!late);
      });
    }

    // ---------- o seu caminhão: point and click ----------
    const hint = h('div', 'hm-hint'); stage.appendChild(hint);
    let hintTimer = 0, entering = null;
    function showHint(text, ms){ hint.textContent = text; hint.classList.add('is-on'); clearTimeout(hintTimer); if(ms) hintTimer = setTimeout(function(){ hint.classList.remove('is-on'); }, ms); }
    function cancelEnter(){ if(entering){ clearTimeout(entering); entering = null; hint.classList.remove('is-on'); } }
    function driveMe(dest){
      cancelEnter(); closeVisit();
      if(me.dock) me.dock.by = null;
      if(me.dest && me.dest.dock && me.dest.dock.by === me) me.dest.dock.by = null;
      if(!routeTo(me, dest)){ showHint('Não há caminho até esse ponto', 1400); return; }
      if(dest.dock) dest.dock.by = me;
      me.dock = null; me.state = 'dirigindo'; follow = me;
      const end = dest.dock ? [dest.dock.x, dest.dock.z] : me.path.pts[me.path.pts.length - 1];
      pin.position.set(end[0], .12, end[1]); pin.visible = !dest.dock;
    }
    function goTool(tool){
      if(tool.card.hidden) return;
      if(me.state === 'doca' && me.dock && me.dock.tool === tool){ enterTool(tool); return; }
      const d = tool.docks.find(function(x){ return x.mine; });
      driveMe({ dock: d }); showHint('Indo para ' + tool.name + '…', 1600);
    }
    function enterTool(tool){
      if(SUGGESTERS[tool.id]){ openVisit(tool); return; }
      showHint('Entrando em ' + tool.name + '…');
      entering = setTimeout(function(){ location.href = tool.id; }, 1100);
    }

    // modo leve: sem sombras e resolução 1x (instancing já vale sempre)
    function setLeve(on, save){
      leve = on; renderer.shadowMap.enabled = !on; sun.castShadow = !on;
      renderer.setPixelRatio(on ? 1 : Math.min(devicePixelRatio || 1, 2));
      scene.traverse(function(o){ if(o.material) [].concat(o.material).forEach(function(m){ m.needsUpdate = true; }); });
      if(save){ try{ localStorage.setItem(LIGHT_KEY, on ? '1' : '0'); }catch(e){} }
      resize();
    }

    // ---------- câmera isométrica ortográfica (começa perto, na sua vizinhança) ----------
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
    const START = [ME_HOME[0] + 9, ME_HOME[1] - 7], target = new THREE.Vector3(START[0], 0, START[1]), goal = target.clone();
    const VIEW = 15.5, R = 19.8, HCAM = 14, ZMIN = .3, ZMAX = 2.6;
    let zoom = 1.05, zoomGoal = 1.05, az = 0, azGoal = 0, flying = false, hcam = HCAM;
    function resize(){
      const w = stage.clientWidth, hh = stage.clientHeight;
      if(!w || !hh) return;
      renderer.setSize(w, hh, false);
      const a = w / hh, v = VIEW / zoom;
      camera.left = -v * a; camera.right = v * a; camera.top = v; camera.bottom = -v; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(stage);
    function flyTo(x, z, zm){ goal.set(x, 0, z); if(zm) zoomGoal = zm; flying = true; }
    function overview(){ follow = null; flyTo(-4, 0, .36); azGoal = 0; }

    // =====================================================================================
    // UI (cards de vidro) — tudo lido do store
    // =====================================================================================

    const sim = h('div', 'hm-sim hm-glass'); sim.setAttribute('role', 'group'); sim.setAttribute('aria-label', 'Simulação');
    const playBtn = iconBtn('pause', 'Pausar simulação', function(){ store.paused = !store.paused; syncSim(); });
    const seg = h('div', 'hm-seg');
    const speeds = [1, 2, 4].map(function(v){ const b = h('button', null, v + 'x'); b.type = 'button'; b.addEventListener('click', function(){ store.speed = v; syncSim(); }); seg.append(b); return [v, b]; });
    const leveBtn = h('button', 'hm-pill', 'Modo leve'); leveBtn.type = 'button'; leveBtn.addEventListener('click', function(){ setLeve(!leve, true); syncSim(); });
    const stateBtn = h('button', 'hm-pill', 'Estado'); stateBtn.type = 'button'; stateBtn.addEventListener('click', function(){ statePanel.hidden = !statePanel.hidden; syncSim(); refresh(); });
    sim.append(playBtn, seg, h('span', 'hm-sim-sep'), leveBtn, stateBtn);
    const statePanel = h('pre', 'hm-state hm-glass'); statePanel.hidden = true; statePanel.setAttribute('aria-label', 'Estado atual da simulação');
    function syncSim(){
      playBtn.innerHTML = icon(store.paused ? 'play' : 'pause', 17);
      playBtn.setAttribute('aria-label', store.paused ? 'Continuar simulação' : 'Pausar simulação'); playBtn.title = playBtn.getAttribute('aria-label');
      speeds.forEach(function(s){ s[1].setAttribute('aria-pressed', String(store.speed === s[0])); });
      leveBtn.setAttribute('aria-pressed', String(leve)); stateBtn.setAttribute('aria-pressed', String(!statePanel.hidden));
    }

    const zoomBox = h('div', 'hm-zoom hm-glass'); zoomBox.setAttribute('role', 'group'); zoomBox.setAttribute('aria-label', 'Controles do mapa');
    zoomBox.append(iconBtn('plus', 'Aproximar', function(){ zoomGoal = Math.min(ZMAX, zoomGoal * 1.25); }),
      iconBtn('minus', 'Afastar', function(){ zoomGoal = Math.max(ZMIN, zoomGoal / 1.25); }), h('hr'),
      iconBtn('rotL', 'Girar para a esquerda', function(){ azGoal -= Math.PI / 2; }),
      iconBtn('rotR', 'Girar para a direita', function(){ azGoal += Math.PI / 2; }), h('hr'),
      iconBtn('truck', 'Ir até o meu caminhão', function(){ select(me); follow = me; }),
      iconBtn('map', 'Ver a cidade inteira', function(){ select(null); overview(); }));
    const panel = h('aside', 'hm-panel hm-glass'); panel.hidden = true; panel.setAttribute('aria-live', 'polite');
    let sel = null, hover = null, follow = null;
    ui.append(sim, statePanel, zoomBox, panel);
    syncSim();

    // ---------- vista do galpão: ao estacionar, a câmera desce e fica de frente pro prédio (à esquerda) e as sugestões
    // daquela tela abrem à direita. A cidade segue rodando. Só ferramentas com sugestões ganham a vista; as outras abrem direto.
    const brandSuffix = function(){ return (window.PortalBrand && window.PortalBrand.suffix) || ''; };
    const SUGGESTERS = { 'visual-editor.html': function(suffix){ return HomeSuggestions.loadCalendar(suffix); } };
    const VISIT_PHI = .3, VISIT_H = 4.2, TONE = { bad: ['Urgente', 'is-bad'], warn: ['Atenção', 'is-warn'], info: ['Ideia', 'is-ok'] };
    const visitPanel = h('aside', 'hm-panel hm-visit hm-glass'); visitPanel.hidden = true;
    visitPanel.setAttribute('role', 'dialog'); visitPanel.setAttribute('aria-labelledby', 'hmVisitTitle');
    ui.append(visitPanel);
    let visit = null, visitAz = 0, visitSeq = 0;
    function openVisit(tool){
      select(null, true); follow = null; visit = tool; visitAz = azGoal;
      const want = VISIT_PHI - Math.PI / 4, d = want - az; azGoal = az + Math.atan2(Math.sin(d), Math.cos(d));
      ui.classList.add('is-visit'); visitPanel.hidden = false; frameVisit();
      loadVisit(tool);
      visitPanel.querySelector('.hm-btn-accent').focus({ preventScroll: true });
    }
    // enquadramento da vista: calculado ao abrir e quando o mapa muda de tamanho (não a cada quadro, que forçaria layout).
    // Prédio + pátio com folga (~16 x 10) cabem à esquerda do painel; o alvo anda pra direita metade do espaço do painel
    // (do canto esquerdo dele até a borda do mapa, mais um respiro). offsetLeft ignora a animação de entrada (transform).
    function frameVisit(){
      // celular (≤720): o painel cobre os 55% de baixo, então o prédio cabe nos 45% de cima e o alvo desce na tela (dy)
      const W = stage.clientWidth, H = stage.clientHeight, mob = W <= 720, pw = mob ? 0 : ui.clientWidth - visitPanel.offsetLeft + 24;
      zoomGoal = Math.min(2 * VIEW * Math.max(240, W - pw) / (H * 16), 2 * VIEW * (mob ? .45 : 1) / 10);
      const off = pw / 2 * 2 * VIEW / zoomGoal / H, dy = mob ? .55 * VIEW / zoomGoal : 0, e = Math.atan2(VISIT_H, R), se = Math.sin(e) * dy;
      goal.set(visit.x + Math.cos(VISIT_PHI) * off + Math.sin(VISIT_PHI) * se, visit.h * .4 - Math.cos(e) * dy, visit.z + .6 - Math.sin(VISIT_PHI) * off + Math.cos(VISIT_PHI) * se); flying = true;
    }
    new ResizeObserver(function(){ if(visit) frameVisit(); }).observe(stage);
    let visitSuffix = null;
    function loadVisit(tool){
      const seq = ++visitSeq, suffix = visitSuffix = brandSuffix();
      renderVisit(tool, null);
      Promise.resolve(suffix).then(SUGGESTERS[tool.id]).then(function(list){ if(seq === visitSeq) renderVisit(tool, list); },
        function(){ if(seq === visitSeq) renderVisit(tool, 'erro'); });
    }
    function closeVisit(){
      if(!visit) return;
      const t = visit; visit = null; visitSeq++;
      ui.classList.remove('is-visit'); visitPanel.hidden = true; visitPanel.replaceChildren();
      azGoal = visitAz; zoomGoal = 1.25; flyTo(t.x, t.z + 1);
      if(visitPanel.contains(document.activeElement) || document.activeElement === document.body) canvas.focus({ preventScroll: true });
    }
    // list: null = carregando, 'erro', ou a lista de sugestões
    function renderVisit(tool, list){
      // topo fixo (cabeçalho + entrar) e corpo rolável (só a lista rola: DESIGN.md §9)
      const top = h('div', 'hm-visit-top'), n = h('div', 'hm-visit-body'), hd = h('div', 'hm-panel-head hm-visit-head'), tx = h('div'), title = h('h3', null, tool.name);
      title.id = 'hmVisitTitle';
      tx.append(h('small', null, 'Você chegou · ' + tool.tag), title, h('p', null, tool.desc));
      hd.append(ico('building'), tx, iconBtn('close', 'Voltar ao mapa', closeVisit));
      const enter = h('a', 'hm-btn hm-btn-accent', 'Entrar no ' + tool.name); enter.href = tool.id;
      top.append(hd, enter);
      const h4 = h('h4', 'hm-visit-section', 'Sugestões para esta tela');
      if(Array.isArray(list) && list.length) h4.append(h('span', 'hm-count', String(list.length)));
      n.append(h4);
      if(list === null){
        const sk = h('div', 'hm-sugs is-loading'); sk.setAttribute('aria-busy', 'true'); sk.setAttribute('aria-label', 'Carregando sugestões');
        for(let i = 0; i < 3; i++) sk.append(h('div', 'hm-sug-skel'));
        n.append(sk);
      } else if(list === 'erro'){
        const er = h('div', 'hm-sug-empty', 'Não foi possível carregar as sugestões agora.'); er.setAttribute('role', 'alert');
        const again = h('button', 'hm-btn', 'Tentar de novo'); again.type = 'button';
        again.addEventListener('click', function(){ loadVisit(tool); });
        n.append(er, again);
      } else if(!list.length){
        const em = h('div', 'hm-sug-empty', 'Nenhuma pendência no calendário agora.'); em.setAttribute('role', 'status'); n.append(em);
      } else {
        const item = function(s){
          const li = h('li', 'hm-sug');
          const a = h('a', 'hm-sug-act', s.action.label + ' →'); a.href = s.action.href;
          li.append(h('span', 'hm-chip ' + TONE[s.tone][1], TONE[s.tone][0]), h('strong', 'hm-sug-title', s.text), h('p', 'hm-sug-sub', s.sub), a);
          return li;
        };
        const ul = h('ul', 'hm-sugs'); list.slice(0, 5).forEach(function(s){ ul.append(item(s)); });
        n.append(ul);
        if(list.length > 5){
          // sanfona (DESIGN.md §1): grade 1fr ↔ 0fr, conteúdo fechado com inert
          const more = h('div', 'hm-more is-closed'), inner = h('div', 'hm-more-inner'), rest = h('ul', 'hm-sugs');
          list.slice(5).forEach(function(s){ rest.append(item(s)); });
          inner.append(rest); more.append(inner); inner.inert = true;
          const tg = h('button', 'hm-more-btn', 'Mostrar mais ' + (list.length - 5)); tg.type = 'button'; tg.setAttribute('aria-expanded', 'false');
          tg.addEventListener('click', function(){
            const open = more.classList.toggle('is-closed') === false;
            inner.inert = !open; tg.setAttribute('aria-expanded', String(open)); tg.textContent = open ? 'Mostrar menos' : 'Mostrar mais ' + (list.length - 5);
          });
          n.append(more, tg);
        }
      }
      n.append(h('p', 'hm-sug-note', 'Sugestões automáticas por regras fixas sobre os dados do portal. Confira antes de usar.'));
      visitPanel.replaceChildren(top, n);
    }
    visitPanel.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ e.stopPropagation(); closeVisit(); } });
    canvas.addEventListener('keydown', function(e){ if(e.key === 'Escape' && visit) closeVisit(); });
    if(!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '-1');

    // seleção: contorno amarelo no selecionado, contorno fraco no que está sob o mouse
    const helper = new THREE.BoxHelper(undefined, C.accent); helper.visible = false; scene.add(helper);
    const hoverHelper = new THREE.BoxHelper(undefined, C.accent); hoverHelper.material.transparent = true; hoverHelper.material.opacity = .45; hoverHelper.visible = false; scene.add(hoverHelper);
    function select(obj, noFly){
      if(obj) closeVisit();
      sel = obj; if(follow && follow !== obj && follow !== me) follow = null;
      ui.classList.toggle('has-panel', !!obj); panel.hidden = !obj; panel._last = null;
      if(obj && !noFly){ follow = null; flyTo(obj.g.position.x, obj.g.position.z, Math.max(zoomGoal, 1.25)); }
      refresh();
    }

    const ago = function(t){ return Math.max(1, Math.round(store.t - t)) + ' min'; };
    const carrier = function(p){ return store.trucks.find(function(tr){ return tr.pauta === p; }); };
    function truckWhere(tr){
      if(tr.state === 'doca') return 'Na doca: ' + tr.dock.tool.name;
      if(tr.state === 'dirigindo') return 'Indo para ' + (tr.dest && tr.dest.dock ? tr.dest.dock.tool.name : 'o ponto marcado');
      if(tr.state === 'saindo') return 'Indo para a portaria';
      return stateLabel[tr.state];
    }
    function refresh(){
      if(hero.classList.contains('is-list')) return;
      const vis = buildings.filter(function(b){ return !b.card.hidden; }), K = store.kpi;
      const top = vis.slice().sort(function(a, b){ return b.hits - a.hits; })[0];
      // estado em texto (conferência do store)
      if(!statePanel.hidden){
        const errs = invariants();
        const lines = ['t = ' + Math.floor(store.t) + ' s (' + clock(store.t) + ') · ' + (store.paused ? 'pausado' : store.speed + 'x') + (leve ? ' · modo leve' : ''),
          'KPIs: pautas no mês ' + K.mes + ' · concluídas ' + K.concluidas + ' · atrasadas ' + K.atrasadas + ' · mais usada ' + (top ? top.name + ' (' + top.hits + ')' : '—'),
          'Invariantes: ' + (errs.length ? 'FALHOU → ' + errs.join('; ') : 'ok (docas, pessoas, atrasos e rotas batem)'), '', 'CAMINHÕES'];
        store.trucks.forEach(function(tr){ lines.push((tr.me ? 'VOCÊ  ' : tr.id + '  ') + tr.name + ' (' + tr.perfil + ')  ' + truckWhere(tr) + (tr.pauta ? '  carga ' + tr.pauta.id + ' ' + stageName(tr.pauta) + ' prazo ' + clock(tr.pauta.prazo) + (tr.pauta.late ? ' ATRASADA' : '') : '')); });
        lines.push('', 'FERRAMENTAS (pessoas na doca / docas ocupadas)');
        tools.forEach(function(t){ lines.push(t.name + '  ' + t.people + ' · ' + t.docks.filter(function(d){ return d.by; }).length + '/' + t.docks.length + ' · ' + t.hits + ' acessos'); });
        lines.push('', 'EVENTOS'); store.log.forEach(function(l){ lines.push(l); });
        statePanel.textContent = lines.join('\n');
      }
      // painel de detalhes
      if(sel) swap(panel, sel.kind === 'b' ? buildingPanel(sel) : sel.kind === 't' ? truckPanel(sel) : gatePanel());
    }
    function panelHead(iconName, kicker, title, subtitle){
      const hd = h('div', 'hm-panel-head'), tx = h('div');
      tx.append(h('small', null, kicker), h('strong', null, title), h('span', null, subtitle));
      hd.append(ico(iconName), tx, iconBtn('close', 'Fechar detalhes', function(){ select(null); }));
      return hd;
    }
    function tile(label, value, extra, pct, cls){
      const t = h('div', 'hm-tile' + (cls ? ' ' + cls : '')), b = h('b', null, value);
      if(extra) b.append(h('i', null, ' ' + extra));
      t.append(h('small', null, label), b);
      if(pct != null){ const bar = h('div', 'hm-bar'), f = h('span'); f.style.width = Math.round(pct * 100) + '%'; bar.append(f); t.append(bar); }
      return t;
    }
    function actBtn(text, act, accent){ const b = h('button', 'hm-btn' + (accent ? ' hm-btn-accent' : ''), text); b.type = 'button'; b.dataset.act = act; return b; }
    function buildingPanel(b){
      const n = h('div'), docked = store.trucks.filter(function(tr){ return tr.state === 'doca' && tr.dock.tool === b; });
      const si = stageIdx(b), busy = b.docks.filter(function(d){ return d.by; }).length;
      n.append(panelHead('building', b.tag, b.name, b.desc));
      const st = h('div', 'hm-status');
      st.append(h('span', 'hm-chip ' + (b.people ? 'is-ok' : ''), b.people ? 'Em uso' : 'Livre'), h('span', null, busy + ' de ' + b.docks.length + ' docas ocupadas'));
      const tiles = h('div', 'hm-tiles');
      tiles.append(tile('Na doca agora', String(docked.length), '/ ' + b.docks.length, docked.length / b.docks.length), tile('Acessos hoje', String(b.hits), null, Math.min(1, b.hits / 25)),
        tile('Etapa do fluxo', si >= 0 ? STAGES[si][0] : 'Apoio'), tile('Pautas na doca', String(docked.filter(function(tr){ return tr.pauta; }).length)));
      const h4 = h('h4', null, 'Quem está aqui'); h4.append(h('span', null, 'simulado'));
      const rs = h('div', 'hm-rows');
      docked.forEach(function(tr){ rs.append(row(tr.me ? 'Você · ' + tr.name : tr.name, tr.perfil + (tr.pauta ? ' · ' + tr.pauta.id : ''), 'Na doca', 'is-ok', 'há ' + ago(tr.since), function(){ select(tr); })); });
      if(!docked.length) rs.append(h('div', 'hm-row', 'Nenhum caminhão na doca agora.'));
      n.append(st, tiles, h4, rs, actBtn(me.dest && me.dest.dock && me.dest.dock.tool === b ? 'Seu caminhão está a caminho…' : 'Ir com meu caminhão', 'go', true));
      const a = h('a', 'hm-btn', 'Abrir direto'); a.href = b.id; n.append(a);
      return n;
    }
    function truckPanel(tr){
      const n = h('div'), p = tr.pauta;
      n.append(panelHead('truck', tr.me ? 'Seu caminhão · ' + tr.perfil : tr.perfil + ' · simulado', tr.me ? 'Você · ' + tr.name : tr.name, truckWhere(tr)));
      const st = h('div', 'hm-status'), late = p && p.late && p.stage < 3;
      st.append(h('span', 'hm-chip ' + (tr.state === 'doca' ? 'is-ok' : ''), stateLabel[tr.state]), h('span', null, tr.state === 'doca' ? 'há ' + ago(tr.since) : ''));
      const tiles = h('div', 'hm-tiles');
      tiles.append(tile('Carga', p ? p.id : 'Sem pauta'), tile('Perfil', tr.perfil),
        tile('Destino', tr.dest && tr.dest.dock ? tr.dest.dock.tool.name : tr.state === 'doca' ? tr.dock.tool.name : '—'), tile('Prazo da pauta', p ? clock(p.prazo) : '—', late ? 'vencido' : null, null, late ? 'is-late' : ''));
      n.append(st, tiles);
      if(p){
        const h4 = h('h4', null, 'Carga: ' + p.titulo); h4.append(h('span', null, p.produto));
        const rs = h('div', 'hm-rows');
        STAGES.forEach(function(s, j){ rs.append(row(s[0], (toolById(s[1]) || {}).name || '', j < p.stage ? 'Feito' : j === p.stage ? (late ? 'Atrasada' : 'Agora') : 'Previsto', j === p.stage && late ? 'is-bad' : j <= p.stage ? 'is-ok' : '', p.at[j] != null ? clock(p.at[j]) : '—')); });
        n.append(h4, rs);
      }
      n.append(actBtn(follow === tr ? 'Parar de seguir' : 'Seguir', 'follow'));
      if(tr.state === 'doca'){ const a = h('a', 'hm-btn hm-btn-accent', 'Abrir ' + tr.dock.tool.name); a.href = tr.dock.tool.id; n.append(a); }
      return n;
    }
    function gatePanel(){
      const n = h('div'), on = store.trucks.filter(function(tr){ return tr.state !== 'fora'; }), hits = tools.reduce(function(a, t){ return a + t.hits; }, 0);
      n.append(panelHead('gate', 'Entrada da cidade', 'Portaria', 'Login: todo caminhão entra e sai por aqui.'));
      const tiles = h('div', 'hm-tiles');
      tiles.append(tile('No portal agora', String(on.length)), tile('Nas docas', String(on.filter(function(tr){ return tr.state === 'doca'; }).length)),
        tile('Dirigindo', String(on.filter(function(tr){ return tr.state === 'dirigindo' || tr.state === 'saindo'; }).length)), tile('Acessos hoje', String(hits)));
      n.append(tiles);
      return n;
    }
    panel.addEventListener('click', function(e){
      const b = e.target.closest('[data-act]'); if(!b) return;
      if(b.dataset.act === 'follow'){ follow = follow === sel ? null : sel; panel._last = null; refresh(); }
      if(b.dataset.act === 'go' && sel && sel.kind === 'b'){ goTool(sel); panel._last = null; refresh(); }
    });
    setInterval(refresh, 500);

    // ---------- ponteiro: arrastar move a câmera; clique = point and click; Ctrl/⌘ + rolagem dá zoom ----------
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
    function aim(e){ const r = canvas.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera); }
    function pick(e){
      aim(e);
      const hit = ray.intersectObjects(picks, false).find(function(x){ return x.object.userData.sel.g.visible; }), o = hit && hit.object.userData.sel;
      return o && (o.kind !== 'b' || !o.card.hidden) ? o : null;
    }
    let down = null;
    canvas.addEventListener('pointerdown', function(e){ down = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function(e){
      if(down){
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if(visit || (!down.moved && Math.hypot(dx, dy) < 5)) return; // na vista do galpão a câmera fica presa ao prédio
        down.moved = true; flying = false; follow = null; canvas.classList.add('is-drag');
        // direita da tela e "pra cima" no chão, conforme o giro da câmera; vertical anda mais no chão (câmera inclinada)
        const k = 2 * VIEW / zoom / canvas.clientHeight, phi = Math.PI / 4 + az, f = Math.hypot(R, HCAM) / HCAM;
        const rx = Math.cos(phi), rz = -Math.sin(phi), ux = -Math.sin(phi), uz = -Math.cos(phi);
        target.x += (-dx * rx + dy * ux * f) * k; target.z += (-dx * rz + dy * uz * f) * k;
        target.x = Math.max(cityX0 - 12, Math.min(cityX1 + 4, target.x)); target.z = Math.max(cityZ0 - 4, Math.min(cityZ1 + 4, target.z)); goal.copy(target);
        down.x = e.clientX; down.y = e.clientY;
        return;
      }
      hover = pick(e); canvas.classList.toggle('is-hover', !!hover);
    });
    canvas.addEventListener('pointerup', function(e){
      canvas.classList.remove('is-drag');
      if(down && !down.moved){
        const o = pick(e);
        if(o && o.kind === 'b'){ select(o, true); goTool(o); }
        else if(o && o.kind === 't') select(o);
        else if(o && o.kind === 'g'){ select(o, true); driveMe({ point: GATE_IN.slice() }); }
        else if(ray.ray.intersectPlane(floor, hitP)){
          if(sel) select(null, true);
          if(hitP.x > G.x0 && hitP.x < cityX1 && hitP.z > cityZ0 && hitP.z < cityZ1) driveMe({ point: [hitP.x, hitP.z] });
        }
      }
      down = null;
    });
    canvas.addEventListener('pointerleave', function(){ hover = null; });
    // o mapa fica no meio da página: rolagem comum continua rolando a página; Ctrl/⌘ + rolagem dá zoom
    canvas.addEventListener('wheel', function(e){
      if(!(e.ctrlKey || e.metaKey)){ if(!entering) showHint('Use Ctrl + rolagem para dar zoom no mapa', 1200); return; }
      e.preventDefault(); if(visit) return; // a vista do galpão tem enquadramento fixo
      zoomGoal = Math.max(ZMIN, Math.min(ZMAX, zoomGoal * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    }, { passive: false });

    // busca: pauta (código ou título) seleciona o caminhão que a leva; ferramenta voa até o galpão (index.js já filtrou os cards)
    input.addEventListener('input', function(){
      const q = fold(input.value.trim());
      if(!q) return;
      const m = cards.find(function(c){ return !c.hidden && !c.classList.contains('is-filtered'); });
      const p = pautas().find(function(x){ return fold(x.id + ' ' + x.titulo + ' ' + x.produto).includes(q); });
      if(p && (!m || /^pau/.test(q))){ select(carrier(p)); return; }
      const b = m && toolById(m.getAttribute('href'));
      if(b){ closeVisit(); follow = null; flyTo(b.x, b.z, Math.max(zoomGoal, 1.1)); } // buscar outra ferramenta sai da vista do galpão
    });

    // teste: ?hmsim=N avança N segundos de simulação antes de começar (conferir eventos/atrasos sem esperar)
    const ff = Math.min(3600, +new URLSearchParams(location.search).get('hmsim') || 0);
    for(let i = 0; i < ff * 4; i++) advance(.25);
    const frameClock = new THREE.Clock(), v3 = new THREE.Vector3();
    setLeve(leve, false); placeTrucks(1); refresh();
    (function frame(){
      requestAnimationFrame(frame);
      const dt = Math.min(frameClock.getDelta(), .5);
      if(hero.classList.contains('is-list')) return;
      if(!still) advance(dt);
      move(me, dt, store.t);                         // o seu caminhão anda em tempo real, mesmo com a simulação pausada
      if(me.state !== 'dirigindo') pin.visible = false;
      placeTrucks(dt);
      moveCrew(still || store.paused ? 0 : dt * store.speed); // com 0 só atualiza a visibilidade
      if(visit && visitSuffix !== brandSuffix()) loadVisit(visit); // trocou a marca na Início com o painel aberto
      if(follow && follow.g.visible && !down){ goal.set(follow.g.position.x, 0, follow.g.position.z); flying = true; }
      const ease = 1 - Math.pow(.002, dt);
      if(flying){ target.lerp(goal, ease); if(target.distanceTo(goal) < .02 && !follow) flying = false; }
      if(Math.abs(zoomGoal - zoom) > .001){ zoom += (zoomGoal - zoom) * ease; resize(); }
      az += (azGoal - az) * ease;
      hcam += ((visit ? VISIT_H : HCAM) - hcam) * ease;
      const phi = Math.PI / 4 + az;
      camera.position.set(target.x + Math.sin(phi) * R, target.y + hcam, target.z + Math.cos(phi) * R); camera.lookAt(target);
      sun.position.set(target.x - 8, 20, target.z + 10); sun.target.position.copy(target); sun.target.updateMatrixWorld();
      helper.visible = !!sel && sel.g.visible; if(helper.visible) helper.setFromObject(sel.g);
      hoverHelper.visible = !!hover && hover !== sel && hover.g.visible; if(hoverHelper.visible) hoverHelper.setFromObject(hover.g);
      const w = stage.clientWidth, hh = stage.clientHeight;
      function label(el, x, y, z, op){
        v3.set(x, y, z).project(camera);
        el.style.transform = 'translate(' + Math.round((v3.x * .5 + .5) * w) + 'px,' + Math.round((-v3.y * .5 + .5) * hh) + 'px) translate(-50%,-100%)';
        el.style.opacity = op;
      }
      buildings.forEach(function(b){
        // câmera baixa da vista do galpão: os galpões da quadra da frente tapariam o prédio, então somem enquanto ela dura
        b.g.visible = !(visit && b !== visit && b.z > visit.z && Math.abs(b.x - visit.x) < PITCH);
        const off = b.card.hidden ? .2 : b.card.classList.contains('is-filtered') ? .3 : 1;
        b.op += (off - b.op) * Math.min(1, dt * 8);
        b.mats.forEach(function(m){ m.opacity = b.op; });
        label(b.el, b.x, b.h + .45, b.g.position.z, visit && visit !== b ? 0 : b.op < .5 ? .35 : 1);
        b.el.classList.toggle('is-sel', sel === b);
      });
      label(gate.el, gate.g.position.x, 1.9, gate.g.position.z, visit ? 0 : 1); gate.el.classList.toggle('is-sel', sel === gate);
      store.trucks.forEach(function(tr){ tr.el.hidden = !tr.g.visible || (!tr.me && hover !== tr && sel !== tr); if(!tr.el.hidden) label(tr.el, tr.g.position.x, 2.05, tr.g.position.z, 1); tr.el.classList.toggle('is-sel', sel === tr); });
      renderer.render(scene, camera);
    })();
  }
})();
