/**
 * Passeio da ação "Preparar arquivo para o Espanhol" (photoshop-action-prepare-spanish.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 */
(function(){
PortalTour.register('photoshop-espanhol', {
  version: 1,
  title: 'Preparar arquivo para o Espanhol',
  tours: [
    {
      id: 'photoshop-espanhol-instalar',
      title: 'Baixar e instalar a ação',
      summary: 'Escolher o script certo e gravar a ação no Photoshop.',
      steps: [
        { title: 'Boas-vindas', text: 'Esta ação prepara o arquivo do Photoshop para tradução: mantém o fundo renderizado e deixa só os textos editáveis. Vou mostrar como baixar e instalar. Para sair a qualquer momento, aperte Esc.' },
        { target: '.pd-downloads', title: 'Dois scripts', text: 'Baixe apenas o script que serve ao seu arquivo. O de PSD comum é para arte sem pranchetas. O de Feed e Story é para PSD ou PSB com mais de uma prancheta. Neste passeio nada é baixado.' },
        { target: '.pd-section', title: 'Instalação', text: 'Quatro passos, sem precisar de acesso de administrador. Clique no título de cada passo para abrir ou fechar.' },
        { target: '.pd-step', interact: true, title: 'Passo 1: guardar o arquivo', text: 'Salve o script numa pasta fixa, como Documentos\Scripts Photoshop, e não mova nem renomeie depois. A ação grava o caminho do arquivo.' },
        { target: '.pd-section .pd-step:nth-of-type(2)', title: 'Passo 2: gravar a ação', text: 'No Photoshop, abra Janela, Ações, crie a ação "Preparar arquivo para o Espanhol" e clique em Gravar.' },
        { target: '.pd-section .pd-step:nth-of-type(3)', title: 'Passo 3: vincular o script', text: 'Em Arquivo, Scripts, Procurar, escolha o script baixado, cancele a escolha de pasta e clique em Parar gravação.' },
        { target: '.pd-section .pd-step:nth-of-type(4)', title: 'Passo 4: executar na arte', text: 'Abra o arquivo, rode a ação e escolha a pasta de destino. Revise os PSDs gerados antes de enviar para tradução.' },
        { target: '.pd-note', title: 'Limite importante', text: 'Textos rasterizados ou dentro de Objetos Inteligentes não viram texto editável sozinhos. Nesses casos o ajuste é manual.' },
        { target: '.pd-back', title: 'Voltar', text: 'Leva de volta à biblioteca de ações.' }
      ]
    }
  ]
});
})();
