/* Pruebas del motor de cálculo.  Ejecutar:  node tests/calc.test.js */
const assert = require('assert');
const C = require('../js/calc.js');
let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }
const R = (d, b) => ({ id: 'r' + d, date: d, balance: C.parseMoney(b) });
const M = (d, type, a) => ({ id: 'm' + d + type, date: d, type, amount: C.parseMoney(a) });
const mk = (records, movements) => ({
  config: { name: 'Fondo de inversión BHD', startDate: '2026-11-01', initialCapital: C.parseMoney('100000') },
  records, movements: movements || []
});

console.log('Dinero');
t('parseMoney formatos', () => {
  assert.strictEqual(C.parseMoney('100,050.00'), 10005000);
  assert.strictEqual(C.parseMoney('RD$ 100,050.5'), 10005050);
  assert.strictEqual(C.parseMoney('100050'), 10005000);
  assert.strictEqual(C.parseMoney('100.050,50'), 10005050);
  assert.strictEqual(C.parseMoney('1.005'), 101);          // 1.005 -> 1.01 sin error de coma flotante
  assert.strictEqual(C.parseMoney('0.10') + C.parseMoney('0.20'), 30); // 0.1+0.2 exacto
  assert.strictEqual(C.parseMoney('1,234,567.89'), 123456789);
  assert.strictEqual(C.parseMoney('abc'), null);
  assert.strictEqual(C.parseMoney('-5'), null);
  assert.strictEqual(C.parseMoney(''), null);
});
t('fmtMoney', () => {
  assert.strictEqual(C.fmtMoney(10005000), 'RD$100,050.00');
  assert.strictEqual(C.fmtMoney(-5000), '-RD$50.00');
  assert.strictEqual(C.fmtMoney(5, {}), 'RD$0.05');
  assert.strictEqual(C.fmtMoney(123456789012), 'RD$1,234,567,890.12');
  assert.strictEqual(C.fmtMoney(5000, { sign: true }), '+RD$50.00');
});

console.log('Ganancia diaria (ejemplo del enunciado)');
t('primer día y segundo día', () => {
  const c = C.compute(mk([R('2026-11-01', '100050'), R('2026-11-02', '100105')]));
  assert.strictEqual(c.rows[0].gain, 5000);
  assert.strictEqual(c.rows[1].gain, 5500);
  assert.strictEqual(c.rows[0].pct.toFixed(4), '0.0500');
  assert.strictEqual(c.rows[1].pct.toFixed(4), '0.0550');
});
t('días omitidos (fin de semana) usan el último balance cronológico', () => {
  const c = C.compute(mk([R('2026-11-06', '100100'), R('2026-11-09', '100250')]));
  assert.strictEqual(c.rows[1].prevDate, '2026-11-06');
  assert.strictEqual(c.rows[1].gain, 15000);
  assert.strictEqual(c.rows[1].days, 3);
});
t('el orden de captura no importa', () => {
  const a = C.compute(mk([R('2026-11-02', '100105'), R('2026-11-01', '100050')]));
  assert.deepStrictEqual(a.rows.map(r => r.gain), [5000, 5500]);
});
t('editar un registro recalcula los siguientes', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-02', '100105'), R('2026-11-03', '100160')]);
  s.records[0].balance = C.parseMoney('100060');
  const c = C.compute(s);
  assert.deepStrictEqual(c.rows.map(r => r.gain), [6000, 4500, 5500]);
});
t('eliminar un registro: el siguiente compara contra el anterior que quede', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-02', '100105'), R('2026-11-03', '100160')]);
  s.records.splice(1, 1);
  const c = C.compute(s);
  assert.deepStrictEqual(c.rows.map(r => r.gain), [5000, 11000]);
});
t('días sin registro no inventan datos', () => {
  const c = C.compute(mk([R('2026-11-01', '100050'), R('2026-11-10', '100500')]));
  assert.strictEqual(c.rows.length, 2);
  assert.strictEqual(c.totals.totalGain, 50000);
});

console.log('Depósitos y retiros');
t('depósito no es ganancia', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-02', '150105')], [M('2026-11-02', 'deposit', '50000')]);
  const c = C.compute(s);
  assert.strictEqual(c.rows[1].gain, 5500);           // 150,105 − 100,050 − 50,000
  assert.strictEqual(c.rows[1].deposits, 5000000);
  assert.strictEqual(c.totals.contributed, 15000000);
  assert.strictEqual(c.totals.totalGain, 10500);
});
t('retiro no es pérdida', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-02', '90105')], [M('2026-11-02', 'withdrawal', '10000')]);
  const c = C.compute(s);
  assert.strictEqual(c.rows[1].gain, 5500);           // 90,105 − 100,050 + 10,000
  assert.strictEqual(c.totals.invested, 9000000);
});
t('depósito en un día sin registro se aplica al siguiente registro', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-05', '120200')], [M('2026-11-03', 'deposit', '20000')]);
  const c = C.compute(s);
  assert.strictEqual(c.rows[1].gain, 15000);
});
t('depósito el día de inicio cuenta como movimiento aparte del capital', () => {
  const s = mk([R('2026-11-01', '110050')], [M('2026-11-01', 'deposit', '10000')]);
  assert.strictEqual(C.compute(s).rows[0].gain, 5000);
});
t('movimiento posterior al último registro queda pendiente', () => {
  const s = mk([R('2026-11-01', '100050')], [M('2026-11-05', 'deposit', '10000')]);
  const c = C.compute(s);
  assert.strictEqual(c.pending.length, 1);
  assert.strictEqual(c.totals.contributed, 10000000);
});
t('identidad: ganancia acumulada = balance − capital − depósitos + retiros', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-02', '150105'), R('2026-11-04', '140190'), R('2026-11-05', '140250.37')],
    [M('2026-11-02', 'deposit', '50000'), M('2026-11-03', 'withdrawal', '10000')]);
  const c = C.compute(s);
  const t0 = c.totals;
  assert.strictEqual(t0.totalGain, t0.balance - t0.initial - t0.deposits + t0.withdrawals);
});

console.log('Resúmenes');
t('mes: totales, promedio, mayor/menor, rentabilidad', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-02', '100105'), R('2026-11-03', '100150')]);
  const p = C.periodSummary(C.compute(s), s, '2026-11');
  assert.strictEqual(p.startBalance, 10000000);
  assert.strictEqual(p.endBalance, 10015000);
  assert.strictEqual(p.gain, 15000);
  assert.strictEqual(p.count, 3);
  assert.strictEqual(p.avg, 5000);
  assert.strictEqual(p.max.gain, 5500);
  assert.strictEqual(p.min.gain, 4500);
  assert.strictEqual(p.pct.toFixed(4), '0.1500');
});
t('mes siguiente: el balance inicial es el último del mes anterior (sin duplicar ganancias)', () => {
  const s = mk([R('2026-11-30', '101000'), R('2026-12-01', '101040'), R('2026-12-02', '101090')]);
  s.config.startDate = '2026-11-01';
  const c = C.compute(s);
  const dic = C.periodSummary(c, s, '2026-12');
  const nov = C.periodSummary(c, s, '2026-11');
  assert.strictEqual(dic.startBalance, 10100000);
  assert.strictEqual(dic.gain, 9000);
  assert.strictEqual(nov.gain, 100000);
  assert.strictEqual(nov.gain + dic.gain, c.totals.totalGain);
  assert.strictEqual(C.periodSummary(c, s, '2026').gain, c.totals.totalGain);
  assert.strictEqual(C.periodSummary(c, s, '').gain, c.totals.totalGain);
});
t('mes sin registros', () => {
  const s = mk([R('2026-11-01', '100050')]);
  const p = C.periodSummary(C.compute(s), s, '2027-02');
  assert.strictEqual(p.count, 0); assert.strictEqual(p.gain, 0); assert.strictEqual(p.endBalance, null);
  assert.strictEqual(p.startBalance, 10005000);
});
t('mes con depósito: rentabilidad sobre balance inicial + aportes', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-02', '200100')], [M('2026-11-02', 'deposit', '100000')]);
  const p = C.periodSummary(C.compute(s), s, '2026-11');
  assert.strictEqual(p.gain, 10000);
  assert.strictEqual(p.pct.toFixed(4), (10000 / 20000000 * 100).toFixed(4));
});
t('monthlyList', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-12-01', '100200')]);
  const l = C.monthlyList(C.compute(s), s);
  assert.deepStrictEqual(l.map(x => x.key), ['2026-11', '2026-12']);
  assert.deepStrictEqual(l.map(x => x.gain), [5000, 15000]);
});

console.log('Vista previa y validaciones');
t('preview del formulario', () => {
  const s = mk([R('2026-11-01', '100050'), R('2026-11-03', '100160')]);
  const p = C.preview(s, { date: '2026-11-02', balance: C.parseMoney('100105') });
  assert.strictEqual(p.row.gain, 5500); assert.strictEqual(p.later, 1); assert.strictEqual(p.replacing, false);
  const q = C.preview(s, { date: '2026-11-03', balance: C.parseMoney('100200') });
  assert.strictEqual(q.replacing, true); assert.strictEqual(q.row.gain, 15000);
});
t('validaciones', () => {
  const s = mk([R('2026-11-05', '100050')]);
  assert.ok(C.validateRecord(s, { date: '2026-10-31', balance: 1 }, '2026-12-01'));
  assert.ok(C.validateRecord(s, { date: '2026-12-31', balance: 1 }, '2026-12-01'));
  assert.ok(C.validateRecord(s, { date: '2026-11-05', balance: 1 }, '2026-12-01'));
  assert.ok(C.validateRecord(s, { date: '2026-11-06', balance: null }, '2026-12-01'));
  assert.strictEqual(C.validateRecord(s, { date: '2026-11-06', balance: 100 }, '2026-12-01'), null);
  assert.ok(C.validateMovement(s, { date: '2026-11-06', type: 'deposit', amount: 0 }, '2026-12-01'));
  assert.strictEqual(C.validateMovement(s, { date: '2026-11-06', type: 'deposit', amount: 5 }, '2026-12-01'), null);
  assert.ok(!C.isValidDate('2026-02-30'));
});
t('fechas', () => {
  assert.strictEqual(C.fmtDate('2026-11-01'), '01/11/2026');
  assert.strictEqual(C.daysBetween('2026-11-06', '2026-11-09'), 3);
  assert.strictEqual(C.addDays('2026-02-28', 1), '2026-03-01');
  assert.strictEqual(C.monthLabel('2026-11'), 'Noviembre 2026');
});

console.log('\n' + n + ' pruebas correctas.');
