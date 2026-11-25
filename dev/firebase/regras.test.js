'use strict';
/*
 * Testes das regras de segurança (firestore.rules) no emulador do Firestore.
 * Uso, nesta pasta:  npm install  e depois  npm run test:regras
 * As operações reproduzem as gravações feitas por js/nuvem.js.
 */
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const ST = () => firebase.firestore.FieldValue.serverTimestamp();

const MASTER = { uid: 'master1', nome: 'Contador Um', email: 'contador@exemplo.gov.br' };
const MASTER2 = { uid: 'master2', nome: 'Contador Dois', email: 'contador2@exemplo.gov.br' };
const GER = { uid: 'ger1', nome: 'Gerente Um', email: 'gerente1@exemplo.gov.br' };
const GER2 = { uid: 'ger2', nome: 'Gerente Dois', email: 'gerente2@exemplo.gov.br' };
const INATIVO = { uid: 'inativo', nome: 'Inativo', email: 'inativo@exemplo.gov.br' };
const NOVO = { uid: 'novo', nome: 'Novo Contador', email: 'Contador@Exemplo.gov.br' }; // mesmo e-mail da instalação, outra caixa
const ESTRANHO = { uid: 'estranho', nome: 'Estranho', email: 'estranho@exemplo.com' };

let env;
const db = (u) => (u ? env.authenticatedContext(u.uid, { email: u.email }).firestore() : env.unauthenticatedContext().firestore());

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rg',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await d.doc('sistema/instalacao').set({ email: MASTER.email });
    await d.doc('usuarios/master1').set({ nome: 'Contador Um', email: MASTER.email, perfil: 'master', ativo: true });
    await d.doc('usuarios/master2').set({ nome: 'Contador Dois', email: MASTER2.email, perfil: 'master', ativo: true });
    await d.doc('usuarios/ger1').set({ nome: 'Gerente Um', email: GER.email, perfil: 'gerente', ativo: true, trocarSenha: true });
    await d.doc('usuarios/ger2').set({ nome: 'Gerente Dois', email: GER2.email, perfil: 'gerente', ativo: true });
    await d.doc('usuarios/inativo').set({ nome: 'Inativo', email: INATIVO.email, perfil: 'gerente', ativo: false });
    await d.doc('ugs/ugA').set({ nome: 'Secretaria A', gerentes: ['ger1', 'inativo'], ativo: true });
    await d.doc('ugs/ugB').set({ nome: 'Secretaria B', gerentes: ['ger2'], ativo: true });
  });
});

// ---------- Operações iguais às do aplicativo ----------

function criarRelatorio(d, autor, ugId, exercicio, gerentes, opts = {}) {
  const id = opts.id || `${ugId}_${exercicio}`;
  const ref = d.doc(`relatorios/${id}`);
  const dados = JSON.stringify({ id, config: { exercicio } });
  const b = d.batch();
  b.set(ref, { ugId, exercicio, rev: 0, status: 'nao_iniciado', gerentes, atualizadoEm: ST(), atualizadoPor: autor.uid });
  b.set(ref.collection('conteudo').doc('atual'), { rev: 0, dadosJSON: dados, atualizadoEm: ST(), atualizadoPor: autor.uid });
  if (!opts.semHistorico) b.set(ref.collection('historico').doc('rev-0'), { rev: 0, tipo: 'criacao', uid: autor.uid, nome: autor.nome, em: ST() });
  const v = ref.collection('versoes').doc();
  b.set(v, { rev: 0, uid: autor.uid, nome: autor.nome, em: ST(), motivo: 'criacao' });
  b.set(ref.collection('versoesDados').doc(v.id), { rev: 0, dadosJSON: opts.dadosVersao || dados });
  return b.commit();
}

/** Revisão do conteúdo gravada no servidor (lida sem as regras, só para montar o teste). */
async function revConteudo(relId) {
  let rev = null;
  await env.withSecurityRulesDisabled(async (ctx) => {
    rev = (await ctx.firestore().doc(`relatorios/${relId}/conteudo/atual`).get()).data().rev;
  });
  return rev;
}

/** Nova revisão: controle (+ conteúdo, se informado) + registro rev-N no histórico (+ versão, opcional). */
async function revisao(d, autor, relId, revAtual, opts = {}) {
  const ref = d.doc(`relatorios/${relId}`);
  const rev = opts.rev != null ? opts.rev : revAtual + 1;
  const revAnterior = opts.dadosJSON != null && opts.revAnterior == null ? await revConteudo(relId) : opts.revAnterior;
  const b = d.batch();
  const meta = Object.assign({ rev, atualizadoEm: ST(), atualizadoPor: autor.uid }, opts.meta || {});
  if (opts.dadosJSON != null) Object.assign(meta, { editadoEm: ST(), editadoPor: autor.uid });
  b.update(ref, meta);
  if (opts.dadosJSON != null) {
    b.set(ref.collection('conteudo').doc('atual'), { rev, revAnterior, dadosJSON: opts.dadosJSON, atualizadoEm: ST(), atualizadoPor: autor.uid });
  }
  const nome = opts.nomeFalso || autor.nome;
  if (!opts.semHistorico) b.set(ref.collection('historico').doc('rev-' + rev), { rev, tipo: opts.tipo || 'edicao', uid: autor.uid, nome, em: ST() });
  if (opts.versao) {
    const v = ref.collection('versoes').doc();
    b.set(v, { rev, uid: autor.uid, nome, em: ST(), motivo: opts.versao });
    b.set(ref.collection('versoesDados').doc(v.id), { rev, dadosJSON: opts.dadosJSON });
  }
  return b.commit();
}

async function relatorioPadrao() {
  await criarRelatorio(db(MASTER), MASTER, 'ugA', 2025, ['ger1']);
  return 'ugA_2025';
}

// ---------- Sistema e configuração inicial ----------

test('tela de entrada lê sistema/publico sem login; sistema/instalacao é inacessível', async () => {
  await assertSucceeds(db(null).doc('sistema/publico').get());
  await assertFails(db(null).doc('sistema/instalacao').get());
  await assertFails(db(MASTER).doc('sistema/instalacao').get());
  await assertFails(db(MASTER).doc('sistema/instalacao').set({ email: 'outro@x.com' }));
});

test('configuração inicial: só o e-mail da instalação cria o próprio perfil master', async () => {
  const perfil = (u) => ({ nome: u.nome, email: u.email, perfil: 'master', ativo: true });
  await assertFails(db(ESTRANHO).doc(`usuarios/${ESTRANHO.uid}`).set(perfil(ESTRANHO)));
  await assertFails(db(NOVO).doc('usuarios/outro').set(perfil(NOVO)));
  // perfil e log da instalação gravados na mesma operação (o log usa getAfter do perfil)
  const d = db(NOVO);
  const b = d.batch();
  b.set(d.doc(`usuarios/${NOVO.uid}`), perfil(NOVO));
  b.set(d.collection('logs').doc(), { tipo: 'instalacao', uid: NOVO.uid, nome: 'Novo Contador', perfil: 'master', em: ST() });
  await assertSucceeds(b.commit());
});

test('sistema/publico e sistema/config: só master grava; config só é lida por usuários ativos', async () => {
  await assertSucceeds(db(MASTER).doc('sistema/publico').set({ instalado: true, entidade: 'Prefeitura' }));
  await assertFails(db(GER).doc('sistema/publico').set({ instalado: false }));
  await assertSucceeds(db(MASTER).doc('sistema/config').set({ municipio: 'Cidade', uf: 'MS' }));
  await assertFails(db(GER).doc('sistema/config').set({ municipio: 'X' }));
  await assertSucceeds(db(GER).doc('sistema/config').get());
  await assertFails(db(INATIVO).doc('sistema/config').get());
  await assertFails(db(null).doc('sistema/config').get());
});

// ---------- Usuários ----------

test('master cadastra e altera usuários; gerente não', async () => {
  const u = { nome: 'Gerente Três', email: 'g3@exemplo.gov.br', perfil: 'gerente', ativo: true, trocarSenha: true };
  await assertSucceeds(db(MASTER).doc('usuarios/g3').set(u));
  await assertFails(db(GER).doc('usuarios/g4').set(u));
  await assertFails(db(MASTER).doc('usuarios/g5').set(Object.assign({}, u, { perfil: 'admin' })));
  await assertSucceeds(db(MASTER).doc('usuarios/ger1').update({ ativo: false }));
  await assertFails(db(MASTER).doc('usuarios/ger2').update({ email: 'trocado@x.com' }));
  await assertFails(db(MASTER).doc('usuarios/ger2').delete());
});

test('master não altera o próprio perfil nem se desativa', async () => {
  await assertFails(db(MASTER).doc('usuarios/master1').update({ ativo: false }));
  await assertFails(db(MASTER).doc('usuarios/master1').update({ perfil: 'gerente' }));
  await assertSucceeds(db(MASTER).doc('usuarios/master1').update({ nome: 'Contador Um Silva' }));
  await assertSucceeds(db(MASTER2).doc('usuarios/master1').update({ ativo: false }));
});

test('usuário lê o próprio perfil e registra só último acesso e troca de senha', async () => {
  await assertSucceeds(db(GER).doc('usuarios/ger1').get());
  await assertFails(db(GER).doc('usuarios/ger2').get());
  await assertFails(db(GER).collection('usuarios').get());
  await assertSucceeds(db(GER).doc('usuarios/ger1').update({ ultimoAcesso: ST() }));
  await assertSucceeds(db(GER).doc('usuarios/ger1').update({ trocarSenha: false }));
  await assertFails(db(GER).doc('usuarios/ger1').update({ trocarSenha: true }));
  await assertFails(db(GER).doc('usuarios/ger1').update({ perfil: 'master' }));
  await assertFails(db(GER).doc('usuarios/ger1').update({ nome: 'Outro nome' }));
  await assertFails(db(INATIVO).doc('usuarios/inativo').update({ ultimoAcesso: ST() }));
});

// ---------- UGs ----------

test('gerente lê só as UGs a que está vinculado; usuário inativo não lê nada', async () => {
  await assertSucceeds(db(GER).doc('ugs/ugA').get());
  await assertFails(db(GER).doc('ugs/ugB').get());
  await assertSucceeds(db(GER).collection('ugs').where('gerentes', 'array-contains', 'ger1').get());
  await assertFails(db(GER).collection('ugs').get());
  await assertFails(db(INATIVO).doc('ugs/ugA').get());
  await assertSucceeds(db(MASTER).collection('ugs').get());
  await assertFails(db(GER).doc('ugs/ugA').update({ gerentes: ['ger1', 'ger2'] }));
  await assertSucceeds(db(MASTER).doc('ugs/ugC').set({ nome: 'Fundo C', gerentes: [], ativo: true }));
  await assertFails(db(MASTER).doc('ugs/ugD').set({ nome: '', gerentes: [], ativo: true }));
});

// ---------- Relatórios ----------

test('master cria relatório (um por UG e exercício) e gerente não cria', async () => {
  await assertFails(criarRelatorio(db(GER), GER, 'ugA', 2025, ['ger1']));
  await assertFails(criarRelatorio(db(MASTER), MASTER, 'ugA', 2025, ['ger1'], { semHistorico: true }));
  await assertFails(criarRelatorio(db(MASTER), MASTER, 'ugA', 2025, ['ger1'], { id: 'qualquer' }));
  await assertSucceeds(criarRelatorio(db(MASTER), MASTER, 'ugA', 2025, ['ger1']));
  await assertFails(criarRelatorio(db(MASTER), MASTER, 'ugA', 2025, ['ger1'])); // já existe
});

test('a cópia (versão) precisa ser idêntica ao conteúdo', async () => {
  await assertFails(criarRelatorio(db(MASTER), MASTER, 'ugA', 2025, ['ger1'], { dadosVersao: '{"adulterado":true}' }));
});

test('gerente vê só os relatórios das suas UGs', async () => {
  const id = await relatorioPadrao();
  await criarRelatorio(db(MASTER), MASTER, 'ugB', 2025, ['ger2']);
  await assertSucceeds(db(GER).doc(`relatorios/${id}`).get());
  await assertSucceeds(db(GER).doc(`relatorios/${id}/conteudo/atual`).get());
  await assertSucceeds(db(GER).doc(`relatorios/${id}`).collection('historico').get());
  await assertFails(db(GER).doc('relatorios/ugB_2025').get());
  await assertFails(db(GER).doc('relatorios/ugB_2025/conteudo/atual').get());
  await assertFails(db(GER).doc('relatorios/ugB_2025').collection('historico').get());
  await assertSucceeds(db(GER).collection('relatorios').where('gerentes', 'array-contains', 'ger1').get());
  await assertFails(db(GER).collection('relatorios').get());
  await assertFails(db(GER2).doc(`relatorios/${id}/conteudo/atual`).get());
  await assertSucceeds(db(MASTER).collection('relatorios').where('exercicio', '==', 2025).get());
});

test('cada salvamento exige revisão sequencial e registro no histórico', async () => {
  const id = await relatorioPadrao();
  const d = db(GER);
  await assertFails(revisao(d, GER, id, 0, { dadosJSON: '{"a":1}', semHistorico: true, meta: { status: 'em_preenchimento' } }));
  await assertFails(revisao(d, GER, id, 0, { rev: 5, dadosJSON: '{"a":1}', meta: { status: 'em_preenchimento' } }));
  await assertSucceeds(revisao(d, GER, id, 0, { dadosJSON: '{"a":1}', meta: { status: 'em_preenchimento' } }));
  // salvamento concorrente baseado na mesma revisão é recusado
  await assertFails(revisao(db(MASTER), MASTER, id, 0, { dadosJSON: '{"a":2}' }));
  await assertSucceeds(revisao(d, GER, id, 1, { dadosJSON: '{"a":3}', versao: 'automatica', meta: { ultimaVersaoEm: ST() } }));
  // conteúdo sem nova revisão do controle é recusado
  await assertFails(d.doc(`relatorios/${id}/conteudo/atual`).set({ rev: 2, dadosJSON: '{"x":1}', atualizadoEm: ST(), atualizadoPor: GER.uid }));
  // autoria falsa é recusada
  await assertFails(revisao(d, MASTER, id, 2, { dadosJSON: '{"a":4}' }));
});

test('gerente não altera campos de controle do contador', async () => {
  const id = await relatorioPadrao();
  const d = db(GER);
  await assertFails(revisao(d, GER, id, 0, { meta: { gerentes: ['ger1', 'ger2'] } }));
  await assertFails(revisao(d, GER, id, 0, { meta: { prazo: '2099-12-31' } }));
  await assertFails(revisao(d, GER, id, 0, { meta: { status: 'aprovado' } }));
  await assertFails(revisao(d, GER, id, 0, { meta: { arquivado: true } }));
  await assertSucceeds(revisao(d, GER, id, 0, { meta: { secoes: { capa: { uid: 'ger1' } }, progresso: { pct: 10 } } }));
  await assertFails(revisao(db(GER2), GER2, id, 1, { dadosJSON: '{"invasor":1}' }));
  await assertFails(revisao(db(INATIVO), INATIVO, id, 1, { dadosJSON: '{"inativo":1}' }));
});

test('fluxo: envio, cancelamento, devolução, aprovação e reabertura', async () => {
  const id = await relatorioPadrao();
  const g = db(GER), m = db(MASTER);
  await assertSucceeds(revisao(g, GER, id, 0, { dadosJSON: '{"a":1}', meta: { status: 'em_preenchimento' } }));
  // envio com carimbo falso é recusado
  await assertFails(revisao(g, GER, id, 1, { meta: { status: 'enviado', enviadoPor: 'master1', enviadoEm: ST() } }));
  await assertSucceeds(revisao(g, GER, id, 1, { tipo: 'envio', dadosJSON: '{"a":2}', meta: { status: 'enviado', enviadoPor: 'ger1', enviadoEm: ST(), enviadoPorNome: 'Gerente Um' } }));
  // depois de enviado, o gerente não altera o conteúdo nem marca seções
  await assertFails(revisao(g, GER, id, 2, { dadosJSON: '{"a":3}' }));
  await assertFails(revisao(g, GER, id, 2, { meta: { secoes: {} } }));
  // cancela o envio
  await assertSucceeds(revisao(g, GER, id, 2, { tipo: 'envio_cancelado', meta: { status: 'em_preenchimento' } }));
  await assertSucceeds(revisao(g, GER, id, 3, { tipo: 'envio', meta: { status: 'enviado', enviadoPor: 'ger1', enviadoEm: ST() } }));
  // contador devolve; gerente volta a editar mantendo "devolvido"
  await assertSucceeds(revisao(m, MASTER, id, 4, { tipo: 'devolucao', meta: { status: 'devolvido', motivoDevolucao: 'Ajustar a Seção II' } }));
  await assertSucceeds(revisao(g, GER, id, 5, { dadosJSON: '{"a":4}', meta: { status: 'devolvido' } }));
  await assertFails(revisao(g, GER, id, 6, { meta: { motivoDevolucao: '' } }));
  await assertSucceeds(revisao(g, GER, id, 6, { tipo: 'envio', meta: { status: 'enviado', enviadoPor: 'ger1', enviadoEm: ST() } }));
  // contador aprova; gerente não reabre nem cancela
  await assertSucceeds(revisao(m, MASTER, id, 7, { tipo: 'aprovacao', meta: { status: 'aprovado' } }));
  await assertFails(revisao(g, GER, id, 8, { meta: { status: 'em_preenchimento' } }));
  await assertFails(revisao(g, GER, id, 8, { dadosJSON: '{"a":5}' }));
  await assertSucceeds(revisao(m, MASTER, id, 8, { tipo: 'reabertura', meta: { status: 'em_preenchimento' } }));
  // o contador pode corrigir o conteúdo em qualquer situação
  await assertSucceeds(revisao(m, MASTER, id, 9, { dadosJSON: '{"corrigido":true}' }));
});

test('histórico, versões e logs são imutáveis, inclusive para o contador', async () => {
  const id = await relatorioPadrao();
  const m = db(MASTER);
  const h0 = m.doc(`relatorios/${id}/historico/rev-0`);
  await assertFails(h0.update({ tipo: 'outro' }));
  await assertFails(h0.delete());
  const versoes = await m.collection(`relatorios/${id}/versoes`).get();
  await assertFails(versoes.docs[0].ref.delete());
  await assertFails(m.doc(`relatorios/${id}/versoesDados/${versoes.docs[0].id}`).update({ dadosJSON: '{}' }));
  const log = await m.collection('logs').add({ tipo: 'login', uid: MASTER.uid, nome: MASTER.nome, perfil: 'master', em: ST() });
  await assertFails(log.update({ tipo: 'x' }));
  await assertFails(log.delete());
  await assertFails(m.doc(`relatorios/${id}`).delete());
});

test('registros avulsos do histórico (exportações) e falsificação de revisões', async () => {
  const id = await relatorioPadrao();
  const hist = (d) => d.collection(`relatorios/${id}/historico`);
  await assertSucceeds(hist(db(GER)).add({ tipo: 'exportacao', formato: 'pdf', uid: GER.uid, nome: GER.nome, em: ST() }));
  await assertFails(hist(db(GER)).add({ tipo: 'exportacao', uid: MASTER.uid, nome: GER.nome, em: ST() }));
  await assertFails(hist(db(GER2)).add({ tipo: 'exportacao', uid: GER2.uid, nome: GER2.nome, em: ST() }));
  await assertFails(hist(db(GER)).add({ tipo: 'edicao', rev: 1, uid: GER.uid, nome: GER.nome, em: ST() }));
  await assertFails(hist(db(GER)).doc('rev-1').set({ tipo: 'edicao', rev: 1, uid: GER.uid, nome: GER.nome, em: ST() }));
});

test('versão avulsa só com cópia fiel do conteúdo atual', async () => {
  const id = await relatorioPadrao();
  const g = db(GER);
  const atual = (await g.doc(`relatorios/${id}/conteudo/atual`).get()).data();
  const ok = g.batch();
  const v = g.collection(`relatorios/${id}/versoes`).doc();
  ok.set(v, { rev: atual.rev, uid: GER.uid, nome: GER.nome, em: ST(), motivo: 'manual', comentario: 'antes de revisar' });
  ok.set(g.doc(`relatorios/${id}/versoesDados/${v.id}`), { rev: atual.rev, dadosJSON: atual.dadosJSON });
  await assertSucceeds(ok.commit());
  const ruim = g.batch();
  const v2 = g.collection(`relatorios/${id}/versoes`).doc();
  ruim.set(v2, { rev: atual.rev, uid: GER.uid, nome: GER.nome, em: ST(), motivo: 'manual' });
  ruim.set(g.doc(`relatorios/${id}/versoesDados/${v2.id}`), { rev: atual.rev, dadosJSON: '{"falso":1}' });
  await assertFails(ruim.commit());
});

test('log de auditoria: cada um grava o próprio; só o contador lê', async () => {
  const log = (u, extra) => Object.assign({ tipo: 'login', uid: u.uid, nome: u.nome, perfil: 'gerente', em: ST() }, extra);
  await assertSucceeds(db(GER).collection('logs').add(log(GER)));
  await assertFails(db(GER).collection('logs').add(log(GER, { perfil: 'master' })));
  await assertFails(db(GER).collection('logs').add(log(MASTER, { perfil: 'master' })));
  await assertFails(db(INATIVO).collection('logs').add(log(INATIVO)));
  // nome de outra pessoa e eventos que só o contador realiza são recusados
  await assertFails(db(GER).collection('logs').add(log(GER, { nome: 'Contador Um' })));
  await assertFails(db(GER).collection('logs').add(log(GER, { tipo: 'relatorio_aprovado' })));
  await assertFails(db(GER).collection('logs').add(log(GER, { tipo: 'usuario_criado' })));
  await assertSucceeds(db(GER).collection('logs').add(log(GER, { tipo: 'relatorio_exportado' })));
  await assertFails(db(GER).collection('logs').get());
  await assertSucceeds(db(MASTER).collection('logs').orderBy('em', 'desc').limit(10).get());
});

test('presença: cada usuário grava só a própria', async () => {
  const id = await relatorioPadrao();
  await assertSucceeds(db(GER).doc(`relatorios/${id}/presenca/ger1`).set({ uid: 'ger1', nome: 'Gerente Um', em: ST() }));
  await assertFails(db(GER).doc(`relatorios/${id}/presenca/ger1`).set({ uid: 'ger1', nome: 'Contador Um', em: ST() }));
  await assertFails(db(GER).doc(`relatorios/${id}/presenca/master1`).set({ uid: 'master1', nome: 'Contador Um', em: ST() }));
  await assertFails(db(GER2).doc(`relatorios/${id}/presenca/ger2`).set({ uid: 'ger2', nome: 'Gerente Dois', em: ST() }));
  await assertSucceeds(db(MASTER).collection(`relatorios/${id}/presenca`).get());
  await assertSucceeds(db(GER).doc(`relatorios/${id}/presenca/ger1`).delete());
});

test('contador troca o gerente vinculado: o antigo perde o acesso e o novo ganha', async () => {
  const id = await relatorioPadrao();
  await assertFails(db(GER2).doc(`relatorios/${id}`).get());
  await assertSucceeds(revisao(db(MASTER), MASTER, id, 0, { tipo: 'vinculo', meta: { gerentes: ['ger2'] } }));
  await assertSucceeds(db(GER2).doc(`relatorios/${id}/conteudo/atual`).get());
  await assertFails(db(GER).doc(`relatorios/${id}`).get());
  await assertFails(revisao(db(GER), GER, id, 1, { dadosJSON: '{"a":1}' }));
  await assertSucceeds(revisao(db(GER2), GER2, id, 1, { dadosJSON: '{"a":1}', meta: { status: 'em_preenchimento' } }));
  await assertFails(db(GER).collection(`relatorios/${id}/presenca`).get());
});

test('contador arquiva e define prazo; o gerente não', async () => {
  const id = await relatorioPadrao();
  await assertSucceeds(revisao(db(MASTER), MASTER, id, 0, { tipo: 'prazo', meta: { prazo: '2026-03-31' } }));
  await assertSucceeds(revisao(db(MASTER), MASTER, id, 1, { tipo: 'arquivamento', meta: { arquivado: true } }));
  await assertFails(revisao(db(GER), GER, id, 2, { meta: { arquivado: false } }));
});

test('relatório grande (~700 KB) com cópia de versão na mesma operação', async () => {
  const id = await relatorioPadrao();
  const grande = JSON.stringify({ texto: 'Relatório de gestão com acentuação: ção, ã, é. '.repeat(14000) });
  await assertSucceeds(revisao(db(GER), GER, id, 0, { dadosJSON: grande, versao: 'automatica', meta: { status: 'em_preenchimento', ultimaVersaoEm: ST() } }));
  const lido = await db(GER).doc(`relatorios/${id}/conteudo/atual`).get();
  if (lido.data().dadosJSON.length !== grande.length) throw new Error('conteúdo truncado');
});

test('conteúdo baseado em versão desatualizada é recusado mesmo com a revisão correta', async () => {
  const id = await relatorioPadrao();
  // revisão 1: o gerente grava conteúdo (o conteúdo passa a estar na revisão 1)
  await assertSucceeds(revisao(db(GER), GER, id, 0, { dadosJSON: '{"gerente":1}', meta: { status: 'em_preenchimento' } }));
  // revisão 2: só controle (seção concluída)
  await assertSucceeds(revisao(db(GER), GER, id, 1, { meta: { secoes: { capa: { uid: 'ger1' } } } }));
  // o contador ainda tinha o conteúdo da revisão 0: recusado
  await assertFails(revisao(db(MASTER), MASTER, id, 2, { dadosJSON: '{"contador":1}', revAnterior: 0 }));
  // depois de sincronizar (base = revisão 1): aceito
  await assertSucceeds(revisao(db(MASTER), MASTER, id, 2, { dadosJSON: '{"contador":1}', revAnterior: 1 }));
});

test('histórico e painel não aceitam nome de outra pessoa nem eventos exclusivos do contador', async () => {
  const id = await relatorioPadrao();
  const g = db(GER);
  await assertFails(revisao(g, GER, id, 0, { dadosJSON: '{"a":1}', meta: { status: 'em_preenchimento' }, nomeFalso: 'Contador Um' }));
  await assertFails(revisao(g, GER, id, 0, { dadosJSON: '{"a":1}', meta: { status: 'em_preenchimento', editadoPorNome: 'Contador Um' } }));
  await assertFails(revisao(g, GER, id, 0, { tipo: 'aprovacao', meta: { secoes: {} } }));
  await assertSucceeds(revisao(g, GER, id, 0, { dadosJSON: '{"a":1}', meta: { status: 'em_preenchimento', editadoPorNome: 'Gerente Um', atualizadoPorNome: 'Gerente Um' } }));
  await assertFails(g.collection(`relatorios/${id}/historico`).add({ tipo: 'aprovacao', uid: GER.uid, nome: GER.nome, em: ST() }));
  await assertSucceeds(g.collection(`relatorios/${id}/historico`).add({ tipo: 'versao_salva', uid: GER.uid, nome: GER.nome, em: ST() }));
});
