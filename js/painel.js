/*
 * Modo online: página inicial (relatórios por exercício) e painel de acompanhamento do preenchimento.
 * O contador (master) vê todas as UGs; o gerente de GAF vê só as UGs a que está vinculado
 * (a restrição é aplicada pelo servidor, nas regras do Firestore).
 */
(function (RG) {
  'use strict';
  const h = RG.h;
  const U = RG.util;
  const S = RG.schema;
  const N = RG.nuvem;
  const UI = RG.ui;

  const PREF_EXERCICIO = 'online-exercicio';
  const ORDEM_STATUS = { devolvido: 0, nao_iniciado: 1, em_preenchimento: 2, enviado: 3, aprovado: 4 };

  // ---------- Dados compartilhados pelas páginas ----------

  function assinarDados(aoMudar) {
    const est = { relatorios: null, ugs: null, usuarios: null, config: null, erro: null };
    const avisar = () => aoMudar(est);
    const falha = (m) => { est.erro = m; avisar(); };
    const paradas = [
      N.assinarRelatorios((l) => { est.relatorios = l; avisar(); }, falha),
      N.assinarUGs((l) => { est.ugs = l; avisar(); }, falha),
    ];
    if (N.ehMaster()) paradas.push(N.assinarUsuarios((l) => { est.usuarios = l; avisar(); }, falha));
    else est.usuarios = [];
    N.lerConfig().then((c) => { est.config = c || {}; avisar(); });
    return () => paradas.forEach((p) => p());
  }

  const pronto = (est) => est.relatorios && est.ugs && est.usuarios && est.config;

  function exerciciosDisponiveis(est) {
    const anos = new Set(est.relatorios.map((r) => r.exercicio));
    anos.add(new Date().getFullYear() - 1);
    return [...anos].sort((a, b) => b - a);
  }

  function exercicioInicial(est) {
    const anos = exerciciosDisponiveis(est);
    const pref = +RG.storage.getPref(PREF_EXERCICIO, 0);
    if (pref && anos.includes(pref)) return pref;
    const comRelatorio = est.relatorios.map((r) => r.exercicio);
    return comRelatorio.length ? Math.max(...comRelatorio) : anos[0];
  }

  function seletorExercicio(aoMudar) {
    const sel = h('select', { 'aria-label': 'Exercício', onchange: (e) => { RG.storage.setPref(PREF_EXERCICIO, +e.target.value); aoMudar(+e.target.value); } });
    sel.atualizar = (anos, atual) => {
      sel.innerHTML = '';
      anos.forEach((a) => sel.append(h('option', { value: a, selected: a === atual || null }, a)));
    };
    return sel;
  }

  const rotuloUG = (u) => (u.sigla ? `${u.sigla} – ${u.nome}` : u.nome);
  const tituloRel = (m) => (m.ugSigla ? `${m.ugSigla} – ${m.ugNome}` : m.ugNome);
  const nomesGerentes = (m) => (m.gerentesNomes || []).map((g) => g.nome).join(', ');

  function pendencias(m) {
    const p = m.progresso;
    if (!p) return h('span', { class: 'help' }, '—');
    return h('span', { class: 'pend-txt' },
      p.erros ? h('span', { class: 'n-erro' }, `${p.erros} erro${p.erros > 1 ? 's' : ''}`) : null,
      p.erros && p.alertas ? ' · ' : null,
      p.alertas ? h('span', { class: 'n-alerta' }, `${p.alertas} alerta${p.alertas > 1 ? 's' : ''}`) : null,
      !p.erros && !p.alertas ? h('span', { class: 'n-ok' }, 'sem pendências') : null);
  }

  function ultimaEdicao(m) {
    return m.editadoEm ? `${UI.relativo(m.editadoEm)} por ${m.editadoPorNome || '—'}` : 'ainda não editado';
  }

  // ---------- Criação de relatórios (master) ----------

  /** Relatório novo com os textos-padrão, já preenchido com os dados cadastrados da UG. */
  function novoDaUG(ug, exercicio, cfg) {
    const r = S.newReport({
      tipo: ug.tipoEntidade || 'direta', consolidado: !!ug.consolidado, uf: cfg.uf || 'MS',
      municipio: cfg.municipio || '', denominacao: ug.nome, exercicio,
    });
    r.identificacao.sigla = ug.sigla || '';
    if (ug.cnpj) r.identificacao.cnpj = ug.cnpj;
    if (ug.ordenadorNome) {
      r.declaracao.nome = ug.ordenadorNome;
      r.declaracao.cargo = ug.ordenadorCargo || '';
      const ord = r.s1.responsaveis.find((x) => /ordenador/i.test(x.cargo));
      if (ord) ord.nome = ug.ordenadorNome;
    }
    if (cfg.logo) r.config.logo = cfg.logo;
    if (cfg.entidade && !['direta', 'camara'].includes(ug.tipoEntidade)) r.config.orgaoSuperior = cfg.entidade;
    return r;
  }

  async function montarDados(ug, exercicio, origem, cfg, arquivo) {
    if (origem === 'anterior') {
      const ant = await N.lerConteudo(`${ug.id}_${exercicio - 1}`);
      if (!ant) throw new Error(`Não há relatório de ${exercicio - 1} para ${rotuloUG(ug)}.`);
      return S.duplicateForNextYear(ant);
    }
    if (origem === 'arquivo') {
      if (!arquivo) throw new Error('Selecione o arquivo .json.');
      const r = await RG.storage.importJSON(arquivo);
      if (+r.config.exercicio !== +exercicio) throw new Error(`O arquivo é do exercício ${r.config.exercicio}. Escolha esse exercício ou outro arquivo.`);
      return r;
    }
    return novoDaUG(ug, exercicio, cfg);
  }

  async function dialogoNovo(est, exercicio, ugInicial) {
    const ugs = est.ugs.filter((u) => u.ativo);
    if (!ugs.length) { RG.toast('Cadastre antes as unidades gestoras (menu UGs).', 'erro'); return; }
    const selUG = h('select', { name: 'ug', required: true },
      h('option', { value: '' }, 'Selecione a UG…'),
      ugs.map((u) => h('option', { value: u.id, selected: u.id === ugInicial || null }, rotuloUG(u))));
    const ex = h('input', { name: 'exercicio', type: 'number', min: 2000, max: 2100, required: true, value: exercicio });
    const prazo = h('input', { name: 'prazo', type: 'date', value: est.config.prazoPadrao || '' });
    const arquivo = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    const opcao = (valor, rotulo, ajuda) => h('label', { class: 'radio' },
      h('input', { type: 'radio', name: 'origem', value: valor, checked: valor === 'padrao' || null, onchange: () => { arquivo.hidden = valor !== 'arquivo'; } }),
      h('span', {}, h('strong', {}, rotulo), ajuda ? h('small', {}, ajuda) : null));
    const radAnterior = opcao('anterior', 'Copiar do relatório do exercício anterior', 'Mantém cadastros e textos, zera os valores e leva o saldo final de Restos a Pagar para o saldo inicial.');
    const info = h('p', { class: 'help' });
    const aviso = h('div', { class: 'notice warn', hidden: true });
    let dlgNovo = null;
    const desenharAviso = () => {
      aviso.innerHTML = '';
      const existe = selUG.value && est.relatorios.find((x) => x.ugId === selUG.value && x.exercicio === +ex.value);
      aviso.hidden = !existe;
      if (!existe) return;
      const b = (rotulo, fn, cls) => h('button', { type: 'button', class: 'btn small ' + (cls || ''), onclick: fn }, rotulo);
      if (existe.arquivado) {
        aviso.append(h('p', {}, `Já existe relatório desta UG para ${ex.value}, ${existe.excluindo ? 'com a exclusão incompleta' : 'mas ele está arquivado'}. Só pode haver um relatório por UG e exercício.`),
          h('div', { class: 'table-actions' },
            existe.excluindo ? null : b('Desarquivar e abrir', async () => {
              try { await N.arquivar(existe, false); dlgNovo.close(); location.hash = `#/r/${existe.id}/capa`; } catch (e) { RG.toast(e.message, 'erro'); }
            }),
            b(existe.excluindo ? 'Concluir a exclusão' : 'Excluir o arquivado e criar um novo', async () => {
              if (await excluir(existe)) { desenharAviso(); setTimeout(desenharAviso, 800); }
            }, 'danger')));
      } else {
        aviso.append(h('p', {}, `Já existe relatório desta UG para ${ex.value} (${N.STATUS[existe.status] || existe.status}).`),
          h('div', { class: 'table-actions' }, b('Abrir o relatório existente', () => { dlgNovo.close(); location.hash = `#/r/${existe.id}/capa`; })));
      }
    };
    const atualizar = () => {
      desenharAviso();
      const tem = selUG.value && est.relatorios.some((r) => r.ugId === selUG.value && r.exercicio === +ex.value - 1);
      const inp = radAnterior.querySelector('input');
      inp.disabled = !tem;
      if (!tem && inp.checked) { radAnterior.parentNode.querySelector('input[value=padrao]').checked = true; }
      info.textContent = selUG.value ? (tem ? `Há relatório de ${+ex.value - 1} desta UG: recomenda-se copiá-lo.` : `Não há relatório de ${+ex.value - 1} desta UG para copiar.`) : '';
    };
    selUG.addEventListener('change', atualizar);
    ex.addEventListener('input', atualizar);
    const r = await UI.dialogo({
      titulo: 'Novo relatório',
      corpo: [
        h('label', { class: 'field full' }, h('span', { class: 'lbl' }, 'Unidade gestora'), selUG),
        h('div', { class: 'grid' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Exercício'), ex),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Prazo para o gerente enviar'), prazo)),
        h('fieldset', { class: 'opcoes' }, h('legend', {}, 'Conteúdo inicial'),
          opcao('padrao', 'Textos-padrão', 'Já preenchido com nome, sigla, CNPJ e ordenador cadastrados na UG.'),
          radAnterior,
          opcao('arquivo', 'Importar arquivo .json', 'Relatório preenchido no modo local e exportado pelo botão “Exportar dados”.'),
          arquivo),
        aviso,
        info,
      ],
      botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Criar relatório', valor: true, primario: true, enviar: true }],
      aoAbrir: (form, dlg) => { dlgNovo = dlg; atualizar(); },
      validar: async (d) => {
        const ug = ugs.find((u) => u.id === d.ug);
        const exercicioN = +d.exercicio;
        const existe = est.relatorios.find((x) => x.ugId === ug.id && x.exercicio === exercicioN);
        if (existe) { desenharAviso(); return `Já existe relatório de ${rotuloUG(ug)} para ${exercicioN}${existe.arquivado ? ' (arquivado)' : ''}. Use as opções do aviso acima.`; }
        try {
          const dados = await montarDados(ug, exercicioN, d.origem, est.config, arquivo.files[0]);
          await N.criarRelatorio(ug, exercicioN, dados, d.origem, d.prazo || null);
        } catch (e) { return e.message; }
        return null;
      },
    });
    if (r) RG.toast('Relatório criado. O gerente de GAF vinculado à UG já pode preenchê-lo.');
  }

  async function dialogoLote(est, exercicio) {
    const ex = h('input', { name: 'exercicio', type: 'number', min: 2000, max: 2100, required: true, value: exercicio });
    const prazo = h('input', { name: 'prazo', type: 'date', value: est.config.prazoPadrao || '' });
    const copiar = h('input', { type: 'checkbox', name: 'copiar', checked: true });
    const lista = h('div', { class: 'lista-checks' });
    const progresso = h('p', { class: 'help', 'aria-live': 'polite' });
    const desenhar = () => {
      lista.innerHTML = '';
      const sem = est.ugs.filter((u) => u.ativo && !est.relatorios.some((r) => r.ugId === u.id && r.exercicio === +ex.value));
      if (!sem.length) { lista.append(h('p', { class: 'help' }, `Todas as UGs ativas já têm relatório de ${ex.value}.`)); return; }
      sem.forEach((u) => lista.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'ugs', value: u.id, checked: true }),
        h('span', {}, rotuloUG(u), u.gerentes && u.gerentes.length ? '' : h('small', { class: 'aviso-inline' }, ' (sem gerente vinculado)')))));
    };
    ex.addEventListener('input', desenhar);
    const r = await UI.dialogo({
      titulo: 'Criar relatórios do exercício',
      largo: true,
      corpo: [
        h('p', { class: 'help' }, 'Cria de uma só vez o relatório das UGs selecionadas. Cada relatório fica disponível para o gerente de GAF vinculado à UG.'),
        h('div', { class: 'grid' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Exercício'), ex),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Prazo para envio'), prazo)),
        h('label', { class: 'check' }, copiar, h('span', {}, 'Copiar do relatório do exercício anterior, quando existir (senão, usa os textos-padrão)')),
        h('div', { class: 'field full' }, h('span', { class: 'lbl' }, 'Unidades gestoras sem relatório no exercício'), lista),
        progresso,
      ],
      botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Criar relatórios', valor: true, primario: true, enviar: true }],
      aoAbrir: desenhar,
      validar: async (d, form) => {
        const ids = [...form.querySelectorAll('input[name=ugs]:checked')].map((i) => i.value);
        if (!ids.length) return 'Selecione ao menos uma UG.';
        const exercicioN = +d.exercicio;
        const falhas = [];
        let feitos = 0;
        for (const id of ids) {
          const ug = est.ugs.find((u) => u.id === id);
          progresso.textContent = `Criando ${feitos + 1} de ${ids.length}: ${rotuloUG(ug)}…`;
          try {
            const temAnterior = est.relatorios.some((x) => x.ugId === id && x.exercicio === exercicioN - 1);
            const origem = copiar.checked && temAnterior ? 'anterior' : 'padrao';
            await N.criarRelatorio(ug, exercicioN, await montarDados(ug, exercicioN, origem, est.config), origem, d.prazo || null);
            feitos++;
          } catch (e) { falhas.push(`${rotuloUG(ug)}: ${e.message}`); }
        }
        progresso.textContent = '';
        if (falhas.length) return `${feitos} relatório(s) criado(s). Falhas: ${falhas.join(' | ')}`;
        RG.toast(`${feitos} relatório(s) de ${exercicioN} criado(s).`);
        return null;
      },
    });
    return r;
  }

  async function alterarPrazo(m) {
    const v = await UI.perguntar('Prazo para envio', 'Data limite para o gerente enviar o relatório ao contador', { tipo: 'date', valor: m.prazo || '', texto: tituloRel(m) });
    if (v === null) return;
    try { await N.definirPrazo(m, v || null); RG.toast(v ? `Prazo definido: ${U.dateBR(v)}.` : 'Prazo removido.'); } catch (e) { RG.toast(e.message, 'erro'); }
  }

  async function arquivar(m) {
    const ok = await UI.confirmar(m.arquivado
      ? `Desarquivar o relatório ${tituloRel(m)} – ${m.exercicio}? Ele volta à lista principal, ao acompanhamento e ao gerente de GAF.`
      : `Arquivar o relatório ${tituloRel(m)} – ${m.exercicio}? Ele sai da lista principal, do acompanhamento e da tela do gerente, e fica na seção “Arquivados”, de onde pode ser desarquivado ou excluído. O conteúdo, o histórico e as versões são preservados.`,
    { ok: m.arquivado ? 'Desarquivar' : 'Arquivar' });
    if (!ok) return;
    try {
      await N.arquivar(m, !m.arquivado);
      RG.toast(m.arquivado ? 'Relatório desarquivado.' : 'Relatório arquivado. Ele está na seção “Arquivados”, no fim da página.');
    } catch (e) { RG.toast(e.message, 'erro'); }
  }

  /** Baixa a cópia de segurança (conteúdo e histórico) antes da exclusão definitiva. */
  function baixarCopia(m, copia) {
    const nome = `RelatorioGestao_${U.slug(m.ugSigla || m.ugNome) || 'relatorio'}_${m.exercicio}_copia_antes_da_exclusao_${U.todayISO()}.json`;
    const controle = {
      ugNome: m.ugNome, ugSigla: m.ugSigla, exercicio: m.exercicio, status: m.status, rev: m.rev,
      criadoEm: m.criadoEm, criadoPorNome: m.criadoPorNome, editadoEm: m.editadoEm, editadoPorNome: m.editadoPorNome,
    };
    const conteudo = {
      formato: 'relatorio-gestao-anexo2', versao: copia.conteudo ? copia.conteudo.schema : null, relatorio: copia.conteudo,
      controle, historico: copia.historico, excluidoEm: new Date().toISOString(), excluidoPor: N.usuario().nome,
    };
    RG.download(new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' }), nome);
  }

  /** Exclusão definitiva, só para o contador (master) e confirmada com a senha dele. Resolve true se excluiu. */
  async function excluir(m) {
    if (!N.ehMaster()) { RG.toast('Somente o contador (master) pode excluir relatórios.', 'erro'); return false; }
    const senha = h('input', { type: 'password', name: 'senha', required: true, autocomplete: 'current-password' });
    const progresso = h('p', { class: 'help', 'aria-live': 'polite' });
    const r = await UI.dialogo({
      titulo: 'Excluir relatório definitivamente',
      corpo: [
        h('p', {}, h('strong', {}, `${tituloRel(m)} – ${m.exercicio}`), ` · ${N.STATUS[m.status] || m.status}`),
        h('div', { class: 'notice warn' }, 'O relatório será apagado do servidor, com o conteúdo, o histórico e todas as versões, e não poderá ser recuperado pela plataforma. Para apenas tirá-lo da lista, use “Arquivar”.'),
        h('p', { class: 'help' }, 'Antes de apagar, o sistema baixa para este computador uma cópia (.json) com o conteúdo e o histórico. A exclusão fica registrada no log de auditoria.'),
        h('label', { class: 'field full' }, h('span', { class: 'lbl' }, 'Para confirmar, digite a sua senha de contador (master)'), senha),
        progresso,
      ],
      botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Excluir definitivamente', valor: true, perigo: true, enviar: true }],
      aoAbrir: () => senha.focus(),
      validar: async () => {
        try {
          await N.excluirRelatorio(m, senha.value, { aoCopia: (c) => baixarCopia(m, c), aoProgresso: (t) => { progresso.textContent = t; } });
        } catch (e) { progresso.textContent = ''; return e.message; }
        return null;
      },
    });
    if (r) RG.toast(`Relatório ${tituloRel(m)} – ${m.exercicio} excluído. A cópia de segurança foi baixada.`);
    return !!r;
  }

  // ---------- Página inicial: relatórios ----------

  function cartao(m, master) {
    const prazo = UI.textoPrazo(m);
    return h('article', { class: 'rep-card' + (m.arquivado ? ' arquivado' : '') },
      h('div', { class: 'rep-main' },
        h('div', { class: 'rep-tipo' }, `${S.TIPOS[m.tipoEntidade] || ''} · Exercício ${m.exercicio}`),
        h('a', { class: 'rep-nome', href: `#/r/${m.id}/capa` }, tituloRel(m)),
        h('div', { class: 'rep-meta' },
          m.ordenadorNome ? `Ordenador: ${m.ordenadorNome}` : 'Ordenador não informado',
          ` · Gerente(s) de GAF: ${nomesGerentes(m) || 'nenhum vinculado'}`),
        h('div', { class: 'rep-situacao' }, UI.selo(m.status), N.atrasado(m) ? UI.seloAtraso() : null,
          m.excluindo ? h('span', { class: 'selo atraso' }, 'Exclusão incompleta') : m.arquivado ? h('span', { class: 'selo' }, 'Arquivado') : null,
          UI.barraSecoes(m, true), pendencias(m)),
        h('div', { class: 'rep-meta' }, `Última edição: ${ultimaEdicao(m)}`, prazo ? ` · Prazo: ${prazo}` : '')),
      h('div', { class: 'rep-actions' },
        h('a', { class: 'btn primary small', href: `#/r/${m.id}/capa` }, 'Abrir'),
        m.excluindo ? null : h('a', { class: 'btn small', href: `#/r/${m.id}/historico` }, 'Histórico'),
        master && !m.arquivado ? h('button', { type: 'button', class: 'btn small', onclick: () => alterarPrazo(m) }, 'Prazo') : null,
        master && !m.excluindo ? h('button', { type: 'button', class: 'btn small', onclick: () => arquivar(m) }, m.arquivado ? 'Desarquivar' : 'Arquivar') : null,
        master ? h('button', { type: 'button', class: 'btn small danger', onclick: () => excluir(m) }, m.excluindo ? 'Concluir exclusão' : 'Excluir') : null));
  }

  function renderRelatorios($app) {
    document.title = 'Relatórios – Relatório de Gestão';
    const master = N.ehMaster();
    let est = null, exercicio = null;
    const selEx = seletorExercicio((v) => { exercicio = v; desenhar(); });
    const corpo = h('div', {}, UI.carregando());
    $app.innerHTML = '';
    $app.append(RG.acesso.topo('relatorios'), h('main', { class: 'pagina' },
      h('div', { class: 'pag-cab' },
        h('div', {},
          h('h1', {}, 'Relatórios de gestão'),
          h('p', { class: 'help' }, master
            ? 'Relatórios de todas as unidades gestoras. Crie o relatório de cada UG no exercício; o gerente de GAF vinculado preenche e envia para análise.'
            : 'Relatórios das unidades gestoras a que você está vinculado. Preencha cada seção, marque-a como concluída e envie ao contador.')),
        h('div', { class: 'pag-acoes' },
          h('label', { class: 'inline' }, 'Exercício ', selEx),
          master ? h('button', { type: 'button', class: 'btn primary', onclick: () => (est && pronto(est) ? dialogoNovo(est, exercicio) : RG.toast('Aguarde: carregando os dados…')) }, '+ Novo relatório') : null,
          master ? h('button', { type: 'button', class: 'btn', onclick: () => (est && pronto(est) ? dialogoLote(est, exercicio) : RG.toast('Aguarde: carregando os dados…')) }, 'Criar relatórios em lote') : null)),
      corpo), rodape());

    function desenhar() {
      if (!est) return;
      if (est.erro) { corpo.innerHTML = ''; corpo.append(h('div', { class: 'notice warn' }, est.erro)); return; }
      if (!pronto(est)) return;
      if (exercicio == null) exercicio = exercicioInicial(est);
      selEx.atualizar(exerciciosDisponiveis(est), exercicio);
      const porUG = (a, b) => tituloRel(a).localeCompare(tituloRel(b), 'pt-BR');
      const lista = est.relatorios.filter((m) => m.exercicio === exercicio && !m.arquivado).sort(porUG);
      const arquivados = master ? est.relatorios.filter((m) => m.exercicio === exercicio && m.arquivado).sort(porUG) : [];
      const semRel = est.ugs.filter((u) => u.ativo && !est.relatorios.some((r) => r.ugId === u.id && r.exercicio === exercicio));
      corpo.innerHTML = '';
      corpo.append(h('section', { class: 'rep-list' },
        h('h2', {}, `${master ? 'Relatórios' : 'Meus relatórios'} – ${exercicio}`),
        lista.length ? lista.map((m) => cartao(m, master)) : h('p', { class: 'empty-state' }, master
          ? `Nenhum relatório de ${exercicio}. Use “+ Novo relatório” ou “Criar relatórios em lote”.`
          : est.ugs.length ? `Nenhum relatório de ${exercicio} disponível ainda. O contador responsável cria o relatório de cada UG.` : 'Você ainda não está vinculado a nenhuma unidade gestora. Procure o contador responsável.')));
      if (semRel.length) {
        corpo.append(h('section', { class: 'rep-list' },
          h('h2', {}, `UGs sem relatório em ${exercicio}`),
          h('div', { class: 'chips' }, semRel.map((u) => master
            ? h('button', { type: 'button', class: 'chip', title: 'Criar o relatório desta UG', onclick: () => dialogoNovo(est, exercicio, u.id) }, `+ ${rotuloUG(u)}`)
            : h('span', { class: 'chip' }, `${rotuloUG(u)} – aguardando o contador criar o relatório`)))));
      }
      if (arquivados.length) {
        corpo.append(h('section', { class: 'rep-list arquivados' },
          h('h2', {}, `Arquivados – ${exercicio} (${arquivados.length})`),
          h('p', { class: 'help' }, 'Relatórios arquivados não aparecem para os gerentes nem no acompanhamento. Desarquive para voltar a usá-los, ou exclua definitivamente (pede a sua senha).'),
          arquivados.map((m) => cartao(m, master))));
      }
    }

    return assinarDados((e) => { est = e; desenhar(); });
  }

  const rodape = () => h('footer', { class: 'appfoot' }, 'Dados gravados no servidor com histórico de todas as alterações. Use “Exportar dados” no relatório para guardar uma cópia em arquivo.');

  // ---------- Painel de acompanhamento ----------

  function renderAcompanhamento($app) {
    document.title = 'Acompanhamento – Relatório de Gestão';
    const master = N.ehMaster();
    let est = null, exercicio = null;
    const filtro = { status: '', contador: '', busca: '', atrasados: false, ordem: 'situacao' };

    const selEx = seletorExercicio((v) => { exercicio = v; desenhar(); });
    const selStatus = h('select', { 'aria-label': 'Situação', onchange: (e) => { filtro.status = e.target.value; filtro.atrasados = false; chkAtraso.checked = false; desenhar(); } },
      h('option', { value: '' }, 'Todas as situações'), Object.entries(N.STATUS).map(([k, v]) => h('option', { value: k }, v)));
    const selContador = master ? h('select', { 'aria-label': 'Contador responsável', onchange: (e) => { filtro.contador = e.target.value; desenhar(); } }) : null;
    const busca = h('input', { type: 'search', placeholder: 'Buscar UG, ordenador ou gerente…', 'aria-label': 'Buscar', oninput: U.debounce((e) => { filtro.busca = e.target.value.trim().toLowerCase(); desenhar(); }, 200) });
    const chkAtraso = h('input', { type: 'checkbox', onchange: (e) => { filtro.atrasados = e.target.checked; desenhar(); } });
    const selOrdem = h('select', { 'aria-label': 'Ordenar por', onchange: (e) => { filtro.ordem = e.target.value; desenhar(); } },
      h('option', { value: 'situacao' }, 'Ordenar: situação'), h('option', { value: 'ug' }, 'Ordenar: UG'),
      h('option', { value: 'progresso' }, 'Ordenar: progresso'), h('option', { value: 'edicao' }, 'Ordenar: última edição'));

    const blocos = h('div', { class: 'blocos' });
    const geral = h('div', { class: 'geral' });
    const tabela = h('div', {}, UI.carregando());
    const extras = h('div', {});
    const atualizadoEm = h('span', { class: 'help ao-vivo' });

    $app.innerHTML = '';
    $app.append(RG.acesso.topo('acompanhamento'), h('main', { class: 'pagina larga' },
      h('div', { class: 'pag-cab' },
        h('div', {},
          h('h1', {}, 'Acompanhamento do preenchimento'),
          h('p', { class: 'help' }, master
            ? 'Situação de todos os relatórios do exercício, atualizada em tempo real: quem já começou, o que falta e o que está atrasado.'
            : 'Situação dos relatórios das UGs a que você está vinculado, atualizada em tempo real.')),
        h('div', { class: 'pag-acoes' },
          h('label', { class: 'inline' }, 'Exercício ', selEx),
          h('button', { type: 'button', class: 'btn', onclick: exportar }, 'Exportar planilha (CSV)'))),
      blocos, geral,
      h('div', { class: 'filtros' }, selStatus, selContador, busca, h('label', { class: 'check' }, chkAtraso, h('span', {}, 'Somente atrasados')), selOrdem, atualizadoEm),
      tabela, extras), rodape());

    let visiveis = [];

    function filtrar(lista) {
      return lista.filter((m) => (!filtro.status || m.status === filtro.status)
        && (!filtro.contador || m.contadorUid === filtro.contador)
        && (!filtro.atrasados || N.atrasado(m))
        && (!filtro.busca || [m.ugNome, m.ugSigla, m.ordenadorNome, nomesGerentes(m), m.contadorNome].join(' ').toLowerCase().includes(filtro.busca)));
    }

    function ordenar(lista) {
      const porUG = (a, b) => tituloRel(a).localeCompare(tituloRel(b), 'pt-BR');
      const cmp = {
        ug: porUG,
        situacao: (a, b) => (N.atrasado(b) - N.atrasado(a)) || (ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]) || porUG(a, b),
        progresso: (a, b) => ((a.progresso || {}).concluidas || 0) - ((b.progresso || {}).concluidas || 0) || porUG(a, b),
        edicao: (a, b) => (b.editadoEm ? +new Date(b.editadoEm) : 0) - (a.editadoEm ? +new Date(a.editadoEm) : 0) || porUG(a, b),
      }[filtro.ordem];
      return lista.slice().sort(cmp);
    }

    function bloco(rotulo, n, classe, ativo, aoClicar) {
      return h('button', { type: 'button', class: `bloco-n ${classe}${ativo ? ' ativo' : ''}`, onclick: aoClicar, 'aria-pressed': ativo ? 'true' : 'false' },
        h('span', { class: 'bloco-num' }, String(n)), h('span', { class: 'bloco-rot' }, rotulo));
    }

    function desenhar() {
      if (!est) return;
      if (est.erro) { tabela.innerHTML = ''; tabela.append(h('div', { class: 'notice warn' }, est.erro)); return; }
      if (!pronto(est)) return;
      if (exercicio == null) exercicio = exercicioInicial(est);
      selEx.atualizar(exerciciosDisponiveis(est), exercicio);
      if (selContador && est.usuarios) {
        const atual = filtro.contador;
        selContador.innerHTML = '';
        selContador.append(h('option', { value: '' }, 'Todos os contadores'),
          ...est.usuarios.filter((u) => u.perfil === 'master').map((u) => h('option', { value: u.uid, selected: u.uid === atual || null }, `Contador: ${u.nome}`)));
      }
      const doAno = est.relatorios.filter((m) => m.exercicio === exercicio && !m.arquivado);
      const conta = (st) => doAno.filter((m) => m.status === st).length;
      const atrasados = doAno.filter(N.atrasado).length;
      const escolher = (st) => () => { filtro.status = filtro.status === st ? '' : st; filtro.atrasados = false; selStatus.value = filtro.status; chkAtraso.checked = false; desenhar(); };
      blocos.innerHTML = '';
      blocos.append(
        bloco('Relatórios', doAno.length, 'total', !filtro.status && !filtro.atrasados, () => { filtro.status = ''; filtro.atrasados = false; selStatus.value = ''; chkAtraso.checked = false; desenhar(); }),
        ...Object.keys(N.STATUS).map((st) => bloco(N.STATUS[st], conta(st), 'st-' + st, filtro.status === st, escolher(st))),
        bloco('Atrasados', atrasados, 'atraso', filtro.atrasados, () => { filtro.atrasados = !filtro.atrasados; filtro.status = ''; selStatus.value = ''; chkAtraso.checked = filtro.atrasados; desenhar(); }));

      const totalSec = doAno.length * N.SECOES.length;
      const concl = doAno.reduce((a, m) => a + ((m.progresso && m.progresso.concluidas) || 0), 0);
      const aprovados = conta('aprovado'), enviadosOuAprov = conta('enviado') + aprovados;
      geral.innerHTML = '';
      if (doAno.length) {
        geral.append(
          h('div', { class: 'geral-item' }, h('span', { class: 'lbl' }, 'Seções concluídas (todas as UGs)'), UI.barra(totalSec ? (100 * concl) / totalSec : 0, `${concl} de ${totalSec} · ${totalSec ? Math.round((100 * concl) / totalSec) : 0}%`)),
          h('div', { class: 'geral-item' }, h('span', { class: 'lbl' }, 'Enviados ou aprovados'), UI.barra((100 * enviadosOuAprov) / doAno.length, `${enviadosOuAprov} de ${doAno.length}`)),
          h('div', { class: 'geral-item' }, h('span', { class: 'lbl' }, 'Aprovados pelo contador'), UI.barra((100 * aprovados) / doAno.length, `${aprovados} de ${doAno.length}`)));
      }

      visiveis = ordenar(filtrar(doAno));
      tabela.innerHTML = '';
      if (!doAno.length) {
        tabela.append(h('p', { class: 'empty-state' }, master ? `Nenhum relatório criado para ${exercicio}. Crie-os na página Relatórios.` : `Nenhum relatório de ${exercicio} disponível para você.`));
      } else {
        tabela.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tab-painel' },
          h('thead', {}, h('tr', {},
            ['Unidade gestora', 'Ordenador de despesas', 'Gerente(s) de GAF', master ? 'Contador' : null, 'Situação', 'Seções', 'Pendências', 'Última edição', 'Prazo', '']
              .filter((x) => x !== null).map((t) => h('th', {}, t)))),
          h('tbody', {}, visiveis.length ? visiveis.map((m) => h('tr', { class: N.atrasado(m) ? 'linha-atraso' : null },
            h('td', {}, h('a', { href: `#/r/${m.id}/capa`, class: 'forte' }, m.ugSigla || m.ugNome), m.ugSigla ? h('div', { class: 'help' }, m.ugNome) : null),
            h('td', {}, m.ordenadorNome || '—', m.ordenadorCargo ? h('div', { class: 'help' }, m.ordenadorCargo) : null),
            h('td', {}, nomesGerentes(m) || h('span', { class: 'n-erro' }, 'nenhum vinculado')),
            master ? h('td', {}, m.contadorNome || '—') : null,
            h('td', {}, UI.selo(m.status), N.atrasado(m) ? UI.seloAtraso() : null,
              m.status === 'devolvido' && m.motivoDevolucao ? h('div', { class: 'help', title: m.motivoDevolucao }, `Motivo: ${m.motivoDevolucao.slice(0, 80)}`) : null),
            h('td', {}, UI.barraSecoes(m, true)),
            h('td', {}, pendencias(m)),
            h('td', {}, m.editadoEm ? [UI.relativo(m.editadoEm), h('div', { class: 'help' }, m.editadoPorNome || '')] : h('span', { class: 'help' }, 'não iniciado')),
            h('td', {}, m.prazo ? UI.textoPrazo(m) : h('span', { class: 'help' }, 'sem prazo')),
            h('td', { class: 'acoes' }, h('a', { class: 'btn small', href: `#/r/${m.id}/capa` }, 'Abrir'), h('a', { class: 'btn small', href: `#/r/${m.id}/historico` }, 'Histórico'))))
            : h('tr', {}, h('td', { colspan: 10, class: 'empty' }, 'Nenhum relatório com os filtros escolhidos.'))))));
      }
      atualizadoEm.textContent = `Atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      extras.innerHTML = '';
      if (master) extras.append(painelEquipe(est, doAno, exercicio));
    }

    function exportar() {
      if (!est || !pronto(est)) return;
      const cab = ['Exercício', 'Sigla', 'Unidade gestora', 'Ordenador de despesas', 'Cargo do ordenador', 'Gerente(s) de GAF', 'Contador responsável',
        'Situação', 'Atrasado', 'Seções concluídas', '% concluído', 'Erros', 'Alertas', 'Última edição', 'Editado por', 'Prazo', 'Enviado em', 'Aprovado em'];
      const linhas = visiveis.map((m) => {
        const p = m.progresso || {};
        return [m.exercicio, m.ugSigla, m.ugNome, m.ordenadorNome, m.ordenadorCargo, nomesGerentes(m), m.contadorNome, N.STATUS[m.status],
          N.atrasado(m) ? 'Sim' : 'Não', `${p.concluidas || 0}/${p.total || N.SECOES.length}`, p.pct || 0, p.erros || 0, p.alertas || 0,
          UI.dataHora(m.editadoEm), m.editadoPorNome || '', m.prazo ? U.dateBR(m.prazo) : '', UI.dataHora(m.enviadoEm), UI.dataHora(m.aprovadoEm)];
      });
      UI.baixarCSV(`Acompanhamento_Relatorio_Gestao_${exercicio}.csv`, cab, linhas);
    }

    return assinarDados((e) => { est = e; desenhar(); });
  }

  /** Quadro do contador: cada gerente, suas UGs e o andamento (quem está fazendo ou não). */
  function painelEquipe(est, doAno, exercicio) {
    const gerentes = est.usuarios.filter((u) => u.perfil === 'gerente');
    const linhas = gerentes.map((g) => {
      const ugs = est.ugs.filter((u) => (u.gerentes || []).includes(g.uid));
      const rels = doAno.filter((m) => (m.gerentes || []).includes(g.uid));
      const edicoes = rels.filter((m) => m.editadoPor === g.uid && m.editadoEm).map((m) => +new Date(m.editadoEm));
      const ultima = edicoes.length ? new Date(Math.max(...edicoes)) : null;
      const env = rels.filter((m) => ['enviado', 'aprovado'].includes(m.status)).length;
      const concl = rels.reduce((a, m) => a + ((m.progresso && m.progresso.concluidas) || 0), 0);
      const situacao = !g.ativo ? ['inativo', 'Usuário desativado']
        : !ugs.length ? ['alerta', 'Sem UG vinculada']
          : !g.ultimoAcesso ? ['erro', 'Nunca acessou']
            : !ultima && rels.length ? ['alerta', 'Acessou, mas ainda não editou']
              : rels.length && env === rels.length ? ['ok', 'Concluiu os envios'] : ['and', 'Em andamento'];
      return { g, ugs, rels, ultima, env, concl, situacao };
    });
    const semGerente = est.ugs.filter((u) => u.ativo && !(u.gerentes || []).length);
    return h('section', { class: 'equipe' },
      h('h2', {}, `Equipe – gerentes de GAF (${exercicio})`),
      linhas.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tab-painel' },
        h('thead', {}, h('tr', {}, ['Gerente', 'UGs vinculadas', 'Relatórios', 'Enviados', 'Seções concluídas', 'Último acesso', 'Última edição', 'Situação'].map((t) => h('th', {}, t)))),
        h('tbody', {}, linhas.map((l) => h('tr', {},
          h('td', {}, h('span', { class: 'forte' }, l.g.nome), h('div', { class: 'help' }, l.g.email)),
          h('td', {}, l.ugs.map((u) => u.sigla || u.nome).join(', ') || '—'),
          h('td', {}, String(l.rels.length)),
          h('td', {}, `${l.env} de ${l.rels.length}`),
          h('td', {}, l.rels.length ? `${l.concl} de ${l.rels.length * N.SECOES.length}` : '—'),
          h('td', {}, l.g.ultimoAcesso ? UI.relativo(l.g.ultimoAcesso) : 'nunca'),
          h('td', {}, l.ultima ? UI.relativo(l.ultima) : '—'),
          h('td', {}, h('span', { class: 'selo sit-' + l.situacao[0] }, l.situacao[1]))))))) : h('p', { class: 'empty-state' }, 'Nenhum gerente de GAF cadastrado. Cadastre-os no menu Usuários.'),
      semGerente.length ? h('div', { class: 'notice warn' }, `UGs ativas sem gerente de GAF vinculado: ${semGerente.map(rotuloUG).join('; ')}. Vincule um gerente no menu UGs.`) : null);
  }

  RG.painel = { renderRelatorios, renderAcompanhamento, novoDaUG, excluir, arquivar };
})(window.RG = window.RG || {});
