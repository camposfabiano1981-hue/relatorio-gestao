/*
 * Modo online: histórico do relatório (linha do tempo com as diferenças campo a campo e versões
 * completas, que podem ser visualizadas, comparadas e restauradas) e log de auditoria geral.
 */
(function (RG) {
  'use strict';
  const h = RG.h;
  const U = RG.util;
  const N = RG.nuvem;
  const UI = RG.ui;
  const D = RG.diff;

  const TIPOS_HIST = {
    criacao: ['Criação', 'cria'], edicao: ['Edição', 'edit'], secao_concluida: ['Seção concluída', 'ok'],
    secao_reaberta: ['Seção reaberta', 'neutro'], envio: ['Enviado ao contador', 'envio'], envio_cancelado: ['Envio cancelado', 'neutro'],
    devolucao: ['Devolvido para ajustes', 'alerta'], aprovacao: ['Aprovado', 'ok'], reabertura: ['Reaberto para edição', 'neutro'],
    restauracao: ['Versão restaurada', 'alerta'], importacao: ['Arquivo importado', 'alerta'], prazo: ['Prazo', 'neutro'],
    vinculo: ['Dados da UG', 'neutro'], arquivamento: ['Arquivado', 'alerta'], desarquivamento: ['Desarquivado', 'neutro'],
    exportacao: ['Arquivo gerado', 'neutro'], versao_salva: ['Versão salva', 'neutro'], exclusao: ['Exclusão iniciada', 'alerta'],
  };

  const MOTIVOS_VERSAO = {
    criacao: 'Criação do relatório', automatica: 'Automática (1ª gravação do dia)', manual: 'Salva manualmente',
    envio: 'Envio ao contador', aprovacao: 'Aprovação pelo contador', antes_restauracao: 'Antes de restaurar outra versão',
    antes_importacao: 'Antes de importar arquivo',
  };

  const TIPOS_LOG = {
    instalacao: 'Configuração inicial', login: 'Entrada no sistema', logout: 'Saída do sistema', senha_alterada: 'Senha alterada',
    senha_redefinicao: 'Redefinição de senha', usuario_criado: 'Usuário cadastrado', usuario_alterado: 'Usuário alterado',
    usuario_desativado: 'Usuário desativado', usuario_reativado: 'Usuário reativado', ug_criada: 'UG cadastrada', ug_alterada: 'UG alterada',
    config_alterada: 'Configurações gerais', relatorio_criado: 'Relatório criado', relatorio_enviado: 'Relatório enviado',
    relatorio_envio_cancelado: 'Envio cancelado', relatorio_devolvido: 'Relatório devolvido', relatorio_aprovado: 'Relatório aprovado',
    relatorio_reaberto: 'Relatório reaberto', relatorio_arquivado: 'Relatório arquivado', relatorio_desarquivado: 'Relatório desarquivado',
    relatorio_prazo: 'Prazo do relatório', relatorio_restaurado: 'Versão restaurada', relatorio_importado: 'Arquivo importado',
    relatorio_exportado: 'Arquivo gerado (DOCX/PDF/JSON)', relatorio_excluido: 'Relatório excluído',
  };

  // ---------- Diferenças ----------

  function descricaoOp(op) {
    if (op.resumo) return h('div', { class: 'dif-val' }, op.resumo);
    if (op.txt) {
      const [, saiu, entrou] = op.txt;
      return h('div', { class: 'dif-val' },
        saiu ? h('del', { title: 'Trecho removido' }, D.valorTexto(saiu, 600)) : null,
        saiu && entrou ? ' ' : null,
        entrou ? h('ins', { title: 'Trecho incluído' }, D.valorTexto(entrou, 600)) : null);
    }
    if (op.lin) {
      const [pos, sairam, entraram] = op.lin;
      return h('div', { class: 'dif-val' },
        sairam.map((l, i) => h('div', {}, h('del', {}, `linha ${pos + i + 1}: ${D.valorTexto(l, 300)}`))),
        entraram.map((l, i) => h('div', {}, h('ins', {}, `linha ${pos + i + 1}: ${D.valorTexto(l, 300)}`))));
    }
    const vazio = (v) => v === undefined || v === null || v === '';
    return h('div', { class: 'dif-val' },
      vazio(op.de) ? h('span', { class: 'vazio' }, '(vazio)') : h('del', {}, D.valorTexto(op.de, 400)), ' → ',
      vazio(op.para) ? h('span', { class: 'vazio' }, '(vazio)') : h('ins', {}, D.valorTexto(op.para, 400)));
  }

  function listaOps(ops, truncado) {
    return h('ul', { class: 'difs' },
      ops.map((op) => h('li', {}, h('div', { class: 'dif-campo' }, D.rotulo(op.p)), descricaoOp(op))),
      truncado ? h('li', { class: 'help' }, 'Imagens e valores muito grandes foram omitidos neste registro; o conteúdo completo fica nas versões salvas.') : null);
  }

  function itemHistorico(it) {
    const [rotulo, classe] = TIPOS_HIST[it.tipo] || [it.tipo, 'neutro'];
    const detalhes = h('div', { class: 'tl-detalhes', hidden: true });
    let carregado = false;
    const n = it.qtdAlteracoes || 0;
    const botao = it.alteracoesJSON && n ? h('button', {
      type: 'button', class: 'link',
      onclick: () => {
        if (!carregado) {
          try { detalhes.append(listaOps(JSON.parse(it.alteracoesJSON), it.truncado)); } catch (e) { detalhes.append(h('p', { class: 'help' }, 'Registro ilegível.')); }
          carregado = true;
        }
        detalhes.hidden = !detalhes.hidden;
        botao.textContent = detalhes.hidden ? `Ver ${n} alteração${n > 1 ? 'ões' : ''}` : 'Ocultar alterações';
      },
    }, `Ver ${n} alteração${n > 1 ? 'ões' : ''}`) : null;
    return h('li', { class: 'tl-item tl-' + classe },
      h('div', { class: 'tl-cab' },
        h('span', { class: 'tl-tipo' }, rotulo),
        h('span', { class: 'tl-quem' }, it.nome || '—', it.perfil ? h('small', {}, ` · ${N.PERFIS[it.perfil] || it.perfil}`) : null),
        h('time', { class: 'tl-quando' }, UI.dataHora(it.em)),
        it.rev != null ? h('span', { class: 'tl-rev', title: 'Número da revisão' }, `rev. ${it.rev}`) : null),
      it.resumo ? h('div', { class: 'tl-resumo' }, it.resumo) : null,
      botao, detalhes);
  }

  // ---------- Versões ----------

  function nomeArquivoVersao(dados, v) {
    const d = new Date(v.em || Date.now());
    const carimbo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    return `RelatorioGestao_${U.slug(dados.identificacao.denominacao) || 'relatorio'}_${dados.config.exercicio}_versao_${carimbo}`;
  }

  async function gerarArquivo(dados, tipo, base, botao) {
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Gerando…';
    try {
      const doc = RG.builder.build(dados);
      RG.download(tipo === 'docx' ? await RG.renderDOCX(doc) : await RG.renderPDF(doc), `${base}.${tipo}`);
    } catch (e) { RG.toast('Erro ao gerar o arquivo: ' + e.message, 'erro'); }
    botao.disabled = false;
    botao.textContent = rotulo;
  }

  async function visualizar(sessao, v) {
    let dados;
    try { dados = await sessao.lerVersao(v.id); } catch (e) { RG.toast(e.message, 'erro'); return; }
    const base = nomeArquivoVersao(dados, v);
    await UI.dialogo({
      titulo: `Versão de ${UI.dataHora(v.em)} – ${v.nome || ''}`,
      largo: true,
      classe: 'dlg-previa',
      corpo: [h('p', { class: 'help' }, `${MOTIVOS_VERSAO[v.motivo] || v.motivo}${v.comentario ? ` – ${v.comentario}` : ''} · revisão ${v.rev}`),
        h('div', { class: 'preview previa-versao', html: RG.renderHTML(RG.builder.build(dados)) })],
      botoes: [
        { rotulo: 'Baixar DOCX', acao: (b) => gerarArquivo(dados, 'docx', base, b) },
        { rotulo: 'Baixar PDF', acao: (b) => gerarArquivo(dados, 'pdf', base, b) },
        { rotulo: 'Fechar', valor: null, primario: true },
      ],
    });
  }

  async function comparar(sessao, v) {
    let dados;
    try { dados = await sessao.lerVersao(v.id); } catch (e) { RG.toast(e.message, 'erro'); return; }
    const ops = D.calcular(dados, sessao.dados);
    await UI.dialogo({
      titulo: 'O que mudou desde esta versão',
      largo: true,
      corpo: [h('p', { class: 'help' }, `Da versão de ${UI.dataHora(v.em)} (${v.nome || '—'}) para o conteúdo atual: ${ops.length ? `${ops.length} alteração(ões).` : 'nenhuma diferença.'}`),
        ops.length ? listaOps(ops, false) : null],
    });
  }

  function baixarJSON(sessao, v) {
    sessao.lerVersao(v.id).then((dados) => {
      const blob = new Blob([JSON.stringify({ formato: 'relatorio-gestao-anexo2', versao: dados.schema, relatorio: dados }, null, 2)], { type: 'application/json' });
      RG.download(blob, nomeArquivoVersao(dados, v) + '.json');
    }).catch((e) => RG.toast(e.message, 'erro'));
  }

  // ---------- Seção "Histórico" do editor ----------

  /** ctx: contexto do editor { report, sessao, substituir(dados) }. */
  function secao(ctx) {
    const sessao = ctx.sessao;
    if (!sessao) return [h('p', { class: 'help' }, 'O histórico está disponível no modo online.')];
    const pode = sessao.podeEditar();

    // Linha do tempo
    const lista = h('ol', { class: 'timeline' });
    const mais = h('button', { type: 'button', class: 'btn small', hidden: true }, 'Carregar registros anteriores');
    let cursor = null;
    async function carregar() {
      mais.disabled = true;
      try {
        const r = await sessao.listarHistorico(cursor);
        cursor = r.cursor;
        if (!lista.children.length && !r.itens.length) lista.append(h('li', { class: 'help' }, 'Nenhum registro.'));
        r.itens.forEach((it) => lista.append(itemHistorico(it)));
        mais.hidden = r.fim;
      } catch (e) { lista.append(h('li', { class: 'notice warn' }, e.message)); }
      mais.disabled = false;
    }
    mais.addEventListener('click', carregar);
    carregar();

    // Versões
    const caixaVersoes = h('div', {}, UI.carregando());
    async function carregarVersoes() {
      let versoes;
      try { versoes = await sessao.listarVersoes(); } catch (e) { caixaVersoes.innerHTML = ''; caixaVersoes.append(h('div', { class: 'notice warn' }, e.message)); return; }
      caixaVersoes.innerHTML = '';
      if (!versoes.length) { caixaVersoes.append(h('p', { class: 'help' }, 'Nenhuma versão salva.')); return; }
      caixaVersoes.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tab-painel' },
        h('thead', {}, h('tr', {}, ['Data e hora', 'Autor', 'Motivo', 'Revisão', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, versoes.map((v) => h('tr', {},
          h('td', {}, UI.dataHora(v.em)),
          h('td', {}, v.nome || '—'),
          h('td', {}, MOTIVOS_VERSAO[v.motivo] || v.motivo, v.comentario ? h('div', { class: 'help' }, v.comentario) : null),
          h('td', {}, String(v.rev)),
          h('td', { class: 'acoes' },
            h('button', { type: 'button', class: 'btn small', onclick: () => visualizar(sessao, v) }, 'Visualizar'),
            h('button', { type: 'button', class: 'btn small', onclick: () => comparar(sessao, v) }, 'Comparar com a atual'),
            h('button', { type: 'button', class: 'btn small', onclick: () => baixarJSON(sessao, v) }, 'Baixar .json'),
            pode ? h('button', {
              type: 'button', class: 'btn small danger',
              onclick: async () => {
                if (!(await UI.confirmar(`Restaurar a versão de ${UI.dataHora(v.em)}? O conteúdo atual será substituído. Antes disso, uma cópia do conteúdo atual é salva automaticamente e poderá ser restaurada depois.`, { ok: 'Restaurar versão', perigo: true }))) return;
                try {
                  ctx.substituir(await sessao.restaurarVersao(v));
                  RG.toast('Versão restaurada.');
                } catch (e) { RG.toast(e.message, 'erro'); }
              },
            }, 'Restaurar') : null)))))));
    }
    carregarVersoes();

    const arquivo = h('input', {
      type: 'file', accept: '.json,application/json', hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
          const novos = await RG.storage.importJSON(f);
          const atual = ctx.report.config.exercicio;
          const avisos = [`Substituir todo o conteúdo deste relatório pelo arquivo “${f.name}” (${novos.identificacao.denominacao || 'sem denominação'} – ${novos.config.exercicio})?`,
            'Uma cópia do conteúdo atual é salva antes e pode ser restaurada.'];
          if (+novos.config.exercicio !== +atual) avisos.push(`Atenção: o arquivo é do exercício ${novos.config.exercicio} e este relatório é de ${atual}.`);
          if (!(await UI.confirmar(avisos, { ok: 'Importar e substituir', perigo: true }))) return;
          ctx.substituir(await sessao.importar(novos, f.name));
          RG.toast('Arquivo importado.');
        } catch (err) { RG.toast('Falha na importação: ' + err.message, 'erro'); }
      },
    });

    return [
      h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, 'Versões salvas'),
        h('p', { class: 'card-desc' }, 'Cópias completas do relatório, gravadas automaticamente na criação, na primeira gravação de cada dia, no envio, na aprovação e antes de restaurações e importações. As versões só são apagadas se o contador excluir definitivamente o relatório.'),
        h('div', { class: 'table-actions' },
          h('button', {
            type: 'button', class: 'btn small',
            onclick: async () => {
              const c = await UI.perguntar('Salvar versão', 'Comentário (opcional)', { ok: 'Salvar versão', texto: 'Grava uma cópia completa do conteúdo atual, que poderá ser visualizada ou restaurada depois.' });
              if (c === null) return;
              try { await sessao.salvarVersao(c); RG.toast('Versão salva.'); carregarVersoes(); } catch (e) { RG.toast(e.message, 'erro'); }
            },
          }, 'Salvar versão agora'),
          pode ? h('button', { type: 'button', class: 'btn small', onclick: () => arquivo.click() }, 'Importar dados (.json)…') : null,
          arquivo),
        caixaVersoes),
      h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, 'Linha do tempo'),
        h('p', { class: 'card-desc' }, 'Todas as alterações do relatório, com autor, data e hora do servidor e o que foi alterado em cada campo. Os registros não podem ser alterados; só são apagados na exclusão definitiva do relatório pelo contador.'),
        lista, mais),
    ];
  }

  // ---------- Log de auditoria (master) ----------

  function renderLogs($app) {
    document.title = 'Log de auditoria – Relatório de Gestão';
    const itens = [];
    let cursor = null, fim = false;
    const filtro = { tipo: '', usuario: '', busca: '' };
    const selTipo = h('select', { 'aria-label': 'Tipo de evento', onchange: (e) => { filtro.tipo = e.target.value; desenhar(); } });
    const selUsuario = h('select', { 'aria-label': 'Usuário', onchange: (e) => { filtro.usuario = e.target.value; desenhar(); } });
    const busca = h('input', { type: 'search', placeholder: 'Buscar na descrição…', 'aria-label': 'Buscar', oninput: U.debounce((e) => { filtro.busca = e.target.value.trim().toLowerCase(); desenhar(); }, 200) });
    const corpo = h('div', {}, UI.carregando());
    const mais = h('button', { type: 'button', class: 'btn small', hidden: true, onclick: () => carregar() }, 'Carregar registros anteriores');
    const contador = h('span', { class: 'help' });

    $app.innerHTML = '';
    $app.append(RG.acesso.topo('logs'), h('main', { class: 'pagina larga' },
      h('div', { class: 'pag-cab' },
        h('div', {}, h('h1', {}, 'Log de auditoria'),
          h('p', { class: 'help' }, 'Entradas e saídas, cadastros, criação, envio, devolução e aprovação de relatórios, restaurações e arquivos gerados, com usuário e hora do servidor. As edições campo a campo ficam no Histórico de cada relatório. Os registros não podem ser alterados nem excluídos.')),
        h('div', { class: 'pag-acoes' }, h('button', { type: 'button', class: 'btn', onclick: exportar }, 'Exportar (CSV)'))),
      h('div', { class: 'filtros' }, selTipo, selUsuario, busca, contador),
      corpo, h('div', { class: 'table-actions' }, mais)));

    const visiveis = () => itens.filter((x) => (!filtro.tipo || x.tipo === filtro.tipo) && (!filtro.usuario || x.uid === filtro.usuario)
      && (!filtro.busca || `${x.resumo} ${x.nome}`.toLowerCase().includes(filtro.busca)));

    function opcoes() {
      const tipoAtual = filtro.tipo, usuarioAtual = filtro.usuario;
      const tipos = [...new Set(itens.map((x) => x.tipo))].sort((a, b) => (TIPOS_LOG[a] || a).localeCompare(TIPOS_LOG[b] || b, 'pt-BR'));
      selTipo.innerHTML = '';
      selTipo.append(h('option', { value: '' }, 'Todos os eventos'), ...tipos.map((t) => h('option', { value: t, selected: t === tipoAtual || null }, TIPOS_LOG[t] || t)));
      const usuarios = new Map(itens.map((x) => [x.uid, x.nome]));
      selUsuario.innerHTML = '';
      selUsuario.append(h('option', { value: '' }, 'Todos os usuários'),
        ...[...usuarios].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR')).map(([uid, nome]) => h('option', { value: uid, selected: uid === usuarioAtual || null }, nome)));
    }

    function desenhar() {
      const v = visiveis();
      contador.textContent = `${v.length} de ${itens.length} registro(s) carregado(s)${fim ? '' : ' – carregue mais para ver os anteriores'}`;
      corpo.innerHTML = '';
      corpo.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tab-painel' },
        h('thead', {}, h('tr', {}, ['Data e hora', 'Usuário', 'Evento', 'Descrição', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, v.length ? v.map((x) => h('tr', {},
          h('td', { class: 'nowrap' }, UI.dataHora(x.em)),
          h('td', {}, x.nome || '—', h('div', { class: 'help' }, N.PERFIS[x.perfil] || x.perfil || '')),
          h('td', {}, TIPOS_LOG[x.tipo] || x.tipo),
          h('td', {}, x.resumo || ''),
          h('td', { class: 'acoes' }, x.relId ? h('a', { class: 'btn small', href: `#/r/${x.relId}/historico` }, 'Histórico do relatório') : null)))
          : h('tr', {}, h('td', { colspan: 5, class: 'empty' }, 'Nenhum registro.'))))));
    }

    async function carregar() {
      mais.disabled = true;
      try {
        const r = await N.listarLogs(cursor, 100);
        itens.push(...r.itens);
        cursor = r.cursor;
        fim = r.fim;
        mais.hidden = r.fim;
        opcoes();
        desenhar();
      } catch (e) { corpo.innerHTML = ''; corpo.append(h('div', { class: 'notice warn' }, e.message)); }
      mais.disabled = false;
    }

    function exportar() {
      UI.baixarCSV(`Log_auditoria_Relatorio_Gestao_${U.todayISO()}.csv`, ['Data e hora', 'Usuário', 'Perfil', 'Evento', 'Descrição', 'Relatório'],
        visiveis().map((x) => [UI.dataHora(x.em), x.nome, N.PERFIS[x.perfil] || x.perfil, TIPOS_LOG[x.tipo] || x.tipo, x.resumo, x.relId || '']));
    }

    carregar();
    return null;
  }

  RG.historico = { secao, renderLogs, listaOps };
})(window.RG = window.RG || {});
