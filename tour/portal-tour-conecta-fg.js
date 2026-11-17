/**
 * Passeios da tela Conecta FG (conecta-fg.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * A tela tem duas visões (biblioteca de posts e editor do post aberto): o que não aparece na visão atual é pulado pelo motor.
 */
(function(){
const shown = id => { const el = document.getElementById(id); return !!el && !el.hidden; };

PortalTour.register('conecta-fg', {
  version: 1,
  title: 'Conecta FG',
  tours: [
    {
      id: 'conecta-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Para que serve o Conecta FG e onde ficam o envio do arquivo e os posts salvos.',
      steps: [
        { title: 'Boas-vindas ao Conecta FG', text: 'Aqui o texto do blog em Word (.docx) vira o código pronto para colar no WordPress, já com os produtos, fotos e links. Vou mostrar as partes da tela. Para sair a qualquer momento, aperte Esc.' },
        { target: '.cf-upload', title: 'Enviar o arquivo', text: 'Clique aqui para escolher o .docx do texto. Os produtos podem estar em uma tabela (nome e código) ou como links do site FG no meio do texto.' },
        { target: '#postList', title: 'Posts salvos', text: 'Os posts que você já salvou ficam nesta lista. Abra um para continuar de onde parou e gerar o código de novo.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para fazer os outros passeios: montar o código de um post e gerenciar os posts salvos.' }
      ]
    },
    {
      id: 'conecta-montar-post',
      title: 'Montar o código do post',
      summary: 'Conferir o título e os produtos, organizar os cards e copiar o código para o WordPress.',
      steps: [
        { when: () => !shown('work'), title: 'Abra um post primeiro', text: 'Este passeio acontece dentro de um post. Envie o .docx e clique em "Salvar post", ou abra um post salvo na lista, e depois refaça o passeio.' },
        { target: '#title', title: 'Título do post', text: 'O título que sai do documento. Use "Copiar título" e cole no campo de título do WordPress.' },
        { target: '#copyTitle', title: 'Copiar título', text: 'Copia o título para a área de transferência.' },
        { target: '#productsToggle', interact: true, title: 'Produtos', text: 'Os produtos encontrados no documento. Clique no título para recolher ou abrir esta seção.' },
        { target: '#addRef', interact: true, title: 'Adicionar produto', text: 'Faltou um produto? Cole o link dele no site FG ou o código e clique em "Adicionar".' },
        { target: '#products .cf-prod-mini', title: 'Card do produto', text: 'Mostra a foto, o nome e o código. O selo na foto avisa se o produto foi confirmado no site (verde), se pede conferência (amarelo) ou se deu problema (vermelho). Clique no card para editar o link, a posição e as informações.' },
        { target: '#products .cf-prod-mini-kebab', title: 'Menu do card', text: 'Os três pontinhos abrem Editar e Excluir.', danger: 'Excluir tira o produto do post.' },
        { target: '#spread', title: 'Distribuir pelo texto', text: 'Põe cada produto depois do parágrafo que o cita.' },
        { target: '#group', title: 'Agrupar no final', text: 'Reúne todos os produtos antes do último parágrafo.' },
        { target: '#box', interact: true, title: 'Tamanho da foto', text: 'O tamanho máximo das fotos dos produtos, em pixels.' },
        { target: '#showUsage', title: 'Exibir aplicações', text: 'Liga e desliga as dicas de uso que aparecem junto de cada produto.' },
        { target: '#code', title: 'Código para o WordPress', text: 'Você pode revisar ou apagar trechos antes de copiar. Mudar os produtos ou as opções acima gera o código de novo.' },
        { target: '#copyCode', title: 'Copiar código', text: 'Copia o código. No WordPress, abra o post no modo "Editor de código" e cole.' },
        { target: '#view', title: 'Prévia', text: 'Uma aproximação do resultado. O tema do blog pode mudar fontes e espaçamentos, então confira no WordPress antes de publicar.' },
        { target: '#savePost', title: 'Salvar post', text: 'Guarda o post na lista para continuar depois.', danger: 'Salvar grava o post na lista da equipe.' },
        { target: '#backToPosts', title: 'Voltar', text: 'Volta para a lista de posts. Se houver mudança sem salvar, salve antes de sair.' },
        { title: 'Pronto', text: 'Todo texto e produto gerado precisa ser revisado por uma pessoa antes de ir ao ar.' }
      ]
    },
    {
      id: 'conecta-posts-salvos',
      title: 'Posts salvos',
      summary: 'Abrir, continuar e excluir posts da lista.',
      steps: [
        { when: () => !shown('library'), title: 'Volte à lista', text: 'Os posts salvos ficam na primeira visão da tela. Clique em "Todos os posts" e refaça este passeio.' },
        { target: '#postList', title: 'A lista', text: 'Cada linha mostra o título, a data da última alteração, quantos produtos tem e a situação do post.' },
        { target: '#postList .cf-post-row', title: 'Abrir um post', text: 'Clique na linha para abrir o post e continuar editando.' },
        { target: '#postList .cf-post-actions', title: 'Excluir', text: 'O botão de lixeira exclui o post da lista. Uma janela pede a confirmação antes.', danger: 'Excluir apaga o post para toda a equipe e não dá para desfazer.' },
        { title: 'Pronto', text: 'Agora você sabe achar e continuar um post.' }
      ]
    }
  ]
});
})();
