/* Componentes de interface do modo online: diálogos, situação, progresso, datas e planilhas. */
(function (RG) {
  'use strict';
  const h = RG.h;

  // ---------- Datas ----------

  const comoData = (d) => (!d ? null : d instanceof Date ? d : new Date(d));

  function dataHora(d) {
    d = comoData(d);
    return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  }

  /** "agora", "há 5 min", "há 3 h", "ontem às 14:30", "12/01/2027". */
  function relativo(d) {
    d = comoData(d);
    if (!d) return '';
    const seg = (Date.now() - d.getTime()) / 1000;
    if (seg < 60) return 'agora';
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
    const hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return `há ${Math.floor(seg / 3600)} h`;
    const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === ontem.toDateString()) return `ontem às ${hora}`;
    return d.toLocaleDateString('pt-BR');
  }

  /** Dias até a data ISO (negativo = vencido). */
  function diasAte(iso) {
    const p = RG.util.parseISO(iso);
    if (!p) return null;
    const alvo = new Date(p.y, p.m - 1, p.d);
    const hoje = new Date();
    return Math.round((alvo - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000);
  }

  function textoPrazo(meta) {
    if (!meta.prazo) return '';
    const dias = diasAte(meta.prazo);
    const base = RG.util.dateBR(meta.prazo);
    if (['enviado', 'aprovado'].includes(meta.status) || dias == null) return base;
    if (dias < 0) return `${base} (vencido há ${-dias} dia${dias === -1 ? '' : 's'})`;
    if (dias === 0) return `${base} (vence hoje)`;
    return `${base} (faltam ${dias} dia${dias === 1 ? '' : 's'})`;
  }

  // ---------- Situação e progresso ----------

  function selo(status) {
    return h('span', { class: 'selo st-' + status }, RG.nuvem.STATUS[status] || status);
  }

  const seloAtraso = () => h('span', { class: 'selo atraso', title: 'Prazo vencido sem envio ao contador' }, 'Atrasado');

  /** Barra com uma divisão por seção: concluída, em andamento (editada) ou pendente. */
  function barraSecoes(meta, compacta) {
    const nomes = Object.fromEntries(RG.editor.SECTIONS.map((s) => [s.id, s.nav]));
    const sec = meta.secoes || {}, ed = meta.secoesEditadas || {};
    const pr = (meta.progresso && meta.progresso.porSecao) || {};
    const partes = RG.nuvem.SECOES.map((s) => {
      const estado = sec[s] ? 'ok' : ed[s] ? 'and' : 'pend';
      const err = pr[s] && pr[s].e ? ` · ${pr[s].e} erro(s)` : '';
      const txt = { ok: 'concluída', and: 'em andamento', pend: 'pendente' }[estado];
      return h('span', { class: `seg ${estado}${err ? ' com-erro' : ''}`, title: `${nomes[s] || s}: ${txt}${err}` });
    });
    const concl = RG.nuvem.SECOES.filter((s) => sec[s]).length;
    return h('div', { class: 'barra-secoes' + (compacta ? ' compacta' : ''), role: 'img', 'aria-label': `${concl} de ${partes.length} seções concluídas` },
      h('div', { class: 'segs' }, partes),
      h('span', { class: 'barra-txt' }, `${concl}/${partes.length}`));
  }

  function barra(pct, rotulo) {
    return h('div', { class: 'barra' },
      h('div', { class: 'barra-trilho' }, h('div', { class: 'barra-cheia', style: `width:${Math.max(0, Math.min(100, pct))}%` })),
      rotulo ? h('span', { class: 'barra-txt' }, rotulo) : null);
  }

  // ---------- Diálogos ----------

  /**
   * Abre um diálogo modal. o = { titulo, corpo, botoes, largo, validar(dados, form), aoAbrir(form) }.
   * botoes: [{ rotulo, valor, primario, perigo, enviar }] – "enviar" valida o formulário e chama validar(),
   * que pode ser assíncrona e devolver uma mensagem de erro (o diálogo continua aberto).
   * Resolve com { valor, dados, form } ou null (cancelado).
   */
  function dialogo(o) {
    return new Promise((resolve) => {
      const form = h('form', { method: 'dialog', novalidate: o.semValidacaoNativa || null });
      const dlg = h('dialog', { class: 'dialog' + (o.largo ? ' largo' : '') + (o.classe ? ' ' + o.classe : '') }, form);
      form.append(h('h2', {}, o.titulo));
      [].concat(o.corpo || []).flat(Infinity).filter(Boolean).forEach((el) => form.append(el));
      const erroEl = h('p', { class: 'dlg-erro', role: 'alert', hidden: true });
      form.append(erroEl);
      const acoes = h('div', { class: 'dialog-actions' });
      let resultado = null;
      const botoes = o.botoes || [{ rotulo: 'Fechar', valor: true, primario: true }];
      botoes.forEach((b) => acoes.append(h('button', {
        type: b.enviar ? 'submit' : 'button',
        class: 'btn' + (b.primario ? ' primary' : '') + (b.perigo ? ' danger' : ''),
        value: String(b.valor),
        // "acao": executa sem fechar o diálogo (ex.: baixar um arquivo)
        onclick: b.enviar ? null : b.acao ? (e) => b.acao(e.currentTarget, form, dlg)
          : () => { resultado = b.valor == null ? null : { valor: b.valor }; dlg.close(); },
      }, b.rotulo)));
      form.append(acoes);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const valor = e.submitter ? e.submitter.value : 'ok';
        const dados = Object.fromEntries(new FormData(form).entries());
        if (o.validar) {
          const btns = acoes.querySelectorAll('button');
          btns.forEach((x) => { x.disabled = true; });
          erroEl.hidden = true;
          let msg;
          try { msg = await o.validar(dados, form, valor); } catch (err) { console.error(err); msg = err.message || String(err); }
          btns.forEach((x) => { x.disabled = false; });
          if (msg) { erroEl.textContent = msg; erroEl.hidden = false; return; }
        }
        resultado = { valor, dados, form };
        dlg.close();
      });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(resultado); });
      document.body.append(dlg);
      dlg.showModal();
      if (o.aoAbrir) o.aoAbrir(form, dlg);
    });
  }

  async function confirmar(msg, o) {
    o = o || {};
    const r = await dialogo({
      titulo: o.titulo || 'Confirmação',
      corpo: [].concat(msg).map((m) => (typeof m === 'string' ? h('p', {}, m) : m)),
      botoes: [{ rotulo: o.cancelar || 'Cancelar', valor: null }, { rotulo: o.ok || 'Confirmar', valor: true, primario: !o.perigo, perigo: o.perigo, enviar: true }],
    });
    return !!r;
  }

  /** Pede um texto (ou data) ao usuário. Resolve com o valor ou null. */
  async function perguntar(titulo, rotulo, o) {
    o = o || {};
    const input = o.multilinha
      ? h('textarea', { name: 'v', rows: 4, required: o.obrigatorio || null, value: o.valor || '' })
      : h('input', { name: 'v', type: o.tipo || 'text', required: o.obrigatorio || null, value: o.valor || '' });
    const r = await dialogo({
      titulo,
      corpo: [o.texto ? h('p', {}, o.texto) : null, h('label', { class: 'field full' }, h('span', { class: 'lbl' }, rotulo), input)],
      botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: o.ok || 'Confirmar', valor: true, primario: true, enviar: true }],
      aoAbrir: () => input.focus(),
    });
    return r ? String(r.dados.v || '').trim() : null;
  }

  // ---------- Diversos ----------

  function carregando(texto) {
    return h('div', { class: 'carregando' }, h('span', { class: 'giro', 'aria-hidden': 'true' }), texto || 'Carregando…');
  }

  /** Planilha CSV (separador ";", com BOM) que o Excel abre com acentos corretos. */
  function baixarCSV(nome, cabecalho, linhas) {
    const cel = (v) => {
      const s = v == null ? '' : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const texto = [cabecalho].concat(linhas).map((l) => l.map(cel).join(';')).join('\r\n');
    RG.download(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }), nome);
  }

  function senhaAleatoria() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const v = new Uint32Array(10);
    crypto.getRandomValues(v);
    return Array.from(v, (n) => c[n % c.length]).join('');
  }

  RG.ui = { dataHora, relativo, diasAte, textoPrazo, selo, seloAtraso, barraSecoes, barra, dialogo, confirmar, perguntar, carregando, baixarCSV, senhaAleatoria };
})(window.RG = window.RG || {});
