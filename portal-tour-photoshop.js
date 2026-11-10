/**
 * Passeio da biblioteca Ações do Photoshop (photoshop-actions.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 */
(function(){
PortalTour.register('photoshop-actions', {
  version: 1,
  title: 'Ações do Photoshop',
  tours: [
    {
      id: 'photoshop-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Para que serve a biblioteca e como abrir uma ação.',
      steps: [
        { title: 'Boas-vindas às Ações do Photoshop', text: 'Esta é a biblioteca de automações do time para o Photoshop. Cada ação tem um tutorial de instalação e os arquivos para baixar. Para sair a qualquer momento, aperte Esc.' },
        { target: '.pa-card', title: 'Uma ação', text: 'Cada cartão é uma automação, com o nome e o que ela faz. Clique no cartão para abrir o tutorial e os downloads. Nada é baixado neste passeio.' },
        { target: '.pa-coming', title: 'Novas ações', text: 'O time vai acrescentar novas automações aqui. Elas aparecem como novos cartões.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Abra a ação "Preparar arquivo para o Espanhol" e clique em "Como usar" nela para ver o passo a passo da instalação.' }
      ]
    }
  ]
});
})();
