# DESIGN.md — padrões de interface do Portal de Marketing OVD

> Rascunho inicial. Registra só o que já foi decidido; as seções marcadas com **(a detalhar)** ainda precisam ser trabalhadas.
> Vale para qualquer tela nova ou alterada (HTML/CSS/JS puro, sem build). Em caso de dúvida, copie a implementação de referência indicada.

## 1. Dropdowns, sanfonas e listas que abrem e fecham

**Regra:** todo dropdown/sanfona da plataforma abre e fecha com animação de altura. Nada de `display: none` ↔ `display: block` seco.

| Item | Valor |
|---|---|
| Duração | `.25s` |
| Curva | `ease` |
| Seta (chevron) | o mesmo ícone do menu lateral (`PortalShell.svgIcon('<path d="m6 9 6 6 6-6"/>', 14)`), gira **180°** ao abrir, na mesma duração (`.25s ease`) |
| Movimento reduzido | `@media (prefers-reduced-motion: reduce)` desliga a transição |

**Duas formas de implementar** (escolha pela natureza do elemento):

1. **`<details>` nativo** (sanfonas estáticas, como `.cg-fold` em `cartaz-generator.css`): animar o conteúdo nativo.

   ```css
   .minha-sanfona { interpolate-size: allow-keywords; }
   .minha-sanfona::details-content { block-size: 0; overflow: hidden; transition: block-size .25s ease, content-visibility .25s allow-discrete; }
   .minha-sanfona[open]::details-content { block-size: auto; }
   ```

   Chrome/Edge 131+. Nos demais navegadores abre e fecha sem animação (degrada bem). Se o `<summary>` tem margem quando aberto, anime também a `margin-bottom`.

2. **Conteúdo montado por JS** (listas que se redesenham, como `.bc-collapse` em `cartaz-generator.css` e `.pe-collapse-body` em `post-editor.css`): grade com `grid-template-rows: 1fr` ↔ `0fr`.

   ```css
   .x-collapse { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .25s ease; }
   .x-collapse.is-closed { grid-template-rows: 0fr; }
   .x-collapse-inner { min-height: 0; overflow: hidden; }
   ```

   - **Abrir:** renderize o conteúdo já com `.is-closed` e remova a classe no quadro seguinte (`requestAnimationFrame` duplo).
   - **Fechar:** adicione `.is-closed`, espere a transição (250 ms) e só então remova o conteúdo do estado/DOM. Se redesenhar a lista antes, o elemento some no meio da animação.

3. **Dropdown flutuante com lista rolável ou sombra grande** (referência: `.profile-menu` em `index.css`): a grade `0fr ↔ 1fr` recalcula o layout a cada quadro e trava nesses casos. Revele com `clip-path: inset(0 -28px 100% -28px)` → `inset(0 -28px -32px -28px)` (sem `opacity` nem `will-change`: ambos promovem o elemento a uma camada própria e, ao fim da animação, o texto é redesenhado e dá uma "piscada"), `.25s ease`, e `visibility` com atraso de `.25s` ao fechar. O inset negativo deixa a sombra aparecer.

**Menus flutuantes (⋮, popovers):** `position: fixed` para não serem cortados pela rolagem, entrada de `.12s` (`opacity` + `translateY(-4px) scale(.98)`), fecham com Esc, clique fora, rolagem e redimensionamento. Referência: `.card-menu` em `cartaz-generator.css` e `.square-menu` em `consolidado-generator.css`.

## 2. Tema claro e escuro

- Nunca use cor fixa (`#fff`, `#111`...) em componente novo: use as variáveis do tema (`--cg-*` no Gerador de Cartazes; `--card`, `--text`, `--muted`, `--border`, `--surface-muted` no restante).
- Todo componente novo é conferido nos **dois** temas antes de ser entregue.
- Foco visível usa a cor de destaque: `--accent-text` no portal, `--cg-accent` no Gerador de Cartazes (ver §14).

## 3. Cursores

O cursor mostra a função da área:

- **Mão aberta (`grab`)** em toda área que inicia arrasto; **fechada (`grabbing`)** enquanto pressionada e durante o arrasto (inclusive fora do elemento).
- **Dedo (`pointer`)** só em controles de clique (setas, botões, links). Um controle de clique dentro de uma área de arrasto não inicia o arrasto.
- `not-allowed` em controles desabilitados.

## 4. Reordenar por arrastar

Padrão do Gerador de Consolidado, reaproveitado no Gerador de Cartazes e em Datas comemorativas:

- Segurar ~350 ms (ou **Shift**, na hora) e arrastar; mover mais de 6 px antes disso cancela e vale o gesto normal da área.
- Um **cartão fantasma** (sombra, leve zoom) segue o ponteiro; o lugar de origem fica **tracejado**; os vizinhos **deslizam** (FLIP, `.18s`); ao soltar, o fantasma assenta em `.16s`.
- Soltar não pode disparar o clique do elemento (engolir o próximo clique).
- Todo arrastar tem alternativa por teclado: **Alt+↑/↓** e itens no menu ⋮.
- Toda reordenação entra no desfazer (Ctrl+Z).

## 5. Ícones e controles pequenos

- Ícones SVG de traço (`stroke="currentColor"`, 1,75 px) vindos de `PortalShell.svgIcon`; não duplique SVG no código.
- Controle de ícone: caixa de 24 px, raio 6 px, fundo `--cg-accent-weak` no hover.

- **Painéis de configuração** (referência: "Configurações do cartaz", `.cfg-*` em `cartaz-generator.css`): seções numeradas (01, 02…), cada uma um dropdown fechado por padrão (`.cfg-sec`, animação do §1), com **prévia ao vivo** ao lado quando houver resultado visual; ligar/desligar por **switch** (`.cfg-switch`, amarelo ligado); escolha entre poucas opções por **segmentado** (`.cfg-seg`); cor em quadradinho ao lado do campo; texto de ajuda pequeno e cinza abaixo do título; aviso em `--cg-accent`.

- **Alertas na lista lateral** (Gerador de Cartazes): triângulo vermelho (`.bc-cut`, `#ef6b5b`) no item que tem problema, ao lado do menu ⋯; clicar abre o modal que resolve. Ação reversível ganha um botão circular amarelo (`.bc-undo`, `#F6BE00`) com a seta de desfazer, só na lista, nunca na prévia da folha.
- **Modal de decisão** (`<dialog class="cg-dialog">`): título, texto curto com a contagem do problema e dois botões — o que não muda nada ("Tratar na planilha") e o que aplica (`.save-grid`, amarelo). Fechar no × não altera nada. A ação aplicada entra no Ctrl+Z.
- **Foto ao lado do QR** (cards Live Shop, comuns e destaque): a foto é uma caixa que cresce e encolhe com o zoom (roda do mouse, 0,5x a 2x, depois de duplo clique); o corpo do card é centralizado, então o QR cede espaço sozinho e o conjunto continua no meio. Arrastar a foto ou usar ← → (Shift = passo maior) afasta foto e QR em sentidos opostos até a borda do corpo; a posição fica na grade salva. Com os lados trocados (segurar e arrastar) o sentido se inverte. Foto em edição nunca dispara a troca de lados.

- **Cena/mapa 3D no meio da página** (mapa da Início, `home-map.js`): rolagem comum continua rolando a página; zoom só com **Ctrl/⌘ + rolagem** (aviso flutuante "Use Ctrl + rolagem…") ou pelos botões +/−. Arrastar move a câmera (`grab`/`grabbing`), item clicável vira `pointer`.
- **Modo escuro em cena 3D = noite** (mapa da Início): luz azulada de lua, janelas dos galpões acesas, postes com halo no chão, faróis/lanternas e feixe de luz nos caminhões (só quando andam de frente), letreiros e emblemas brilhando. Modo claro = dia, sem nenhuma dessas luzes.

## 6. Guias de margem de segurança nas artes

Toda arte de feed e story (qualquer editoria/marca, inclusive novas) deve ter as guias ciano de margem de segurança do editor (`SAFE_MARGINS` em `post-editor.js`): feed 135px cima / 66px laterais / 190px baixo; story 190px cima / 66px laterais / 190px baixo. Aparecem só ao arrastar/redimensionar o elemento que encosta nelas, barram momentaneamente (passa empurrando mais, como no Instagram) e não saem na exportação. Novos renderers precisam informar a caixa do elemento móvel via `setMoveBox`.

## 7. Identidade visual do portal

### Tipografia

Carregada do Google Fonts no topo de `styles.css` (dependência de terceiro, registrada em `docs/ARQUITETURA-E-INTEGRACOES.md`).

| Token | Fonte | Uso |
|---|---|---|
| `--font-display` | Space Grotesk (500/600/700) | títulos `h1`–`h6` |
| `--font-body` (= `--base-font-family`) | Plus Jakarta Sans (400–800) | texto corrido do `body` |
| `--font-ui` | Urbanist (400–800) | `button`, `input`, `select`, `textarea` |

Fallback de todas: `Segoe UI, Arial, sans-serif`. A fonte **Montserrat** (OFL) é só da arte "Datas comemorativas" da VONDER, hospedada em `post-editor-assets/fonts/`; não é fonte da interface.

### Cor de destaque por marca

A cor de destaque da interface é a da **marca ativa** (`DEFAULT_BRANDS` em `portal-shell.js`, aplicada por `applyColorTheme()`); não fixe amarelo em componente novo, use `--accent*`. Quem quiser outra cor usa o tema "Personalizado" em Configurações, que não altera a identidade da marca.

| Marca | `--accent` | Ênfase (`themeColorInk`) | Texto sobre o botão |
|---|---|---|---|
| VONDER | `#F6BE00` | `#000000` | automático |
| FERRAMENTAS GERAIS | `#005745` | `#005745` | automático |
| OSTEN FERRAGENS | `#ED8B00` | `#2E2E2E` | automático |
| DISMATAL | `#FFED00` | `#000000` | automático |
| TOOLMIX | `#F26522` | `#FFFFFF` | branco (exceção deliberada) |
| DWT | `#285C4D` | `#AB2328` | automático |
| NOVE54 | `#BD1D1D` | `#000000` | automático |
| GRUPO OVD | `#A6A6A6` (cinza neutro, institucional; não herda o amarelo da VONDER) | `#000000` | automático |
| PILAR TECNOLOGIA | `#003A5D` | `#FFFFFF` | branco (exceção deliberada) |

- Cada marca tem avatar redondo (28px, `.portal-brand-dot`, `object-fit:cover`) em `icons/icon_<marca>.*`. Marca sem foto usa as iniciais sobre uma cor escolhida por hash do id.
- O texto sobre o destaque (`--on-accent`) é calculado por contraste; só a marca com `onAccent` definido foge disso.
- Texto na cor de destaque (antetítulo `.page-kicker`, rótulos) usa `--accent-text`: no claro é a ênfase da marca; no escuro sobe a luminosidade até ficar legível (`oklch`, com fallback por mistura com branco). Nunca use `--accent` direto como cor de texto.
- O amarelo `#F6BE00` é a identidade-base do portal (marca VONDER, tema padrão e marca do portal no menu lateral).

## 8. Tokens `:root` (`styles.css`)

Fonte de verdade: o bloco `:root` e `:root[data-theme="dark"]` no topo de `styles.css`. O tema escuro é ativado por `data-theme="dark"` na tag `<html>`, alternado pelo botão de tema e persistido pelo JS. Ao criar token novo, defina-o **nos dois blocos**.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#f7f7f6` | `#121214` | fundo da página |
| `--card` | `#ffffff` | `#1c1d22` | cartões, painéis, menu lateral |
| `--surface-muted` | `#f7f7f5` | `#202126` | fundo secundário, hover |
| `--text` | `#17171a` | `#f1f2f4` | texto principal |
| `--muted` | `#68686a` | `#9aa1ac` | texto secundário |
| `--text-faint` | `#9a9a98` | `#8a92a0` | texto terciário, placeholders |
| `--border` | `#e5e5e3` | `#2c2d33` | bordas |
| `--border-strong` | `#d3d3d0` | `#3d3e46` | bordas de ênfase |
| `--accent` | marca ativa | marca ativa | destaque, botões |
| `--accent-ink` | ênfase da marca | = `--accent` | texto/ícone ativo sobre fundo |
| `--accent-weak` | `rgba(accent, .16)` | `rgba(accent, .16)` | fundo de item ativo, hover |
| `--accent-hover` | accent + 15% preto | idem | hover de botão |
| `--on-accent` | `#1a1a1a` (padrão) | idem | texto sobre `--accent` |
| `--selection-text` | `#000000` | calculado | texto selecionado (`::selection`) |
| `--white` | `#ffffff` | não redefinido | branco fixo (evite em componente novo) |
| `--danger` / `-bg` / `-bg-strong` / `-border` | `#dc2626` / `#fef2f2` / `#fee2e2` / `#fecaca` | `#f87171` / `#3a1518` / `#4a1a1e` / `#5c2328` | erro, ações destrutivas |
| `--success` / `-bg` / `-border` | `#16a34a` / `#f0fdf4` / `#bbf7d0` | `#4ade80` / `#142a1c` / `#1f4b2c` | sucesso |
| `--backdrop` | `rgba(15,15,13,.5)` | `rgba(0,0,0,.65)` | fundo de modal |
| `--radius-sm` / `-md` / `-lg` | `8px` / `12px` / `16px` | igual | raios |
| `--shadow-sm` / `-md` / `-lg` | `0 1px 2px` / `0 6px 16px` / `0 20px 40px` (preto a 6% / 8% / 16%) | preto a 25% / 35% / 50% | sombras |
| `--event-shadow` / `-hover` | sombra de cartão do calendário | mais forte no escuro | cartões de evento |
| `--control-h` | `38px` | igual | altura única de input, select, seletor de cor e botão |

Derivados por tela (apontam para os tokens acima; mantenha assim): `--cg-*` no Gerador de Cartazes (`cartaz-generator.css`, onde `--cg-accent` = `--accent-text`) e `--pe-*` no Editor de Posts (`post-editor.css`: `--pe-yellow` = `--accent`, `--pe-ink` = `--text`, `--pe-muted`, `--pe-line` = `--border`, `--pe-panel` = `--card`, `--pe-bg` = `--bg`).

Cores fixas que existem de propósito: a folha `.sheet` do cartaz é arte de impressão e **nunca muda com o tema nem com a marca** (texto `#18242d`); no escuro ganha só um contorno `rgba(255,255,255,.16)`.

## 9. Texto, botões, modais e transições

### Tamanhos de texto da interface

| Elemento | Tamanho / peso |
|---|---|
| Campo (`input`, `select`, `textarea`) | 14px |
| Botão `.btn` | 13px / 700 (`.small`: 12px) |
| Item de menu e de lista (`.portal-nav-item`, `.toolbar-more-item`, menu da conta) | 12.5–13px / 700 |
| Antetítulo `.page-kicker` | 12px / 800, caixa alta, `letter-spacing:.12em`, cor `--accent-text` |
| Iniciais do avatar de marca | 11.5px / 900 |

### Botões e campos

- Altura única `--control-h` (38px) em campo, select, seletor de cor e botão, para alinhar lado a lado. `.small` = 28px. Raio `--radius-sm`.
- `.btn` padrão: fundo `--accent`, texto `--on-accent`, hover `--accent-hover`. Uma ação principal por área.
- `.btn.ghost`: fundo `--card`, borda `--border`, hover `--surface-muted`. `.btn.ghost.danger`: texto `--danger`, borda `--danger-border`, hover `--danger-bg`.
- Desabilitado: cursor `not-allowed` (ver §3).

### Modais

- Padrão do portal (`styles.css`): `.modal-backdrop` (fixo, `--backdrop`, `z-index:60`, `padding:20px`) + `.modal` (`--card`, `--radius-lg`, `--shadow-lg`, máx. 820px, `max-height:90vh`) com `.modal-header`, `.modal-body` (rola) e `.modal-footer` (botões à direita). Larguras: `.modal-sm` 420px, `.modal--narrow` 440px, `.modal--wide` 900px.
- O Gerador de Cartazes usa `<dialog class="cg-dialog">` (§5) com as variáveis `--cg-*`.
- Em modal novo, só o corpo rola; cabeçalho e rodapé ficam fixos.

### Transições

| Onde | Duração |
|---|---|
| Hover de botão, menu, item, borda e campo | `.12s` |
| Troca de tema (`body`: fundo e cor) | `.2s` |
| Largura da sidebar | `.2s ease` |
| Sanfonas e dropdowns | `.25s ease` (§1) |
| Menus flutuantes ⋮ | `.12s` (§1) |

Toda animação nova respeita `prefers-reduced-motion`.

### Armadilha do atributo `hidden`

Um `display:flex`/`grid` escrito no CSS vence o atributo `hidden`. Em todo elemento que tem `display` próprio e usa `hidden`, repita `.x[hidden]{display:none}` (exemplo: `.portal-nav-item[hidden]`).

### Validação visual

Mudança de canvas, cor ou layout só é entregue depois de renderizar de verdade (Chrome headless, skill `run`) e conferir nos **dois** temas. Limite de ~2 rodadas de screenshot por bug (ver AGENTS.md).

## 10. Espaçamento

Não há tokens `--space-*`. O levantamento (contagem de `padding`/`gap`/`margin` em todos os CSS, 21/10/2026) mostrou que a escala real não é de múltiplos de 4: 8px (217), 10px (213), 6px (163), 12px (154), 4px (117), 14px (111), 16px (84), 24px (44).

- **Código novo:** use 4, 8, 12, 16, 20 e 24px. 6px e 10px são tolerados como "meio passo" já consagrado.
- **Evite** 5, 7, 9, 11 e 13px (cerca de 190 usos legados). Não migre o legado em lote; ajuste só ao mexer no componente.
- Padding da página: `.portal-main` 28px (18px 14px em ≤760px). Padding de modal: `16px 18px`.

## 11. Estados de vazio, carregamento e erro

Não existe padrão único: há mais de 20 classes "empty" e nenhum spinner. Regra para código novo, espelhando o que já predomina:

- **Vazio:** bloco centralizado, texto `--muted`, borda tracejada, `--radius-md`, `padding:44px 20px`, 13px (`.list-empty`, `styles.css`). Quando houver ícone e título, siga `.marcas-empty` (`marcas.css`). Texto no formato "Nenhum(a) X …" com ponto final.
- **Carregando:** skeleton com brilho (`.is-loading` + `marcas-shimmer` em `marcas.css`; `.pe-skeleton` em `post-editor.css`), com `animation:none` em `prefers-reduced-motion`. Evite "Carregando…" solto e não crie spinner.
- **Item adicionado a partir de uma lista que continua aberta:** a linha confirma antes de sair: fundo `--success-bg`, texto `--success` e "✓ Adicionado" por ~0,55 s, depois recolhe a altura em `.25s ease` e só então sai do DOM (sem transição em `prefers-reduced-motion`). Referência: `.autocomplete-item.is-added`/`.is-leaving` (`styles.css`) e `renderProductAutocomplete` (`app.js`).
- **Erro de campo:** `aria-invalid="true"` + `.is-invalid` (borda `--danger`, texto de ajuda `--danger`). Referência: `business-card-generator.css` e `conecta-fg.html`.
- **Mensagem de região:** `role="alert"` para erro e `role="status"` para informação (referência: `.auth-message`, `.cf-alert`).
- **Sem dados ainda** (coleta automática): texto explícito, como "Aguardando coleta" (`followers-dashboard.js`), nunca gráfico vazio sem explicação.

## 12. Toasts, avisos e confirmações

Hoje há **4 implementações paralelas** de toast (`.portal-notice` em `app.js`/`styles.css`, `.toast` do Gerador de Cartazes, `.toast` de `consolidado-generator.css`/`marcas.css`, `.bc-toast`), com durações de 3,2 a 4,2 s, e cerca de 63 chamadas nativas de `alert()`/`confirm()` (maioria em `app.js`, `templates.js`, `portal-shell.js`, `followers-dashboard.js`, `qr-code-generator.js`).

Regra para código novo:

- **Nada de `alert()`, `confirm()` ou `prompt()`.** Aviso = toast; confirmação destrutiva = modal (`<dialog class="cg-dialog">` ou o modal de confirmação de `consolidado-generator.js`).
- **Toast:** canto inferior direito, 24px da borda, `max-width:min(420px, calc(100vw - 40px))`, fundo `--card` com borda `--border-strong`, 13px/700, 4 s, `role="status"` (`role="alert"` se for erro). Base: `.portal-notice`.
- O toast precisa ficar **acima** de modais e menus (ver camadas, §13).

## 13. Camadas (`z-index`)

Valores em uso hoje, do menor para o maior: conteúdo interno 1–6; dropdowns de página 20–50; `.modal-backdrop` 60; autocomplete 80; popovers de marca/ícone 200; lightbox 500; modais de status e menus de evento 1000–1005; gavetas 1100–1200; menus ⋮ 1500; fantasma de arrastar 2000; toasts do Consolidado/Marcas 3000.

Problema conhecido: o `.portal-notice` global está em 120, **abaixo** de menus e modais de status. Para código novo, use estas camadas: dropdown **50**, modal **1000**, menu flutuante **1500**, fantasma de arrastar **2000**, toast **3000**. Não invente valor novo entre elas.

## 14. Acessibilidade

- **Sanfonas e menus:** `aria-expanded` no botão que abre; conteúdo fechado escondido com `inert` (referência: `followers-dashboard.js`, `intelligence-center.js`).
- **Botão só de ícone:** sempre `aria-label`.
- **Modais:** `role="dialog" aria-modal="true"` com `aria-labelledby`, foco preso, Esc fecha, foco volta ao elemento de origem. O `<dialog>` com `showModal()` já entrega isso de graça (preferido). Modal montado à mão em `portal-shell.js` (`.modal-backdrop` aberto com `style.display='flex'`): chame `wireModalA11y(backdrop, close)` logo após definir `close`; ele cobre tudo isso.
- **Foco visível:** campos usam borda `--accent-ink` + anel `0 0 0 3px var(--accent-weak)`; checkbox usa `outline:2px solid var(--accent)` com offset 2px. Botões e itens de menu usam `outline:2px solid var(--accent-text)` com offset 2px (regra única com `:is(...)` em `styles.css`, junto de `.btn`: `.btn`, `.btn-icon`, `.portal-nav-item`, `.portal-account-menu-item`, `.toolbar-more-item`, `.portal-brand-trigger`, `.view-toggle button`). Controle clicável novo: acrescente-o a essa lista, ou ponha o mesmo `:focus-visible`; não remova o `outline` sem um anel equivalente.
- **Movimento:** toda animação ou transição nova tem bloco `@media (prefers-reduced-motion: reduce)`.
- **Toque:** alvos clicáveis em telas de uso por celular com pelo menos 36px (o padrão `--control-h` é 38px; `.small` com 28px só para desktop).
- **Contraste:** `--text-faint` (`#9a9a98`) no tema claro fica abaixo de 4,5:1 sobre fundo branco; não use para texto que carregue informação, só para placeholder e dica.

## 15. Responsividade

Hoje há 20 valores de `max-width` diferentes. O mais usado é **760px**, seguido de 720, 700 e 600. Para código novo, use só estes três: **1000px**, **760px** e **560px**.

- ≤1000px: grades de várias colunas caem para 2 (ex.: `.grid-week`).
- ≤760px: a sidebar fica recolhida só com ícones (72px), sem submenus, e `.portal-main` usa `padding:18px 14px`. Não há gaveta nem menu hambúrguer.
- Telas sem nenhum `@media` hoje (não pensadas para celular): `admin-users`, `intelligence-center`, `monitoramento`, `visual-editor`, `post-editor.html`, `login`.

## 16. Padrões menores recorrentes

- **Scrollbar** fina (Gerador de Cartazes): `scrollbar-width:thin`, trilho transparente, 8px com polegar arredondado em 4px e hover em `--accent` (`cartaz-generator.css`). A sidebar esconde a barra.
- **Barra lateral do card do calendário** (`.event-bar`, decidido em 23/10/2026): a cor diz o tipo da publicação, não a editoria. Vídeo = `--type-video` (laranja), estático = `--type-static` (verde médio); card com várias redes fica laranja se alguma for vídeo. A editoria continua colorida no texto acima do título. A visão Lista (`.list-row-bar`) ainda usa a cor da editoria.
- **Chips de rede:** `.chip-net`. Não há `.badge` único nem cores semânticas de status; ao criar um, use `--success*`, `--danger*` e o amarelo/âmbar da marca.
- **Tabelas:** não existe padrão; listas são grades ou `flex`.
- **Hover de cartão do calendário:** `.event` usa `.15s` e `translateY(-2px)` (`styles.css`), exceção ao `.12s` da §9.
- **Sugestões de uma tela** (decidido em 23/10/2026, piloto na vista do galpão do Calendário no mapa da Início, `.hm-visit`/`.hm-sug` em `index.css`): cada sugestão tem **um dado real, um verbo e um destino**: chip de urgência (`Urgente` = `.hm-chip.is-bad`, `Atenção` = `.is-warn`, `Ideia` = `.is-ok`), frase curta, linha de contexto em `--muted` e um link de ação (`Criar post →`) que já abre a tela no ponto certo (`?post=`, `?date=…&commemorative=1`). Ordem: urgentes, depois atenção, depois ideias; no máximo 5 visíveis e o resto em "Mostrar mais N" (sanfona da §1). Carregando = skeleton (§11); vazio = bloco tracejado "Nenhuma pendência…". Sempre fecha com a nota "Sugestões automáticas por regras fixas… Confira antes de usar." (política de IA, 5.1). Escala de texto do painel: 12px (antetítulo/seção em caixa alta 800, chips, nota), 13px (contexto), 14px (descrição, ações), 15px/700 (frase da sugestão), 20px/800 (título); espaços de 24px nas bordas, 16px entre blocos, 12px entre cards. Cabeçalho e ação principal ficam fixos e só a lista rola. Painel lateral não modal (`role="dialog"` sem `aria-modal`, Esc fecha, foco no botão principal ao abrir): a cena continua utilizável ao lado. Ao levar as sugestões para dentro das telas, reaproveite este formato.

## 17. Divergências conhecidas (ainda não corrigidas)

Levantadas em 21/10/2026. Documentadas para não virarem referência por engano.

- **Estilo inline** pesado em `visual-editor.html` (~88), `followers-dashboard.html` (~18), `templates.html` (~11).
- Raios fora do token `--radius-*`: 7, 9, 10, 14, 15 e 18px em componentes pontuais (o `<dialog class="cg-dialog">` já usa `--radius-lg` e `--backdrop`).

Corrigidas em 21/10/2026, para referência: `.btn:disabled` sem `pointer-events:none` (e hovers só fora de `:disabled`); foco visível global em botões e itens de menu (§14); `cursor:not-allowed` em `.cs-use:disabled` e `.sched-day-chip`; os 5 modais montados em `portal-shell.js` ganharam `aria-labelledby`, Esc, foco preso e retorno de foco (`wireModalA11y`, com teste em `tests/portal-shell-modal.test.html`); `prefers-reduced-motion` em `business-card-generator.css` (`bcStepFlash`), `monitoramento.html`, `intelligence-center.html` e `.portal-notice` (`auth.css`, `admin-users`, `login`, `usage-dashboard` e `visual-editor` não têm animação nem transição, então nada a fazer).

### Adequações pendentes ao item 1 (levantadas, ainda não feitas)

- Submenu do **Gerador** no menu lateral (`.portal-nav-sub` em `styles.css`): abre com `display: none` ↔ `flex`, sem animação.
- Demais `<details>`, menus e sanfonas das outras telas: auditar um a um.
