/* ==========================================================================
   Mi Fondo BHD – Motor de cálculo
   --------------------------------------------------------------------------
   Todos los montos se manejan internamente en CENTAVOS (enteros) para evitar
   errores de coma flotante. Solo se convierten a RD$ al mostrarlos.
   Este archivo no depende del navegador: se puede probar con Node
   (ver tests/calc.test.js).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  /* ------------------------------ Dinero ------------------------------ */

  /** Convierte texto escrito por una persona a centavos. Devuelve null si no es válido.
   *  Acepta: 100050, 100,050.00, RD$ 100,050.5, 100.050,50 (estilo europeo), 100050,5 */
  function parseMoney(input) {
    if (typeof input === 'number') {
      if (!isFinite(input) || input < 0) return null;
      return Math.round(input * 100);
    }
    if (input == null) return null;
    let s = String(input).replace(/RD\$|\$|\s/gi, '');
    if (!s || /[^0-9.,]/.test(s)) return null;
    const hasComma = s.includes(','), hasDot = s.includes('.');
    if (hasComma && hasDot) {
      const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
      const mil = dec === ',' ? '.' : ',';
      s = s.split(mil).join('').replace(dec, '.');
    } else if (hasComma) {
      s = (s.split(',').length === 2 && /,\d{1,2}$/.test(s)) ? s.replace(',', '.') : s.split(',').join('');
    } else if (hasDot) {
      if (s.split('.').length > 2) s = s.split('.').join('');
    }
    const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[1] === '' && !m[2])) return null;
    const ent = m[1] === '' ? 0 : parseInt(m[1], 10);
    const frac = (m[2] || '') + '000';
    let cents = ent * 100 + parseInt(frac.slice(0, 2), 10);
    if (parseInt(frac[2], 10) >= 5) cents += 1; // redondeo al centavo
    return Number.isSafeInteger(cents) ? cents : null;
  }

  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /** 12345 -> "RD$123.45" ; negativos "-RD$123.45" ; sign:true añade "+" a positivos */
  function fmtMoney(cents, opts) {
    opts = opts || {};
    if (cents == null || isNaN(cents)) return '—';
    const neg = cents < 0, abs = Math.abs(Math.round(cents));
    const txt = group(Math.floor(abs / 100)) + '.' + String(abs % 100).padStart(2, '0');
    const pref = opts.plain ? '' : 'RD$';
    return (neg ? '-' : (opts.sign && cents > 0 ? '+' : '')) + pref + txt;
  }
  /** Número plano con 2 decimales (para el campo de captura) */
  function fmtPlain(cents) { return fmtMoney(cents, { plain: true }); }
  function fmtPct(p, dec, sign) {
    if (p == null || !isFinite(p)) return '—';
    dec = dec == null ? 2 : dec;
    const v = p.toFixed(dec);
    return (sign && p > 0 ? '+' : '') + v + '%';
  }

  /* ------------------------------ Fechas ------------------------------ */
  // Las fechas son siempre cadenas "AAAA-MM-DD" (sin zonas horarias).

  function isValidDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function fmtDate(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—'; }
  function toUTC(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function addDays(s, n) { return new Date(toUTC(s) + n * 86400000).toISOString().slice(0, 10); }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function monthLabel(ym) { // "2026-11" -> "Noviembre 2026"
    const m = MESES[parseInt(ym.slice(5, 7), 10) - 1];
    return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + ym.slice(0, 4);
  }
  function periodLabel(key) {
    if (!key) return 'Todo el historial';
    if (key.length === 4) return 'Año ' + key;
    return monthLabel(key);
  }

  /* ------------------------------ Motor ------------------------------- */

  /**
   * Calcula todas las filas a partir del estado.
   * Regla: Ganancia = Balance actual − Balance del ÚLTIMO registro cronológico
   *                   − Depósitos + Retiros ocurridos entre ambos registros.
   * Para el primer registro, el balance anterior es el capital inicial.
   * Los movimientos fechados el mismo día que un registro se consideran ya
   * incluidos en el balance de ese día.
   */
  function compute(state) {
    const cfg = state.config;
    const recs = state.records.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const moves = state.movements.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const rows = [];
    let prevBal = cfg.initialCapital, prevDate = null;

    for (const r of recs) {
      let dep = 0, wd = 0;
      for (const m of moves) {
        const after = prevDate === null ? m.date >= cfg.startDate : m.date > prevDate;
        if (after && m.date <= r.date) { if (m.type === 'deposit') dep += m.amount; else wd += m.amount; }
      }
      const flows = dep - wd;
      const gain = r.balance - prevBal - flows;
      const base = prevBal > 0 ? prevBal : prevBal + flows;
      rows.push({
        id: r.id, date: r.date, balance: r.balance,
        prevBalance: prevBal, prevDate, deposits: dep, withdrawals: wd, flows,
        gain, base, pct: base > 0 ? gain / base * 100 : null,
        days: prevDate === null ? daysBetween(cfg.startDate, r.date) : daysBetween(prevDate, r.date)
      });
      prevBal = r.balance; prevDate = r.date;
    }

    const last = rows.length ? rows[rows.length - 1] : null;
    const lastDate = last ? last.date : null;
    let deposits = 0, withdrawals = 0;
    const pending = [];
    for (const m of moves) {
      if (m.date < cfg.startDate) continue;
      if (lastDate && m.date <= lastDate) { if (m.type === 'deposit') deposits += m.amount; else withdrawals += m.amount; }
      else pending.push(m);
    }
    const totalGain = rows.reduce((s, r) => s + r.gain, 0);
    const contributed = cfg.initialCapital + deposits;
    const totals = {
      initial: cfg.initialCapital, deposits, withdrawals,
      contributed,                                   // capital inicial + depósitos
      invested: contributed - withdrawals,           // capital neto invertido
      balance: last ? last.balance : cfg.initialCapital,
      totalGain,
      pct: contributed > 0 ? totalGain / contributed * 100 : null,
      count: rows.length, lastDate
    };
    return { rows, totals, pending, last };
  }

  /** Resumen de un periodo: "AAAA-MM" (mes), "AAAA" (año) o "" (todo). */
  function periodSummary(calc, state, key) {
    const inP = calc.rows.filter(r => r.date.startsWith(key || ''));
    const prior = key ? calc.rows.filter(r => r.date < key) : [];
    const startBalance = prior.length ? prior[prior.length - 1].balance : state.config.initialCapital;
    const out = { key, count: inP.length, startBalance, endBalance: null, gain: 0, avg: null,
      max: null, min: null, pct: null, flows: 0, deposits: 0, withdrawals: 0 };
    if (!inP.length) return out;
    out.endBalance = inP[inP.length - 1].balance;
    out.gain = inP.reduce((s, r) => s + r.gain, 0);
    out.deposits = inP.reduce((s, r) => s + r.deposits, 0);
    out.withdrawals = inP.reduce((s, r) => s + r.withdrawals, 0);
    out.flows = out.deposits - out.withdrawals;
    out.avg = Math.round(out.gain / inP.length);
    out.max = inP.reduce((a, r) => (a === null || r.gain > a.gain) ? r : a, null);
    out.min = inP.reduce((a, r) => (a === null || r.gain < a.gain) ? r : a, null);
    const base = startBalance + out.flows;
    out.pct = base > 0 ? out.gain / base * 100 : null;
    return out;
  }

  /** Lista de todos los meses con registros (orden cronológico). */
  function monthlyList(calc, state) {
    const keys = [];
    calc.rows.forEach(r => { const k = r.date.slice(0, 7); if (!keys.includes(k)) keys.push(k); });
    return keys.map(k => periodSummary(calc, state, k));
  }

  /** Capital aportado neto acumulado en cada fila (para el gráfico). */
  function investedSeries(calc, state) {
    let inv = state.config.initialCapital;
    return calc.rows.map(r => (inv += r.flows));
  }

  /* --------------------- Vista previa y validaciones ------------------- */

  function preview(state, input) {
    const existing = state.records.find(r => r.date === input.date && r.id !== input.excludeId);
    const recs = state.records.filter(r => r.id !== input.excludeId && r.date !== input.date);
    recs.push({ id: '__preview__', date: input.date, balance: input.balance });
    const c = compute({ config: state.config, records: recs, movements: state.movements });
    const idx = c.rows.findIndex(r => r.id === '__preview__');
    return { row: c.rows[idx], replacing: !!existing, existing, later: c.rows.length - idx - 1 };
  }

  function validateRecord(state, input, today) {
    if (!isValidDate(input.date)) return 'Selecciona una fecha válida.';
    if (input.date < state.config.startDate) return 'La fecha es anterior al inicio de la inversión (' + fmtDate(state.config.startDate) + ').';
    if (today && input.date > today) return 'No puedes registrar fechas futuras.';
    if (input.balance == null) return 'Introduce un balance válido (por ejemplo 100,050.00).';
    if (state.records.some(r => r.date === input.date && r.id !== input.excludeId)) return 'Ya existe un registro con esa fecha.';
    return null;
  }

  function validateMovement(state, m, today) {
    if (!isValidDate(m.date)) return 'Selecciona una fecha válida.';
    if (m.date < state.config.startDate) return 'La fecha es anterior al inicio de la inversión (' + fmtDate(state.config.startDate) + ').';
    if (today && m.date > today) return 'No puedes registrar fechas futuras.';
    if (m.type !== 'deposit' && m.type !== 'withdrawal') return 'Elige el tipo de movimiento.';
    if (!m.amount || m.amount <= 0) return 'Introduce un monto mayor que cero.';
    return null;
  }

  return {
    MESES, MESES_CORTOS, parseMoney, fmtMoney, fmtPlain, fmtPct,
    isValidDate, fmtDate, daysBetween, addDays, todayStr, monthLabel, periodLabel,
    compute, periodSummary, monthlyList, investedSeries, preview, validateRecord, validateMovement
  };
});
