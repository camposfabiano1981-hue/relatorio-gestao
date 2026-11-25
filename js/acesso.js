/* Modo online: tela de entrada, configuração inicial, troca de senha e barra superior com o menu do usuário. */
(function (RG) {
  'use strict';
  const h = RG.h;
  const N = RG.nuvem;
  const UI = RG.ui;

  const SENHA_MIN = 8;

  function marca(subtitulo) {
    return h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, 'RG'),
      h('div', {}, h('strong', {}, 'Relatório de Gestão – Anexo II'), h('small', {}, subtitulo || 'Prestação de Contas Anual · Administração Direta e Indireta')));
  }

  function campo(rotulo, input, ajuda) {
    return h('label', { class: 'field full' }, h('span', { class: 'lbl' }, rotulo), input, ajuda ? h('span', { class: 'help' }, ajuda) : null);
  }

  function linkModoLocal() {
    const url = location.pathname + '?modo=local' + location.hash.replace(/^#\/r\/.*/, '');
    return h('a', { href: url, class: 'link-local' }, 'Usar sem login (modo local: os dados ficam somente neste navegador)');
  }

  // ---------- Entrada ----------

  async function renderLogin($app) {
    document.title = 'Entrar – Relatório de Gestão';
    $app.innerHTML = '';
    $app.append(h('div', { class: 'acesso' }, UI.carregando('Conectando…')));
    const publico = await N.lerPublico();
    const motivo = N.motivoSaida();

    const erroEl = h('p', { class: 'dlg-erro', role: 'alert', hidden: !motivo }, motivo || '');
    const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'nome@exemplo.gov.br' });
    const senha = h('input', { type: 'password', name: 'senha', required: true, autocomplete: 'current-password' });
    const manter = h('input', { type: 'checkbox', name: 'manter', checked: true });
    const botao = h('button', { type: 'submit', class: 'btn primary bloco' }, 'Entrar');

    const form = h('form', {
      class: 'acesso-form',
      onsubmit: async (e) => {
        e.preventDefault();
        botao.disabled = true;
        botao.textContent = 'Entrando…';
        erroEl.hidden = true;
        try {
          await N.entrar(email.value, senha.value, manter.checked);
        } catch (err) {
          erroEl.textContent = err.message;
          erroEl.hidden = false;
          botao.disabled = false;
          botao.textContent = 'Entrar';
        }
      },
    },
    h('h1', {}, 'Acesso restrito'),
    h('p', { class: 'help' }, 'Entre com o e-mail e a senha cadastrados pelo contador responsável pelas UGs.'),
    campo('E-mail', email),
    campo('Senha', senha),
    h('label', { class: 'check' }, manter, h('span', {}, 'Manter conectado neste computador')),
    erroEl,
    botao,
    h('button', {
      type: 'button', class: 'link',
      onclick: async () => {
        const v = await UI.perguntar('Esqueci minha senha', 'E-mail cadastrado', {
          valor: email.value, tipo: 'email', obrigatorio: true, ok: 'Enviar link',
          texto: 'Você receberá um e-mail com um link para criar uma nova senha. Confira também a caixa de spam.',
        });
        if (!v) return;
        try {
          await N.redefinirSenha(v);
          RG.toast('Se o e-mail estiver cadastrado, o link de redefinição foi enviado.');
        } catch (err) { RG.toast(err.message, 'erro'); }
      },
    }, 'Esqueci minha senha'));

    const extras = [];
    if (!publico.instalado) {
      extras.push(h('div', { class: 'acesso-instalar' },
        h('p', { class: 'help' }, 'Sistema ainda não configurado.'),
        h('button', { type: 'button', class: 'btn small', onclick: () => renderInstalacao($app) }, 'Configuração inicial (primeiro acesso do contador)')));
    }

    $app.innerHTML = '';
    $app.append(h('div', { class: 'acesso' },
      h('div', { class: 'acesso-card' },
        h('div', { class: 'acesso-topo' }, marca(publico.entidade || '')),
        form, extras),
      h('p', { class: 'acesso-rodape' }, linkModoLocal())));
    email.focus();
  }

  // ---------- Configuração inicial ----------

  function renderInstalacao($app) {
    document.title = 'Configuração inicial – Relatório de Gestão';
    const nome = h('input', { name: 'nome', required: true, maxlength: 120, autocomplete: 'name' });
    const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'username' });
    const senha = h('input', { type: 'password', name: 'senha', required: true, minlength: SENHA_MIN, autocomplete: 'new-password' });
    const senha2 = h('input', { type: 'password', name: 'senha2', required: true, minlength: SENHA_MIN, autocomplete: 'new-password' });
    const erroEl = h('p', { class: 'dlg-erro', role: 'alert', hidden: true });
    const botao = h('button', { type: 'submit', class: 'btn primary bloco' }, 'Criar acesso de contador (master)');
    const form = h('form', {
      class: 'acesso-form',
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.hidden = true;
        if (senha.value !== senha2.value) { erroEl.textContent = 'As senhas não conferem.'; erroEl.hidden = false; return; }
        botao.disabled = true;
        try {
          await N.instalar(nome.value.trim(), email.value, senha.value);
          RG.toast('Configuração inicial concluída. Cadastre agora as UGs e os usuários.');
          location.hash = '#/ugs';
        } catch (err) {
          erroEl.textContent = err.message;
          erroEl.hidden = false;
          botao.disabled = false;
        }
      },
    },
    h('h1', {}, 'Configuração inicial'),
    h('p', { class: 'help' }, 'Crie o primeiro acesso de contador (perfil master). Use o mesmo e-mail gravado no documento ',
      h('code', {}, 'sistema/instalacao'), ' do Firestore, conforme o guia de configuração. Os demais contadores e os gerentes de GAF serão cadastrados depois, dentro do sistema.'),
    campo('Nome completo', nome),
    campo('E-mail', email),
    campo('Senha', senha, `Mínimo de ${SENHA_MIN} caracteres.`),
    campo('Confirme a senha', senha2),
    erroEl, botao,
    h('button', { type: 'button', class: 'link', onclick: () => renderLogin($app) }, '← Voltar para a entrada'));
    $app.innerHTML = '';
    $app.append(h('div', { class: 'acesso' }, h('div', { class: 'acesso-card' }, h('div', { class: 'acesso-topo' }, marca()), form)));
    nome.focus();
  }

  // ---------- Senha ----------

  function camposSenha(exigirAtual) {
    const atual = h('input', { type: 'password', name: 'atual', required: true, autocomplete: 'current-password' });
    const nova = h('input', { type: 'password', name: 'nova', required: true, minlength: SENHA_MIN, autocomplete: 'new-password' });
    const nova2 = h('input', { type: 'password', name: 'nova2', required: true, minlength: SENHA_MIN, autocomplete: 'new-password' });
    return {
      elementos: [campo(exigirAtual === 'provisoria' ? 'Senha provisória (recebida do contador)' : 'Senha atual', atual),
        campo('Nova senha', nova, `Mínimo de ${SENHA_MIN} caracteres. Não use a mesma senha de outros sistemas.`), campo('Confirme a nova senha', nova2)],
      validar: async () => {
        if (nova.value !== nova2.value) return 'As novas senhas não conferem.';
        if (nova.value === atual.value) return 'A nova senha deve ser diferente da atual.';
        try { await N.alterarSenha(atual.value, nova.value); } catch (e) { return e.message; }
        return null;
      },
    };
  }

  async function dialogoSenha() {
    const c = camposSenha('atual');
    const r = await UI.dialogo({
      titulo: 'Alterar minha senha', corpo: c.elementos, validar: c.validar,
      botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Alterar senha', valor: true, primario: true, enviar: true }],
    });
    if (r) RG.toast('Senha alterada.');
  }

  /** Primeiro acesso com senha provisória: a troca é obrigatória antes de usar o sistema. */
  function renderTrocaObrigatoria($app, aoConcluir) {
    document.title = 'Defina sua senha – Relatório de Gestão';
    const c = camposSenha('provisoria');
    const erroEl = h('p', { class: 'dlg-erro', role: 'alert', hidden: true });
    const botao = h('button', { type: 'submit', class: 'btn primary bloco' }, 'Salvar nova senha e continuar');
    const u = N.usuario();
    const form = h('form', {
      class: 'acesso-form',
      onsubmit: async (e) => {
        e.preventDefault();
        botao.disabled = true;
        erroEl.hidden = true;
        const msg = await c.validar();
        if (msg) { erroEl.textContent = msg; erroEl.hidden = false; botao.disabled = false; return; }
        RG.toast('Senha definida. Bem-vindo(a)!');
        aoConcluir();
      },
    },
    h('h1', {}, `Olá, ${u.nome.split(' ')[0]}!`),
    h('p', { class: 'help' }, 'Por segurança, defina uma senha pessoal para substituir a senha provisória recebida do contador.'),
    c.elementos, erroEl, botao,
    h('button', { type: 'button', class: 'link', onclick: () => N.sair() }, 'Sair'));
    $app.innerHTML = '';
    $app.append(h('div', { class: 'acesso' }, h('div', { class: 'acesso-card' }, h('div', { class: 'acesso-topo' }, marca()), form)));
  }

  // ---------- Barra superior ----------

  function menuUsuario() {
    const u = N.usuario();
    const lista = h('div', { class: 'menu-lista', hidden: true, role: 'menu' },
      h('div', { class: 'menu-cab' }, h('strong', {}, u.nome), h('small', {}, u.email), h('small', {}, N.PERFIS[u.perfil])),
      h('button', { type: 'button', role: 'menuitem', onclick: () => { fechar(); dialogoSenha(); } }, 'Alterar minha senha'),
      h('button', { type: 'button', role: 'menuitem', onclick: () => { fechar(); N.sair(); } }, 'Sair'));
    const botao = h('button', {
      type: 'button', class: 'menu-botao', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      onclick: (e) => { e.stopPropagation(); if (lista.hidden) abrir(); else fechar(); },
    }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, iniciais(u.nome)),
    h('span', { class: 'menu-nome' }, h('strong', {}, u.nome.split(' ')[0]), h('small', {}, u.perfil === 'master' ? 'Contador' : 'Gerente de GAF')));
    const fora = () => fechar();
    function abrir() { lista.hidden = false; botao.setAttribute('aria-expanded', 'true'); setTimeout(() => document.addEventListener('click', fora, { once: true })); }
    function fechar() { lista.hidden = true; botao.setAttribute('aria-expanded', 'false'); }
    return h('div', { class: 'menu-usuario' }, botao, lista);
  }

  const iniciais = (nome) => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

  /** Barra superior das páginas do modo online (fora do editor). */
  function topo(ativa) {
    const master = N.ehMaster();
    const itens = [
      ['relatorios', '#/', 'Relatórios'],
      ['acompanhamento', '#/acompanhamento', 'Acompanhamento'],
    ].concat(master ? [['ugs', '#/ugs', 'UGs'], ['usuarios', '#/usuarios', 'Usuários'], ['logs', '#/logs', 'Log de auditoria']] : []);
    return h('header', { class: 'topbar' },
      marca(master ? 'Perfil: contador (master)' : 'Perfil: gerente de GAF'),
      h('nav', { class: 'topnav', 'aria-label': 'Páginas' },
        itens.map(([id, href, rotulo]) => h('a', { href, class: id === ativa ? 'ativa' : null, 'aria-current': id === ativa ? 'page' : null }, rotulo))),
      menuUsuario());
  }

  RG.acesso = { renderLogin, renderInstalacao, renderTrocaObrigatoria, dialogoSenha, topo, menuUsuario, iniciais, SENHA_MIN };
})(window.RG = window.RG || {});
