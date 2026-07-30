/**
 * FlowPilot Studio — Module Filtre Global (filter.js)
 * Gère toute la logique du filtre date global
 * Se connecte au code principal via window.FP_Filter
 */

let _rows         = [];
let _columns      = [];
let _filterDateCol = '';
let _filterFrom    = '';
let _filterTo      = '';
let _activePeriod  = null; // {mode, ref}
let _onApply       = null; // callback → appelé après chaque filtre
let _colLabel      = c => c;
let _parseDateValue = () => null;

// ── Init ──────────────────────────────────────────────────────────────────
export function initFilter({ rows, columns, colLabel, parseDateValue, onApply }) {
  _rows           = rows;
  _columns        = columns;
  _colLabel       = colLabel;
  _parseDateValue = parseDateValue;
  _onApply        = onApply;

  // Injecter le HTML dans la filter-bar existante
  const bar = document.getElementById('pf-filter-bar');
  if (!bar) return;

  bar.innerHTML = buildFilterHTML();
  attachEvents();
  autoDetectCol();
}

// ── HTML du filtre ────────────────────────────────────────────────────────
function buildFilterHTML() {
  return `
    <span class="pf-filter-label">📅 FILTRE GLOBAL</span>

    <button class="fp-filter-col-btn" id="fp-col-btn" title="Changer la colonne de référence">
      <span id="fp-col-lbl">— Colonne date —</span>
      <span style="opacity:.5;font-size:10px;margin-left:3px">▾</span>
    </button>

    <input type="date" class="pf-date-input" id="fp-date-from"/>
    <span class="pf-filter-sep">→</span>
    <input type="date" class="pf-date-input" id="fp-date-to"/>

    <button class="fp-filter-reset" id="fp-reset" style="display:none">Réinitialiser</button>

    <div style="width:1px;height:18px;background:var(--border);margin:0 4px"></div>

    <button class="fp-period-btn" id="fp-period-btn">
      📆 Période
    </button>

    <div class="fp-period-badge" id="fp-period-badge" style="display:none">
      <span id="fp-period-lbl"></span>
      <button id="fp-period-clear" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,.7);font-size:12px;padding:0 0 0 5px;line-height:1">✕</button>
    </div>

    <div style="margin-left:auto;font-size:11px;color:var(--mid)" id="fp-count"></div>

    <!-- Popup colonne -->
    <div class="fp-popup" id="fp-col-popup" style="display:none"></div>
    <!-- Popup période -->
    <div class="fp-popup" id="fp-period-popup" style="display:none"></div>
  `;
}

// ── CSS ───────────────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById('fp-filter-css')) return;
  const s = document.createElement('style');
  s.id = 'fp-filter-css';
  s.textContent = `
    .fp-filter-col-btn {
      border:1px solid var(--border);background:var(--card2);border-radius:8px;
      padding:5px 10px;font-size:12px;font-family:'DM Sans',sans-serif;
      color:var(--dark);cursor:pointer;transition:all .15s;
      display:flex;align-items:center;gap:2px;white-space:nowrap;
    }
    .fp-filter-col-btn:hover { border-color:var(--accent);color:var(--navy); }
    .fp-period-btn {
      border:1.5px solid var(--accent);background:var(--accent-soft);
      border-radius:8px;padding:5px 12px;font-size:11px;font-weight:800;
      font-family:'DM Sans',sans-serif;color:var(--navy);cursor:pointer;
      transition:all .15s;white-space:nowrap;
    }
    .fp-period-btn:hover { background:var(--accent); }
    .fp-period-badge {
      display:flex;align-items:center;gap:4px;background:var(--navy);
      color:#fff;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;
    }
    .fp-filter-reset {
      border:none;background:none;font-size:11px;color:var(--muted);
      cursor:pointer;font-family:'DM Sans',sans-serif;text-decoration:underline;padding:0;
    }
    .fp-filter-reset:hover { color:var(--coral); }
    .fp-popup {
      position:absolute;top:calc(100% + 6px);left:0;z-index:400;
      background:var(--card);border:1px solid var(--border);border-radius:12px;
      box-shadow:0 8px 24px rgba(13,27,42,.14);padding:12px;
    }
  `;
  document.head.appendChild(s);
}

// ── Events ────────────────────────────────────────────────────────────────
function attachEvents() {
  injectCSS();

  get('fp-col-btn')?.addEventListener('click', openColPicker);
  get('fp-date-from')?.addEventListener('change', onManualDateChange);
  get('fp-date-to')?.addEventListener('change', onManualDateChange);
  get('fp-reset')?.addEventListener('click', reset);
  get('fp-period-btn')?.addEventListener('click', openPeriodPicker);
  get('fp-period-clear')?.addEventListener('click', () => clearPeriod());
}

function get(id) { return document.getElementById(id); }

// ── Auto-détection colonne ────────────────────────────────────────────────
function autoDetectCol() {
  const dateCols = _columns.filter(c => c.type === 'date');
  if (!dateCols.length) return;

  if (dateCols.length === 1) {
    setDateCol(dateCols[0].name, false);
  }
  // Si plusieurs : on attend que l'user clique sur le bouton
  updateColBtn();
}

function setDateCol(colName, apply = true) {
  _filterDateCol = colName;
  _filterFrom = '';
  _filterTo   = '';
  _activePeriod = null;

  updateColBtn();

  // Auto-plage sur les données
  const dates = _rows
    .map(r => _parseDateValue(r[colName]))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (dates.length) {
    _filterFrom = toISO(dates[0]);
    _filterTo   = toISO(dates[dates.length - 1]);
    const fromEl = get('fp-date-from');
    const toEl   = get('fp-date-to');
    if (fromEl) fromEl.value = _filterFrom;
    if (toEl)   toEl.value   = _filterTo;
  }

  if (apply) applyFilter();
}

function updateColBtn() {
  const lbl = get('fp-col-lbl');
  if (lbl) lbl.textContent = _filterDateCol ? _colLabel(_filterDateCol) : '— Colonne date —';
}

// ── Popup choix colonne ────────────────────────────────────────────────────
function openColPicker() {
  const dateCols = _columns.filter(c => c.type === 'date');
  if (dateCols.length <= 1) return;

  const popup = get('fp-col-popup');
  if (!popup) return;

  popup.innerHTML = '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:8px">Colonne de référence</div>';

  dateCols.forEach(c => {
    const btn = document.createElement('button');
    btn.style.cssText = 'display:block;width:100%;text-align:left;border:1px solid var(--border);border-radius:7px;padding:7px 10px;margin-bottom:5px;font-size:12px;font-family:DM Sans,sans-serif;cursor:pointer;color:var(--dark);background:' + (c.name === _filterDateCol ? 'var(--accent-soft)' : '#fff');
    btn.textContent = (c.name === _filterDateCol ? '✓ ' : '') + _colLabel(c.name);
    btn.addEventListener('click', () => {
      popup.style.display = 'none';
      setDateCol(c.name);
    });
    popup.appendChild(btn);
  });

  popup.style.display = '';
  closeOnOutsideClick(popup);
}

// ── Dates manuelles ────────────────────────────────────────────────────────
function onManualDateChange() {
  _activePeriod = null;
  const badge = get('fp-period-badge');
  if (badge) badge.style.display = 'none';

  _filterFrom = get('fp-date-from')?.value || '';
  _filterTo   = get('fp-date-to')?.value   || '';

  const resetBtn = get('fp-reset');
  if (resetBtn) resetBtn.style.display = (_filterFrom || _filterTo) ? '' : 'none';

  applyFilter();
}

function reset() {
  _filterFrom = ''; _filterTo = '';
  _activePeriod = null;
  const fromEl = get('fp-date-from'), toEl = get('fp-date-to');
  if (fromEl) fromEl.value = '';
  if (toEl)   toEl.value   = '';
  const badge = get('fp-period-badge');
  if (badge) badge.style.display = 'none';
  const resetBtn = get('fp-reset');
  if (resetBtn) resetBtn.style.display = 'none';
  applyFilter();
}

// ── Popup Période ─────────────────────────────────────────────────────────
const PERIOD_MODES = [
  { id:'day',   icon:'📅', label:'Jour précis',   desc:'Une date exacte' },
  { id:'week',  icon:'📆', label:'Semaine',        desc:'Lundi → Dimanche' },
  { id:'month', icon:'🗓',  label:'Mois',          desc:'1er → dernier jour' },
  { id:'year',  icon:'📈', label:'Année',          desc:'1er janv → 31 déc' },
];

function openPeriodPicker() {
  const popup  = get('fp-period-popup');
  const btn    = get('fp-period-btn');
  if (!popup || !btn) return;

  // Positionner sous le bouton
  const btnRect = btn.getBoundingClientRect();
  const barRect = btn.closest('.pf-filter-bar').getBoundingClientRect();
  popup.style.left = (btnRect.left - barRect.left) + 'px';

  popup.innerHTML = '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:10px">Sélection rapide</div>';

  PERIOD_MODES.forEach(m => {
    const active = _activePeriod?.mode === m.id;
    const row = document.createElement('button');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;border:1.5px solid '+(active?'var(--accent)':'var(--border)')+';border-radius:9px;padding:9px 12px;margin-bottom:6px;background:'+(active?'var(--accent-soft)':'#fff')+';cursor:pointer;font-family:DM Sans,sans-serif;text-align:left';
    row.innerHTML = '<span style="font-size:18px">'+m.icon+'</span>'
      +'<div><div style="font-size:12px;font-weight:700;color:var(--dark)">'+m.label+'</div>'
      +'<div style="font-size:10px;color:var(--muted)">'+m.desc+'</div></div>';
    row.addEventListener('click', () => {
      popup.style.display = 'none';
      setPeriodMode(m.id);
    });
    popup.appendChild(row);
  });

  popup.style.display = '';
  closeOnOutsideClick(popup);
}

function setPeriodMode(mode) {
  _activePeriod = { mode, ref: _activePeriod?.ref || new Date() };
  applyPeriod();
}

function applyPeriod() {
  if (!_activePeriod) return;
  const { from, to } = getPeriodRange(_activePeriod.mode, _activePeriod.ref);
  _filterFrom = toISO(from);
  _filterTo   = toISO(to);

  const fromEl = get('fp-date-from'), toEl = get('fp-date-to');
  if (fromEl) fromEl.value = _filterFrom;
  if (toEl)   toEl.value   = _filterTo;

  // Badge
  const badge = get('fp-period-badge');
  const lbl   = get('fp-period-lbl');
  if (lbl) lbl.textContent = formatPeriodBadge(_activePeriod.mode, _activePeriod.ref);
  if (badge) badge.style.display = '';

  const resetBtn = get('fp-reset');
  if (resetBtn) resetBtn.style.display = '';

  applyFilter();
}

function clearPeriod(silent) {
  _activePeriod = null;
  const badge = get('fp-period-badge');
  if (badge) badge.style.display = 'none';
  if (!silent) {
    _filterFrom = ''; _filterTo = '';
    const fromEl = get('fp-date-from'), toEl = get('fp-date-to');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
    const resetBtn = get('fp-reset');
    if (resetBtn) resetBtn.style.display = 'none';
    applyFilter();
  }
}

function getPeriodRange(mode, ref) {
  const d = new Date(ref); d.setHours(0,0,0,0);
  let from, to;
  if (mode === 'day') {
    from = new Date(d); to = new Date(d);
  } else if (mode === 'week') {
    const day = d.getDay() || 7;
    from = new Date(d); from.setDate(d.getDate() - day + 1);
    to   = new Date(from); to.setDate(from.getDate() + 6);
  } else if (mode === 'month') {
    from = new Date(d.getFullYear(), d.getMonth(), 1);
    to   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  } else {
    from = new Date(d.getFullYear(), 0, 1);
    to   = new Date(d.getFullYear(), 11, 31);
  }
  return { from, to };
}

function formatPeriodBadge(mode, ref) {
  const { from } = getPeriodRange(mode, ref);
  const icons = { day:'📅', week:'📆', month:'🗓', year:'📈' };
  const fmt = (d, opts) => d.toLocaleDateString('fr-FR', opts);
  if (mode === 'day')   return icons.day  + ' ' + fmt(from, {day:'2-digit',month:'short',year:'numeric'});
  if (mode === 'week')  return icons.week + ' S' + getWeekNum(from) + ' ' + from.getFullYear();
  if (mode === 'month') return icons.month + ' ' + fmt(from, {month:'long',year:'numeric'});
  if (mode === 'year')  return icons.year + ' ' + from.getFullYear();
  return '';
}

function getWeekNum(d) {
  const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
  return Math.ceil((((d2 - y0) / 86400000) + 1) / 7);
}

// ── Appliquer le filtre ────────────────────────────────────────────────────
function applyFilter() {
  let filtered = null;

  if (_filterDateCol && (_filterFrom || _filterTo)) {
    const from = _filterFrom ? new Date(_filterFrom) : null;
    const to   = _filterTo   ? new Date(_filterTo + 'T23:59:59') : null;
    filtered = _rows.filter(r => {
      const d = _parseDateValue(r[_filterDateCol]);
      if (!d) return false;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  // Mettre à jour le compteur
  const count = (filtered || _rows).length;
  const countEl = get('fp-count');
  if (countEl) {
    countEl.textContent = filtered
      ? count.toLocaleString() + ' / ' + _rows.length.toLocaleString() + ' lignes filtrées'
      : _rows.length.toLocaleString() + ' lignes · aucun filtre actif';
  }

  // Callback principal
  if (_onApply) _onApply(filtered);
}

// ── Utils ─────────────────────────────────────────────────────────────────
function toISO(d) { return d.toISOString().slice(0, 10); }

function closeOnOutsideClick(popup) {
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popup.contains(e.target)) {
        popup.style.display = 'none';
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

// ── API publique ──────────────────────────────────────────────────────────
export function getFilteredRows() {
  if (!_filterDateCol || (!_filterFrom && !_filterTo)) return null;
  const from = _filterFrom ? new Date(_filterFrom) : null;
  const to   = _filterTo   ? new Date(_filterTo + 'T23:59:59') : null;
  return _rows.filter(r => {
    const d = _parseDateValue(r[_filterDateCol]);
    if (!d) return false;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

export function getFilterState() {
  return { col: _filterDateCol, from: _filterFrom, to: _filterTo };
}
