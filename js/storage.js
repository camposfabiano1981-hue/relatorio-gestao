/* Persistência local (localStorage) e importação/exportação em JSON. */
(function (RG) {
  'use strict';
  const PREFIX = 'rg-anexo2:';
  const INDEX_KEY = PREFIX + 'index';

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  function resumo(r) {
    return {
      id: r.id,
      denominacao: r.identificacao.denominacao || '(sem denominação)',
      tipo: r.config.tipoEntidade,
      consolidado: r.config.consolidado,
      exercicio: r.config.exercicio,
      municipio: r.config.municipio,
      uf: r.config.uf,
      atualizadoEm: r.atualizadoEm,
    };
  }

  const list = () => readJSON(INDEX_KEY, []).sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));

  function load(id) {
    const r = readJSON(PREFIX + 'report:' + id, null);
    return r ? RG.schema.migrate(r) : null;
  }

  /** Salva o relatório e atualiza o índice. Retorna false se o armazenamento falhar (ex.: cota). */
  function save(r) {
    r.atualizadoEm = new Date().toISOString();
    if (!writeJSON(PREFIX + 'report:' + r.id, r)) return false;
    const idx = readJSON(INDEX_KEY, []).filter((x) => x.id !== r.id);
    idx.push(resumo(r));
    return writeJSON(INDEX_KEY, idx);
  }

  function remove(id) {
    try { localStorage.removeItem(PREFIX + 'report:' + id); } catch (e) { /* ignora */ }
    writeJSON(INDEX_KEY, readJSON(INDEX_KEY, []).filter((x) => x.id !== id));
  }

  const getPref = (k, d) => readJSON(PREFIX + 'pref:' + k, d);
  const setPref = (k, v) => writeJSON(PREFIX + 'pref:' + k, v);

  function exportJSON(r) {
    const blob = new Blob([JSON.stringify({ formato: 'relatorio-gestao-anexo2', versao: r.schema, relatorio: r }, null, 2)], { type: 'application/json' });
    const nome = `RelatorioGestao_${RG.util.slug(r.identificacao.denominacao) || 'relatorio'}_${r.config.exercicio}.json`;
    RG.download(blob, nome);
  }

  /** Lê um arquivo .json exportado pela plataforma e devolve o relatório (com novo id). */
  async function importJSON(file) {
    const data = JSON.parse(await file.text());
    const r = data && data.relatorio ? data.relatorio : data;
    if (!r || !r.config || !r.identificacao) throw new Error('Arquivo não reconhecido como relatório desta plataforma.');
    r.id = RG.util.uid();
    return RG.schema.migrate(r);
  }

  RG.storage = { list, load, save, remove, exportJSON, importJSON, getPref, setPref };

  RG.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
})(window.RG = window.RG || {});
