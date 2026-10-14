/*
 * Converte os dados do relatório em um modelo de documento neutro (lista de blocos),
 * consumido pelos renderizadores HTML (pré-visualização), DOCX e PDF.
 *
 * Blocos: cover, toc, h1, h2, h3, p, ul, table, source, signs (local/data + assinaturas), spacer, pagebreak.
 * Células de tabela: {text, align, bold, colSpan, rowSpan}; posições cobertas por mesclagem = null.
 */
(function (RG) {
  'use strict';
  const U = RG.util;

  const QUADROS = [
    { key: 'convenios', titulo: 'Convênios' },
    { key: 'fomento', titulo: 'Termos de Fomento (Lei nº 13.019/2014 – MROSC)' },
    { key: 'colaboracao', titulo: 'Termos de Colaboração (Lei nº 13.019/2014 – MROSC)' },
    { key: 'cooperacao', titulo: 'Acordos de Cooperação e Instrumentos Congêneres' },
  ];

  function loaTexto(s2) {
    if (!s2.loaNumero) return '';
    return `nº ${s2.loaNumero}` + (s2.loaData ? `, de ${U.dateExtenso(s2.loaData)}` : '');
  }

  function enderecoCompleto(r) {
    const id = r.identificacao, c = r.config;
    if (!id.endereco) return '';
    const cidade = c.municipio ? `${c.municipio}/${c.uf}` : '';
    return [id.endereco, cidade, id.cep ? `CEP ${id.cep}` : ''].filter(Boolean).join(', ');
  }

  function variables(r) {
    const c = r.config, id = r.identificacao;
    return {
      denominacao: id.denominacao, municipio: c.municipio, uf: c.uf, estado: c.estado,
      exercicio: String(c.exercicio), gestor: r.declaracao.nome, cargo: r.declaracao.cargo,
      resolucao: c.resolucao, tribunal: c.tribunal, loa: loaTexto(r.s2), cnpj: id.cnpj,
      endereco: enderecoCompleto(r), baseLegal: id.baseLegal,
    };
  }

  // ---------- Cálculos reutilizados pelo editor e pelas validações ----------

  const execRatio = (m) => {
    const d = U.num(m.dotacao);
    return d ? U.num(m.executado) / d : NaN;
  };

  const rpCalculado = (row) => U.num(row.saldoInicial) + U.num(row.inscritos) - U.num(row.baixas);

  const folhaLiquida = (f) => U.num(f.bruta) - U.num(f.naoComputadas);

  const competencia = (mes, ano) => `${U.MESES_ABREV[mes - 1]}/${ano}`;

  // ---------- Construção de tabelas ----------

  const cell = (text, opts) => Object.assign({ text: text == null ? '' : String(text) }, opts || {});
  const R = (v) => cell(U.money(v), { align: 'right' });
  const N = (v) => cell(U.int(v), { align: 'center' });
  const C = (v) => cell(v, { align: 'center' });

  function table(columns, bodyRows, totalCells) {
    const rows = bodyRows.map((cells) => ({ kind: 'body', cells }));
    if (totalCells) rows.push({ kind: 'total', cells: totalCells });
    return { t: 'table', columns, rows };
  }

  /** Linha de total com rótulo mesclado sobre as primeiras `span` colunas. */
  function totalRow(span, label, rest) {
    const cells = [cell(label, { bold: true, colSpan: span, align: 'left' })];
    for (let i = 1; i < span; i++) cells.push(null);
    return cells.concat(rest.map((c) => Object.assign(c, { bold: true })));
  }

  /** Mescla verticalmente células consecutivas com o mesmo texto na coluna `col`. */
  function mergeColumn(rows, col) {
    let i = 0;
    while (i < rows.length) {
      const txt = rows[i][col] && rows[i][col].text;
      let j = i + 1;
      while (j < rows.length && txt && rows[j][col] && rows[j][col].text === txt) j++;
      if (j - i > 1) {
        rows[i][col].rowSpan = j - i;
        for (let k = i + 1; k < j; k++) rows[k][col] = null;
      }
      i = j;
    }
    return rows;
  }

  // ---------- Documento ----------

  function build(r) {
    const c = r.config, id = r.identificacao, ano = c.exercicio;
    const vars = variables(r);
    const T = (s) => U.fill(s, vars);
    const blocks = [];
    let sec = 'capa';
    const add = (...items) => {
      for (const b of items.flat()) { if (b) { b.sec = b.sec || sec; blocks.push(b); } }
    };
    const P = (text) => U.paragraphs(T(text));
    const p = (text, opts) => Object.assign({ t: 'p', runs: U.runs(T(text)), align: 'justify' }, opts || {});
    const h1 = (text) => ({ t: 'h1', text });
    const h2 = (text) => ({ t: 'h2', text });
    const h3 = (text) => ({ t: 'h3', text });
    const source = (text) => (text ? { t: 'source', runs: U.runs(T(text)) } : null);
    const localData = (iso) => [c.localEmissao, U.dateExtenso(iso)].filter(Boolean).join(', ');
    const tituloRelatorio = `RELATÓRIO DE GESTÃO${c.consolidado ? ' CONSOLIDADO' : ''} – ANEXO II`;

    // Capa
    add({
      t: 'cover',
      logo: c.logo,
      estado: (c.estado || '').toUpperCase(),
      orgaoSuperior: (c.orgaoSuperior || '').toUpperCase(),
      denominacao: (id.denominacao || '').toUpperCase(),
      linha1: 'PRESTAÇÃO DE CONTAS ANUAL',
      linha2: `EXERCÍCIO FINANCEIRO DE ${ano}`,
      titulo: tituloRelatorio,
      subtitulo: c.resolucao ? `${c.resolucao} – Normas de Prestação de Contas` : '',
      localData: localData(c.dataRelatorio),
    });
    add({ t: 'pagebreak' });

    if (c.incluirSumario) {
      add({ t: 'toc' }, { t: 'pagebreak' });
    }

    // Declaração de veracidade
    sec = 'declaracao';
    add(h1('DECLARAÇÃO DE VERACIDADE DAS INFORMAÇÕES'), { t: 'spacer', h: 24 });
    add(P(r.declaracao.texto));
    add({ t: 'spacer', h: 18 }, { t: 'signs', local: localData(r.declaracao.data), items: [{ nome: r.declaracao.nome, cargo: r.declaracao.cargo }] });
    add({ t: 'pagebreak' });

    let n = 0;
    const secao = (titulo) => h1(`${U.roman(++n)} – ${titulo}`);

    // I – Informações gerais
    sec = 's1';
    const s1 = r.s1;
    add(secao('INFORMAÇÕES GERAIS SOBRE A UNIDADE E RESPONSÁVEIS'));
    add(h2('Identificação da Unidade, Estrutura Organizacional e Competências'), P(s1.intro));
    add(h3('Dados de Identificação da Unidade'));
    const ident = [
      ['Denominação', id.denominacao + (id.sigla ? ` (${id.sigla})` : '')],
      ['CNPJ', id.cnpj], ['Natureza Jurídica', id.naturezaJuridica], ['Esfera de Governo', id.esfera],
      ['Endereço', id.endereco], ['CEP', id.cep], ['Telefone', id.telefone],
      ['E-mail institucional', id.email], ['Sítio eletrônico', id.site],
      ['Exercício financeiro', String(ano)], ['Base Legal', id.baseLegal],
    ].concat((id.extras || []).filter((e) => e.campo || e.info).map((e) => [e.campo, e.info]));
    add(table([{ header: 'Campo', w: 30 }, { header: 'Informação', w: 70 }],
      ident.map(([k, v]) => [cell(k, { bold: true }), cell(v || '—')])));

    add(h3(`Responsáveis pela Unidade Gestora – Exercício ${ano}`));
    const periodo = (x) => (x.inicio || x.fim ? `${U.dateBR(x.inicio)} a ${U.dateBR(x.fim)}` : '');
    add(table([{ header: 'Cargo', w: 38 }, { header: 'Nome', w: 37 }, { header: 'Período', w: 25, align: 'center' }],
      s1.responsaveis.map((x) => [cell(x.cargo), cell(x.nome), C(periodo(x))])));

    add(h3('Estrutura Organizacional'), P(s1.estrutura));
    const unidades = String(s1.unidades || '').split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    if (unidades.length) add({ t: 'ul', items: unidades.map((u) => U.runs(u)) });
    add(h3('Finalidades e Competências'), P(s1.finalidades));
    if (s1.delegacaoAplica) add(h3('Delegação de Competência'), P(s1.delegacao));

    // II – Gestão orçamentária e financeira
    sec = 's2';
    const s2 = r.s2;
    add(secao('INFORMAÇÕES SOBRE A GESTÃO ORÇAMENTÁRIA E FINANCEIRA'));
    add(h2('Programas de Governo: Metas Físicas e Financeiras'), P(s2.intro));
    add(h3(`Quadro${c.consolidado ? ' Consolidado' : ''} do Comparativo de Metas Físicas e Financeiras – LOA ${ano}`));
    const dotLabel = s2.baseDotacao === 'atualizada' ? 'Dotação Atualizada (R$)' : 'Dotação Inicial (R$)';
    if (s2.metas.length) {
      const totDot = U.sum(s2.metas, 'dotacao'), totExe = U.sum(s2.metas, 'executado');
      add(table([
        { header: 'Programa / Ação', w: 32 }, { header: 'Meta Física Prevista', w: 11, align: 'center' },
        { header: 'Meta Física Realizada', w: 11, align: 'center' }, { header: dotLabel, w: 17, align: 'right' },
        { header: 'Valor Executado (R$)', w: 17, align: 'right' }, { header: '% Exec.', w: 12, align: 'center' },
      ], s2.metas.map((m) => [cell(m.programa), C(m.metaPrevista), C(m.metaRealizada), R(m.dotacao), R(m.executado), C(U.pct(execRatio(m)))]),
      totalRow(1, 'TOTAL', [C('—'), C('—'), R(totDot), R(totExe), C(U.pct(totDot ? totExe / totDot : NaN))])));
    } else {
      add(p('Não foram informados programas para o exercício.'));
    }
    add(h3('Análise das Metas Executadas'), P(s2.analise));
    add(h3('Justificativas para Ações Não Realizadas ou Parcialmente Executadas'));
    const parciais = s2.metas.filter((m) => isFinite(execRatio(m)) && execRatio(m) < 0.99995);
    if (parciais.length) {
      add(P(s2.justificativasIntro));
      add({
        t: 'ul',
        items: parciais.map((m) => [{ text: `${m.programa} (${U.pct(execRatio(m))}): `, bold: true }]
          .concat(U.runs(T(m.justificativa || '[[informar justificativa]]')))),
      });
    } else {
      add(p('Todos os programas atingiram execução financeira integral, não havendo ações parcialmente executadas a justificar.'));
    }
    add(h3('Contingenciamento de Recursos'), P(s2.contingenciamento));
    add(h3('Restos a Pagar'), P(s2.rpTexto));
    const rpTot = (k) => U.sum(s2.rp, k);
    add(table([
      { header: 'Categoria', w: 28 }, { header: 'Saldo Inicial (R$)', w: 18, align: 'right' },
      { header: `Inscritos em ${ano} (R$)`, w: 18, align: 'right' }, { header: `Baixas em ${ano} (R$)`, w: 18, align: 'right' },
      { header: 'Saldo Final (R$)', w: 18, align: 'right' },
    ], s2.rp.map((x) => [cell(x.categoria), R(x.saldoInicial), R(x.inscritos), R(x.baixas), R(x.saldoFinal)]),
    totalRow(1, 'TOTAL', [R(rpTot('saldoInicial')), R(rpTot('inscritos')), R(rpTot('baixas')), R(rpTot('saldoFinal'))])));

    // III – Gestão de pessoas
    sec = 's3';
    const s3 = r.s3;
    add(secao('INFORMAÇÕES SOBRE A GESTÃO DE PESSOAS E TERCEIRIZAÇÃO'));
    add(h2('Quadro de Pessoal e Valores da Folha de Pagamento'), P(s3.pessoalTexto));
    add(table([{ header: 'Categoria', w: 40 }, { header: 'Vínculo', w: 40 }, { header: 'Qtd. Ocupantes', w: 20, align: 'center' }],
      mergeColumn(s3.pessoal.map((x) => [cell(x.categoria), cell(x.vinculo), N(x.qtd)]), 0),
      totalRow(2, 'TOTAL', [N(U.sum(s3.pessoal, 'qtd'))])));
    add(h3(T(s3.folhaTitulo)));
    const fTot = (fn) => s3.folha.reduce((a, f) => a + fn(f), 0);
    add(table([
      { header: 'Competência', w: 19, align: 'center' }, { header: 'Despesa Bruta com Pessoal (R$)', w: 27, align: 'right' },
      { header: 'Despesas Não Computadas (R$)', w: 27, align: 'right' }, { header: 'Despesa Líquida com Pessoal (R$)', w: 27, align: 'right' },
    ], s3.folha.map((f) => [C(competencia(f.mes, ano)), R(f.bruta), R(f.naoComputadas), R(folhaLiquida(f))]),
    totalRow(1, 'TOTAL', [R(fTot((f) => U.num(f.bruta))), R(fTot((f) => U.num(f.naoComputadas))), R(fTot(folhaLiquida))])));
    add(source(s3.folhaFonte));

    add(h2('Demonstrativo de Pessoal Terceirizado'));
    const tercCols = [{ header: 'Categoria / Atividade Terceirizada', w: 34 }, { header: 'Qtd. Postos', w: 12, align: 'center' },
      { header: 'Empresa Contratada', w: 34 }, { header: 'Valor Anual (R$)', w: 20, align: 'right' }];
    if (s3.terceirizacaoAplica) {
      add(P(s3.terceirizacaoTexto));
      add(table(tercCols, s3.terceirizados.map((x) => [cell(x.atividade), N(x.postos), cell(x.empresa), R(x.valor)]),
        totalRow(1, 'TOTAL', [N(U.sum(s3.terceirizados, 'postos')), cell(''), R(U.sum(s3.terceirizados, 'valor'))])));
    } else {
      add(P(s3.terceirizacaoNao));
      add(table(tercCols, [[cell('Não se aplica'), C('—'), C('—'), R(0)]]));
    }

    add(h2('Demonstrativo de Benefícios Previdenciários'));
    if (s3.previdenciaAplica) {
      add(P(s3.previdenciaTexto));
      add(table([{ header: 'Beneficiários Pagos', w: 30 }, { header: 'Fonte / Regime', w: 25 },
        { header: 'Segurados', w: 15, align: 'center' }, { header: 'Total Anual (R$)', w: 30, align: 'right' }],
      s3.beneficios.map((x) => [cell(x.tipo), cell(x.fonte), N(x.segurados), R(x.valor)]),
      totalRow(2, 'TOTAL', [N(U.sum(s3.beneficios, 'segurados')), R(U.sum(s3.beneficios, 'valor'))])));
    } else {
      add(P(s3.previdenciaNao));
    }

    add(h2('Discriminação da Remuneração de Diretoria e Conselhos'));
    if (s3.diretoriaAplica) {
      add(P(s3.diretoriaTexto));
      add(table([{ header: 'Órgão / Conselho', w: 28 }, { header: 'Nome', w: 30 }, { header: 'Função', w: 20 },
        { header: 'Remuneração Anual (R$)', w: 22, align: 'right' }],
      s3.diretoria.map((x) => [cell(x.orgao), cell(x.nome), cell(x.funcao), R(x.valor)]),
      totalRow(3, 'TOTAL', [R(U.sum(s3.diretoria, 'valor'))])));
    } else {
      add(P(s3.diretoriaNao));
    }

    // IV – Transferências
    sec = 's4';
    const s4 = r.s4;
    add(secao('INFORMAÇÕES SOBRE TRANSFERÊNCIAS DE RECURSOS'));
    add(h2('Convênios, Termos de Fomento, Termos de Colaboração, Acordos de Cooperação e Instrumentos Congêneres'), P(s4.intro));
    QUADROS.forEach((q, i) => {
      add(h3(`Quadro ${String.fromCharCode(65 + i)} – ${q.titulo}`));
      const rows = s4[q.key] || [];
      if (!rows.length) {
        add(p('Não houve instrumentos desta natureza vigentes ou com execução no exercício.'));
        return;
      }
      add(table([{ header: 'Qtde', w: 7, align: 'center' }, { header: 'Unidade Gestora', w: 24 },
        { header: q.key === 'convenios' ? 'Entidade Convenente / Objeto' : 'Entidade Parceira / Objeto', w: 35 },
        { header: 'Valor Repassado (R$)', w: 18, align: 'right' }, { header: 'Situação', w: 16, align: 'center' }],
      rows.map((x) => [C(x.qtde), cell(x.ug), cell(x.entidade), R(x.valor), C(x.situacao)]),
      totalRow(3, 'TOTAL', [R(U.sum(rows, 'valor')), cell('')])));
    });

    // V – Licitações e contratos
    sec = 's5';
    const s5 = r.s5;
    add(secao('INFORMAÇÕES SOBRE LICITAÇÕES E CONTRATOS'));
    add(h2('Valores Anuais de Despesas por Modalidade de Licitação, Dispensa e Inexigibilidade'), P(s5.intro));
    const qtdNumerica = s5.modalidades.every((m) => U.isBlank(m.qtd) || isFinite(U.parseNum(m.qtd)));
    add(table([{ header: 'Modalidade / Fundamento Legal', w: 55 }, { header: 'Qtd. Processos', w: 18, align: 'center' },
      { header: 'Valor Total Empenhado (R$)', w: 27, align: 'right' }],
    s5.modalidades.map((m) => [cell(m.modalidade), C(U.isBlank(m.qtd) ? '—' : m.qtd), R(U.num(m.valor))]),
    totalRow(1, 'TOTAL GERAL', [C(qtdNumerica ? U.int(U.sum(s5.modalidades, 'qtd')) : ''), R(U.sum(s5.modalidades, 'valor'))])));
    add(source(s5.fonte));
    add(h2('Órgão de Imprensa Oficial'), P(s5.imprensaTexto));
    if (s5.imprensa.length) {
      add(table([{ header: 'Veículo de Publicação', w: 40 }, { header: 'Atos Publicados', w: 60 }],
        s5.imprensa.map((x) => [cell(x.veiculo), cell(x.atos)])));
    }
    add(h2('Recomendações do Controle Interno e Providências Adotadas'), P(s5.controleTexto));
    if (s5.controleQuadro && s5.recomendacoes.length) {
      add(table([{ header: 'Recomendação', w: 40 }, { header: 'Providência Adotada', w: 40 }, { header: 'Situação', w: 20, align: 'center' }],
        s5.recomendacoes.map((x) => [cell(x.recomendacao), cell(x.providencia), C(x.situacao)])));
    }

    // VI – Contrato de gestão com OS
    sec = 's6';
    const s6 = r.s6;
    add(secao('ACOMPANHAMENTO DE CONTRATO DE GESTÃO COM ORGANIZAÇÃO SOCIAL'));
    if (s6.aplica) {
      add(P(s6.texto));
      add(table([{ header: 'Organização Social', w: 22 }, { header: 'Contrato nº', w: 12, align: 'center' }, { header: 'Objeto', w: 24 },
        { header: 'Valor Repassado (R$)', w: 17, align: 'right' }, { header: 'Avaliação dos Resultados', w: 25 }],
      s6.contratos.map((x) => [cell(x.os), C(x.contrato), cell(x.objeto), R(x.valor), cell(x.avaliacao)]),
      totalRow(3, 'TOTAL', [R(U.sum(s6.contratos, 'valor')), cell('')])));
    } else {
      add(P(s6.declaracao));
    }

    // VII – MROSC
    sec = 's7';
    const s7 = r.s7;
    add(secao('AVALIAÇÃO DE PARCERIAS COM ORGANIZAÇÕES DA SOCIEDADE CIVIL – MROSC'));
    add(h3('Base Normativa'), P(s7.base));
    if (s7.aplica) {
      add(h3('Parcerias Vigentes no Exercício'), P(s7.texto));
      add(table([{ header: 'Organização da Sociedade Civil', w: 22 }, { header: 'Instrumento', w: 13 }, { header: 'Nº / Ano', w: 9, align: 'center' },
        { header: 'Objeto', w: 20 }, { header: 'Valor Repassado (R$)', w: 15, align: 'right' }, { header: 'Situação / Avaliação', w: 21 }],
      s7.parcerias.map((x) => [cell(x.osc), cell(x.instrumento), C(x.numero), cell(x.objeto), R(x.valor), cell(x.situacao)]),
      totalRow(4, 'TOTAL', [R(U.sum(s7.parcerias, 'valor')), cell('')])));
    } else {
      add(h3('Declaração'), P(s7.declaracao));
    }

    // Seções complementares (opcionais) e considerações finais
    sec = 's8';
    const s8 = r.s8;
    for (const comp of s8.complementares || []) {
      if (!comp.titulo && !comp.texto) continue;
      add(secao((comp.titulo || 'INFORMAÇÕES COMPLEMENTARES').toUpperCase()), P(comp.texto));
    }
    add(secao('CONSIDERAÇÕES FINAIS'), P(s8.texto));
    const assin = (s8.assinaturas || []).filter((a) => a.nome || a.cargo);
    add({ t: 'spacer', h: 18 }, {
      t: 'signs', local: localData(c.dataRelatorio),
      items: assin.length ? assin : [{ nome: r.declaracao.nome, cargo: r.declaracao.cargo }],
    });

    const sigla = (id.denominacao || '').toUpperCase() + (c.uf ? `/${c.uf}` : '');
    return {
      blocks,
      header: `${sigla}  |  RELATÓRIO DE GESTÃO – ANEXO II  |  EXERCÍCIO ${ano}`,
      footer: `${c.resolucao ? c.resolucao + '  |  ' : ''}Exercício Financeiro ${ano}`,
      title: `${tituloRelatorio} – ${id.denominacao} – ${ano}`,
      fileBase: `Relatorio_Gestao_AnexoII_${U.slug(id.denominacao) || 'Relatorio'}_${ano}`,
    };
  }

  // ---------- Verificações de consistência ----------

  function blockText(b) {
    const runsText = (rs) => (rs || []).map((x) => x.text).join('');
    switch (b.t) {
      case 'p': case 'source': return runsText(b.runs);
      case 'ul': return b.items.map(runsText).join('\n');
      case 'h1': case 'h2': case 'h3': return b.text;
      case 'table': return b.rows.map((row) => row.cells.map((x) => (x ? x.text : '')).join(' ')).join('\n');
      case 'signs': return [b.local].concat(b.items.map((a) => `${a.nome} ${a.cargo}`)).join('\n');
      case 'cover': return [b.subtitulo, b.localData].join(' ');
      default: return '';
    }
  }

  function validate(r) {
    const out = [];
    const add = (nivel, secao, msg) => out.push({ nivel, secao, msg });
    const c = r.config, id = r.identificacao, ano = +c.exercicio;

    // Capa / configurações
    if (!ano || ano < 2000 || ano > 2100) add('erro', 'capa', 'Exercício financeiro inválido.');
    if (!c.municipio) add('alerta', 'capa', 'Município não informado.');
    if (!c.tribunal) add('alerta', 'capa', 'Tribunal de Contas não informado.');
    if (!c.dataRelatorio) add('alerta', 'capa', 'Data do relatório não informada.');
    else if (ano && c.dataRelatorio <= `${ano}-12-31`) add('alerta', 'capa', `A data do relatório (${U.dateBR(c.dataRelatorio)}) não é posterior ao encerramento do exercício de ${ano}.`);
    if (c.dataRelatorio && r.declaracao.data && c.dataRelatorio !== r.declaracao.data) {
      add('info', 'declaracao', `A data da declaração (${U.dateBR(r.declaracao.data)}) difere da data do relatório na capa (${U.dateBR(c.dataRelatorio)}).`);
    }

    // Declaração
    if (!r.declaracao.nome) add('erro', 'declaracao', 'Nome do gestor signatário não informado.');
    if (!r.declaracao.cargo) add('erro', 'declaracao', 'Cargo do gestor signatário não informado.');

    // I
    if (!id.denominacao) add('erro', 's1', 'Denominação da unidade não informada.');
    if (!id.cnpj) add('erro', 's1', 'CNPJ não informado.');
    else if (!U.cnpjValido(id.cnpj)) add('alerta', 's1', `CNPJ ${id.cnpj} com dígitos verificadores inválidos.`);
    if (!id.endereco) add('alerta', 's1', 'Endereço não informado.');
    if (id.cep && !/^\d{2}\.?\d{3}-?\d{3}$/.test(id.cep.trim())) add('alerta', 's1', `CEP "${id.cep}" fora do formato 00.000-000.`);
    if (id.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id.email.trim())) add('alerta', 's1', `E-mail "${id.email}" inválido.`);
    if (!id.baseLegal) add('alerta', 's1', 'Base legal de criação não informada.');
    const semNome = r.s1.responsaveis.filter((x) => !x.nome).length;
    if (!r.s1.responsaveis.length) add('alerta', 's1', 'Nenhum responsável informado.');
    else if (semNome) add('alerta', 's1', `${semNome} responsável(is) sem nome preenchido.`);
    r.s1.responsaveis.forEach((x) => {
      if ((x.inicio && x.inicio.slice(0, 4) !== String(ano)) || (x.fim && x.fim.slice(0, 4) !== String(ano))) {
        add('alerta', 's1', `Período de "${x.cargo || x.nome}" está fora do exercício de ${ano}.`);
      }
      if (x.inicio && x.fim && x.inicio > x.fim) add('erro', 's1', `Período de "${x.cargo || x.nome}" com data inicial posterior à final.`);
    });

    // II
    const s2 = r.s2;
    if (!s2.metas.length) add('alerta', 's2', 'Quadro de metas físicas e financeiras sem programas.');
    if (!s2.loaNumero) add('alerta', 's2', 'Número da LOA não informado.');
    const semJust = s2.metas.filter((m) => isFinite(execRatio(m)) && execRatio(m) < 0.99995 && !String(m.justificativa || '').trim());
    if (semJust.length) add('alerta', 's2', `Programas com execução inferior a 100% sem justificativa: ${semJust.map((m) => m.programa || '(sem nome)').join('; ')}.`);
    s2.metas.filter((m) => execRatio(m) > 1.00005).forEach((m) => add('info', 's2', `"${m.programa}" executou acima da dotação informada (${U.pct(execRatio(m))}). Verifique se a base deveria ser a dotação atualizada.`));
    s2.rp.filter((row) => U.isBlank(row.saldoFinal) && ['saldoInicial', 'inscritos', 'baixas'].some((k) => !U.isBlank(row[k])))
      .forEach((row) => add('alerta', 's2', `${row.categoria}: saldo final não informado.`));
    const rpDiffs = s2.rp
      .filter((row) => !U.isBlank(row.saldoFinal))
      .map((row) => ({ row, diff: U.num(row.saldoFinal) - rpCalculado(row) }))
      .filter((x) => Math.abs(x.diff) >= 0.01);
    const rpLiquido = rpDiffs.reduce((a, x) => a + x.diff, 0);
    if (rpDiffs.length === 2 && Math.abs(rpLiquido) < 0.01) {
      // Diferenças que se anulam entre RPP e RPNP indicam RPNP liquidados reclassificados para processados.
      add('info', 's2', `As diferenças de saldo entre Restos a Pagar Processados e Não Processados se compensam (R$ ${U.money(Math.abs(rpDiffs[0].diff))}), o que indica RPNP liquidados reclassificados como processados. Recomenda-se evidenciar a reclassificação no texto.`);
    } else {
      rpDiffs.forEach(({ row, diff }) => {
        add('alerta', 's2', `${row.categoria}: saldo final informado (R$ ${U.money(U.num(row.saldoFinal))}) difere de Saldo Inicial + Inscritos − Baixas (R$ ${U.money(rpCalculado(row))}). Diferença: R$ ${U.money(diff)}.`);
      });
    }
    if (s2.rp.every((row) => ['saldoInicial', 'inscritos', 'baixas', 'saldoFinal'].every((k) => U.isBlank(row[k])))) {
      add('alerta', 's2', 'Demonstrativo de Restos a Pagar não preenchido.');
    }

    // III
    const s3 = r.s3;
    if (!U.sum(s3.pessoal, 'qtd')) add('alerta', 's3', 'Quadro de pessoal sem quantitativos.');
    if (!s3.folha.some((f) => U.num(f.bruta))) add('alerta', 's3', 'Despesas mensais com pessoal não preenchidas.');
    s3.folha.forEach((f) => {
      if (U.num(f.naoComputadas) > U.num(f.bruta)) add('erro', 's3', `${competencia(f.mes, ano)}: despesas não computadas superiores à despesa bruta.`);
    });
    if (s3.terceirizacaoAplica && !s3.terceirizados.length) add('alerta', 's3', 'Terceirização marcada como aplicável, mas nenhum contrato foi informado.');
    if (s3.previdenciaAplica && !U.sum(s3.beneficios, 'valor')) add('alerta', 's3', 'Benefícios previdenciários marcados como aplicáveis, mas sem valores.');
    if (s3.diretoriaAplica && !s3.diretoria.length) add('alerta', 's3', 'Remuneração de diretoria/conselhos marcada como aplicável, mas sem registros.');

    // IV
    const s4 = r.s4;
    QUADROS.forEach((q) => {
      const semValor = (s4[q.key] || []).filter((x) => U.isBlank(x.valor) && q.key !== 'cooperacao').length;
      if (semValor) add('alerta', 's4', `${q.titulo}: ${semValor} instrumento(s) sem valor repassado.`);
    });

    // V
    if (!U.sum(r.s5.modalidades, 'valor')) add('alerta', 's5', 'Despesas por modalidade de licitação não preenchidas.');

    // VI / VII
    if (r.s6.aplica && !r.s6.contratos.length) add('alerta', 's6', 'Contrato de gestão com OS marcado como aplicável, mas nenhum contrato foi informado.');
    if (r.s7.aplica && !r.s7.parcerias.length) add('alerta', 's7', 'Parcerias MROSC marcadas como aplicáveis, mas nenhuma parceria foi informada.');
    const mroscIV = s4.fomento.length + s4.colaboracao.length;
    if (!r.s7.aplica && mroscIV) {
      add('alerta', 's7', `Há ${mroscIV} Termo(s) de Fomento/Colaboração na Seção IV, mas a Seção VII declara que não houve parcerias com OSC. Revise para evitar contradição.`);
    }

    // Textos: orientações [[...]] e marcadores {x} não resolvidos no documento final
    const vars = variables(r);
    const pend = {}, marc = {};
    for (const b of build(r).blocks) {
      const txt = blockText(b);
      const n = (txt.match(/\[\[[\s\S]*?\]\]/g) || []).length;
      if (n) pend[b.sec] = (pend[b.sec] || 0) + n;
      U.unresolved(txt, vars).forEach((m) => { (marc[b.sec] = marc[b.sec] || new Set()).add(m); });
    }
    Object.keys(pend).forEach((s) => add('alerta', s, `${pend[s]} trecho(s) com orientação de preenchimento [[...]] ainda não substituído(s).`));
    Object.keys(marc).forEach((s) => add('alerta', s, `Marcador(es) sem valor: ${[...marc[s]].join(', ')}.`));

    return out;
  }

  RG.builder = { build, validate, variables, execRatio, rpCalculado, folhaLiquida, competencia, QUADROS };
})(window.RG = window.RG || {});
