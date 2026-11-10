/**
 * Passeios do Gerador de QR Codes (qr-code-generator.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * A tela tem duas visões (biblioteca e formulário de criação): o que não está visível na visão atual é pulado pelo motor.
 */
(function(){
const inForm = () => !document.getElementById('qrgWorkspace').hidden;
const genMenuOpen = () => document.getElementById('openGenerator').getAttribute('aria-expanded') === 'true';
const trackOpen = () => document.getElementById('trackBox').open;

PortalTour.register('gerador-qr', {
  version: 1,
  title: 'Gerador de QR Codes',
  tours: [
    {
      id: 'qr-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Para que serve o gerador e onde ficam os QR Codes salvos.',
      steps: [
        { when: inForm, title: 'Volte à biblioteca', text: 'Este passeio fala da biblioteca. Clique em "Cancelar" ou em "Voltar aos QR Codes" e refaça o passeio.' },
        { title: 'Boas-vindas ao Gerador de QR Codes', text: 'Aqui você cria QR Codes para artes e materiais, guarda numa biblioteca da equipe e acompanha quantas pessoas escanearam cada um. Para sair a qualquer momento, aperte Esc.' },
        { target: '#libraryCount', title: 'Quantos há', text: 'O total de QR Codes salvos na biblioteca compartilhada.' },
        { target: '#openGenerator', title: 'Gerar QR Code', text: 'Cria um QR Code novo, digitando os dados (Manual) ou importando uma planilha (Importar). Há um passeio só sobre isso.' },
        { target: '#openLinkGenerator', title: 'Gerar só link rastreável', text: 'Para quando você precisa só do link que conta acessos, sem a imagem do QR Code.' },
        { target: '#libraryList', title: 'Biblioteca', text: 'Os QR Codes salvos aparecem aqui, com o contador de acessos. Clique num para abrir e usar.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para fazer os outros passeios.' }
      ]
    },
    {
      id: 'qr-criar',
      title: 'Criar um QR Code',
      summary: 'Do link de destino até baixar a imagem e salvar na biblioteca.',
      steps: [
        { target: '#openGenerator', click: true, when: () => !inForm(), done: genMenuOpen, title: 'Gerar QR Code', text: 'Clique em "Gerar QR Code" para ver as opções.' },
        { target: '#genMenu [data-gen="manual"]', click: true, when: () => !inForm(), done: inForm, title: 'Manual', text: 'Clique em "Manual" para abrir o formulário. "Importar" cria vários de uma vez a partir de uma planilha. Nada vai ser salvo neste tutorial.' },
        { target: '#qrName', interact: true, title: 'Nome do QR Code', text: 'Um nome para você achar depois na biblioteca. Exemplo: "Vagas terminal sul".' },
        { target: '#link', interact: true, title: 'Link de destino', text: 'Para onde o QR Code leva quem escanear. Cole um link completo, começando por https://. A prévia se atualiza sozinha.' },
        { target: '#color', interact: true, title: 'Cor principal', text: 'A cor do QR Code. Mantenha escuro sobre fundo claro: cor clara demais dificulta a leitura no celular.' },
        { target: '#code', title: 'Prévia ao vivo', text: 'O QR Code do jeito que será baixado. Teste com o celular antes de usar numa peça impressa.' },
        { target: '#saveQr', title: 'Salvar QR Code', text: 'Guarda na biblioteca da equipe.', danger: 'Salvar grava o QR Code para toda a equipe.' },
        { target: '#cancelGenerator', click: true, done: () => !inForm(), title: 'Cancelar', text: 'Clique em "Cancelar" para voltar à biblioteca sem salvar nada.' },
        { title: 'Pronto', text: 'Depois de gerar, baixe em SVG (vetor, para impressão) ou PNG e confira a leitura antes de enviar a arte.' }
      ]
    },
    {
      id: 'qr-rastreavel',
      title: 'Link rastreável',
      summary: 'Contar quantas pessoas escanearam o QR Code.',
      steps: [
        { when: () => !inForm(), title: 'Abra o formulário primeiro', text: 'O link rastreável fica no formulário de criação. Clique em "Gerar QR Code", escolha "Manual" e refaça este passeio.' },
        { target: '#trackBox summary', click: true, when: () => !trackOpen(), done: trackOpen, title: 'Abrir o link rastreável', text: 'Clique em "Link rastreável". Clique no "i" depois do passeio para ler o passo a passo completo.' },
        { target: '#folderBrand', interact: true, title: 'Pasta da marca', text: 'Escolha a pasta da marca que já existe em /redir/ no servidor de arquivos.' },
        { target: '#folderName', interact: true, title: 'Nome da nova pasta', text: 'A pasta que você vai criar dentro da pasta da marca. Sem acento nem espaço: a tela ajusta sozinha.' },
        { target: '#fileName', interact: true, title: 'Nome do arquivo HTML', text: 'O nome do arquivo que será publicado, normalmente "index".' },
        { target: '#bridgeUrl', title: 'Link final', text: 'O endereço que o QR Code passa a usar. Ele registra o acesso, sem IP nem cookie, e leva a pessoa ao link de destino.' },
        { target: '.qrg-warn', title: 'Atenção', text: 'Depois que o QR Code for impresso ou publicado, não mude a pasta da marca, o nome da pasta nem o nome do arquivo. Os acessos são contados por esse caminho.' },
        { target: '#cancelGenerator', click: true, done: () => !inForm(), title: 'Cancelar', text: 'Clique em "Cancelar" para voltar sem salvar.' },
        { title: 'Pronto', text: 'Com rastreio, o contador de acessos aparece no card da biblioteca depois que o arquivo HTML for publicado.' }
      ]
    },
    {
      id: 'qr-biblioteca',
      title: 'Biblioteca e acessos',
      summary: 'Abrir um QR Code salvo, ver os acessos e baixar tudo.',
      steps: [
        { when: inForm, title: 'Volte à biblioteca', text: 'Clique em "Cancelar" ou em "Voltar aos QR Codes" e refaça este passeio.' },
        { target: '#libraryList .qrg-item', title: 'Cada QR Code', text: 'O card mostra o nome, o destino e, para links rastreáveis, quantas pessoas acessaram. Clique para abrir; o menu de três pontinhos tem as demais ações.', danger: 'Excluir um QR Code apaga o item para toda a equipe.' },
        { target: '#zipAll', title: 'Baixar tudo', text: 'Baixa todos os QR Codes da biblioteca em um arquivo .zip. Aparece quando há QR Codes salvos.' },
        { title: 'Pronto', text: 'Agora você sabe achar um QR Code e acompanhar os acessos dele.' }
      ]
    }
  ]
});
})();
