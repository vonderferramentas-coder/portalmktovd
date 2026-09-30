// Negrito, itálico e sublinhado nas palavras do título (h3) dos cards do Gerador de Cartazes.
// Ao selecionar palavras dentro de um título, aparece uma barra flutuante com três botões
// (visual do Toggle Group do animate-ui). A formatação vira <b>/<i>/<u> no próprio título e é
// guardada em item.titleHtml (ver updateTitle em cartaz-generator.js); só essas 3 tags são aceitas.
(function () {
  const TAGS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' };
  const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // HTML do título só com <b>/<i>/<u>; '' quando não há nenhuma formatação (o título volta a ser texto puro).
  function sanitize(root) {
    let tagged = false;
    const walk = node => {
      let out = '';
      node.childNodes.forEach(child => {
        if (child.nodeType === 3) { out += esc(child.nodeValue); return; }
        if (child.nodeType !== 1) return;
        const inner = walk(child), tag = TAGS[child.tagName];
        if (tag && inner) { tagged = true; out += `<${tag}>${inner}</${tag}>`; }
        else out += (/^(BR|DIV|P)$/.test(child.tagName) ? ' ' : '') + inner;
      });
      return out;
    };
    const html = walk(root);
    return tagged ? html : '';
  }
  // HTML vindo de fora (grade salva/compartilhada no Firestore): reconstrói só com <b>/<i>/<u>. O <template> é inerte, nada executa ao interpretar.
  function clean(html) { const box = document.createElement('template'); box.innerHTML = html; return sanitize(box.content) || esc(box.content.textContent); }
  window.CartazTitleFormat = { sanitize, clean };

  const ICONS = {
    bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
    italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
    underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>'
  };
  const LABELS = { bold: 'Negrito', italic: 'Itálico', underline: 'Sublinhado' };

  const bar = document.createElement('div');
  bar.className = 'cg-fmt';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Formatação do título');
  bar.innerHTML = Object.keys(ICONS).map(cmd =>
    `<button type="button" class="cg-fmt-item" data-cmd="${cmd}" data-state="off" aria-pressed="false" aria-label="${LABELS[cmd]}" title="${LABELS[cmd]}">` +
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[cmd]}</svg></button>`
  ).join('');
  document.body.appendChild(bar);

  // título editável que contém a seleção inteira (início e fim no mesmo h3), ou null
  function selectedTitle() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const from = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const h3 = from && from.closest('.card h3[contenteditable]');
    return h3 && h3.contains(sel.focusNode) ? h3 : null;
  }

  function update() {
    const h3 = selectedTitle();
    if (!h3) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.querySelectorAll('.cg-fmt-item').forEach(button => {
      const on = document.queryCommandState(button.dataset.cmd);
      button.dataset.state = on ? 'on' : 'off';
      button.setAttribute('aria-pressed', String(on));
    });
    const rect = getSelection().getRangeAt(0).getBoundingClientRect(), width = bar.offsetWidth, height = bar.offsetHeight;
    const top = rect.top - height - 8 >= 8 ? rect.top - height - 8 : rect.bottom + 8;
    bar.style.top = top + 'px';
    bar.style.left = Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)) + 'px';
  }

  document.addEventListener('selectionchange', update);
  window.addEventListener('scroll', update, true);
  window.addEventListener('resize', update);
  // mousedown não pode tirar a seleção do título, senão a barra some antes do clique
  bar.addEventListener('mousedown', event => event.preventDefault());
  bar.addEventListener('click', event => {
    const button = event.target.closest('.cg-fmt-item');
    if (!button) return;
    document.execCommand(button.dataset.cmd); // dispara "input" no título -> updateTitle grava titleHtml
    update();
  });
  // colar sempre como texto puro: estilos vindos de fora não entram no título
  document.addEventListener('paste', event => {
    if (!event.target.closest || !event.target.closest('.card h3[contenteditable]')) return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
  });
})();
