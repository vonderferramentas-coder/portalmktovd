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
- Foco visível usa a cor de destaque (`--cg-accent`).

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

## 6. A detalhar

- Paleta, tipografia e escala de espaçamento (hoje espalhadas em `styles.css` e `cartaz-generator.css`).
- Componentes padrão: botões, campos, cards, avisos, toasts.
- Estados de carregamento, vazio e erro.
- Acessibilidade (ordem de foco, `aria-*` dos componentes expansíveis).

### Adequações pendentes ao item 1 (levantadas, ainda não feitas)

- Submenu do **Gerador** no menu lateral (`.portal-nav-sub` em `styles.css`): abre com `display: none` ↔ `flex`, sem animação.
- Demais `<details>`, menus e sanfonas das outras telas: auditar um a um.
