/*
 * Modo online (multiusuário): login e dados no Firebase (Authentication + Cloud Firestore).
 * Fica ativo quando RG_CONFIG.firebase está preenchido em js/config.js.
 *
 * Quem decide o que cada perfil pode fazer são as regras do servidor (firestore.rules). Este módulo
 * grava no formato que elas exigem: cada alteração de um relatório é uma nova revisão ("rev"),
 * registrada em relatorios/{id}/historico/rev-N com o autor, a hora do servidor e as diferenças.
 */
(function (RG) {
  'use strict';
  const U = RG.util;
  const CFG = window.RG_CONFIG || {};
  const ativo = !!(CFG.firebase && CFG.firebase.apiKey) && !/[?&]modo=local(?:&|$)/.test(location.search);

  const STATUS = {
    nao_iniciado: 'Não iniciado',
    em_preenchimento: 'Em preenchimento',
    enviado: 'Enviado ao contador',
    devolvido: 'Devolvido para ajustes',
    aprovado: 'Aprovado',
  };
  const STATUS_EDITAVEL = ['nao_iniciado', 'em_preenchimento', 'devolvido'];
  const PERFIS = { master: 'Contador (master)', gerente: 'Gerente de GAF' };
  const SECOES = ['capa', 'declaracao', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  const ESPERA_MS = 4000; // salva 4 s depois da última alteração…
  const ESPERA_MAX_MS = 30000; // …ou a cada 30 s durante digitação contínua
  const LIMITE_BYTES = 950000; // limite de um documento do Firestore: 1 MiB

  let auth = null;
  let db = null;
  let usuario = null; // perfil do usuário conectado
  let motivoSaida = ''; // explicação exibida na tela de entrada após uma saída forçada
  let suspenso = false; // ignora mudanças de login durante a configuração inicial
  let pararPerfil = null;
  const ouvintes = new Set();

  const ST = () => firebase.firestore.FieldValue.serverTimestamp();
  /** Diagnóstico no console do navegador, ativado com depurar: true em js/config.js. */
  const depurar = (...args) => { if (CFG.depurar) console.info('[RG]', ...args); };
  const FV = () => firebase.firestore.FieldValue;

  // ---------- Utilitários ----------

  /** Converte os carimbos de data do Firestore em Date, recursivamente. */
  function normalizar(v) {
    if (v && typeof v.toDate === 'function') return v.toDate();
    if (Array.isArray(v)) return v.map(normalizar);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = {};
      for (const k of Object.keys(v)) o[k] = normalizar(v[k]);
      return o;
    }
    return v;
  }

  const docDados = (d) => normalizar(Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })));
  const bytes = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length * 2);

  function mensagem(e) {
    const c = (e && e.code) || '';
    const m = {
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
      'auth/wrong-password': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'E-mail ou senha incorretos.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/missing-password': 'Informe a senha.',
      'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos ou use “Esqueci minha senha”.',
      'auth/user-disabled': 'Este usuário está bloqueado.',
      'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
      'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres.',
      'auth/requires-recent-login': 'Por segurança, saia e entre novamente antes de alterar a senha.',
      'auth/network-request-failed': 'Sem conexão com o servidor. Verifique a internet.',
      'auth/operation-not-allowed': 'O login por e-mail e senha não está ativado no projeto do Firebase.',
      'auth/admin-restricted-operation': 'A criação de contas está desativada no Firebase (Authentication › Configurações › Ações do usuário › “Ativar criação”). Ela precisa ficar ativada para o contador cadastrar usuários.',
      'permission-denied': 'Operação não permitida para o seu perfil ou para a situação atual do relatório.',
      unavailable: 'Servidor indisponível ou sem conexão. Tente novamente em instantes.',
      'resource-exhausted': 'O limite diário do plano gratuito do Firebase foi atingido. Tente novamente amanhã ou mude o projeto para o plano Blaze.',
      'deadline-exceeded': 'O servidor demorou a responder. Tente novamente.',
    }[c];
    return m || (e && e.message) || String(e);
  }

  const erro = (e) => (e instanceof Error && !e.code ? e : Object.assign(new Error(mensagem(e)), { code: e && e.code }));
  const conflito = (e) => ['permission-denied', 'failed-precondition', 'aborted', 'already-exists'].includes(e && e.code);

  function carregarScript(src) {
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => falha(new Error(`Não foi possível carregar ${src}.`));
      document.head.append(s);
    });
  }

  // ---------- Início e login ----------

  async function iniciar() {
    if (!(window.firebase && firebase.firestore)) {
      for (const f of ['app', 'auth', 'firestore']) await carregarScript(`vendor/firebase-${f}-compat.js`);
    }
    firebase.initializeApp(CFG.firebase);
    auth = firebase.auth();
    auth.languageCode = 'pt-BR';
    db = firebase.firestore();
    if (CFG.emuladores) {
      auth.useEmulator(CFG.emuladores.auth, { disableWarnings: true });
      db.useEmulator(CFG.emuladores.firestore[0], CFG.emuladores.firestore[1]);
    }
    return new Promise((resolve) => {
      let primeiro = true;
      auth.onAuthStateChanged((u) => {
        if (suspenso) return;
        processar(u).then(() => {
          if (primeiro) { primeiro = false; resolve(usuario); } else notificar();
        });
      });
    });
  }

  let processando = Promise.resolve();
  function processar(u) {
    processando = processando.then(async () => {
      if (pararPerfil) { pararPerfil(); pararPerfil = null; }
      if (!u) { usuario = null; return; }
      let p = null;
      try {
        const s = await db.doc('usuarios/' + u.uid).get();
        p = s.exists ? s.data() : null;
      } catch (e) {
        motivoSaida = 'Não foi possível carregar o seu perfil: ' + mensagem(e);
      }
      if (!p || p.ativo !== true) {
        if (p) motivoSaida = 'Seu usuário está desativado. Procure o contador responsável pelas UGs.';
        else if (!motivoSaida) motivoSaida = 'Seu acesso ainda não foi liberado. Procure o contador responsável pelas UGs.';
        usuario = null;
        await auth.signOut();
        return;
      }
      motivoSaida = '';
      usuario = Object.assign({ uid: u.uid }, p, { email: u.email || p.email });
      pararPerfil = db.doc('usuarios/' + u.uid).onSnapshot((s) => {
        const d = s.data();
        if (!d || d.ativo !== true) {
          motivoSaida = 'Seu usuário foi desativado pelo contador responsável.';
          usuario = null;
          auth.signOut();
          return;
        }
        const antes = usuario && usuario.perfil;
        usuario = Object.assign({ uid: u.uid }, d, { email: u.email || d.email });
        if (antes !== d.perfil) notificar();
      }, () => {});
    });
    return processando;
  }

  function notificar() { ouvintes.forEach((fn) => { try { fn(usuario); } catch (e) { console.error(e); } }); }

  async function entrar(email, senha, manter) {
    motivoSaida = '';
    try {
      await auth.setPersistence(manter ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
      suspenso = true;
      const cred = await auth.signInWithEmailAndPassword(String(email).trim(), senha);
      suspenso = false;
      await processar(cred.user);
    } catch (e) {
      suspenso = false;
      throw erro(e);
    }
    if (!usuario) throw new Error(motivoSaida || 'Acesso não liberado.');
    registrarLog('login', 'Entrou no sistema').catch(() => {});
    db.doc('usuarios/' + usuario.uid).update({ ultimoAcesso: ST() }).catch(() => {});
    notificar();
    return usuario;
  }

  async function sair() {
    if (usuario) await registrarLog('logout', 'Saiu do sistema').catch(() => {});
    motivoSaida = '';
    await auth.signOut();
  }

  async function redefinirSenha(email) {
    try { await auth.sendPasswordResetEmail(String(email).trim()); } catch (e) { throw erro(e); }
  }

  async function alterarSenha(atual, nova) {
    const u = auth.currentUser;
    try {
      await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, atual));
      await u.updatePassword(nova);
      if (usuario.trocarSenha) {
        await db.doc('usuarios/' + u.uid).update({ trocarSenha: false });
        usuario.trocarSenha = false;
      }
    } catch (e) { throw erro(e); }
    registrarLog('senha_alterada', 'Alterou a própria senha').catch(() => {});
  }

  /** Configuração inicial: o contador indicado em sistema/instalacao cria o próprio perfil master. */
  async function instalar(nome, email, senha) {
    suspenso = true;
    try {
      let cred;
      try {
        cred = await auth.createUserWithEmailAndPassword(String(email).trim(), senha);
      } catch (e) {
        if (e.code !== 'auth/email-already-in-use') throw e;
        cred = await auth.signInWithEmailAndPassword(String(email).trim(), senha);
      }
      const u = cred.user;
      const b = db.batch();
      b.set(db.doc('usuarios/' + u.uid), {
        nome, email: u.email, perfil: 'master', ativo: true, trocarSenha: false, cargo: 'Contador(a)', telefone: '',
        criadoEm: ST(), criadoPor: u.uid, criadoPorNome: nome, ultimoAcesso: ST(),
      });
      b.set(db.collection('logs').doc(), {
        tipo: 'instalacao', uid: u.uid, nome, perfil: 'master', em: ST(),
        resumo: 'Configuração inicial: primeiro contador (master) cadastrado',
      });
      try {
        await b.commit();
      } catch (e) {
        if (e.code === 'permission-denied') {
          if (cred.additionalUserInfo && cred.additionalUserInfo.isNewUser) await u.delete().catch(() => {});
          await auth.signOut().catch(() => {});
          throw new Error('Este e-mail não é o indicado na configuração inicial (documento sistema/instalacao do Firestore). Confira o passo a passo de configuração.');
        }
        throw e;
      }
      suspenso = false;
      await processar(u);
      await db.doc('sistema/publico').set({ instalado: true, atualizadoEm: ST() }, { merge: true });
      notificar();
      return usuario;
    } catch (e) {
      throw erro(e);
    } finally {
      suspenso = false;
    }
  }

  async function lerPublico() {
    try { const s = await db.doc('sistema/publico').get(); return s.exists ? s.data() : {}; } catch (e) { return {}; }
  }

  // ---------- Log de auditoria ----------

  function logDoc(tipo, resumo, extra) {
    return Object.assign({ tipo, resumo: resumo || '', uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST() }, extra || {});
  }

  const novoLog = () => db.collection('logs').doc();

  function registrarLog(tipo, resumo, extra) {
    if (!usuario) return Promise.resolve();
    return db.collection('logs').add(logDoc(tipo, resumo, extra));
  }

  async function listarLogs(cursor, limite) {
    limite = limite || 60;
    let q = db.collection('logs').orderBy('em', 'desc').limit(limite);
    if (cursor) q = q.startAfter(cursor);
    try {
      const s = await q.get();
      return { itens: s.docs.map(docDados), cursor: s.docs[s.docs.length - 1] || null, fim: s.size < limite };
    } catch (e) { throw erro(e); }
  }

  // ---------- Configurações gerais ----------

  async function lerConfig() {
    try { const s = await db.doc('sistema/config').get(); return s.exists ? s.data() : {}; } catch (e) { return {}; }
  }

  async function salvarConfig(cfg) {
    const b = db.batch();
    b.set(db.doc('sistema/config'), Object.assign({}, cfg, { atualizadoEm: ST(), atualizadoPor: usuario.uid }), { merge: true });
    b.set(db.doc('sistema/publico'), { instalado: true, entidade: cfg.entidade || '', atualizadoEm: ST() }, { merge: true });
    b.set(novoLog(), logDoc('config_alterada', 'Alterou as configurações gerais'));
    try { await b.commit(); } catch (e) { throw erro(e); }
  }

  // ---------- Usuários (perfil master) ----------

  function assinarUsuarios(cb, falha) {
    return db.collection('usuarios').onSnapshot(
      (s) => cb(s.docs.map((d) => Object.assign(docDados(d), { uid: d.id })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))),
      (e) => falha && falha(mensagem(e)));
  }

  /** Cria a conta de acesso numa instância secundária, para não desconectar o contador. */
  async function criarContaAuth(email, senha) {
    const app2 = firebase.initializeApp(CFG.firebase, 'cadastro-' + Date.now());
    try {
      const a2 = app2.auth();
      if (CFG.emuladores) a2.useEmulator(CFG.emuladores.auth, { disableWarnings: true });
      await a2.setPersistence(firebase.auth.Auth.Persistence.NONE);
      const cred = await a2.createUserWithEmailAndPassword(email, senha);
      await a2.signOut();
      return cred.user.uid;
    } finally {
      app2.delete().catch(() => {});
    }
  }

  async function criarUsuario(d) {
    const email = String(d.email).trim().toLowerCase();
    let uid;
    try { uid = await criarContaAuth(email, d.senha); } catch (e) { throw erro(e); }
    const b = db.batch();
    b.set(db.doc('usuarios/' + uid), {
      nome: d.nome, email, perfil: d.perfil, ativo: true, cargo: d.cargo || '', telefone: d.telefone || '',
      trocarSenha: d.trocarSenha !== false,
      criadoEm: ST(), criadoPor: usuario.uid, criadoPorNome: usuario.nome, atualizadoEm: ST(), atualizadoPor: usuario.uid,
    });
    b.set(novoLog(), logDoc('usuario_criado', `Cadastrou ${PERFIS[d.perfil]}: ${d.nome} (${email})`, { alvoUid: uid }));
    try { await b.commit(); } catch (e) { throw erro(e); }
    return uid;
  }

  async function atualizarUsuario(uid, campos, anterior) {
    const b = db.batch();
    b.update(db.doc('usuarios/' + uid), Object.assign({}, campos, { atualizadoEm: ST(), atualizadoPor: usuario.uid }));
    let tipo = 'usuario_alterado', resumo = `Alterou o cadastro de ${campos.nome || anterior.nome}`;
    if (anterior && campos.ativo === false && anterior.ativo) { tipo = 'usuario_desativado'; resumo = `Desativou o usuário ${anterior.nome}`; }
    if (anterior && campos.ativo === true && !anterior.ativo) { tipo = 'usuario_reativado'; resumo = `Reativou o usuário ${anterior.nome}`; }
    if (anterior && campos.perfil && campos.perfil !== anterior.perfil) resumo += ` (perfil: ${PERFIS[anterior.perfil]} → ${PERFIS[campos.perfil]})`;
    b.set(novoLog(), logDoc(tipo, resumo, { alvoUid: uid }));
    try { await b.commit(); } catch (e) { throw erro(e); }
  }

  async function enviarRedefinicao(u) {
    await redefinirSenha(u.email);
    registrarLog('senha_redefinicao', `Enviou a ${u.nome} o e-mail de redefinição de senha`, { alvoUid: u.uid }).catch(() => {});
  }

  // ---------- Unidades gestoras ----------

  function assinarUGs(cb, falha) {
    const q = usuario.perfil === 'master' ? db.collection('ugs') : db.collection('ugs').where('gerentes', 'array-contains', usuario.uid);
    return q.onSnapshot(
      (s) => cb(s.docs.map(docDados).sort((a, b) => (a.sigla || a.nome).localeCompare(b.sigla || b.nome, 'pt-BR'))),
      (e) => falha && falha(mensagem(e)));
  }

  const camposDaUG = (ug) => ({
    ugNome: ug.nome, ugSigla: ug.sigla || '', ordenadorNome: ug.ordenadorNome || '', ordenadorCargo: ug.ordenadorCargo || '',
    contadorUid: ug.contadorUid || '', contadorNome: ug.contadorNome || '',
    gerentes: ug.gerentes || [], gerentesNomes: ug.gerentesNomes || [],
  });

  const ROTULO_UG = {
    ugNome: 'nome da UG', ugSigla: 'sigla', ordenadorNome: 'ordenador de despesas', ordenadorCargo: 'cargo do ordenador',
    contadorUid: 'contador responsável', contadorNome: 'contador responsável', gerentes: 'gerentes de GAF', gerentesNomes: 'gerentes de GAF',
  };

  async function salvarUG(ug) {
    const ref = ug.id ? db.doc('ugs/' + ug.id) : db.collection('ugs').doc();
    const dados = {
      nome: ug.nome, sigla: ug.sigla || '', cnpj: ug.cnpj || '', tipoEntidade: ug.tipoEntidade || 'direta', consolidado: !!ug.consolidado,
      ordenadorNome: ug.ordenadorNome || '', ordenadorCargo: ug.ordenadorCargo || '',
      contadorUid: ug.contadorUid || '', contadorNome: ug.contadorNome || '',
      gerentes: ug.gerentes || [], gerentesNomes: ug.gerentesNomes || [], ativo: ug.ativo !== false,
      atualizadoEm: ST(), atualizadoPor: usuario.uid,
    };
    if (!ug.id) Object.assign(dados, { criadoEm: ST(), criadoPor: usuario.uid });
    const b = db.batch();
    b.set(ref, dados, { merge: true });
    b.set(novoLog(), logDoc(ug.id ? 'ug_alterada' : 'ug_criada', `${ug.id ? 'Alterou' : 'Cadastrou'} a UG ${ug.sigla ? ug.sigla + ' – ' : ''}${ug.nome}`, { ugId: ref.id }));
    try { await b.commit(); } catch (e) { throw erro(e); }
    if (ug.id) await propagarUG(Object.assign({}, ug, { id: ref.id }));
    return ref.id;
  }

  /** Leva aos relatórios da UG as mudanças de nome, ordenador, contador e gerentes vinculados. */
  async function propagarUG(ug) {
    const campos = camposDaUG(ug);
    let s;
    try { s = await db.collection('relatorios').where('ugId', '==', ug.id).get(); } catch (e) { throw erro(e); }
    for (const d of s.docs) {
      await revisarMeta(d.id, (m) => {
        const mudou = Object.keys(campos).filter((k) => JSON.stringify(m[k] == null ? null : m[k]) !== JSON.stringify(campos[k]));
        if (!mudou.length) return null;
        const nomes = [...new Set(mudou.map((k) => ROTULO_UG[k]))];
        return { campos, historico: { tipo: 'vinculo', resumo: `Dados da UG atualizados pelo contador: ${nomes.join(', ')}` } };
      });
    }
  }

  /** Vincula o gerente exatamente às UGs indicadas (inclui e retira dos gerentes de cada UG). */
  async function vincularGerente(uid, nome, ugIds, todasUGs) {
    for (const ug of todasUGs) {
      const tem = (ug.gerentes || []).includes(uid), deve = ugIds.includes(ug.id);
      if (tem === deve) continue;
      const gerentes = deve ? (ug.gerentes || []).concat(uid) : (ug.gerentes || []).filter((x) => x !== uid);
      const gerentesNomes = (ug.gerentesNomes || []).filter((x) => x.uid !== uid).concat(deve ? [{ uid, nome }] : []);
      await salvarUG(Object.assign({}, ug, { gerentes, gerentesNomes }));
    }
  }

  // ---------- Relatórios ----------

  function assinarRelatorios(cb, falha) {
    const q = usuario.perfil === 'master' ? db.collection('relatorios') : db.collection('relatorios').where('gerentes', 'array-contains', usuario.uid);
    return q.onSnapshot((s) => cb(s.docs.map(docDados)), (e) => falha && falha(mensagem(e)));
  }

  async function existeRelatorio(relId) {
    try { return (await db.doc('relatorios/' + relId).get()).exists; } catch (e) { throw erro(e); }
  }

  const prepararDados = (json, relId) => { const d = RG.schema.migrate(JSON.parse(json)); d.id = relId; return d; };

  async function lerConteudo(relId) {
    try {
      const s = await db.doc(`relatorios/${relId}/conteudo/atual`).get();
      return s.exists ? prepararDados(s.data().dadosJSON, relId) : null;
    } catch (e) { throw erro(e); }
  }

  function calcularProgresso(dados, secoes) {
    const porSecao = {};
    SECOES.forEach((s) => { porSecao[s] = { e: 0, a: 0 }; });
    let erros = 0, alertas = 0;
    for (const i of RG.builder.validate(dados)) {
      if (i.nivel === 'erro') { erros++; if (porSecao[i.secao]) porSecao[i.secao].e++; }
      if (i.nivel === 'alerta') { alertas++; if (porSecao[i.secao]) porSecao[i.secao].a++; }
    }
    const concluidas = SECOES.filter((s) => secoes && secoes[s]).length;
    return { total: SECOES.length, concluidas, pct: Math.round((100 * concluidas) / SECOES.length), erros, alertas, porSecao };
  }

  function versaoNoLote(b, refMeta, rev, json, motivo, comentario) {
    const v = refMeta.collection('versoes').doc();
    b.set(v, { rev, uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST(), motivo, comentario: comentario || '', tamanho: json.length });
    b.set(refMeta.collection('versoesDados').doc(v.id), { rev, dadosJSON: json });
    return v.id;
  }

  /**
   * Cria o relatório de uma UG no exercício (id "<ugId>_<exercício>").
   * origem: 'padrao' (textos-padrão), 'anterior' (cópia do exercício anterior) ou 'arquivo' (JSON importado).
   */
  async function criarRelatorio(ug, exercicio, dados, origem, prazo) {
    exercicio = +exercicio;
    const relId = `${ug.id}_${exercicio}`;
    dados.id = relId;
    const json = JSON.stringify(dados);
    if (bytes(json) > LIMITE_BYTES) throw new Error('O relatório é grande demais (limite de 1 MB). Reduza o tamanho da imagem do brasão.');
    const ref = db.doc('relatorios/' + relId);
    const descricao = { padrao: 'com os textos-padrão', anterior: `a partir do relatório de ${exercicio - 1}`, arquivo: 'a partir de arquivo .json' }[origem] || '';
    const b = db.batch();
    b.set(ref, Object.assign(camposDaUG(ug), {
      ugId: ug.id, tipoEntidade: dados.config.tipoEntidade, exercicio, status: 'nao_iniciado', prazo: prazo || null, arquivado: false,
      rev: 0, progresso: calcularProgresso(dados, {}), secoes: {}, secoesEditadas: {},
      criadoEm: ST(), criadoPor: usuario.uid, criadoPorNome: usuario.nome,
      atualizadoEm: ST(), atualizadoPor: usuario.uid, atualizadoPorNome: usuario.nome, ultimaVersaoEm: ST(),
    }));
    b.set(ref.collection('conteudo').doc('atual'), { rev: 0, dadosJSON: json, atualizadoEm: ST(), atualizadoPor: usuario.uid, atualizadoPorNome: usuario.nome });
    b.set(ref.collection('historico').doc('rev-0'), {
      rev: 0, tipo: 'criacao', uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST(), resumo: `Relatório criado ${descricao}`,
    });
    versaoNoLote(b, ref, 0, json, 'criacao', '');
    b.set(novoLog(), logDoc('relatorio_criado', `Criou o relatório ${ug.sigla || ug.nome} – ${exercicio} ${descricao}`, { relId, ugId: ug.id, exercicio }));
    try { await b.commit(); } catch (e) {
      if (e.code === 'permission-denied' && await existeRelatorio(relId)) throw new Error(`Já existe relatório de ${ug.sigla || ug.nome} para ${exercicio}.`);
      throw erro(e);
    }
    return relId;
  }

  /** Revisão só dos dados de controle, em transação (usada fora do editor: arquivar, prazo, vínculos). */
  async function revisarMeta(relId, construir) {
    const ref = db.doc('relatorios/' + relId);
    try {
      return await db.runTransaction(async (t) => {
        const s = await t.get(ref);
        const m = s.data();
        const r = construir(normalizar(m));
        if (!r) return null;
        const rev = m.rev + 1;
        t.update(ref, Object.assign({}, r.campos, { rev, atualizadoEm: ST(), atualizadoPor: usuario.uid, atualizadoPorNome: usuario.nome }));
        t.set(ref.collection('historico').doc('rev-' + rev), Object.assign({ rev, uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST() }, r.historico));
        if (r.log) t.set(novoLog(), logDoc(r.log.tipo, r.log.resumo, { relId, ugId: m.ugId, exercicio: m.exercicio }));
        return rev;
      });
    } catch (e) { throw erro(e); }
  }

  const tituloMeta = (m) => `${m.ugSigla || m.ugNome} – ${m.exercicio}`;

  function arquivar(meta, arquivado) {
    return revisarMeta(meta.id, () => ({
      campos: { arquivado },
      historico: { tipo: arquivado ? 'arquivamento' : 'desarquivamento', resumo: arquivado ? 'Relatório arquivado (oculto das listas)' : 'Relatório desarquivado' },
      log: { tipo: arquivado ? 'relatorio_arquivado' : 'relatorio_desarquivado', resumo: `${arquivado ? 'Arquivou' : 'Desarquivou'} o relatório ${tituloMeta(meta)}` },
    }));
  }

  function definirPrazo(meta, prazo) {
    return revisarMeta(meta.id, (m) => (m.prazo === (prazo || null) ? null : {
      campos: { prazo: prazo || null },
      historico: { tipo: 'prazo', resumo: prazo ? `Prazo definido para ${U.dateBR(prazo)}` : 'Prazo removido' },
      log: { tipo: 'relatorio_prazo', resumo: `${prazo ? `Definiu o prazo de ${U.dateBR(prazo)}` : 'Removeu o prazo'} do relatório ${tituloMeta(meta)}` },
    }));
  }

  // ---------- Sessão de edição de um relatório ----------

  /**
   * Abre o relatório para edição. Eventos (todos opcionais):
   *   aoEstado(estado, detalhe)  'pendente' | 'salvando' | 'salvo' | 'offline' | 'erro' | 'bloqueado'
   *   aoMeta(meta, {statusMudou, edicaoMudou})   mudança de status, seções, prazo…
   *   aoRemoto({dados, conflitos, autor, mesclado})  conteúdo alterado por outra pessoa
   *   aoPresenca([{nome, perfil, secao}])   outras pessoas com o relatório aberto
   *   aoErro(mensagem)
   */
  async function abrirRelatorio(relId, ev) {
    ev = ev || {};
    const avisar = (nome, ...args) => { try { if (ev[nome]) ev[nome](...args); } catch (e) { console.error(e); } };
    const refMeta = db.doc('relatorios/' + relId);
    const refConteudo = refMeta.collection('conteudo').doc('atual');
    let ms, cs;
    try {
      [ms, cs] = await Promise.all([refMeta.get(), refConteudo.get()]);
    } catch (e) {
      throw new Error(e.code === 'permission-denied' ? 'Você não tem acesso a este relatório.' : mensagem(e));
    }
    if (!ms.exists || !cs.exists) throw new Error('Relatório não encontrado.');

    let meta = docDados(ms);
    let revMeta = meta.rev;
    const preparar = (c) => {
      const d = prepararDados(c.dadosJSON, relId);
      return { rev: c.rev, json: JSON.stringify(d), servidor: c.dadosJSON, dados: d };
    };
    let base = preparar(cs.data()); // última versão conhecida do servidor
    let dados = U.clone(base.dados); // cópia de trabalho, alterada pelo editor
    let sujo = false, salvando = false, escrevendoRev = null, fechada = false, remotoPendente = null;
    let estado = 'salvo';
    let fila = Promise.resolve();
    let timer = null, desde = 0;
    const secoesPendentes = new Set();

    // ----- rascunho local (protege contra queda de conexão ou fechamento da aba) -----
    const chaveRascunho = `rg-anexo2:online:${CFG.firebase.projectId}:${usuario.uid}:${relId}`;
    let rascunho = null;
    try {
      const r = JSON.parse(localStorage.getItem(chaveRascunho) || 'null');
      if (r && r.dadosJSON && r.dadosJSON !== base.json) rascunho = r;
      else if (r) localStorage.removeItem(chaveRascunho);
    } catch (e) { /* sem armazenamento local */ }
    const gravarRascunho = U.debounce(() => {
      if (!sujo) return;
      try {
        localStorage.setItem(chaveRascunho, JSON.stringify({ baseRev: base.rev, baseJSON: base.json, dadosJSON: JSON.stringify(dados), em: Date.now() }));
      } catch (e) { /* armazenamento cheio: segue apenas no servidor */ }
    }, 400);
    const limparRascunho = () => { try { localStorage.removeItem(chaveRascunho); } catch (e) { /* ignora */ } };

    // ----- permissões e estado -----
    const souGerente = () => (meta.gerentes || []).includes(usuario.uid);
    function podeEditar() {
      if (fechada || meta.arquivado) return false;
      if (usuario.perfil === 'master') return meta.status !== 'aprovado';
      return souGerente() && STATUS_EDITAVEL.includes(meta.status);
    }
    function motivoBloqueio() {
      if (meta.arquivado) return 'Relatório arquivado.';
      if (meta.status === 'aprovado') return usuario.perfil === 'master' ? 'Relatório aprovado: reabra-o para editar.' : 'Relatório aprovado pelo contador.';
      if (meta.status === 'enviado') return 'Relatório enviado ao contador: cancele o envio para editar.';
      if (!souGerente() && usuario.perfil !== 'master') return 'Você não está mais vinculado a esta UG.';
      return 'Edição não permitida.';
    }
    function definirEstado(e, detalhe) { estado = e; avisar('aoEstado', e, detalhe); }

    function enfileirar(fn) {
      const p = fila.then(fn);
      fila = p.catch(() => {});
      return p;
    }

    function agendar(ms) {
      if (!desde) desde = Date.now();
      clearTimeout(timer);
      const espera = ms != null ? ms : Math.max(0, Math.min(ESPERA_MS, desde + ESPERA_MAX_MS - Date.now()));
      timer = setTimeout(() => { salvar().catch(() => {}); }, espera);
    }

    function alterado(sec) {
      if (!podeEditar()) return;
      sujo = true;
      if (SECOES.includes(sec)) secoesPendentes.add(sec);
      gravarRascunho();
      if (!salvando) definirEstado('pendente');
      agendar();
    }

    function salvar() {
      clearTimeout(timer);
      timer = null;
      desde = 0;
      return enfileirar(() => gravarConteudo({}));
    }

    function precisaVersaoDiaria() {
      const u = meta.ultimaVersaoEm;
      return !u || new Date(u).toDateString() !== new Date().toDateString();
    }

    function aplicarRemoto(c) {
      const deles = preparar(c);
      const m = sujo ? RG.diff.mesclar(base.dados, dados, deles.dados) : { dados: U.clone(deles.dados), conflitos: [] };
      base = deles;
      dados = m.dados;
      avisar('aoRemoto', { dados, conflitos: m.conflitos, autor: c.atualizadoPorNome || 'outro usuário', mesclado: sujo });
      if (sujo) { gravarRascunho(); agendar(1500); }
    }

    /**
     * Relê controle e conteúdo direto do servidor e mescla se o conteúdo mudou. A leitura comum pode
     * vir do cache local, mantido pelos ouvintes em tempo real, que às vezes ainda não recebeu a
     * gravação que acabou de causar a recusa.
     */
    async function sincronizar(repeticao) {
      const revAntes = revMeta;
      const [m2, c2] = await Promise.all([refMeta.get({ source: 'server' }), refConteudo.get({ source: 'server' })]);
      const m = docDados(m2);
      if (m.rev >= revMeta) { meta = m; revMeta = m.rev; avisar('aoMeta', meta, {}); }
      const c = c2.data();
      depurar('sincronizar', { revAntes, revMeta, conteudoServidor: c.rev, baseRev: base.rev });
      if (c.rev > base.rev) { aplicarRemoto(c); return 'conteudo'; }
      if (revMeta !== revAntes) return 'controle';
      // Nada novo: confere mais uma vez, após um instante, antes de concluir que foi falta de permissão.
      if (!repeticao) { await new Promise((r) => setTimeout(r, 800)); return sincronizar(true); }
      return 'nada';
    }

    /**
     * Grava o conteúdo como nova revisão. opts: { tipo, resumo, novosDados, forcar, versaoAntes,
     * versaoDepois, comentario, historicoExtra, log }.
     */
    async function gravarConteudo(opts) {
      if (!sujo && !opts.novosDados && !opts.forcar) return false;
      if (!podeEditar()) { definirEstado('bloqueado', motivoBloqueio()); throw new Error(motivoBloqueio()); }
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        if (opts.novosDados) { dados = U.clone(opts.novosDados); dados.id = relId; sujo = true; }
        const json = JSON.stringify(dados);
        if (json === base.json && !opts.forcar) {
          sujo = false;
          secoesPendentes.clear();
          limparRascunho();
          definirEstado('salvo', new Date());
          return false;
        }
        if (bytes(json) > LIMITE_BYTES) {
          const msg = 'O relatório ultrapassou o tamanho máximo (1 MB). Reduza a imagem do brasão ou textos muito longos.';
          definirEstado('erro', msg);
          throw new Error(msg);
        }
        const ops = RG.diff.calcular(base.dados, dados);
        const ser = RG.diff.serializar(ops);
        const revUsado = revMeta, baseUsada = base.rev;
        const novoRev = revMeta + 1;
        const secoes = [...secoesPendentes];
        const versaoAuto = !opts.versaoDepois && precisaVersaoDiaria();
        const campos = {
          rev: novoRev, atualizadoEm: ST(), atualizadoPor: usuario.uid, atualizadoPorNome: usuario.nome,
          editadoEm: ST(), editadoPor: usuario.uid, editadoPorNome: usuario.nome,
          progresso: calcularProgresso(dados, meta.secoes),
        };
        if (meta.status === 'nao_iniciado') campos.status = 'em_preenchimento';
        secoes.forEach((s) => { campos['secoesEditadas.' + s] = ST(); });
        if (versaoAuto || opts.versaoDepois || opts.versaoAntes) campos.ultimaVersaoEm = ST();
        const b = db.batch();
        b.update(refMeta, campos);
        b.set(refConteudo, {
          rev: novoRev, revAnterior: base.rev, dadosJSON: json,
          atualizadoEm: ST(), atualizadoPor: usuario.uid, atualizadoPorNome: usuario.nome,
        });
        b.set(refMeta.collection('historico').doc('rev-' + novoRev), Object.assign({
          rev: novoRev, tipo: opts.tipo || 'edicao', uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST(),
          secoes, resumo: opts.resumo || RG.diff.resumir(ops), qtdAlteracoes: ops.length,
          alteracoesJSON: ser.json, truncado: ser.truncado,
        }, opts.historicoExtra || {}));
        if (opts.versaoAntes) versaoNoLote(b, refMeta, base.rev, base.servidor, opts.versaoAntes, opts.comentario);
        if (opts.versaoDepois || versaoAuto) versaoNoLote(b, refMeta, novoRev, json, opts.versaoDepois || 'automatica', opts.comentario);
        if (opts.log) b.set(novoLog(), logDoc(opts.log.tipo, opts.log.resumo, { relId, ugId: meta.ugId, exercicio: meta.exercicio }));

        escrevendoRev = novoRev;
        salvando = true;
        definirEstado('salvando');
        const lento = setTimeout(() => definirEstado('offline'), 12000);
        try {
          await b.commit();
          revMeta = Math.max(revMeta, novoRev);
          base = { rev: novoRev, json, servidor: json, dados: JSON.parse(json) };
          if (versaoAuto || opts.versaoDepois || opts.versaoAntes) meta.ultimaVersaoEm = new Date();
          secoes.forEach((s) => secoesPendentes.delete(s));
          sujo = JSON.stringify(dados) !== json;
          if (sujo) { gravarRascunho(); agendar(); } else limparRascunho();
          definirEstado(sujo ? 'pendente' : 'salvo', new Date());
          return true;
        } catch (e) {
          depurar('gravação recusada', { tentativa, revUsado, baseUsada, novoRev, revMeta, baseRev: base.rev, codigo: e.code, msg: String(e.message).slice(0, 400) });
          if (!conflito(e) || tentativa === 3) {
            definirEstado(e.code === 'unavailable' ? 'offline' : 'erro', mensagem(e));
            throw erro(e);
          }
          // Conteúdo de outra pessoa que chegou durante a gravação: mescla antes de tentar de novo.
          if (remotoPendente && remotoPendente.rev > base.rev) { const c = remotoPendente; remotoPendente = null; aplicarRemoto(c); }
          // Se os ouvintes em tempo real já atualizaram a revisão, basta tentar de novo;
          // senão, relê o servidor para descobrir o motivo da recusa.
          if (revMeta === revUsado && base.rev === baseUsada) {
            let r;
            try { r = await sincronizar(); } catch (e2) { definirEstado('erro', mensagem(e2)); throw erro(e2); }
            if (r === 'nada' && podeEditar()) { definirEstado('erro', mensagem(e)); throw erro(e); }
          }
          if (!podeEditar()) { definirEstado('bloqueado', motivoBloqueio()); throw new Error(motivoBloqueio()); }
        } finally {
          clearTimeout(lento);
          salvando = false;
          escrevendoRev = null;
          if (remotoPendente && remotoPendente.rev > base.rev) aplicarRemoto(remotoPendente);
          remotoPendente = null;
        }
      }
      return false;
    }

    /** Revisão só de controle (status, seções, prazo), com histórico e, se pedido, versão e log. */
    function revisaoControle(campos, historico, extra) {
      extra = extra || {};
      return enfileirar(async () => {
        for (let t = 1; t <= 3; t++) {
          const revUsado = revMeta, baseUsada = base.rev;
          const novoRev = revMeta + 1;
          const b = db.batch();
          b.update(refMeta, Object.assign({ rev: novoRev, atualizadoEm: ST(), atualizadoPor: usuario.uid, atualizadoPorNome: usuario.nome }, campos));
          b.set(refMeta.collection('historico').doc('rev-' + novoRev),
            Object.assign({ rev: novoRev, uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST() }, historico));
          if (extra.versao) versaoNoLote(b, refMeta, base.rev, base.servidor, extra.versao, extra.comentario);
          if (extra.log) b.set(novoLog(), logDoc(extra.log.tipo, extra.log.resumo, { relId, ugId: meta.ugId, exercicio: meta.exercicio }));
          try {
            await b.commit();
            revMeta = Math.max(revMeta, novoRev);
            return;
          } catch (e) {
            if (!conflito(e) || t === 3) throw erro(e);
            // só relê o servidor se os ouvintes em tempo real ainda não trouxeram a mudança
            if (revMeta === revUsado && base.rev === baseUsada && (await sincronizar()) === 'nada') throw erro(e);
          }
        }
      });
    }

    const nomeSecao = (sec) => { const s = RG.editor.SECTIONS.find((x) => x.id === sec); return s ? s.nav : sec; };
    const titulo = () => tituloMeta(meta);
    const marca = () => ({ uid: usuario.uid, nome: usuario.nome, em: ST() });

    async function marcarSecao(sec, concluir) {
      await salvar();
      const secoes = Object.assign({}, meta.secoes);
      if (concluir) secoes[sec] = { uid: usuario.uid, nome: usuario.nome, em: new Date() }; else delete secoes[sec];
      await revisaoControle(
        { ['secoes.' + sec]: concluir ? marca() : FV().delete(), progresso: calcularProgresso(dados, secoes) },
        { tipo: concluir ? 'secao_concluida' : 'secao_reaberta', secao: sec, resumo: `Seção “${nomeSecao(sec)}” ${concluir ? 'marcada como concluída' : 'desmarcada (voltou a pendente)'}` });
    }

    async function enviar(marcarPendentes) {
      await salvar();
      if (sujo) throw new Error('Há alterações ainda não salvas. Aguarde o salvamento e tente de novo.');
      const campos = { status: 'enviado', enviadoEm: ST(), enviadoPor: usuario.uid, enviadoPorNome: usuario.nome };
      const secoes = Object.assign({}, meta.secoes);
      if (marcarPendentes) SECOES.filter((s) => !secoes[s]).forEach((s) => { secoes[s] = { uid: usuario.uid }; campos['secoes.' + s] = marca(); });
      campos.progresso = calcularProgresso(dados, secoes);
      await revisaoControle(campos, { tipo: 'envio', resumo: 'Relatório enviado ao contador para análise' },
        { versao: 'envio', log: { tipo: 'relatorio_enviado', resumo: `Enviou ao contador o relatório ${titulo()}` } });
    }

    function cancelarEnvio() {
      return revisaoControle({ status: 'em_preenchimento' }, { tipo: 'envio_cancelado', resumo: 'Envio cancelado para novos ajustes' },
        { log: { tipo: 'relatorio_envio_cancelado', resumo: `Cancelou o envio do relatório ${titulo()}` } });
    }

    function devolver(motivo) {
      return revisaoControle(
        { status: 'devolvido', devolvidoEm: ST(), devolvidoPor: usuario.uid, devolvidoPorNome: usuario.nome, motivoDevolucao: motivo },
        { tipo: 'devolucao', motivo, resumo: `Devolvido para ajustes: ${motivo}` },
        { log: { tipo: 'relatorio_devolvido', resumo: `Devolveu para ajustes o relatório ${titulo()}: ${motivo}` } });
    }

    async function aprovar() {
      await salvar();
      await revisaoControle(
        { status: 'aprovado', aprovadoEm: ST(), aprovadoPor: usuario.uid, aprovadoPorNome: usuario.nome },
        { tipo: 'aprovacao', resumo: 'Relatório aprovado pelo contador' },
        { versao: 'aprovacao', log: { tipo: 'relatorio_aprovado', resumo: `Aprovou o relatório ${titulo()}` } });
    }

    function reabrir() {
      return revisaoControle({ status: 'em_preenchimento' }, { tipo: 'reabertura', resumo: 'Relatório reaberto para edição' },
        { log: { tipo: 'relatorio_reaberto', resumo: `Reabriu para edição o relatório ${titulo()}` } });
    }

    function prazo(data) {
      return revisaoControle({ prazo: data || null }, { tipo: 'prazo', resumo: data ? `Prazo definido para ${U.dateBR(data)}` : 'Prazo removido' },
        { log: { tipo: 'relatorio_prazo', resumo: `${data ? `Definiu o prazo de ${U.dateBR(data)}` : 'Removeu o prazo'} do relatório ${titulo()}` } });
    }

    async function salvarVersao(comentario) {
      await salvar();
      return enfileirar(async () => {
        for (let t = 1; t <= 2; t++) {
          const b = db.batch();
          const vid = versaoNoLote(b, refMeta, base.rev, base.servidor, 'manual', comentario);
          b.set(refMeta.collection('historico').doc(), {
            tipo: 'versao_salva', uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST(), versaoId: vid,
            comentario: comentario || '', resumo: 'Versão salva manualmente' + (comentario ? `: ${comentario}` : ''),
          });
          try { await b.commit(); return vid; } catch (e) {
            if (!conflito(e) || t === 2) throw erro(e);
            await sincronizar();
          }
        }
        return null;
      });
    }

    async function lerVersao(versaoId) {
      try {
        const s = await refMeta.collection('versoesDados').doc(versaoId).get();
        if (!s.exists) throw new Error('Versão não encontrada.');
        return prepararDados(s.data().dadosJSON, relId);
      } catch (e) { throw erro(e); }
    }

    async function restaurarVersao(versao) {
      const novos = await lerVersao(versao.id);
      await salvar();
      const quando = versao.em ? new Date(versao.em).toLocaleString('pt-BR') : '';
      await enfileirar(() => gravarConteudo({
        novosDados: novos, forcar: true, tipo: 'restauracao', versaoAntes: 'antes_restauracao',
        resumo: `Restaurada a versão de ${quando} (${versao.nome || 'autor desconhecido'})`, historicoExtra: { versaoId: versao.id },
        log: { tipo: 'relatorio_restaurado', resumo: `Restaurou no relatório ${titulo()} a versão de ${quando}` },
      }));
      return dados;
    }

    async function importar(novos, nomeArquivo) {
      await salvar();
      await enfileirar(() => gravarConteudo({
        novosDados: novos, forcar: true, tipo: 'importacao', versaoAntes: 'antes_importacao',
        resumo: `Conteúdo substituído pelo arquivo ${nomeArquivo}`,
        log: { tipo: 'relatorio_importado', resumo: `Importou o arquivo ${nomeArquivo} no relatório ${titulo()}` },
      }));
      return dados;
    }

    function registrarExportacao(formato) {
      const b = db.batch();
      b.set(refMeta.collection('historico').doc(), {
        tipo: 'exportacao', formato, uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST(),
        resumo: `Gerou o arquivo ${formato.toUpperCase()}`,
      });
      b.set(novoLog(), logDoc('relatorio_exportado', `Gerou o arquivo ${formato.toUpperCase()} do relatório ${titulo()}`, { relId, ugId: meta.ugId, exercicio: meta.exercicio }));
      return b.commit().catch(() => {});
    }

    async function listarHistorico(cursor) {
      let q = refMeta.collection('historico').orderBy('em', 'desc').limit(40);
      if (cursor) q = q.startAfter(cursor);
      try {
        const s = await q.get();
        return { itens: s.docs.map(docDados), cursor: s.docs[s.docs.length - 1] || null, fim: s.size < 40 };
      } catch (e) { throw erro(e); }
    }

    async function listarVersoes() {
      try {
        const s = await refMeta.collection('versoes').orderBy('em', 'desc').limit(200).get();
        return s.docs.map(docDados);
      } catch (e) { throw erro(e); }
    }

    function recuperarRascunho() {
      if (!rascunho) return dados;
      const meus = prepararDados(rascunho.dadosJSON, relId);
      dados = rascunho.baseRev === base.rev ? meus : RG.diff.mesclar(prepararDados(rascunho.baseJSON, relId), meus, base.dados).dados;
      rascunho = null;
      sujo = true;
      agendar(500);
      return dados;
    }

    function descartarRascunho() { rascunho = null; limparRascunho(); }

    // ----- ouvintes em tempo real -----
    const pararMeta = refMeta.onSnapshot((s) => {
      if (!s.exists) return;
      const podia = podeEditar();
      const statusAntes = meta.status;
      const m = docDados(s);
      if (!s.metadata.hasPendingWrites && m.rev > revMeta) revMeta = m.rev;
      meta = m;
      avisar('aoMeta', meta, { statusMudou: statusAntes !== m.status, edicaoMudou: podia !== podeEditar() });
    }, (e) => avisar('aoErro', e.code === 'permission-denied' ? 'Você não tem mais acesso a este relatório.' : mensagem(e)));

    const pararConteudo = refConteudo.onSnapshot((s) => {
      if (!s.exists || s.metadata.hasPendingWrites) return;
      const c = s.data();
      depurar('conteúdo recebido', { rev: c.rev, por: c.atualizadoPorNome, baseRev: base.rev, escrevendoRev, salvando });
      if (c.rev <= base.rev || c.rev === escrevendoRev) return;
      if (salvando) { remotoPendente = c; return; }
      aplicarRemoto(c);
    }, () => {});

    // ----- presença -----
    const refPresenca = refMeta.collection('presenca').doc(usuario.uid);
    let secaoAtual = '';
    let presentes = [];
    function batimento() {
      if (fechada || document.visibilityState === 'hidden') return;
      refPresenca.set({ uid: usuario.uid, nome: usuario.nome, perfil: usuario.perfil, em: ST(), secao: secaoAtual }).catch(() => {});
    }
    function avisarPresenca() {
      const agora = Date.now();
      avisar('aoPresenca', presentes
        .filter((p) => p.uid !== usuario.uid && p.em && agora - p.em.toMillis() < 150000)
        .map((p) => ({ nome: p.nome, perfil: p.perfil, secao: p.secao })));
    }
    const pararPresenca = refMeta.collection('presenca').onSnapshot((s) => {
      presentes = s.docs.map((d) => d.data({ serverTimestamps: 'estimate' }));
      avisarPresenca();
    }, () => {});
    const intervalo = setInterval(() => { batimento(); avisarPresenca(); }, 60000);
    function aoVisibilidade() {
      if (document.visibilityState === 'hidden') { if (sujo) salvar().catch(() => {}); } else batimento();
    }
    document.addEventListener('visibilitychange', aoVisibilidade);
    batimento();

    function definirSecao(sec) {
      if (sec === secaoAtual) return;
      secaoAtual = sec;
      batimento();
    }

    async function fechar() {
      if (fechada) return;
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVisibilidade);
      try { if (sujo && podeEditar()) await salvar(); } catch (e) { /* o rascunho local preserva as alterações */ }
      fechada = true;
      clearTimeout(timer);
      pararMeta();
      pararConteudo();
      pararPresenca();
      refPresenca.delete().catch(() => {});
    }

    return {
      id: relId,
      get meta() { return meta; },
      get dados() { return dados; },
      get sujo() { return sujo; },
      get estado() { return estado; },
      get rascunho() { return rascunho ? { em: new Date(rascunho.em) } : null; },
      podeEditar, motivoBloqueio, alterado, salvar, fechar, definirSecao,
      marcarSecao, enviar, cancelarEnvio, devolver, aprovar, reabrir, prazo,
      salvarVersao, lerVersao, restaurarVersao, importar, registrarExportacao,
      listarHistorico, listarVersoes, recuperarRascunho, descartarRascunho,
      progresso: () => calcularProgresso(dados, meta.secoes),
    };
  }

  // ---------- Auxiliares de apresentação ----------

  const atrasado = (m) => !!(m && m.prazo && STATUS_EDITAVEL.includes(m.status) && m.prazo < U.todayISO());

  RG.nuvem = {
    ativo, STATUS, STATUS_EDITAVEL, PERFIS, SECOES,
    iniciar, entrar, sair, instalar, redefinirSenha, alterarSenha, lerPublico,
    usuario: () => usuario,
    ehMaster: () => !!(usuario && usuario.perfil === 'master'),
    motivoSaida: () => motivoSaida,
    aoMudarUsuario: (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    registrarLog, listarLogs, lerConfig, salvarConfig,
    assinarUsuarios, criarUsuario, atualizarUsuario, enviarRedefinicao, vincularGerente,
    assinarUGs, salvarUG,
    assinarRelatorios, existeRelatorio, lerConteudo, criarRelatorio, arquivar, definirPrazo, abrirRelatorio,
    calcularProgresso, atrasado, mensagem,
  };
})(window.RG = window.RG || {});
