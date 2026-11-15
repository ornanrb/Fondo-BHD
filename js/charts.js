/* ==========================================================================
   Gráficos (Chart.js, incluido localmente en lib/). Se redibujan cada vez
   que cambian los datos. Los colores salen de las variables CSS, así que
   siguen el modo claro/oscuro.
   ========================================================================== */
const Charts = (function () {
  'use strict';
  const inst = {};

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function palette() {
    return { ink: css('--ink'), muted: css('--muted'), line: css('--line'), primary: css('--chart-1'), accent: css('--pos'),
      neg: css('--neg'), warn: css('--chart-3'), surface: css('--surface'), series: [css('--chart-1'), css('--chart-2'), css('--chart-3'), css('--chart-4')] };
  }
  const money = (v) => Calc.fmtMoney(v * 100);
  function tickMoney(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' M';
    if (a >= 1e4) return Math.round(v / 1e3) + ' k';
    return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2);
  }
  function shortDate(s) { return s.slice(8, 10) + '/' + s.slice(5, 7); }

  function base(p, extra) {
    const o = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false, labels: { color: p.muted, usePointStyle: true, boxWidth: 8 } },
        tooltip: { backgroundColor: p.ink, titleColor: p.surface, bodyColor: p.surface, padding: 10, cornerRadius: 8, displayColors: true }
      },
      scales: {
        x: { ticks: { color: p.muted, maxRotation: 0, autoSkipPadding: 14 }, grid: { display: false }, border: { color: p.line } },
        y: { ticks: { color: p.muted, callback: tickMoney }, grid: { color: p.line }, border: { display: false } }
      }
    };
    return Object.assign(o, extra || {});
  }

  function make(id, config) {
    const el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return null;
    if (inst[id]) inst[id].destroy();
    inst[id] = new Chart(el, config);
    return inst[id];
  }

  function slice(rows, range) {
    if (!range || range === 'all') return rows;
    const n = parseInt(range, 10);
    return rows.slice(-n);
  }

  function balanceChart(id, calc, state, range, mini) {
    const p = palette();
    const rows = slice(calc.rows, range);
    const inv = Calc.investedSeries(calc, state).slice(-rows.length);
    const o = base(p);
    o.plugins.tooltip.callbacks = { label: (c) => ' ' + c.dataset.label + ': ' + money(c.parsed.y) };
    o.plugins.legend.display = !mini;
    if (mini) { o.scales.x.ticks.maxTicksLimit = 5; }
    make(id, {
      type: 'line',
      data: {
        labels: rows.map(r => shortDate(r.date)),
        datasets: [
          { label: 'Balance acumulado', data: rows.map(r => r.balance / 100), borderColor: p.primary, backgroundColor: p.primary + '22', fill: true, tension: .25, borderWidth: 2.5, pointRadius: rows.length > 45 ? 0 : 3, pointHoverRadius: 5 },
          { label: 'Capital aportado', data: inv.map(v => v / 100), borderColor: p.warn, borderDash: [6, 5], borderWidth: 2, stepped: true, pointRadius: 0, fill: false, hidden: !!mini }
        ].filter(d => !(mini && d.label === 'Capital aportado'))
      },
      options: o
    });
  }

  function dailyChart(id, calc, range) {
    const p = palette();
    const rows = slice(calc.rows, range);
    const o = base(p);
    o.plugins.tooltip.callbacks = {
      label: (c) => ' Ganancia: ' + Calc.fmtMoney(Math.round(c.parsed.y * 100), { sign: true }),
      afterLabel: (c) => ' Rendimiento: ' + Calc.fmtPct(rows[c.dataIndex].pct, 4)
    };
    make(id, {
      type: 'bar',
      data: { labels: rows.map(r => shortDate(r.date)), datasets: [{ label: 'Ganancia diaria', data: rows.map(r => r.gain / 100), backgroundColor: rows.map(r => r.gain >= 0 ? p.accent : p.neg), borderRadius: 4, maxBarThickness: 26 }] },
      options: o
    });
  }

  function monthlyChart(id, months) {
    const p = palette();
    const data = months.slice(-12);
    const o = base(p);
    o.plugins.tooltip.callbacks = {
      label: (c) => ' Ganancia: ' + Calc.fmtMoney(Math.round(c.parsed.y * 100), { sign: true }),
      afterLabel: (c) => ' Rentabilidad: ' + Calc.fmtPct(data[c.dataIndex].pct, 2) + ' · ' + data[c.dataIndex].count + ' registros'
    };
    make(id, {
      type: 'bar',
      data: { labels: data.map(m => Calc.MESES_CORTOS[+m.key.slice(5, 7) - 1] + ' ' + m.key.slice(2, 4)), datasets: [{ label: 'Ganancia mensual', data: data.map(m => m.gain / 100), backgroundColor: data.map(m => m.gain >= 0 ? p.primary : p.neg), borderRadius: 6, maxBarThickness: 48 }] },
      options: o
    });
  }

  /** Comparación mes a mes: un color por año, enero a diciembre. metric: 'gain' | 'pct' */
  function compareChart(id, months, metric) {
    const p = palette();
    const years = [...new Set(months.map(m => m.key.slice(0, 4)))].sort();
    const o = base(p);
    o.plugins.legend.display = true;
    const isPct = metric === 'pct';
    o.scales.y.ticks.callback = isPct ? (v) => v.toFixed(2) + '%' : tickMoney;
    o.plugins.tooltip.callbacks = {
      label: (c) => ' ' + c.dataset.label + ': ' + (c.parsed.y == null ? '—' : isPct ? Calc.fmtPct(c.parsed.y, 2) : Calc.fmtMoney(Math.round(c.parsed.y * 100), { sign: true }))
    };
    make(id, {
      type: 'bar',
      data: {
        labels: Calc.MESES_CORTOS,
        datasets: years.map((y, i) => ({
          label: y, backgroundColor: p.series[i % p.series.length], borderRadius: 4, maxBarThickness: 28,
          data: Calc.MESES_CORTOS.map((_, mi) => {
            const m = months.find(x => x.key === y + '-' + String(mi + 1).padStart(2, '0'));
            if (!m) return null;
            return isPct ? m.pct : m.gain / 100;
          })
        }))
      },
      options: o
    });
  }

  /** Devuelve una imagen (dataURL) del gráfico de ganancias diarias para el informe PDF. */
  function reportImage(rows) {
    if (typeof Chart === 'undefined' || !rows.length) return null;
    const p = { ink: '#12213a', muted: '#4a5873', line: '#d9dfea', accent: '#0f9d77', neg: '#d23f3f', surface: '#ffffff', primary: '#12467f', warn: '#b7791f', series: [] }; // siempre claro para imprimir
    const cv = document.createElement('canvas');
    cv.width = 1400; cv.height = 460;
    const o = base(p, { responsive: false, animation: false, devicePixelRatio: 1 });
    o.scales.x.ticks.font = { size: 20 }; o.scales.y.ticks.font = { size: 20 };
    const ch = new Chart(cv, {
      type: 'bar',
      data: { labels: rows.map(r => shortDate(r.date)), datasets: [{ data: rows.map(r => r.gain / 100), backgroundColor: rows.map(r => r.gain >= 0 ? p.accent : p.neg), borderRadius: 4 }] },
      options: o
    });
    const url = cv.toDataURL('image/png');
    ch.destroy();
    return url;
  }

  function destroyAll() { Object.keys(inst).forEach(k => { inst[k].destroy(); delete inst[k]; }); }

  return { balanceChart, dailyChart, monthlyChart, compareChart, reportImage, destroyAll };
})();
