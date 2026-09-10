# Arquitetura e integrações — Portal de Marketing OVD

> **Documento vivo.** Atualize este arquivo na mesma alteração que criar, trocar ou remover uma integração, fonte de dados, automação, serviço hospedado ou recurso que possa gerar dúvida para a TI. A validação automatizada do repositório ajuda a cobrar essa atualização para os principais arquivos de integração.

**Última revisão:** 10/09/2026  
**Escopo desta revisão:** estado identificado no código da branch `main`, incluindo o início da conexão do TikTok (conta Vonder) ao painel de Redes Sociais — app em análise (App Review) na TikTok for Developers, ainda sem coleta automática.

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
GitHub Actions + segredo META_PAGE_ACCESS_TOKEN ------> Meta Graph API / Instagram + Facebook
GitHub Actions + segredo YOUTUBE_API_KEY -------------> YouTube Data API v3 / canal Vonder
GitHub Actions + segredos YOUTUBE_OAUTH_* ------------> YouTube Analytics API / canal Vonder
```

## 4. Componentes do portal

| Componente | Arquivos principais | Finalidade | Dados |
|---|---|---|---|
| Calendário | `index.html`, `app.js` | Planejar posts, redes, editorias e configurações | Firebase; cópia local como cache/fallback |
| Portal de marcas | `portal-shell.js` | Selecionar/configurar marcas do grupo | Firebase; cópia local |
| Central de Inteligência | `intelligence-center.html`, `intelligence-data.js` | Manter referências e aprendizados por editoria | Firebase; cópia local |
| Editor de posts | `post-editor.html`, `post-editor.js` | Montar artes e usar catálogos de produtos | Catálogos versionados; preferências locais; Firebase para configurações |
| Painel de seguidores | `followers-dashboard.*` | Visualizar histórico, metas e ranking dos melhores posts | JSON atualizado pelo GitHub Actions; lançamentos manuais locais |
| Cartões de visita | `business-card-generator.*` | Gerar cartões e exportações | Principalmente armazenamento local |

## 5. Integrações e conexões

| Serviço | Função | Dados envolvidos | Credenciais | Ponto de atenção da TI |
|---|---|---|---|---|
| GitHub Pages | Hospeda o front-end estático | Arquivos públicos do portal e JSON de seguidores | Administração do repositório/Pages | Não executa PHP nem deve conter segredos no front-end |
| Firebase Realtime Database | Sincroniza dados entre navegadores | calendário, configurações, marcas e inteligência | Regras do Firebase definem acesso; URL está no JS | Regras não são versionadas aqui: devem ser auditadas no console Firebase |
| Cloudflare Workers | Ponte para ofertas FG e imagens OVD com CORS | URL de oferta, preços públicos, SKU, imagem e código de produto | Nenhuma credencial no Worker atual | Manter validação de origem/destino e não trafegar dados pessoais |
| Meta Graph API | Coleta indicadores do Instagram e da Página do Facebook da VONDER | Instagram: seguidores, entradas, saídas, alcance; e por post: legenda, permalink, miniatura, data, curtidas, comentários, interações totais, visualizações e salvamentos. Facebook: seguidores/curtidas da Página (`followers_count`/`fan_count`) | `META_PAGE_ACCESS_TOKEN` em GitHub Secrets — mesmo token de Página usado para o Instagram, já alcança a Página sem escopo adicional | Token nunca vai para o navegador; requer rotação e escopos mínimos |
| YouTube Data API v3 | Coleta inscritos/visualizações do canal Vonder no YouTube | inscritos (`subscriberCount`) e visualizações totais (`viewCount`) do canal — agregados e públicos | `YOUTUBE_API_KEY` em GitHub Secrets — API Key restrita à YouTube Data API v3, sem OAuth (só lê dado público de canal) | Chave nunca vai para o navegador; se o canal ocultar a contagem de inscritos, a API para de devolver o número real |
| YouTube Analytics API | Reconstrução única do histórico de inscritos do canal Vonder | inscritos ganhos/perdidos por dia (`subscribersGained`/`subscribersLost`) — agregado do canal, sem dado pessoal de quem se inscreveu | `YOUTUBE_OAUTH_CLIENT_ID`/`YOUTUBE_OAUTH_CLIENT_SECRET`/`YOUTUBE_OAUTH_REFRESH_TOKEN` em GitHub Secrets — OAuth 2.0, autorizado uma única vez por quem administra o canal | Refresh token nunca vai para o navegador; se revogado (troca de senha, revogação manual), a reconstrução exige nova autorização única |
| GitHub Actions | Executa a coleta automática e publica JSON | dados agregados de seguidores; e snapshot dos posts recentes com suas métricas | GitHub Secret + permissão de escrita | Gera commits automáticos |
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

- `sync-meta-followers.yml`: consulta seguidores do Instagram e, desde 09/09/2026, da Página do Facebook da VONDER (`262406600508752`) a cada 15 minutos, e fecha um ponto diário às 23h55 de São Paulo para as duas redes;
- `reconstruir-historico.yml`: recompõe dias recentes do Instagram com métricas agregadas da Meta; descarta e refaz `reconstruido`/`estimado` só dentro da janela de ~29 dias que a própria execução consulta — nunca fora dela, para não apagar para sempre um dia que a Meta não deixa mais recalcular (bug corrigido em 09/09/2026, que vinha zerando dias fora da janela a cada execução diária);
- `reconstruir-historico-facebook.yml`: carga única (`workflow_dispatch`) que busca `page_follows` (total acumulado de seguidores por dia) em pedaços de 90 dias — limite máximo por chamada imposto pela Meta — andando para trás no tempo até a Meta parar de devolver pontos, e mescla só a chave `Facebook` de `followers` em cada dia de `data/social-followers.json`; nunca cria/edita `insights` nem `followers.Instagram`, e dias sem registro anterior nascem com `"source": "reconstruido"`;
- `diagnostico-meta.yml`: verifica alcance/permissões do token para métricas de conta do Instagram, sem alterar arquivos — cada resposta vai tanto para o resumo da execução quanto para o log bruto do passo, para dar para investigar direto pela CLI (`gh run view --log`) sem depender de abrir o navegador;
- `diagnostico-meta-facebook.yml`: verifica a que Página pertence o token (`/me`) e se ele alcança `followers_count`/`fan_count` da Página, sem alterar arquivos — foi o que confirmou o ID `262406600508752` e que nenhum escopo novo era necessário;
- `diagnostico-meta-facebook-historico.yml`: verifica os escopos (`scopes`) do token via `debug_token` e até onde `page_follows` (total acumulado de seguidores por dia) deixa puxar de uma vez, sem alterar arquivos — a permissão `read_insights` estava faltando no `META_PAGE_ACCESS_TOKEN` original (corrigido em 09/09/2026, gerando um novo token com essa permissão a mais pelo Graph API Explorer, sem precisar de revisão de app da Meta); com ela, `page_follows` responde com o histórico diário real, ao contrário de `page_fans`/`page_fan_adds_unique`/`page_fan_removes_unique` (descontinuadas) e `page_daily_follows_unique`/`page_daily_unfollows_unique` (vazias mesmo com a permissão);
- `sync-meta-posts.yml`: a cada 6 horas, busca os 30 posts mais recentes do Instagram (legenda, permalink, miniatura, data, curtidas e comentários) e, para cada um, as métricas de `/insights` (interações totais, visualizações e salvamentos), sobrescrevendo `data/social-posts.json` inteiro a cada execução — não existe histórico por dia aqui, só o snapshot mais recente para alimentar o ranking de melhores posts;
- `diagnostico-meta-posts.yml`: verifica alcance/permissões do token para dados de posts (mídia e insights por post), sem alterar arquivos — foi o que confirmou que o token atual já alcança `like_count`/`comments_count` na listagem de mídia e `total_interactions`/`views`/`saved` em `/insights` (o nome legado `engagement` foi descontinuado pela Meta).

Eles usam o segredo `META_PAGE_ACCESS_TOKEN` nos **GitHub Actions Secrets** e publicam dados agregados/públicos do Instagram e do Facebook da própria marca (nunca dados pessoais de terceiros) em `data/social-followers-live.json`, `data/social-followers.json` e `data/social-posts.json`. Atualmente, apenas a marca padrão VONDER tem coleta automática (Instagram e Facebook); demais marcas e redes são manuais no painel. A coleta de posts (`sync-meta-posts.yml`) continua exclusiva do Instagram.

Para a TI: aplicar menor privilégio ao token, documentar owner, rotacionar antes de vencer, revisar escopos e limitar quem pode alterar workflows e secrets.

## 9. YouTube e GitHub Actions: painel de seguidores

Segue o mesmo desenho da seção 8: o dashboard nunca chama a API do YouTube no navegador, e a chave nunca é exposta ao público que abre o portal. Diferença central em relação à Meta: a YouTube Data API v3 não usa OAuth/token de usuário para ler dados públicos de canal — usa uma **API Key** restrita, por HTTPS puro, sem login nenhum por trás. Ela só enxerga o que já é público na página do canal (inscritos, visualizações totais); não alcança dados privados do Studio nem de qualquer outra conta.

- `diagnostico-youtube.yml`: verifica o que a chave atual alcança no canal Vonder (`UCflcAVLpPmH-03R-njMSayw`), sem alterar arquivos — cada resposta vai tanto para o resumo da execução quanto para o log bruto do passo, no mesmo padrão adotado em `diagnostico-meta.yml`;
- `sync-youtube-followers.yml`: a cada ~15 minutos (offset de 7 min em relação ao agendamento da Meta, só para reduzir a chance de as duas execuções tentarem publicar no mesmo minuto), consulta `channels.list` (`part=snippet,statistics`) e grava inscritos e visualizações totais; fecha um ponto diário às 23:50 de São Paulo (5 min antes do fechamento da Meta).

Os dois workflows (Meta e YouTube) escrevem nos **mesmos dois arquivos** (`data/social-followers-live.json` e `data/social-followers.json`) em paralelo, cada um mexendo só na própria chave dentro de `platforms`/`followers` — nunca reconstroem o documento inteiro, senão um apagaria o dado do outro a cada execução (é por isso que `sync-meta-followers.yml` deixou de gravar o documento inteiro nesta mesma mudança: passou a ler o arquivo existente e mesclar, igual ao YouTube). Cada workflow ainda tenta `git pull --rebase` e reenviar até 3 vezes se o `git push` for rejeitado por não estar atualizado — o cenário normal quando os dois rodam perto um do outro.

Assim como a Meta, o passo final grava o snapshot combinado direto em `portalStore/followers-vonder-v1` no Firestore via Admin SDK, reaproveitando o mesmo secret `FIREBASE_SERVICE_ACCOUNT_KEY` já cadastrado — nenhum secret novo é necessário para essa etapa.

- **Finalidade:** trazer para o painel de Redes Sociais o número de inscritos do canal Vonder no YouTube, no mesmo padrão já visto para Instagram/Facebook.
- **Dados:** inscritos (`subscriberCount`) e visualizações totais (`viewCount`) do canal — agregados e públicos, sem dado pessoal de quem assiste/se inscreve.
- **Credenciais:** `YOUTUBE_API_KEY` em GitHub Secrets — uma API Key do Google Cloud restrita à YouTube Data API v3 (sem restrição de aplicativo/IP, pois o GitHub Actions roda de IPs variáveis; a restrição de segurança real é só poder chamar essa API, que só lê dado público). Projeto Google Cloud reaproveitado: `mkt-ovd`, o mesmo já usado pelo Firebase.
- **Ponto de atenção da TI:** se o canal ocultar a contagem de inscritos nas configurações do YouTube (`hiddenSubscriberCount`), a API deixa de devolver o número real mesmo com a chave certa — `diagnostico-youtube.yml` sinaliza esse caso. Rotacionar a chave e revisar a restrição de API periodicamente, como já se faz com o token da Meta.
- **Limitação conhecida:** `statistics.subscriberCount` vem arredondado pelo próprio Google — a documentação da API declara "This value is rounded down to three significant figures" (ex.: um total real de 41.047 aparece como 41.000). É a mesma aproximação exibida publicamente na página do canal; não há como obter o número exato por essa API, só pela YouTube Analytics API (ver abaixo) ou pelo YouTube Studio.

### Histórico de inscritos (reconstrução única via YouTube Analytics API)

Ao contrário da Meta (Instagram/Facebook), a YouTube Data API v3 não guarda nenhum histórico — só o snapshot atual. A **YouTube Analytics API** tem as métricas `subscribersGained`/`subscribersLost` por dia (o equivalente ao `follows_and_unfollows` do Instagram), mas exige **OAuth 2.0** — não aceita a API Key simples da coleta do dia a dia, porque lê dado que a Meta trata como privado do dono do canal, mesmo sendo só um agregado de entradas/saídas.

- `reconstruir-historico-youtube.yml` (carga única, `workflow_dispatch`): troca o refresh token por um access token, consulta `subscribersGained`/`subscribersLost` por dia desde 2011 até ontem, usa o total atual (`channels.list` com a `YOUTUBE_API_KEY`) como âncora e caminha para trás — total de um dia = total do dia seguinte menos o saldo do dia seguinte —, igual à lógica de `reconstruir-historico.yml` (Instagram). Mescla só a chave `YouTube` em `followers` de cada dia, sem tocar em Instagram/Facebook/insights; dias sem registro anterior nascem com `"source": "reconstruido"`.
- `diagnostico-youtube-oauth.yml`: reaproveita o refresh token já cadastrado (sem pedir nova autorização) para consultar `tokeninfo` (escopos do token) e testar a Analytics API isolada, sem alterar arquivos — foi o que permitiu diagnosticar o problema de Conta de marca abaixo direto pela CLI.
- **Diferença em relação ao Instagram:** não existe, para o YouTube, uma segunda métrica independente para conferir o resultado (a Meta tem `follower_count` paralelo ao `follows_and_unfollows`) — por isso esta reconstrução não tem a lógica de rejeição por divergência que o Instagram tem; é melhor-esforço.
- **Limite de confiabilidade da reconstrução:** quinze anos de saldos diários acumulam desvio (arredondamento da âncora, purgas de inscritos falsos que a própria YouTube periodicamente remove, imprecisão da Analytics em datas antigas) — andar para trás a partir do total atual pode fazer o total acumulado deixar de ser positivo bem antes de 2011. A primeira execução (antes desta trava) chegou a **-45 inscritos** em 2011-01-01, um valor impossível. O workflow agora para no primeiro dia em que o total deixaria de ser positivo, e descarta dias anteriores à criação do canal (2011-03-22) mesmo que a Analytics devolva uma linha zerada para eles — a série publicada hoje começa em 2014-09-07, não em 2011. Cada nova execução também limpa a chave `YouTube` de qualquer dia negativo/pré-canal que uma execução anterior tenha publicado.
- **Fuso horário:** a dimensão `day` da YouTube Analytics API usa Pacific Time (meia-noite a meia-noite), não UTC nem o fuso de São Paulo usado no resto do histórico — os pontos reconstruídos podem ficar deslocados em algumas horas da fronteira de dia dos demais canais. Aceitável para uma curva histórica, não usado no fechamento diário em si (que continua vindo de `sync-youtube-followers.yml`).
- **Credenciais:** `YOUTUBE_OAUTH_CLIENT_ID`/`YOUTUBE_OAUTH_CLIENT_SECRET` (ID de cliente OAuth tipo "Aplicativo para computador", projeto `mkt-ovd`) e `YOUTUBE_OAUTH_REFRESH_TOKEN`, obtido por uma autorização única feita por quem administra o canal Vonder no YouTube (fluxo loopback local, sem servidor exposto). A tela de consentimento OAuth do projeto está em "Em produção"/"Externo" com o escopo `yt-analytics.readonly` — como é uso interno com poucas contas conhecidas, não precisou passar pela verificação completa do Google (limite de 100 usuários sem verificação); por estar em produção (não em "Testing"), o refresh token não deve expirar em 7 dias, mas isso será confirmado na prática pelas próximas execuções agendadas.
- **Pegadinha real: Conta de marca (Brand Account) na tela de login.** O canal Vonder no YouTube é uma Conta de marca, não uma conta Google comum. Na primeira tentativa de autorização, a pessoa concluiu o login com a própria conta pessoal sem perceber uma segunda tela do Google ("Selecione sua conta ou uma conta de marca") que pede para escolher explicitamente entre continuar como a pessoa física ou como uma das Contas de marca que ela administra — mesmo sendo "Proprietário principal" da Vonder pela conta pessoal, o token saiu associado à identidade pessoal, e a YouTube Analytics API devolveu `403 Forbidden` genérico (não um erro de escopo) para `channel==MINE` e para o ID do canal, mesmo com Analytics como Analytics-viewer/Owner garantido. Corrigido repetindo a autorização e escolhendo explicitamente "Vonder" nessa segunda tela. **Se o token precisar ser refeito no futuro, atenção a essa tela** — é fácil não notá-la e cair no mesmo erro.
- **Ponto de atenção da TI:** se `sync-meta-followers.yml`/`sync-youtube-followers.yml`/`reconstruir-historico-youtube.yml` começarem a falhar juntos com erro de token OAuth, o refresh token pode ter sido revogado (troca de senha da conta, revogação manual em myaccount.google.com/permissions, ou expiração) — nesse caso é preciso repetir a autorização única (lembrando de escolher a Conta de marca Vonder na tela de seleção) e regravar os três secrets OAuth.

## 10. Persistência local e alternativa PHP/SQLite

O portal mantém uma cópia em `localStorage`, útil como cache e quando não há conexão, mas que pode ser apagada pelo usuário/navegador.

`api.php` é uma alternativa para servidor PHP próprio. Ele usa SQLite (`data.sqlite`) e controle de versão semelhante ao Firebase. O `.htaccess` bloqueia download de `.sqlite` em Apache; uma implantação em IIS deve ter regra equivalente em `web.config`.

**Estado atual:** a camada usada pelo front-end é `SyncBackend`, implementada hoje com Firebase. Logo, `api.php` é opção de contingência/migração, não backend do GitHub Pages. Não tratar o SQLite como backup sem rotina formal de backup, retenção e recuperação.

## 11. Dados, segurança e operação

| Categoria | Exemplos | Tratamento esperado |
|---|---|---|
| Público | artes publicadas, fotos de produto, preços/ofertas públicos, números agregados | podem trafegar nos serviços descritos, respeitando termos de uso |
| Interno | calendário editorial, briefings, referências, configurações e catálogo curado | acesso limitado à equipe e às regras Firebase/GitHub |
| Confidencial/restrito | tokens, chaves, credenciais, dados pessoais não necessários | nunca versionar nem gravar em Firebase/localStorage; usar Secrets/cofre corporativo |

## 12. Como atualizar esta documentação

Antes de liberar novidade que conecte o portal a outro serviço, registrar aqui: serviço e owner; finalidade; URL/domínios e direção do tráfego; dados enviados/recebidos; autenticação e onde credenciais são guardadas; classificação/LGPD, logs e retenção; controles (CORS, allowlist, validação, limite, backup e monitoramento); plano de falha/rollback; e arquivos/workflows alterados.

Nunca incluir segredos. Registre somente o nome do segredo e o local administrativo.

Há duas barreiras de processo:

1. `AGENTS.md` orienta agentes de manutenção a atualizar esta arquitetura junto de alterações relevantes.
2. `.github/workflows/validar-documentacao-arquitetura.yml` falha em pull requests e pushes que mudem os principais arquivos de integração sem mudar este documento.

O workflow não substitui revisão humana: qualquer nova dependência remota, mesmo fora da lista monitorada, exige atualização. Para bloquear o merge, a proteção da branch `main` deve exigir o check **Validar documentação de arquitetura**.

## 13. Histórico deste documento

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Criação do inventário: Firebase, Cloudflare Worker, GitHub Pages/Actions, Meta, fontes OVD/FG, Google Fonts e alternativa PHP/SQLite. | Equipe de Marketing / manutenção do portal |
| 04/09/2026 | Adicionada coleta de posts do Instagram (`sync-meta-posts.yml`, `diagnostico-meta-posts.yml`) e o painel "Melhores posts" no dashboard de seguidores, publicando em `data/social-posts.json` e `portalStore/posts-vonder-v1`. | Equipe de Marketing / manutenção do portal |
| 09/09/2026 | Adicionada coleta de seguidores/curtidas da Página do Facebook da VONDER (`262406600508752`) em `sync-meta-followers.yml`, reaproveitando o `META_PAGE_ACCESS_TOKEN` já existente (confirmado sem escopo novo em `diagnostico-meta-facebook.yml`). O painel de Redes Sociais passa a exibir o Facebook como rede conectada para a VONDER. | Equipe de Marketing / manutenção do portal |
| 09/09/2026 | Corrigidos dois bugs de perda silenciosa de histórico em `data/social-followers.json`: (1) o corte `[-730:]` por contagem de linhas, que descartava os pontos mais antigos da exportação manual do Instagram assim que o histórico do Facebook cresceu — removido dos três workflows que gravavam esse arquivo; (2) `reconstruir-historico.yml` descartava todo dia marcado `reconstruido`/`estimado` a cada execução, mesmo fora da janela de ~29 dias que consultava, apagando para sempre dias que a Meta não deixa mais recalcular — agora só descarta dentro da própria janela da execução. Reimportados os arquivos `followers_*.json` originais (exportação "Baixe suas informações" do Instagram, com data exata de cada seguidor atual) para reconstruir o histórico dia a dia (não mais só por mês) de 01/09/2023 a 04/08/2026 e preencher o buraco real de 05 a 12/08/2026, calibrado para bater com o dado real da API mais próximo. | Equipe de Marketing / manutenção do portal |
| 09/09/2026 | `diagnostico-meta.yml` passou a ecoar cada resposta também no log bruto do passo (além do resumo da execução), para investigar falhas do token direto pela CLI sem depender do navegador. Usado para confirmar que uma sequência de falhas em `sync-meta-followers.yml` (HTTP 400 em "Consultar seguidores do Instagram") foi a sessão do `META_PAGE_ACCESS_TOKEN` expirando do lado da Meta (`error_subcode 463`, "Session has expired"), sem relação com o push do painel de Redes Sociais que aconteceu por coincidência perto do mesmo horário — o token precisou ser gerado de novo pelo Graph API Explorer, do mesmo jeito feito ao ligar a coleta do Facebook. | Equipe de Marketing / manutenção do portal |
| 09/09/2026 | Conectado o canal Vonder no YouTube (`@vonderferramentas`, `UCflcAVLpPmH-03R-njMSayw`) ao painel de Redes Sociais: novos `diagnostico-youtube.yml` e `sync-youtube-followers.yml` (API Key restrita à YouTube Data API v3, secret `YOUTUBE_API_KEY`, projeto Google Cloud `mkt-ovd` reaproveitado do Firebase), `NETWORKS` em `followers-dashboard.js` marcou YouTube como `connected` para a VONDER. Como os dois workflows (Meta e YouTube) passaram a escrever nos mesmos `data/social-followers-live.json`/`data/social-followers.json`, `sync-meta-followers.yml` deixou de reconstruir esses arquivos inteiros a cada execução e passou a ler e mesclar só a própria chave (`platforms.Instagram`/`platforms.Facebook`, `followers.Instagram`/`followers.Facebook` do dia), igual ao padrão do YouTube — e ambos tentam `git pull --rebase` com até 3 tentativas se o `git push` for rejeitado por desatualização. | Equipe de Marketing / manutenção do portal |
| 09/09/2026 | Adicionada reconstrução única do histórico de inscritos do YouTube (`reconstruir-historico-youtube.yml`), via YouTube Analytics API (`subscribersGained`/`subscribersLost` por dia, caminhando para trás a partir do total atual — mesma lógica de `reconstruir-historico.yml` para o Instagram, mas sem métrica paralela para conferência, já que o YouTube não tem equivalente ao `follower_count`). Exige OAuth 2.0 (a API Key da coleta do dia a dia não alcança esses dados): novos secrets `YOUTUBE_OAUTH_CLIENT_ID`/`YOUTUBE_OAUTH_CLIENT_SECRET`/`YOUTUBE_OAUTH_REFRESH_TOKEN`, obtidos por uma autorização única (fluxo loopback local) de quem administra o canal. Tela de consentimento OAuth do projeto `mkt-ovd` movida para "Em produção" com o escopo `yt-analytics.readonly`, dispensando verificação completa do Google por ser uso interno com poucas contas (limite de 100 usuários). Confirmado também, direto na documentação da API, que `statistics.subscriberCount` da YouTube Data API v3 vem arredondado a 3 algarismos significativos — a causa do número exibido no painel não bater com o valor exato do canal. | Equipe de Marketing / manutenção do portal |
| 09/09/2026 | Corrigidos dois problemas encontrados ao rodar a reconstrução do histórico do YouTube pela primeira vez: (1) o canal Vonder é uma Conta de marca — a autorização OAuth inicial completou o login com a conta pessoal sem selecionar explicitamente "Vonder" na tela "Selecione sua conta ou uma conta de marca", e a Analytics API devolvia `403 Forbidden` genérico mesmo para o Proprietário principal; diagnosticado com o novo `diagnostico-youtube-oauth.yml` (reaproveita o refresh token, sem pedir login de novo) e corrigido refazendo a autorização com a Conta de marca selecionada corretamente; (2) caminhar 15 anos para trás a partir do total atual acumula desvio suficiente para o total ficar negativo (-45 inscritos em 2011-01-01 na primeira execução) — `reconstruir-historico-youtube.yml` agora para no primeiro dia em que o total deixaria de ser positivo e descarta dias antes da criação do canal (22/03/2011); a série publicada agora começa em 2014-09-07. Também corrigido, na mesma leva, um access token derivado vazando em texto puro no log da execução (mascarado automaticamente só cobre os secrets originais, não valores novos derivados deles — `::add-mask::` adicionado logo após obter o token). | Equipe de Marketing / manutenção do portal |

## 14. Autenticação e controle de acesso (em implantação)

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

### Automação passou a gravar no Firestore (04/09/2026)

Depois da migração acima, o painel ficou lendo só `portalStore/followers-vonder-v1`, mas a coleta automática (`sync-meta-followers.yml`, a cada 15 min) continuava publicando somente os JSON públicos — ninguém tinha religado os dois lados. Resultado: o painel mostrava "Aguardando coleta" e a mensagem de que os dados "ainda não foram migrados para a área protegida", mesmo com a coleta rodando normalmente em segundo plano.

`sync-meta-followers.yml` ganhou um passo final ("Publicar snapshot protegido no Firestore") que grava `data/social-followers.json` e `data/social-followers-live.json` direto em `portalStore/followers-vonder-v1`, no mesmo formato (`v`/`updated_at`/`updatedAt`) usado por `migrate-followers.js`, usando o **Admin SDK do Firebase** com uma chave de serviço — nunca a sessão de um usuário nem as regras client-side do Firestore. Isso exige o secret `FIREBASE_SERVICE_ACCOUNT_KEY` no GitHub Actions (conteúdo JSON de uma chave de conta de serviço gerada em Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada); sem esse secret o passo apenas emite um aviso e não falha a coleta pública, que continua funcionando como antes.

Enquanto o secret não for cadastrado, o sintoma original persiste. Depois de cadastrado, o painel volta a atualizar sozinho a cada execução (até 15 min de atraso), sem depender de ninguém reabrir `migrate-followers.html` — essa página continua existindo para uma cópia manual pontual, mas deixa de ser o único caminho.

| Data | Alteração | Responsável |
|---|---|---|
| 03/09/2026 | Preparada migração controlada dos dados de seguidores para Cloud Firestore protegido, sem exclusão da origem pública. | Equipe de Marketing / manutenção do portal |
| 04/09/2026 | `sync-meta-followers.yml` passou a gravar direto em `portalStore/followers-vonder-v1` via Admin SDK, corrigindo o painel mostrando "Aguardando coleta" apesar da coleta automática continuar rodando. Pendente: cadastrar o secret `FIREBASE_SERVICE_ACCOUNT_KEY`. | Equipe de Marketing / manutenção do portal |

### Painel de melhores posts (04/09/2026)

Seguindo o mesmo padrão já usado para seguidores, `sync-meta-posts.yml` grava o snapshot de posts direto em `portalStore/posts-vonder-v1` no Cloud Firestore, via Admin SDK com o mesmo secret `FIREBASE_SERVICE_ACCOUNT_KEY` (formato `v`/`updated_at`/`updatedAt`). `data/social-posts.json` continua publicado no repositório como origem/backup, do mesmo jeito que os arquivos de seguidores.

- **Finalidade:** dar ao time visibilidade de quais posts do Instagram tiveram melhor desempenho, ordenáveis por curtidas, comentários, interações totais, visualizações e salvamentos.
- **Dados:** por post — `id`, legenda, tipo de mídia, permalink, miniatura, data de publicação, curtidas e comentários (vindos direto da listagem de mídia) e interações totais/visualizações/salvamentos (vindos de `/insights` por post). Tudo é dado agregado e público do próprio perfil da marca; não há dado pessoal de quem curtiu/comentou.
- **Autenticação:** mesmo `META_PAGE_ACCESS_TOKEN` já usado para seguidores — `diagnostico-meta-posts.yml` confirmou que o escopo atual já cobre esses endpoints, sem pedir permissão nova à Meta.
- **Controles:** posts sem `/insights` disponível (mídia muito antiga ou tipo sem essa métrica) entram no snapshot só com curtidas/comentários, sem travar a coleta dos demais; se a Meta não retornar nenhum post na execução, o workflow aborta sem sobrescrever o snapshot anterior.
- **Plano de falha/rollback:** sem o secret `FIREBASE_SERVICE_ACCOUNT_KEY`, o passo de Firestore só avisa e não falha a coleta pública; o painel mostra estado de espera. Para desligar, basta remover o agendamento do workflow (ou apagar o arquivo) — não afeta a coleta de seguidores, que é um workflow e um documento Firestore inteiramente separados.
- **Arquivos/workflows:** `.github/workflows/diagnostico-meta-posts.yml` (novo), `.github/workflows/sync-meta-posts.yml` (novo), `data/social-posts.json` (novo), `followers-dashboard.html`/`followers-dashboard.js` (painel "Melhores posts").

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

## 15. TikTok: conexão em implantação (App Review pendente)

Diferente da Meta e do YouTube, o TikTok não tem uma API pública simples (chave/API Key) para número de seguidores. A única forma oficial é a **TikTok for Developers — Login Kit**, que exige um app próprio, aprovação manual (**App Review**) da TikTok para os escopos usados, e OAuth 2.0 autorizado pela conta dona do perfil.

**Estado em 10/09/2026: app criado, submetido para revisão, aguardando aprovação da TikTok. Ainda não há coleta automática nem workflow do GitHub Actions — `followers-dashboard.js` continua com `TikTok: connected:false` para todas as marcas, incluindo a VONDER.**

- **App:** "Portal MKT OVD" em developers.tiktok.com, propriedade da conta `vonderferramentas@gmail.com` (dona oficial do perfil `@vonderferramentas` no TikTok).
- **Produto/escopos solicitados:** Login Kit com `user.info.basic` (identificar a conta conectada), `user.info.stats` (`follower_count`, para o mesmo painel de seguidores das outras redes) e `video.list` (lista de vídeos publicados com `view_count`/`like_count`/`comment_count`/`share_count`, para alimentar futuramente um painel de "melhores posts" do TikTok igual ao que já existe para Instagram).
- **Páginas públicas novas no portal** (sem `auth-guard`, pois precisam ser acessíveis sem login para a TikTok e para o fluxo de autorização):
  - `termos-de-uso.html` e `politica-de-privacidade.html` — exigidas pelo cadastro do app na TikTok (Terms of Service URL / Privacy Policy URL); também usadas como "Web/Desktop URL" oficial do app.
  - `tiktok-connect.html` — inicia o fluxo OAuth (botão que monta a URL de autorização do Login Kit com os 3 escopos e redireciona para o TikTok); usada tanto para o vídeo de demonstração do App Review quanto para a autorização real após aprovação.
  - `tiktok-oauth-callback.html` — Redirect URI cadastrado no Login Kit; recebe `?code=...` na volta do TikTok e exibe o código na tela para cópia manual, já que o GitHub Pages não executa backend para trocar o código por token automaticamente.
  - `tiktokhv1G86rE8zpzxbR1lF5FW84unJaxlFrD.txt` — arquivo de verificação de propriedade do prefixo de URL (`https://vonderferramentas-coder.github.io/portalmktovd/`) exigido pela TikTok antes de aceitar as URLs de Termos/Privacidade; método "URL prefix / signature file" (a alternativa, verificação de domínio inteiro via DNS, não era viável por não administrarmos o DNS do domínio `github.io`).
- **Credenciais:** o app tem client key/secret separados para os ambientes **Sandbox** (usado só para testar o fluxo antes da aprovação, com a conta `@vonderferramentas` cadastrada como "Target user") e **Production** (usado depois de aprovado). Nenhum dos dois foi salvo neste repositório; o teste no Sandbox confirmou a leitura real de `follower_count` (4.217) e da lista de vídeos com estatísticas da conta oficial.
- **Particularidade em relação ao YouTube:** o token de acesso do TikTok expira em 24h e, diferente do Google, o **refresh token é substituído a cada uso** — qualquer workflow de coleta automática vai precisar, a cada execução, gravar de volta um novo refresh token no GitHub Secrets (não só usar e descartar como seria com uma API Key fixa).

**Número fixo exibido no painel enquanto o App Review não é aprovado:** para não deixar o card do TikTok vazio no meio-tempo, `publicar-tiktok-manual.yml` (`workflow_dispatch` manual, nunca agendado) grava um lançamento pontual — recebe `followers` e `date` como entrada, mescla só a chave `TikTok` em `data/social-followers-live.json`/`data/social-followers.json` com `"source": "manual"`, e publica no mesmo documento protegido do Firestore (`portalStore/followers-vonder-v1`) via Admin SDK, igual ao passo final de `sync-meta-followers.yml`. `followers-dashboard.js` mostra um ícone de aviso ao lado do total (reaproveitando o mesmo modal do aviso de número aproximado do YouTube) explicando que é um número fixo, lançado manualmente, enquanto `TikTok.connected` for `false`. Confirmado com 4.217 seguidores/160 vídeos reais da conta `@vonderferramentas`, obtidos via teste no Sandbox do Login Kit.

**Pendente após a aprovação do App Review:**

1. Repetir a autorização OAuth uma única vez com as credenciais de **Production** (não as de Sandbox) pela conta `@vonderferramentas`, para obter o refresh token definitivo.
2. Cadastrar `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`/`TIKTOK_REFRESH_TOKEN` em GitHub Actions Secrets.
3. Criar `sync-tiktok-followers.yml` (mesmo padrão de `sync-youtube-followers.yml`: mescla só a chave `TikTok` em `platforms`/`followers`, nunca reconstrói os arquivos inteiros) e, depois, um `sync-tiktok-posts.yml` para o ranking de vídeos.
4. Atualizar `NETWORKS` em `followers-dashboard.js` para `TikTok: connected:isVonder`.

| Data | Alteração | Responsável |
|---|---|---|
| 10/09/2026 | Criado o app "Portal MKT OVD" na TikTok for Developers (Login Kit, escopos `user.info.basic`/`user.info.stats`/`video.list`) e submetido para App Review. Adicionadas as páginas públicas `termos-de-uso.html`, `politica-de-privacidade.html`, `tiktok-connect.html` e `tiktok-oauth-callback.html`, e o arquivo de verificação de domínio da TikTok. Fluxo testado de ponta a ponta no ambiente Sandbox com a conta oficial `@vonderferramentas` (seguidores e lista de vídeos confirmados). Coleta automática e conexão no painel ainda pendentes da aprovação do App Review. | Equipe de Marketing / manutenção do portal |