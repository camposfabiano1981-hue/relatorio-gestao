/* Modelo de dados do relatório, textos-padrão e regras de criação/duplicação. */
(function (RG) {
  'use strict';
  const U = RG.util;

  const SCHEMA_VERSION = 1;

  const TIPOS = {
    direta: 'Administração Direta – Poder Executivo (Prefeitura)',
    camara: 'Poder Legislativo (Câmara Municipal)',
    autarquia: 'Autarquia',
    fundacao: 'Fundação Pública',
    fundo: 'Fundo Municipal / Fundo Especial',
    rpps: 'Regime Próprio de Previdência Social (RPPS)',
    empresa: 'Empresa Estatal Dependente',
    consorcio: 'Consórcio Público',
  };

  const NATUREZAS = [
    'Município',
    'Órgão Público do Poder Executivo Municipal',
    'Órgão Público do Poder Legislativo Municipal',
    'Autarquia Municipal',
    'Fundação Pública de Direito Público Municipal',
    'Fundação Pública de Direito Privado Municipal',
    'Fundo Público da Administração Direta Municipal',
    'Fundo Público da Administração Indireta Municipal',
    'Consórcio Público de Direito Público (Associação Pública)',
    'Empresa Pública',
    'Sociedade de Economia Mista',
    'Administração Pública em Geral',
  ];

  const NATUREZA_PADRAO = {
    direta: 'Município', camara: 'Órgão Público do Poder Legislativo Municipal',
    autarquia: 'Autarquia Municipal', fundacao: 'Fundação Pública de Direito Público Municipal',
    fundo: 'Fundo Público da Administração Direta Municipal', rpps: 'Autarquia Municipal',
    empresa: 'Empresa Pública', consorcio: 'Consórcio Público de Direito Público (Associação Pública)',
  };

  const ESTADOS = {
    AC: 'Estado do Acre', AL: 'Estado de Alagoas', AP: 'Estado do Amapá', AM: 'Estado do Amazonas',
    BA: 'Estado da Bahia', CE: 'Estado do Ceará', DF: 'Distrito Federal', ES: 'Estado do Espírito Santo',
    GO: 'Estado de Goiás', MA: 'Estado do Maranhão', MT: 'Estado de Mato Grosso',
    MS: 'Estado de Mato Grosso do Sul', MG: 'Estado de Minas Gerais', PA: 'Estado do Pará',
    PB: 'Estado da Paraíba', PR: 'Estado do Paraná', PE: 'Estado de Pernambuco', PI: 'Estado do Piauí',
    RJ: 'Estado do Rio de Janeiro', RN: 'Estado do Rio Grande do Norte', RS: 'Estado do Rio Grande do Sul',
    RO: 'Estado de Rondônia', RR: 'Estado de Roraima', SC: 'Estado de Santa Catarina',
    SP: 'Estado de São Paulo', SE: 'Estado de Sergipe', TO: 'Estado do Tocantins',
  };

  const SITUACOES = ['Em execução', 'Concluído', 'Em prestação de contas', 'Prestação de contas aprovada',
    'Prestação de contas em análise', 'Rescindido', 'Suspenso'];

  const MODALIDADES = [
    'Pregão Eletrônico (art. 28, I, Lei nº 14.133/2021)',
    'Concorrência (art. 28, II, Lei nº 14.133/2021)',
    'Concurso (art. 28, III, Lei nº 14.133/2021)',
    'Leilão (art. 28, IV, Lei nº 14.133/2021)',
    'Diálogo Competitivo (art. 28, V, Lei nº 14.133/2021)',
    'Dispensa de Licitação (art. 75, Lei nº 14.133/2021)',
    'Inexigibilidade (art. 74, Lei nº 14.133/2021)',
    'Credenciamento (art. 79, Lei nº 14.133/2021)',
  ];

  /** Marcadores disponíveis nos textos (exibidos como ajuda no editor). */
  const MARCADORES = {
    denominacao: 'Denominação da unidade', municipio: 'Município', uf: 'UF', estado: 'Estado (por extenso)',
    exercicio: 'Exercício financeiro', gestor: 'Nome do gestor signatário', cargo: 'Cargo do gestor',
    resolucao: 'Norma do Tribunal de Contas', tribunal: 'Tribunal de Contas', loa: 'Lei Orçamentária Anual',
    cnpj: 'CNPJ', endereco: 'Endereço completo', baseLegal: 'Base legal de criação',
  };

  const isDireta = (tipo) => tipo === 'direta';

  function textosPadrao(tipo, consolidado) {
    const direta = isDireta(tipo);
    const artigo = tipo === 'fundo' || tipo === 'consorcio' ? 'O' : 'A';
    const art = artigo.toLowerCase();
    const daUnidade = (art === 'o' ? 'do ' : 'da ') + '{denominacao}';

    const intro1 = {
      direta: 'A {denominacao} é o órgão central do Poder Executivo Municipal, responsável pela administração pública do Município de {municipio}, {estado}, com sede localizada em {endereco}.',
      camara: 'A {denominacao} é o órgão do Poder Legislativo do Município de {municipio}, {estado}, com sede localizada em {endereco}, competindo-lhe as funções legislativa, fiscalizadora e de controle externo, com o auxílio do Tribunal de Contas.',
      fundo: 'O {denominacao} é fundo especial instituído por {baseLegal}, integrante da Administração Pública do Município de {municipio}, {estado}, destinado a [[descrever a finalidade do fundo]].',
      consorcio: 'O {denominacao} é consórcio público constituído nos termos da Lei Federal nº 11.107/2005, por meio de {baseLegal}, com sede localizada em {endereco}.',
    }[tipo] || `${artigo} {denominacao} é entidade da Administração Indireta do Município de {municipio}, {estado}, instituída por {baseLegal}, com sede localizada em {endereco}.`;

    const estrutura = direta
      ? 'Os órgãos da administração direta compreendem os serviços estatais encarregados das atividades próprias da gestão municipal, instituídos para executar as funções conferidas ao Poder Executivo, sendo agrupados nas seguintes dimensões:\n'
        + '- **Atuação instrumental:** reúne os órgãos que atuam nas atividades de planejamento, coordenação, controle e execução das ações voltadas à provisão dos meios instrumentais e operacionais necessários à efetivação das ações da administração municipal;\n'
        + '- **Fomento ao desenvolvimento integrado e sustentável:** compreende os órgãos responsáveis pela formulação de políticas públicas voltadas ao desenvolvimento econômico e sustentável do Município;\n'
        + '- **Desenvolvimento e promoção social:** agrupa os órgãos responsáveis pelas ações voltadas ao desenvolvimento social, bem como à promoção e à defesa da cidadania e dos direitos humanos.\n'
        + `A estrutura administrativa ${consolidado ? 'consolidada ' : ''}é composta pelos seguintes órgãos, fundos e entidades, conforme Lei Orgânica Municipal e legislação específica em vigor:`
      : `A estrutura organizacional ${daUnidade} é composta pelas seguintes unidades, conforme legislação específica em vigor:`;

    const finalidades = direta
      ? 'O Poder Executivo, por meio de ações diretas e indiretas, organiza-se com a finalidade de garantir à população condições dignas de vida, promovendo o crescimento econômico e o desenvolvimento sustentável e social.\n'
        + 'A organização do Poder Executivo estrutura-se em dois conjuntos permanentes: a administração direta e a administração indireta, integradas segundo os objetivos e metas que devem alcançar conjuntamente.\n'
        + 'A administração direta compreende os órgãos municipais encarregados das atividades exclusivas da administração pública, responsáveis pelo planejamento, comando, coordenação, controle e execução das atividades de competência da Prefeitura Municipal.\n'
        + 'A administração indireta compreende as entidades dotadas de personalidade jurídica própria — autarquias, fundações e empresas públicas — instituídas para o desenvolvimento de atividades de cunho econômico ou social, com autonomia administrativa e financeira.'
      : `Compete ${art === 'o' ? 'ao' : 'à'} {denominacao}, nos termos de {baseLegal}: [[descrever as finalidades e competências legais]].`;

    const delegacao = direta
      ? 'No âmbito do Poder Executivo é adotada a delegação de competência como instrumento de descentralização administrativa, com o objetivo de assegurar maior celeridade e objetividade nas decisões e nos procedimentos de execução.\n'
        + 'O Chefe do Poder Executivo delega competências aos Secretários Municipais, ao Procurador-Geral do Município e a outros titulares de cargos de direção superior, para a prática de atos administrativos de gestão, por meio de [[ato legal de delegação]].\n'
        + 'O ato de delegação indica, com precisão e clareza, a autoridade delegante, a autoridade delegada e as atribuições objeto da delegação, bem como, se for o caso, o prazo para a sua execução, em conformidade com [[legislação municipal aplicável]].'
      : `No âmbito ${daUnidade}, a ordenação de despesas é exercida por [[cargo do ordenador de despesas]], por delegação de competência conferida por [[ato legal de delegação]].`;

    return {
      declaracao: 'Eu, {gestor}, na qualidade de {cargo} – {denominacao}, no exercício de minhas atribuições legais, declaro, sob as penas da lei, que as informações e os documentos que compõem a presente '
        + (consolidado ? 'Prestação de Contas Consolidada' : 'Prestação de Contas')
        + ' referente ao exercício financeiro de {exercicio} são verdadeiros, íntegros e fidedignos, estando de acordo com os registros contábeis e administrativos, bem como com as normas estabelecidas pelo {tribunal}, em especial a {resolucao}.',
      intro1, estrutura, finalidades, delegacao,
      intro2: `Apresenta-se${consolidado ? ', de forma consolidada,' : ''} a relação dos programas constantes da Lei Orçamentária Anual (LOA) {loa}, com o comparativo entre as metas físicas e financeiras previstas e as efetivamente realizadas, bem como as justificativas para as ações não executadas ou parcialmente executadas, em cumprimento ao art. 74 da Constituição Federal e às normas do {tribunal}.`,
      analise: 'De forma geral, observa-se [[avaliar o desempenho da execução das metas físicas e financeiras]].\nO desempenho global evidencia [[compatibilidade/incompatibilidade]] entre o planejamento orçamentário e a capacidade de execução, demonstrando a condução da política fiscal e administrativa ao longo do exercício.',
      justificativasIntro: 'Para os programas que apresentaram execução financeira inferior a 100%, destacam-se as seguintes justificativas:',
      contingenciamento: '[[Informe se houve limitação de empenho e movimentação financeira (art. 9º da LRF) ou medidas de contenção de despesas, indicando o ato normativo e seus efeitos. Caso não tenha havido, declare expressamente.]]',
      rp: `Apresenta-se a seguir o demonstrativo${consolidado ? ' consolidado' : ''} dos Restos a Pagar no exercício de {exercicio}, em conformidade com o art. 36 da Lei nº 4.320/1964, o Manual de Contabilidade Aplicada ao Setor Público (MCASP, 11ª edição) e as orientações da Secretaria do Tesouro Nacional (STN).\n`
        + 'Os Restos a Pagar referem-se a despesas regularmente empenhadas, com respaldo orçamentário e financeiro, cuja execução física ou financeira não se concluiu até 31 de dezembro. A inscrição observou os critérios legais, não caracterizando assunção de obrigações sem disponibilidade de recursos.',
      pessoal: 'O quadro de pessoal ' + daUnidade + ', no exercício de {exercicio}, é composto pelas seguintes categorias funcionais, conforme registros do setor de Recursos Humanos:',
      folhaTitulo: `Despesas com Pessoal e Encargos Sociais${consolidado ? ' – Consolidado' : ''} – Exercício {exercicio}`,
      folhaFonte: 'Fonte: Anexo I – Despesas com Pessoal e Encargos Sociais',
      terceirizacao: 'Nos termos do art. 18, §1º, da Lei de Responsabilidade Fiscal, os valores dos contratos de terceirização de mão de obra que se referem à substituição de servidores e empregados públicos são contabilizados como “Outras Despesas de Pessoal Decorrentes de Contratos de Terceirização” (natureza 3.3.90.34). Apresentam-se a seguir os contratos dessa natureza vigentes no exercício:',
      terceirizacaoNao: 'Nos termos do art. 18, §1º, da Lei de Responsabilidade Fiscal, os valores dos contratos de terceirização de mão de obra que se referem à substituição de servidores e empregados públicos devem ser contabilizados como “Outras Despesas de Pessoal Decorrentes de Contratos de Terceirização”.\n'
        + 'No âmbito ' + daUnidade + ', não há contratos de terceirização de mão de obra em substituição de servidores ou empregados públicos, razão pela qual não há despesas classificadas na natureza 3.3.90.34 – Outras Despesas de Pessoal Decorrentes de Contratos de Terceirização.',
      previdencia: 'Os servidores efetivos estão vinculados ao Regime Próprio de Previdência Social (RPPS), instituído por [[lei municipal]], sendo os benefícios custeados por contribuições patronais e dos servidores ativos.\nApresentam-se a seguir os benefícios previdenciários pagos no exercício de {exercicio}:',
      previdenciaNao: 'Não houve pagamento de benefícios previdenciários ' + (art === 'o' ? 'pelo' : 'pela') + ' {denominacao} no exercício de {exercicio}.',
      diretoria: 'Apresenta-se a seguir a discriminação da remuneração paga aos membros de diretoria e conselhos no exercício de {exercicio}:',
      diretoriaNao: (art === 'o' ? 'O' : 'A') + ' {denominacao} não possui diretorias e conselhos remunerados, razão pela qual não se aplica a divulgação dessas informações.',
      intro4: `Relacionam-se a seguir os instrumentos de transferência de recursos vigentes ou com execução no exercício de {exercicio}${consolidado ? ', de forma consolidada,' : ''} nos quais ${art} {denominacao} figura como convenente, concedente ou partícipe, incluídos os instrumentos regulados pela Lei nº 13.019/2014 (MROSC – Marco Regulatório das Organizações da Sociedade Civil), pelo Decreto Federal nº 8.726/2016 e pela Lei Federal nº 11.107/2005 (consórcios públicos), quando aplicável.`,
      intro5: `O demonstrativo a seguir apresenta o total${consolidado ? ' consolidado' : ''} das despesas empenhadas no exercício de {exercicio}, classificadas por modalidade licitatória, em conformidade com a Lei nº 14.133/2021 (Lei de Licitações e Contratos Administrativos). As informações foram extraídas do sistema de contabilidade pública.`,
      fonte5: 'Fonte: [[sistema contábil]]',
      imprensa: 'As publicações dos contratos, extratos e atos oficiais são realizadas nos veículos a seguir, conforme exigência da Lei nº 14.133/2021:',
      controle: '[[Relacione as recomendações emitidas pela unidade de controle interno no exercício e as providências adotadas pela gestão.]]',
      os: 'Apresenta-se a seguir o acompanhamento dos Contratos de Gestão celebrados com Organizações Sociais (OS), nos termos da Lei Federal nº 9.637/1998 e da legislação municipal específica, com a avaliação dos resultados alcançados no exercício de {exercicio}:',
      osNao: 'Declara-se que, no âmbito ' + daUnidade + ', não se aplica a matéria, uma vez que não houve celebração de Contrato de Gestão com Organização Social (OS), nos termos da Lei Federal nº 9.637/1998 ou de legislação municipal específica, no exercício de {exercicio}.',
      mroscBase: 'Esta seção observa a Lei nº 13.019/2014 (Marco Regulatório das Organizações da Sociedade Civil – MROSC), com as alterações promovidas pela Lei nº 13.204/2015, e o Decreto Federal nº 8.726/2016. Os instrumentos aplicáveis são: Termo de Fomento (iniciativa da OSC), Termo de Colaboração (iniciativa do Poder Público) e Acordo de Cooperação (sem repasse de recursos). O Termo de Parceria com OSCIP (Lei nº 9.790/1999) somente é admitido para instrumentos celebrados anteriormente à vigência do MROSC e ainda em vigor.',
      mrosc: 'Apresenta-se a seguir a avaliação das parcerias celebradas com Organizações da Sociedade Civil vigentes no exercício de {exercicio}, contemplando o cumprimento do objeto, a regularidade das prestações de contas e o monitoramento realizado pela comissão designada:',
      mroscNao: 'Declara-se que ' + art + ' {denominacao} não celebrou parcerias com Organizações da Sociedade Civil (OSC), nos termos da Lei Federal nº 13.019/2014 (MROSC), durante o exercício de {exercicio}.',
      finais: `À vista das informações apresentadas, verifica-se que a gestão${consolidado ? ' consolidada' : ''}, no período analisado, foi conduzida em observância aos princípios da legalidade, da eficiência e da transparência, buscando o cumprimento das metas e dos objetivos estabelecidos.\n`
        + 'Os resultados alcançados demonstram o empenho na execução das ações planejadas, embora tenham sido identificados desafios operacionais e limitações que demandam o constante aperfeiçoamento dos processos administrativos e de controle.\n'
        + 'Ressalta-se que as atividades desenvolvidas mantiveram conformidade com a legislação vigente, tendo sido adotadas medidas corretivas e preventivas sempre que necessárias, com vistas ao aprimoramento da gestão e à melhoria contínua dos serviços prestados.\n'
        + 'Por fim, reafirma-se o compromisso da administração com a boa governança, a responsabilidade na aplicação dos recursos públicos e a busca permanente por maior eficiência e qualidade na execução das políticas públicas.',
    };
  }

  function responsaveisPadrao(tipo, ano) {
    const cargos = {
      direta: ['Prefeito(a) Municipal', 'Vice-Prefeito(a)', 'Secretário(a) Municipal de Finanças', 'Procurador(a)-Geral do Município', 'Controlador(a)-Geral', 'Contador(a) Responsável'],
      camara: ['Presidente da Câmara', 'Primeiro(a) Secretário(a)', 'Controlador(a) Interno(a)', 'Contador(a) Responsável'],
    }[tipo] || ['Diretor(a)-Presidente / Gestor(a)', 'Ordenador(a) de Despesas', 'Controlador(a) Interno(a)', 'Contador(a) Responsável'];
    return cargos.map((cargo) => ({ cargo, nome: '', inicio: `${ano}-01-01`, fim: `${ano}-12-31` }));
  }

  const rpPadrao = () => [
    { categoria: 'Restos a Pagar Processados', saldoInicial: '', inscritos: '', baixas: '', saldoFinal: '' },
    { categoria: 'Restos a Pagar Não Processados', saldoInicial: '', inscritos: '', baixas: '', saldoFinal: '' },
  ];

  const folhaPadrao = () => Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, bruta: '', naoComputadas: '' }));

  function newReport(opts) {
    const o = Object.assign({ tipo: 'direta', consolidado: false, uf: 'MS', municipio: '', denominacao: '', exercicio: new Date().getFullYear() - 1 }, opts);
    const ano = +o.exercicio;
    const tx = textosPadrao(o.tipo, o.consolidado);
    const estado = ESTADOS[o.uf] || '';
    const now = new Date().toISOString();
    return {
      schema: SCHEMA_VERSION,
      id: U.uid(),
      criadoEm: now,
      atualizadoEm: now,
      config: {
        tipoEntidade: o.tipo,
        consolidado: !!o.consolidado,
        uf: o.uf,
        estado,
        municipio: o.municipio,
        orgaoSuperior: '',
        exercicio: ano,
        resolucao: o.uf === 'MS' ? 'Resolução TCE-MS nº 273/2025' : '[[norma de prestação de contas do Tribunal]]',
        tribunal: estado ? `Tribunal de Contas do ${estado}` : '',
        localEmissao: o.municipio ? `${o.municipio}-${o.uf}` : '',
        dataRelatorio: U.todayISO(),
        incluirSumario: false,
        logo: null,
      },
      identificacao: {
        denominacao: o.denominacao, sigla: '', cnpj: '', naturezaJuridica: NATUREZA_PADRAO[o.tipo] || '',
        esfera: 'Municipal', endereco: '', cep: '', telefone: '', email: '', site: '', baseLegal: '',
        extras: [],
      },
      declaracao: { nome: '', cargo: '', data: U.todayISO(), texto: tx.declaracao },
      s1: {
        intro: tx.intro1,
        responsaveis: responsaveisPadrao(o.tipo, ano),
        estrutura: tx.estrutura,
        unidades: '',
        finalidades: tx.finalidades,
        delegacaoAplica: true,
        delegacao: tx.delegacao,
      },
      s2: {
        intro: tx.intro2, loaNumero: '', loaData: '', baseDotacao: 'inicial',
        metas: [],
        analise: tx.analise,
        justificativasIntro: tx.justificativasIntro,
        contingenciamento: tx.contingenciamento,
        rpTexto: tx.rp,
        rp: rpPadrao(),
      },
      s3: {
        pessoalTexto: tx.pessoal,
        pessoal: [
          { categoria: 'Efetivos', vinculo: 'Estatutários', qtd: '' },
          { categoria: 'Comissionados', vinculo: 'Comissionados', qtd: '' },
          { categoria: 'Contrato por Prazo Determinado', vinculo: 'Contratados', qtd: '' },
          { categoria: 'Contratos de Estágio', vinculo: 'Estagiários', qtd: '' },
        ],
        folhaTitulo: tx.folhaTitulo,
        folha: folhaPadrao(),
        folhaFonte: tx.folhaFonte,
        terceirizacaoAplica: false,
        terceirizacaoTexto: tx.terceirizacao,
        terceirizacaoNao: tx.terceirizacaoNao,
        terceirizados: [],
        previdenciaAplica: o.tipo === 'direta' || o.tipo === 'rpps',
        previdenciaTexto: tx.previdencia,
        previdenciaNao: tx.previdenciaNao,
        beneficios: [
          { tipo: 'Aposentados', fonte: 'RPPS', segurados: '', valor: '' },
          { tipo: 'Pensionistas', fonte: 'RPPS', segurados: '', valor: '' },
        ],
        diretoriaAplica: false,
        diretoriaTexto: tx.diretoria,
        diretoriaNao: tx.diretoriaNao,
        diretoria: [],
      },
      s4: { intro: tx.intro4, convenios: [], fomento: [], colaboracao: [], cooperacao: [] },
      s5: {
        intro: tx.intro5,
        modalidades: MODALIDADES.map((m) => ({ modalidade: m, qtd: '', valor: '' })),
        fonte: tx.fonte5,
        imprensaTexto: tx.imprensa,
        imprensa: [
          { veiculo: 'Portal Nacional de Contratações Públicas (PNCP)', atos: 'Publicação obrigatória de editais, contratos e resultados' },
          { veiculo: 'Diário Oficial do Município', atos: 'Atos de dispensa, inexigibilidade, extratos contratuais e aditivos' },
          { veiculo: 'Portal da Transparência', atos: 'Disponibilização dos processos licitatórios para acesso ao público' },
        ],
        controleTexto: tx.controle,
        controleQuadro: false,
        recomendacoes: [],
      },
      s6: { aplica: false, texto: tx.os, declaracao: tx.osNao, contratos: [] },
      s7: { aplica: false, base: tx.mroscBase, texto: tx.mrosc, declaracao: tx.mroscNao, parcerias: [] },
      s8: { texto: tx.finais, complementares: [], assinaturas: [] },
    };
  }

  /** Completa chaves ausentes (relatórios importados de versões anteriores ou incompletos). */
  function migrate(r) {
    const base = newReport({ tipo: (r.config && r.config.tipoEntidade) || 'direta', consolidado: r.config && r.config.consolidado });
    (function merge(dst, src) {
      for (const k of Object.keys(src)) {
        if (dst[k] === undefined || dst[k] === null && src[k] !== null) dst[k] = U.clone(src[k]);
        else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]);
      }
    })(r, base);
    if (!Array.isArray(r.s3.folha) || r.s3.folha.length !== 12) r.s3.folha = folhaPadrao();
    r.schema = SCHEMA_VERSION;
    return r;
  }

  /** Cria o relatório do exercício seguinte reaproveitando cadastros e textos e zerando valores. */
  function duplicateForNextYear(src) {
    const r = U.clone(src);
    const ano = +r.config.exercicio + 1;
    const now = new Date().toISOString();
    r.id = U.uid();
    r.criadoEm = now;
    r.atualizadoEm = now;
    r.config.exercicio = ano;
    r.config.dataRelatorio = U.todayISO();
    r.declaracao.data = U.todayISO();
    r.s1.responsaveis.forEach((p) => { p.inicio = `${ano}-01-01`; p.fim = `${ano}-12-31`; });
    r.s2.loaNumero = '';
    r.s2.loaData = '';
    r.s2.metas.forEach((m) => { m.metaPrevista = ''; m.metaRealizada = ''; m.dotacao = ''; m.executado = ''; m.justificativa = ''; });
    // Saldo inicial de RP do novo exercício = saldo final do anterior.
    r.s2.rp.forEach((row) => {
      row.saldoInicial = row.saldoFinal;
      row.inscritos = ''; row.baixas = ''; row.saldoFinal = '';
    });
    r.s3.pessoal.forEach((p) => { p.qtd = ''; });
    r.s3.folha = folhaPadrao();
    r.s3.terceirizados.forEach((t) => { t.valor = ''; });
    r.s3.beneficios.forEach((b) => { b.segurados = ''; b.valor = ''; });
    r.s3.diretoria.forEach((d) => { d.valor = ''; });
    ['convenios', 'fomento', 'colaboracao', 'cooperacao'].forEach((k) => { r.s4[k] = []; });
    r.s5.modalidades.forEach((m) => { m.qtd = ''; m.valor = ''; });
    r.s5.recomendacoes = [];
    r.s6.contratos.forEach((c) => { c.valor = ''; c.avaliacao = ''; });
    r.s7.parcerias = [];
    return r;
  }

  RG.schema = {
    SCHEMA_VERSION, TIPOS, NATUREZAS, ESTADOS, SITUACOES, MODALIDADES, MARCADORES,
    textosPadrao, newReport, migrate, duplicateForNextYear,
  };
})(window.RG = window.RG || {});
