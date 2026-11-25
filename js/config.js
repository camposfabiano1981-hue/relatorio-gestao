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
  // Projeto "relatorio-gestao-corumba" no Firebase (modo online).
  // Para voltar ao modo local em todo o site, troque o objeto abaixo por null.
  firebase: {
    apiKey: 'AIzaSyBbhhG8INhiS-xBpv7p0XAujNb5GIvjr8Y',
    authDomain: 'relatorio-gestao-corumba.firebaseapp.com',
    projectId: 'relatorio-gestao-corumba',
    storageBucket: 'relatorio-gestao-corumba.firebasestorage.app',
    messagingSenderId: '816652901321',
    appId: '1:816652901321:web:d56b0f965f051b0b032618',
  },
};
