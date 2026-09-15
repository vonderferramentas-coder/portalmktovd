// Configuração pública do aplicativo Web Firebase. Não inclua contas de serviço, tokens ou chaves privadas neste arquivo.
(function () {
  var PROD_CONFIG = {
    apiKey: 'AIzaSyBZhDUJWhvMnIcwW11EaKwJ2GWlouVvGhM',
    authDomain: 'mkt-ovd.firebaseapp.com',
    databaseURL: 'https://mkt-ovd-default-rtdb.firebaseio.com',
    projectId: 'mkt-ovd',
    storageBucket: 'mkt-ovd.firebasestorage.app',
    messagingSenderId: '927595740263',
    appId: '1:927595740263:web:bfab6557fa395750f368c2'
  };

  // Projeto Firebase de testes (HML) — dados isolados de produção, ver docs/ARQUITETURA-E-INTEGRACOES.md.
  var HML_CONFIG = {
    apiKey: 'AIzaSyAQTAFVnS7kK9qJuIiSSfH8LdMrNn5LLL4',
    authDomain: 'mkt-ovd-hml.firebaseapp.com',
    databaseURL: 'https://mkt-ovd-hml-default-rtdb.firebaseio.com',
    projectId: 'mkt-ovd-hml',
    storageBucket: 'mkt-ovd-hml.firebasestorage.app',
    messagingSenderId: '689477975302',
    appId: '1:689477975302:web:e050de0b5182867646f287'
  };

  // Só os domínios de produção conhecidos usam o Firebase real. Qualquer outro host
  // (preview do Cloudflare Pages, localhost, etc.) cai no Firebase de testes por
  // padrão, para nunca arriscar testar em cima do dado real sem querer.
  var PROD_HOSTNAMES = ['vonderferramentas-coder.github.io', 'portalmktovd.pages.dev'];

  window.PORTAL_FIREBASE_CONFIG = PROD_HOSTNAMES.indexOf(window.location.hostname) !== -1
    ? PROD_CONFIG
    : HML_CONFIG;
})();

// Deixe vazio até a TI informar os domínios corporativos liberados, por exemplo ['@empresa.com.br'].
// Mesmo vazio, todo novo acesso continua bloqueado até aprovação de um administrador no Firestore.
window.PORTAL_AUTH_POLICY = { allowedEmailDomains: [], sessionHours: 8 };
