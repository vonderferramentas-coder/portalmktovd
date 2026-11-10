/**
 * Passeios do Gerador de Consolidado (consolidado-generator.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * A tela tem duas visões (biblioteca e editor) e o editor só mostra produtos depois de escolher a origem: o motor pula o que não está visível.
 */
(function(){
const visible = id => { const el = document.getElementById(id); return !!el && !el.hidden; };
const inEditor = () => visible('editorView');
const hasWorkspace = () => visible('workspace');

PortalTour.register('gerador-consolidado', {
  version: 1,
  title: 'Gerador de Consolidado',
  tours: [
    {
      id: 'consolidado-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Para que serve o consolidado e onde ficam os informativos salvos.',
      steps: [
        { when: inEditor, title: 'Volte à biblioteca', text: 'Este passeio fala da biblioteca de informativos. Clique em "Todos os consolidados" (se houver mudança sem salvar, a tela pergunta) e refaça o passeio.' },
        { title: 'Boas-vindas ao Gerador de Consolidado', text: 'Aqui você monta o informativo mensal de lançamentos a partir de uma planilha, confere a prévia e baixa o PDF. Para sair a qualquer momento, aperte Esc.' },
        { target: '#newConsolidado', title: 'Criar novo consolidado', text: 'Abre o editor para começar um informativo novo. Há um passeio só sobre isso.' },
        { target: '#libraryCount', title: 'Quantos há', text: 'O total de consolidados salvos.' },
        { target: '#savedConsolidados', title: 'Biblioteca', text: 'Os informativos salvos pela equipe, agrupados por ano. Clique num para abrir e continuar editando.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para fazer os outros passeios.' }
      ]
    },
    {
      id: 'consolidado-criar',
      title: 'Montar um consolidado',
      summary: 'Escolher a origem dos produtos, ajustar o conteúdo e baixar o PDF.',
      steps: [
        { target: '#newConsolidado', click: true, when: () => !inEditor(), done: inEditor, title: 'Criar novo consolidado', text: 'Clique em "+ Criar novo consolidado". Nada vai ser salvo nem baixado neste tutorial.' },
        { target: '#consolidadoTitle', interact: true, title: 'Nome', text: 'O nome que identifica o informativo na biblioteca, por exemplo "Consolidado Agosto 2026".' },
        { target: '#consolidadoMonth', interact: true, title: 'Mês do informativo', text: 'O mês a que o informativo se refere.' },
        { target: '#sheetDropzone', title: 'Planilha de produtos', text: 'Arraste a planilha para cá ou clique para escolher o arquivo .xlsx ou .xls. Se tiver mais de uma aba, uma lista deixa escolher qual usar.' },
        { target: '#startBlank', click: true, when: () => !hasWorkspace(), done: hasWorkspace, title: 'Começar do zero', text: 'Sem planilha, clique aqui para montar o informativo adicionando os produtos na mão.' },
        { target: '#addProduct', title: 'Adicionar produto', text: 'Inclui mais um produto no informativo.' },
        { target: '#brandToggles', title: 'Marcas próprias', text: 'Clique numa marca para incluir ou tirar a seção dela do informativo.' },
        { target: '#squareList', title: 'Lista de produtos', text: 'Abra um produto para ajustar título, link ou foto.' },
        { target: '#pagesPreview', title: 'Prévia', text: 'As páginas do informativo do jeito que serão baixadas. Confira textos, links e fotos de cada produto.' },
        { target: '#saveConsolidado', title: 'Salvar', text: 'Guarda o informativo na biblioteca para continuar depois.', danger: 'Salvar grava o consolidado para toda a equipe.' },
        { target: '#exportPdf', title: 'Baixar PDF', text: 'Gera o PDF do informativo. Fica ativo quando há produtos.' },
        { target: '#backToLibrary', title: 'Voltar à biblioteca', text: 'Leva de volta à lista. Se houver alteração sem salvar, a tela avisa antes de perder.' },
        { title: 'Pronto', text: 'Todo informativo precisa ser revisado por uma pessoa antes de ser enviado, principalmente links e fotos.' }
      ]
    },
    {
      id: 'consolidado-biblioteca',
      title: 'Achar um consolidado salvo',
      summary: 'Buscar, filtrar por ano e abrir.',
      steps: [
        { when: inEditor, title: 'Volte à biblioteca', text: 'Clique em "Todos os consolidados" e refaça este passeio.' },
        { target: '#librarySearch', interact: true, title: 'Buscar', text: 'Digite parte do nome para filtrar a lista. Aparece quando há consolidados salvos.' },
        { target: '#libraryYear', interact: true, title: 'Filtrar por ano', text: 'Mostra só os informativos de um ano. Só aparece quando há consolidados de mais de um ano.' },
        { target: '#savedConsolidados', title: 'Abrir ou excluir', text: 'Clique num informativo para abrir. O menu de três pontinhos de cada item tem Duplicar e Excluir.', danger: 'Excluir apaga o informativo para toda a equipe.' },
        { title: 'Pronto', text: 'Agora você sabe retomar um informativo de onde parou.' }
      ]
    }
  ]
});
})();
