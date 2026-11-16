/**
 * Passeios do Gerador de Cartão de Visitas (business-card-generator.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * A tela tem quatro etapas (importar, editar, revisar, exportar) e a área de edição só aparece depois de criar ou importar um cartão:
 * o que não está visível (também campos que dependem da marca) é pulado pelo motor.
 */
(function(){
const hasWorkspace = () => !document.getElementById('workspace').hidden;

PortalTour.register('gerador-cartoes', {
  version: 1,
  title: 'Gerador de Cartões',
  tours: [
    {
      id: 'cartoes-visao-geral',
      title: 'Conhecer a tela',
      summary: 'As quatro etapas, da planilha ao PDF para a gráfica.',
      steps: [
        { title: 'Boas-vindas ao Gerador de Cartão de Visitas', text: 'Aqui os dados das pessoas viram cartões de visita prontos para a gráfica, com o fundo, o logo e as cores da marca já protegidos. Para sair a qualquer momento, aperte Esc.' },
        { target: '.bc-brand-pill', title: 'Identidade ativa', text: 'Mostra a marca dos cartões. Para trocar, mude a marca no menu lateral.' },
        { target: '.bc-flow', title: 'As etapas', text: 'O caminho é sempre: criar ou importar, editar, revisar e exportar. Etapas já liberadas ficam clicáveis para você voltar.' },
        { target: '#importPanel', title: 'Comece por aqui', text: 'Na primeira etapa você importa uma planilha ou cria o cartão na mão. Há um passeio só sobre isso.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para fazer os outros passeios.' }
      ]
    },
    {
      id: 'cartoes-importar',
      title: 'Criar ou importar cartões',
      summary: 'Preparar a planilha ou começar com os campos em branco.',
      steps: [
        { when: hasWorkspace, title: 'Volte à primeira etapa', text: 'Este passeio fala da etapa de importar. Clique em "1 Criar ou Importar" no topo (a tela avisa que alterações não salvas se perdem) e refaça o passeio.' },
        { target: '#startManual', title: 'Criar cartão manualmente', text: 'Começa com os campos em branco, para quem precisa de um cartão só. Neste tutorial nada é criado.' },
        { target: 'label.bc-upload', title: 'Selecionar planilha', text: 'Escolha um arquivo .xlsx, .xls ou .csv. Cada linha vira um cartão. As colunas reconhecidas são Nome, Cargo, Endereço, Telefone Fixo, Celular, E-mail e Site.' },
        { target: '.bc-template-link', title: 'Planilha-base', text: 'Baixa um modelo com as colunas certas. Preencha o modelo em vez de montar a planilha do zero.' },
        { title: 'Pronto', text: 'Depois de importar, a tela leva sozinha para a etapa de edição.' }
      ]
    },
    {
      id: 'cartoes-editar',
      title: 'Editar os dados',
      summary: 'Escolher um cartão, corrigir os campos e conferir a prévia.',
      steps: [
        { when: () => !hasWorkspace(), title: 'Crie ou importe um cartão primeiro', text: 'A edição só aparece depois de criar um cartão (manual ou por planilha). Faça isso e refaça o passeio.' },
        { target: '#recordsList', title: 'Cartões da planilha', text: 'Um item por pessoa. Clique num para editar os dados dele.' },
        { target: '#selectAll', interact: true, title: 'Selecionar', text: 'Marque os cartões que quiser excluir de uma vez, ou todos.' },
        { target: '#deleteSelected', title: 'Excluir selecionados', text: 'Remove os cartões marcados. Uma janela pede a confirmação.', danger: 'Excluir apaga os cartões marcados e não dá para desfazer.' },
        { target: '#addRecord', title: 'Adicionar cartão', text: 'Inclui mais um cartão em branco na lista.' },
        { target: '#fieldName', interact: true, title: 'Nome completo', text: 'O nome como deve sair no cartão. O que você digita aparece na prévia ao lado.' },
        { target: '#fieldPhone', interact: true, title: 'Celular', text: 'DDD mais 9 números (ou 8, se for ramal). O formato é ajustado e conferido na hora.' },
        { target: '#fieldEmail', interact: true, title: 'E-mail', text: 'O e-mail corporativo da pessoa.' },
        { target: '.bc-locked-note', title: 'Elementos protegidos', text: 'Fundo, logo, cores e elementos gráficos da marca não mudam nesta tela. Assim todo cartão sai dentro do padrão.' },
        { target: '#saveState', title: 'Salvamento', text: 'Mostra que as alterações ficam guardadas neste navegador enquanto você edita.' },
        { target: '#cardCanvas', title: 'Cartão físico', text: 'A prévia do cartão impresso, de 90 × 50 mm. Confira nome, cargo e contatos.' },
        { target: '.bc-proof', title: 'Arquivo para a gráfica', text: 'Diz o que vai no PDF: CMYK em 600 dpi, folha de 104 × 64 mm com sangria de 3 mm, margem branca e marcas de corte.' },
        { title: 'Pronto', text: 'Dados conferidos, siga para a revisão. Na dúvida sobre um cargo ou endereço, confirme com a pessoa antes de aprovar.' }
      ]
    },
    {
      id: 'cartoes-revisar-exportar',
      title: 'Revisar e exportar',
      summary: 'Rodar a revisão, aprovar cada cartão e baixar os arquivos.',
      steps: [
        { when: () => !hasWorkspace(), title: 'Crie ou importe um cartão primeiro', text: 'A revisão fica na área de edição. Faça isso e refaça o passeio.' },
        { target: '#reviewCurrent', interact: true, title: 'Revisar este cartão', text: 'Confere ortografia e formato dos campos do cartão aberto e lista o que encontrar.' },
        { target: '#reviewEmpty', title: 'Resultado da revisão', text: 'Aqui aparecem os achados, um a um, com a sugestão de correção. Corrija e rode de novo até ficar limpo.' },
        { target: '#approveCurrent', title: 'Aprovação', text: 'Só depois de revisar e conferir a prévia você aprova o cartão. Cartão não aprovado não é exportado.' },
        { target: '#approvedCount', title: 'Aprovados', text: 'Quantos cartões já foram aprovados, de quantos há na lista.' },
        { target: '#exportMenu', title: 'Exportar', text: 'Baixa os arquivos dos cartões aprovados, no formato que a gráfica pede.' },
        { title: 'Pronto', text: 'A aprovação é uma pessoa conferindo nome, cargo e contatos de cada cartão. Isso não pode ser pulado.' }
      ]
    }
  ]
});
})();
