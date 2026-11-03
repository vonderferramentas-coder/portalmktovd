/**
 * Passeios do Gerador de Cartazes (cartaz-generator.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * A área de trabalho (páginas e prévia) só existe depois de importar uma planilha: antes disso o motor pula esses alvos.
 */
(function(){
const hasWork = () => !document.getElementById('work').hidden;
const foldOpen = id => () => document.getElementById(id).open;
const foldClosed = id => () => !document.getElementById(id).open;

PortalTour.register('gerador-cartazes', {
  version: 1,
  title: 'Gerador de Cartazes',
  tours: [
    {
      id: 'cartazes-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Do arquivo do Excel até os cartazes prontos para imprimir.',
      steps: [
        { title: 'Boas-vindas ao Gerador de Cartazes', text: 'Aqui a planilha de produtos vira cartazes em A4 e A3, prontos para imprimir ou exportar em PDF e JPG. Vou mostrar as partes da tela. Para sair a qualquer momento, aperte Esc.' },
        { target: '.import .box', title: 'Importar itens', text: 'O ponto de partida: envie a planilha tratada ou adicione um item na mão.' },
        { target: '.cg-dashboard', title: 'Resumo', text: 'Depois de importar, mostra quantas marcas, produtos e páginas A4 e A3 saíram, e o que precisa de atenção.' },
        { target: '#templatesFold', title: 'Template do cartaz', text: 'O fundo e o visual do cartaz por evento. Há um passeio só sobre template e configurações.' },
        { target: '#configFold', title: 'Configurações do cartaz', text: 'Quantos produtos cabem por folha e como cada caixa é montada.' },
        { target: '#gridLibrary', title: 'Planilhas salvas', text: 'As grades que a equipe salvou, para abrir e continuar editando.' },
        { target: '.print-actions', title: 'Imprimir e exportar', text: 'Depois de importar, estes botões imprimem ou geram PDF e JPG de todas as marcas ou só das que você escolher.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para fazer os outros passeios.' }
      ]
    },
    {
      id: 'cartazes-importar',
      title: 'Importar a planilha',
      summary: 'Preparar o Excel, importar e entender o resumo.',
      steps: [
        { target: '.cg-tip-btn[aria-label="Como preparar a planilha"]', interact: true, title: 'Como preparar a planilha', text: 'Passe o mouse ou clique no "i" para ler quais colunas o Excel precisa ter. Uma linha por produto.' },
        { target: 'label.upload', title: 'Selecionar planilha', text: 'Clique aqui e escolha o arquivo .xlsx ou .xls. Ele precisa estar tratado, no formato descrito no "i" ao lado. Neste tutorial nada é importado.' },
        { target: '#manualItemBtn', title: 'Adicionar item na mão', text: 'Falta um produto na planilha? Adicione aqui, sem precisar mexer no Excel.' },
        { target: '.cg-metrics', title: 'Resumo da importação', text: 'Conta marcas, produtos, páginas A4 e A3, produtos sem código de barras e códigos ocultos. Confira se os números batem com a planilha.' },
        { target: '#metricIssuesBox', interact: true, title: 'Observações nos textos', text: 'Mostra quantos textos têm problemas, como erro de grafia ou formato fora do padrão. Clique para abrir a revisão e corrigir um a um.' },
        { title: 'Pronto', text: 'Planilha conferida, é hora de revisar as páginas. Todo cartaz precisa ser revisado por uma pessoa antes de imprimir, principalmente os preços.' }
      ]
    },
    {
      id: 'cartazes-template-config',
      title: 'Template e configurações',
      summary: 'Trocar o fundo do evento e ajustar o layout do cartaz.',
      steps: [
        { target: '#templatesFold summary', click: true, when: foldClosed('templatesFold'), done: foldOpen('templatesFold'), title: 'Abrir o template', text: 'Clique em "Template do cartaz" para abrir a seção.' },
        { target: '#templateSets', title: 'Template por evento', text: 'Cada evento tem um fundo para A4 e outro para A3. Escolha qual está vigente; o cartaz usa sempre o vigente. Passe o mouse no "i" do título para ver o formato dos arquivos.' },
        { target: '#templatesFold summary', click: true, done: foldClosed('templatesFold'), title: 'Fechar o template', text: 'Clique de novo no título para fechar.' },
        { target: '#configFold summary', click: true, when: foldClosed('configFold'), done: foldOpen('configFold'), title: 'Abrir as configurações', text: 'Clique em "Configurações do cartaz".' },
        { target: '#configBody', title: 'Configurações do template vigente', text: 'Quantos produtos cabem por folha e como cada caixa é montada. Elas valem para o template vigente e entram nas páginas geradas a partir de agora.' },
        { target: '#configFold summary', click: true, done: foldClosed('configFold'), title: 'Fechar', text: 'Clique de novo no título para fechar.' },
        { title: 'Pronto', text: 'Mudou o template ou a configuração? Confira as páginas na prévia antes de imprimir.' }
      ]
    },
    {
      id: 'cartazes-paginas',
      title: 'Conferir, ajustar e imprimir',
      summary: 'Revisar as páginas, corrigir produtos e gerar o PDF ou a impressão.',
      steps: [
        { when: () => !hasWork(), title: 'Importe uma planilha primeiro', text: 'Este passeio mostra a área de trabalho, que só aparece depois de importar a planilha (ou abrir uma planilha salva). Faça isso e refaça o passeio.' },
        { target: '#work .pages', title: 'Lista de páginas', text: 'Cada página A4 ou A3 que será impressa, agrupada por marca. Clique numa página para ver na prévia.' },
        { target: '#pagesMenuBtn', title: 'Opções da lista', text: 'Ações sobre as páginas, como dividir uma marca em mais de uma página.' },
        { target: '#linkBar', title: 'Marcas vinculadas', text: 'Quando duas marcas dividem a mesma folha, ficam vinculadas aqui.' },
        { target: '#list', title: 'Produtos da página', text: 'Os cartões da página. Arraste para mudar a ordem. O menu de três pontinhos de cada produto tem Editar, Destaque, Substituir foto e Excluir produto.', danger: 'Excluir produto tira o item da página.' },
        { target: '#preview', title: 'Prévia', text: 'O cartaz do jeito que vai sair. Confira nome, preço, código de barras e foto de cada produto.' },
        { target: '#undoBtn', title: 'Desfazer', text: 'Volta a última alteração nas páginas (também com Ctrl+Z).' },
        { target: '#saveGrid', title: 'Salvar grade', text: 'Guarda a grade com um nome para a equipe abrir depois.', danger: 'Salvar grava a grade para toda a equipe.' },
        { target: '#printMenu', title: 'Imprimir', text: 'Imprime em A4 ou A3, da marca atual ou de todas.' },
        { target: '#exportMenu', title: 'Exportar', text: 'Gera PDF ou JPG da marca atual, de todas ou só das marcas que você escolher.' },
        { title: 'Pronto', text: 'Antes de imprimir, confira os preços do cartaz com a campanha vigente.' }
      ]
    },
    {
      id: 'cartazes-planilhas-salvas',
      title: 'Planilhas salvas',
      summary: 'Abrir uma grade que a equipe já salvou.',
      steps: [
        { target: '#gridLibrary summary', click: true, when: foldClosed('gridLibrary'), done: foldOpen('gridLibrary'), title: 'Abrir a lista', text: 'Clique em "Planilhas salvas".' },
        { target: '#savedGrids', title: 'As grades da equipe', text: 'Clique numa grade para abri-la e continuar editando os cartazes. Cada item tem também a opção de excluir.', danger: 'Excluir apaga a grade para toda a equipe e não dá para desfazer.' },
        { title: 'Pronto', text: 'Agora você sabe retomar um trabalho de onde a equipe parou.' }
      ]
    }
  ]
});
})();
