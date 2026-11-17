/**
 * Passeios do Gerador de Código de Barras (barcode-generator.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * A lista de resultados só aparece depois de importar ou digitar um código: antes disso o motor pula esses alvos.
 */
(function(){
const hasResults = () => !document.getElementById('results').hidden;
const menuOpen = () => !document.getElementById('dlMenu').hidden;

PortalTour.register('gerador-codigo-barras', {
  version: 1,
  title: 'Código de Barras',
  tours: [
    {
      id: 'barras-visao-geral',
      title: 'Conhecer a tela',
      summary: 'As duas formas de gerar código de barras e onde ficam os resultados.',
      steps: [
        { title: 'Boas-vindas ao Gerador de Código de Barras', text: 'Aqui os números viram imagens de código de barras, em PNG de alta resolução ou WMF (vetorial), prontas para usar nas artes. Para sair a qualquer momento, aperte Esc.' },
        { target: '.bc-in .bc-box:first-child', title: 'Por planilha', text: 'Envie um arquivo .xlsx, .xls ou .csv e o sistema acha sozinho a coluna do código de barras. Clique no "i" do título para ver as regras.' },
        { target: '.bc-in .bc-box:last-child', title: 'Digitar manualmente', text: 'Para poucos códigos, digite os números e clique em "Gerar". Dá para colocar vários de uma vez.' },
        { target: '#empty', title: 'Resultados', text: 'Os códigos gerados aparecem em uma lista logo abaixo. Enquanto não houver nenhum, esta mensagem fica aqui.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para fazer os outros passeios.' }
      ]
    },
    {
      id: 'barras-gerar',
      title: 'Gerar códigos',
      summary: 'Digitar números ou importar a planilha, e entender os tipos aceitos.',
      steps: [
        { target: '.bc-info[aria-label="Sobre: Digitar manualmente"]', interact: true, title: 'Regras da digitação', text: 'Clique no "i" para ler os tipos aceitos: EAN-13, UPC-A, EAN-8 e ITF-14. Se faltar o último dígito do EAN-13 ou do EAN-8, o sistema calcula para você.' },
        { target: '#manualCode', interact: true, title: 'Digite o número', text: 'Digite um ou vários números, separados por espaço, vírgula ou quebra de linha. Exemplo: 7891234567895.' },
        { target: '#manual .btn', title: 'Gerar', text: 'Clique em "Gerar" para criar o código. Ele entra na lista atual, junto do que já estiver lá.' },
        { target: '.bc-info[aria-label="Sobre: Por planilha"]', interact: true, title: 'Regras da planilha', text: 'Clique no "i" para ver qual coluna é lida: o título precisa ser "Código de Barras", "Cód. Barras", "EAN" ou "GTIN". "Código" sozinho não vale, porque costuma ser o código do produto.' },
        { target: 'label.bc-upload', title: 'Selecionar planilha', text: 'Clique aqui e escolha o arquivo. Cada linha vira um código; os que tiverem erro ficam em "Com problema" para corrigir. Enviar outra planilha recomeça do zero. Neste tutorial nada é importado.' },
        { title: 'Pronto', text: 'Na lista de resultados, confira se o número impresso na imagem é o do produto antes de usar na arte.' }
      ]
    },
    {
      id: 'barras-resultados',
      title: 'Conferir e baixar',
      summary: 'Filtrar, ordenar, abrir um código, baixar e ajustar as configurações.',
      steps: [
        { when: () => !hasResults(), title: 'Gere um código primeiro', text: 'Este passeio mostra a lista de resultados, que só aparece depois de gerar um código. Digite um número, clique em "Gerar" e refaça o passeio.' },
        { target: '#count', title: 'Resumo', text: 'Quantos códigos há na lista.' },
        { target: '#filter', interact: true, title: 'Filtro', text: 'Mostra todos, só os válidos ou só os "Com problema".' },
        { target: '#sort', interact: true, title: 'Ordenar', text: 'Ordem da planilha, problemas primeiro, por tipo ou por código crescente.' },
        { target: '#list', title: 'A lista', text: 'Cada código aparece com a imagem. Clique em um para abrir, ver em detalhe e baixar só aquele.' },
        { target: '#dl', click: true, done: menuOpen, title: 'Baixar', text: 'Clique em "Baixar" para ver as opções em lote.' },
        { target: '#dlMenu', title: 'Opções de download', text: 'Todos em PNG ou em WMF, em um arquivo ZIP, ou o relatório da correção em planilha, que lista o que foi ajustado.' },
        { target: '#dl', click: true, done: () => !menuOpen(), title: 'Fechar o menu', text: 'Clique de novo em "Baixar" para fechar sem baixar nada.' },
        { target: '#cfgBtn', title: 'Configurações', text: 'Tamanho da imagem em milímetros, resolução, altura das barras e nome dos arquivos. Valem para PNG e WMF e ficam salvos neste navegador.' },
        { title: 'Pronto', text: 'Se o código sair com problema, corrija o número na planilha ou na digitação e gere de novo.' }
      ]
    }
  ]
});
})();
