/* Pré-visualização em HTML do documento gerado pelo builder. */
(function (RG) {
  'use strict';
  const esc = RG.util.esc;

  function runsHTML(runs) {
    return (runs || []).map((r) => {
      let s = esc(r.text);
      if (r.bold) s = `<strong>${s}</strong>`;
      if (r.italic) s = `<em>${s}</em>`;
      if (r.pending) s = `<mark class="pend" title="Orientação de preenchimento pendente">${s}</mark>`;
      return s;
    }).join('');
  }

  function tableHTML(b) {
    const head = '<tr>' + b.columns.map((c) => `<th style="width:${c.w}%">${esc(c.header)}</th>`).join('') + '</tr>';
    const body = b.rows.map((row, i) => {
      const cls = row.kind === 'total' ? 'total' : (i % 2 ? 'alt' : '');
      const tds = row.cells.map((cell, ci) => {
        if (!cell) return '';
        const col = b.columns[ci] || {};
        const align = cell.align || col.align || 'left';
        const attrs = (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '') + (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '');
        const txt = /\[\[[\s\S]*\]\]|\{\w+\}/.test(cell.text) ? runsHTML(RG.util.runs(cell.text)) : esc(cell.text);
        return `<td${attrs} style="text-align:${align}"${cell.bold ? ' class="b"' : ''}>${txt}</td>`;
      }).join('');
      return `<tr class="${cls}">${tds}</tr>`;
    }).join('');
    return `<table class="doc-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  function coverHTML(b) {
    const logo = b.logo ? `<img class="cover-logo" src="${b.logo.data}" alt="">` : '';
    return `<div class="cover">${logo}
      <div class="cv-estado">${esc(b.estado)}</div>
      ${b.orgaoSuperior ? `<div class="cv-sup">${esc(b.orgaoSuperior)}</div>` : ''}
      <div class="cv-den">${esc(b.denominacao)}</div>
      <div class="cv-gap"></div>
      <div class="cv-l1">${esc(b.linha1)}</div>
      <div class="cv-l2">${esc(b.linha2)}</div>
      <div class="cv-gap"></div>
      <div class="cv-tit">${esc(b.titulo)}</div>
      <div class="cv-sub">${runsHTML(RG.util.runs(b.subtitulo))}</div>
      <div class="cv-data">${esc(b.localData)}</div>
    </div>`;
  }

  function render(doc) {
    const parts = [];
    const tocItems = doc.blocks.filter((b) => b.t === 'h1' || b.t === 'h2');
    for (const b of doc.blocks) {
      switch (b.t) {
        case 'cover': parts.push(coverHTML(b)); break;
        case 'pagebreak': parts.push('<div class="pb" aria-hidden="true"><span>quebra de página</span></div>'); break;
        case 'toc':
          parts.push('<h1 class="d-h1">SUMÁRIO</h1><ol class="toc">' + tocItems.map((h) => `<li class="toc-${h.t}">${esc(h.text)}</li>`).join('') + '</ol>');
          break;
        case 'h1': parts.push(`<h1 class="d-h1" data-sec="${b.sec}">${esc(b.text)}</h1>`); break;
        case 'h2': parts.push(`<h2 class="d-h2">${esc(b.text)}</h2>`); break;
        case 'h3': parts.push(`<h3 class="d-h3">${esc(b.text)}</h3>`); break;
        case 'p': parts.push(`<p class="d-p" style="text-align:${b.align || 'justify'}">${runsHTML(b.runs)}</p>`); break;
        case 'source': parts.push(`<p class="d-src">${runsHTML(b.runs)}</p>`); break;
        case 'ul': parts.push('<ul class="d-ul">' + b.items.map((it) => `<li>${runsHTML(it)}</li>`).join('') + '</ul>'); break;
        case 'table': parts.push(tableHTML(b)); break;
        case 'spacer': parts.push(`<div style="height:${b.h}px"></div>`); break;
        case 'signs':
          if (b.local) parts.push(`<p class="d-p" style="text-align:right;margin-bottom:44px">${esc(b.local)}</p>`);
          parts.push(`<div class="signs${b.items.length > 1 ? ' multi' : ''}">` + b.items.map((a) => `<div class="sign"><div class="sign-line"></div><div class="sign-nome">${esc((a.nome || '').toUpperCase())}</div><div class="sign-cargo">${esc(a.cargo)}</div></div>`).join('') + '</div>');
          break;
        default: break;
      }
    }
    return `<div class="paper"><div class="paper-header">${esc(doc.header)}</div>${parts.join('\n')}<div class="paper-footer">${esc(doc.footer)}</div></div>`;
  }

  RG.renderHTML = render;
})(window.RG = window.RG || {});
