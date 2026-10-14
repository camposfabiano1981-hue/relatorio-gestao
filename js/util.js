/* Utilitários gerais: formatação pt-BR, parsing numérico, datas, templates. */
(function (RG) {
  'use strict';

  const nfMoney = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const isBlank = (v) => v === null || v === undefined || v === '';

  /** Converte texto digitado no padrão brasileiro ("1.234,56", "R$ 10,00") em número. */
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (isBlank(v)) return NaN;
    let s = String(v).replace(/R\$|\s|%/g, '');
    const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
    s = s.replace(/[()\-]/g, '');
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      const dots = (s.match(/\./g) || []).length;
      if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? NaN : (neg ? -n : n);
  }

  /** Valor numérico seguro (vazio/inválido => 0). */
  const num = (v) => { const n = parseNum(v); return isFinite(n) ? n : 0; };

  function money(v) {
    if (isBlank(v)) return '';
    const n = parseNum(v);
    return isFinite(n) ? nfMoney.format(n) : String(v);
  }

  function int(v) {
    if (isBlank(v)) return '';
    const n = parseNum(v);
    return isFinite(n) ? nfInt.format(n) : String(v);
  }

  function pct(ratio) {
    return isFinite(ratio) ? nfMoney.format(ratio * 100) + '%' : '—';
  }

  const sum = (rows, key) => (rows || []).reduce((acc, r) => acc + num(r[key]), 0);

  function parseISO(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  function dateBR(iso) {
    const p = parseISO(iso);
    return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : '';
  }

  function dateExtenso(iso) {
    const p = parseISO(iso);
    return p ? `${p.d} de ${MESES[p.m - 1]} de ${p.y}` : '';
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function roman(n) {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out;
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function set(obj, path, val) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  }

  function cnpjValido(v) {
    const c = String(v || '').replace(/\D/g, '');
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const dv = (base) => {
      let pos = base.length - 7, soma = 0;
      for (let i = 0; i < base.length; i++) {
        soma += +base[i] * pos--;
        if (pos < 2) pos = 9;
      }
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = dv(c.slice(0, 12));
    const d2 = dv(c.slice(0, 12) + d1);
    return d1 === +c[12] && d2 === +c[13];
  }

  function formatCNPJ(v) {
    const c = String(v || '').replace(/\D/g, '');
    if (c.length !== 14) return v;
    return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  /** Substitui {variavel} pelos valores informados; marcadores desconhecidos permanecem. */
  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== '' ? vars[k] : m));
  }

  /** Marcadores {x} que não foram resolvidos. */
  function unresolved(text, vars) {
    const out = [];
    String(text || '').replace(/\{(\w+)\}/g, (m, k) => { if (vars[k] === undefined || vars[k] === '') out.push(m); });
    return out;
  }

  /**
   * "texto **negrito** [[pendente]]" -> [{text}, {text, bold}, {text, pending}]
   * Trechos entre [[ ]] (orientações de preenchimento) e marcadores {x} que restaram sem valor
   * são marcados como pendentes para destaque no documento.
   */
  const PENDING = /^(\[\[[\s\S]*\]\]|\{\w+\})$/;
  function runs(text) {
    const out = [];
    for (const part of String(text || '').split(/(\*\*[^*]+\*\*)/g)) {
      if (!part) continue;
      const bold = /^\*\*[^*]+\*\*$/.test(part);
      const body = bold ? part.slice(2, -2) : part;
      for (const piece of body.split(/(\[\[[\s\S]*?\]\]|\{\w+\})/g)) {
        if (!piece) continue;
        const run = { text: piece };
        if (bold) run.bold = true;
        if (PENDING.test(piece)) run.pending = true;
        out.push(run);
      }
    }
    return out;
  }

  /**
   * Texto livre -> blocos. Cada linha vira um parágrafo; linhas iniciadas com "-", "*" ou "•"
   * viram itens de lista; linhas em branco são ignoradas.
   */
  function paragraphs(text) {
    const blocks = [];
    let list = null;
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { list = null; continue; }
      const m = /^[-•*]\s+(.*)$/.exec(line);
      if (m) {
        if (!list) { list = { t: 'ul', items: [] }; blocks.push(list); }
        list.items.push(runs(m[1]));
      } else {
        list = null;
        blocks.push({ t: 'p', runs: runs(line), align: 'justify' });
      }
    }
    return blocks;
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  RG.util = {
    MESES, MESES_ABREV, isBlank, parseNum, num, money, int, pct, sum, parseISO, dateBR, dateExtenso,
    todayISO, roman, uid, debounce, get, set, esc, slug, cnpjValido, formatCNPJ, fill, unresolved,
    runs, paragraphs, clone,
  };
})(window.RG = window.RG || {});
