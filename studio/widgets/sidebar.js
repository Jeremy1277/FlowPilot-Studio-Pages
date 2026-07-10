/**
 * FlowPilot Studio — Module Sidebar (sidebar.js)
 * Remplace la liste de colonnes par une icône tableau + popup
 * S'intègre sans modifier le code principal
 */

// ── Init ──────────────────────────────────────────────────────────────────
export function initSidebar({ columns, colAliases, colDateFormats, colLabel, onUpdate }) {
  _columns        = columns;
  _colAliases     = colAliases;
  _colDateFormats = colDateFormats;
  _colLabel       = colLabel;
  _onUpdate       = onUpdate;

  injectCSS();
  replacesidebar();
}

let _columns = [], _colAliases = {}, _colDateFormats = {}, _colLabel = c => c, _onUpdate = null;

// ── CSS ───────────────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById('fp-sidebar-css')) return;
  const s = document.createElement('style');
  s.id = 'fp-sidebar-css';
  s.textContent = `
    /* Sidebar compacte — forcer toutes les dimensions */
    #sidebar {
      width: 64px !important;
      min-width: 64px !important;
      max-width: 64px !important;
      flex-shrink: 0 !important;
      background: #fff;
      border-right: 1px solid var(--border);
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      padding: 14px 0 !important;
      gap: 10px !important;
      overflow: visible !important;
      position: relative;
    }
    /* Cacher tout l'ancien contenu sidebar */
    #sidebar .sb-head        { display: none !important; }
    #sidebar .col-search-wrap { display: none !important; }
    #sidebar #col-count      { display: none !important; }
    #sidebar #col-list       { display: none !important; }
    #sidebar .col-resizer    { display: none !important; }
    /* Variable CSS utilisée par le resizer */
    :root { --sb-width: 64px !important; }

    /* Icône tableau */
    #fp-sb-icon {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      padding: 8px 6px;
      border-radius: 12px;
      transition: background .15s;
      width: 52px;
    }
    #fp-sb-icon:hover { background: var(--accent-soft, #fff8ed); }
    #fp-sb-icon svg { display: block; }
    #fp-sb-badge {
      font-size: 9px;
      font-weight: 800;
      color: var(--muted, #6b7280);
      letter-spacing: .02em;
      text-align: center;
    }

    /* Overlay */
    #fp-sb-overlay {
      position: fixed; inset: 0; z-index: 490;
      background: rgba(13,27,42,.3);
      display: none;
    }

    /* Panneau */
    #fp-sb-panel {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: 320px;
      background: #fff;
      box-shadow: 4px 0 28px rgba(13,27,42,.16);
      z-index: 500;
      display: none;
      flex-direction: column;
      font-family: 'DM Sans', sans-serif;
    }
    #fp-sb-panel.open { display: flex; }

    /* Header panel */
    .fp-sb-panel-head {
      background: var(--navy, #004D8C);
      padding: 16px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .fp-sb-panel-head-title {
      font-family: 'Syne', sans-serif;
      font-size: 14px;
      font-weight: 800;
      color: #fff;
    }
    .fp-sb-panel-head-sub {
      font-size: 11px;
      color: rgba(255,255,255,.5);
      margin-top: 2px;
    }
    .fp-sb-close {
      background: none; border: none;
      color: rgba(255,255,255,.6);
      font-size: 18px; cursor: pointer;
      line-height: 1; padding: 4px;
      border-radius: 6px;
      transition: color .15s;
    }
    .fp-sb-close:hover { color: #fff; }

    /* Search */
    .fp-sb-search-wrap {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border, #e5e7eb);
      flex-shrink: 0;
      position: relative;
    }
    .fp-sb-search-wrap input {
      width: 100%;
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 8px;
      padding: 7px 10px 7px 30px;
      font-size: 12px;
      font-family: 'DM Sans', sans-serif;
      outline: none;
      transition: border-color .15s;
    }
    .fp-sb-search-wrap input:focus { border-color: var(--accent, #EF9F27); }
    .fp-sb-search-icon {
      position: absolute;
      left: 23px; top: 50%;
      transform: translateY(-50%);
      font-size: 13px; opacity: .4;
    }

    /* Liste colonnes */
    #fp-sb-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px 16px;
    }

    /* Item colonne */
    .fp-sb-col-item {
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 6px;
      background: #fff;
      transition: border-color .15s;
    }
    .fp-sb-col-item:hover { border-color: #cbd5e1; }
    .fp-sb-col-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .fp-sb-type-badge {
      width: 22px; height: 22px;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 800;
      flex-shrink: 0;
    }
    .fp-sb-col-name {
      font-size: 12px; font-weight: 700;
      color: var(--dark, #1a2733);
      white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; flex: 1;
    }
    .fp-sb-col-orig {
      font-size: 10px;
      color: var(--muted, #6b7280);
      margin-top: 1px;
    }
    .fp-sb-field-label {
      font-size: 10px; font-weight: 700;
      color: var(--muted, #6b7280);
      text-transform: uppercase;
      letter-spacing: .05em;
      margin-bottom: 3px;
    }
    .fp-sb-input {
      width: 100%;
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 11px;
      font-family: 'DM Sans', sans-serif;
      outline: none;
      margin-bottom: 6px;
      transition: border-color .15s;
    }
    .fp-sb-input:focus { border-color: var(--accent, #EF9F27); }
    .fp-sb-no-results {
      text-align: center;
      padding: 24px 16px;
      color: var(--muted, #6b7280);
      font-size: 13px;
    }
  `;
  document.head.appendChild(s);
}

// ── Remplacer la sidebar ───────────────────────────────────────────────────
function replacesidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Forcer les dimensions via style inline (priorité max)
  sidebar.style.cssText = 'width:64px!important;min-width:64px!important;max-width:64px!important;flex-shrink:0;overflow:visible!important';

  // Cacher tout l'ancien contenu
  const sbHead = sidebar.querySelector('.sb-head');
  const colList = document.getElementById('col-list');
  const colResizer = sidebar.querySelector('.col-resizer');
  if (sbHead) sbHead.style.display = 'none';
  if (colList) colList.style.display = 'none';
  if (colResizer) colResizer.style.display = 'none';
  // Cacher aussi le texte "Glisser une colonne"
  sidebar.querySelectorAll('*').forEach(function(el) {
    if (el.id === 'fp-sb-icon' || el.id === 'fp-sb-badge') return;
    if (!el.id || !el.id.startsWith('fp-sb')) el.style.display = 'none';
  });

  // Ajouter l'icône tableau
  if (!document.getElementById('fp-sb-icon')) {
    const icon = document.createElement('div');
    icon.id = 'fp-sb-icon';
    icon.title = 'Colonnes détectées';
    icon.onclick = openPanel;
    icon.innerHTML = `
      <svg viewBox="0 0 40 40" width="38" height="38">
        <rect width="40" height="40" rx="10" fill="#FFF8E1"/>
        <rect x="6" y="8"  width="28" height="6"  rx="2" fill="#EF9F27" opacity=".9"/>
        <rect x="6" y="17" width="28" height="5"  rx="1.5" fill="#EF9F27" opacity=".22"/>
        <rect x="6" y="24" width="28" height="5"  rx="1.5" fill="#EF9F27" opacity=".15"/>
        <rect x="6" y="31" width="28" height="5"  rx="1.5" fill="#EF9F27" opacity=".22"/>
        <line x1="20" y1="8" x2="20" y2="36" stroke="#EF9F27" stroke-width="1" opacity=".3"/>
      </svg>
      <span id="fp-sb-badge">— col.</span>
    `;
    sidebar.insertBefore(icon, sidebar.firstChild);
  }

  // Créer overlay + panel s'ils n'existent pas
  if (!document.getElementById('fp-sb-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'fp-sb-overlay';
    overlay.onclick = closePanel;
    document.body.appendChild(overlay);
  }

  if (!document.getElementById('fp-sb-panel')) {
    const panel = document.createElement('div');
    panel.id = 'fp-sb-panel';
    panel.innerHTML = `
      <div class="fp-sb-panel-head">
        <div>
          <div class="fp-sb-panel-head-title">Colonnes détectées</div>
          <div class="fp-sb-panel-head-sub" id="fp-sb-count"></div>
        </div>
        <button class="fp-sb-close" onclick="window.__fpSidebarClose()">✕</button>
      </div>
      <div class="fp-sb-search-wrap">
        <span class="fp-sb-search-icon">🔍</span>
        <input id="fp-sb-search" type="text" placeholder="Rechercher une colonne…"
          oninput="window.__fpSidebarSearch(this.value)"
          autocomplete="off" spellcheck="false"/>
      </div>
      <div id="fp-sb-list"></div>
    `;
    document.body.appendChild(panel);
  }

  // Exposer les fonctions globalement
  window.__fpSidebarClose  = closePanel;
  window.__fpSidebarOpen   = openPanel;
  window.__fpSidebarSearch = function(q) { renderList(q); };

  updateBadge();
}

// ── Ouvrir / Fermer ────────────────────────────────────────────────────────
function openPanel() {
  document.getElementById('fp-sb-panel')?.classList.add('open');
  document.getElementById('fp-sb-overlay').style.display = '';
  renderList('');
  setTimeout(() => document.getElementById('fp-sb-search')?.focus(), 60);
}

function closePanel() {
  document.getElementById('fp-sb-panel')?.classList.remove('open');
  document.getElementById('fp-sb-overlay').style.display = 'none';
}

// ── Badge ─────────────────────────────────────────────────────────────────
function updateBadge() {
  const badge = document.getElementById('fp-sb-badge');
  if (badge) badge.textContent = _columns.length + ' col.';
}

// ── Rendre la liste ────────────────────────────────────────────────────────
const TYPE_ICON  = { text: 'T', number: '#', date: '📅', boolean: '☑' };
const TYPE_COLOR = { text: '#607287', number: '#1D9E75', date: '#4a7fa5', boolean: '#7F77DD' };

const DATE_FMT_OPTIONS = [
  { value: '',            label: 'Auto-détection' },
  { value: 'YYYY-MM-DD',  label: 'AAAA-MM-JJ' },
  { value: 'DD/MM/YYYY',  label: 'JJ/MM/AAAA' },
  { value: 'MM/DD/YYYY',  label: 'MM/JJ/AAAA (US)' },
  { value: 'DD.MM.YYYY',  label: 'JJ.MM.AAAA' },
  { value: 'DD-MM-YYYY',  label: 'JJ-MM-AAAA' },
];

function renderList(query) {
  const list    = document.getElementById('fp-sb-list');
  const countEl = document.getElementById('fp-sb-count');
  if (!list) return;

  const q = (query || '').toLowerCase().trim();
  const filtered = q
    ? _columns.filter(c =>
        (_colAliases[c.name] || c.name).toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q))
    : _columns;

  if (countEl) countEl.textContent = filtered.length + ' / ' + _columns.length + ' colonnes';
  updateBadge();

  list.innerHTML = '';

  if (!filtered.length) {
    list.innerHTML = '<div class="fp-sb-no-results">Aucun résultat pour «&nbsp;' + esc(query) + '&nbsp;»</div>';
    return;
  }

  filtered.forEach(function(c) {
    const alias  = _colAliases[c.name] || '';
    const fmt    = _colDateFormats[c.name] || '';
    const color  = TYPE_COLOR[c.type] || '#8ca0b3';
    const icon   = TYPE_ICON[c.type]  || '?';

    const item = document.createElement('div');
    item.className = 'fp-sb-col-item';

    // Header
    const header = document.createElement('div');
    header.className = 'fp-sb-col-header';
    header.innerHTML =
      '<div class="fp-sb-type-badge" style="background:' + color + '22;color:' + color + '">' + icon + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div class="fp-sb-col-name" title="' + esc(c.name) + '">' + esc(alias || c.name) + '</div>'
      + (alias ? '<div class="fp-sb-col-orig">' + esc(c.name) + '</div>' : '')
      + '</div>';
    item.appendChild(header);

    // Champ renommer
    const renameLabel = document.createElement('div');
    renameLabel.className = 'fp-sb-field-label';
    renameLabel.textContent = 'Renommer';
    item.appendChild(renameLabel);

    const renameInput = document.createElement('input');
    renameInput.className = 'fp-sb-input';
    renameInput.type = 'text';
    renameInput.placeholder = 'Laisser vide = nom original';
    renameInput.value = alias;
    renameInput.addEventListener('change', function() {
      const val = this.value.trim();
      if (val) _colAliases[c.name] = val;
      else delete _colAliases[c.name];
      renderList(query);
      if (_onUpdate) _onUpdate();
    });
    item.appendChild(renameInput);

    // Champ format date (colonnes date uniquement)
    if (c.type === 'date') {
      const fmtLabel = document.createElement('div');
      fmtLabel.className = 'fp-sb-field-label';
      fmtLabel.textContent = 'Format de date';
      item.appendChild(fmtLabel);

      const fmtSelect = document.createElement('select');
      fmtSelect.className = 'fp-sb-input';
      DATE_FMT_OPTIONS.forEach(function(opt) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === fmt) o.selected = true;
        fmtSelect.appendChild(o);
      });
      fmtSelect.addEventListener('change', function() {
        if (this.value) _colDateFormats[c.name] = this.value;
        else delete _colDateFormats[c.name];
        if (_onUpdate) _onUpdate();
      });
      item.appendChild(fmtSelect);
    }

    list.appendChild(item);
  });
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
