/**
 * Tour guiado por tela. O botão "Como usar" do cabeçalho abre a lista de passeios da tela; o
 * passeio escurece a página, destaca o elemento real e explica num balão, passo a passo.
 *
 * Carregado depois de portal-shell.js (usa PortalShell.svgIcon) nas telas que têm tutorial. Os
 * textos ficam em portal-tour-<tela>.js, que só chama PortalTour.register(tela, {version, title, tours}).
 * Cada passo de um passeio: {target, title, text, click, done, interact, allow, danger, when}
 *   target   seletor CSS do elemento real; sem target, o balão aparece no centro da tela
 *   click    o passeio espera a pessoa clicar no elemento (ensina fazendo) e segue sozinho
 *   done     com click: função que confirma que a tela reagiu ao clique; false = fica no passo
 *   interact a pessoa pode usar o elemento (digitar, marcar) e segue com "Próximo"
 *   allow    seletor de uma área a mais que a pessoa pode usar no passo (ex.: completar o formulário)
 *   danger   ação que apaga ou grava dados: só explica, com aviso, e o clique fica barrado
 *   when     função; devolvendo false, o passo é pulado
 * Elemento que não aparece (perfil sem acesso, marca sem a função, lista vazia) também é pulado.
 * Enquanto o passeio roda, cliques fora do balão e do elemento liberado são barrados: ninguém
 * apaga nem arrasta nada sem querer no meio do tutorial.
 *
 * Oferta automática: na primeira visita a cada tela, a lista de passeios abre sozinha uma vez.
 * O "já viu" fica em portalStore/tour-seen-{uid} ({tela: versão}), para valer em qualquer
 * computador, com cópia no localStorage. Sem nenhuma medição de uso.
 * ?tour=<id> na URL abre um passeio direto (para links de ajuda).
 */
(function(){
  const screens = [];
  const BLOCKED_EVENTS = ['pointerdown', 'mousedown', 'click', 'dblclick', 'dragstart'];
  const SEEN_LOCAL_PREFIX = 'portal_tour_seen_v1__';
  const HELP_ICON = '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>';
  const DANGER_TEXT = 'Esta ação apaga ou grava dados. Neste tutorial ela fica só na explicação.';
  let menuEl = null, layer = null, run = null;

  const icon = (paths, size) => window.PortalShell ? window.PortalShell.svgIcon(paths, size) : '';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // visível = tem caixa na tela e não está transparente (a barra de busca fechada tem opacity 0)
  function visible(el){
    if(!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return (r.width > 0 || r.height > 0) && s.visibility !== 'hidden' && s.opacity !== '0';
  }
  function findTarget(selector){ return Array.from(document.querySelectorAll(selector)).find(visible) || null; }
  // espera o elemento aparecer (um clique pode abrir um modal ou menu com atraso); setTimeout e não
  // requestAnimationFrame, que para em aba de fundo e deixaria o passeio parado
  function waitTarget(selector, timeout){
    const t0 = performance.now();
    return new Promise(resolve => {
      (function poll(){
        const el = findTarget(selector);
        if(el || performance.now() - t0 >= timeout) resolve(el);
        else setTimeout(poll, 50);
      })();
    });
  }
  function anyModalOpen(){ return Array.from(document.querySelectorAll('.modal-backdrop, dialog[open]')).some(visible); }

  // ============================================================
  // BOTÃO "COMO USAR" E LISTA DE PASSEIOS
  // ============================================================
  function mountButton(){
    if(document.getElementById('tourHelpBtn')) return;
    const slot = document.querySelector('[data-tour-slot]') || document.querySelector('.page-header-actions');
    if(!slot) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'tourHelpBtn'; btn.className = 'btn ghost tour-help-btn';
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = icon(HELP_ICON, 15) + '<span>Como usar</span>';
    btn.addEventListener('click', () => { if(menuEl) closeMenu(true); else openMenu(false); });
    slot.prepend(btn);
  }

  function openMenu(firstVisit){
    closeMenu(false);
    const screen = screens[0], btn = document.getElementById('tourHelpBtn');
    if(!screen || !btn) return;
    menuEl = document.createElement('div');
    menuEl.className = 'tour-menu';
    menuEl.setAttribute('role', 'dialog');
    menuEl.setAttribute('aria-label', 'Tutoriais desta tela');
    menuEl.innerHTML = (firstVisit
      ? '<p class="tour-menu-intro"><strong>Primeira vez aqui?</strong> Escolha um passeio guiado pela tela. Dá para rever quando quiser em "Como usar".</p>'
      : '<p class="tour-menu-kicker">' + esc(screen.title) + '</p>')
      + screen.tours.map(t => '<button type="button" class="tour-menu-item" data-tour-id="' + esc(t.id) + '"><span class="tour-menu-title">' + esc(t.title) + '</span><span class="tour-menu-desc">' + esc(t.summary) + '</span></button>').join('')
      + (firstVisit ? '<div class="tour-menu-foot"><button type="button" class="btn ghost small" data-later>Agora não</button></div>' : '');
    menuEl.addEventListener('click', ev => {
      const item = ev.target.closest('[data-tour-id]');
      if(item) start(item.dataset.tourId);
      else if(ev.target.closest('[data-later]')) closeMenu(true);
    });
    document.body.appendChild(menuEl);
    const r = btn.getBoundingClientRect();
    menuEl.style.top = Math.min(r.bottom + 8, innerHeight - menuEl.offsetHeight - 12) + 'px';
    menuEl.style.left = clamp(r.right - menuEl.offsetWidth, 12, innerWidth - menuEl.offsetWidth - 12) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    // fora do clique atual: senão o próprio clique que abriu o menu chegaria ao documento e o fecharia
    setTimeout(() => { if(menuEl) document.addEventListener('click', onMenuOutside); });
    document.addEventListener('keydown', onMenuKey);
    window.addEventListener('resize', onMenuDismiss);
    window.addEventListener('scroll', onMenuDismiss, true);
    const first = menuEl.querySelector('.tour-menu-item');
    if(first) first.focus({ preventScroll: true });
  }
  function closeMenu(returnFocus){
    if(!menuEl) return;
    menuEl.remove(); menuEl = null;
    document.removeEventListener('click', onMenuOutside);
    document.removeEventListener('keydown', onMenuKey);
    window.removeEventListener('resize', onMenuDismiss);
    window.removeEventListener('scroll', onMenuDismiss, true);
    const btn = document.getElementById('tourHelpBtn');
    if(btn){ btn.setAttribute('aria-expanded', 'false'); if(returnFocus) btn.focus({ preventScroll: true }); }
  }
  function onMenuOutside(ev){ if(menuEl && !menuEl.contains(ev.target) && !ev.target.closest('#tourHelpBtn')) closeMenu(false); }
  function onMenuKey(ev){ if(ev.key === 'Escape') closeMenu(true); }
  function onMenuDismiss(ev){ if(ev.type !== 'scroll' || !menuEl.contains(ev.target)) closeMenu(false); }

  // ============================================================
  // PASSEIO: camada escura com o "buraco" no alvo + balão
  // ============================================================
  function start(tourId){
    const screen = screens.find(s => s.tours.some(t => t.id === tourId));
    if(!screen) return;
    closeMenu(false); stop(false);
    run = { tour: screen.tours.find(t => t.id === tourId), index: -1, shown: [], token: 0, el: null, key: '', waiting: true };
    buildLayer();
    BLOCKED_EVENTS.forEach(type => window.addEventListener(type, guard, true));
    window.addEventListener('keydown', onKey, true);
    go(0, 1);
  }

  function stop(returnFocus){
    if(!run) return;
    BLOCKED_EVENTS.forEach(type => window.removeEventListener(type, guard, true));
    window.removeEventListener('keydown', onKey, true);
    run = null;
    if(layer){ layer.remove(); layer = null; }
    const btn = document.getElementById('tourHelpBtn');
    if(returnFocus !== false && btn) btn.focus({ preventScroll: true });
  }

  function buildLayer(){
    layer = document.createElement('div');
    layer.className = 'tour-layer';
    layer.innerHTML = '<div class="tour-hole is-empty"></div>'
      + '<div class="tour-pop is-waiting" role="dialog" aria-labelledby="tourPopTitle" aria-describedby="tourPopText" tabindex="-1">'
      + '<div class="tour-pop-head"><span class="tour-pop-kicker"></span><button type="button" class="tour-pop-close" data-act="close" aria-label="Sair do tutorial" title="Sair do tutorial (Esc)">' + icon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 14) + '</button></div>'
      + '<div aria-live="polite"><h3 class="tour-pop-title" id="tourPopTitle"></h3><p class="tour-pop-text" id="tourPopText"></p>'
      + '<p class="tour-pop-warn" hidden></p><p class="tour-pop-hint" hidden></p></div>'
      + '<div class="tour-pop-progress" aria-hidden="true"><span></span></div>'
      + '<div class="tour-pop-foot"><button type="button" class="btn ghost small" data-act="back">Voltar</button><button type="button" class="btn small" data-act="next">Próximo</button></div>'
      + '</div>';
    // menus da página (ex.: "Mais ações") fecham com clique no documento: o balão não pode fechá-los
    ['pointerdown', 'mousedown', 'click'].forEach(type => layer.addEventListener(type, ev => ev.stopPropagation()));
    layer.addEventListener('click', ev => {
      const act = ev.target.closest('[data-act]');
      if(!act || !run) return;
      if(act.dataset.act === 'next') go(run.index + 1, 1);
      else if(act.dataset.act === 'back') back();
      else stop();
    });
    document.body.appendChild(layer);
    requestAnimationFrame(loop);
  }

  // procura, a partir de `from` e no sentido `dir`, o próximo passo que pode aparecer
  async function go(from, dir){
    if(!run) return;
    const token = ++run.token, steps = run.tour.steps;
    const afterClick = run.index >= 0 && steps[run.index].click && dir > 0;
    setWaiting(true);
    for(let i = from; i >= 0 && i < steps.length; i += dir){
      const step = steps[i];
      if(step.when && !step.when()) continue;
      let el = null;
      if(step.target){
        // logo depois de um clique a tela pode demorar a abrir o que vem a seguir; nos demais, o elemento já está lá ou não existe
        el = await waitTarget(step.target, afterClick && i === from ? 3000 : 300);
        if(!run || run.token !== token) return;
        if(!el) continue;
      }
      show(i, el);
      return;
    }
    if(dir > 0) stop();
    else if(run.index >= 0) show(run.index, run.el); // nada visível antes: continua no passo atual
  }

  function back(){
    if(!canBack()) return;
    const prev = run.shown[run.shown.length - 2];
    run.shown.length -= 2;
    go(prev, -1);
  }
  // voltar a um passo de clique não desfaz o que o clique abriu: a volta para aí
  function canBack(){ return run.shown.length >= 2 && !run.tour.steps[run.shown[run.shown.length - 2]].click; }

  function setWaiting(on){
    run.waiting = on;
    if(layer) layer.querySelector('.tour-pop').classList.toggle('is-waiting', on);
  }

  function show(i, el){
    const steps = run.tour.steps, step = steps[i];
    run.index = i; run.el = el; run.key = ''; run.advancing = false;
    run.shown.push(i);
    if(el){
      // rola só se o alvo está fora da tela, ou cortado e pequeno o bastante para caber (a grade do mês quase inteira à vista não rola)
      const r = el.getBoundingClientRect();
      const offscreen = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
      const clipped = r.top < 0 || r.bottom > innerHeight;
      if(offscreen || (clipped && r.height < innerHeight * .6)) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
    const pop = layer.querySelector('.tour-pop'), hole = layer.querySelector('.tour-hole');
    pop.querySelector('.tour-pop-kicker').textContent = run.tour.title;
    pop.querySelector('.tour-pop-title').textContent = step.title;
    pop.querySelector('.tour-pop-text').textContent = step.text;
    const warn = pop.querySelector('.tour-pop-warn');
    warn.hidden = !step.danger;
    warn.textContent = step.danger ? 'Só explicação: ' + (typeof step.danger === 'string' ? step.danger : DANGER_TEXT) : '';
    const hint = pop.querySelector('.tour-pop-hint');
    hint.textContent = step.click ? 'Clique no item destacado para continuar.' : step.interact ? 'Pode testar no item destacado. Depois, clique em Próximo.' : '';
    hint.hidden = !hint.textContent;
    pop.querySelector('.tour-pop-progress span').style.width = Math.round((i + 1) / steps.length * 100) + '%';
    const next = pop.querySelector('[data-act="next"]'), backBtn = pop.querySelector('[data-act="back"]');
    next.hidden = !!step.click;
    next.textContent = i === steps.length - 1 ? 'Concluir' : 'Próximo';
    backBtn.hidden = !canBack();
    hole.classList.toggle('is-empty', !el);
    hole.classList.toggle('is-click', !!step.click);
    pop.classList.remove('is-in', 'is-nudge'); void pop.offsetWidth; pop.classList.add('is-in');
    setWaiting(false);
    reposition(); // já no lugar certo, sem esperar o próximo quadro
    // clique: o foco vai para o alvo (Enter/Espaço também valem) ou, se ele não recebe foco, para o balão; nos demais, para "Próximo"
    const focusTarget = el && (step.click || step.interact) && el.matches('button, input, select, textarea, a[href]') ? el : (step.click ? pop : next);
    focusTarget.focus({ preventScroll: true });
  }

  // barra o que não é o balão nem o elemento liberado no passo; o clique no alvo de um passo
  // "click" avança depois que a própria tela tratou o clique (setTimeout)
  function guard(ev){
    if(!run || (layer && layer.contains(ev.target))) return;
    const step = run.waiting ? null : run.tour.steps[run.index];
    const closest = sel => sel && ev.target.closest && ev.target.closest(sel);
    const onTarget = step && step.target && !step.danger && (step.click || step.interact) && closest(step.target);
    if(onTarget){
      if(step.click && ev.type === 'click' && !run.advancing){
        run.advancing = true;
        const i = run.index;
        setTimeout(() => {
          if(!run || run.index !== i) return;
          // a tela não avançou (ex.: campo obrigatório vazio, ela mesma avisa): continua no passo
          if(step.done && !step.done()){ run.advancing = false; nudge(); return; }
          go(i + 1, 1);
        });
      }
      return;
    }
    if(step && closest(step.allow)) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    if(ev.type === 'click') nudge();
  }
  // balanço curto no balão: "o tutorial está esperando aqui"
  function nudge(){
    if(!layer) return;
    const pop = layer.querySelector('.tour-pop');
    pop.classList.remove('is-nudge'); void pop.offsetWidth; pop.classList.add('is-nudge');
  }
  function onKey(ev){
    if(ev.key !== 'Escape') return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    stop();
  }

  // acompanha o alvo a cada quadro (rolagem, menu abrindo, tela redimensionada) e só reposiciona quando algo muda
  function loop(){
    if(!run || !layer) return;
    reposition();
    requestAnimationFrame(loop);
  }
  function reposition(){
    const step = run.index >= 0 ? run.tour.steps[run.index] : null;
    if(!run.waiting && step && step.target && !visible(run.el)) run.el = findTarget(step.target) || run.el;
    const r = !run.waiting && run.el && visible(run.el) ? run.el.getBoundingClientRect() : null;
    const pop = layer.querySelector('.tour-pop');
    const key = (r ? [r.left, r.top, r.width, r.height].map(Math.round).join() : '-') + '|' + innerWidth + 'x' + innerHeight + '|' + pop.offsetHeight;
    if(key !== run.key){ run.key = key; place(r); }
  }

  function place(r){
    const hole = layer.querySelector('.tour-hole'), pop = layer.querySelector('.tour-pop');
    const vw = innerWidth, vh = innerHeight, pad = 6, gap = 12, pw = pop.offsetWidth, ph = pop.offsetHeight;
    if(r){
      // recorta o buraco na janela: um alvo maior que a tela (a grade do mês) não empurra a moldura para fora
      const x = Math.max(r.left - pad, 4), y = Math.max(r.top - pad, 4), x2 = Math.min(r.right + pad, vw - 4), y2 = Math.min(r.bottom + pad, vh - 4);
      Object.assign(hole.style, { left: x + 'px', top: y + 'px', width: Math.max(x2 - x, 0) + 'px', height: Math.max(y2 - y, 0) + 'px' });
    } else if(!run.waiting){
      Object.assign(hole.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px' });
    }
    let left, top;
    if(!r){ left = (vw - pw) / 2; top = (vh - ph) / 2; }
    else if(vh - r.bottom - pad - gap >= ph) top = r.bottom + pad + gap;
    else if(r.top - pad - gap >= ph) top = r.top - pad - gap - ph;
    else if(vw - r.right - pad - gap >= pw){ left = r.right + pad + gap; top = r.top; }
    else if(r.left - pad - gap >= pw){ left = r.left - pad - gap - pw; top = r.top; }
    else top = vh - ph - 16; // alvo do tamanho da tela: o balão fica no rodapé, por cima dele
    if(left === undefined) left = r.left + r.width / 2 - pw / 2;
    pop.style.left = clamp(left, 12, vw - pw - 12) + 'px';
    pop.style.top = clamp(top, 12, vh - ph - 12) + 'px';
  }

  // ============================================================
  // "JÁ VIU" E OFERTA NA PRIMEIRA VISITA
  // ============================================================
  function whenAuthenticated(){
    return new Promise(resolve => {
      if(document.body.dataset.authenticated === 'true') return resolve();
      const obs = new MutationObserver(() => { if(document.body.dataset.authenticated === 'true'){ obs.disconnect(); resolve(); } });
      obs.observe(document.body, { attributes: true, attributeFilter: ['data-authenticated'] });
    });
  }
  function whenFirebase(){
    if(window.PortalFirebase) return Promise.resolve(window.PortalFirebase);
    return new Promise(resolve => {
      window.addEventListener('portal-firebase-ready', () => resolve(window.PortalFirebase), { once: true });
      setTimeout(() => resolve(window.PortalFirebase || null), 5000);
    });
  }
  async function seenStore(){
    const fb = await whenFirebase();
    let uid = 'local';
    try{ if(fb) uid = (await fb.currentContext()).user.uid; }catch(_){ /* sem sessão: fica só o navegador */ }
    return { fb, uid, key: 'tour-seen-' + uid };
  }
  function readLocal(uid){ try{ return JSON.parse(localStorage.getItem(SEEN_LOCAL_PREFIX + uid)) || {}; }catch(_){ return {}; } }
  function writeLocal(uid, map){ try{ localStorage.setItem(SEEN_LOCAL_PREFIX + uid, JSON.stringify(map)); }catch(_){} }

  async function maybeOffer(screen){
    await whenAuthenticated();
    const store = await seenStore();
    let seen = readLocal(store.uid);
    if(!seen[screen.id] && store.fb){
      try{ seen = Object.assign({}, (await store.fb.readPortalStore(store.key)).v, seen); }catch(_){}
    }
    if(seen[screen.id]) return;
    setTimeout(() => {
      // a pessoa já está fazendo algo (modal aberto, passeio rodando): oferece na próxima visita
      if(run || menuEl || anyModalOpen()) return;
      openMenu(true);
      markSeen(store, screen);
    }, 900);
  }
  async function markSeen(store, screen){
    const version = screen.version || 1;
    writeLocal(store.uid, Object.assign(readLocal(store.uid), { [screen.id]: version }));
    if(!store.fb) return;
    try{
      // outra aba pode ter gravado no meio: relê e tenta de novo uma vez
      for(let attempt = 0; attempt < 2; attempt++){
        const record = await store.fb.readPortalStore(store.key);
        const result = await store.fb.writePortalStore(store.key, Object.assign({}, record.v, { [screen.id]: version }), record.updated_at);
        if(!result.conflict) return;
      }
    }catch(_){ /* sem rede: vale a cópia do navegador */ }
  }

  function register(id, def){
    const screen = Object.assign({ id }, def);
    screens.push(screen);
    mountButton();
    const fromUrl = new URLSearchParams(location.search).get('tour');
    if(fromUrl && screen.tours.some(t => t.id === fromUrl)) whenAuthenticated().then(() => setTimeout(() => start(fromUrl), 600));
    else maybeOffer(screen);
  }

  window.PortalTour = { register, start, stop, openMenu: () => openMenu(false), screens };
})();
