/* ==========================================================================
   Datos ficticios de demostración (se pueden borrar desde el aviso del panel
   o desde Ajustes). Simula un fondo con interés diario, fines de semana y
   feriados sin registro, un depósito y un retiro.
   ========================================================================== */
const Demo = (function () {
  'use strict';
  function rng(seed) { // mulberry32: números "aleatorios" repetibles
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function build() {
    const rand = rng(20261114);
    const start = '2026-09-01', capital = 25000000; // RD$250,000.00
    const today = Calc.todayStr();
    const end = Calc.addDays(today, -1);            // hasta ayer
    const skip = ['2026-09-24', '2026-11-06'];      // feriados sin registro
    const flowsByDay = { '2026-10-15': 5000000, '2026-11-03': -2000000 };
    const records = [], movements = [];
    let bal = capital;
    for (let d = start; d <= end; d = Calc.addDays(d, 1)) {
      const rate = 0.00030 + (rand() - 0.5) * 0.00008; // ≈0.030 % diario (≈11 % anual)
      bal += Math.round(bal * rate);                   // el fondo rinde todos los días
      if (flowsByDay[d]) {
        bal += flowsByDay[d];
        movements.push({ id: uid(), date: d, type: flowsByDay[d] > 0 ? 'deposit' : 'withdrawal', amount: Math.abs(flowsByDay[d]), note: flowsByDay[d] > 0 ? 'Depósito de ejemplo' : 'Retiro de ejemplo' });
      }
      const dow = new Date(Calc.addDays(d, 0) + 'T12:00:00Z').getUTCDay();
      if (dow === 0 || dow === 6 || skip.includes(d)) continue; // sin registro fines de semana ni feriados
      records.push({ id: uid(), date: d, balance: bal });
    }
    return {
      version: 1,
      config: { name: 'Fondo de inversión BHD', startDate: start, initialCapital: capital, currency: 'DOP', capitalLog: [] },
      records, movements,
      meta: { demo: true, lastBackup: null, createdAt: new Date().toISOString() }
    };
  }

  function empty() {
    return {
      version: 1,
      config: { name: 'Fondo de inversión BHD', startDate: Calc.todayStr(), initialCapital: 0, currency: 'DOP', capitalLog: [] },
      records: [], movements: [],
      meta: { demo: false, lastBackup: null, createdAt: new Date().toISOString() }
    };
  }
  return { build, empty, uid };
})();
