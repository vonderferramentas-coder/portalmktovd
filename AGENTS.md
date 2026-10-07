# Manutenção do Portal de Marketing OVD

## Visão geral do codebase

Portal estático (HTML/CSS/JS vanilla, sem framework/build step) multi-marca para agência de marketing: calendário de postagens (`visual-editor.html`), editor de artes (`post-editor.html`), gerador de cartão de visita (`business-card-generator.html`), dashboard de seguidores (`followers-dashboard.html`) e central de inteligência de conteúdo (`intelligence-center.html`), todos atrás de autenticação Firebase e compartilhando `portal-shell.js`/`styles.css`.

**Stack**: JS/HTML/CSS puro (sem bundler), Firebase (Auth + Firestore), Cloudflare Worker + PHP + PowerShell como proxies redundantes de imagem, GitHub Actions para coleta automática de dados de Instagram/Facebook (Meta Graph API) e YouTube (YouTube Data API v3) da VONDER.

Para arquitetura detalhada (módulos, fluxos, gotchas), veja [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Documentação de arquitetura

Sempre que uma alteração criar, remover ou modificar uma integração externa, serviço hospedado, fluxo automático, fonte de dados, credencial, dependência remota, regra de acesso ou diferencial relevante para a TI, atualize `docs/ARQUITETURA-E-INTEGRACOES.md` na mesma mudança.

Não registre tokens, senhas, chaves privadas nem dados pessoais desnecessários na documentação ou no código. Registre o nome do segredo e o local administrativo quando isso for necessário para operação.

## Política de uso de IA do Grupo OVD (30/10/2025)

Esta política vale para todo trabalho de IA neste projeto, inclusive o meu. Se um pedido ou uma ação minha ferir qualquer item abaixo, **pare e questione o usuário antes de continuar**; não execute em silêncio nem "resolva" por conta própria.

**Proibido (seção 5.2):**
- Inserir em IA não corporativa (não contratada diretamente pelo Grupo OVD) informação sigilosa: custos, margens, preços, tabelas de produtos, políticas comerciais, negociações, dados financeiros/contábeis, contratos reais, dados pessoais de colaboradores/clientes/fornecedores/parceiros, e documentos internos, planilhas, apresentações, manuais ou materiais técnicos. O Claude Code é ferramenta **corporativa**, contratada pela TI e cedida ao Marketing; por isso esta vedação não se aplica a ele, e posso ler arquivos do projeto e anexos com esse tipo de dado sem questionar. Ela continua valendo para qualquer *outra* IA (ex.: colar esses dados em ChatGPT/Gemini pessoal, ou enviar a APIs de IA não homologadas), e nesse caso devo avisar.
- Usar e-mail ou telefone corporativo para login em IA não corporativa.
- Usar IA para fins pessoais, para criar decisão automatizada ou decisão estratégica, ou para fornecer informação ao público externo, quando a ferramenta não for corporativa e homologada.
- Gerar ou disseminar conteúdo discriminatório, ofensivo, ilegal, contrário aos valores institucionais, ou que viole direitos autorais/de imagem de terceiros (atenção a imagens, fotos e textos usados nas artes e postagens).
- Substituir análise técnica, jurídica, financeira ou de outra área por resposta de IA sem validação humana e, se for de outro departamento, sem consultá-lo.
- **Usar APIs de ferramentas de IA sem homologação prévia da TI.** Não adicionar chamadas a APIs de IA (Anthropic, OpenAI, Gemini etc.), nem chaves ou dependências desse tipo, sem confirmar essa autorização com o usuário; se adicionadas, registrar em `docs/ARQUITETURA-E-INTEGRACOES.md`.

**Boas práticas (seção 5.1):** todo conteúdo gerado por IA (textos de posts, legendas, pautas, arte) deve ser revisado por uma pessoa antes de ser usado ou divulgado; conferir a exatidão das informações, o tom institucional, os direitos autorais e o Código de Conduta; e, quando a ferramenta permitir, optar por não compartilhar dados para treinamento.

**Incidentes (seção 6):** uso indevido ou possível vazamento deve ser comunicado imediatamente à Encarregada de Proteção de Dados (privacidade@ovd.com.br) e/ou à TI (segurancadigital@ovd.com.br). Se eu suspeitar de um caso, aviso o usuário disso.

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

### Depuração enxuta

Validar renderizando de verdade (Chrome headless) continua obrigatório para mudanças de canvas/cor/layout, mas a investigação de um bug segue o mesmo ponytail: pare no primeiro nível que resolver.

- Limite ~2 rodadas de screenshot por bug. Se a causa raiz não aparecer nessas tentativas, aplique o fix mais seguro disponível (de preferência espelhando um padrão que já funciona em outro lugar do mesmo código) e siga em frente, em vez de continuar escalando a investigação (introspecção de CSSOM, bissecção de stylesheet, etc.) até esgotar a dúvida.
- Não monte um harness de teste novo para validar um caminho de código que já foi exercitado por um teste anterior na mesma tarefa (ex.: reabrir o mesmo modal/fluxo já testado) - revisão de código basta nesses casos.
- Para reler código já visitado na mesma sessão, prefira grep num trecho específico a reler o arquivo inteiro em blocos grandes.

## Guias de margem de segurança nas artes

Toda arte de feed e story (qualquer editoria/marca, inclusive novas) deve ter as guias ciano de margem de segurança do editor (`SAFE_MARGINS` em `post-editor.js`): feed 135px cima / 66px laterais / 190px baixo; story 190px cima / 66px laterais / 190px baixo. Aparecem só ao arrastar/redimensionar o elemento que encosta nelas, barram momentaneamente (passa empurrando mais, como no Instagram) e não saem na exportação. Novos renderers precisam informar a caixa do elemento móvel via `setMoveBox`.
