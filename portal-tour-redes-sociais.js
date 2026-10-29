/**
 * Passeios da tela Redes sociais (followers-dashboard.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * Seções que dependem da rede escolhida (Insights, Conteúdo do Instagram) ou da marca (importação do TikTok) somem
 * da tela em alguns casos: o motor pula sozinho o passo cujo alvo não está visível.
 */
(function(){
const menuClosed = id => () => { const el = document.getElementById(id); return !el || el.hidden; };

PortalTour.register('redes-sociais', {
  version: 1,
  title: 'Redes sociais',
  tours: [
    {
      id: 'redes-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Um passeio pelas partes principais do painel de seguidores.',
      steps: [
        { title: 'Boas-vindas às Redes sociais', text: 'Este painel mostra a evolução dos seguidores de cada rede social da marca escolhida. Os números são coletados sozinhos, você não precisa enviar nada. Vou mostrar onde fica cada coisa. Para sair a qualquer momento, aperte Esc.' },
        { target: '#workflowInfoTrigger', title: 'Como o painel funciona', text: 'Clique no "i" quando quiser saber de onde vêm os números e de quanto em quanto tempo eles atualizam.' },
        { target: '#dataStatus', title: 'Situação dos dados', text: 'Mostra quando os dados foram atualizados pela última vez. Canais que a marca ainda não conectou aparecem como aguardando conexão.' },
        { target: '#periodControl', title: 'Período', text: 'Tudo na tela (gráfico, ganhos, posts) segue o período escolhido aqui. Há um passeio só sobre isso.' },
        { target: '#reportControl', title: 'Gerar relatório', text: 'Imprime ou salva em PDF o resumo do período, ou monta um texto pronto para enviar por e-mail.' },
        { target: '#actionsControl', title: 'Mais ações', text: 'Aqui fica o Controle de metas, onde se define quantos seguidores cada rede deve alcançar.' },
        { target: '.milestones-card', title: 'Evolução no período', text: 'Uma tabela com o total de seguidores no primeiro e no último dia do período e em cada sexta-feira, com o ganho entre um marco e outro.' },
        { target: '#platforms', title: 'Por plataforma', text: 'Um card por rede social, com o total mais recente. Clique num card para filtrar tudo o que está abaixo por aquela rede.' },
        { target: '#totalCard', title: 'Comunidade total', text: 'O total de seguidores da rede escolhida (ou de todas somadas) e quanto cresceu no período.' },
        { target: '#tiktokImportPanel', title: 'Importar o TikTok', text: 'O TikTok não libera os dados automaticamente. Nesta marca, o histórico é atualizado de tempos em tempos com um arquivo CSV baixado no TikTok Studio, seguindo o passo a passo desta caixa.' },
        { target: '#performanceToggle', title: 'Performance em números', text: 'Gráfico, metas, indicadores e comparativos da rede escolhida. Clique no título para recolher ou abrir a seção. Há um passeio só sobre ela.' },
        { target: '#postsDivider', title: 'Conteúdo da rede', text: 'Os melhores posts do período. Também recolhe com um clique no título. Há um passeio só sobre ele.' },
        { target: '#tourHelpBtn', title: 'Pronto!', text: 'Sempre que precisar, clique em "Como usar" para rever este passeio ou fazer os outros.' }
      ]
    },
    {
      id: 'redes-periodo',
      title: 'Escolher o período',
      summary: 'Atalhos, datas personalizadas e as setas de avançar e voltar.',
      steps: [
        { target: '#periodTrigger', click: true, done: () => !menuClosed('periodMenu')(), title: 'Abrir o período', text: 'Clique no período atual para abrir a lista de opções.' },
        { target: '#periodMenu', title: 'As opções', text: 'Últimos 7, 15 ou 30 dias, este mês, este ano, desde o início (todo o histórico) ou personalizado, em que você escolhe a data de início e a de fim. Ao escolher uma, a tela inteira se atualiza.' },
        { target: '#periodTrigger', click: true, done: menuClosed('periodMenu'), title: 'Fechar a lista', text: 'Clique de novo no período para fechar a lista sem mudar nada.' },
        { target: '#periodPrev', interact: true, title: 'Período anterior', text: 'A seta da esquerda leva para o período anterior, do mesmo tamanho. Exemplo: de "Este mês" para o mês passado.' },
        { target: '#periodNext', interact: true, title: 'Próximo período', text: 'A seta da direita avança. Ela não passa do período atual, porque o futuro ainda não tem dados.' },
        { title: 'Pronto!', text: 'Agora você sabe escolher o período. Volte ao período que costuma usar antes de gerar um relatório.' }
      ]
    },
    {
      id: 'redes-relatorio-metas',
      title: 'Relatório e metas',
      summary: 'Gerar o relatório do período e cadastrar as metas de seguidores.',
      steps: [
        { target: '#reportTrigger', click: true, done: () => !menuClosed('reportMenu')(), title: 'Abrir "Gerar relatório"', text: 'Clique em "Gerar relatório" para ver as opções.' },
        { target: '#printReport', title: 'Imprimir / PDF', text: 'Abre a impressão com o resumo do período. Para guardar em arquivo, escolha "Salvar como PDF" como impressora.' },
        { target: '#emailReport', title: 'E-mail', text: 'Monta um texto pronto, que você pode ajustar na própria janela, copiar ou abrir no Outlook. Os relatórios usam só dias já fechados.' },
        { target: '#reportTrigger', click: true, done: menuClosed('reportMenu'), title: 'Fechar o menu', text: 'Clique de novo em "Gerar relatório" para fechar.' },
        { target: '#actionsTrigger', click: true, done: () => !menuClosed('actionsMenu')(), title: 'Abrir "Mais ações"', text: 'Clique em "Mais ações".' },
        { target: '#goalsControlTrigger', click: true, title: 'Controle de metas', text: 'Clique em "Controle de metas" para abrir a janela. Nada vai ser salvo neste tutorial.' },
        { target: '#goalsControlBackdrop .modal-body', title: 'Uma meta por rede', text: 'Defina quantos seguidores cada rede deve ter. O prazo é opcional: sem ele a meta entra nas projeções de ritmo, mas não há data para comparar. Meta em branco remove a meta daquela rede.' },
        { target: '#goalsControlSave', title: 'Salvar', text: 'Grava as metas.', danger: 'Salvar muda as metas desta marca para toda a equipe.' },
        { target: '#goalsControlCancel', click: true, title: 'Fechar sem salvar', text: 'Clique em "Cancelar" para fechar sem mudar nada.' },
        { target: '#goalRingCaption', title: 'Onde a meta aparece', text: 'Com a meta cadastrada, o card "Progresso da meta" e o painel "Meta e projeção" mostram quanto falta, o ritmo necessário e a data estimada para chegar lá.' },
        { title: 'Pronto!', text: 'Agora você sabe gerar o relatório e cadastrar metas. As metas valem para toda a equipe da marca.' }
      ]
    },
    {
      id: 'redes-numeros',
      title: 'Entender os números',
      summary: 'Filtro por rede, crescimento, gráfico, indicadores e histórico.',
      steps: [
        { target: '#platforms', interact: true, title: 'Escolha a rede', text: 'Clique num card para ver só aquela rede. "Todas" soma as redes. O Instagram vem selecionado e algumas seções só existem para ele.' },
        { target: '#totalCard', title: 'Total e crescimento', text: 'O total mais recente da rede escolhida e, logo abaixo, quanto cresceu no período.' },
        { target: '.metrics-2x2', title: 'Crescimento no período', text: 'Crescimento líquido é quem entrou menos quem saiu. Média por dia divide isso pelos dias do período. "Novos seguidores (bruto)" e "Deixaram de seguir" separam entradas e saídas, quando a rede informa.' },
        { target: '.chart-mode', interact: true, title: 'Tipo de gráfico', text: '"Crescimento total" mostra a curva do total de seguidores. "Novos por dia" mostra quanto se ganhou em cada dia.' },
        { target: '#bars', interact: true, title: 'O gráfico', text: 'Passe o mouse sobre o gráfico para ver o valor de cada dia.' },
        { target: '#goalPanel', title: 'Meta e projeção', text: 'Compara o ritmo atual com o necessário para bater a meta e estima onde o mês e o ano devem terminar.' },
        { target: '#advancedMetrics', title: 'Indicadores do período', text: 'Taxa de crescimento, média diária, melhor e pior dia, e o acumulado no mês e no ano.' },
        { target: '#comparePanel', title: 'Comparativos', text: 'Compara o último dia, a última semana, o mês e o período filtrado com os anteriores, e indica o melhor dia da semana para crescer.' },
        { target: '#insightsPanel', title: 'Insights do Instagram', text: 'Entradas, saídas e alcance dos dias fechados pela Meta. Só aparece quando o Instagram está selecionado. O saldo daqui pode diferir do crescimento líquido porque vem de outra fonte da Meta.' },
        { target: '#historyToggle', interact: true, title: 'Histórico de acompanhamento', text: 'Clique para abrir a tabela com o total de cada rede, dia a dia. Clique de novo para fechar.' },
        { target: '#performanceToggle', interact: true, title: 'Recolher a seção', text: 'Para reduzir a rolagem, clique no título "Performance em números" e a seção se recolhe.' },
        { title: 'Pronto!', text: 'Agora você sabe ler os números. Lembre que o dia de hoje ainda está em andamento: os relatórios usam dias já fechados.' }
      ]
    },
    {
      id: 'redes-posts',
      title: 'Conteúdo do Instagram',
      summary: 'Destaques, ranking dos melhores posts e resumo de publicações.',
      steps: [
        { target: '#postsDivider', interact: true, title: 'A seção', text: 'Mostra o desempenho dos posts da rede escolhida no período (no Instagram, o histórico completo da conta). Clique no título para recolher ou abrir.' },
        { target: '#topPostsPanel', title: 'Destaques do período', text: 'Os posts que mais se destacaram. Clique num post para ver a prévia com legenda e números.' },
        { target: '#postsFormatTrigger', title: 'Tipo de publicação', text: 'Filtra o ranking por tipo: por exemplo, só Reels ou só Posts. Os tipos mudam conforme a rede.' },
        { target: '#postsSortTrigger', title: 'Ordenar por', text: 'Muda o critério do ranking: data, curtidas, comentários, interações, visualizações ou salvamentos, conforme a rede.' },
        { target: '#postsViewToggle', interact: true, title: 'Grade ou lista', text: 'A grade mostra as capas; a lista mostra uma tabela com todos os números lado a lado.' },
        { target: '#postsPanel', title: 'Melhores posts', text: 'O ranking de acordo com o período, o tipo e a ordem escolhidos. Ele segue o período do topo da página.' },
        { target: '#postsStatsPanel', title: 'Resumo de publicações', text: 'Totais do período: quantas publicações, curtidas, comentários, visualizações e salvamentos.' },
        { title: 'Pronto!', text: 'Agora você sabe achar os posts que mais funcionaram. Use essa leitura para planejar as próximas pautas no Calendário.' }
      ]
    }
  ]
});
})();
