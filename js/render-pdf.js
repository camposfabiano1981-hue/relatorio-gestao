/* Geração do arquivo .pdf (biblioteca pdfmake, em vendor/). */
(function (RG) {
  'use strict';

  const NAVY = '#1F3864';
  const BLUE = '#2E5496';
  const MARGIN_X = 56.7; // 2 cm
  const CONTENT_W = 595.28 - 2 * MARGIN_X;
  const PAD = 4;

  // No texto justificado o pdfmake quebra palavras no hífen e insere espaço ("Ressalta- se");
  // o hífen inseparável (U+2011) evita isso.
  const nbHyphen = (s) => String(s).replace(/(\p{L})-(?=\p{L})/gu, '$1‑');

  const inline = (runs) => (runs || []).map((r) => {
    const o = { text: nbHyphen(r.text) };
    if (r.bold) o.bold = true;
    if (r.italic) o.italics = true;
    if (r.pending) o.background = 'yellow';
    return o;
  });

  function tableNode(b) {
    const total = b.columns.reduce((a, c) => a + c.w, 0);
    const n = b.columns.length;
    const avail = CONTENT_W - n * 2 * PAD - (n + 1) * 0.5;
    const widths = b.columns.map((c) => +(avail * c.w / total).toFixed(2));
    const header = b.columns.map((c) => ({ text: c.header, bold: true, color: '#FFFFFF', fillColor: NAVY, alignment: 'center', fontSize: 8.5 }));
    const body = b.rows.map((row, ri) => {
      const fill = row.kind === 'total' ? '#D9E2F3' : (ri % 2 ? '#F2F2F2' : '#FFFFFF');
      return row.cells.map((cell, ci) => {
        if (!cell) return '';
        const col = b.columns[ci] || {};
        const o = {
          text: inline(RG.util.runs(cell.text)),
          alignment: cell.align || col.align || 'left',
          fillColor: cell.rowSpan > 1 ? '#FFFFFF' : fill,
        };
        if (cell.bold || row.kind === 'total') o.bold = true;
        if (cell.colSpan > 1) o.colSpan = cell.colSpan;
        if (cell.rowSpan > 1) o.rowSpan = cell.rowSpan;
        return o;
      });
    });
    const line = () => 0.5;
    const color = () => '#BFBFBF';
    const node = {
      table: { headerRows: 1, dontBreakRows: true, widths, body: [header].concat(body) },
      layout: {
        hLineWidth: line, vLineWidth: line, hLineColor: color, vLineColor: color,
        paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => 2.5, paddingBottom: () => 2.5,
      },
      fontSize: 9,
      lineHeight: 1.05,
      margin: [0, 2, 0, 10],
    };
    // Tabelas curtas não são divididas entre páginas.
    return b.rows.length <= 15 ? { stack: [node], unbreakable: true } : node;
  }

  function coverNode(b) {
    const stack = [];
    if (b.logo && b.logo.data) stack.push({ image: b.logo.data, fit: [110, 110], alignment: 'center', margin: [0, 0, 0, 14] });
    else stack.push({ text: '', margin: [0, 60, 0, 0] });
    stack.push({ text: b.estado, bold: true, fontSize: 13, color: NAVY });
    if (b.orgaoSuperior) stack.push({ text: b.orgaoSuperior, bold: true, fontSize: 12, color: NAVY, margin: [0, 4, 0, 0] });
    stack.push({ text: b.denominacao, bold: true, fontSize: 15, color: NAVY, margin: [0, 8, 0, 0] });
    stack.push({ text: b.linha1, bold: true, fontSize: 16, margin: [0, 130, 0, 4] });
    stack.push({ text: b.linha2, bold: true, fontSize: 14 });
    stack.push({
      margin: [0, 120, 0, 6],
      table: { widths: ['*'], body: [[{ text: b.titulo, bold: true, fontSize: 15, color: NAVY, margin: [0, 6, 0, 6] }]] },
      layout: {
        hLineWidth: () => 1.5, vLineWidth: () => 0, hLineColor: () => NAVY,
      },
    });
    if (b.subtitulo) stack.push({ text: inline(RG.util.runs(b.subtitulo)), italics: true, fontSize: 11 });
    if (b.localData) stack.push({ text: b.localData, fontSize: 11, margin: [0, 110, 0, 0] });
    return { stack, alignment: 'center' };
  }

  function definition(doc) {
    const content = [];
    // Títulos aguardam o bloco seguinte para formar um conjunto inquebrável (evita título órfão no pé da página).
    let heads = [];
    const flushHeads = () => {
      if (heads.length) heads[0].headlineLevel = 1;
      content.push(...heads);
      heads = [];
    };
    const emit = (node, groupable) => {
      if (heads.length && groupable) {
        const inner = node.unbreakable && node.stack ? node.stack : [node];
        content.push({ stack: heads.concat(inner), unbreakable: true });
        heads = [];
      } else {
        flushHeads();
        content.push(node);
      }
    };

    for (const b of doc.blocks) {
      switch (b.t) {
        case 'cover': emit(coverNode(b), false); break;
        case 'pagebreak': emit({ text: '', pageBreak: 'after' }, false); break;
        case 'toc': emit({ toc: { title: { text: 'SUMÁRIO', bold: true, fontSize: 14, color: NAVY, margin: [0, 0, 0, 12] } } }, false); break;
        case 'h1':
          heads.push({
            margin: [0, 14, 0, 8],
            table: { widths: ['*'], body: [[{ text: b.text, tocItem: true, tocStyle: { bold: true }, bold: true, color: '#FFFFFF', fillColor: NAVY, fontSize: 12.5, margin: [4, 3, 4, 3] }]] },
            layout: 'noBorders',
          });
          break;
        case 'h2': heads.push({ text: b.text, tocItem: true, tocMargin: [14, 0, 0, 0], bold: true, color: NAVY, fontSize: 12, margin: [0, 10, 0, 5] }); break;
        case 'h3': heads.push({ text: b.text, bold: true, color: BLUE, fontSize: 11, margin: [0, 8, 0, 4] }); break;
        case 'p': emit({ text: inline(b.runs), alignment: b.align || 'justify', margin: [0, 0, 0, 6] }, true); break;
        case 'source': emit({ text: inline(b.runs), italics: true, fontSize: 8.5, color: '#595959', margin: [0, -6, 0, 10] }, true); break;
        case 'ul': emit({ ul: b.items.map((it) => ({ text: inline(it), alignment: 'justify', margin: [0, 0, 0, 3] })), margin: [12, 0, 0, 6] }, b.items.length <= 6); break;
        case 'table': emit(tableNode(b), b.rows.length <= 15); break;
        case 'spacer': emit({ text: '', margin: [0, b.h, 0, 0] }, false); break;
        case 'signs': {
          const sign = (a, line) => ({
            alignment: 'center',
            stack: [{ text: line }, { text: (a.nome || '').toUpperCase(), bold: true, margin: [0, 2, 0, 0] }, { text: a.cargo || '' }],
          });
          // Local/data fica no mesmo bloco inquebrável que a primeira linha de assinaturas.
          const local = b.local ? [{ text: b.local, alignment: 'right', margin: [0, 0, 0, 36] }] : [];
          if (b.items.length === 1) {
            emit({ stack: local.concat(sign(b.items[0], '_______________________________________________')), unbreakable: true }, false);
            break;
          }
          // Várias assinaturas: duas por linha.
          for (let i = 0; i < b.items.length; i += 2) {
            const pair = b.items.slice(i, i + 2).map((a) => sign(a, '___________________________________'));
            const row = pair.length === 2 ? { columns: pair, columnGap: 24 } : pair[0];
            emit({ stack: (i ? [] : local).concat(row), margin: [0, i ? 40 : 0, 0, 0], unbreakable: true }, false);
          }
          break;
        }
        default: break;
      }
    }
    flushHeads();

    const small = { fontSize: 8, color: '#555555' };
    return {
      pageSize: 'A4',
      pageMargins: [MARGIN_X, 60, MARGIN_X, 62],
      info: { title: doc.title, creator: 'Relatório de Gestão – Anexo II' },
      defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.18 },
      header: (page) => (page === 1 ? null : {
        margin: [MARGIN_X, 26, MARGIN_X, 0],
        stack: [
          Object.assign({ text: doc.header, alignment: 'right' }, small),
          { canvas: [{ type: 'line', x1: 0, y1: 3, x2: CONTENT_W, y2: 3, lineWidth: 0.5, lineColor: '#BFBFBF' }] },
        ],
      }),
      footer: (page, pages) => (page === 1 ? null : {
        margin: [MARGIN_X, 14, MARGIN_X, 0],
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: '#BFBFBF' }] },
          Object.assign({ text: doc.footer, alignment: 'center', margin: [0, 3, 0, 0] }, small),
          Object.assign({ text: `Página ${page} de ${pages}`, alignment: 'center' }, small),
        ],
      }),
      // Títulos seguidos de tabelas/listas longas (não agrupados) não começam no pé da página.
      pageBreakBefore: (node) => !!node.headlineLevel && node.startPosition.verticalRatio > 0.85,
      content,
    };
  }

  function render(doc) {
    if (!window.pdfMake) return Promise.reject(new Error('Biblioteca PDF não carregada.'));
    return new Promise((resolve, reject) => {
      try {
        window.pdfMake.createPdf(definition(doc)).getBlob(resolve);
      } catch (e) {
        reject(e);
      }
    });
  }

  RG.renderPDF = render;
  RG.pdfDefinition = definition;
})(window.RG = window.RG || {});
