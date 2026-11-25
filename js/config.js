/*
 * Configuração da plataforma.
 *
 * MODO LOCAL (padrão): enquanto "firebase" estiver como null, os relatórios ficam salvos somente
 * no navegador, sem login, como nas versões anteriores.
 *
 * MODO ONLINE (multiusuário, com login, histórico e acompanhamento): cole em "firebase" o objeto
 * firebaseConfig do projeto (Console do Firebase › Configurações do projeto › Seus apps › App da Web).
 * Esses dados identificam o projeto e não são senhas: a proteção fica nas regras de segurança
 * (arquivo firestore.rules). Passo a passo em docs/CONFIGURAR-FIREBASE.md.
 */
window.RG_CONFIG = {
  firebase: null,

  // Exemplo (substitua pelos valores do seu projeto):
  // firebase: {
  //   apiKey: 'AIza...',
  //   authDomain: 'seu-projeto.firebaseapp.com',
  //   projectId: 'seu-projeto',
  //   storageBucket: 'seu-projeto.firebasestorage.app',
  //   messagingSenderId: '000000000000',
  //   appId: '1:000000000000:web:0000000000000000',
  // },
};
