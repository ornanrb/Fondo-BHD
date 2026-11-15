/* ==========================================================================
   Mi Fondo BHD – Lógica de la interfaz
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ Utilidades ------------------------------ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = Calc.fmtMoney, D = Calc.fmtDate, P = Calc.fmtPct;
  const cls = (c) => c > 0 ? 'pos' : c < 0 ? 'neg' : '';
  const ICON = {
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  };

  let state = null, calc = null;
  const ui = { view: 'panel', regTab: 'balance', histTab: 'reg', movType: 'deposit', range: '30', metric: 'gain',
    dashPeriod: '', hMonth: 0, hYear: 0, search: '', sortDesc: true };

  /* ------------------------------ Estado ------------------------------ */
  function normalize(s) {
    s = s || {};
    s.version = 1;
    s.config = Object.assign({ name: 'Fondo de inversión BHD', startDate: Calc.todayStr(), initialCapital: 0, currency: 'DOP', capitalLog: [] }, s.config || {});
    s.records = Array.isArray(s.records) ? s.records : [];
    s.movements = Array.isArray(s.movements) ? s.movements : [];
    s.meta = Object.assign({ demo: false, lastBackup: null, createdAt: new Date().toISOString() }, s.meta || {});
    return s;
  }
  async function commit(opts) {
    calc = Calc.compute(state);
    try { await DB.save(state); }
    catch (e) { toast('No se pudo guardar en este navegador. Exporta un respaldo.', 'err'); }
    updateStorageWarning();
    if (!opts || !opts.silent) renderAll();
  }
  function updateStorageWarning() {
    const el = $('#storageWarn');
    if (DB.mode === 'indexeddb') { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = DB.mode === 'localstorage'
      ? 'Tu navegador no permite IndexedDB; se usa un almacenamiento alternativo. Exporta respaldos con frecuencia.'
      : 'Este navegador no permite guardar datos (¿modo privado?). Lo que escribas se perderá al cerrar. Abre la app en una ventana normal.';
  }
  const uid = () => Demo.uid();
  function lastPeriodDefaults() {
    const ref = calc.last ? calc.last.date : Calc.todayStr();
    ui.dashPeriod = ref.slice(0, 7);
    ui.hYear = +ref.slice(0, 4); ui.hMonth = +ref.slice(5, 7);
  }

  /* ------------------------------ Avisos y modales ------------------------------ */
  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || 'ok'); t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3600);
  }
  let modalClose = null;
  function openModal(html, onMount) {
    closeModal();
    const root = $('#modalRoot');
    root.innerHTML = '<div class="overlay"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    const ov = root.firstElementChild;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(); });
    $$('[data-close]', root).forEach(b => b.addEventListener('click', closeModal));
    modalClose = () => { document.removeEventListener('keydown', onKey); root.innerHTML = ''; modalClose = null; };
    if (onMount) onMount(root);
    const f = $('input, button.primary', root); if (f && !/date/.test(f.type)) setTimeout(() => f.focus({ preventScroll: true }), 30);
    return root;
  }
  function closeModal() { if (modalClose) modalClose(); }
  function confirmModal(o) {
    return new Promise((resolve) => {
      openModal('<h3>' + esc(o.title) + '</h3><div class="muted">' + o.body + '</div><div class="actions-row"><button class="btn ghost" data-close>' + esc(o.cancel || 'Cancelar') + '</button><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" id="cmOk">' + esc(o.ok || 'Aceptar') + '</button></div>', (root) => {
        let done = false;
        const finish = (v) => { if (done) return; done = true; closeModal(); resolve(v); };
        $('#cmOk', root).addEventListener('click', () => finish(true));
        $$('[data-close]', root).forEach(b => b.addEventListener('click', () => finish(false)));
        $('.overlay', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('overlay')) finish(false); });
      });
    });
  }
  function showErr(el, msg) { el.textContent = msg; el.hidden = !msg; }

  /* ------------------------------ Navegación ------------------------------ */
  const VIEWS = ['panel', 'registrar', 'historial', 'graficos', 'ajustes'];
  function go(view) {
    if (!VIEWS.includes(view)) view = 'panel';
    ui.view = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    $$('[data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
    try { history.replaceState(null, '', '#' + view); } catch (e) { /* nada */ }
    window.scrollTo(0, 0);
    renderView();
  }
  function renderAll() { renderHeader(); renderView(); }
  function renderView() {
    ({ panel: renderPanel, registrar: renderRegistrar, historial: renderHistorial, graficos: renderGraficos, ajustes: renderAjustes })[ui.view]();
  }

  /* ------------------------------ Encabezado ------------------------------ */
  function renderHeader() {
    $('#subtitle').textContent = state.config.name || 'Fondo de inversión BHD';
    const chip = $('#lastChip'), txt = $('.chip-text', chip);
    const last = calc.totals.lastDate;
    chip.className = 'chip';
    if (!last) { txt.textContent = 'Sin registros todavía'; return; }
    const n = Calc.daysBetween(last, Calc.todayStr());
    const when = n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días';
    txt.textContent = 'Último registro: ' + D(last) + ' · ' + when;
    chip.classList.add(n <= 1 ? 'ok' : n <= 4 ? 'warn' : 'late');
  }

  /* ------------------------------ Panel ------------------------------ */
  function periodSelects(prefix, key) {
    const [y, m] = key.split('-').map(Number);
    const ys = yearsList();
    return '<div class="mini-sel"><select data-dash="m" aria-label="Mes">' + Calc.MESES.map((n, i) => '<option value="' + (i + 1) + '"' + (i + 1 === m ? ' selected' : '') + '>' + n.charAt(0).toUpperCase() + n.slice(1) + '</option>').join('') + '</select>' +
      '<select data-dash="y" aria-label="Año">' + ys.map(v => '<option' + (v === y ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>';
  }
  function yearsList() {
    const set = new Set([+Calc.todayStr().slice(0, 4), +state.config.startDate.slice(0, 4)]);
    state.records.forEach(r => set.add(+r.date.slice(0, 4)));
    state.movements.forEach(r => set.add(+r.date.slice(0, 4)));
    return Array.from(set).sort((a, b) => a - b);
  }

  function renderPanel() {
    const t = calc.totals, last = calc.last;
    const ps = Calc.periodSummary(calc, state, ui.dashPeriod);
    $('#demoBanner').innerHTML = state.meta.demo
      ? '<div class="notice info" style="margin-bottom:14px"><strong>Estás viendo datos de demostración.</strong> Cuando quieras empezar con tu inversión real, bórralos y escribe tu capital inicial.<div class="btn-row" style="margin-top:10px"><button class="btn danger small" data-action="wipe-demo">Borrar datos de demostración</button></div></div>'
      : (t.initial <= 0 && !calc.rows.length ? '<div class="notice warn" style="margin-bottom:14px">Configura tu capital inicial y la fecha de inicio en <button class="link" data-goto="ajustes" style="padding:0">Ajustes</button> antes de registrar balances.</div>' : '');

    const dayVal = last ? last.gain : 0;
    const pending = calc.pending.length ? '<div class="sub">+ ' + calc.pending.length + ' movimiento(s) pendiente(s) de registrar balance</div>' : '';
    $('#panelCards').innerHTML = '<div class="cards">' +
      '<article class="fcard span2"><div class="lbl">Capital inicial</div><div class="val">' + F(t.initial) + '</div><div class="sub">Desde ' + D(state.config.startDate) + (t.deposits || t.withdrawals ? ' · aportes netos: ' + F(t.deposits - t.withdrawals, { sign: true }) : '') + '</div></article>' +
      '<article class="fcard hero span2"><div class="lbl">Balance actual</div><div class="val">' + F(t.balance) + '</div><div class="sub">' + (last ? 'Último registro: ' + D(last.date) : 'Aún sin registros') + '</div>' + pending + '</article>' +
      '<article class="fcard day' + (dayVal < 0 ? ' loss' : '') + '"><div class="lbl">Ganancia del día' + (last ? '<span class="tag' + (dayVal < 0 ? ' neg' : '') + '">' + P(last.pct, 4, true) + '</span>' : '') + '</div><div class="val ' + cls(dayVal) + '">' + (last ? F(dayVal, { sign: true }) : '—') + '</div><div class="sub">' + (last ? (last.prevDate ? 'vs. ' + D(last.prevDate) : 'vs. capital inicial') : 'Registra tu primer balance') + '</div></article>' +
      '<article class="fcard"><div class="lbl">Ganancia del mes</div>' + periodSelects('d', ui.dashPeriod) + '<div class="val ' + cls(ps.gain) + '">' + (ps.count ? F(ps.gain, { sign: true }) : '—') + '</div><div class="sub">' + (ps.count ? ps.count + ' registro(s) · ' + P(ps.pct, 2, true) : 'Sin registros en este mes') + '</div></article>' +
      '<article class="fcard"><div class="lbl">Ganancia acumulada</div><div class="val ' + cls(t.totalGain) + '">' + (t.count ? F(t.totalGain, { sign: true }) : '—') + '</div><div class="sub">Desde el inicio · ' + t.count + ' registro(s)</div></article>' +
      '<article class="fcard"><div class="lbl">Rentabilidad acumulada</div><div class="val ' + cls(t.totalGain) + '">' + (t.count ? P(t.pct, 2, true) : '—') + '</div><div class="sub">Sobre capital aportado ' + F(t.contributed) + '</div></article>' +
      '</div>';

    const rec = calc.rows.slice(-6).reverse();
    $('#recentList').innerHTML = rec.length ? rec.map(r =>
      '<div class="recent-item"><div><div class="d">' + D(r.date) + '</div><div class="b">' + F(r.balance) + (r.flows ? '<span class="badge' + (r.flows < 0 ? ' out' : '') + '">' + (r.flows > 0 ? 'depósito' : 'retiro') + '</span>' : '') + '</div></div><div class="g ' + cls(r.gain) + '">' + F(r.gain, { sign: true }) + '<small>' + P(r.pct, 4) + '</small></div></div>').join('')
      : '<div class="empty"><strong>Todavía no hay registros</strong>Ve a «Registrar» para añadir tu primer balance.</div>';
    Charts.balanceChart('chMini', calc, state, '30', true);
  }

  /* ------------------------------ Registrar ------------------------------ */
  function setRegTab(tab) {
    ui.regTab = tab;
    $$('[data-regtab]').forEach(b => b.classList.toggle('active', b.dataset.regtab === tab));
    $('#regBalance').hidden = tab !== 'balance'; $('#regMov').hidden = tab !== 'mov';
  }
  function renderRegistrar() { setRegTab(ui.regTab); $('#recDate').max = $('#movDate').max = Calc.todayStr(); updatePreview(); }

  function gainBoxHTML(p, noCapital) {
    if (noCapital) return '<div class="gain-box idle"><div class="gb-label">GANANCIA DEL DÍA</div><div class="gb-val">—</div><div class="gb-warn">Primero escribe tu capital inicial en Ajustes; es la base del primer cálculo.</div></div>';
    if (!p) return '<div class="gain-box idle"><div class="gb-label">GANANCIA DEL DÍA</div><div class="gb-val">—</div><div class="muted small">Escribe el balance acumulado para calcularla automáticamente.</div></div>';
    const r = p.row, loss = r.gain < 0, items = [];
    items.push(r.prevDate ? 'Balance anterior (' + D(r.prevDate) + '): <b>' + F(r.prevBalance) + '</b>' : 'Primer registro: se compara con el capital inicial <b>' + F(r.prevBalance) + '</b>');
    if (r.deposits) items.push('Depósitos incluidos (no son ganancia): <b>' + F(r.deposits) + '</b>');
    if (r.withdrawals) items.push('Retiros incluidos (no son pérdida): <b>' + F(r.withdrawals) + '</b>');
    if (r.days > 1) items.push(r.days + ' días desde el registro anterior');
    if (p.later > 0) items.push('Se recalcularán ' + p.later + ' registro(s) posterior(es)');
    if (p.replacing) items.push('Reemplazará el registro existente de esa fecha (' + F(p.existing.balance) + ')');
    let warn = '';
    if (loss) warn = 'El balance es menor al esperado, así que quedaría como pérdida. Si retiraste dinero, regístralo primero en «Depósito / Retiro».';
    else if (r.pct != null && r.pct > 1) warn = 'Rendimiento diario inusualmente alto. Revisa el monto; si agregaste dinero, regístralo como depósito.';
    return '<div class="gain-box' + (loss ? ' loss' : '') + '"><div class="gb-label">GANANCIA DEL DÍA</div><div class="gb-val ' + cls(r.gain) + '">' + F(r.gain, { sign: true }) + '</div><div class="gb-pct ' + cls(r.gain) + '">Rendimiento diario: ' + P(r.pct, 4, true) + '</div><ul>' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>' + (warn ? '<div class="gb-warn">' + warn + '</div>' : '') + '</div>';
  }
  function readRecordInputs() {
    return { date: $('#recDate').value, balance: Calc.parseMoney($('#recBalance').value) };
  }
  function updatePreview() {
    const noCap = state.config.initialCapital <= 0 && !calc.rows.length;
    const inp = readRecordInputs();
    let p = null;
    if (!noCap && inp.balance != null && Calc.isValidDate(inp.date) && inp.date >= state.config.startDate) p = Calc.preview(state, inp);
    $('#recPreview').innerHTML = gainBoxHTML(p, noCap);
    $('#recSubmit').textContent = p && p.replacing ? 'Actualizar registro' : 'Guardar registro';
  }
  async function submitRecord(e) {
    e.preventDefault();
    const err = $('#recError'); showErr(err, '');
    if (state.config.initialCapital <= 0 && !calc.rows.length) return showErr(err, 'Configura primero tu capital inicial en Ajustes.');
    const inp = readRecordInputs();
    const existing = state.records.find(r => r.date === inp.date);
    const msg = Calc.validateRecord(state, Object.assign({ excludeId: existing && existing.id }, inp), Calc.todayStr());
    if (msg) return showErr(err, msg);
    if (existing) {
      const ok = await confirmModal({ title: 'Ya existe un registro en esa fecha', body: 'El registro del ' + D(inp.date) + ' tiene un balance de <b>' + F(existing.balance) + '</b>. ¿Quieres reemplazarlo por <b>' + F(inp.balance) + '</b>?', ok: 'Reemplazar' });
      if (!ok) return;
      existing.balance = inp.balance;
    } else state.records.push({ id: uid(), date: inp.date, balance: inp.balance });
    await commit({ silent: true });
    const row = calc.rows.find(r => r.date === inp.date);
    toast('Registro guardado · Ganancia del día: ' + F(row.gain, { sign: true }));
    $('#recBalance').value = '';
    renderAll();
  }

  async function submitMov(e) {
    e.preventDefault();
    const err = $('#movError'); showErr(err, '');
    const m = { id: uid(), date: $('#movDate').value, type: ui.movType, amount: Calc.parseMoney($('#movAmount').value), note: $('#movNote').value.trim() };
    const msg = Calc.validateMovement(state, m, Calc.todayStr());
    if (msg) return showErr(err, msg);
    state.movements.push(m);
    await commit({ silent: true });
    toast((m.type === 'deposit' ? 'Depósito' : 'Retiro') + ' registrado: ' + F(m.amount));
    $('#movAmount').value = ''; $('#movNote').value = '';
    renderAll();
  }

  /* ------------------------------ Historial ------------------------------ */
  function periodKey() { return !ui.hYear ? '' : (!ui.hMonth ? String(ui.hYear) : ui.hYear + '-' + String(ui.hMonth).padStart(2, '0')); }
  function fillHistSelects() {
    const ms = $('#hMonth'), ys = $('#hYear');
    ys.innerHTML = '<option value="0">Todos los años</option>' + yearsList().map(y => '<option value="' + y + '">' + y + '</option>').join('');
    ms.innerHTML = '<option value="0">Todo el año</option>' + Calc.MESES.map((n, i) => '<option value="' + (i + 1) + '">' + n.charAt(0).toUpperCase() + n.slice(1) + '</option>').join('');
    ys.value = String(ui.hYear); ms.value = String(ui.hMonth); ms.disabled = !ui.hYear;
    $('#hSearch').value = ui.search;
  }
  function visibleRows() {
    let rows = calc.rows.filter(r => r.date.startsWith(periodKey()));
    if (ui.search) rows = calc.rows.filter(r => r.date === ui.search);
    return rows;
  }
  function renderHistorial() {
    $$('[data-histtab]').forEach(b => b.classList.toggle('active', b.dataset.histtab === ui.histTab));
    $('#histReg').hidden = ui.histTab !== 'reg'; $('#histMov').hidden = ui.histTab !== 'mov';
    if (ui.histTab === 'mov') return renderMovTable();
    fillHistSelects();
    const key = periodKey(), ps = Calc.periodSummary(calc, state, key);
    const st = (l, v, sub, c) => '<div class="stat"><div class="lbl">' + l + '</div><div class="val ' + (c || '') + '">' + v + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
    $('#histSummary').innerHTML = '<div class="stats">' +
      '<div class="stat big"><div class="lbl">Total de ganancias · ' + esc(Calc.periodLabel(key)) + '</div><div class="val">' + (ps.count ? F(ps.gain, { sign: true }) : '—') + '</div><div class="sub">' + (ps.count ? 'Rentabilidad ' + P(ps.pct, 2, true) + ' · ' + ps.count + ' día(s) registrado(s)' : 'Sin registros en este periodo') + '</div></div>' +
      st('Balance al inicio', F(ps.startBalance), key ? 'del periodo' : 'capital inicial') +
      st('Balance al final', ps.endBalance == null ? '—' : F(ps.endBalance), 'del periodo') +
      st('Promedio por día registrado', ps.avg == null ? '—' : F(ps.avg), '', cls(ps.avg)) +
      st('Mayor ganancia diaria', ps.max ? F(ps.max.gain, { sign: true }) : '—', ps.max ? D(ps.max.date) : '', 'pos') +
      st('Menor ganancia diaria', ps.min ? F(ps.min.gain, { sign: true }) : '—', ps.min ? D(ps.min.date) : '', cls(ps.min && ps.min.gain)) +
      st('Rentabilidad del periodo', ps.pct == null ? '—' : P(ps.pct, 2, true), ps.flows ? 'Aportes netos: ' + F(ps.flows, { sign: true }) : '', cls(ps.gain)) +
      '</div>';
    const rows = visibleRows();
    $('#histTitle').textContent = ui.search ? 'Resultado de la búsqueda' : 'Registros · ' + Calc.periodLabel(key);
    $('#btnSort').textContent = ui.sortDesc ? 'Más recientes primero' : 'Más antiguos primero';
    const list = ui.sortDesc ? rows.slice().reverse() : rows;
    $('#histTable').innerHTML = list.length ? '<div class="table-wrap"><table class="stack-sm"><thead><tr><th>Fecha</th><th class="num">Balance acumulado</th><th class="num">Ganancia diaria</th><th class="num">Rendimiento diario</th><th></th></tr></thead><tbody>' +
      list.map(r => '<tr><td data-label="Fecha">' + D(r.date) + (r.flows ? '<span class="badge' + (r.flows < 0 ? ' out' : '') + '">' + (r.flows > 0 ? 'depósito' : 'retiro') + '</span>' : '') + '</td><td class="num" data-label="Balance acumulado">' + F(r.balance) + '</td><td class="num ' + cls(r.gain) + '" data-label="Ganancia diaria">' + F(r.gain, { sign: true }) + '</td><td class="num ' + cls(r.gain) + '" data-label="Rendimiento diario">' + P(r.pct, 4) + '</td><td class="actions">' +
        '<button class="icon-btn" data-action="detail" data-id="' + r.id + '" aria-label="Ver detalle">' + ICON.eye + '</button><button class="icon-btn" data-action="edit" data-id="' + r.id + '" aria-label="Editar">' + ICON.edit + '</button><button class="icon-btn del" data-action="del" data-id="' + r.id + '" aria-label="Eliminar">' + ICON.trash + '</button></td></tr>').join('') +
      '</tbody></table></div>'
      : '<div class="empty"><strong>' + (ui.search ? 'No hay registro en esa fecha' : 'No hay registros en este periodo') + '</strong>' + (ui.search ? 'Prueba con otra fecha o pulsa «Limpiar».' : 'Cambia el mes o el año, o registra un nuevo balance.') + '</div>';
  }

  function renderMovTable() {
    const mv = state.movements.slice().sort((a, b) => a.date < b.date ? 1 : -1);
    $('#movTable').innerHTML = mv.length ? '<div class="table-wrap"><table class="stack-sm"><thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Monto</th><th>Nota</th><th></th></tr></thead><tbody>' +
      mv.map(m => '<tr><td data-label="Fecha">' + D(m.date) + '</td><td data-label="Tipo"><span class="badge' + (m.type === 'withdrawal' ? ' out' : '') + '" style="margin:0">' + (m.type === 'deposit' ? 'Depósito' : 'Retiro') + '</span></td><td class="num ' + (m.type === 'deposit' ? 'pos' : 'neg') + '" data-label="Monto">' + (m.type === 'deposit' ? '+' : '-') + F(m.amount) + '</td><td data-label="Nota" class="full">' + (esc(m.note) || '<span class="muted">—</span>') + '</td><td class="actions"><button class="icon-btn" data-action="editmov" data-id="' + m.id + '" aria-label="Editar">' + ICON.edit + '</button><button class="icon-btn del" data-action="delmov" data-id="' + m.id + '" aria-label="Eliminar">' + ICON.trash + '</button></td></tr>').join('') +
      '</tbody></table></div><p class="hint">Estos movimientos se descuentan del cálculo: no cuentan como ganancia ni como pérdida.</p>'
      : '<div class="empty"><strong>No has registrado depósitos ni retiros</strong>Si agregas o sacas dinero del fondo, regístralo aquí para que no altere tus ganancias.</div>';
  }

  /* ----- Detalle, edición y eliminación ----- */
  function openDetail(id) {
    const r = calc.rows.find(x => x.id === id); if (!r) return;
    const perDay = r.days > 1 ? '<dt>Ganancia promedio por día natural</dt><dd>' + F(Math.round(r.gain / r.days), { sign: true }) + '</dd>' : '';
    openModal('<h3>Detalle del ' + D(r.date) + '</h3><dl>' +
      '<dt>Balance acumulado</dt><dd>' + F(r.balance) + '</dd>' +
      '<dt>' + (r.prevDate ? 'Balance anterior (' + D(r.prevDate) + ')' : 'Capital inicial') + '</dt><dd>' + F(r.prevBalance) + '</dd>' +
      (r.deposits ? '<dt>Depósitos del periodo</dt><dd>' + F(r.deposits) + '</dd>' : '') +
      (r.withdrawals ? '<dt>Retiros del periodo</dt><dd>' + F(r.withdrawals) + '</dd>' : '') +
      '<dt class="sep"></dt><dd class="sep"></dd>' +
      '<dt>Ganancia del día</dt><dd class="' + cls(r.gain) + '">' + F(r.gain, { sign: true }) + '</dd>' +
      '<dt>Rendimiento diario</dt><dd class="' + cls(r.gain) + '">' + P(r.pct, 4, true) + '</dd>' +
      '<dt>Días desde el registro anterior</dt><dd>' + r.days + '</dd>' + perDay + '</dl>' +
      '<div class="formula">Ganancia = Balance actual − Balance anterior − Depósitos + Retiros<br>' + F(r.balance, { plain: false }) + ' − ' + F(r.prevBalance) + (r.deposits ? ' − ' + F(r.deposits) : '') + (r.withdrawals ? ' + ' + F(r.withdrawals) : '') + ' = <b>' + F(r.gain, { sign: true }) + '</b></div>' +
      '<div class="actions-row"><button class="btn ghost" data-close>Cerrar</button><button class="btn primary" id="dtEdit">Editar</button></div>',
      (root) => $('#dtEdit', root).addEventListener('click', () => openRecordEditor(id)));
  }

  function openRecordEditor(id) {
    const rec = state.records.find(r => r.id === id); if (!rec) return;
    openModal('<h3>Editar registro</h3><div class="field"><label for="eDate">Fecha</label><input type="date" id="eDate" value="' + rec.date + '" max="' + Calc.todayStr() + '"></div>' +
      '<div class="field"><label for="eBal">Balance acumulado</label><div class="money-input"><span>RD$</span><input type="text" id="eBal" inputmode="decimal" value="' + Calc.fmtPlain(rec.balance) + '"></div></div>' +
      '<div id="ePreview"></div><div id="eErr" class="form-error" hidden></div>' +
      '<div class="actions-row"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="eSave">Guardar cambios</button></div>',
      (root) => {
        const read = () => ({ date: $('#eDate', root).value, balance: Calc.parseMoney($('#eBal', root).value), excludeId: id });
        const upd = () => {
          const i = read();
          $('#ePreview', root).innerHTML = (i.balance != null && Calc.isValidDate(i.date) && i.date >= state.config.startDate) ? gainBoxHTML(Calc.preview(state, i)) : '';
        };
        $('#eDate', root).addEventListener('input', upd); $('#eBal', root).addEventListener('input', upd);
        $('#eBal', root).addEventListener('blur', (e) => fmtOnBlur(e.target));
        upd();
        $('#eSave', root).addEventListener('click', async () => {
          const i = read(), m = Calc.validateRecord(state, i, Calc.todayStr());
          if (m) return showErr($('#eErr', root), m);
          rec.date = i.date; rec.balance = i.balance;
          closeModal(); await commit(); toast('Registro actualizado. Los cálculos posteriores se recalcularon.');
        });
      });
  }

  async function deleteRecord(id) {
    const r = calc.rows.find(x => x.id === id); if (!r) return;
    const later = calc.rows.length - calc.rows.indexOf(r) - 1;
    const ok = await confirmModal({ title: '¿Eliminar este registro?', danger: true, ok: 'Eliminar',
      body: 'Se eliminará el registro del <b>' + D(r.date) + '</b> (balance ' + F(r.balance) + ').' + (later ? ' El siguiente registro se comparará con el anterior que quede y se recalcularán los resultados posteriores.' : '') });
    if (!ok) return;
    state.records = state.records.filter(x => x.id !== id);
    await commit(); toast('Registro eliminado.');
  }

  function openMovEditor(id) {
    const m = state.movements.find(x => x.id === id); if (!m) return;
    let type = m.type;
    openModal('<h3>Editar movimiento</h3><div class="field"><span class="label">Tipo</span><div class="segmented small" id="emType"><button type="button" data-type="deposit"' + (type === 'deposit' ? ' class="active"' : '') + '>Depósito</button><button type="button" data-type="withdrawal"' + (type === 'withdrawal' ? ' class="active"' : '') + '>Retiro</button></div></div>' +
      '<div class="field"><label for="emDate">Fecha</label><input type="date" id="emDate" value="' + m.date + '" max="' + Calc.todayStr() + '"></div>' +
      '<div class="field"><label for="emAmt">Monto</label><div class="money-input"><span>RD$</span><input type="text" id="emAmt" inputmode="decimal" value="' + Calc.fmtPlain(m.amount) + '"></div></div>' +
      '<div class="field"><label for="emNote">Nota</label><input type="text" id="emNote" maxlength="80" value="' + esc(m.note || '') + '"></div>' +
      '<div id="emErr" class="form-error" hidden></div><div class="actions-row"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="emSave">Guardar cambios</button></div>',
      (root) => {
        $$('#emType button', root).forEach(b => b.addEventListener('click', () => { type = b.dataset.type; $$('#emType button', root).forEach(x => x.classList.toggle('active', x === b)); }));
        $('#emAmt', root).addEventListener('blur', (e) => fmtOnBlur(e.target));
        $('#emSave', root).addEventListener('click', async () => {
          const n = { date: $('#emDate', root).value, type, amount: Calc.parseMoney($('#emAmt', root).value) };
          const msg = Calc.validateMovement(state, n, Calc.todayStr());
          if (msg) return showErr($('#emErr', root), msg);
          Object.assign(m, n, { note: $('#emNote', root).value.trim() });
          closeModal(); await commit(); toast('Movimiento actualizado.');
        });
      });
  }
  async function deleteMov(id) {
    const m = state.movements.find(x => x.id === id); if (!m) return;
    const ok = await confirmModal({ title: '¿Eliminar este movimiento?', danger: true, ok: 'Eliminar', body: (m.type === 'deposit' ? 'Depósito' : 'Retiro') + ' de <b>' + F(m.amount) + '</b> del ' + D(m.date) + '. Las ganancias se recalcularán sin este movimiento.' });
    if (!ok) return;
    state.movements = state.movements.filter(x => x.id !== id);
    await commit(); toast('Movimiento eliminado.');
  }

  /* ------------------------------ Gráficos ------------------------------ */
  function renderGraficos() {
    $$('#rangeSel button').forEach(b => b.classList.toggle('active', b.dataset.range === ui.range));
    $$('#cmpSel button').forEach(b => b.classList.toggle('active', b.dataset.metric === ui.metric));
    const months = Calc.monthlyList(calc, state);
    Charts.balanceChart('chBalance', calc, state, ui.range);
    Charts.dailyChart('chDaily', calc, ui.range);
    Charts.monthlyChart('chMonthly', months);
    Charts.compareChart('chCompare', months, ui.metric);
    $('#monthTable').innerHTML = months.length ? '<div class="table-wrap"><table class="stack-sm"><thead><tr><th>Mes</th><th class="num">Balance final</th><th class="num">Ganancia</th><th class="num">Rentabilidad</th><th class="num">Registros</th></tr></thead><tbody>' +
      months.slice().reverse().map(m => '<tr class="clickable" data-month="' + m.key + '"><td data-label="Mes"><b>' + Calc.monthLabel(m.key) + '</b></td><td class="num" data-label="Balance final">' + F(m.endBalance) + '</td><td class="num ' + cls(m.gain) + '" data-label="Ganancia">' + F(m.gain, { sign: true }) + '</td><td class="num ' + cls(m.gain) + '" data-label="Rentabilidad">' + P(m.pct, 2, true) + '</td><td class="num" data-label="Registros">' + m.count + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty"><strong>Sin datos todavía</strong>Los gráficos aparecerán cuando registres balances.</div>';
  }

  /* ------------------------------ Ajustes ------------------------------ */
  function renderAjustes() {
    const c = state.config;
    $('#cfgName').value = c.name; $('#cfgStart').value = c.startDate;
    $('#cfgCapital').value = c.initialCapital ? Calc.fmtPlain(c.initialCapital) : '';
    const lb = state.meta.lastBackup;
    $('#backupInfo').innerHTML = (lb ? 'Último respaldo exportado: <b>' + D(lb.slice(0, 10)) + '</b>.' : '<b>Aún no has exportado ningún respaldo.</b>') +
      ' Tienes ' + state.records.length + ' registro(s) y ' + state.movements.length + ' movimiento(s). Almacenamiento: ' + ({ indexeddb: 'IndexedDB', localstorage: 'localStorage (alternativo)', memory: 'solo memoria (no persistente)' }[DB.mode]) + '.';
    $('#cfgError').hidden = true;
  }
  async function saveConfig(e) {
    e.preventDefault();
    const err = $('#cfgError'); showErr(err, '');
    const name = $('#cfgName').value.trim() || 'Fondo de inversión BHD';
    const start = $('#cfgStart').value, cap = Calc.parseMoney($('#cfgCapital').value);
    if (!Calc.isValidDate(start)) return showErr(err, 'Selecciona una fecha de inicio válida.');
    if (cap == null || cap <= 0) return showErr(err, 'Introduce un capital inicial mayor que cero.');
    const earliest = [].concat(state.records.map(r => r.date), state.movements.map(m => m.date)).sort()[0];
    if (earliest && start > earliest) return showErr(err, 'La fecha de inicio no puede ser posterior a tu primer registro o movimiento (' + D(earliest) + ').');
    const c = state.config;
    if (cap !== c.initialCapital && state.records.length) {
      const first = calc.rows[0];
      const ok = await confirmModal({ title: 'Cambiar el capital inicial', ok: 'Cambiar capital',
        body: 'El capital inicial solo es la base del <b>primer registro</b> (' + D(first.date) + '): su ganancia pasará de <b>' + F(first.gain) + '</b> a <b>' + F(first.balance - cap - first.flows) + '</b>. Los demás registros no cambian.<br><br>Si lo que hiciste fue agregar o sacar dinero, cancela y usa «Depósito / Retiro» para conservar el historial.' });
      if (!ok) return;
    }
    if (cap !== c.initialCapital) (c.capitalLog = c.capitalLog || []).push({ at: new Date().toISOString(), from: c.initialCapital, to: cap });
    Object.assign(c, { name, startDate: start, initialCapital: cap });
    await commit(); toast('Configuración guardada.');
  }

  /* ------------------------------ Respaldo ------------------------------ */
  function download(name, parts, type) {
    const url = URL.createObjectURL(new Blob(parts, { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function exportBackup() {
    state.meta.lastBackup = new Date().toISOString();
    await commit({ silent: true });
    const payload = { app: 'mi-fondo-bhd', version: 1, exportedAt: state.meta.lastBackup, data: state };
    download('mi-fondo-bhd-respaldo-' + Calc.todayStr() + '.json', [JSON.stringify(payload, null, 2)], 'application/json');
    toast('Respaldo descargado.'); renderAjustes();
  }
  function validateBackup(obj) {
    const d = obj && obj.data ? obj.data : obj;
    if (!d || typeof d !== 'object' || !d.config || !Array.isArray(d.records) || !Array.isArray(d.movements)) throw new Error('El archivo no es un respaldo de Mi Fondo BHD.');
    if (!Calc.isValidDate(d.config.startDate) || !Number.isInteger(d.config.initialCapital) || d.config.initialCapital < 0) throw new Error('La configuración del respaldo no es válida.');
    const byDate = new Map();
    d.records.forEach((r, i) => {
      if (!r || !Calc.isValidDate(r.date) || !Number.isInteger(r.balance) || r.balance < 0) throw new Error('Registro inválido en la posición ' + (i + 1) + '.');
      byDate.set(r.date, { id: r.id || uid(), date: r.date, balance: r.balance });
    });
    const movements = d.movements.map((m, i) => {
      if (!m || !Calc.isValidDate(m.date) || (m.type !== 'deposit' && m.type !== 'withdrawal') || !Number.isInteger(m.amount) || m.amount <= 0) throw new Error('Movimiento inválido en la posición ' + (i + 1) + '.');
      return { id: m.id || uid(), date: m.date, type: m.type, amount: m.amount, note: String(m.note || '').slice(0, 80) };
    });
    return normalize({ config: Object.assign({}, d.config, { name: String(d.config.name || 'Fondo de inversión BHD').slice(0, 60) }), records: Array.from(byDate.values()), movements, meta: Object.assign({}, d.meta, { demo: !!(d.meta && d.meta.demo) }) });
  }
  async function importBackup(file) {
    try {
      const next = validateBackup(JSON.parse(await file.text()));
      const ok = await confirmModal({ title: 'Importar respaldo', danger: true, ok: 'Reemplazar mis datos',
        body: 'El archivo contiene <b>' + next.records.length + ' registro(s)</b> y <b>' + next.movements.length + ' movimiento(s)</b>. Esto <b>reemplazará todos los datos actuales</b> de este dispositivo.' });
      if (!ok) return;
      state = next; calc = Calc.compute(state); lastPeriodDefaults();
      await commit(); toast('Respaldo importado correctamente.');
    } catch (e) { toast(e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : e.message, 'err'); }
  }

  /* ------------------------------ Exportar CSV / Excel / PDF ------------------------------ */
  const plain = (c) => (c / 100).toFixed(2);
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv() {
    const rows = visibleRows();
    if (!rows.length) return toast('No hay registros para exportar en esta vista.', 'err');
    const lines = [['Fecha', 'Balance acumulado (RD$)', 'Balance anterior (RD$)', 'Depósitos (RD$)', 'Retiros (RD$)', 'Ganancia diaria (RD$)', 'Rendimiento diario (%)']];
    rows.forEach(r => lines.push([D(r.date), plain(r.balance), plain(r.prevBalance), plain(r.deposits), plain(r.withdrawals), plain(r.gain), r.pct == null ? '' : r.pct.toFixed(4)]));
    download('mi-fondo-bhd-registros-' + (periodKey() || 'todo') + '.csv', ['﻿' + lines.map(l => l.map(csvCell).join(',')).join('\r\n')], 'text/csv;charset=utf-8');
    toast('CSV descargado (' + rows.length + ' registros).');
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.XLSX) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el módulo de Excel.'));
      document.head.appendChild(s);
    });
  }
  async function exportXlsx() {
    if (!calc.rows.length && !state.movements.length) return toast('No hay datos para exportar.', 'err');
    try { await loadScript('lib/xlsx.mini.min.js'); } catch (e) { return toast(e.message, 'err'); }
    const MONEY = '"RD$"#,##0.00', PCT = '0.0000"%"', DATE = 'dd/mm/yyyy';
    const serial = (d) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;
    const n = (v, z) => v == null ? { t: 's', v: '' } : { t: 'n', v, z };
    const s = (v) => ({ t: 's', v: String(v == null ? '' : v) });
    function sheet(head, body, widths) {
      const ws = {}, all = [head.map(s)].concat(body);
      all.forEach((row, r) => row.forEach((cell, c) => { ws[XLSX.utils.encode_cell({ r, c })] = cell; }));
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: all.length - 1, c: head.length - 1 } });
      ws['!cols'] = widths.map(w => ({ wch: w }));
      return ws;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(['Fecha', 'Balance acumulado', 'Balance anterior', 'Depósitos', 'Retiros', 'Ganancia diaria', 'Rendimiento diario'],
      calc.rows.map(r => [n(serial(r.date), DATE), n(r.balance / 100, MONEY), n(r.prevBalance / 100, MONEY), n(r.deposits / 100, MONEY), n(r.withdrawals / 100, MONEY), n(r.gain / 100, MONEY), n(r.pct, PCT)]), [13, 20, 20, 16, 16, 18, 18]), 'Registros');
    XLSX.utils.book_append_sheet(wb, sheet(['Mes', 'Balance inicial', 'Balance final', 'Ganancia del mes', 'Promedio por día', 'Mayor ganancia', 'Menor ganancia', 'Rentabilidad', 'Registros'],
      Calc.monthlyList(calc, state).map(m => [s(Calc.monthLabel(m.key)), n(m.startBalance / 100, MONEY), n(m.endBalance / 100, MONEY), n(m.gain / 100, MONEY), n(m.avg / 100, MONEY), n(m.max.gain / 100, MONEY), n(m.min.gain / 100, MONEY), n(m.pct, '0.00"%"'), n(m.count, '0')]), [20, 18, 18, 18, 18, 18, 18, 14, 11]), 'Resumen mensual');
    XLSX.utils.book_append_sheet(wb, sheet(['Fecha', 'Tipo', 'Monto', 'Nota'],
      state.movements.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(m => [n(serial(m.date), DATE), s(m.type === 'deposit' ? 'Depósito' : 'Retiro'), n(m.amount / 100, MONEY), s(m.note)]), [13, 12, 18, 40]), 'Movimientos');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download('mi-fondo-bhd-' + Calc.todayStr() + '.xlsx', [out], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('Excel descargado.');
  }

  function printReport() {
    const key = periodKey(), ps = Calc.periodSummary(calc, state, key);
    const rows = calc.rows.filter(r => r.date.startsWith(key));
    if (!rows.length) return toast('No hay registros en este periodo para el informe.', 'err');
    const box = (l, v) => '<div><small>' + l + '</small><b>' + v + '</b></div>';
    const img = Charts.reportImage(rows);
    $('#printArea').innerHTML = '<div class="rp-head"><div><h1>Informe ' + (key.length === 7 ? 'mensual' : key ? 'anual' : 'general') + ' · ' + esc(Calc.periodLabel(key)) + '</h1><p>' + esc(state.config.name) + ' · Pesos dominicanos (RD$)</p></div><p>Generado el ' + D(Calc.todayStr()) + '</p></div>' +
      '<div class="rp-stats">' + box('Balance al inicio', F(ps.startBalance)) + box('Balance al final', F(ps.endBalance)) + box('Total de ganancias', F(ps.gain, { sign: true })) +
      box('Rentabilidad del periodo', P(ps.pct, 2, true)) + box('Promedio por día registrado', F(ps.avg)) + box('Días registrados', ps.count) +
      box('Mayor ganancia diaria', F(ps.max.gain) + ' (' + D(ps.max.date).slice(0, 5) + ')') + box('Menor ganancia diaria', F(ps.min.gain, { sign: true }) + ' (' + D(ps.min.date).slice(0, 5) + ')') + box('Depósitos / retiros', F(ps.deposits) + ' / ' + F(ps.withdrawals)) + '</div>' +
      (img ? '<img alt="Ganancias diarias" src="' + img + '">' : '') +
      '<table><thead><tr><th>Fecha</th><th class="num">Balance acumulado</th><th class="num">Ganancia diaria</th><th class="num">Rendimiento diario</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + D(r.date) + (r.flows ? (r.flows > 0 ? ' (depósito)' : ' (retiro)') : '') + '</td><td class="num">' + F(r.balance) + '</td><td class="num ' + cls(r.gain) + '">' + F(r.gain, { sign: true }) + '</td><td class="num ' + cls(r.gain) + '">' + P(r.pct, 4) + '</td></tr>').join('') +
      '</tbody></table><div class="rp-foot">Datos introducidos manualmente por el titular. Informe de uso personal; no es un estado de cuenta oficial del banco.</div>';
    setTimeout(() => window.print(), 200);
  }

  /* ------------------------------ Eventos ------------------------------ */
  function fmtOnBlur(el) { const c = Calc.parseMoney(el.value); if (c != null) el.value = Calc.fmtPlain(c); }

  async function wipeDemo() {
    const ok = await confirmModal({ title: 'Borrar datos de demostración', danger: true, ok: 'Borrar y empezar',
      body: 'Se eliminarán los registros y movimientos de ejemplo. Después escribe tu capital inicial y la fecha en que empezaste a invertir.' });
    if (!ok) return;
    state = normalize(Demo.empty()); await commit({ silent: true }); lastPeriodDefaults();
    go('ajustes'); toast('Listo. Escribe tu capital inicial y la fecha de inicio.');
  }

  function bind() {
    // Navegación
    document.addEventListener('click', async (e) => {
      const v = e.target.closest('[data-view]'); if (v) return go(v.dataset.view);
      const g = e.target.closest('[data-goto]');
      if (g) { const t = g.dataset.goto; if (t === 'registrar-mov') { ui.regTab = 'mov'; go('registrar'); } else go(t); return; }
      const a = e.target.closest('[data-action]');
      if (a) {
        const id = a.dataset.id;
        ({ detail: () => openDetail(id), edit: () => openRecordEditor(id), del: () => deleteRecord(id), editmov: () => openMovEditor(id), delmov: () => deleteMov(id), 'wipe-demo': wipeDemo })[a.dataset.action]();
        return;
      }
      const mrow = e.target.closest('[data-month]');
      if (mrow) { ui.hYear = +mrow.dataset.month.slice(0, 4); ui.hMonth = +mrow.dataset.month.slice(5); ui.search = ''; ui.histTab = 'reg'; go('historial'); }
    });
    // Panel: selector de mes
    $('#panelCards').addEventListener('change', (e) => {
      const k = e.target.dataset.dash; if (!k) return;
      let [y, m] = ui.dashPeriod.split('-');
      if (k === 'm') m = String(e.target.value).padStart(2, '0'); else y = e.target.value;
      ui.dashPeriod = y + '-' + m; renderPanel();
    });
    // Registrar
    $$('[data-regtab]').forEach(b => b.addEventListener('click', () => { setRegTab(b.dataset.regtab); }));
    $('#recDate').addEventListener('input', updatePreview);
    $('#recBalance').addEventListener('input', updatePreview);
    $('#recBalance').addEventListener('blur', (e) => { fmtOnBlur(e.target); updatePreview(); });
    $('#formRecord').addEventListener('submit', submitRecord);
    $('#movAmount').addEventListener('blur', (e) => fmtOnBlur(e.target));
    $$('#movType button').forEach(b => b.addEventListener('click', () => { ui.movType = b.dataset.type; $$('#movType button').forEach(x => x.classList.toggle('active', x === b)); }));
    $('#formMov').addEventListener('submit', submitMov);
    // Historial
    $$('[data-histtab]').forEach(b => b.addEventListener('click', () => { ui.histTab = b.dataset.histtab; renderHistorial(); }));
    $('#hMonth').addEventListener('change', (e) => { ui.hMonth = +e.target.value; ui.search = ''; renderHistorial(); });
    $('#hYear').addEventListener('change', (e) => { ui.hYear = +e.target.value; if (!ui.hYear) ui.hMonth = 0; ui.search = ''; renderHistorial(); });
    $('#hSearch').addEventListener('change', (e) => { ui.search = e.target.value; renderHistorial(); });
    $('#hClear').addEventListener('click', () => { ui.search = ''; renderHistorial(); });
    $('#btnSort').addEventListener('click', () => { ui.sortDesc = !ui.sortDesc; renderHistorial(); });
    $('#btnCsv').addEventListener('click', exportCsv);
    $('#btnXlsx').addEventListener('click', exportXlsx);
    $('#btnPdf').addEventListener('click', printReport);
    // Gráficos
    $$('#rangeSel button').forEach(b => b.addEventListener('click', () => { ui.range = b.dataset.range; renderGraficos(); }));
    $$('#cmpSel button').forEach(b => b.addEventListener('click', () => { ui.metric = b.dataset.metric; renderGraficos(); }));
    // Ajustes
    $('#formCfg').addEventListener('submit', saveConfig);
    $('#cfgCapital').addEventListener('blur', (e) => fmtOnBlur(e.target));
    $('#btnExport').addEventListener('click', exportBackup);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); });
    $('#btnDemo').addEventListener('click', async () => {
      const ok = await confirmModal({ title: 'Cargar datos de demostración', danger: true, ok: 'Reemplazar mis datos', body: 'Esto <b>reemplaza todos tus datos actuales</b> por datos ficticios. Exporta un respaldo antes si no quieres perderlos.' });
      if (!ok) return;
      state = normalize(Demo.build()); await commit({ silent: true }); lastPeriodDefaults(); go('panel'); toast('Datos de demostración cargados.');
    });
    $('#btnWipe').addEventListener('click', async () => {
      const ok = await confirmModal({ title: 'Borrar todos los datos', danger: true, ok: 'Borrar todo', body: 'Se eliminarán <b>todos</b> tus registros, movimientos y configuración de este dispositivo. <b>No se puede deshacer</b>; exporta un respaldo antes si lo necesitas.' });
      if (!ok) return;
      state = normalize(Demo.empty()); await commit({ silent: true }); lastPeriodDefaults(); go('ajustes'); toast('Datos borrados.');
    });
    // Cambio de tema claro/oscuro: redibujar gráficos
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderView());
  }

  /* ------------------------------ Arranque ------------------------------ */
  async function boot() {
    let s = null;
    try { s = await DB.load(); } catch (e) { s = null; }
    const fresh = !s;
    state = normalize(s || Demo.build());
    calc = Calc.compute(state);
    if (fresh) await commit({ silent: true });
    updateStorageWarning();
    DB.requestPersistence();
    lastPeriodDefaults();
    $('#recDate').value = $('#movDate').value = Calc.todayStr();
    bind();
    const h = (location.hash || '').replace('#', '');
    renderHeader();
    go(VIEWS.includes(h) ? h : 'panel');
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
    window.__app = { get state() { return state; }, get calc() { return calc; } }; // útil para depurar
  }
  boot();
})();
