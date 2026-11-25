/*
 * Aplicação: rotas, telas, barra de ações, salvamento automático e exportações.
 * Modo local (padrão): dados no navegador, sem login. Modo online (js/config.js preenchido):
 * login, perfis, dados no Firebase com histórico, acompanhamento e fluxo de envio/aprovação.
 */
(function (RG) {
  'use strict';
  const U = RG.util;
  const S = RG.schema;
  const h = RG.h;
  const N = RG.nuvem;
  const ONLINE = !!(N && N.ativo);
  const CONFIGURADO = !!(window.RG_CONFIG && RG_CONFIG.firebase && RG_CONFIG.firebase.apiKey);

  const $app = document.getElementById('app');
  let current = null; // relatório aberto
  let saveState = null;
  let dirty = false; // modo local: alterações ainda não gravadas no navegador
  let sessao = null; // modo online: sessão de edição do relatório aberto
  let limparPagina = null; // cancela as assinaturas em tempo real da página aberta
  let presentes = [];
  let secAtual = null;
  let ctxAtual = null;

  // ---------- Avisos ----------

  RG.toast = function (msg, tipo) {
    const box = document.getElementById('toasts');
    const el = h('div', { class: 'toast ' + (tipo || 'ok'), role: 'status' }, msg);
    box.append(el);
    const tempo = tipo === 'erro' ? 6500 : 3800;
    setTimeout(() => el.classList.add('out'), tempo);
    setTimeout(() => el.remove(), tempo + 500);
  };

  /** Lê e reduz a imagem do brasão para no máximo 400 px, preservando PNG/JPG. */
  RG.loadLogo = function (file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg)$/.test(file.type)) { reject(new Error('Use uma imagem PNG ou JPG.')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Imagem inválida.'));
        img.onload = () => {
          const scale = Math.min(1, 400 / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), hgt = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = hgt;
          canvas.getContext('2d').drawImage(img, 0, 0, w, hgt);
          const png = file.type === 'image/png';
          resolve({ data: canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w, h: hgt, type: png ? 'png' : 'jpg' });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // ---------- Rotas ----------

  function route() {
    if (ONLINE) { rotaOnline(); return; }
    const m = /^#\/r\/([^/]+)(?:\/([\w-]+))?/.exec(location.hash);
    // Grava alterações pendentes (salvamento com atraso) antes de trocar de relatório ou voltar à lista.
    if (current && dirty && (!m || m[1] !== current.id)) {
      dirty = !RG.storage.save(current);
    }
    if (m) {
      if (!current || current.id !== m[1]) {
        current = RG.storage.load(m[1]);
        if (!current) { location.hash = '#/'; return; }
      }
      renderEditor(m[2] || 'capa');
    } else {
      current = null;
      renderHome();
    }
  }

  // ---------- Tela inicial (modo local) ----------

  function openReport(r, sec) {
    if (!RG.storage.save(r)) { RG.toast('Não foi possível salvar no navegador (armazenamento cheio?).', 'erro'); return; }
    current = r;
    location.hash = `#/r/${r.id}/${sec || 'capa'}`;
  }

  async function importFile(file) {
    try {
      const r = await RG.storage.importJSON(file);
      openReport(r);
      RG.toast('Relatório importado.');
    } catch (e) {
      RG.toast('Falha na importação: ' + e.message, 'erro');
    }
  }

  function newReportDialog() {
    const dlg = document.getElementById('dlg-novo');
    const form = dlg.querySelector('form');
    form.reset();
    form.exercicio.value = new Date().getFullYear() - 1;
    form.uf.value = RG.storage.getPref('uf', 'MS');
    form.municipio.value = RG.storage.getPref('municipio', '');
    dlg.showModal();
  }

  function setupNewDialog() {
    const dlg = document.getElementById('dlg-novo');
    const form = dlg.querySelector('form');
    form.tipo.append(...Object.entries(S.TIPOS).map(([k, v]) => h('option', { value: k }, v)));
    form.uf.append(...Object.keys(S.ESTADOS).map((k) => h('option', { value: k }, k)));
    form.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = S.newReport({
        tipo: form.tipo.value, consolidado: form.consolidado.checked, uf: form.uf.value,
        municipio: form.municipio.value.trim(), denominacao: form.denominacao.value.trim(), exercicio: +form.exercicio.value,
      });
      RG.storage.setPref('uf', form.uf.value);
      RG.storage.setPref('municipio', form.municipio.value.trim());
      dlg.close();
      openReport(r);
    });
  }

  function renderHome() {
    document.title = 'Relatório de Gestão – Anexo II';
    const lista = RG.storage.list();
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { if (e.target.files[0]) importFile(e.target.files[0]); } });

    const cards = lista.map((x) => h('article', { class: 'rep-card' },
      h('div', { class: 'rep-main' },
        h('div', { class: 'rep-tipo' }, (S.TIPOS[x.tipo] || x.tipo) + (x.consolidado ? ' · Consolidado' : '')),
        h('a', { class: 'rep-nome', href: `#/r/${x.id}/capa` }, x.denominacao),
        h('div', { class: 'rep-meta' }, `Exercício ${x.exercicio}`, x.municipio ? ` · ${x.municipio}/${x.uf}` : '',
          ` · atualizado em ${new Date(x.atualizadoEm).toLocaleString('pt-BR')}`)),
      h('div', { class: 'rep-actions' },
        h('a', { class: 'btn primary small', href: `#/r/${x.id}/capa` }, 'Abrir'),
        h('button', {
          type: 'button', class: 'btn small', title: 'Cria o relatório do exercício seguinte mantendo cadastros e textos',
          onclick: () => {
            const src = RG.storage.load(x.id);
            if (!src) return;
            const novo = S.duplicateForNextYear(src);
            openReport(novo);
            RG.toast(`Relatório de ${novo.config.exercicio} criado a partir de ${src.config.exercicio}. O saldo inicial de Restos a Pagar foi trazido do saldo final anterior.`);
          },
        }, `Criar ${x.exercicio + 1}`),
        h('button', { type: 'button', class: 'btn small', onclick: () => { const r = RG.storage.load(x.id); if (r) RG.storage.exportJSON(r); } }, 'Exportar'),
        h('button', {
          type: 'button', class: 'btn small danger',
          onclick: () => {
            if (!confirm(`Excluir definitivamente o relatório “${x.denominacao} – ${x.exercicio}” deste navegador?\nRecomenda-se exportar uma cópia antes.`)) return;
            RG.storage.remove(x.id);
            renderHome();
          },
        }, 'Excluir'))));

    $app.innerHTML = '';
    $app.append(
      h('header', { class: 'topbar' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, 'RG'), h('div', {}, h('strong', {}, 'Relatório de Gestão – Anexo II'), h('small', {}, 'Prestação de Contas Anual · Administração Direta e Indireta')))),
      h('main', { class: 'home' },
        CONFIGURADO ? h('div', { class: 'notice warn' }, h('strong', {}, 'Modo local: '),
          'os relatórios desta tela ficam somente neste navegador e não são vistos pelo contador. ',
          h('a', { href: location.pathname }, 'Ir para o modo online (com login)'), '. Para levar um relatório ao modo online, use “Exportar” e importe o arquivo no relatório da UG.') : null,
        h('section', { class: 'hero' },
          h('h1', {}, 'Elabore o Relatório de Gestão da sua unidade'),
          h('p', {}, 'Preencha as informações por seção, acompanhe as verificações de consistência e gere o documento final em DOCX ou PDF. Os dados ficam salvos neste navegador; use “Exportar” para guardar cópias ou compartilhar com a equipe.'),
          h('div', { class: 'hero-actions' },
            h('button', { type: 'button', class: 'btn primary', onclick: newReportDialog }, '+ Novo relatório'),
            h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, 'Importar arquivo .json'),
            fileIn)),
        h('section', { class: 'rep-list' },
          h('h2', {}, 'Meus relatórios'),
          cards.length ? cards : h('p', { class: 'empty-state' }, 'Nenhum relatório ainda. Crie um novo ou importe um arquivo .json.'))),
      footerEl());
  }

  const footerEl = () => h('footer', { class: 'appfoot' }, 'Os dados são armazenados localmente no navegador. Faça cópias de segurança com “Exportar”.');

  // ---------- Editor ----------

  const persist = U.debounce(() => {
    if (!current) return;
    const ok = RG.storage.save(current);
    dirty = !ok;
    setSaveState(ok ? 'salvo' : 'erro');
    updateBadges();
  }, 500);

  const badgesDepois = U.debounce(() => updateBadges(), 600);

  function setSaveState(s, detalhe) {
    saveState = s;
    const el = document.getElementById('save-state');
    if (!el) return;
    const quando = detalhe instanceof Date ? detalhe : new Date();
    const textos = {
      salvando: 'Salvando…',
      erro: 'Falha ao salvar!',
      salvo: `Salvo às ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      pendente: 'Alterações ainda não salvas…',
      offline: 'Sem conexão – alterações guardadas neste navegador',
      bloqueado: 'Somente leitura',
    };
    el.className = 'save-state ' + s;
    el.textContent = textos[s] || '';
    el.title = typeof detalhe === 'string' ? detalhe : '';
    if (s === 'erro' && typeof detalhe === 'string') RG.toast(detalhe, 'erro');
  }

  function updateBadges() {
    if (!current) return;
    const issues = RG.builder.validate(current);
    const per = {};
    issues.forEach((i) => { if (i.nivel !== 'info') per[i.secao] = (per[i.secao] || 0) + 1; });
    const feitas = sessao ? sessao.meta.secoes || {} : {};
    document.querySelectorAll('.nav a[data-sec]').forEach((a) => {
      const b = a.querySelector('.badge');
      const n = a.dataset.sec === 'checks' ? issues.filter((i) => i.nivel !== 'info').length : per[a.dataset.sec] || 0;
      b.textContent = n || '';
      b.hidden = !n;
      a.classList.toggle('feita', !!feitas[a.dataset.sec]);
    });
    const title = document.getElementById('rep-title');
    if (title) title.textContent = `${current.identificacao.denominacao || '(sem denominação)'} – ${current.config.exercicio}`;
  }

  async function exportar(tipo) {
    const issues = RG.builder.validate(current);
    const erros = issues.filter((i) => i.nivel === 'erro').length;
    if (erros && !confirm(`Há ${erros} erro(s) nas verificações. Deseja gerar o documento mesmo assim?`)) {
      location.hash = `#/r/${current.id}/checks`;
      return;
    }
    const btn = document.getElementById('btn-' + tipo);
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Gerando…';
    try {
      const doc = RG.builder.build(current);
      const blob = tipo === 'docx' ? await RG.renderDOCX(doc) : await RG.renderPDF(doc);
      RG.download(blob, `${doc.fileBase}.${tipo}`);
      RG.toast(`Arquivo ${tipo.toUpperCase()} gerado.`);
      if (sessao) sessao.registrarExportacao(tipo);
    } catch (e) {
      console.error(e);
      RG.toast('Erro ao gerar o arquivo: ' + e.message, 'erro');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function exportarDados() {
    RG.storage.exportJSON(current);
    if (sessao) sessao.registrarExportacao('json');
  }

  function renderEditor(sec) {
    secAtual = sec;
    const online = !!sessao;
    const main = h('main', { class: 'editor-main', id: 'editor-main' });
    ctxAtual = {
      report: current,
      sessao,
      somenteLeitura: online && !sessao.podeEditar() ? sessao.motivoBloqueio() : '',
      changed: () => {
        if (online) { sessao.alterado(sec); badgesDepois(); return; }
        dirty = true; setSaveState('salvando'); persist();
      },
      rerender: () => {
        const y = window.scrollY;
        RG.editor.render(main, ctxAtual, sec);
        window.scrollTo(0, y);
        updateBadges();
      },
      conclusao: online ? { estado: (s) => (sessao.meta.secoes || {})[s], pode: () => sessao.podeEditar(), marcar: marcarSecao } : null,
      substituir: (dados) => { current = dados; rerenderSecao(); },
    };
    const ferramenta = (id) => id === 'preview' || id === 'checks' || id === 'historico';
    const nav = h('nav', { class: 'nav', 'aria-label': 'Seções do relatório' },
      RG.editor.SECTIONS.map((s) => h('a', {
        href: `#/r/${current.id}/${s.id}`, 'data-sec': s.id,
        class: (s.id === sec ? 'active' : '') + (ferramenta(s.id) ? ' tool' : ''),
      }, h('span', {}, s.nav), h('span', { class: 'badge', hidden: true }))));

    $app.innerHTML = '';
    $app.append(...[
      h('header', { class: 'topbar' },
        h('a', { class: 'back', href: '#/', title: 'Voltar à lista de relatórios' }, '←'),
        h('div', { class: 'brand compact' }, h('span', { class: 'brand-mark' }, 'RG'),
          h('div', {}, h('strong', { id: 'rep-title' }), h('span', { id: 'save-state', class: 'save-state' }))),
        online ? h('div', { id: 'presenca', class: 'presenca' }) : null,
        h('div', { class: 'top-actions' },
          h('button', { type: 'button', class: 'btn', onclick: exportarDados, title: 'Baixa uma cópia dos dados (.json) para backup ou compartilhamento' }, 'Exportar dados'),
          h('button', { type: 'button', class: 'btn primary', id: 'btn-docx', onclick: () => exportar('docx') }, 'Gerar DOCX'),
          h('button', { type: 'button', class: 'btn primary', id: 'btn-pdf', onclick: () => exportar('pdf') }, 'Gerar PDF')),
        online ? RG.acesso.menuUsuario() : null),
      online ? h('div', { id: 'faixa', class: 'faixa' }) : null,
      h('div', { class: 'editor' }, nav, main)].filter(Boolean));
    RG.editor.render(main, ctxAtual, sec);
    if (online) {
      setSaveState(sessao.podeEditar() ? (sessao.sujo ? 'pendente' : 'salvo') : 'bloqueado');
      desenharFaixa();
      desenharPresenca();
    } else {
      setSaveState(saveState === 'erro' ? 'erro' : 'salvo');
    }
    updateBadges();
    window.scrollTo(0, 0);
    document.title = `${current.identificacao.denominacao || 'Relatório'} ${current.config.exercicio} – Relatório de Gestão`;
  }

  /** Redesenha a seção aberta preservando a rolagem e o campo em edição (após alterações de outra pessoa). */
  function rerenderSecao() {
    const main = document.getElementById('editor-main');
    if (!main || !ctxAtual) return;
    ctxAtual.report = current;
    ctxAtual.somenteLeitura = sessao && !sessao.podeEditar() ? sessao.motivoBloqueio() : '';
    const campos = () => [...main.querySelectorAll('input, textarea, select')];
    const ativo = document.activeElement;
    const idx = main.contains(ativo) ? campos().indexOf(ativo) : -1;
    let sel = null;
    try { if (idx >= 0 && typeof ativo.selectionStart === 'number') sel = [ativo.selectionStart, ativo.selectionEnd]; } catch (e) { /* campo sem seleção */ }
    const y = window.scrollY;
    RG.editor.render(main, ctxAtual, secAtual);
    window.scrollTo(0, y);
    if (idx >= 0) {
      const el = campos()[idx];
      if (el && !el.disabled) {
        el.focus({ preventScroll: true });
        try { if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignora */ }
      }
    }
    updateBadges();
  }

  // ---------- Modo online ----------

  let rotaSeq = 0;

  function fecharSessao() {
    if (!sessao) return;
    const s = sessao;
    sessao = null;
    current = null;
    ctxAtual = null;
    s.fechar();
  }

  async function rotaOnline() {
    const seq = ++rotaSeq;
    const u = N.usuario();
    const m = /^#\/r\/([^/]+)(?:\/([\w-]+))?/.exec(location.hash);
    if (!(m && sessao && sessao.id === m[1] && u)) fecharSessao();
    if (limparPagina) { limparPagina(); limparPagina = null; }
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    if (!u) { RG.acesso.renderLogin($app); return; }
    if (u.trocarSenha) { RG.acesso.renderTrocaObrigatoria($app, () => route()); return; }
    if (m) { await abrirEditorOnline(m[1], m[2] || 'capa', seq); return; }
    const pagina = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    const paginas = { '': RG.painel.renderRelatorios, acompanhamento: RG.painel.renderAcompanhamento };
    if (N.ehMaster()) Object.assign(paginas, { ugs: RG.admin.renderUGs, usuarios: RG.admin.renderUsuarios, logs: RG.historico.renderLogs });
    const render = paginas[pagina];
    if (!render) { location.hash = '#/'; return; }
    window.scrollTo(0, 0);
    limparPagina = render($app) || null;
  }

  async function abrirEditorOnline(id, sec, seq) {
    if (!sessao || sessao.id !== id) {
      $app.innerHTML = '';
      $app.append(RG.acesso.topo(''), h('main', { class: 'pagina' }, RG.ui.carregando('Abrindo o relatório…')));
      presentes = [];
      let s;
      try {
        s = await N.abrirRelatorio(id, eventosSessao());
      } catch (e) {
        if (seq === rotaSeq) { RG.toast(e.message, 'erro'); location.hash = '#/'; }
        return;
      }
      if (seq !== rotaSeq) { s.fechar(); return; }
      sessao = s;
      current = s.dados;
      if (s.rascunho) await oferecerRascunho(s);
      if (seq !== rotaSeq) return;
    }
    if (!RG.editor.SECTIONS.some((x) => x.id === sec)) { location.hash = `#/r/${id}/capa`; return; }
    sessao.definirSecao(sec);
    renderEditor(sec);
  }

  async function oferecerRascunho(s) {
    const r = await RG.ui.dialogo({
      titulo: 'Recuperar alterações não enviadas',
      corpo: [
        h('p', {}, `Há alterações deste relatório gravadas neste navegador em ${RG.ui.dataHora(s.rascunho.em)} que não chegaram ao servidor (por exemplo, por queda de conexão ou fechamento da página).`),
        h('p', {}, 'Deseja recuperá-las? Elas serão combinadas com a versão atual do servidor e salvas.')],
      botoes: [{ rotulo: 'Descartar', valor: 'descartar', perigo: true }, { rotulo: 'Recuperar', valor: 'recuperar', primario: true }],
    });
    // Sem escolha explícita (Esc ou troca de página), o rascunho é mantido para a próxima abertura.
    if (r && r.valor === 'recuperar') { current = s.recuperarRascunho(); RG.toast('Alterações recuperadas; salvando…'); }
    if (r && r.valor === 'descartar') s.descartarRascunho();
  }

  function eventosSessao() {
    return {
      aoEstado: (estado, detalhe) => { if (sessao) setSaveState(estado, detalhe); },
      aoMeta: (meta, info) => {
        if (!sessao) return;
        desenharFaixa();
        updateBadges();
        if (info && info.edicaoMudou) {
          RG.toast(sessao.podeEditar() ? 'O relatório foi liberado para edição.' : `Edição bloqueada: ${sessao.motivoBloqueio()}`);
          setSaveState(sessao.podeEditar() ? 'salvo' : 'bloqueado');
          rerenderSecao();
        } else if (RG.editor.CONTEUDO.includes(secAtual)) {
          const marca = JSON.stringify((meta.secoes || {})[secAtual] || null);
          if (marca !== ultimaMarca) rerenderSecao();
        }
        ultimaMarca = JSON.stringify((meta.secoes || {})[secAtual] || null);
      },
      aoRemoto: (r) => {
        if (!sessao) return;
        current = sessao.dados;
        rerenderSecao();
        if (r.conflitos && r.conflitos.length) {
          const campos = r.conflitos.slice(0, 3).map((p) => RG.diff.rotuloCurto(p)).join('; ');
          RG.toast(`${r.autor} alterou ao mesmo tempo os mesmos campos (${campos}${r.conflitos.length > 3 ? '…' : ''}). Prevaleceu a sua versão; a dele(a) ficou no histórico.`, 'erro');
        } else {
          RG.toast(`${r.autor} salvou alterações neste relatório${r.mesclado ? '; elas foram combinadas com as suas' : ''}.`);
        }
      },
      aoPresenca: (lista) => { presentes = lista; desenharPresenca(); },
      aoErro: (msg) => {
        RG.toast(msg, 'erro');
        if (/acesso/.test(msg)) { fecharSessao(); location.hash = '#/'; }
      },
    };
  }
  let ultimaMarca = null;

  function desenharPresenca() {
    const el = document.getElementById('presenca');
    if (!el) return;
    el.innerHTML = '';
    if (!presentes.length) return;
    const nomes = Object.fromEntries(RG.editor.SECTIONS.map((s) => [s.id, s.nav]));
    el.append(h('span', { class: 'presenca-rot' }, 'Também aqui:'),
      ...presentes.map((p) => h('span', { class: 'avatar', title: `${p.nome}${p.secao ? ' – ' + (nomes[p.secao] || p.secao) : ''}` }, RG.acesso.iniciais(p.nome))));
  }

  const nomeSecao = (id) => (RG.editor.SECTIONS.find((s) => s.id === id) || {}).nav || id;

  async function marcarSecao(sec, concluir) {
    try {
      await sessao.marcarSecao(sec, concluir);
      RG.toast(concluir ? `Seção “${nomeSecao(sec)}” concluída.` : 'Seção desmarcada.');
    } catch (e) { RG.toast(e.message, 'erro'); }
    ultimaMarca = JSON.stringify((sessao.meta.secoes || {})[secAtual] || null);
    rerenderSecao();
    desenharFaixa();
  }

  async function acao(fn, sucesso) {
    try {
      await fn();
      if (sucesso) RG.toast(sucesso);
    } catch (e) { RG.toast(e.message, 'erro'); }
    desenharFaixa();
    rerenderSecao();
  }

  async function enviar() {
    const issues = RG.builder.validate(current);
    const erros = issues.filter((i) => i.nivel === 'erro');
    if (erros.length) {
      const r = await RG.ui.dialogo({
        titulo: 'Ainda não é possível enviar',
        corpo: [h('p', {}, `Há ${erros.length} erro(s) nas verificações. Corrija-os antes de enviar ao contador:`),
          h('ul', {}, erros.slice(0, 12).map((e) => h('li', {}, `${nomeSecao(e.secao)}: ${e.msg}`)))],
        botoes: [{ rotulo: 'Fechar', valor: null }, { rotulo: 'Abrir Verificações', valor: 'checks', primario: true }],
      });
      if (r && r.valor === 'checks') location.hash = `#/r/${current.id}/checks`;
      return;
    }
    const pendentes = N.SECOES.filter((s) => !(sessao.meta.secoes || {})[s]);
    const alertas = issues.filter((i) => i.nivel === 'alerta').length;
    const msgs = ['Enviar o relatório ao contador responsável para análise?',
      'Depois do envio, o relatório fica somente para leitura até o contador devolvê-lo para ajustes, ou até você cancelar o envio.'];
    if (alertas) msgs.push(`Há ${alertas} alerta(s) nas verificações. Eles não impedem o envio, mas convém revisá-los.`);
    if (pendentes.length) msgs.push(`Estas seções ainda não foram marcadas como concluídas e serão marcadas agora: ${pendentes.map(nomeSecao).join(', ')}.`);
    if (!(await RG.ui.confirmar(msgs, { titulo: 'Enviar ao contador', ok: 'Enviar' }))) return;
    await acao(() => sessao.enviar(true), 'Relatório enviado ao contador.');
  }

  async function devolver() {
    const motivo = await RG.ui.perguntar('Devolver para ajustes', 'O que o gerente deve ajustar?', {
      multilinha: true, obrigatorio: true, ok: 'Devolver', texto: 'O motivo fica visível para o gerente e registrado no histórico.',
    });
    if (motivo) await acao(() => sessao.devolver(motivo), 'Relatório devolvido ao gerente para ajustes.');
  }

  async function aprovar() {
    const erros = RG.builder.validate(current).filter((i) => i.nivel === 'erro').length;
    const msgs = ['Aprovar o relatório? Ele ficará bloqueado para edição (pode ser reaberto depois) e uma versão de aprovação será gravada.'];
    if (erros) msgs.push(`Atenção: há ${erros} erro(s) nas verificações.`);
    if (await RG.ui.confirmar(msgs, { titulo: 'Aprovar relatório', ok: 'Aprovar' })) await acao(() => sessao.aprovar(), 'Relatório aprovado.');
  }

  async function reabrir() {
    if (await RG.ui.confirmar('Reabrir o relatório para edição? A situação volta para “Em preenchimento”.', { ok: 'Reabrir' })) {
      await acao(() => sessao.reabrir(), 'Relatório reaberto para edição.');
    }
  }

  async function cancelarEnvio() {
    if (await RG.ui.confirmar('Cancelar o envio? O relatório volta para “Em preenchimento” e você poderá editá-lo de novo.', { ok: 'Cancelar envio', cancelar: 'Voltar' })) {
      await acao(() => sessao.cancelarEnvio(), 'Envio cancelado. O relatório voltou para edição.');
    }
  }

  async function alterarPrazo() {
    const v = await RG.ui.perguntar('Prazo para envio', 'Data limite para o gerente enviar o relatório', { tipo: 'date', valor: sessao.meta.prazo || '' });
    if (v !== null) await acao(() => sessao.prazo(v || null), v ? `Prazo definido: ${U.dateBR(v)}.` : 'Prazo removido.');
  }

  /** Faixa abaixo da barra superior: situação, progresso, prazo e botões do fluxo de envio e aprovação. */
  function desenharFaixa() {
    const el = document.getElementById('faixa');
    if (!el || !sessao) return;
    const m = sessao.meta;
    const master = N.ehMaster();
    const gerente = (m.gerentes || []).includes(N.usuario().uid);
    const editavel = N.STATUS_EDITAVEL.includes(m.status);
    const botoes = [];
    const b = (rotulo, fn, cls) => h('button', { type: 'button', class: 'btn small ' + (cls || ''), onclick: fn }, rotulo);
    if (!m.arquivado) {
      if (gerente && editavel) botoes.push(b('Enviar ao contador', enviar, 'primary'));
      if (gerente && m.status === 'enviado') botoes.push(b('Cancelar envio', cancelarEnvio));
      if (master && m.status === 'enviado') botoes.push(b('Devolver para ajustes', devolver));
      if (master && m.status !== 'aprovado') botoes.push(b('Aprovar', aprovar, 'primary'));
      if (master && m.status === 'aprovado') botoes.push(b('Reabrir para edição', reabrir));
      if (master) botoes.push(b('Prazo', alterarPrazo));
    }
    const info = [];
    if (m.status === 'enviado' && m.enviadoEm) info.push(`Enviado ${RG.ui.relativo(m.enviadoEm)} por ${m.enviadoPorNome || '—'}`);
    if (m.status === 'aprovado' && m.aprovadoEm) info.push(`Aprovado em ${RG.ui.dataHora(m.aprovadoEm)} por ${m.aprovadoPorNome || '—'}`);
    if (m.prazo) info.push(`Prazo: ${RG.ui.textoPrazo(m)}`);
    el.innerHTML = '';
    el.append(
      h('div', { class: 'faixa-info' },
        RG.ui.selo(m.status), N.atrasado(m) ? RG.ui.seloAtraso() : null, m.arquivado ? h('span', { class: 'selo' }, 'Arquivado') : null,
        RG.ui.barraSecoes(m), h('span', { class: 'help' }, info.join(' · '))),
      h('div', { class: 'faixa-acoes' }, botoes));
    if (m.status === 'devolvido' && m.motivoDevolucao) {
      el.append(h('div', { class: 'faixa-motivo' }, h('strong', {}, `Devolvido por ${m.devolvidoPorNome || 'contador'}${m.devolvidoEm ? ' em ' + RG.ui.dataHora(m.devolvidoEm) : ''}: `), m.motivoDevolucao));
    }
  }

  // ---------- Início ----------

  window.addEventListener('beforeunload', (e) => {
    if (ONLINE) {
      if (sessao && sessao.sujo) { sessao.salvar().catch(() => {}); e.preventDefault(); e.returnValue = ''; }
      return;
    }
    if (current && dirty) RG.storage.save(current);
  });

  if (ONLINE) {
    document.body.classList.add('online');
    RG.editor.SECTIONS.push({ id: 'historico', nav: 'Histórico' });
    $app.append(h('div', { class: 'acesso' }, RG.ui.carregando('Carregando…')));
    N.iniciar().then(() => {
      N.aoMudarUsuario(() => route());
      window.addEventListener('hashchange', route);
      route();
    }).catch((e) => {
      console.error(e);
      $app.innerHTML = '';
      $app.append(h('div', { class: 'acesso' }, h('div', { class: 'acesso-card' },
        h('h1', {}, 'Não foi possível conectar'),
        h('p', {}, e.message || String(e)),
        h('p', { class: 'help' }, 'Verifique a conexão com a internet e a configuração em js/config.js.'),
        h('p', {}, h('a', { href: location.pathname + '?modo=local' }, 'Usar o modo local (sem login)')))));
    });
  } else {
    window.addEventListener('hashchange', route);
    setupNewDialog();
    route();
  }
})(window.RG = window.RG || {});
