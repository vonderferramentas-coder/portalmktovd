# Revisor de Planilha (marca VONDER, seção Diagramação)

Tudo da tela mora nesta pasta, para facilitar uma reorganização futura do projeto.

| Arquivo | Para que serve |
|---|---|
| `revisor-planilha.js` | Lógica da tela: diferença por palavra, grupos, lista virtualizada, exportação |
| `revisor-planilha-worker.js` | Lê e grava o .xlsx em segundo plano (planilha com mais de 240 mil linhas). Usa `../vendor/xlsx.full.min.js` |
| `revisor-planilha.css` | Visual da tela |
| `revisor-planilha.test.html` | Teste da função de diferença (abrir no navegador: `data-result` vira `ok`) |

## Fora desta pasta (ao mover, ajustar)

- `revisor-planilha.html` na raiz: URL e menu dependem do nome (regra do AGENTS.md). Aponta para os arquivos desta pasta.
- `portal-shell.js`: grupo "Diagramação" e item "Revisor de Planilha" em `NAV_ITEMS` (`brands:['default']`, só VONDER).
- `vendor/xlsx.full.min.js`: usado pelo Worker (caminho relativo ao Worker: `../vendor/`).

Os dados da planilha são lidos só no navegador; nada é enviado a servidor.
