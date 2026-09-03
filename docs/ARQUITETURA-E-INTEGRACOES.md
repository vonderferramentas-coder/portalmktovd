# Arquitetura e integrações — Portal de Marketing OVD

> **Documento vivo.** Atualize este arquivo na mesma alteração que criar, trocar ou remover uma integração, fonte de dados, automação, serviço hospedado ou recurso que possa gerar dúvida para a TI. A validação automatizada do repositório ajuda a cobrar essa atualização para os principais arquivos de integração.

**Última revisão:** 03/09/2026  
**Escopo desta revisão:** estado identificado no código da branch `main`.

## 1. O que é este projeto

O Portal de Marketing OVD é uma aplicação web para organizar o calendário editorial e apoiar a produção de conteúdo das marcas do grupo. Ele permite planejar posts, editorias, redes, status e formatos; manter marcas e seus materiais; guardar referências e aprendizados por editoria; montar artes com catálogos de produtos; acompanhar seguidores; e gerar cartões de visita.

É uma aplicação predominantemente **estática**: HTML, CSS e JavaScript executados no navegador. Serviços externos entram em cena quando o recurso precisa compartilhar dados entre pessoas, consultar fontes de terceiros ou rodar automaticamente sem um navegador aberto.

## 2. Onde está hospedado

O código-fonte está no repositório GitHub `vonderferramentas-coder/portalmktovd`. A aplicação foi desenhada para publicação no **GitHub Pages**, a hospedagem estática do GitHub; isso é comprovado pelo domínio autorizado no Worker (`vonderferramentas-coder.github.io`) e pelos comentários de implementação.

O GitHub Pages entrega HTML/CSS/JS ao navegador, mas **não executa PHP**. Portanto, `api.php` e `product-image.php` só funcionam quando a pasta é servida por um host com PHP (Apache/IIS ou ambiente local apropriado). A configuração exata e a URL final do Pages devem ser conferidas em **GitHub → Settings → Pages**, pois elas não ficam versionadas neste repositório.

Também existe um serviço publicado em Cloudflare Workers: `https://ecommerce-fg.vonderferramentas.workers.dev`.

## 3. Visão geral da arquitetura

```text
Pessoa usuária / navegador
        |
        +-- GitHub Pages ----------------------------> arquivos estáticos do portal
        |
        +-- Firebase Realtime Database -------------> dados compartilhados do portal
        |
        +-- Cloudflare Worker ----------------------> ofertas FG e imagens públicas OVD
        |                                                  |
        |                                                  +--> fg.com.br
        |                                                  +--> app.ovd.com.br/fotos/produto
        |
        +-- JSON público no GitHub -----------------> painel de seguidores
                                                           ^
                                                           |
GitHub Actions + segredo META_PAGE_ACCESS_TOKEN ------> Meta Graph API / Instagram
```

## 4. Componentes do portal

| Componente | Arquivos principais | Finalidade | Dados |
|---|---|---|---|
| Calendário | `index.html`, `app.js` | Planejar posts, redes, editorias e configurações | Firebase; cópia local como cache/fallback |
| Portal de marcas | `portal-shell.js` | Selecionar/configurar marcas do grupo | Firebase; cópia local |
| Central de Inteligência | `intelligence-center.html`, `intelligence-data.js` | Manter referências e aprendizados por editoria | Firebase; cópia local |
| Editor de posts | `post-editor.html`, `post-editor.js` | Montar artes e usar catálogos de produtos | Catálogos versionados; preferências locais; Firebase para configurações |
| Painel de seguidores | `followers-dashboard.*` | Visualizar histórico e metas | JSON atualizado pelo GitHub Actions; lançamentos manuais locais |
| Cartões de visita | `business-card-generator.*` | Gerar cartões e exportações | Principalmente armazenamento local |

## 5. Integrações e conexões

| Serviço | Função | Dados envolvidos | Credenciais | Ponto de atenção da TI |
|---|---|---|---|---|
| GitHub Pages | Hospeda o front-end estático | Arquivos públicos do portal e JSON de seguidores | Administração do repositório/Pages | Não executa PHP nem deve conter segredos no front-end |
| Firebase Realtime Database | Sincroniza dados entre navegadores | calendário, configurações, marcas e inteligência | Regras do Firebase definem acesso; URL está no JS | Regras não são versionadas aqui: devem ser auditadas no console Firebase |
| Cloudflare Workers | Ponte para ofertas FG e imagens OVD com CORS | URL de oferta, preços públicos, SKU, imagem e código de produto | Nenhuma credencial no Worker atual | Manter validação de origem/destino e não trafegar dados pessoais |
| Meta Graph API | Coleta indicadores do Instagram | seguidores, entradas, saídas e alcance | `META_PAGE_ACCESS_TOKEN` em GitHub Secrets | Token nunca vai para o navegador; requer rotação e escopos mínimos |
| GitHub Actions | Executa a coleta automática e publica JSON | dados agregados de seguidores | GitHub Secret + permissão de escrita | Gera commits automáticos |
| `app.ovd.com.br` | Fonte de fotos oficiais de produto | imagem pública por código | sem credencial no código | Imagem passa pelo Worker/PHP para viabilizar CORS no editor |
| `fg.com.br` | Fonte de ofertas no editor FG | título, marca, SKU, preço e disponibilidade públicos | sem credencial no código | Worker aceita apenas domínio FG e subdomínios |
| Google Fonts | Carrega tipografias da interface | requisição técnica do navegador/IP | não aplicável | Dependência de terceiro: avaliar política corporativa de privacidade |

## 6. Firebase: o que é e por que está conectado

O **Firebase Realtime Database** é um banco de dados em nuvem da Google. No portal, ele funciona como uma pasta compartilhada online: evita que o calendário e as configurações fiquem presos ao navegador de uma pessoa.

### Por que ele foi escolhido

O GitHub Pages hospeda somente arquivos estáticos; não existe PHP sendo executado ali. O Firebase permite que o navegador leia e grave dados por HTTPS sem manter um servidor de aplicação próprio. Assim, a equipe compartilha o calendário e as configurações.

### Como a conexão funciona

`sync-backend.js` centraliza o acesso: as telas chamam apenas `SyncBackend.get()` e `SyncBackend.put()`. O banco configurado é `https://mkt-ovd-default-rtdb.firebaseio.com` e os dados ficam abaixo de `store/`, em registros como:

```json
{ "v": "valor da tela", "updated_at": 0 }
```

As chaves principais são `posts`, `settings`, `intel` e `brands`. Cada marca pode ter sua própria chave com sufixo `__{id-da-marca}`. O campo `updated_at` é uma versão: antes de salvar, o portal verifica se outra pessoa gravou algo mais novo. Em conflito, adota a versão do servidor e avisa a pessoa usuária, reduzindo sobrescritas silenciosas.

### O que a TI deve validar no Firebase

- **Regras de acesso:** a URL do banco não é segredo; a proteção real está nas regras do Realtime Database, ausentes deste repositório. Confirmar quem pode ler/escrever e se acesso anônimo é aceitável.
- **Autenticação:** o código usa REST direto, sem login Firebase no navegador. Se os dados não puderem ser públicos, adotar Firebase Authentication e regras por usuário/grupo ou uma API corporativa autenticada.
- **Dados pessoais:** não armazenar documentos, senhas, tokens, imagens pessoais em base64 ou dados desnecessários.
- **Concorrência:** há leitura seguida de escrita, não transação atômica. É proteção prática para o volume atual, mas alterações simultâneas no mesmo instante ainda são um risco residual.
- **Continuidade:** `localStorage` é cache/fallback, não backup corporativo.

## 7. Cloudflare: o que é e por que está conectado

A **Cloudflare** é uma plataforma de borda que executa pequenos serviços sem manter servidor próprio. O projeto usa o Worker `ecommerce-fg`, cujo código está em `cloudflare-worker.js`.

### Problema que ele resolve

Por segurança, o navegador limita leituras entre sites diferentes (**CORS**). As imagens em `app.ovd.com.br` podem ser exibidas, mas não têm os cabeçalhos necessários para serem desenhadas no canvas usado na exportação de artes. O editor também precisa transformar páginas públicas da FG em dados estruturados de oferta.

O Worker é uma ponte controlada: recebe o pedido, valida parâmetros e domínio, consulta somente a origem permitida e devolve imagem ou JSON com os cabeçalhos CORS necessários.

| Rota | Fonte | Retorno | Controle existente |
|---|---|---|---|
| `/product-image?code=...` | `app.ovd.com.br/fotos/produto` | imagem pública | aceita código numérico de 5 a 20 dígitos; CORS público por ser imagem pública |
| `/product-offer?url=...` | página em `fg.com.br` | título, marca, SKUs, preço, disponibilidade e desconto | aceita apenas `http/https` no domínio `fg.com.br` ou subdomínio |

`post-editor.js` consome o Worker publicado em `https://ecommerce-fg.vonderferramentas.workers.dev`. Para uso local existem `product-image.php`, `product-image-proxy.ps1` e `fg-offer-proxy.ps1`.

### O que a TI deve validar no Cloudflare

- acesso administrativo, responsáveis e processo de deploy;
- logs, retenção e eventual registro de IPs/URLs;
- lista de origens CORS. A imagem é deliberadamente pública; a oferta usa origem controlada;
- limites de uso/custo e comportamento quando o Worker falhar;
- manutenção da validação de host para evitar que o Worker vire proxy aberto;
- termos de uso das fontes, especialmente se a coleta de ofertas crescer.

## 8. Meta e GitHub Actions: painel de seguidores

O dashboard não chama a Meta no navegador, evitando expor o token. Os workflows em `.github/workflows/` executam no GitHub:

- `sync-meta-followers.yml`: consulta seguidores a cada 15 minutos e fecha um ponto diário às 23h55 de São Paulo;
- `reconstruir-historico.yml`: recompõe dias recentes com métricas agregadas da Meta;
- `diagnostico-meta.yml`: verifica alcance/permissões do token sem alterar arquivos.

Eles usam o segredo `META_PAGE_ACCESS_TOKEN` nos **GitHub Actions Secrets** e publicam somente dados agregados em `data/social-followers-live.json` e `data/social-followers.json`. Atualmente, apenas a marca padrão VONDER tem coleta automática; demais marcas e redes são manuais no painel.

Para a TI: aplicar menor privilégio ao token, documentar owner, rotacionar antes de vencer, revisar escopos e limitar quem pode alterar workflows e secrets.

## 9. Persistência local e alternativa PHP/SQLite

O portal mantém uma cópia em `localStorage`, útil como cache e quando não há conexão, mas que pode ser apagada pelo usuário/navegador.

`api.php` é uma alternativa para servidor PHP próprio. Ele usa SQLite (`data.sqlite`) e controle de versão semelhante ao Firebase. O `.htaccess` bloqueia download de `.sqlite` em Apache; uma implantação em IIS deve ter regra equivalente em `web.config`.

**Estado atual:** a camada usada pelo front-end é `SyncBackend`, implementada hoje com Firebase. Logo, `api.php` é opção de contingência/migração, não backend do GitHub Pages. Não tratar o SQLite como backup sem rotina formal de backup, retenção e recuperação.

## 10. Dados, segurança e operação

| Categoria | Exemplos | Tratamento esperado |
|---|---|---|
| Público | artes publicadas, fotos de produto, preços/ofertas públicos, números agregados | podem trafegar nos serviços descritos, respeitando termos de uso |
| Interno | calendário editorial, briefings, referências, configurações e catálogo curado | acesso limitado à equipe e às regras Firebase/GitHub |
| Confidencial/restrito | tokens, chaves, credenciais, dados pessoais não necessários | nunca versionar nem gravar em Firebase/localStorage; usar Secrets/cofre corporativo |

## 11. Como atualizar esta documentação

Antes de liberar novidade que conecte o portal a outro serviço, registrar aqui: serviço e owner; finalidade; URL/domínios e direção do tráfego; dados enviados/recebidos; autenticação e onde credenciais são guardadas; classificação/LGPD, logs e retenção; controles (CORS, allowlist, validação, limite, backup e monitoramento); plano de falha/rollback; e arquivos/workflows alterados.

Nunca incluir segredos. Registre somente o nome do segredo e o local administrativo.

Há duas barreiras de processo:

1. `AGENTS.md` orienta agentes de manutenção a atualizar esta arquitetura junto de alterações relevantes.
2. `.github/workflows/validar-documentacao-arquitetura.yml` falha em pull requests e pushes que mudem os principais arquivos de integração sem mudar este documento.

O workflow não substitui revisão humana: qualquer nova dependência remota, mesmo fora da lista monitorada, exige atualização. Para bloquear o merge, a proteção da branch `main` deve exigir o check **Validar documentação de arquitetura**.

## 12. Histórico deste documento

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Criação do inventário: Firebase, Cloudflare Worker, GitHub Pages/Actions, Meta, fontes OVD/FG, Google Fonts e alternativa PHP/SQLite. | Equipe de Marketing / manutenção do portal |

## 13. Autenticação e controle de acesso (em implantação)

A partir de 03/09/2026, o projeto possui Firebase Authentication com os provedores **e-mail/senha** e **Google** ativados. O domínio `vonderferramentas-coder.github.io` foi autorizado para OAuth. A configuração pública do aplicativo Web está centralizada em `firebase-config.js`; ela não contém credenciais privadas. O botão de login com Google está temporariamente oculto em `login.html` (atributo `hidden`, sem remover o código/import de `firebase-client.js`) — reativar exige apenas remover esse atributo do botão e do divisor "ou".

O Cloud Firestore foi criado para concentrar os documentos `users`, `securityAudit` e, na migração da sincronização, `portalStore`. As regras em `firestore.rules` e no Console Firebase são avaliadas pelo servidor do Firebase: somente perfis com `status: 'active'` podem acessar dados do portal; somente o perfil `role: 'admin'` pode gerenciar usuários e consultar a auditoria. O primeiro administrador é criado manualmente pelo Console, pois não existe administrador anterior que possa autorizá-lo.

A tela `login.html`, com sua camada em `firebase-client.js`, usa Firebase Authentication para autenticar sem armazenar senhas no portal. Sessões usam persistência apenas da sessão do navegador (`browserSessionPersistence`, aplicada explicitamente em `firebase-client.js`) e o portal define duração-alvo de oito horas.

A proteção por login (`auth-guard.js`) já está ativa em todas as páginas do portal: `index.html`, `visual-editor.html`, `post-editor.html`, `intelligence-center.html`, `followers-dashboard.html`, `business-card-generator.html`, `import-legacy-calendar.html`, `admin-users.html` e `migrate-followers.html`. Cada uma marca `<html>` com a classe `auth-pending` (escondida por `auth.css`) até `auth-guard.js` confirmar o acesso ou redirecionar para `login.html`; isso pressupõe que o primeiro administrador já existe no Firestore, criado manualmente pelo Console.

### Limites assumidos no plano Spark (sem cobrança)

O projeto permanece no plano Spark. Não há Cloud Functions nem outro backend privado pago. Portanto, o Firebase aplica seus mecanismos nativos contra abuso, mas o portal não implementa bloqueio temporário customizado por número de tentativas. Os registros em `securityAudit` são básicos e append-only pelas regras, porém não têm o mesmo nível de confiança de uma auditoria produzida exclusivamente por backend. Para requisitos de auditoria inviolável, desativação de conta no Firebase Auth e lockout customizado, será necessária uma camada administrativa de backend no futuro.

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Firebase Authentication (e-mail/senha e Google), Firestore e regras de acesso criados; iniciada integração visual de login sem custo. | Equipe de Marketing / manutenção do portal |

A sincronização das telas do portal foi redirecionada de `sync-backend.js` para `portalStore` no Firestore. O acesso exige perfil ativo e é avaliado pelas regras do Firestore. O painel administrativo (`admin-users.html`) permite, no modo sem custo, criar perfis, enviar redefinição de senha, alterar status e registrar eventos básicos. A desativação bloqueia o acesso aos dados pelas regras, embora não desabilite a conta diretamente no Firebase Authentication — essa ação requer backend administrativo.

**Ponto de atenção para a TI:** as regras atuais liberam leitura e escrita de qualquer documento em `portalStore` (calendário, configurações, marcas, seguidores) para **qualquer** pessoa com perfil ativo, não somente administradores — `migrate-followers.html` exige perfil `admin` apenas na tela (client-side); nada nas regras do Firestore impede uma pessoa ativa não administradora de gravar diretamente em `portalStore/followers-vonder-v1` fora da tela. Isso é uma decisão de desenho consistente com o restante do portal (o calendário também depende de qualquer usuário ativo poder gravar), não uma falha introduzida por esta migração — mas vale revisão caso se queira reservar algum documento a administradores.

### Migração do painel de seguidores

O painel de seguidores passa a consultar o documento protegido `portalStore/followers-vonder-v1` no Cloud Firestore. A página administrativa `migrate-followers.html` é a etapa de cópia controlada: ela lê os arquivos atuais de histórico e snapshot, grava-os no Firestore, compara a quantidade de pontos e o instante do snapshot e registra o evento básico `followers_migrated`. Ela não apaga nem modifica a origem.

Enquanto os arquivos `data/social-followers.json` e `data/social-followers-live.json` permanecerem publicados no repositório, seus dados agregados continuam públicos. A remoção só deve ocorrer após a cópia ser validada, a automação de coleta passar a gravar no Firestore por uma credencial guardada exclusivamente em GitHub Actions Secrets e uma aprovação explícita para a alteração. Isso evita interromper o painel e evita expor tokens ou chaves no navegador.

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Preparada migração controlada dos dados de seguidores para Cloud Firestore protegido, sem exclusão da origem pública. | Equipe de Marketing / manutenção do portal |

### Revisão da migração e correções da proteção por login

Uma revisão de ponta a ponta do fluxo de login e da migração de seguidores encontrou e corrigiu três problemas antes de qualquer uso real:

- `followers-dashboard.js` referenciava a chave do documento protegido (`FOLLOWERS_STORE_KEY`) sem declará-la, e chamava a leitura do Firestore antes de `auth-guard.js` terminar de carregar `firebase-client.js`, por ser um script clássico executado antes do módulo adiado. Corrigido: a chave foi declarada como `'followers-vonder-v1'` (igual à usada em `migrate-followers.js`) e a carga agora aguarda o evento `portal-firebase-ready`, já disparado por `firebase-client.js`.
- Sete das nove páginas com `auth-guard.js` (`index.html`, `visual-editor.html`, `post-editor.html`, `intelligence-center.html`, `followers-dashboard.html`, `business-card-generator.html`, `import-legacy-calendar.html`) não carregavam `auth.css`, então a classe `auth-pending` não escondia a página: qualquer visitante via a tela por um instante antes da verificação de login terminar. Corrigido adicionando o `<link>` de `auth.css`, no mesmo padrão já usado em `admin-users.html` e `migrate-followers.html`.
- `firebase-client.js` importava `setPersistence`/`browserSessionPersistence` mas nunca os aplicava, então a sessão usava a persistência padrão do Firebase (sobrevive ao fechar o navegador) em vez da persistência apenas de sessão já descrita nesta documentação. Corrigido chamando `setPersistence` na inicialização.

A revisão do restante do fluxo de migração (`migrate-followers.js`, `firestore.rules`, leitura em `followers-dashboard.js`) não encontrou outras inconsistências: os nomes de campo e a chave do documento batem entre os três arquivos, e a validação de contagem/timestamp após a cópia está correta.

**Limite desta verificação:** o ambiente usado não tem login real nem, no momento do teste, uma forma confiável de simular a ida ao Firestore autenticado — os testes em Chrome headless confirmaram que a página não quebra e que o conteúdo fica oculto até a checagem terminar, mas o fluxo completo (login real, leitura autenticada do Firestore, redirecionamento) ainda precisa ser validado manualmente pela equipe.

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Revisão de ponta a ponta da proteção por login e da migração de seguidores: corrigida chave indefinida e corrida de inicialização em `followers-dashboard.js`, adicionado `auth.css` a sete páginas que não escondiam o conteúdo durante a checagem de login, e corrigida a persistência de sessão em `firebase-client.js`. | Equipe de Marketing / manutenção do portal |

### Menu lateral: item de administração e conta logada

`auth-guard.js` ganhou um mecanismo genérico: qualquer elemento marcado `data-admin-only hidden` em qualquer página é revelado automaticamente quando o perfil confirmado é `admin` (antes, essa revelação só existia para o card de `index.html`). O menu lateral (`portal-shell.js`) usa isso para mostrar o item **Usuários e acessos** só para administradores — o acesso direto pela URL para quem não é admin já era bloqueado antes por `data-auth-role="admin"` em `admin-users.html`; a novidade é só a visibilidade no menu.

`admin-users.html` passou a usar a mesma casca do resto do portal (`portal-shell.js`: navegação, seletor de marca, aparência claro/escuro, recolher menu) — antes tinha um cabeçalho próprio, sem sidebar. Todas as páginas protegidas ganharam também uma barra de conta no rodapé da sidebar (nome, e-mail e botão de sair), que antes só existia na página inicial.

`admin-users.html` ganhou um botão **Editar** por usuário (nome, e-mail informativo e perfil), usado para corrigir um problema encontrado em produção: os dois primeiros administradores, criados manualmente no Console por não haver admin anterior para usar a tela, tiveram o documento inteiro do Firestore (nome e e-mail) arquivado sob o UID trocado — o UID de cada pessoa no Firebase Authentication precisa ser exatamente o ID do documento em `users/{uid}` no Firestore; qualquer inversão nessa etapa manual faz a pessoa certa logar e ver os dados da outra. **Para a TI:** ao criar um administrador manualmente pelo Console daqui em diante, confirmar o UID em Authentication → Users antes de criar o documento em Firestore com esse mesmo ID como nome do documento.

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Login com Google oculto na tela (mantido no código); menu lateral com item de administração visível só para admins e barra de conta/logout em todas as páginas protegidas; `admin-users.html` unificado com a sidebar do portal; adicionada edição de usuário para corrigir documentos do Firestore arquivados sob o UID errado. | Equipe de Marketing / manutenção do portal |

### Correções após o primeiro uso em produção com uma conta não administradora

Um teste real com uma conta de perfil `user` (Monique) encontrou dois problemas que só apareciam fora do ambiente de teste:

- O card "Usuários e acessos" na página inicial (`index.html`) usava `data-admin-only hidden`, mas `.tool-card` define `display:flex` no CSS — a mesma armadilha do botão do Google em `login.html` e do item do menu lateral (a regra nativa do navegador para `[hidden]` perde para qualquer `display` definido pelo autor). Resultado: o card ficava visível para **qualquer** pessoa logada, não só administradores. Corrigido com `.tool-card[hidden]{display:none}` em `index.css`.
- Ao clicar nesse card sendo `user`, `auth-guard.js` negava o acesso a `admin-users.html` e — como qualquer negação de acesso — **deslogava a pessoa do portal inteiro** antes de mandar para `login.html`, que por sua vez nunca lia o parâmetro de motivo do redirecionamento. Resultado prático: tela de login sem nenhuma mensagem e a necessidade de logar de novo a cada tentativa, parecendo um travamento. Corrigido: falta de permissão para uma página específica agora só avisa (`alert`) e volta para `index.html`, sem encerrar a sessão; a mensagem de motivo passou a aparecer de fato em `login.html` para os casos que continuam exigindo login de novo (sessão expirada ou conta ainda pendente de aprovação).

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Corrigido card de administração visível para qualquer usuário em `index.html` (`[hidden]` sem efeito por causa do `display:flex` do `.tool-card`) e o logout forçado/sem mensagem ao negar acesso por perfil incompatível. | Equipe de Marketing / manutenção do portal |

### Redefinição de senha pelo próprio usuário

Até aqui, quem não era administrador não tinha nenhuma forma de trocar a própria senha pelo portal (a área de administração, único lugar com esse tipo de ação, é restrita a admins). A barra de conta no rodapé da sidebar (`#portalAccountBar`, em `portal-shell.js`) passou de um simples indicador com botão de sair para um gatilho clicável que abre um menu para cima (reaproveita o posicionamento de popover já usado pelo seletor de marca, só que ancorado embaixo em vez de embaixo do topo) com dois itens:

- **Redefinir senha** — abre um modal de confirmação centralizado (mesmo padrão visual `.modal-backdrop`/`.modal` usado em outros modais do portal) mostrando o e-mail da própria conta antes de disparar `window.PortalFirebase.requestPasswordReset(email)` (que chama `sendPasswordResetEmail` do Firebase Auth) — evita o envio acidental de um e-mail de redefinição com um clique só.
- **Sair** — mesmo logout de sempre.

O ícone de sair isolado continua também na própria barra, como atalho de um clique (com `stopPropagation` para não abrir o menu ao mesmo tempo).

Os dois itens do menu usam classes próprias (`.portal-account-menu-item`, com um `.portal-account-menu-divider` — linha fina de 1px — entre eles) em vez de reaproveitar o estilo de "pílula" com fundo arredondado da lista de marcas: a ideia é que leiam como itens de um submenu (lista), não como botões soltos. Testado em claro e escuro via Chrome headless.

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Barra de conta da sidebar virou um menu dropdown (Redefinir senha / Sair) com itens em estilo submenu, mais modal de confirmação antes do envio do e-mail de redefinição — dá ao perfil `user` uma forma própria de trocar a senha. | Equipe de Marketing / manutenção do portal |