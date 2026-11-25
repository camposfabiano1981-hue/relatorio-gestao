/* Modo online (perfil master): cadastro de unidades gestoras, usuários e configurações gerais. */
(function (RG) {
  'use strict';
  const h = RG.h;
  const U = RG.util;
  const S = RG.schema;
  const N = RG.nuvem;
  const UI = RG.ui;

  function assinar(aoMudar) {
    const est = { ugs: null, usuarios: null, config: null, erro: null };
    const avisar = () => aoMudar(est);
    const falha = (m) => { est.erro = m; avisar(); };
    const paradas = [
      N.assinarUGs((l) => { est.ugs = l; avisar(); }, falha),
      N.assinarUsuarios((l) => { est.usuarios = l; avisar(); }, falha),
    ];
    N.lerConfig().then((c) => { est.config = c || {}; avisar(); });
    return () => paradas.forEach((p) => p());
  }

  const pronto = (est) => est.ugs && est.usuarios && est.config;
  const rotuloUG = (u) => (u.sigla ? `${u.sigla} – ${u.nome}` : u.nome);
  const campo = (rotulo, input, opts) => h('label', { class: 'field' + (opts && opts.full ? ' full' : '') + (opts && opts.wide ? ' wide' : '') },
    h('span', { class: 'lbl' }, rotulo, opts && opts.obrigatorio ? h('span', { class: 'req' }, ' *') : null), input,
    opts && opts.ajuda ? h('span', { class: 'help' }, opts.ajuda) : null);

  function pagina($app, ativa, titulo, descricao, acoes, ...conteudo) {
    $app.innerHTML = '';
    $app.append(RG.acesso.topo(ativa), h('main', { class: 'pagina larga' },
      h('div', { class: 'pag-cab' }, h('div', {}, h('h1', {}, titulo), h('p', { class: 'help' }, descricao)), h('div', { class: 'pag-acoes' }, acoes)),
      conteudo));
  }

  // ---------- Unidades gestoras ----------

  async function dialogoUG(est, ug) {
    const novo = !ug;
    ug = ug || { ativo: true, tipoEntidade: 'fundo', gerentes: [], contadorUid: N.usuario().uid };
    const masters = est.usuarios.filter((u) => u.perfil === 'master' && (u.ativo || u.uid === ug.contadorUid));
    const gerentes = est.usuarios.filter((u) => u.perfil === 'gerente' && (u.ativo || (ug.gerentes || []).includes(u.uid)));
    const nome = h('input', { name: 'nome', required: true, maxlength: 200, value: ug.nome || '', placeholder: 'Ex.: Fundo Municipal de Saúde de …' });
    const sigla = h('input', { name: 'sigla', maxlength: 30, value: ug.sigla || '', placeholder: 'Ex.: FMS' });
    const cnpj = h('input', { name: 'cnpj', value: ug.cnpj || '', placeholder: '00.000.000/0000-00', onchange: (e) => { e.target.value = U.formatCNPJ(e.target.value); } });
    const tipo = h('select', { name: 'tipo' }, Object.entries(S.TIPOS).map(([k, v]) => h('option', { value: k, selected: k === ug.tipoEntidade || null }, v)));
    const consolidado = h('input', { type: 'checkbox', name: 'consolidado', checked: !!ug.consolidado });
    const ordNome = h('input', { name: 'ordenadorNome', maxlength: 120, value: ug.ordenadorNome || '' });
    const ordCargo = h('input', { name: 'ordenadorCargo', maxlength: 120, value: ug.ordenadorCargo || '', placeholder: 'Ex.: Secretário(a) Municipal de Saúde' });
    const contador = h('select', { name: 'contador' }, h('option', { value: '' }, '(não definido)'),
      masters.map((u) => h('option', { value: u.uid, selected: u.uid === ug.contadorUid || null }, u.nome)));
    const listaGer = h('div', { class: 'lista-checks' }, gerentes.length
      ? gerentes.map((u) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'gerentes', value: u.uid, checked: (ug.gerentes || []).includes(u.uid) }),
        h('span', {}, u.nome, h('small', {}, ` ${u.email}${u.ativo ? '' : ' (desativado)'}`))))
      : h('p', { class: 'help' }, 'Nenhum gerente de GAF cadastrado ainda (menu Usuários).'));
    const ativa = h('input', { type: 'checkbox', name: 'ativa', checked: ug.ativo !== false });
    const r = await UI.dialogo({
      titulo: novo ? 'Nova unidade gestora' : `Editar UG – ${rotuloUG(ug)}`,
      largo: true,
      corpo: [
        h('div', { class: 'grid' },
          campo('Denominação da unidade gestora', nome, { wide: true, obrigatorio: true }),
          campo('Sigla', sigla),
          campo('CNPJ', cnpj),
          campo('Tipo de entidade', tipo, { wide: true })),
        h('label', { class: 'check' }, consolidado, h('span', {}, 'Relatório consolidado (abrange órgãos e entidades vinculados)')),
        h('div', { class: 'grid' },
          campo('Ordenador de despesas', ordNome, { wide: true, ajuda: 'Preenche a declaração e as assinaturas dos novos relatórios.' }),
          campo('Cargo do ordenador', ordCargo, { wide: true }),
          campo('Contador responsável', contador, { wide: true })),
        h('div', { class: 'field full' }, h('span', { class: 'lbl' }, 'Gerente(s) de GAF que preenchem o relatório desta UG'), listaGer,
          h('span', { class: 'help' }, 'Somente os gerentes marcados acessam os relatórios desta UG, inclusive os de exercícios anteriores.')),
        h('label', { class: 'check' }, ativa, h('span', {}, 'UG ativa')),
      ],
      botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: novo ? 'Cadastrar UG' : 'Salvar alterações', valor: true, primario: true, enviar: true }],
      validar: async (d, form) => {
        if (d.cnpj && !U.cnpjValido(d.cnpj)) return 'CNPJ com dígitos verificadores inválidos.';
        const ids = [...form.querySelectorAll('input[name=gerentes]:checked')].map((i) => i.value);
        const cont = est.usuarios.find((u) => u.uid === d.contador);
        const dados = Object.assign({}, ug, {
          nome: d.nome.trim(), sigla: d.sigla.trim(), cnpj: d.cnpj.trim(), tipoEntidade: d.tipo, consolidado: consolidado.checked,
          ordenadorNome: d.ordenadorNome.trim(), ordenadorCargo: d.ordenadorCargo.trim(),
          contadorUid: cont ? cont.uid : '', contadorNome: cont ? cont.nome : '',
          gerentes: ids, gerentesNomes: ids.map((uid) => ({ uid, nome: (est.usuarios.find((u) => u.uid === uid) || {}).nome || '' })),
          ativo: ativa.checked,
        });
        if (est.ugs.some((x) => x.id !== ug.id && x.nome.trim().toLowerCase() === dados.nome.toLowerCase())) return 'Já existe UG com esta denominação.';
        try { await N.salvarUG(dados); } catch (e) { return e.message; }
        return null;
      },
    });
    if (r) RG.toast(novo ? 'UG cadastrada.' : 'UG atualizada. Os relatórios da UG foram atualizados.');
  }

  function cartaoConfig(est) {
    const c = est.config;
    let logo = c.logo || null;
    const entidade = h('input', { value: c.entidade || '', maxlength: 160, placeholder: 'Ex.: Prefeitura Municipal de …' });
    const municipio = h('input', { value: c.municipio || '', maxlength: 80 });
    const uf = h('select', {}, Object.keys(S.ESTADOS).map((k) => h('option', { value: k, selected: k === (c.uf || 'MS') || null }, k)));
    const prazo = h('input', { type: 'date', value: c.prazoPadrao || '' });
    const caixaLogo = h('div', { class: 'logo-box' });
    const desenharLogo = () => {
      caixaLogo.innerHTML = '';
      if (logo) caixaLogo.append(h('img', { src: logo.data, alt: 'Brasão padrão' }), h('button', { type: 'button', class: 'btn small', onclick: () => { logo = null; desenharLogo(); } }, 'Remover'));
      else caixaLogo.append(h('span', { class: 'help' }, 'Nenhuma imagem. Formatos PNG ou JPG.'));
    };
    desenharLogo();
    const arquivo = h('input', {
      type: 'file', accept: 'image/png,image/jpeg',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try { logo = await RG.loadLogo(f); desenharLogo(); } catch (err) { RG.toast(err.message, 'erro'); }
        e.target.value = '';
      },
    });
    const botao = h('button', {
      type: 'button', class: 'btn primary',
      onclick: async () => {
        botao.disabled = true;
        try {
          await N.salvarConfig({ entidade: entidade.value.trim(), municipio: municipio.value.trim(), uf: uf.value, prazoPadrao: prazo.value || '', logo });
          est.config = { entidade: entidade.value.trim(), municipio: municipio.value.trim(), uf: uf.value, prazoPadrao: prazo.value || '', logo };
          RG.toast('Configurações salvas.');
        } catch (e) { RG.toast(e.message, 'erro'); }
        botao.disabled = false;
      },
    }, 'Salvar configurações');
    return h('section', { class: 'card' },
      h('h3', { class: 'card-title' }, 'Configurações gerais'),
      h('p', { class: 'card-desc' }, 'Valores usados nos relatórios novos criados com os textos-padrão. Não alteram relatórios já existentes.'),
      h('div', { class: 'grid' },
        campo('Entidade (exibida na tela de entrada e na capa de fundos e entidades indiretas)', entidade, { wide: true }),
        campo('Município', municipio), campo('UF', uf),
        campo('Prazo padrão para envio', prazo)),
      h('div', { class: 'field full' }, h('span', { class: 'lbl' }, 'Brasão padrão (capa)'), caixaLogo, arquivo),
      h('div', { class: 'table-actions' }, botao));
  }

  function renderUGs($app) {
    document.title = 'Unidades gestoras – Relatório de Gestão';
    let est = null;
    let configDesenhada = false;
    const corpo = h('div', {}, UI.carregando());
    const configBox = h('div', {});
    pagina($app, 'ugs', 'Unidades gestoras',
      'Cadastre cada UG com o ordenador de despesas, o contador responsável e o(s) gerente(s) de GAF que preenchem o relatório.',
      [h('button', { type: 'button', class: 'btn primary', onclick: () => (est && pronto(est) ? dialogoUG(est) : RG.toast('Aguarde: carregando os dados…')) }, '+ Nova UG')],
      corpo, configBox);

    function desenhar() {
      if (est.erro) { corpo.innerHTML = ''; corpo.append(h('div', { class: 'notice warn' }, est.erro)); return; }
      if (!pronto(est)) return;
      if (!configDesenhada) { configBox.append(cartaoConfig(est)); configDesenhada = true; }
      corpo.innerHTML = '';
      if (!est.ugs.length) {
        corpo.append(h('p', { class: 'empty-state' }, 'Nenhuma UG cadastrada. Clique em “+ Nova UG” (ex.: Prefeitura, Fundo Municipal de Saúde, Fundo de Educação…).'));
        return;
      }
      corpo.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tab-painel' },
        h('thead', {}, h('tr', {}, ['Sigla', 'Unidade gestora', 'Tipo', 'Ordenador de despesas', 'Contador responsável', 'Gerente(s) de GAF', 'Situação', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, est.ugs.map((u) => h('tr', { class: u.ativo ? null : 'inativa' },
          h('td', { class: 'forte' }, u.sigla || '—'),
          h('td', {}, u.nome, u.cnpj ? h('div', { class: 'help' }, `CNPJ ${u.cnpj}`) : null),
          h('td', {}, S.TIPOS[u.tipoEntidade] || u.tipoEntidade || '—', u.consolidado ? h('div', { class: 'help' }, 'Consolidado') : null),
          h('td', {}, u.ordenadorNome || '—', u.ordenadorCargo ? h('div', { class: 'help' }, u.ordenadorCargo) : null),
          h('td', {}, u.contadorNome || '—'),
          h('td', {}, (u.gerentesNomes || []).map((g) => g.nome).join(', ') || h('span', { class: 'n-erro' }, 'nenhum')),
          h('td', {}, h('span', { class: 'selo ' + (u.ativo ? 'sit-ok' : 'sit-inativo') }, u.ativo ? 'Ativa' : 'Inativa')),
          h('td', { class: 'acoes' }, h('button', { type: 'button', class: 'btn small', onclick: () => dialogoUG(est, u) }, 'Editar'))))))));
    }

    return assinar((e) => { est = e; desenhar(); });
  }

  // ---------- Usuários ----------

  async function mostrarCredenciais(nome, email, senha) {
    const endereco = location.origin + location.pathname;
    const texto = `Acesso ao Relatório de Gestão – Anexo II\nEndereço: ${endereco}\nE-mail: ${email}\nSenha provisória: ${senha}\nNo primeiro acesso, o sistema pedirá a troca da senha.`;
    const caixa = h('textarea', { rows: 6, readonly: true, value: texto });
    await UI.dialogo({
      titulo: 'Usuário cadastrado',
      corpo: [h('p', {}, `Envie a ${nome} os dados de acesso abaixo (por e-mail institucional ou mensagem). A senha provisória não fica gravada no sistema.`),
        caixa,
        h('button', {
          type: 'button', class: 'btn small',
          onclick: async () => { try { await navigator.clipboard.writeText(texto); RG.toast('Dados de acesso copiados.'); } catch (e) { caixa.select(); } },
        }, 'Copiar')],
    });
  }

  /** Atualiza nas UGs o nome denormalizado do usuário (gerente ou contador responsável). */
  async function atualizarNomesNasUGs(uid, nome, ugs) {
    for (const ug of ugs) {
      const ger = (ug.gerentesNomes || []).some((g) => g.uid === uid && g.nome !== nome);
      const cont = ug.contadorUid === uid && ug.contadorNome !== nome;
      if (!ger && !cont) continue;
      await N.salvarUG(Object.assign({}, ug, {
        gerentesNomes: (ug.gerentesNomes || []).map((g) => (g.uid === uid ? { uid, nome } : g)),
        contadorNome: cont ? nome : ug.contadorNome,
      }));
    }
  }

  async function dialogoUsuario(est, u) {
    const novo = !u;
    const eu = N.usuario();
    const proprio = !novo && u.uid === eu.uid;
    u = u || { perfil: 'gerente', ativo: true };
    const ugsDoUsuario = est.ugs.filter((x) => (x.gerentes || []).includes(u.uid)).map((x) => x.id);
    const nome = h('input', { name: 'nome', required: true, maxlength: 120, value: u.nome || '' });
    const email = novo ? h('input', { name: 'email', type: 'email', required: true, maxlength: 200 }) : h('input', { value: u.email, disabled: true });
    const cargo = h('input', { name: 'cargo', maxlength: 120, value: u.cargo || '', placeholder: 'Ex.: Gerente de GAF – Secretaria de Saúde' });
    const telefone = h('input', { name: 'telefone', maxlength: 40, value: u.telefone || '' });
    const perfil = h('select', { name: 'perfil', disabled: proprio || null }, Object.entries(N.PERFIS).map(([k, v]) => h('option', { value: k, selected: k === u.perfil || null }, v)));
    const senha = h('input', { name: 'senha', required: true, minlength: RG.acesso.SENHA_MIN, value: novo ? UI.senhaAleatoria() : '' });
    const trocar = h('input', { type: 'checkbox', name: 'trocar', checked: true });
    const ativo = h('input', { type: 'checkbox', name: 'ativo', checked: u.ativo !== false, disabled: proprio || null });
    const ugsAtivas = est.ugs.filter((x) => x.ativo || ugsDoUsuario.includes(x.id));
    const listaUG = h('div', { class: 'lista-checks' }, ugsAtivas.length
      ? ugsAtivas.map((x) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'ugs', value: x.id, checked: ugsDoUsuario.includes(x.id) }), h('span', {}, rotuloUG(x))))
      : h('p', { class: 'help' }, 'Nenhuma UG cadastrada ainda (menu UGs).'));
    const blocoUG = h('div', { class: 'field full' }, h('span', { class: 'lbl' }, 'UGs em que preenche o relatório (gerente de GAF)'), listaUG);
    const ajustar = () => { blocoUG.hidden = perfil.value !== 'gerente'; };
    perfil.addEventListener('change', ajustar);
    const r = await UI.dialogo({
      titulo: novo ? 'Novo usuário' : `Editar usuário – ${u.nome}`,
      largo: true,
      corpo: [
        h('div', { class: 'grid' },
          campo('Nome completo', nome, { wide: true, obrigatorio: true }),
          campo('E-mail (login)', email, { wide: true, obrigatorio: novo }),
          campo('Cargo / função', cargo, { wide: true }),
          campo('Telefone', telefone),
          campo('Perfil', perfil, { ajuda: proprio ? 'Você não pode alterar o próprio perfil.' : 'Contadores têm perfil master: cadastram e acompanham tudo.' })),
        novo ? h('div', { class: 'grid' },
          campo('Senha provisória', h('span', { class: 'com-botao' }, senha, h('button', { type: 'button', class: 'btn small', onclick: () => { senha.value = UI.senhaAleatoria(); } }, 'Gerar')),
            { wide: true, ajuda: `Mínimo de ${RG.acesso.SENHA_MIN} caracteres. Será mostrada para você repassar ao usuário.` })) : null,
        novo ? h('label', { class: 'check' }, trocar, h('span', {}, 'Exigir a troca da senha no primeiro acesso (recomendado)')) : null,
        blocoUG,
        novo ? null : h('label', { class: 'check' }, ativo, h('span', {}, 'Usuário ativo (desmarque para bloquear o acesso)')),
      ],
      botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: novo ? 'Cadastrar usuário' : 'Salvar alterações', valor: true, primario: true, enviar: true }],
      aoAbrir: ajustar,
      validar: async (d, form) => {
        const ids = perfil.value === 'gerente' ? [...form.querySelectorAll('input[name=ugs]:checked')].map((i) => i.value) : [];
        const nomeV = d.nome.trim();
        try {
          if (novo) {
            if (est.usuarios.some((x) => x.email === d.email.trim().toLowerCase())) return 'Já existe usuário com este e-mail.';
            const uid = await N.criarUsuario({ nome: nomeV, email: d.email, senha: d.senha, perfil: perfil.value, cargo: d.cargo.trim(), telefone: d.telefone.trim(), trocarSenha: trocar.checked });
            if (ids.length) await N.vincularGerente(uid, nomeV, ids, est.ugs);
            u = { uid, nome: nomeV, email: d.email.trim().toLowerCase(), senha: d.senha };
          } else {
            const campos = { nome: nomeV, cargo: d.cargo.trim(), telefone: d.telefone.trim() };
            if (!proprio) { campos.perfil = perfil.value; campos.ativo = ativo.checked; }
            await N.atualizarUsuario(u.uid, campos, u);
            if (nomeV !== u.nome) await atualizarNomesNasUGs(u.uid, nomeV, est.ugs);
            const mudouUG = ids.length !== ugsDoUsuario.length || ids.some((x) => !ugsDoUsuario.includes(x));
            if (mudouUG || (campos.perfil === 'master' && ugsDoUsuario.length)) await N.vincularGerente(u.uid, nomeV, ids, est.ugs);
          }
        } catch (e) { return e.message; }
        return null;
      },
    });
    if (!r) return;
    if (novo) await mostrarCredenciais(u.nome, u.email, u.senha);
    else RG.toast('Usuário atualizado.');
  }

  function renderUsuarios($app) {
    document.title = 'Usuários – Relatório de Gestão';
    let est = null;
    const corpo = h('div', {}, UI.carregando());
    pagina($app, 'usuarios', 'Usuários',
      'Contadores (perfil master) cadastram UGs e usuários e acompanham todos os relatórios. Gerentes de GAF acessam somente os relatórios das UGs a que estão vinculados.',
      [h('button', { type: 'button', class: 'btn primary', onclick: () => (est && pronto(est) ? dialogoUsuario(est) : RG.toast('Aguarde: carregando os dados…')) }, '+ Novo usuário')],
      corpo);
    const eu = N.usuario();

    async function alternarAtivo(u) {
      const ok = await UI.confirmar(u.ativo
        ? `Desativar ${u.nome}? O acesso é bloqueado imediatamente, mas o histórico e os vínculos são preservados.`
        : `Reativar o acesso de ${u.nome}?`, { ok: u.ativo ? 'Desativar' : 'Reativar', perigo: u.ativo });
      if (!ok) return;
      try { await N.atualizarUsuario(u.uid, { ativo: !u.ativo }, u); } catch (e) { RG.toast(e.message, 'erro'); }
    }

    async function redefinir(u) {
      if (!(await UI.confirmar(`Enviar para ${u.email} um e-mail com o link para ${u.nome} criar uma nova senha?`, { ok: 'Enviar e-mail' }))) return;
      try { await N.enviarRedefinicao(u); RG.toast(`E-mail de redefinição enviado para ${u.email}.`); } catch (e) { RG.toast(e.message, 'erro'); }
    }

    function desenhar() {
      if (est.erro) { corpo.innerHTML = ''; corpo.append(h('div', { class: 'notice warn' }, est.erro)); return; }
      if (!pronto(est)) return;
      corpo.innerHTML = '';
      corpo.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tab-painel' },
        h('thead', {}, h('tr', {}, ['Nome', 'E-mail (login)', 'Perfil', 'UGs vinculadas', 'Situação', 'Último acesso', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, est.usuarios.map((u) => {
          const ugs = est.ugs.filter((x) => (x.gerentes || []).includes(u.uid)).map((x) => x.sigla || x.nome);
          return h('tr', { class: u.ativo ? null : 'inativa' },
            h('td', {}, h('span', { class: 'forte' }, u.nome), u.cargo ? h('div', { class: 'help' }, u.cargo) : null),
            h('td', {}, u.email),
            h('td', {}, N.PERFIS[u.perfil] || u.perfil),
            h('td', {}, u.perfil === 'master' ? h('span', { class: 'help' }, 'todas (contador)') : ugs.join(', ') || h('span', { class: 'n-erro' }, 'nenhuma')),
            h('td', {}, h('span', { class: 'selo ' + (u.ativo ? 'sit-ok' : 'sit-inativo') }, u.ativo ? 'Ativo' : 'Desativado'),
              u.trocarSenha ? h('div', { class: 'help' }, 'aguardando 1º acesso') : null),
            h('td', {}, u.ultimoAcesso ? UI.dataHora(u.ultimoAcesso) : h('span', { class: 'help' }, 'nunca')),
            h('td', { class: 'acoes' },
              h('button', { type: 'button', class: 'btn small', onclick: () => dialogoUsuario(est, u) }, 'Editar'),
              h('button', { type: 'button', class: 'btn small', onclick: () => redefinir(u) }, 'Redefinir senha'),
              u.uid === eu.uid ? null : h('button', { type: 'button', class: 'btn small' + (u.ativo ? ' danger' : ''), onclick: () => alternarAtivo(u) }, u.ativo ? 'Desativar' : 'Reativar')));
        })))));
    }

    return assinar((e) => { est = e; desenhar(); });
  }

  RG.admin = { renderUGs, renderUsuarios };
})(window.RG = window.RG || {});
