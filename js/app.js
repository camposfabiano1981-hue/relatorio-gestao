/* Aplicação: rotas, tela inicial, barra de ações, salvamento automático e exportações. */
(function (RG) {
  'use strict';
  const U = RG.util;
  const S = RG.schema;
  const h = RG.h;

  const $app = document.getElementById('app');
  let current = null; // relatório aberto
  let saveState = null;
  let dirty = false;

  // ---------- Avisos ----------

  RG.toast = function (msg, tipo) {
    const box = document.getElementById('toasts');
    const el = h('div', { class: 'toast ' + (tipo || 'ok'), role: 'status' }, msg);
    box.append(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
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

  // ---------- Tela inicial ----------

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

  function setSaveState(s) {
    saveState = s;
    const el = document.getElementById('save-state');
    if (!el) return;
    el.className = 'save-state ' + s;
    el.textContent = s === 'salvando' ? 'Salvando…' : s === 'erro' ? 'Falha ao salvar!' : `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function updateBadges() {
    if (!current) return;
    const issues = RG.builder.validate(current);
    const per = {};
    issues.forEach((i) => { if (i.nivel !== 'info') per[i.secao] = (per[i.secao] || 0) + 1; });
    document.querySelectorAll('.nav a[data-sec]').forEach((a) => {
      const b = a.querySelector('.badge');
      const n = a.dataset.sec === 'checks' ? issues.filter((i) => i.nivel !== 'info').length : per[a.dataset.sec] || 0;
      b.textContent = n || '';
      b.hidden = !n;
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
    } catch (e) {
      console.error(e);
      RG.toast('Erro ao gerar o arquivo: ' + e.message, 'erro');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function renderEditor(sec) {
    const ctxObj = {
      report: current,
      changed: () => { dirty = true; setSaveState('salvando'); persist(); },
      rerender: () => {
        const y = window.scrollY;
        RG.editor.render(main, ctxObj, sec);
        window.scrollTo(0, y);
        updateBadges();
      },
    };
    const main = h('main', { class: 'editor-main', id: 'editor-main' });
    const nav = h('nav', { class: 'nav', 'aria-label': 'Seções do relatório' },
      RG.editor.SECTIONS.map((s) => h('a', {
        href: `#/r/${current.id}/${s.id}`, 'data-sec': s.id,
        class: (s.id === sec ? 'active' : '') + (s.id === 'preview' || s.id === 'checks' ? ' tool' : ''),
      }, h('span', {}, s.nav), h('span', { class: 'badge', hidden: true }))));

    $app.innerHTML = '';
    $app.append(
      h('header', { class: 'topbar' },
        h('a', { class: 'back', href: '#/', title: 'Voltar à lista de relatórios' }, '←'),
        h('div', { class: 'brand compact' }, h('span', { class: 'brand-mark' }, 'RG'),
          h('div', {}, h('strong', { id: 'rep-title' }), h('span', { id: 'save-state', class: 'save-state' }))),
        h('div', { class: 'top-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => RG.storage.exportJSON(current), title: 'Baixa uma cópia dos dados (.json) para backup ou compartilhamento' }, 'Exportar dados'),
          h('button', { type: 'button', class: 'btn primary', id: 'btn-docx', onclick: () => exportar('docx') }, 'Gerar DOCX'),
          h('button', { type: 'button', class: 'btn primary', id: 'btn-pdf', onclick: () => exportar('pdf') }, 'Gerar PDF'))),
      h('div', { class: 'editor' }, nav, main));
    RG.editor.render(main, ctxObj, sec);
    setSaveState(saveState === 'erro' ? 'erro' : 'salvo');
    updateBadges();
    window.scrollTo(0, 0);
    document.title = `${current.identificacao.denominacao || 'Relatório'} ${current.config.exercicio} – Relatório de Gestão`;
  }

  // ---------- Início ----------

  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', () => { if (current && dirty) RG.storage.save(current); });
  setupNewDialog();
  route();
})(window.RG = window.RG || {});
