/**
 * Passeio da página Gerador (gerador.html), o ponto de partida dos geradores. Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * Cada gerador tem o próprio passeio, dentro da própria tela. Geradores que a marca ou o perfil não pode abrir não têm cartão: o motor pula o passo.
 */
(function(){
PortalTour.register('gerador', {
  version: 1,
  title: 'Gerador',
  tours: [
    {
      id: 'gerador-visao-geral',
      title: 'Conhecer os geradores',
      summary: 'Qual gerador escolher para cada tarefa.',
      steps: [
        { title: 'Boas-vindas ao Gerador', text: 'Esta página reúne as ferramentas que geram peças prontas a partir de dados, como planilhas. Escolha a que combina com a sua tarefa. Para sair a qualquer momento, aperte Esc.' },
        { target: '#genGrid', title: 'Os geradores', text: 'Cada cartão abre um gerador. Os que a sua marca ou o seu perfil não pode usar não aparecem.' },
        { target: '.gen-card[href="cartaz-generator.html"]', title: 'Cartazes', text: 'Transforma a planilha de produtos em cartazes A4 e A3 para imprimir.' },
        { target: '.gen-card[href="consolidado-generator.html"]', title: 'Consolidado', text: 'Monta o informativo mensal de lançamentos e baixa em PDF.' },
        { target: '.gen-card[href="business-card-generator.html"]', title: 'Cartão de visitas', text: 'Gera os cartões da equipe, prontos para a gráfica, a partir de uma planilha ou na mão.' },
        { target: '.gen-card[href="qr-code-generator.html"]', title: 'QR Codes e links', text: 'Cria QR Codes e links que contam quantas pessoas acessaram.' },
        { target: '.gen-card[href="barcode-generator.html"]', title: 'Código de barras', text: 'Gera imagens de código de barras em PNG ou WMF a partir dos números.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Dentro de cada gerador há o botão "Como usar" com o passo a passo daquela ferramenta.' }
      ]
    }
  ]
});
})();
