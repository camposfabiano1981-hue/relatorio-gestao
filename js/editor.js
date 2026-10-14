/* Formulários do editor: componentes de campo, tabela editável e telas de cada seção. */
(function (RG) {
  'use strict';
  const U = RG.util;
  const S = RG.schema;
  const B = RG.builder;

  // ---------- DOM ----------

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }
  RG.h = h;

  let dlSeq = 0;
  function datalist(options) {
    const id = 'dl' + (++dlSeq);
    return { id, el: h('datalist', { id }, options.map((o) => h('option', { value: o }))) };
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, 640) + 'px';
  }

  // ---------- Contexto do editor ----------
  // ctx = { report, changed(), rerender() }
  let ctx = null;

  const val = (path) => U.get(ctx.report, path);
  const setVal = (path, v) => { U.set(ctx.report, path, v); ctx.changed(); };

  function card(title, desc, ...children) {
    return h('section', { class: 'card' },
      title ? h('h3', { class: 'card-title' }, title) : null,
      desc ? h('p', { class: 'card-desc' }, desc) : null,
      children);
  }

  const grid = (...children) => h('div', { class: 'grid' }, children);

  function field(label, path, opts) {
    const o = opts || {};
    let input;
    const cur = val(path);
    if (o.type === 'select') {
      input = h('select', { onchange: (e) => { setVal(path, o.number ? +e.target.value : e.target.value); if (o.onchange) o.onchange(e.target.value); } },
        Object.entries(o.options).map(([k, lbl]) => h('option', { value: k, selected: String(cur) === String(k) || null }, lbl)));
    } else {
      let dl = null;
      if (o.list) { dl = datalist(o.list); }
      input = h('input', {
        type: o.type || 'text',
        value: cur == null ? '' : cur,
        placeholder: o.placeholder,
        list: dl && dl.id,
        inputmode: o.inputmode,
        maxlength: o.maxlength,
        oninput: (e) => setVal(path, o.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value),
        onchange: (e) => {
          if (o.format) { e.target.value = o.format(e.target.value); setVal(path, e.target.value); }
          if (o.onchange) o.onchange(e.target.value, e.target);
        },
      });
      if (dl) input = h('span', { class: 'with-dl' }, input, dl.el);
    }
    return h('label', { class: 'field' + (o.wide ? ' wide' : '') + (o.full ? ' full' : '') },
      h('span', { class: 'lbl' }, label, o.required ? h('span', { class: 'req', title: 'Obrigatório' }, ' *') : null),
      input,
      o.help ? h('span', { class: 'help' }, o.help) : null);
  }

  /** Área de texto com marcadores e opção de restaurar o texto-padrão. */
  function textArea(label, path, opts) {
    const o = opts || {};
    const ta = h('textarea', {
      rows: o.rows || 4,
      spellcheck: 'true',
      value: val(path) || '',
      oninput: (e) => { setVal(path, e.target.value); autoGrow(e.target); },
    });
    requestAnimationFrame(() => autoGrow(ta));
    const tools = h('div', { class: 'ta-tools' },
      h('span', { class: 'help' }, 'Cada linha é um parágrafo. Linhas iniciadas com “-” viram itens de lista; **texto** fica em negrito; trechos entre [[ ]] são orientações a substituir.'),
      o.defaultKey ? h('button', {
        type: 'button', class: 'link',
        onclick: () => {
          if (!confirm('Substituir o texto atual pelo texto-padrão?')) return;
          const tx = S.textosPadrao(ctx.report.config.tipoEntidade, ctx.report.config.consolidado)[o.defaultKey];
          ta.value = tx; setVal(path, tx); autoGrow(ta);
        },
      }, 'Restaurar texto-padrão') : null);
    return h('div', { class: 'field full' },
      label ? h('span', { class: 'lbl' }, label) : null,
      o.help ? h('span', { class: 'help top' }, o.help) : null,
      ta, tools);
  }

  function toggle(label, path, opts) {
    const o = opts || {};
    return h('label', { class: 'toggle' },
      h('input', {
        type: 'checkbox', checked: !!val(path),
        onchange: (e) => { setVal(path, e.target.checked); if (o.rerender !== false) ctx.rerender(); },
      }),
      h('span', { class: 'track' }),
      h('span', { class: 'toggle-lbl' }, label));
  }

  // ---------- Tabela editável ----------

  const EDITABLE = (c) => c.type !== 'computed' && c.type !== 'readonly';

  function parseCell(col, raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (col.type === 'money' || col.type === 'int') {
      if (!s) return '';
      const n = U.parseNum(s);
      return isFinite(n) ? n : s;
    }
    if (col.type === 'date') {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
    }
    return s;
  }

  function displayCell(col, v) {
    if (col.type === 'money') return typeof v === 'number' ? U.money(v) : (v == null ? '' : v);
    if (col.type === 'int') return typeof v === 'number' ? U.int(v) : (v == null ? '' : v);
    return v == null ? '' : v;
  }

  /**
   * opts: { rows, columns, fixed, newRow, totals(rows) -> {key: texto}, onCommit, empty }
   * column: { key, label, type: text|money|int|date|area|computed|readonly, width, list, compute(row, i) }
   */
  function tableEditor(opts) {
    const { rows, columns } = opts;
    const editable = columns.filter(EDITABLE);
    const refreshers = [];
    let tfootCells = null;

    const refreshAll = () => {
      refreshers.forEach((fn) => fn());
      if (opts.totals && tfootCells) {
        const tot = opts.totals(rows);
        columns.forEach((c, i) => {
          const v = tot[c.key];
          tfootCells[i].textContent = v != null ? v : (i === 0 ? 'TOTAL' : '');
        });
      }
    };

    const commit = () => { if (opts.onCommit) opts.onCommit(); };

    function onPaste(e, rowIdx, colKey, force) {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!force && !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // colagem simples: comportamento normal
      e.preventDefault();
      const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
      const startCol = editable.findIndex((c) => c.key === colKey);
      lines.forEach((line, li) => {
        const ri = rowIdx + li;
        if (ri >= rows.length) {
          if (opts.fixed) return;
          rows.push(opts.newRow());
        }
        line.split('\t').forEach((v, ci) => {
          const col = editable[startCol + ci];
          if (col) rows[ri][col.key] = parseCell(col, v);
        });
      });
      ctx.changed();
      ctx.rerender();
    }

    const thead = h('thead', {}, h('tr', {},
      columns.map((c) => h('th', { style: c.width ? `width:${c.width}` : null, class: c.type === 'money' || c.type === 'computed' ? 'num' : null }, c.label)),
      opts.fixed ? null : h('th', { class: 'act' }, '')));

    const tbody = h('tbody');
    rows.forEach((row, ri) => {
      const tr = h('tr');
      const computedCells = [];
      columns.forEach((c) => {
        if (!EDITABLE(c)) {
          const td = h('td', { class: 'computed' + (c.type === 'computed' ? ' num' : '') });
          const upd = () => { td.textContent = c.compute ? c.compute(row, ri) : (row[c.key] == null ? '' : row[c.key]); };
          upd();
          computedCells.push(upd);
          tr.append(td);
          return;
        }
        let input;
        const td = h('td');
        const common = {
          'data-col': c.key,
          'aria-label': c.label,
          onpaste: (e) => onPaste(e, ri, c.key),
          onchange: commit,
        };
        if (c.type === 'area') {
          input = h('textarea', Object.assign({
            rows: 1, value: row[c.key] || '',
            oninput: (e) => { row[c.key] = e.target.value; autoGrow(e.target); ctx.changed(); },
          }, common));
          requestAnimationFrame(() => autoGrow(input));
        } else {
          const isNum = c.type === 'money' || c.type === 'int';
          let dl = null;
          if (c.list) dl = datalist(c.list);
          input = h('input', Object.assign({
            type: c.type === 'date' ? 'date' : 'text',
            class: isNum ? 'num' : null,
            inputmode: isNum ? 'decimal' : null,
            list: dl && dl.id,
            value: displayCell(c, row[c.key]),
            oninput: (e) => { row[c.key] = parseCell(c, e.target.value); refreshAll(); ctx.changed(); },
            onblur: (e) => { if (isNum) e.target.value = displayCell(c, row[c.key]); },
          }, common));
          if (dl) td.append(dl.el);
        }
        td.prepend(input);
        tr.append(td);
      });
      refreshers.push(() => computedCells.forEach((fn) => fn()));
      if (!opts.fixed) {
        const move = (d) => () => {
          const j = ri + d;
          if (j < 0 || j >= rows.length) return;
          [rows[ri], rows[j]] = [rows[j], rows[ri]];
          ctx.changed(); ctx.rerender();
        };
        tr.append(h('td', { class: 'act' },
          h('button', { type: 'button', class: 'icon', title: 'Mover para cima', onclick: move(-1), disabled: ri === 0 || null }, '↑'),
          h('button', { type: 'button', class: 'icon', title: 'Mover para baixo', onclick: move(1), disabled: ri === rows.length - 1 || null }, '↓'),
          h('button', {
            type: 'button', class: 'icon danger', title: 'Remover linha',
            onclick: () => { rows.splice(ri, 1); ctx.changed(); ctx.rerender(); },
          }, '✕')));
      }
      tbody.append(tr);
    });
    if (!rows.length) {
      tbody.append(h('tr', {}, h('td', { colspan: columns.length + 1, class: 'empty' }, opts.empty || 'Nenhuma linha. Clique em “Adicionar linha” ou cole dados do Excel.')));
    }

    let tfoot = null;
    if (opts.totals && rows.length) {
      tfootCells = columns.map(() => h('td'));
      tfootCells[0].textContent = 'TOTAL';
      tfoot = h('tfoot', {}, h('tr', {}, tfootCells, opts.fixed ? null : h('td')));
    }

    const table = h('table', { class: 'ed-table' }, thead, tbody, tfoot);
    refreshAll();

    const pasteFirst = !rows.length && !opts.fixed ? h('textarea', {
      class: 'paste-zone', rows: 2,
      placeholder: 'Cole aqui as linhas copiadas do Excel (colunas na mesma ordem da tabela)…',
      onpaste: (e) => onPaste(e, 0, editable[0].key, true),
    }) : null;

    return h('div', { class: 'ed-table-wrap' },
      h('div', { class: 'scroll-x' }, table),
      pasteFirst,
      h('div', { class: 'table-actions' },
        opts.fixed ? null : h('button', {
          type: 'button', class: 'btn small',
          onclick: () => { rows.push(opts.newRow()); ctx.changed(); ctx.rerender(); },
        }, '+ Adicionar linha'),
        h('span', { class: 'help' }, 'Dica: copie um intervalo de células no Excel e cole (Ctrl+V) em qualquer campo da tabela.')));
  }

  const moneyTotals = (keys, extra) => (rows) => {
    const out = {};
    keys.forEach((k) => { out[k] = U.money(U.sum(rows, k)); });
    return Object.assign(out, extra ? extra(rows) : {});
  };

  // ---------- Seções ----------

  const SECTIONS = [
    { id: 'capa', nav: 'Capa e configurações' },
    { id: 'declaracao', nav: 'Declaração de veracidade' },
    { id: 's1', nav: 'I – Informações gerais' },
    { id: 's2', nav: 'II – Gestão orçamentária' },
    { id: 's3', nav: 'III – Pessoas e terceirização' },
    { id: 's4', nav: 'IV – Transferências' },
    { id: 's5', nav: 'V – Licitações e contratos' },
    { id: 's6', nav: 'VI – Contrato de gestão (OS)' },
    { id: 's7', nav: 'VII – Parcerias MROSC' },
    { id: 's8', nav: 'VIII – Considerações finais' },
    { id: 'preview', nav: 'Pré-visualização' },
    { id: 'checks', nav: 'Verificações' },
  ];

  function marcadoresHelp() {
    return h('details', { class: 'markers' },
      h('summary', {}, 'Marcadores disponíveis nos textos'),
      h('p', { class: 'help' }, 'Escreva o marcador entre chaves e ele será substituído automaticamente no documento:'),
      h('ul', {}, Object.entries(S.MARCADORES).map(([k, d]) => h('li', {}, h('code', {}, `{${k}}`), ' — ', d))));
  }

  const V = {};

  V.capa = () => {
    const c = 'config.';
    const logoBox = h('div', { class: 'logo-box' });
    const drawLogo = () => {
      logoBox.innerHTML = '';
      const lg = ctx.report.config.logo;
      if (lg) {
        logoBox.append(h('img', { src: lg.data, alt: 'Brasão/logotipo' }),
          h('button', { type: 'button', class: 'btn small', onclick: () => { setVal('config.logo', null); drawLogo(); } }, 'Remover'));
      } else {
        logoBox.append(h('span', { class: 'help' }, 'Nenhuma imagem. Formatos PNG ou JPG.'));
      }
    };
    drawLogo();
    const fileIn = h('input', {
      type: 'file', accept: 'image/png,image/jpeg',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          setVal('config.logo', await RG.loadLogo(f));
          drawLogo();
        } catch (err) { RG.toast(err.message, 'erro'); }
        e.target.value = '';
      },
    });
    return [
      card('Entidade', 'Defina o tipo de unidade. A plataforma atende tanto a administração direta quanto a indireta (autarquias, fundações, fundos, RPPS, estatais dependentes e consórcios).',
        grid(
          field('Tipo de entidade', c + 'tipoEntidade', { type: 'select', options: S.TIPOS, wide: true }),
          field('Denominação da unidade', 'identificacao.denominacao', { wide: true, required: true, placeholder: 'Ex.: Prefeitura Municipal de …' }),
          field('UF', c + 'uf', {
            type: 'select', options: Object.fromEntries(Object.keys(S.ESTADOS).map((k) => [k, k])),
            onchange: (uf) => {
              const est = S.ESTADOS[uf] || '';
              setVal('config.estado', est);
              setVal('config.tribunal', est ? `Tribunal de Contas do ${est}` : '');
              ctx.rerender();
            },
          }),
          field('Estado (por extenso)', c + 'estado'),
          field('Município', c + 'municipio', { required: true }),
          field('Órgão superior (opcional)', c + 'orgaoSuperior', { wide: true, help: 'Exibido na capa acima da denominação. Útil para entidades da administração indireta (ex.: Prefeitura Municipal de …).' })),
        toggle('Relatório consolidado (abrange órgãos e entidades vinculados)', c + 'consolidado')),
      card('Exercício e norma de referência', null,
        grid(
          field('Exercício financeiro', c + 'exercicio', { type: 'number', required: true }),
          field('Norma do Tribunal de Contas', c + 'resolucao', { wide: true }),
          field('Tribunal de Contas', c + 'tribunal', { wide: true }),
          field('Local de emissão', c + 'localEmissao', { placeholder: 'Município-UF' }),
          field('Data do relatório', c + 'dataRelatorio', { type: 'date' }))),
      card('Identidade visual e opções', null,
        h('div', { class: 'field full' }, h('span', { class: 'lbl' }, 'Brasão ou logotipo (capa)'), logoBox, fileIn),
        toggle('Incluir sumário (no Word, atualize o campo ao abrir: clique com o botão direito › Atualizar campo)', c + 'incluirSumario', { rerender: false })),
    ];
  };

  V.declaracao = () => {
    const prev = h('div', { class: 'preview-inline' });
    const drawPrev = () => {
      prev.innerHTML = '';
      const txt = U.fill(ctx.report.declaracao.texto, B.variables(ctx.report));
      U.paragraphs(txt).forEach((b) => prev.append(h('p', { html: b.t === 'p' ? b.runs.map((r) => (r.pending ? `<mark class="pend">${U.esc(r.text)}</mark>` : U.esc(r.text))).join('') : '' })));
    };
    drawPrev();
    const ta = textArea('Texto da declaração', 'declaracao.texto', { defaultKey: 'declaracao', rows: 6 });
    ta.addEventListener('input', drawPrev);
    return [
      card('Gestor signatário', 'Responsável pela declaração e pela assinatura do relatório.',
        grid(
          field('Nome completo', 'declaracao.nome', { wide: true, required: true, onchange: drawPrev }),
          field('Cargo', 'declaracao.cargo', { wide: true, required: true, placeholder: 'Ex.: Prefeito Municipal', onchange: drawPrev }),
          field('Data da declaração', 'declaracao.data', { type: 'date' }))),
      card('Declaração de veracidade das informações', null, ta, marcadoresHelp(),
        h('div', { class: 'field full' }, h('span', { class: 'lbl' }, 'Prévia com os marcadores substituídos'), prev)),
    ];
  };

  V.s1 = () => {
    const r = ctx.report;
    const ug = r.s1;
    return [
      card('Identificação da Unidade, Estrutura Organizacional e Competências', null,
        textArea('Apresentação da unidade', 's1.intro', { defaultKey: 'intro1' }), marcadoresHelp()),
      card('Dados de Identificação da Unidade', null,
        grid(
          field('Denominação', 'identificacao.denominacao', { wide: true, required: true }),
          field('Sigla', 'identificacao.sigla'),
          field('CNPJ', 'identificacao.cnpj', {
            required: true, placeholder: '00.000.000/0000-00', format: U.formatCNPJ,
            onchange: (v, el) => { el.classList.toggle('invalid', !!v && !U.cnpjValido(v)); },
          }),
          field('Natureza jurídica', 'identificacao.naturezaJuridica', { wide: true, list: S.NATUREZAS }),
          field('Esfera de governo', 'identificacao.esfera', { type: 'select', options: { Municipal: 'Municipal', Estadual: 'Estadual', Federal: 'Federal' } }),
          field('Endereço', 'identificacao.endereco', { wide: true }),
          field('CEP', 'identificacao.cep', { placeholder: '00.000-000' }),
          field('Telefone', 'identificacao.telefone'),
          field('E-mail institucional', 'identificacao.email', { type: 'email' }),
          field('Sítio eletrônico', 'identificacao.site'),
          field('Base legal de criação', 'identificacao.baseLegal', { full: true, placeholder: 'Ex.: Lei Municipal nº …, de …' })),
        h('h4', { class: 'sub' }, 'Informações adicionais (opcional)'),
        tableEditor({
          rows: r.identificacao.extras,
          columns: [{ key: 'campo', label: 'Campo', width: '30%' }, { key: 'info', label: 'Informação', type: 'area' }],
          newRow: () => ({ campo: '', info: '' }),
          empty: 'Sem informações adicionais.',
        })),
      card(`Responsáveis pela Unidade Gestora – Exercício ${r.config.exercicio}`, 'Inclua todos os titulares e substitutos no exercício, com o respectivo período de gestão.',
        tableEditor({
          rows: ug.responsaveis,
          columns: [
            { key: 'cargo', label: 'Cargo', width: '32%' }, { key: 'nome', label: 'Nome' },
            { key: 'inicio', label: 'Início', type: 'date', width: '150px' }, { key: 'fim', label: 'Fim', type: 'date', width: '150px' },
          ],
          newRow: () => ({ cargo: '', nome: '', inicio: `${r.config.exercicio}-01-01`, fim: `${r.config.exercicio}-12-31` }),
        })),
      card('Estrutura Organizacional', null,
        textArea('Texto', 's1.estrutura', { defaultKey: 'estrutura' }),
        textArea('Órgãos, unidades e entidades (um por linha)', 's1.unidades', { rows: 6 })),
      card('Finalidades e Competências', null, textArea('', 's1.finalidades', { defaultKey: 'finalidades' })),
      card('Delegação de Competência', null,
        toggle('Há delegação de competência a ser descrita', 's1.delegacaoAplica'),
        ug.delegacaoAplica ? textArea('', 's1.delegacao', { defaultKey: 'delegacao' }) : null),
    ];
  };

  V.s2 = () => {
    const r = ctx.report, s2 = r.s2;
    const justBox = h('div', { class: 'just-list' });
    const drawJust = () => {
      justBox.innerHTML = '';
      const parciais = s2.metas.filter((m) => isFinite(B.execRatio(m)) && B.execRatio(m) < 0.99995);
      if (!parciais.length) {
        justBox.append(h('p', { class: 'help' }, 'Nenhum programa com execução inferior a 100%. As justificativas aparecem aqui automaticamente quando houver.'));
        return;
      }
      parciais.forEach((m) => {
        const ta = h('textarea', {
          rows: 2, value: m.justificativa || '',
          placeholder: 'Explique os motivos da execução parcial…',
          oninput: (e) => { m.justificativa = e.target.value; autoGrow(e.target); ctx.changed(); },
        });
        requestAnimationFrame(() => autoGrow(ta));
        justBox.append(h('label', { class: 'field full' },
          h('span', { class: 'lbl' }, `${m.programa || '(programa sem nome)'} — ${U.pct(B.execRatio(m))}`), ta));
      });
    };
    drawJust();
    const dotLbl = s2.baseDotacao === 'atualizada' ? 'Dotação Atualizada (R$)' : 'Dotação Inicial (R$)';
    return [
      card('Programas de Governo: Metas Físicas e Financeiras', null,
        grid(
          field('Número da LOA', 's2.loaNumero', { placeholder: 'Ex.: 2.973' }),
          field('Data da LOA', 's2.loaData', { type: 'date' })),
        textArea('Texto introdutório', 's2.intro', { defaultKey: 'intro2' })),
      card(`Quadro Comparativo de Metas Físicas e Financeiras – LOA ${r.config.exercicio}`, 'O percentual de execução e os totais são calculados automaticamente.',
        grid(field('Base da comparação financeira', 's2.baseDotacao', { type: 'select', options: { inicial: 'Dotação inicial', atualizada: 'Dotação atualizada' }, onchange: () => ctx.rerender() })),
        tableEditor({
          rows: s2.metas,
          columns: [
            { key: 'programa', label: 'Programa / Ação', type: 'area', width: '30%' },
            { key: 'metaPrevista', label: 'Meta Física Prevista', width: '10%' },
            { key: 'metaRealizada', label: 'Meta Física Realizada', width: '10%' },
            { key: 'dotacao', label: dotLbl, type: 'money' },
            { key: 'executado', label: 'Valor Executado (R$)', type: 'money' },
            { key: 'pct', label: '% Exec.', type: 'computed', width: '9%', compute: (m) => U.pct(B.execRatio(m)) },
          ],
          newRow: () => ({ programa: '', metaPrevista: '', metaRealizada: '', dotacao: '', executado: '', justificativa: '' }),
          totals: moneyTotals(['dotacao', 'executado'], (rows) => {
            const d = U.sum(rows, 'dotacao');
            return { pct: U.pct(d ? U.sum(rows, 'executado') / d : NaN) };
          }),
          onCommit: drawJust,
        })),
      card('Análise das Metas Executadas', null, textArea('', 's2.analise', { defaultKey: 'analise' })),
      card('Justificativas para Ações Não Realizadas ou Parcialmente Executadas', null,
        textArea('Texto introdutório', 's2.justificativasIntro', { defaultKey: 'justificativasIntro', rows: 2 }), justBox),
      card('Contingenciamento de Recursos', null, textArea('', 's2.contingenciamento', { defaultKey: 'contingenciamento' })),
      card('Restos a Pagar', 'Informe os valores do exercício. A coluna “Conferência” mostra Saldo Inicial + Inscritos − Baixas para comparação com o saldo final informado.',
        textArea('Texto', 's2.rpTexto', { defaultKey: 'rp' }),
        tableEditor({
          rows: s2.rp, fixed: true,
          columns: [
            { key: 'categoria', label: 'Categoria', type: 'readonly', width: '22%' },
            { key: 'saldoInicial', label: 'Saldo Inicial (R$)', type: 'money' },
            { key: 'inscritos', label: `Inscritos em ${r.config.exercicio} (R$)`, type: 'money' },
            { key: 'baixas', label: `Baixas em ${r.config.exercicio} (R$)`, type: 'money' },
            { key: 'saldoFinal', label: 'Saldo Final (R$)', type: 'money' },
            {
              key: 'conf', label: 'Conferência', type: 'computed',
              compute: (row) => {
                const d = U.num(row.saldoFinal) - B.rpCalculado(row);
                return Math.abs(d) < 0.01 ? '✓ confere' : `calc. ${U.money(B.rpCalculado(row))} (dif. ${U.money(d)})`;
              },
            },
          ],
          totals: moneyTotals(['saldoInicial', 'inscritos', 'baixas', 'saldoFinal']),
        })),
    ];
  };

  V.s3 = () => {
    const r = ctx.report, s3 = r.s3, ano = r.config.exercicio;
    return [
      card('Quadro de Pessoal', 'Linhas consecutivas com a mesma categoria são agrupadas automaticamente no documento.',
        textArea('Texto', 's3.pessoalTexto', { defaultKey: 'pessoal', rows: 2 }),
        tableEditor({
          rows: s3.pessoal,
          columns: [
            { key: 'categoria', label: 'Categoria', list: ['Efetivos', 'Comissionados', 'Contrato por Prazo Determinado', 'Contratos de Estágio', 'Agentes Políticos', 'Outros'] },
            { key: 'vinculo', label: 'Vínculo' },
            { key: 'qtd', label: 'Qtd. Ocupantes', type: 'int', width: '16%' },
          ],
          newRow: () => ({ categoria: '', vinculo: '', qtd: '' }),
          totals: (rows) => ({ qtd: U.int(U.sum(rows, 'qtd')) }),
        })),
      card('Despesas com Pessoal e Encargos Sociais', 'A despesa líquida é calculada automaticamente (bruta − não computadas).',
        grid(field('Título do quadro', 's3.folhaTitulo', { full: true })),
        tableEditor({
          rows: s3.folha, fixed: true,
          columns: [
            { key: 'comp', label: 'Competência', type: 'computed', width: '14%', compute: (f) => B.competencia(f.mes, ano) },
            { key: 'bruta', label: 'Despesa Bruta com Pessoal (R$)', type: 'money' },
            { key: 'naoComputadas', label: 'Despesas Não Computadas (R$)', type: 'money' },
            { key: 'liq', label: 'Despesa Líquida (R$)', type: 'computed', compute: (f) => U.money(B.folhaLiquida(f)) },
          ],
          totals: (rows) => ({
            bruta: U.money(U.sum(rows, 'bruta')), naoComputadas: U.money(U.sum(rows, 'naoComputadas')),
            liq: U.money(rows.reduce((a, f) => a + B.folhaLiquida(f), 0)),
          }),
        }),
        grid(field('Fonte', 's3.folhaFonte', { full: true }))),
      card('Demonstrativo de Pessoal Terceirizado', 'Contratos de terceirização de mão de obra em substituição de servidores (art. 18, §1º, LRF – natureza 3.3.90.34).',
        toggle('Há contratos de terceirização em substituição de servidores', 's3.terceirizacaoAplica'),
        s3.terceirizacaoAplica
          ? [textArea('Texto', 's3.terceirizacaoTexto', { defaultKey: 'terceirizacao' }),
            tableEditor({
              rows: s3.terceirizados,
              columns: [
                { key: 'atividade', label: 'Categoria / Atividade', type: 'area' }, { key: 'postos', label: 'Qtd. Postos', type: 'int', width: '12%' },
                { key: 'empresa', label: 'Empresa Contratada', type: 'area' }, { key: 'valor', label: 'Valor Anual (R$)', type: 'money' },
              ],
              newRow: () => ({ atividade: '', postos: '', empresa: '', valor: '' }),
              totals: (rows) => ({ postos: U.int(U.sum(rows, 'postos')), valor: U.money(U.sum(rows, 'valor')) }),
            })]
          : textArea('Texto de não aplicabilidade', 's3.terceirizacaoNao', { defaultKey: 'terceirizacaoNao' })),
      card('Demonstrativo de Benefícios Previdenciários', null,
        toggle('Há benefícios previdenciários pagos a demonstrar', 's3.previdenciaAplica'),
        s3.previdenciaAplica
          ? [textArea('Texto', 's3.previdenciaTexto', { defaultKey: 'previdencia' }),
            tableEditor({
              rows: s3.beneficios,
              columns: [
                { key: 'tipo', label: 'Beneficiários Pagos', list: ['Aposentados', 'Pensionistas'] },
                { key: 'fonte', label: 'Fonte / Regime', list: ['RPPS', 'Tesouro Municipal'] },
                { key: 'segurados', label: 'Segurados', type: 'int', width: '12%' },
                { key: 'valor', label: 'Total Anual (R$)', type: 'money' },
              ],
              newRow: () => ({ tipo: '', fonte: '', segurados: '', valor: '' }),
              totals: (rows) => ({ segurados: U.int(U.sum(rows, 'segurados')), valor: U.money(U.sum(rows, 'valor')) }),
            })]
          : textArea('Texto de não aplicabilidade', 's3.previdenciaNao', { defaultKey: 'previdenciaNao' })),
      card('Discriminação da Remuneração de Diretoria e Conselhos', null,
        toggle('Há diretoria ou conselhos remunerados', 's3.diretoriaAplica'),
        s3.diretoriaAplica
          ? [textArea('Texto', 's3.diretoriaTexto', { defaultKey: 'diretoria', rows: 2 }),
            tableEditor({
              rows: s3.diretoria,
              columns: [
                { key: 'orgao', label: 'Órgão / Conselho' }, { key: 'nome', label: 'Nome' }, { key: 'funcao', label: 'Função' },
                { key: 'valor', label: 'Remuneração Anual (R$)', type: 'money' },
              ],
              newRow: () => ({ orgao: '', nome: '', funcao: '', valor: '' }),
              totals: moneyTotals(['valor']),
            })]
          : textArea('Texto de não aplicabilidade', 's3.diretoriaNao', { defaultKey: 'diretoriaNao', rows: 2 })),
    ];
  };

  V.s4 = () => {
    const r = ctx.report;
    const ugs = String(r.s1.unidades || '').split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    if (r.identificacao.denominacao) ugs.unshift(r.identificacao.denominacao);
    return [
      card('Convênios, Termos de Fomento, Termos de Colaboração, Acordos de Cooperação e Congêneres', 'Quadros sem linhas são apresentados no documento com a declaração de que não houve instrumentos daquela natureza.',
        textArea('Texto introdutório', 's4.intro', { defaultKey: 'intro4' })),
      B.QUADROS.map((q, i) => card(`Quadro ${String.fromCharCode(65 + i)} – ${q.titulo}`, null,
        tableEditor({
          rows: r.s4[q.key],
          columns: [
            { key: 'qtde', label: 'Qtde', width: '7%' },
            { key: 'ug', label: 'Unidade Gestora', type: 'text', list: ugs, width: '24%' },
            { key: 'entidade', label: q.key === 'convenios' ? 'Entidade Convenente / Objeto' : 'Entidade Parceira / Objeto', type: 'area' },
            { key: 'valor', label: 'Valor Repassado (R$)', type: 'money', width: '16%' },
            { key: 'situacao', label: 'Situação', list: S.SITUACOES, width: '15%' },
          ],
          newRow: () => ({ qtde: '01', ug: r.identificacao.denominacao || '', entidade: '', valor: '', situacao: 'Em execução' }),
          totals: moneyTotals(['valor']),
          empty: 'Nenhum instrumento informado.',
        }))),
    ];
  };

  V.s5 = () => {
    const s5 = ctx.report.s5;
    return [
      card('Valores Anuais de Despesas por Modalidade de Licitação, Dispensa e Inexigibilidade', null,
        textArea('Texto introdutório', 's5.intro', { defaultKey: 'intro5' }),
        tableEditor({
          rows: s5.modalidades,
          columns: [
            { key: 'modalidade', label: 'Modalidade / Fundamento Legal', type: 'area', width: '50%' },
            { key: 'qtd', label: 'Qtd. Processos', width: '14%' },
            { key: 'valor', label: 'Valor Total Empenhado (R$)', type: 'money' },
          ],
          newRow: () => ({ modalidade: '', qtd: '', valor: '' }),
          totals: moneyTotals(['valor']),
        }),
        grid(field('Fonte', 's5.fonte', { full: true }))),
      card('Órgão de Imprensa Oficial', null,
        textArea('Texto', 's5.imprensaTexto', { defaultKey: 'imprensa', rows: 2 }),
        tableEditor({
          rows: s5.imprensa,
          columns: [{ key: 'veiculo', label: 'Veículo de Publicação', type: 'area', width: '40%' }, { key: 'atos', label: 'Atos Publicados', type: 'area' }],
          newRow: () => ({ veiculo: '', atos: '' }),
        })),
      card('Recomendações do Controle Interno e Providências Adotadas', null,
        textArea('Texto', 's5.controleTexto', { defaultKey: 'controle' }),
        toggle('Incluir quadro de recomendações e providências', 's5.controleQuadro'),
        s5.controleQuadro ? tableEditor({
          rows: s5.recomendacoes,
          columns: [
            { key: 'recomendacao', label: 'Recomendação', type: 'area' }, { key: 'providencia', label: 'Providência Adotada', type: 'area' },
            { key: 'situacao', label: 'Situação', list: ['Atendida', 'Em atendimento', 'Não atendida'], width: '16%' },
          ],
          newRow: () => ({ recomendacao: '', providencia: '', situacao: '' }),
        }) : null),
    ];
  };

  V.s6 = () => {
    const s6 = ctx.report.s6;
    return [card('Acompanhamento de Contrato de Gestão com Organização Social', 'Lei Federal nº 9.637/1998 e legislação municipal específica.',
      toggle('Houve contrato de gestão com Organização Social no exercício', 's6.aplica'),
      s6.aplica
        ? [textArea('Texto', 's6.texto', { defaultKey: 'os' }),
          tableEditor({
            rows: s6.contratos,
            columns: [
              { key: 'os', label: 'Organização Social', type: 'area' }, { key: 'contrato', label: 'Contrato nº', width: '11%' },
              { key: 'objeto', label: 'Objeto', type: 'area' }, { key: 'valor', label: 'Valor Repassado (R$)', type: 'money', width: '15%' },
              { key: 'avaliacao', label: 'Avaliação dos Resultados', type: 'area' },
            ],
            newRow: () => ({ os: '', contrato: '', objeto: '', valor: '', avaliacao: '' }),
            totals: moneyTotals(['valor']),
          })]
        : textArea('Declaração de não aplicabilidade', 's6.declaracao', { defaultKey: 'osNao' }))];
  };

  V.s7 = () => {
    const r = ctx.report, s7 = r.s7;
    const importar = () => {
      const map = { fomento: 'Termo de Fomento', colaboracao: 'Termo de Colaboração' };
      let n = 0;
      Object.keys(map).forEach((k) => r.s4[k].forEach((x) => {
        s7.parcerias.push({ osc: x.entidade, instrumento: map[k], numero: '', objeto: '', valor: x.valor, situacao: x.situacao });
        n++;
      }));
      ctx.changed(); ctx.rerender();
      RG.toast(n ? `${n} parceria(s) importada(s) da Seção IV.` : 'Não há Termos de Fomento/Colaboração na Seção IV.');
    };
    const qtdIV = r.s4.fomento.length + r.s4.colaboracao.length;
    return [
      card('Base Normativa', null, textArea('', 's7.base', { defaultKey: 'mroscBase' })),
      card('Parcerias com Organizações da Sociedade Civil', null,
        toggle('Houve parcerias com OSC (MROSC) no exercício', 's7.aplica'),
        !s7.aplica && qtdIV ? h('div', { class: 'notice warn' }, `Atenção: a Seção IV possui ${qtdIV} Termo(s) de Fomento/Colaboração. Se houve parcerias com OSC, marque a opção acima para evitar contradição no relatório.`) : null,
        s7.aplica
          ? [textArea('Texto', 's7.texto', { defaultKey: 'mrosc' }),
            h('div', { class: 'table-actions' }, h('button', { type: 'button', class: 'btn small', onclick: importar }, 'Importar Termos de Fomento/Colaboração da Seção IV')),
            tableEditor({
              rows: s7.parcerias,
              columns: [
                { key: 'osc', label: 'Organização da Sociedade Civil', type: 'area' },
                { key: 'instrumento', label: 'Instrumento', list: ['Termo de Fomento', 'Termo de Colaboração', 'Acordo de Cooperação', 'Termo de Parceria (OSCIP)'], width: '15%' },
                { key: 'numero', label: 'Nº / Ano', width: '9%' }, { key: 'objeto', label: 'Objeto', type: 'area' },
                { key: 'valor', label: 'Valor Repassado (R$)', type: 'money', width: '14%' }, { key: 'situacao', label: 'Situação / Avaliação', type: 'area' },
              ],
              newRow: () => ({ osc: '', instrumento: 'Termo de Fomento', numero: '', objeto: '', valor: '', situacao: '' }),
              totals: moneyTotals(['valor']),
            })]
          : textArea('Declaração de não aplicabilidade', 's7.declaracao', { defaultKey: 'mroscNao' })),
    ];
  };

  V.s8 = () => {
    const s8 = ctx.report.s8;
    const comps = s8.complementares.map((cp, i) => h('div', { class: 'comp' },
      h('div', { class: 'comp-head' },
        h('input', { type: 'text', value: cp.titulo, placeholder: 'Título da seção', oninput: (e) => { cp.titulo = e.target.value; ctx.changed(); } }),
        h('button', { type: 'button', class: 'icon danger', title: 'Remover seção', onclick: () => { s8.complementares.splice(i, 1); ctx.changed(); ctx.rerender(); } }, '✕')),
      textArea('', `s8.complementares.${i}.texto`)));
    return [
      card('Seções complementares (opcional)', 'Inseridas antes das Considerações Finais, com numeração romana sequencial. Use para informações exigidas pela natureza da entidade.',
        comps,
        h('button', { type: 'button', class: 'btn small', onclick: () => { s8.complementares.push({ titulo: '', texto: '' }); ctx.changed(); ctx.rerender(); } }, '+ Adicionar seção')),
      card('Considerações Finais', null, textArea('', 's8.texto', { defaultKey: 'finais', rows: 8 })),
      card('Assinaturas ao final do relatório', 'Se a lista estiver vazia, será usado o gestor signatário da declaração.',
        tableEditor({
          rows: s8.assinaturas,
          columns: [{ key: 'nome', label: 'Nome' }, { key: 'cargo', label: 'Cargo' }],
          newRow: () => ({ nome: '', cargo: '' }),
          empty: 'Usando o signatário da declaração.',
        })),
    ];
  };

  V.preview = () => {
    const doc = B.build(ctx.report);
    return [h('div', { class: 'preview', html: RG.renderHTML(doc) })];
  };

  V.checks = () => {
    const issues = B.validate(ctx.report);
    const nome = Object.fromEntries(SECTIONS.map((s) => [s.id, s.nav]));
    if (!issues.length) return [card('Verificações', null, h('p', { class: 'ok-msg' }, '✓ Nenhuma pendência encontrada. O relatório está pronto para ser gerado.'))];
    const order = { erro: 0, alerta: 1, info: 2 };
    issues.sort((a, b) => order[a.nivel] - order[b.nivel]);
    return [card('Verificações de consistência', 'Pendências e inconsistências detectadas automaticamente. Clique para ir à seção.',
      h('ul', { class: 'issues' }, issues.map((it) => h('li', { class: 'issue ' + it.nivel },
        h('span', { class: 'tag' }, { erro: 'Erro', alerta: 'Alerta', info: 'Info' }[it.nivel]),
        h('a', { href: `#/r/${ctx.report.id}/${it.secao}` }, nome[it.secao] || it.secao),
        h('span', { class: 'msg' }, it.msg)))))];
  };

  function render(container, context, sectionId) {
    ctx = context;
    const sec = SECTIONS.find((s) => s.id === sectionId) || SECTIONS[0];
    container.innerHTML = '';
    container.append(h('h2', { class: 'section-title' }, sec.nav));
    container.append(...[].concat(V[sec.id]()).flat(Infinity).filter(Boolean));
    const idx = SECTIONS.indexOf(sec);
    const prev = SECTIONS[idx - 1], next = SECTIONS[idx + 1];
    container.append(h('div', { class: 'pager' },
      prev ? h('a', { class: 'btn', href: `#/r/${ctx.report.id}/${prev.id}` }, '← ' + prev.nav) : h('span'),
      next ? h('a', { class: 'btn primary', href: `#/r/${ctx.report.id}/${next.id}` }, next.nav + ' →') : h('span')));
  }

  RG.editor = { SECTIONS, render };
})(window.RG = window.RG || {});
