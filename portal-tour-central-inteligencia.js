/**
 * Passeios da Central de Inteligência (intelligence-center.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * O ranking começa recolhido: os passos que precisam dele pedem o clique em "Termos mais pesquisados" quando ainda está fechado.
 */
(function(){
const menuClosed = id => () => { const el = document.getElementById(id); return !el || el.hidden; };
const rankingOpen = () => document.getElementById('trendsToggle').getAttribute('aria-expanded') === 'true';
const openRanking = { target: '#trendsToggle', click: true, when: () => !rankingOpen(), done: rankingOpen, title: 'Abrir o ranking', text: 'Clique em "Termos mais pesquisados no Google" para abrir a seção.' };

PortalTour.register('central-inteligencia', {
  version: 1,
  title: 'Central de Inteligência',
  tours: [
    {
      id: 'central-visao-geral',
      title: 'Conhecer a tela',
      summary: 'O que a Central mostra e onde ficam os filtros e o ranking.',
      steps: [
        { title: 'Boas-vindas à Central de Inteligência', text: 'Esta tela mostra os termos que mais crescem nas buscas do Google no Brasil, por categoria de produto. Serve para escolher pautas e produtos com base no que as pessoas estão procurando. Para sair a qualquer momento, aperte Esc.' },
        { target: '#syncStatus', title: 'Última coleta', text: 'Mostra quando o Google Trends foi consultado pela última vez. A coleta é automática, você não precisa fazer nada.' },
        { target: '#trendsCategoryControl', title: 'Categoria', text: 'Escolha uma categoria de produto ou veja todas. Há um passeio só sobre os filtros.' },
        { target: '#trendsPeriodControl', title: 'Período', text: 'Define a janela de tempo analisada, de 7 dias até 12 meses.' },
        { target: '.intel-region-pill', title: 'Região', text: 'Nesta primeira versão só o Brasil é monitorado.' },
        openRanking,
        { target: '#trendsTableWrap', title: 'O ranking', text: 'A lista dos termos mais pesquisados dentro do filtro escolhido. Há um passeio só sobre como ler cada coluna.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para rever este passeio ou fazer os outros.' }
      ]
    },
    {
      id: 'central-filtros',
      title: 'Filtrar por categoria e período',
      summary: 'Trocar a categoria e a janela de tempo do ranking.',
      steps: [
        { target: '#trendsCategoryTrigger', click: true, done: () => !menuClosed('trendsCategoryMenu')(), title: 'Abrir a categoria', text: 'Clique em "Categoria" para abrir a lista.' },
        { target: '#trendsCategoryMenu', title: 'As categorias', text: 'Ferramentas e máquinas de obra, casa e reforma, jardim, manutenção, automotivo, limpeza e materiais industriais. Ao escolher uma, o ranking muda para os termos daquela categoria.' },
        { target: '#trendsCategoryTrigger', click: true, done: menuClosed('trendsCategoryMenu'), title: 'Fechar a lista', text: 'Clique de novo em "Categoria" para fechar sem mudar nada.' },
        { target: '#trendsPeriodTrigger', click: true, done: () => !menuClosed('trendsPeriodMenu')(), title: 'Abrir o período', text: 'Clique em "Período" para abrir a lista.' },
        { target: '#trendsPeriodMenu', title: 'As janelas', text: 'Últimos 7, 30 ou 90 dias ou 12 meses. "Comparativo anual" usa os mesmos dados dos últimos 12 meses, só muda o nome mostrado na coluna "Período analisado".' },
        { target: '#trendsPeriodTrigger', click: true, done: menuClosed('trendsPeriodMenu'), title: 'Fechar a lista', text: 'Clique de novo em "Período" para fechar.' },
        { title: 'Pronto', text: 'O ranking acompanha os dois filtros. Volte a "Todas as categorias" e "Últimos 30 dias" se quiser a visão padrão.' }
      ]
    },
    {
      id: 'central-ranking',
      title: 'Ler o ranking',
      summary: 'O que significa cada coluna da tabela de termos.',
      steps: [
        openRanking,
        { target: '#trendsSummary', title: 'Resumo', text: 'Diz quantos termos a lista tem e avisa quando algum veio de uma coleta antiga (o Google limitou a consulta e o último dado bom foi mantido).' },
        { target: '.intel-col-rank', title: 'Ranking', text: 'A posição do termo na lista. Quanto menor o número, mais pesquisado.' },
        { target: '.intel-col-interest', title: 'Interesse', text: 'Uma nota de 0 a 100 do Google Trends. 100 é o momento de maior busca do termo no período; é uma medida relativa, não um número de buscas.' },
        { target: '.intel-col-variation', title: 'Variação', text: 'Posição: ▲ e ▼ mostram quantos lugares o termo subiu ou desceu desde a coleta anterior, e "novo" marca quem acabou de entrar. Embaixo, o crescimento da busca no Google, disponível só para parte dos termos.' },
        { target: '#trendsTableBody .intel-matched-products', title: 'Produtos', text: 'Quando o termo combina com produtos do catálogo, aparece a quantidade. Clique para ver a lista e usar o termo como ideia de pauta.' },
        { target: '#trendsPager', interact: true, title: 'Páginas', text: 'Quando há muitos termos, use as setas para trocar de página.' },
        { title: 'Pronto', text: 'Termo em alta não é ordem de publicar: confira se combina com o produto e com a marca antes de criar a pauta.' }
      ]
    }
  ]
});
})();
