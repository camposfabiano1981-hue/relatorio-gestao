/*
 * Diferenças entre duas versões de um relatório (histórico campo a campo), mesclagem de alterações
 * simultâneas e rótulos legíveis dos campos.
 *
 * Cada alteração (op) tem o caminho do campo em "p" e uma das formas:
 *   { p, de, para }                       valor substituído (de/para ausentes = vazio)
 *   { p, txt: [posição, saiu, entrou] }   trecho alterado em um texto longo
 *   { p, lin: [posição, saíram, entraram] } linhas removidas/inseridas em uma tabela
 * Aplicadas em ordem sobre a versão anterior, as alterações reproduzem a versão seguinte.
 */
(function (RG) {
  'use strict';
  const U = RG.util;

  const TEXTO_LONGO = 80;
  const tipo = (v) => (Array.isArray(v) ? 'lista' : v && typeof v === 'object' ? 'objeto' : 'valor');
  const juntar = (p, k) => (p ? `${p}.${k}` : String(k));
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  // ---------- Cálculo ----------

  function calcular(a, b, p, out) {
    out = out || [];
    p = p || '';
    if (a === b) return out;
    const ta = tipo(a), tb = tipo(b);
    if (ta === 'objeto' && tb === 'objeto') {
      for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) calcular(a[k], b[k], juntar(p, k), out);
      return out;
    }
    if (ta === 'lista' && tb === 'lista') {
      if (a.length === b.length) {
        for (let i = 0; i < a.length; i++) calcular(a[i], b[i], juntar(p, i), out);
        return out;
      }
      const ja = a.map((x) => JSON.stringify(x)), jb = b.map((x) => JSON.stringify(x));
      let ini = 0;
      while (ini < ja.length && ini < jb.length && ja[ini] === jb[ini]) ini++;
      let fim = 0;
      while (fim < ja.length - ini && fim < jb.length - ini && ja[ja.length - 1 - fim] === jb[jb.length - 1 - fim]) fim++;
      out.push({ p, lin: [ini, clone(a.slice(ini, a.length - fim)), clone(b.slice(ini, b.length - fim))] });
      return out;
    }
    if (typeof a === 'string' && typeof b === 'string' && a.length + b.length > TEXTO_LONGO) {
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      let j = 0;
      while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
      out.push({ p, txt: [i, a.slice(i, a.length - j), b.slice(i, b.length - j)] });
      return out;
    }
    const op = { p };
    if (a !== undefined) op.de = clone(a);
    if (b !== undefined) op.para = clone(b);
    out.push(op);
    return out;
  }

  // ---------- Aplicação (reconstrução de versões) ----------

  function pai(obj, chaves, criar) {
    let o = obj;
    for (let i = 0; i < chaves.length - 1; i++) {
      const k = chaves[i];
      if (o[k] == null || typeof o[k] !== 'object') {
        if (!criar) return null;
        o[k] = /^\d+$/.test(chaves[i + 1]) ? [] : {};
      }
      o = o[k];
    }
    return o;
  }

  function aplicar(obj, ops) {
    for (const op of ops) {
      const chaves = op.p.split('.');
      const k = chaves[chaves.length - 1];
      const o = pai(obj, chaves, true);
      if (op.txt) {
        const atual = String(o[k] == null ? '' : o[k]);
        const [pos, saiu, entrou] = op.txt;
        o[k] = atual.slice(0, pos) + entrou + atual.slice(pos + saiu.length);
      } else if (op.lin) {
        const [pos, sairam, entraram] = op.lin;
        if (!Array.isArray(o[k])) o[k] = [];
        o[k].splice(pos, sairam.length, ...clone(entraram));
      } else if ('para' in op) {
        o[k] = clone(op.para);
      } else if (Array.isArray(o)) {
        o[k] = null;
      } else {
        delete o[k];
      }
    }
    return obj;
  }

  // ---------- Mesclagem de alterações simultâneas ----------

  /** Copia para `destino` o valor que o caminho tem em `origem`; se a estrutura divergir, copia o ramo inteiro. */
  function atribuir(destino, origem, caminho) {
    const chaves = caminho.split('.');
    let d = destino, o = origem;
    for (let i = 0; i < chaves.length - 1; i++) {
      const k = chaves[i];
      const od = d[k], oo = o == null ? undefined : o[k];
      const divergente = od == null || typeof od !== 'object' || oo == null || typeof oo !== 'object'
        || Array.isArray(od) !== Array.isArray(oo) || (Array.isArray(od) && od.length !== oo.length);
      if (divergente) {
        if (oo === undefined && !Array.isArray(d)) delete d[k]; else d[k] = clone(oo);
        return;
      }
      d = od; o = oo;
    }
    const k = chaves[chaves.length - 1];
    const v = o == null ? undefined : o[k];
    if (v === undefined && !Array.isArray(d)) delete d[k]; else d[k] = clone(v);
  }

  const relacionados = (p, q) => p === q || q.startsWith(p + '.') || p.startsWith(q + '.');

  /**
   * Aplica sobre a versão de outra pessoa (`deles`) as alterações feitas de `base` para `meus`.
   * Em um mesmo campo alterado pelos dois, prevalece a minha versão; a dela continua no histórico.
   */
  function mesclar(base, meus, deles) {
    const minhas = calcular(base, meus);
    const delas = calcular(base, deles);
    const dados = clone(deles);
    const conflitos = [];
    for (const op of minhas) {
      atribuir(dados, meus, op.p);
      if (delas.some((x) => relacionados(op.p, x.p))) conflitos.push(op.p);
    }
    return { dados, conflitos, minhas: minhas.length, delas: delas.length };
  }

  // ---------- Rótulos e descrições ----------

  const SECOES = {
    config: 'Capa e configurações', identificacao: 'I – Informações gerais', declaracao: 'Declaração de veracidade',
    s1: 'I – Informações gerais', s2: 'II – Gestão orçamentária', s3: 'III – Pessoas e terceirização',
    s4: 'IV – Transferências', s5: 'V – Licitações e contratos', s6: 'VI – Contrato de gestão (OS)',
    s7: 'VII – Parcerias MROSC', s8: 'VIII – Considerações finais',
  };
  const SECAO_DO_RAMO = { config: 'capa', identificacao: 's1', declaracao: 'declaracao' };

  const CAMPOS = {
    'config.tipoEntidade': 'Tipo de entidade', 'config.consolidado': 'Relatório consolidado', 'config.uf': 'UF',
    'config.estado': 'Estado (por extenso)', 'config.municipio': 'Município', 'config.orgaoSuperior': 'Órgão superior',
    'config.exercicio': 'Exercício financeiro', 'config.resolucao': 'Norma do Tribunal de Contas',
    'config.tribunal': 'Tribunal de Contas', 'config.localEmissao': 'Local de emissão', 'config.dataRelatorio': 'Data do relatório',
    'config.incluirSumario': 'Incluir sumário', 'config.logo': 'Brasão ou logotipo',
    'identificacao.denominacao': 'Denominação da unidade', 'identificacao.sigla': 'Sigla', 'identificacao.cnpj': 'CNPJ',
    'identificacao.naturezaJuridica': 'Natureza jurídica', 'identificacao.esfera': 'Esfera de governo',
    'identificacao.endereco': 'Endereço', 'identificacao.cep': 'CEP', 'identificacao.telefone': 'Telefone',
    'identificacao.email': 'E-mail institucional', 'identificacao.site': 'Sítio eletrônico',
    'identificacao.baseLegal': 'Base legal de criação', 'identificacao.extras': 'Informações adicionais',
    'declaracao.nome': 'Nome do gestor signatário', 'declaracao.cargo': 'Cargo do gestor signatário',
    'declaracao.data': 'Data da declaração', 'declaracao.texto': 'Texto da declaração',
    's1.intro': 'Apresentação da unidade', 's1.responsaveis': 'Responsáveis pela unidade gestora',
    's1.estrutura': 'Estrutura organizacional (texto)', 's1.unidades': 'Órgãos, unidades e entidades',
    's1.finalidades': 'Finalidades e competências', 's1.delegacaoAplica': 'Há delegação de competência',
    's1.delegacao': 'Delegação de competência (texto)',
    's2.intro': 'Texto introdutório', 's2.loaNumero': 'Número da LOA', 's2.loaData': 'Data da LOA',
    's2.baseDotacao': 'Base da comparação financeira', 's2.metas': 'Quadro de metas físicas e financeiras',
    's2.analise': 'Análise das metas executadas', 's2.justificativasIntro': 'Justificativas (texto introdutório)',
    's2.contingenciamento': 'Contingenciamento de recursos', 's2.rpTexto': 'Restos a Pagar (texto)',
    's2.rp': 'Demonstrativo de Restos a Pagar',
    's3.pessoalTexto': 'Quadro de pessoal (texto)', 's3.pessoal': 'Quadro de pessoal', 's3.folhaTitulo': 'Título do quadro da folha',
    's3.folha': 'Despesas com pessoal (mensal)', 's3.folhaFonte': 'Fonte da folha',
    's3.terceirizacaoAplica': 'Há terceirização em substituição de servidores', 's3.terceirizacaoTexto': 'Terceirização (texto)',
    's3.terceirizacaoNao': 'Terceirização (não aplicabilidade)', 's3.terceirizados': 'Pessoal terceirizado',
    's3.previdenciaAplica': 'Há benefícios previdenciários', 's3.previdenciaTexto': 'Benefícios previdenciários (texto)',
    's3.previdenciaNao': 'Benefícios previdenciários (não aplicabilidade)', 's3.beneficios': 'Benefícios previdenciários',
    's3.diretoriaAplica': 'Há diretoria ou conselhos remunerados', 's3.diretoriaTexto': 'Diretoria e conselhos (texto)',
    's3.diretoriaNao': 'Diretoria e conselhos (não aplicabilidade)', 's3.diretoria': 'Remuneração de diretoria e conselhos',
    's4.intro': 'Texto introdutório', 's4.convenios': 'Quadro A – Convênios', 's4.fomento': 'Quadro B – Termos de Fomento',
    's4.colaboracao': 'Quadro C – Termos de Colaboração', 's4.cooperacao': 'Quadro D – Acordos de Cooperação',
    's5.intro': 'Texto introdutório', 's5.modalidades': 'Despesas por modalidade de licitação', 's5.fonte': 'Fonte',
    's5.imprensaTexto': 'Imprensa oficial (texto)', 's5.imprensa': 'Órgão de imprensa oficial',
    's5.controleTexto': 'Recomendações do controle interno (texto)', 's5.controleQuadro': 'Incluir quadro de recomendações',
    's5.recomendacoes': 'Quadro de recomendações e providências',
    's6.aplica': 'Houve contrato de gestão com OS', 's6.texto': 'Texto', 's6.declaracao': 'Declaração de não aplicabilidade',
    's6.contratos': 'Contratos de gestão',
    's7.aplica': 'Houve parcerias com OSC', 's7.base': 'Base normativa', 's7.texto': 'Texto',
    's7.declaracao': 'Declaração de não aplicabilidade', 's7.parcerias': 'Parcerias com OSC',
    's8.texto': 'Considerações finais', 's8.complementares': 'Seções complementares', 's8.assinaturas': 'Assinaturas',
  };

  const COLUNAS = {
    programa: 'Programa / Ação', metaPrevista: 'Meta física prevista', metaRealizada: 'Meta física realizada',
    dotacao: 'Dotação', executado: 'Valor executado', justificativa: 'Justificativa', categoria: 'Categoria',
    saldoInicial: 'Saldo inicial', inscritos: 'Inscritos', baixas: 'Baixas', saldoFinal: 'Saldo final',
    cargo: 'Cargo', nome: 'Nome', inicio: 'Início', fim: 'Fim', vinculo: 'Vínculo', qtd: 'Quantidade',
    bruta: 'Despesa bruta', naoComputadas: 'Despesas não computadas', atividade: 'Categoria / atividade',
    postos: 'Postos', empresa: 'Empresa', valor: 'Valor', tipo: 'Tipo', fonte: 'Fonte / regime', segurados: 'Segurados',
    orgao: 'Órgão / conselho', funcao: 'Função', qtde: 'Qtde', ug: 'Unidade gestora', entidade: 'Entidade / objeto',
    situacao: 'Situação', modalidade: 'Modalidade', veiculo: 'Veículo', atos: 'Atos publicados',
    recomendacao: 'Recomendação', providencia: 'Providência', os: 'Organização Social', contrato: 'Contrato nº',
    objeto: 'Objeto', avaliacao: 'Avaliação', osc: 'OSC', instrumento: 'Instrumento', numero: 'Nº / ano',
    titulo: 'Título', texto: 'Texto', campo: 'Campo', info: 'Informação', mes: 'Mês',
  };

  /** Seção do editor a que pertence o caminho (capa, declaracao, s1…s8). */
  const secaoDe = (p) => { const r = String(p).split('.')[0]; return SECAO_DO_RAMO[r] || r; };

  /** "s2.metas.3.executado" → "II – Gestão orçamentária › Quadro de metas… › linha 4 › Valor executado". */
  function rotulo(p) {
    const chaves = String(p).split('.');
    const partes = [SECOES[chaves[0]] || chaves[0]];
    let caminho = chaves[0];
    let emLinha = false;
    for (let i = 1; i < chaves.length; i++) {
      const k = chaves[i];
      if (/^\d+$/.test(k)) {
        partes.push(caminho === 's8.complementares' ? `seção ${+k + 1}` : caminho === 's3.folha' ? U.MESES[+k] || `linha ${+k + 1}` : `linha ${+k + 1}`);
        emLinha = true;
        continue;
      }
      caminho = `${caminho}.${k}`;
      if (caminho === 'config.logo.data' || caminho.startsWith('config.logo.')) break;
      partes.push(emLinha ? COLUNAS[k] || k : CAMPOS[caminho] || COLUNAS[k] || k);
    }
    return partes.join(' › ');
  }

  /** Rótulo curto (sem a seção), usado em resumos. */
  const rotuloCurto = (p) => rotulo(p).split(' › ').slice(1).join(' › ') || rotulo(p);

  function valorTexto(v, max) {
    max = max || 160;
    if (v === undefined || v === null || v === '') return '(vazio)';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (typeof v === 'string') {
      if (/^data:image\//.test(v)) return '[imagem]';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return U.dateBR(v);
      return v.length > max ? v.slice(0, max - 1) + '…' : v;
    }
    if (Array.isArray(v)) return v.length === 1 ? '1 linha' : `${v.length} linhas`;
    if (v.data && /^data:image\//.test(v.data)) return '[imagem]';
    const partes = Object.values(v).filter((x) => x !== '' && x != null && typeof x !== 'object').map((x) => valorTexto(x, 60));
    const s = partes.join(' | ') || '(vazio)';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /** Descrição de uma alteração em texto simples. */
  function descrever(op) {
    if (op.txt) {
      const [, saiu, entrou] = op.txt;
      if (!saiu) return `inserido: “${valorTexto(entrou, 200)}”`;
      if (!entrou) return `removido: “${valorTexto(saiu, 200)}”`;
      return `“${valorTexto(saiu, 120)}” → “${valorTexto(entrou, 120)}”`;
    }
    if (op.lin) {
      const [pos, sairam, entraram] = op.lin;
      const partes = [];
      if (sairam.length) partes.push(`${sairam.length} linha(s) removida(s)`);
      if (entraram.length) partes.push(`${entraram.length} linha(s) incluída(s)`);
      return `${partes.join(' e ')} a partir da linha ${pos + 1}`;
    }
    return `${valorTexto(op.de)} → ${valorTexto(op.para)}`;
  }

  /** Resumo de um conjunto de alterações: "II – Gestão orçamentária: Número da LOA, Quadro de metas…". */
  function resumir(ops) {
    if (!ops.length) return 'Nenhuma alteração de conteúdo';
    const porSecao = new Map();
    for (const op of ops) {
      const chaves = op.p.split('.');
      const sec = SECOES[chaves[0]] || chaves[0];
      // campo = primeiro nível abaixo da seção (sem índices de linha)
      const campo = CAMPOS[chaves.slice(0, 2).join('.')] || chaves[1] || chaves[0];
      if (!porSecao.has(sec)) porSecao.set(sec, new Set());
      porSecao.get(sec).add(campo);
    }
    const partes = [];
    for (const [sec, campos] of porSecao) {
      const lista = [...campos];
      partes.push(`${sec}: ${lista.slice(0, 3).join(', ')}${lista.length > 3 ? ` e mais ${lista.length - 3}` : ''}`);
    }
    return partes.join('; ');
  }

  /** Serializa as alterações para o histórico, omitindo imagens e reduzindo se passar do limite. */
  function serializar(ops, limite) {
    limite = limite || 200000;
    const semImagens = JSON.stringify(ops, (k, v) => (typeof v === 'string' && /^data:image\//.test(v) ? '[imagem]' : v));
    if (semImagens.length <= limite) return { json: semImagens, truncado: semImagens.includes('"[imagem]"') };
    const reduzido = JSON.stringify(ops.slice(0, 400).map((op) => ({ p: op.p, resumo: descrever(op).slice(0, 400) })));
    return { json: reduzido.length <= limite ? reduzido : JSON.stringify(ops.slice(0, 50).map((op) => ({ p: op.p }))), truncado: true };
  }

  RG.diff = { calcular, aplicar, mesclar, rotulo, rotuloCurto, secaoDe, valorTexto, descrever, resumir, serializar, SECOES };
})(window.RG = window.RG || {});
