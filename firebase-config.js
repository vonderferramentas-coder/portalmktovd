// Configuração pública do aplicativo Web Firebase. Não inclua contas de serviço, tokens ou chaves privadas neste arquivo.
window.PORTAL_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBZhDUJWhvMnIcwW11EaKwJ2GWlouVvGhM',
  authDomain: 'mkt-ovd.firebaseapp.com',
  databaseURL: 'https://mkt-ovd-default-rtdb.firebaseio.com',
  projectId: 'mkt-ovd',
  storageBucket: 'mkt-ovd.firebasestorage.app',
  messagingSenderId: '927595740263',
  appId: '1:927595740263:web:bfab6557fa395750f368c2'
};

// Deixe vazio até a TI informar os domínios corporativos liberados, por exemplo ['@empresa.com.br'].
// Mesmo vazio, todo novo acesso continua bloqueado até aprovação de um administrador no Firestore.
window.PORTAL_AUTH_POLICY = { allowedEmailDomains: [], sessionHours: 8 };
