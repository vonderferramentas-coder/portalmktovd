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

## 6. A detalhar

- Paleta, tipografia e escala de espaçamento (hoje espalhadas em `styles.css` e `cartaz-generator.css`).
- Componentes padrão: botões, campos, cards, avisos, toasts.
- Estados de carregamento, vazio e erro.
- Acessibilidade (ordem de foco, `aria-*` dos componentes expansíveis).

### Adequações pendentes ao item 1 (levantadas, ainda não feitas)

- Submenu do **Gerador** no menu lateral (`.portal-nav-sub` em `styles.css`): abre com `display: none` ↔ `flex`, sem animação.
- Demais `<details>`, menus e sanfonas das outras telas: auditar um a um.
