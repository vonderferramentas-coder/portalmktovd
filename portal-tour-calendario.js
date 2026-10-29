/**
 * Passeios do Calendário de Postagens (visual-editor.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do app.js.
 */
(function(){
// etapa ativa do formulário em 3 etapas (setGuidedPostStep em app.js): ela só avança com o Planejamento completo
const guidedStepIs = n => { const active = document.querySelector('#modalBackdrop .guided-step-btn.active'); return !!active && active.dataset.guidedStepTarget === String(n); };

PortalTour.register('calendario', {
  version: 1,
  title: 'Calendário de Postagens',
  tours: [
    {
      id: 'calendario-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Um passeio pelos botões principais do calendário.',
      steps: [
        { title: 'Boas-vindas ao Calendário', text: 'Aqui a equipe planeja o que vai ser publicado em cada rede social e monta o briefing para design e vídeo. Vou mostrar onde fica cada coisa. Para sair a qualquer momento, aperte Esc.' },
        { target: '.month-nav', title: 'Navegar entre os meses', text: 'As setas levam ao período anterior ou ao próximo. Clique no nome do mês para pular direto para outro mês do ano.' },
        { target: '#viewToggle', title: 'Escolher a visualização', text: 'Veja as postagens por Mês, Quinzena, Semana ou em Lista. A Lista é boa para revisar tudo em sequência, dia a dia.' },
        { target: '#grid', title: 'A grade do mês', text: 'Cada quadro é um dia, e os cards dentro dele são as postagens planejadas. Clique no número do dia para ver todas as postagens daquela data.' },
        { target: '#grid .event', title: 'Um card de postagem', text: 'Clique no card para abrir e editar. Arraste para outro dia para mudar a data. A barra colorida à esquerda mostra o tipo: laranja é vídeo, verde é estático.' },
        { target: '#grid .event .event-menu-btn', title: 'Menu do card', text: 'Nos três pontinhos ficam Duplicar e Excluir. Se excluir sem querer, use o Desfazer logo em seguida.', danger: 'Excluir apaga a postagem para toda a equipe.' },
        { target: '#tabs', title: 'Filtrar por rede social', text: 'Clique numa rede para ver só as postagens dela; dá para marcar várias. "Todas" volta a mostrar tudo.' },
        { target: '#filtersBtn', title: 'Filtros', text: 'Refine o que aparece por editoria, formato, tipo e collab.' },
        { target: '#aiSummary', title: 'Resumo do período', text: 'Mostra quantas postagens há no período. Clique para ver o total por tipo, por editoria e por rede social.' },
        { target: '#syncStatus', title: 'Salvamento', text: 'Mostra se suas alterações já foram salvas no servidor. Tudo é salvo sozinho; não existe botão de salvar o calendário.' },
        { target: '#undoBtn', title: 'Desfazer e refazer', text: 'Errou? Este botão (ou Ctrl+Z) desfaz, e o do lado (ou Ctrl+Y) refaz. Vale para mover, editar, duplicar e excluir.' },
        { target: '#openSearch', title: 'Buscar', text: 'Procura em todas as postagens, de qualquer mês, pelo título, pelo produto ou pela observação.' },
        { target: '#openSettings', title: 'Opções', text: 'Metas, redes sociais, editorias, datas comemorativas e catálogo de produtos. Há um passeio só sobre isso.' },
        { target: '#toolbarMoreBtn', title: 'Mais ações', text: 'Exportar o briefing em Word, exportar planilhas e importar postagens de uma planilha. Há um passeio só sobre isso.' },
        { target: '#openAdd', title: 'Nova postagem', text: 'É por aqui que se planeja uma postagem nova. O passeio "Criar uma postagem" mostra o passo a passo.' },
        { target: '#tourHelpBtn', title: 'Pronto!', text: 'Sempre que precisar, clique em "Como usar" para rever este passeio ou fazer os outros.' }
      ]
    },
    {
      id: 'calendario-criar-postagem',
      title: 'Criar uma postagem',
      summary: 'O formulário do card, etapa por etapa: planejamento, conteúdo e entrega.',
      steps: [
        { target: '#openAdd', click: true, title: 'Abrir o formulário', text: 'Clique em "+ Nova postagem". Nada vai ser salvo neste tutorial.' },
        { target: '.guided-flow-steps', title: 'As três etapas', text: 'O formulário tem 3 etapas: Planejamento, Conteúdo e Entrega. Fora do tutorial, dá para clicar nelas para ir e voltar.' },
        { target: '#mTitle', interact: true, title: 'Título', text: 'Um nome curto que identifique a postagem, por exemplo "Lançamento da furadeira FPV 650". Obrigatório: digite um para seguir.' },
        { target: '#mDate', interact: true, title: 'Data de publicação', text: 'O dia em que a postagem vai ao ar. Já vem com o período que estava aberto no calendário.' },
        { target: '#editoriasContainer', interact: true, title: 'Editoria', text: 'O assunto da postagem. A editoria aparece colorida no card e muda as sugestões de conteúdo da próxima etapa. Obrigatório: marque pelo menos uma.' },
        { target: '#netsContainer', interact: true, title: 'Redes sociais', text: 'Marque em quais redes a postagem vai sair. Os formatos disponíveis mudam conforme a rede. Obrigatório: marque pelo menos uma.' },
        { target: '.form-group:has(input[name="mType"])', interact: true, title: 'Produção', text: 'Escolha se é Estático (imagem) ou Vídeo, e o formato: feed, story, reels e outros. O formato aparece depois de marcar a rede e é obrigatório.' },
        { target: '#guidedPostNext', click: true, done: () => guidedStepIs(2), allow: '#modalBackdrop .modal-body', title: 'Próxima etapa', text: 'Clique em "Próximo" para ir à etapa Conteúdo. Se faltar algo, o formulário avisa qual campo: complete e clique de novo.' },
        { target: '#mInstitutionalCommemorativeProductsGroup', interact: true, title: 'Produto', text: 'Busque no catálogo pelo nome ou pelo código; também dá para colar vários códigos de uma vez. Postagem sem produto? Marque "Postagem sem produto".' },
        { target: '#mContentSuggestionsGroup', title: 'Sugestões de conteúdo', text: 'Ideias de pauta prontas, conforme a editoria escolhida. Use como ponto de partida.' },
        { target: '#mNotes', interact: true, title: 'Texto da publicação', text: 'A legenda ou o roteiro da postagem.' },
        { target: '#generateCaptionBtn', title: 'Gerar legenda', text: 'Monta um rascunho de legenda com os dados do produto escolhido. É só um ponto de partida: sempre revise o texto antes de usar.' },
        { target: '#intelValidateBtn', title: 'Analisar publicação', text: 'Compara o seu texto com o padrão da editoria e aponta o que pode melhorar.' },
        { target: '#guidedPostNext', click: true, done: () => guidedStepIs(3), title: 'Última etapa', text: 'Clique em "Próximo" para ir à etapa Entrega.' },
        { target: '.form-group:has(#mBriefingLink)', interact: true, title: 'Onde salvar', text: 'Informe onde ficam o briefing e as referências, e onde as artes devem ser salvas. Dá para anexar imagens de referência.' },
        { target: '#mBriefingPreviewGroup', title: 'Pré-visualização do briefing', text: 'O briefing se monta sozinho com o que você preencheu. O botão de copiar leva o texto para colar onde precisar.' },
        { target: '#saveModal', title: 'Salvar', text: 'Quando for para valer, é aqui que o card entra no calendário.', danger: 'Salvar grava a postagem para toda a equipe.' },
        { target: '#cancelModal', click: true, title: 'Fechar sem salvar', text: 'Clique em "Cancelar" para fechar o formulário sem salvar nada.' },
        { title: 'Pronto!', text: 'Agora você sabe criar uma postagem. Quando for para valer, preencha as três etapas e clique em Salvar.' }
      ]
    },
    {
      id: 'calendario-encontrar',
      title: 'Encontrar uma postagem',
      summary: 'Busca, redes sociais, filtros e visualizações.',
      steps: [
        { target: '#openSearch', click: true, title: 'Abrir a busca', text: 'Clique na lupa para abrir a busca.' },
        { target: '#searchInput', interact: true, title: 'Buscar', text: 'Digite parte do título, o nome ou código de um produto, ou uma palavra da observação. A busca olha todos os meses, não só o que está na tela. Fora do tutorial, clique num resultado para abrir a postagem.' },
        { target: '#closeSearch', click: true, title: 'Fechar a busca', text: 'Clique no X para fechar a busca.' },
        { target: '#tabs', interact: true, title: 'Redes sociais', text: 'Clique numa rede para ver só as postagens dela; dá para marcar várias. "Todas" volta a mostrar tudo.' },
        { target: '#filtersBtn', click: true, title: 'Abrir os filtros', text: 'Clique em "Filtros".' },
        { target: '#filtersBackdrop .modal', title: 'Filtros', text: 'Combine editoria, formato, tipo e collab. "Aplicar" mostra o resultado; "Limpar" volta a mostrar tudo.' },
        { target: '#filtersBackdrop .modal-close', click: true, title: 'Fechar os filtros', text: 'Clique no X para fechar sem mudar nada.' },
        { target: '#viewToggle', interact: true, title: 'Visualizações', text: 'Na Lista, as postagens aparecem em sequência, por dia: é a melhor visão para revisar. Mês, Quinzena e Semana mostram a grade.' },
        { title: 'Pronto!', text: 'Agora você sabe encontrar qualquer postagem, de qualquer mês.' }
      ]
    },
    {
      id: 'calendario-exportar',
      title: 'Exportar e importar',
      summary: 'Briefing em Word, planilhas e criação de postagens a partir de uma planilha.',
      steps: [
        { target: '#toolbarMoreBtn', click: true, title: 'Mais ações', text: 'Clique em "Mais ações" para abrir o menu.' },
        { target: '#exportBriefingBtn', title: 'Exportar briefing (.docx)', text: 'Você escolhe um período e baixa o briefing das postagens em Word, agrupado por data. É o arquivo que vai para as equipes de design e vídeo.' },
        { target: '#exportCsvBtn', title: 'Exportar CSV', text: 'Baixa as postagens numa planilha simples, que abre no Excel.' },
        { target: '#exportProductCodesBtn', title: 'Exportar códigos de produtos', text: 'Planilha com os códigos dos produtos das postagens, um por linha, sem repetir.' },
        { target: '#importSheetBtn', title: 'Importar planilha', text: 'Cria várias postagens de uma vez a partir de uma planilha (.xlsx, .xls ou .csv), uma por linha. A janela tem um modelo para baixar.' },
        { target: '#resetMonthBtn', title: 'Resetar mês', text: 'Apaga todas as postagens do mês que está na tela. Use só com muita certeza.', danger: 'Resetar mês apaga todas as postagens do mês para toda a equipe.' },
        { target: '#toolbarMoreBtn', click: true, title: 'Fechar o menu', text: 'Clique de novo em "Mais ações" para fechar o menu.' },
        { title: 'Pronto!', text: 'Agora você sabe tirar e colocar postagens em planilha e gerar o briefing para as equipes.' }
      ]
    },
    {
      id: 'calendario-opcoes',
      title: 'Configurar o calendário',
      summary: 'Metas, redes, editorias, datas comemorativas e catálogo.',
      steps: [
        { target: '#openSettings', click: true, title: 'Opções', text: 'Clique em "Opções".' },
        { target: '.settings-sidebar', interact: true, title: 'Seções', text: 'Metas: a meta diária de posts e a de vídeos por semana. Redes: as redes sociais da marca e os formatos de cada uma. Editorias: os assuntos, suas cores e dias fixos de publicação. Datas comemorativas e Catálogo de produtos completam a lista. Clique nelas para conhecer cada uma.' },
        { target: '#saveSettings', title: 'Salvar', text: 'Grava as mudanças.', danger: 'Salvar muda as opções do calendário para toda a equipe desta marca.' },
        { target: '#cancelSettings', click: true, title: 'Fechar sem salvar', text: 'Clique em "Cancelar" para fechar sem mudar nada.' },
        { title: 'Pronto!', text: 'Agora você sabe onde ficam as opções do calendário. Mudanças aqui valem para toda a equipe da marca.' }
      ]
    }
  ]
});
})();
