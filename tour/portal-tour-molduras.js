/**
 * Passeio do Gerador de Molduras (molduras-generator.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 */
(function(){
PortalTour.register('molduras', {
  version: 1,
  title: 'Gerador de Molduras',
  tours: [
    {
      id: 'molduras-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Da moldura ao ZIP com todos os desenhos prontos.',
      steps: [
        { title: 'Boas-vindas ao Gerador de Molduras', text: 'Aqui o desenho de cada criança entra numa moldura, com o nome, a idade e o colaborador. Para sair a qualquer momento, aperte Esc.' },
        { target: '#mgFrames > summary', title: 'Moldura e texto', text: 'É a configuração, feita uma vez e salva. Com as duas molduras prontas, esta área fica recolhida; clique nela para ajustar de novo.' },
        { target: '#mgFormats', when: () => document.getElementById('mgFrames').open, title: 'Formatos que vou usar', text: 'Escolha somente paisagem, somente retrato ou ambos. Só os formatos escolhidos pedem moldura e posição do texto; desenhos de um formato desligado entram na lista de não gerados.' },
        { target: '.mg-frames', when: () => document.getElementById('mgFrames').open, title: 'Molduras', text: 'Envie um PNG em retrato e outro em paisagem, com o miolo transparente. Cada campo recusa o formato trocado e avisa o que fazer.' },
        { target: '#mgPreview', when: () => document.getElementById('mgFrames').open, title: 'Prévia', text: 'Mostra a moldura com um texto de exemplo. Clique ou arraste na prévia para posicionar o texto; fonte, cor e tamanho mudam a prévia na hora.' },
        { target: '#mgSlotsWrap', when: () => document.getElementById('mgFrames').open, title: 'Posição do texto', text: 'A mini moldura tem um botão em cada canto e um no centro. Clique na sigla para usar a posição; na engrenagem, ajuste alinhamento, posicionamento, fonte e cores e confirme em Salvar. Use + Novo local para criar quantas posições personalizadas quiser. A posição padrão (sigla cheia) é a que vale sempre que a tela abre.' },
        { target: '#fileSheet', title: 'Planilha', text: 'Uma linha por filho, com matrícula, colaborador, criança e data de nascimento. A idade é calculada pela data de hoje.' },
        { target: '#mgLotes', title: 'Conjuntos salvos', text: 'Depois de subir a planilha e o ZIP, use Salvar conjunto para guardar tudo. Aqui aparece a lista: Abrir traz planilha, desenhos e ajustes de volta, em outro dia ou por outro administrador, sem subir nada de novo.' },
        { target: '#fileZip', title: 'ZIP dos desenhos', text: 'Imagens ou PDFs (vale só a primeira página de cada PDF, a segunda é o verso). O nome de cada arquivo é a matrícula do colaborador, e a tela cruza com a planilha sozinha.' },
        { target: '#mgFilter', title: 'Pendentes', text: 'O filtro Pendentes mostra só os desenhos que ainda precisam de atenção: matrícula com mais de um filho ou que não está na planilha.' },
        { target: '#mgResultList', title: 'Lista de desenhos', text: 'Cada desenho da lista mostra o texto que vai na peça e a situação dele. Clique num desenho para ver ao lado como ele está ficando; as setas do teclado sobem e descem na lista.' },
        { target: '#edCanvas', when: () => !document.getElementById('mgEd').hidden, title: 'Prévia do desenho', text: 'Mostra a peça como vai sair. Dê um duplo clique no desenho para liberar o zoom e o reposicionamento: aí arraste para mover e use a roda do mouse para ampliar. O espaço que sobrar fica branco. A moldura é a mesma para todos os desenhos quando só um formato está em uso.' },
        { target: '#mgResultList .mg-qrow.is-sel .mg-qedit', when: () => !!document.querySelector('#mgResultList .mg-qrow.is-sel .mg-qedit'), title: 'Editar os dados', text: 'Clicar na linha só mostra o desenho na prévia. O lápis ao final da linha abre a edição dos dados.' },
        { target: '#mgEdFields', when: () => !!document.querySelector('#mgResultList .mg-qrow.is-open #mgEdFields'), title: 'Ajustes do desenho', text: 'Os campos abrem dentro do próprio desenho da lista: corrija a matrícula, escolha o filho e quais palavras dos nomes entram, dê zoom ou descarte o desenho. Tudo vale na hora, não há botão Salvar. Se o conjunto estiver salvo, as decisões também são salvas sozinhas.' },
        { target: '#mgExport', title: 'Baixar', text: 'Com tudo resolvido, escolha PNG, PDF ou os dois e baixe o ZIP com as peças prontas.' }
      ]
    }
  ]
});
})();
