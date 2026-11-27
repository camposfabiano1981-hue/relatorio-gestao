'use strict';
/*
 * Teste ponta a ponta do modo online com os emuladores do Firebase (Auth + Firestore) e o Chromium.
 * Uso, nesta pasta:  npm run test:e2e   (requer o pacote "playwright" com o Chromium instalado)
 * Capturas de tela em dev/firebase/saida/ (ou na pasta indicada no 1º argumento).
 *
 * Roteiro: configuração inicial do contador, cadastros (configurações, usuários, UGs), criação de
 * relatórios, primeiro acesso do gerente com troca de senha, isolamento entre UGs, edição com
 * salvamento no servidor, conclusão de seção, histórico com diferenças, envio, devolução, edição
 * simultânea com mesclagem, presença, restauração de versão, aprovação, painel e log de auditoria.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '../..');
const SAIDA = path.resolve(process.argv[2] || path.join(__dirname, 'saida'));
const PORTA = 8766;
const BASE = `http://127.0.0.1:${PORTA}/`;
const PROJETO = 'demo-rg';
const FS_REST = `http://127.0.0.1:8080/v1/projects/${PROJETO}/databases/(default)/documents`;

const ANA = { nome: 'Ana Contadora', email: 'ana.contadora@exemplo.gov.br', senha: 'SenhaDaAna2025' };
const BRUNO = { nome: 'Bruno Gerente', email: 'bruno.gaf@exemplo.gov.br', senhaNova: 'SenhaDoBruno2025' };
const DIEGO = { nome: 'Diego Gerente', email: 'diego.gaf@exemplo.gov.br' };

const CONFIG = `window.RG_CONFIG = {
  firebase: { apiKey: 'demo-chave', authDomain: '${PROJETO}.firebaseapp.com', projectId: '${PROJETO}', appId: '1:1:web:1' },
  emuladores: { auth: 'http://127.0.0.1:9099', firestore: ['127.0.0.1', 8080] },
  depurar: ${!!process.env.DEPURAR},
};`;

// ---------- Servidor estático do site (com config.js apontando para os emuladores) ----------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p === '/js/config.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); res.end(CONFIG); return; }
  if (p === '/') p = '/index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

// ---------- Acesso administrativo ao emulador (ignora as regras) ----------

async function rest(metodo, caminho, corpo) {
  const r = await fetch(FS_REST + caminho, {
    method: metodo, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${await r.text()}`);
  return r.json();
}
const valor = (f) => (f.stringValue ?? f.integerValue ?? f.booleanValue ?? f.doubleValue ?? f.nullValue);
async function relatorios() {
  const r = await rest('GET', '/relatorios');
  return (r.documents || []).map((d) => {
    const o = { id: d.name.split('/').pop() };
    for (const [k, v] of Object.entries(d.fields)) o[k] = valor(v);
    return o;
  });
}
async function conteudo(relId) {
  const d = await rest('GET', `/relatorios/${relId}/conteudo/atual`);
  return JSON.parse(d.fields.dadosJSON.stringValue);
}
/** Consulta o conteúdo no servidor até a condição ser satisfeita (ou o tempo esgotar). */
async function esperarConteudo(relId, cond, ms = 20000) {
  const fim = Date.now() + ms;
  let c;
  do {
    c = await conteudo(relId);
    if (cond(c)) return c;
    await new Promise((r) => setTimeout(r, 300));
  } while (Date.now() < fim);
  return c;
}
async function contar(colecao) {
  const r = await rest('GET', colecao + '?pageSize=300');
  return (r.documents || []).length;
}

// ---------- Auxiliares de navegação ----------

let passo = 0;
const ok = (msg) => console.log(`  ✔ ${String(++passo).padStart(2, '0')} ${msg}`);
function afirmar(cond, msg) { if (!cond) throw new Error('Falhou: ' + msg); ok(msg); }

const erros = [];
const paginas = [];
const toastsErro = [];
const TOASTS_ESPERADOS = [/não tem acesso a este relatório/];
async function novaPagina(browser, nome) {
  // ESCALA=2 gera capturas em alta resolução, sem os avisos (para apresentação)
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: +(process.env.ESCALA || 1) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(`[${nome}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    // recusas esperadas das regras aparecem como avisos do SDK; erros de verdade são registrados
    if (m.type() === 'error' && !/PERMISSION_DENIED|permission-denied|Missing or insufficient permissions|status of 4\d\d/.test(m.text())) erros.push(`[${nome}] ${m.text()}`);
  });
  page.setDefaultTimeout(20000);
  await page.exposeFunction('__toastErro', (t) => toastsErro.push(`[${nome}] ${t}`) && process.env.DEPURAR && console.log(`    [toast erro após o passo ${passo}] [${nome}] ${t}`));
  if (process.env.DEPURAR) page.on('console', (m) => { if (/\[RG\]|PERMISSION_DENIED|permission/i.test(m.text())) console.log(`    [console ${nome} após o passo ${passo}] ${m.text().slice(0, 900)}`); });
  await page.addInitScript(() => {
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.classList.contains('toast') && n.classList.contains('erro')) window.__toastErro(n.textContent);
    }))).observe(document, { childList: true, subtree: true });
  });
  paginas.push([nome, page]);
  return page;
}

async function foto(page, nome) {
  await page.waitForTimeout(400);
  // listas ou valores nulos passados ao append() nativo viram texto na tela
  const lixo = await page.evaluate(() => {
    const t = document.body.innerText;
    const nulo = [...document.querySelectorAll('#app, #app *')].some((el) => [...el.childNodes].some((n) => n.nodeType === 3 && /^(null|undefined)$/.test(n.textContent.trim())));
    return (t.includes('[object ') ? '[object …] ' : '') + (nulo ? 'texto null/undefined' : '');
  });
  if (lixo) erros.push(`[${nome}] texto indevido na tela: ${lixo}`);
  if (process.env.ESCALA) await page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
  await page.screenshot({ path: path.join(SAIDA, nome + '.png'), fullPage: false });
}

async function toast(page, trecho) {
  await page.locator('.toast', { hasText: trecho }).first().waitFor({ timeout: 20000 });
}

async function entrar(page, email, senha) {
  await page.goto(BASE);
  await page.locator('.acesso-form input[name=email]').fill(email);
  await page.locator('.acesso-form input[name=senha]').fill(senha);
  await page.locator('.acesso-form button[type=submit]').click();
}

async function sair(page) {
  await page.locator('.menu-botao').first().click();
  await page.locator('.menu-lista button', { hasText: 'Sair' }).first().click();
  await page.locator('.acesso-form input[name=email]').waitFor();
}

const dialogo = (page) => page.locator('dialog[open]').last();

async function esperarSalvo(page) {
  await page.waitForFunction(() => /^Salvo/.test(document.getElementById('save-state').textContent), null, { timeout: 25000 });
}

async function editarCampo(page, rotulo, texto) {
  const campo = page.locator('#editor-main label.field', { hasText: rotulo }).first().locator('input, textarea').first();
  await campo.fill(texto);
  await campo.blur();
}

// ---------- Roteiro ----------

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  await new Promise((r) => servidor.listen(PORTA, '127.0.0.1', r));
  await rest('PATCH', '/sistema/instalacao', { fields: { email: { stringValue: ANA.email } } });
  const browser = await chromium.launch();

  console.log('Contador: configuração inicial e cadastros');
  const ana = await novaPagina(browser, 'ana');
  await ana.goto(BASE);
  await ana.locator('text=Configuração inicial (primeiro acesso do contador)').waitFor();
  await foto(ana, '01-entrada');
  await ana.click('text=Configuração inicial (primeiro acesso do contador)');
  await ana.fill('input[name=nome]', ANA.nome);
  await ana.fill('input[name=email]', 'outra.pessoa@exemplo.gov.br');
  await ana.fill('input[name=senha]', ANA.senha);
  await ana.fill('input[name=senha2]', ANA.senha);
  await ana.click('.acesso-form button[type=submit]');
  await ana.locator('.dlg-erro', { hasText: 'não é o indicado' }).waitFor();
  ok('configuração inicial recusada para e-mail diferente do indicado em sistema/instalacao');
  await ana.fill('input[name=email]', ANA.email);
  await ana.click('.acesso-form button[type=submit]');
  await ana.locator('h1', { hasText: 'Unidades gestoras' }).waitFor();
  ok('primeiro contador (master) criado e conectado');

  const cfg = ana.locator('section.card', { hasText: 'Configurações gerais' });
  await cfg.waitFor();
  await cfg.getByLabel('Entidade (exibida').fill('Prefeitura Municipal de Cidade Exemplo');
  await cfg.getByLabel('Município').fill('Cidade Exemplo');
  await cfg.getByLabel('Prazo padrão para envio').fill('2026-03-31');
  await cfg.locator('button', { hasText: 'Salvar configurações' }).click();
  await toast(ana, 'Configurações salvas');
  ok('configurações gerais salvas');

  // Usuários
  await ana.click('.topnav a:has-text("Usuários")');
  await ana.locator('td', { hasText: ANA.email }).waitFor();
  const senhas = {};
  for (const u of [BRUNO, DIEGO]) {
    await ana.click('text=+ Novo usuário');
    const d = dialogo(ana);
    await d.locator('input[name=nome]').fill(u.nome);
    await d.locator('input[name=email]').fill(u.email);
    await d.locator('input[name=cargo]').fill('Gerente de GAF');
    await d.locator('button[type=submit]').click();
    const cred = dialogo(ana).locator('textarea');
    await cred.waitFor();
    senhas[u.email] = /Senha provisória: (\S+)/.exec(await cred.inputValue())[1];
    if (u === BRUNO) await foto(ana, '03-credenciais');
    await dialogo(ana).locator('button', { hasText: 'Fechar' }).click();
  }
  await ana.locator('td', { hasText: DIEGO.email }).waitFor();
  ok('gerentes de GAF cadastrados com senha provisória');
  await foto(ana, '04-usuarios');

  // UGs
  await ana.click('.topnav a:has-text("UGs")');
  await ana.locator('section.card', { hasText: 'Configurações gerais' }).waitFor();
  const ugs = [
    { nome: 'Fundo Municipal de Saúde', sigla: 'FMS', ordenador: 'Carla Souza', cargo: 'Secretária Municipal de Saúde', gerente: BRUNO.nome },
    { nome: 'Fundo Municipal de Educação', sigla: 'FME', ordenador: 'Eduardo Lima', cargo: 'Secretário Municipal de Educação', gerente: DIEGO.nome },
    { nome: 'Fundo Municipal de Assistência Social', sigla: 'FMAS', ordenador: 'Fernanda Dias', cargo: 'Secretária Municipal de Assistência Social', gerente: null },
  ];
  for (const ug of ugs) {
    await ana.click('text=+ Nova UG');
    const d = dialogo(ana);
    await d.locator('input[name=nome]').fill(ug.nome);
    await d.locator('input[name=sigla]').fill(ug.sigla);
    await d.locator('select[name=tipo]').selectOption('fundo');
    await d.locator('input[name=ordenadorNome]').fill(ug.ordenador);
    await d.locator('input[name=ordenadorCargo]').fill(ug.cargo);
    if (ug.gerente) await d.locator('label.check', { hasText: ug.gerente }).locator('input').check();
    await d.locator('button[type=submit]').click();
    await ana.locator('td.forte', { hasText: ug.sigla }).waitFor();
  }
  ok('três UGs cadastradas (FMS e FME com gerente; FMAS sem gerente)');
  await foto(ana, '02-ugs');

  // Relatórios
  await ana.click('.topnav a:has-text("Relatórios")');
  await ana.locator('.chip', { hasText: 'FMAS' }).waitFor();
  await ana.click('text=+ Novo relatório');
  let d = dialogo(ana);
  await d.locator('select[name=ug]').selectOption({ label: 'FMS – Fundo Municipal de Saúde' });
  await d.locator('button[type=submit]').click();
  await ana.locator('.rep-card', { hasText: 'FMS' }).waitFor();
  await ana.click('text=Criar relatórios em lote');
  d = dialogo(ana);
  await d.locator('button[type=submit]').click();
  await ana.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 });
  await ana.locator('.rep-card', { hasText: 'FME' }).waitFor();
  afirmar((await ana.locator('.rep-card').count()) === 3, 'relatório individual e relatórios em lote criados para 2025');
  await foto(ana, '05-relatorios-contador');
  const rels = await relatorios();
  const idFMS = rels.find((r) => r.ugSigla === 'FMS').id, idFME = rels.find((r) => r.ugSigla === 'FME').id;
  const c0 = await conteudo(idFMS);
  afirmar(c0.declaracao.nome === 'Carla Souza' && c0.config.municipio === 'Cidade Exemplo' && c0.config.orgaoSuperior === 'Prefeitura Municipal de Cidade Exemplo',
    'relatório novo já vem com ordenador, município e órgão superior cadastrados');
  await sair(ana);

  console.log('Gerente: primeiro acesso, isolamento e preenchimento');
  const bruno = await novaPagina(browser, 'bruno');
  await entrar(bruno, BRUNO.email, senhas[BRUNO.email]);
  await bruno.locator('input[name=nova]').waitFor();
  await foto(bruno, '06-troca-senha');
  await bruno.fill('input[name=atual]', senhas[BRUNO.email]);
  await bruno.fill('input[name=nova]', BRUNO.senhaNova);
  await bruno.fill('input[name=nova2]', BRUNO.senhaNova);
  await bruno.click('.acesso-form button[type=submit]');
  await bruno.locator('.rep-card').first().waitFor();
  afirmar((await bruno.locator('.rep-card').count()) === 1 && (await bruno.locator('.rep-card', { hasText: 'FMS' }).count()) === 1,
    'gerente troca a senha provisória e vê apenas o relatório da sua UG');
  afirmar((await bruno.locator('.topnav a', { hasText: 'Usuários' }).count()) === 0, 'menu de cadastros não aparece para o gerente');
  await bruno.goto(BASE + '#/ugs');
  await bruno.locator('h1', { hasText: 'Relatórios de gestão' }).waitFor();
  ok('gerente que digita o endereço da página de UGs é levado de volta aos relatórios');
  await bruno.goto(BASE + `#/r/${idFME}/capa`);
  await toast(bruno, 'não tem acesso');
  ok('gerente não abre o relatório de outra UG (bloqueio do servidor)');

  await bruno.goto(BASE + `#/r/${idFMS}/s1`);
  await bruno.locator('text=Dados de Identificação da Unidade').waitFor();
  await editarCampo(bruno, 'CNPJ', '11222333000181');
  await editarCampo(bruno, 'Endereço', 'Rua das Flores, 100 – Centro');
  await esperarSalvo(bruno);
  let srv = await esperarConteudo(idFMS, (c) => c.identificacao.cnpj === '11.222.333/0001-81' && !!c.identificacao.endereco);
  afirmar(srv.identificacao.cnpj === '11.222.333/0001-81' && srv.identificacao.endereco.startsWith('Rua das Flores'), 'edição gravada no servidor automaticamente');
  let meta = (await relatorios()).find((r) => r.id === idFMS);
  afirmar(meta.status === 'em_preenchimento' && meta.editadoPorNome === BRUNO.nome, 'situação passa a “em preenchimento” com o autor da edição');

  await bruno.click('.nav a[data-sec=capa]');
  await bruno.click('text=Marcar seção como concluída');
  await toast(bruno, 'concluída');
  await bruno.locator('.conclusao.feita').waitFor();
  ok('seção marcada como concluída');
  await foto(bruno, '07-editor-gerente');

  await bruno.click('.nav a[data-sec=historico]');
  await bruno.locator('.tl-item').nth(2).waitFor();
  await bruno.locator('.tl-item', { hasText: 'Edição' }).first().locator('button.link').click();
  await bruno.locator('.difs .dif-campo', { hasText: 'CNPJ' }).waitFor();
  ok('histórico mostra a edição com o campo alterado (de → para)');
  await foto(bruno, '08-historico');

  await bruno.click('.faixa button:has-text("Enviar ao contador")');
  await dialogo(bruno).locator('button[type=submit]').click();
  await toast(bruno, 'enviado ao contador');
  await bruno.click('.nav a[data-sec=s1]');
  await bruno.locator('fieldset.somente-leitura[disabled]').waitFor();
  ok('relatório enviado: o gerente passa a ver somente leitura');
  await foto(bruno, '09-enviado-somente-leitura');

  console.log('Contador: análise, devolução e edição simultânea');
  await entrar(ana, ANA.email, ANA.senha);
  await ana.locator('h1', { hasText: 'Relatórios de gestão' }).waitFor();
  await ana.click('.topnav a:has-text("Acompanhamento")');
  await ana.locator('.tab-painel td', { hasText: 'FMS' }).first().waitFor();
  afirmar((await ana.locator('.tab-painel tr', { hasText: 'FMS' }).first().locator('.selo.st-enviado').count()) === 1, 'painel do contador mostra o FMS como enviado');
  await foto(ana, '10-acompanhamento-contador');
  await ana.goto(BASE + `#/r/${idFMS}/s1`);
  await ana.click('.faixa button:has-text("Devolver para ajustes")');
  await dialogo(ana).locator('textarea').fill('Informar o telefone e o e-mail institucional da unidade.');
  await dialogo(ana).locator('button[type=submit]').click();
  await toast(ana, 'devolvido');
  await toast(bruno, 'liberado para edição');
  await bruno.locator('.faixa-motivo', { hasText: 'telefone' }).waitFor();
  ok('devolução com motivo chega ao gerente em tempo real e libera a edição');

  await bruno.locator('#presenca .avatar').first().waitFor();
  await ana.locator('#presenca .avatar').first().waitFor();
  ok('cada um vê o outro com o relatório aberto (presença)');
  await editarCampo(bruno, 'Telefone', '(67) 3234-5678');
  await editarCampo(ana, 'E-mail institucional', 'fms@exemplo.gov.br');
  await esperarSalvo(bruno);
  await esperarSalvo(ana);
  srv = await esperarConteudo(idFMS, (c) => c.identificacao.telefone === '(67) 3234-5678' && c.identificacao.email === 'fms@exemplo.gov.br');
  afirmar(srv.identificacao.telefone === '(67) 3234-5678' && srv.identificacao.email === 'fms@exemplo.gov.br', 'edições simultâneas em campos diferentes são combinadas, sem perda');
  await bruno.waitForFunction(() => {
    const l = [...document.querySelectorAll('#editor-main label.field')].find((x) => x.textContent.includes('E-mail institucional'));
    return l && l.querySelector('input').value === 'fms@exemplo.gov.br';
  });
  ok('a tela do gerente recebe a alteração feita pelo contador');
  await foto(bruno, '11-devolvido-presenca');

  console.log('Gerente: restauração de versão e novo envio');
  await bruno.click('.nav a[data-sec=historico]');
  const linhaCriacao = bruno.locator('.tab-painel tr', { hasText: 'Criação do relatório' });
  await linhaCriacao.waitFor();
  await linhaCriacao.locator('button', { hasText: 'Comparar com a atual' }).click();
  await dialogo(bruno).locator('.dif-campo', { hasText: 'Telefone' }).waitFor();
  ok('comparação de uma versão antiga com a atual');
  await dialogo(bruno).locator('button', { hasText: 'Fechar' }).click();
  await linhaCriacao.locator('button', { hasText: 'Restaurar' }).click();
  await dialogo(bruno).locator('button[type=submit]').click();
  srv = await esperarConteudo(idFMS, (c) => !c.identificacao.cnpj && !c.identificacao.telefone);
  afirmar(!srv.identificacao.cnpj && !srv.identificacao.telefone, 'versão da criação restaurada');
  await bruno.locator('.tab-painel tr', { hasText: 'Antes de restaurar' }).first().waitFor();
  await bruno.locator('.tab-painel tr', { hasText: 'Antes de restaurar' }).first().locator('button', { hasText: 'Restaurar' }).click();
  await dialogo(bruno).locator('button[type=submit]').click();
  srv = await esperarConteudo(idFMS, (c) => c.identificacao.cnpj === '11.222.333/0001-81');
  afirmar(srv.identificacao.cnpj === '11.222.333/0001-81' && srv.identificacao.telefone === '(67) 3234-5678', 'cópia automática “antes de restaurar” permite desfazer a restauração');
  await bruno.click('.faixa button:has-text("Enviar ao contador")');
  await dialogo(bruno).locator('button[type=submit]').click();
  await toast(bruno, 'enviado ao contador');

  console.log('Contador: aprovação, painel e log de auditoria');
  await ana.locator('.faixa .selo.st-enviado').waitFor();
  await ana.click('.faixa button:has-text("Aprovar")');
  await dialogo(ana).locator('button[type=submit]').click();
  await toast(ana, 'aprovado');
  await bruno.locator('.faixa .selo.st-aprovado').waitFor();
  ok('aprovação registrada e refletida para o gerente em tempo real');
  meta = (await relatorios()).find((r) => r.id === idFMS);
  afirmar(meta.status === 'aprovado' && meta.aprovadoPorNome === ANA.nome, 'situação “aprovado” gravada com o nome do contador');
  const nVersoes = await contar(`/relatorios/${idFMS}/versoes`);
  const nHist = await contar(`/relatorios/${idFMS}/historico`);
  afirmar(nVersoes >= 6 && nHist >= 10, `histórico completo: ${nHist} registros e ${nVersoes} versões completas do FMS`);

  await ana.click('a.back');
  await ana.click('.topnav a:has-text("Acompanhamento")');
  await ana.locator('.equipe td', { hasText: DIEGO.nome }).waitFor();
  afirmar((await ana.locator('.equipe tr', { hasText: DIEGO.nome }).locator('text=Nunca acessou').count()) === 1, 'quadro da equipe aponta o gerente que nunca acessou');
  afirmar((await ana.locator('.notice', { hasText: 'sem gerente de GAF vinculado' }).count()) === 1, 'painel alerta a UG sem gerente vinculado');
  await foto(ana, '12-acompanhamento-final');
  await ana.click('.topnav a:has-text("Log de auditoria")');
  await ana.locator('td', { hasText: 'Aprovou o relatório' }).first().waitFor();
  for (const t of ['Entrou no sistema', 'Cadastrou', 'Criou o relatório', 'Enviou ao contador', 'Devolveu para ajustes', 'Restaurou']) {
    if (!(await ana.locator('td', { hasText: t }).count())) throw new Error('log sem: ' + t);
  }
  ok('log de auditoria registra entradas, cadastros, criação, envio, devolução, restauração e aprovação');
  await foto(ana, '13-log-auditoria');

  await bruno.click('a.back');
  await bruno.click('.topnav a:has-text("Acompanhamento")');
  await bruno.locator('.tab-painel td', { hasText: 'FMS' }).first().waitFor();
  afirmar((await bruno.locator('.tab-painel tbody tr').count()) === 1 && (await bruno.locator('.equipe').count()) === 0, 'painel do gerente mostra só o relatório dele, sem o quadro da equipe');
  await foto(bruno, '14-acompanhamento-gerente');

  console.log('Contador: arquivar, resgatar e excluir relatório');
  await ana.click('.topnav a:has-text("Relatórios")');
  const cartaoFMAS = ana.locator('.rep-list:not(.arquivados) .rep-card', { hasText: 'FMAS' });
  await cartaoFMAS.locator('button', { hasText: 'Arquivar' }).click();
  await dialogo(ana).locator('button[type=submit]').click();
  await ana.locator('.rep-list.arquivados .rep-card', { hasText: 'FMAS' }).waitFor();
  afirmar((await cartaoFMAS.count()) === 0, 'relatório arquivado sai da lista principal e aparece na seção “Arquivados”');
  await ana.click('text=+ Novo relatório');
  await dialogo(ana).locator('select[name=ug]').selectOption({ label: 'FMAS – Fundo Municipal de Assistência Social' });
  await dialogo(ana).locator('.notice', { hasText: 'arquivado' }).waitFor();
  ok('“Novo relatório” avisa que já existe relatório arquivado e oferece desarquivar ou excluir');
  await dialogo(ana).locator('button', { hasText: 'Excluir o arquivado' }).click();
  const dlgExcluir = ana.locator('dialog[open]', { hasText: 'Excluir relatório definitivamente' });
  await dlgExcluir.locator('input[name=senha]').fill('senha-errada-123');
  await dlgExcluir.locator('button[type=submit]').click();
  await dlgExcluir.locator('.dlg-erro', { hasText: 'Senha incorreta' }).waitFor();
  ok('exclusão recusada com senha errada');
  await dlgExcluir.locator('input[name=senha]').fill(ANA.senha);
  const baixando = ana.waitForEvent('download');
  await dlgExcluir.locator('button[type=submit]').click();
  const copia = JSON.parse(fs.readFileSync(await (await baixando).path(), 'utf8'));
  afirmar(copia.relatorio && copia.relatorio.identificacao && Array.isArray(copia.historico) && copia.historico.length >= 1, 'cópia de segurança (conteúdo e histórico) baixada antes da exclusão');
  await dlgExcluir.waitFor({ state: 'detached' });
  await dialogo(ana).locator('.notice', { hasText: 'arquivado' }).waitFor({ state: 'hidden' });
  const idFMAS = rels.find((r) => r.ugSigla === 'FMAS').id;
  let restou = await rest('GET', `/relatorios/${idFMAS}/historico`);
  afirmar(!(await relatorios()).some((r) => r.id === idFMAS) && !(restou.documents || []).length, 'relatório e todos os seus registros apagados do servidor');
  await dialogo(ana).locator('button[type=submit]').click();
  await ana.locator('dialog[open]').waitFor({ state: 'detached' });
  await ana.locator('.rep-list:not(.arquivados) .rep-card', { hasText: 'FMAS' }).waitFor();
  afirmar((await ana.locator('.rep-list.arquivados').count()) === 0, 'novo relatório da mesma UG e exercício criado depois da exclusão');
  await ana.click('.topnav a:has-text("Log de auditoria")');
  await ana.locator('td', { hasText: 'Excluiu definitivamente o relatório FMAS – 2025' }).waitFor();
  ok('exclusão registrada no log de auditoria');
  await foto(ana, '15-log-exclusao');
  await ana.click('.topnav a:has-text("Relatórios")');
  await ana.locator('.rep-list:not(.arquivados) .rep-card', { hasText: 'FME' }).locator('button', { hasText: 'Arquivar' }).click();
  await dialogo(ana).locator('button[type=submit]').click();
  const arqFME = ana.locator('.rep-list.arquivados .rep-card', { hasText: 'FME' });
  await arqFME.waitFor();
  await foto(ana, '15b-arquivados');
  await arqFME.locator('a', { hasText: 'Abrir' }).click();
  await ana.locator('.faixa button', { hasText: 'Desarquivar' }).click();
  await toast(ana, 'Relatório desarquivado');
  await ana.locator('.faixa button', { hasText: 'Aprovar' }).waitFor();
  ok('relatório arquivado aberto pela seção “Arquivados” e desarquivado pela faixa do editor');
  await ana.click('a.back');
  await ana.locator('h1', { hasText: 'Relatórios de gestão' }).waitFor();

  // Layout em celular
  await ana.setViewportSize({ width: 390, height: 844 });
  await ana.click('.topnav a:has-text("Acompanhamento")');
  await ana.locator('.tab-painel td', { hasText: 'FMS' }).first().waitFor();
  await foto(ana, '16-celular-acompanhamento');
  await ana.goto(BASE + `#/r/${idFMS}/s2`);
  await ana.locator('#editor-main h2', { hasText: 'II' }).waitFor();
  await foto(ana, '17-celular-editor');
  const larguraExtra = await ana.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  afirmar(larguraExtra <= 1, 'sem rolagem horizontal da página no celular');

  // Segurança: brasão adulterado direto no banco não executa código na pré-visualização do contador
  const adulterado = await conteudo(idFMS);
  adulterado.config.logo = { data: 'x" onerror="window.__xss=1', w: 1, h: 1, type: 'png' };
  await rest('PATCH', `/relatorios/${idFMS}/conteudo/atual?updateMask.fieldPaths=dadosJSON`, { fields: { dadosJSON: { stringValue: JSON.stringify(adulterado) } } });
  await ana.setViewportSize({ width: 1360, height: 900 });
  await ana.goto(BASE + '#/');
  await ana.reload();
  await ana.locator('h1', { hasText: 'Relatórios de gestão' }).waitFor();
  await ana.goto(BASE + `#/r/${idFMS}/preview`);
  await ana.locator('.paper .cover').waitFor();
  await ana.waitForTimeout(500);
  afirmar(!(await ana.evaluate(() => window.__xss)) && !(await ana.locator('.paper img').count()), 'brasão adulterado não executa código na pré-visualização');

  const inesperados = toastsErro.filter((t) => !TOASTS_ESPERADOS.some((r) => r.test(t)));
  afirmar(!inesperados.length, 'nenhum aviso de erro inesperado durante todo o roteiro' + (inesperados.length ? ': ' + inesperados.join(' | ') : ''));
  await browser.close();
  servidor.close();
  if (erros.length) { console.log('\nErros no console do navegador:\n' + erros.join('\n')); process.exit(1); }
  console.log(`\nTodos os ${passo} passos passaram. Capturas em ${SAIDA}`);
})().catch(async (e) => {
  console.error('\n✖ ' + (e.stack || e));
  for (const [nome, p] of paginas) await p.screenshot({ path: path.join(SAIDA, `falha-${nome}.png`) }).catch(() => {});
  if (erros.length) console.error('Erros no console do navegador:\n' + erros.join('\n'));
  process.exit(1);
});
