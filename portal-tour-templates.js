/**
 * Passeios da tela Templates (templates.html). Só textos e alvos; o motor é portal-tour.js.
 * Mudou um botão, um texto ou um fluxo desta tela? Atualize o passeio na mesma mudança (regra do AGENTS.md);
 * tests/portal-tour.test.html avisa quando um alvo citado aqui some do HTML ou do JS.
 * Marcas sem canais, ou perfis que não são admin, não têm alguns alvos (cards, menu de edição): o motor pula o passo.
 */
(function(){
const modalOpen = () => document.getElementById('tplModalBackdrop').getAttribute('aria-hidden') === 'false';
const formatsOpen = () => document.getElementById('tplFormatsView').style.display !== 'none';
const isAdmin = () => !!document.querySelector('.tpl-card-menu-btn:not([hidden])');
const categoriesOpen = () => modalOpen() && !formatsOpen();

PortalTour.register('templates', {
  version: 1,
  title: 'Templates',
  tours: [
    {
      id: 'templates-visao-geral',
      title: 'Conhecer a tela',
      summary: 'Para que servem os templates e como a galeria está organizada.',
      steps: [
        { title: 'Boas-vindas aos Templates', text: 'Esta tela reúne as medidas, o peso máximo e as boas práticas de cada peça de cada canal. Consulte antes de criar uma arte para entregar no formato certo de primeira. Para sair a qualquer momento, aperte Esc.' },
        { target: '#tplInstGalleryRow', title: 'Institucionais', text: 'Os canais próprios da empresa, como sites e intranet. Clique num card para ver os formatos dele.' },
        { target: '#tplGalleryRow', title: 'Marketplaces', text: 'Um card por marketplace da marca escolhida. Cards com cadeado ainda não estão liberados para o seu perfil.' },
        { target: '#tourHelpBtn', title: 'Pronto', text: 'Clique em "Como usar" para fazer o passeio sobre consultar os formatos de um canal.' }
      ]
    },
    {
      id: 'templates-consultar',
      title: 'Consultar os formatos de um canal',
      summary: 'Abrir um canal, escolher a área e ler as medidas e boas práticas.',
      steps: [
        { target: '#tplGalleryRow .tpl-card, #tplInstGalleryRow .tpl-card', click: true, done: modalOpen, title: 'Escolha um canal', text: 'Clique num card para abrir os formatos dele.' },
        { target: '#tplCategoryGrid .tpl-category-card', when: categoriesOpen, click: true, done: formatsOpen, title: 'Escolha a área', text: 'Alguns canais têm áreas diferentes, como Loja Oficial e Ads, com medidas próprias. Clique numa delas.' },
        { target: '#tplModuleList .tpl-module-toggle', interact: true, title: 'Formatos', text: 'Cada linha é um formato do canal, como banner principal ou logotipo. Clique para abrir ou fechar a lista de versões dele.' },
        { target: '#tplModuleList .tpl-format-preview', title: 'Proporção real', text: 'O desenho mostra a proporção da peça. Áreas marcadas indicam onde o canal corta ou cobre a imagem: mantenha textos e logos fora delas.' },
        { target: '#tplModuleList .tpl-spec-list', title: 'Medidas e peso', text: 'Tamanho mínimo em pixels, peso máximo e tipo de arquivo aceito.' },
        { target: '#tplModuleList .tpl-practices', title: 'Boas práticas', text: 'Orientações daquela versão, como o que evitar na composição.' },
        { target: '#tplModuleList .tpl-copy-btn', interact: true, title: 'Copiar informações', text: 'Copia as medidas e orientações em texto, para colar num briefing ou numa conversa com o designer.' },
        { target: '#tplModalClose', click: true, done: () => !modalOpen(), title: 'Fechar', text: 'Clique no X para fechar a janela.' },
        { title: 'Pronto', text: 'Agora você sabe achar as medidas de um canal. Na dúvida, confira o formato aqui antes de enviar a arte.' }
      ]
    },
    {
      id: 'templates-admin',
      title: 'Editar os cards (administradores)',
      summary: 'Mudar nome e foto, duplicar ou excluir um card.',
      steps: [
        { when: () => !isAdmin(), title: 'Só para administradores', text: 'Editar, duplicar e excluir cards é função de administradores. Se você precisar mudar algum card, peça a um administrador.' },
        { target: '.tpl-card-menu-btn', when: isAdmin, title: 'Menu do card', text: 'Os três pontinhos aparecem só para administradores e abrem Editar, Duplicar e Excluir.', danger: 'Editar, duplicar e excluir mudam a galeria de toda a equipe.' },
        { target: '#tplGalleryRow .tpl-card', when: isAdmin, title: 'O que cada ação faz', text: 'Editar troca o nome e a foto de fundo do card. Duplicar cria uma cópia para ajustar. Excluir remove o card, e uma janela pede a confirmação antes.' },
        { when: isAdmin, title: 'Pronto', text: 'Dentro de um canal, o lápis ao lado de cada formato edita as medidas e as boas práticas dele, também só para administradores.' }
      ]
    }
  ]
});
})();
