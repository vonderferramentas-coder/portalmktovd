# Manutenção do Portal de Marketing OVD

## Visão geral do codebase

Portal estático (HTML/CSS/JS vanilla, sem framework/build step) multi-marca para agência de marketing: calendário de postagens (`visual-editor.html`), editor de artes (`post-editor.html`), gerador de cartão de visita (`business-card-generator.html`), dashboard de seguidores (`followers-dashboard.html`) e central de inteligência de conteúdo (`intelligence-center.html`), todos atrás de autenticação Firebase e compartilhando `portal-shell.js`/`styles.css`.

**Stack**: JS/HTML/CSS puro (sem bundler), Firebase (Auth + Firestore), Cloudflare Worker + PHP + PowerShell como proxies redundantes de imagem, GitHub Actions para coleta automática de dados de Instagram/Facebook (Meta Graph API) e YouTube (YouTube Data API v3) da VONDER.

Para arquitetura detalhada (módulos, fluxos, gotchas), veja [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Documentação de arquitetura

Sempre que uma alteração criar, remover ou modificar uma integração externa, serviço hospedado, fluxo automático, fonte de dados, credencial, dependência remota, regra de acesso ou diferencial relevante para a TI, atualize `docs/ARQUITETURA-E-INTEGRACOES.md` na mesma mudança.

Não registre tokens, senhas, chaves privadas nem dados pessoais desnecessários na documentação ou no código. Registre o nome do segredo e o local administrativo quando isso for necessário para operação.

## Ponytail: desenvolvimento enxuto

Atue como um desenvolvedor sênior eficiente, não descuidado: o melhor código é o código que não precisou ser escrito.

Antes de escrever código, pare no primeiro nível que resolver o problema:

1. Isso precisa mesmo ser construído? (YAGNI)
2. Já existe neste código? Reutilize o helper, utilitário ou padrão existente.
3. A biblioteca padrão já resolve? Use-a.
4. Um recurso nativo da plataforma resolve? Use-o.
5. Uma dependência já instalada resolve? Use-a.
6. Pode ser uma linha? Faça em uma linha.
7. Só então escreva o mínimo de código que funcione.

Use essa sequência depois de entender a solicitação: leia o código afetado e siga o fluxo real de ponta a ponta antes de escolher a solução.

Em correções, trate a causa-raiz, não só o sintoma. Verifique todos os chamadores da função alterada e, quando fizer sentido, corrija a função compartilhada uma vez em vez de criar proteções duplicadas nos chamadores.

- Não crie abstrações que não foram pedidas.
- Evite novas dependências.
- Não acrescente boilerplate desnecessário.
- Prefira remover a adicionar, soluções simples a soluções engenhosas e o menor número de arquivos possível.
- Prefira o menor diff funcional somente depois de compreender o problema; uma mudança pequena no lugar errado cria outro bug.
- Questione solicitações complexas quando uma alternativa mais simples já atender ao objetivo.
- Entre opções equivalentes da biblioteca padrão, escolha a que cobre corretamente os casos de borda.
- Ao adotar uma simplificação deliberada com limitação real (por exemplo, lock global, varredura O(n²) ou heurística ingênua), registre `ponytail:` em comentário, indicando a limitação e o caminho de evolução.

Não simplifique a compreensão do problema, validação de entradas em fronteiras de confiança, prevenção de perda de dados, segurança, acessibilidade, calibração com hardware real nem requisitos explícitos. Lógica não trivial deve deixar uma verificação executável mínima (um teste pequeno ou demonstração com `assert`); one-liners triviais não precisam de teste.
