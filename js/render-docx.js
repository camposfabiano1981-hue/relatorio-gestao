/* Geração do arquivo .docx (biblioteca docx, build IIFE em vendor/). */
(function (RG) {
  'use strict';

  const NAVY = '1F3864';
  const BLUE = '2E5496';
  const GRAY = '555555';
  const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134; // A4, margens de 2 cm
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  const FONT = 'Calibri';

  function dataUrlToBytes(dataUrl) {
    const b64 = dataUrl.split(',')[1] || '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function render(doc) {
    const D = window.docx;
    if (!D) throw new Error('Biblioteca DOCX não carregada.');
    const {
      Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
      HeadingLevel, BorderStyle, Header, Footer, PageNumber, LevelFormat, ImageRun, VerticalAlign,
      TableOfContents, Packer, PageBreak, TableLayoutType,
    } = D;

    const ALIGN = { left: AlignmentType.LEFT, right: AlignmentType.RIGHT, center: AlignmentType.CENTER, justify: AlignmentType.JUSTIFIED };

    const textRuns = (runs, base) => (runs || []).map((r) => new TextRun(Object.assign({
      text: r.text, bold: !!r.bold || undefined, italics: !!r.italic || undefined,
      highlight: r.pending ? 'yellow' : undefined,
    }, base || {})));

    const para = (runs, opts) => new Paragraph(Object.assign({ children: textRuns(runs) }, opts || {}));

    const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
    const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

    function tableEl(b) {
      const totalW = b.columns.reduce((a, c) => a + c.w, 0);
      const widths = b.columns.map((c) => Math.floor((c.w / totalW) * CONTENT_W));
      widths[widths.length - 1] += CONTENT_W - widths.reduce((a, w) => a + w, 0);
      const margins = { top: 45, bottom: 45, left: 85, right: 85 };

      const header = new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: b.columns.map((c, i) => new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
          verticalAlign: VerticalAlign.CENTER,
          margins,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            keepNext: true,
            children: [new TextRun({ text: c.header, bold: true, color: 'FFFFFF', size: 18 })],
          })],
        })),
      });

      const n = b.rows.length;
      const rows = b.rows.map((row, ri) => {
        const fill = row.kind === 'total' ? 'D9E2F3' : (ri % 2 ? 'F2F2F2' : 'FFFFFF');
        // Tabelas curtas ficam inteiras na página; nas longas, a linha de total não fica isolada.
        const keepNext = ri < n - 1 && (n <= 15 || ri >= n - 2);
        const children = [];
        row.cells.forEach((cell, ci) => {
          if (!cell) return;
          const span = cell.colSpan || 1;
          let w = 0;
          for (let k = ci; k < ci + span; k++) w += widths[k] || 0;
          const col = b.columns[ci] || {};
          children.push(new TableCell({
            width: { size: w, type: WidthType.DXA },
            columnSpan: span > 1 ? span : undefined,
            rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
            shading: { type: ShadingType.CLEAR, fill: cell.rowSpan > 1 ? 'FFFFFF' : fill, color: 'auto' },
            verticalAlign: VerticalAlign.CENTER,
            margins,
            children: [new Paragraph({
              alignment: ALIGN[cell.align || col.align || 'left'],
              spacing: { before: 0, after: 0 },
              keepNext: keepNext || undefined,
              children: textRuns(RG.util.runs(cell.text), { size: 19, bold: cell.bold || row.kind === 'total' || undefined }),
            })],
          }));
        });
        return new TableRow({ cantSplit: true, children });
      });

      return new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        borders,
        rows: [header].concat(rows),
      });
    }

    function coverEls(b) {
      const els = [];
      const center = (text, opts, spacing) => new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: Object.assign({ before: 0, after: 80 }, spacing || {}),
        children: [new TextRun(Object.assign({ text }, opts))],
      });
      if (b.logo && b.logo.data) {
        const maxW = 110, maxH = 110;
        const ratio = Math.min(maxW / b.logo.w, maxH / b.logo.h, 1);
        els.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new ImageRun({
            type: b.logo.type === 'jpg' ? 'jpg' : 'png',
            data: dataUrlToBytes(b.logo.data),
            transformation: { width: Math.round(b.logo.w * ratio), height: Math.round(b.logo.h * ratio) },
          })],
        }));
      } else {
        els.push(new Paragraph({ spacing: { before: 1200 }, children: [] }));
      }
      els.push(center(b.estado, { bold: true, size: 26, color: NAVY }));
      if (b.orgaoSuperior) els.push(center(b.orgaoSuperior, { bold: true, size: 24, color: NAVY }));
      els.push(center(b.denominacao, { bold: true, size: 30, color: NAVY }, { before: 120 }));
      els.push(center(b.linha1, { bold: true, size: 32 }, { before: 2600 }));
      els.push(center(b.linha2, { bold: true, size: 28 }));
      els.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 2400, after: 120 },
        border: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 8 }, bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 8 } },
        children: [new TextRun({ text: b.titulo, bold: true, size: 30, color: NAVY })],
      }));
      if (b.subtitulo) els.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: textRuns(RG.util.runs(b.subtitulo), { size: 22, italics: true }) }));
      if (b.localData) els.push(center(b.localData, { size: 22 }, { before: 2200 }));
      return els;
    }

    const signParas = (a, line) => [
      new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { after: 0 }, children: [new TextRun({ text: line })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 0 }, children: [new TextRun({ text: (a.nome || '').toUpperCase(), bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: a.cargo || '' })] }),
    ];

    /** Local/data e assinaturas: uma centralizada ou, havendo várias, duas por linha em tabela sem bordas. */
    function signsEls(items, local) {
      const head = local ? [new Paragraph({ alignment: AlignmentType.RIGHT, keepNext: true, spacing: { after: 720 }, children: [new TextRun({ text: local })] })] : [];
      if (items.length === 1) return head.concat(signParas(items[0], '_______________________________________________'));
      const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
      const half = Math.floor(CONTENT_W / 2);
      const rows = [];
      for (let i = 0; i < items.length; i += 2) {
        const pair = items.slice(i, i + 2);
        const cellOf = (a, full) => new TableCell({
          width: { size: full ? CONTENT_W : half, type: WidthType.DXA },
          columnSpan: full ? 2 : undefined,
          borders: { top: none, bottom: none, left: none, right: none },
          margins: { top: i ? 900 : 0, left: 80, right: 80 },
          children: signParas(a, '___________________________________'),
        });
        rows.push(new TableRow({ cantSplit: true, children: pair.length === 2 ? [cellOf(pair[0]), cellOf(pair[1])] : [cellOf(pair[0], true)] }));
      }
      return head.concat(new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [half, CONTENT_W - half], layout: TableLayoutType.FIXED, borders: noBorders, rows }));
    }

    const children = [];
    for (const b of doc.blocks) {
      switch (b.t) {
        case 'cover': children.push(...coverEls(b)); break;
        case 'pagebreak': children.push(new Paragraph({ children: [new PageBreak()] })); break;
        case 'toc':
          children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'SUMÁRIO', bold: true, color: NAVY, size: 28 })] }));
          children.push(new TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-2' }));
          break;
        case 'h1':
          children.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' },
            children: [new TextRun({ text: b.text })],
          }));
          break;
        case 'h2': children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: b.text })] })); break;
        case 'h3': children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: b.text })] })); break;
        case 'p': children.push(para(b.runs, { alignment: ALIGN[b.align || 'justify'] })); break;
        case 'source':
          children.push(new Paragraph({ spacing: { before: 60, after: 160 }, children: textRuns(b.runs, { size: 17, italics: true, color: '595959' }) }));
          break;
        case 'ul':
          b.items.forEach((it) => children.push(para(it, { alignment: AlignmentType.JUSTIFIED, numbering: { reference: 'bullets', level: 0 } })));
          break;
        case 'table':
          children.push(tableEl(b));
          children.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }));
          break;
        case 'spacer': children.push(new Paragraph({ spacing: { before: Math.round(b.h * 20), after: 0 }, children: [] })); break;
        case 'signs': children.push(...signsEls(b.items, b.local)); break;
        default: break;
      }
    }

    const small = { size: 16, color: GRAY };
    const document = new Document({
      creator: 'Relatório de Gestão – Anexo II',
      title: doc.title,
      features: { updateFields: doc.blocks.some((b) => b.t === 'toc') },
      styles: {
        default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 120, line: 276 } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 26, bold: true, color: 'FFFFFF' },
            paragraph: { spacing: { before: 300, after: 160 }, indent: { left: 120 }, keepNext: true, keepLines: true, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 24, bold: true, color: NAVY },
            paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, keepLines: true, outlineLevel: 1 } },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 22, bold: true, color: BLUE },
            paragraph: { spacing: { before: 180, after: 80 }, keepNext: true, keepLines: true, outlineLevel: 2 } },
          { id: 'CabecalhoRodape', name: 'Cabecalho Rodape RG', basedOn: 'Normal', quickFormat: true,
            run: { font: FONT, size: 16, color: GRAY },
            paragraph: { spacing: { before: 0, after: 0, line: 240 } } },
        ],
      },
      numbering: {
        config: [{
          reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 567, hanging: 283 } } } }],
        }],
      },
      sections: [{
        properties: {
          titlePage: true,
          page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 567, footer: 567 } },
        },
        headers: {
          first: new Header({ children: [new Paragraph({ children: [] })] }),
          default: new Header({
            children: [new Paragraph({
              style: 'CabecalhoRodape',
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 4 } },
              children: [new TextRun(Object.assign({ text: doc.header }, small))],
            })],
          }),
        },
        footers: {
          first: new Footer({ children: [new Paragraph({ children: [] })] }),
          default: new Footer({
            children: [
              new Paragraph({
                style: 'CabecalhoRodape',
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 4 } },
                children: [new TextRun(Object.assign({ text: doc.footer }, small))],
              }),
              new Paragraph({
                style: 'CabecalhoRodape',
                alignment: AlignmentType.CENTER,
                children: [new TextRun(Object.assign({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES] }, small))],
              }),
            ],
          }),
        },
        children,
      }],
    });

    return Packer.toBlob(document);
  }

  RG.renderDOCX = render;
})(window.RG = window.RG || {});
