/**
 * Passeios do Editor de Posts (post-editor.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * A tela tem três etapas (editoria, produto, edição) e cada editoria mostra campos diferentes: o que não aparece
 * na editoria escolhida é pulado sozinho pelo motor.
 */
(function(){
const shown = id => { const el = document.getElementById(id); return !!el && !el.hidden; };

PortalTour.register('editor-posts', {
  version: 1,
  title: 'Editor de Posts',
  tours: [
    {
      id: 'editor-posts-visao-geral',
      title: 'Conhecer a tela',
      summary: 'As etapas do editor e onde ficam as artes salvas.',
      steps: [
        { title: 'Boas-vindas ao Editor de Posts', text: 'Aqui você monta a arte de uma postagem (Feed e Story) a partir de um modelo pronto de cada editoria. Vou mostrar as etapas. Para sair a qualquer momento, aperte Esc.' },
        { target: '.pe-flow', title: 'As etapas', text: 'O caminho é sempre o mesmo: escolher a editoria, escolher o produto e editar o post. Algumas editorias pulam a escolha do produto, e outras têm uma etapa extra para o banner da intranet. Etapas já feitas ficam clicáveis para você voltar.' },
        { target: '#editoriaGrid', title: 'Editorias', text: 'Cada editoria tem o seu modelo de composição. As que aparecem como "Em breve" ainda não têm modelo pronto.' },
        { target: '#savedArts', title: 'Artes salvas', text: 'As artes que você salvou ficam aqui para continuar de onde parou. Há um passeio só sobre isso.' },
        { target: '.pe-back', title: 'Voltar ao calendário', text: 'Leva de volta ao Calendário de Postagens.' },
        { target: '#tourHelpBtn', title: 'Pronto!', text: 'Para criar uma arte passo a passo, clique em "Como usar" e escolha "Criar uma arte".' }
      ]
    },
    {
      id: 'editor-posts-criar-arte',
      title: 'Criar uma arte',
      summary: 'Da escolha da editoria até baixar o Feed e o Story.',
      steps: [
        { target: '#editoriaGrid', click: true, done: () => !shown('editoriaChooser'), title: 'Escolha a editoria', text: 'Clique na editoria da postagem. Nada vai ser salvo nem baixado neste tutorial.' },
        { target: '#fgOfferProductImport', interact: true, title: 'Link da oferta', text: 'Para ofertas da Ferramentas Gerais, cole aqui o link do produto no site e clique em "Puxar dados": nome, código, preço e disponibilidade vêm sozinhos.' },
        { target: '#catalogSearchArea', interact: true, title: 'Buscar o produto', text: 'Digite o nome ou o código do produto. Os últimos que você usou aparecem logo de cara.' },
        { target: '#manualProduct', title: 'Continuar sem catálogo', text: 'O produto não está no catálogo? Este botão abre o editor com os campos em branco para você preencher na mão.' },
        { target: '#productChooser .pe-chooser-card', interact: true, done: () => shown('editorWorkspace'), title: 'Escolha um produto', text: 'Clique no produto da lista (ou em "Continuar sem catálogo"). Quando o editor abrir, clique em Próximo.' },
        { target: '#selectedEditoriaBarEdit', title: 'Editoria escolhida', text: 'Mostra a editoria da arte. "Trocar" volta para a escolha da editoria; se houver edição sem salvar, a tela avisa antes de perder.' },
        { target: '#selectedProductSummary', title: 'Produto', text: 'O produto escolhido, com a foto do catálogo. "Trocar" volta para a busca e mantém a editoria.' },
        { target: '#commemorativeFields', title: 'Data comemorativa', text: 'Dia, mês e chamada que aparecem na arte. Já vêm preenchidos, mas dá para editar.' },
        { target: '#productName, #productNameRich', title: 'Texto da arte', text: 'O nome do produto, que vem do catálogo, mas é editável. O que você digita aparece na arte ao lado.' },
        { target: '#codeControls', title: 'Códigos', text: 'Um ou dois códigos do produto, com a variação (por exemplo, 110 V e 220 V) de cada um.' },
        { target: '#brandVariantField', title: 'Marca no cabeçalho', text: 'A marca do produto anunciado, usada no logo do cabeçalho. Vem do cadastro do produto; use "Trocar" só se precisar de outra.' },
        { target: '#ecommercePricing', title: 'Oferta', text: 'Preço "Por", preço "De" ou desconto, chamada e último dia da oferta. Confira os valores importados: o preço da arte tem de ser o da oferta vigente.' },
        { target: '#backgroundDrop', title: 'Foto de fundo', text: 'Clique para escolher a imagem de fundo, ou arraste o arquivo para cá. Use só fotos que a empresa pode usar.' },
        { target: '#productDrop', title: 'Produto recortado', text: 'Opcional: envie o produto com fundo transparente (PNG) ou em foto com fundo branco. As caixas abaixo removem o fundo branco.' },
        { target: '#compositionSection', title: 'Composição', text: 'Ajustes opcionais: layout, tamanho do destaque e do produto e cor do círculo. Escolha se o ajuste vale para o Feed ou para o Story, ou mantenha os dois iguais.' },
        { target: '#compositionSuggestionsSection', title: 'Sugestões de composição', text: 'O botão "Gerar 3 opções" monta três pontos de partida. Escolha o que mais agrada e continue ajustando.' },
        { target: '.pe-stage-toolbar', title: 'Ajustar direto na arte', text: 'Você também pode arrastar na pré-visualização. Escolha se vai mover o fundo ou o destaque; "Desfazer" (ou Ctrl+Z) volta o último movimento e "Restaurar posições" volta ao início.' },
        { target: '#postPreviews', title: 'Pré-visualização', text: 'Feed e Story do jeito que serão baixados. Confira textos, preço e foto: toda arte precisa ser revisada por uma pessoa antes de ir ao ar.' },
        { target: '#saveArt', title: 'Salvar arte', text: 'Guarda a última versão para continuar depois. A arte também é salva sozinha enquanto você edita.', danger: 'Salvar arte grava a arte na sua conta.' },
        { target: '#downloadBoth', title: 'Baixar', text: 'O pacote ZIP traz Feed e Story com os nomes padronizados. Se precisar de um só, use os botões Feed JPG e Story JPG.' },
        { target: '#nextProduct', title: 'Outro produto', text: 'Volta para a escolha do produto mantendo a mesma editoria, para fazer a próxima arte da sequência.' },
        { target: '[data-flow-step="banner"]', title: 'Banner da intranet', text: 'Nesta editoria dá para desdobrar a arte em um banner 900 × 258 para a intranet. Clique na etapa para montar e baixar o banner.' },
        { title: 'Pronto!', text: 'Agora você sabe criar uma arte. Para fazer outra, use "Outro produto" ou "Trocar" a editoria.' }
      ]
    },
    {
      id: 'editor-posts-artes-salvas',
      title: 'Artes salvas',
      summary: 'Continuar uma arte, buscar, filtrar e recuperar da lixeira.',
      steps: [
        { when: () => !shown('editoriaChooser'), title: 'Volte à primeira etapa', text: 'As artes salvas ficam na etapa de editorias. Clique em "Escolher editoria" no topo (ou em "Trocar") e refaça este passeio.' },
        { target: '#editoriaChooser', when: () => shown('editoriaChooser'), title: 'Etapa de editorias', text: 'As artes salvas ficam na primeira etapa, embaixo da escolha da editoria.' },
        { target: '#savedArtsInfo', interact: true, title: 'Como funcionam', text: 'Clique no "i" para ler quanto tempo as fotos ficam guardadas e como a arte é salva sozinha. Clique de novo para fechar.' },
        { target: '#savedArtsSearch', interact: true, title: 'Buscar', text: 'Procure uma arte pelo título ou pela editoria.' },
        { target: '#savedArtsFilters', title: 'Filtros', text: 'Quando há artes de mais de uma editoria, os botões filtram a lista.' },
        { target: '#savedArtsList', title: 'A lista', text: 'Clique numa arte para abrir e continuar editando. No menu de três pontinhos de cada arte ficam Duplicar e Excluir.', danger: 'Excluir manda a arte para a lixeira.' },
        { target: '#savedArtsTrash', title: 'Lixeira', text: 'As artes excluídas ficam aqui por alguns dias e podem ser restauradas nesse prazo.' },
        { title: 'Pronto!', text: 'Agora você sabe continuar uma arte de onde parou.' }
      ]
    }
  ]
});
})();
