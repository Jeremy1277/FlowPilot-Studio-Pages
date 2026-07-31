/**
 * FlowPilot Studio — Module Analyste IA (analyst.js)
 * Bouton IA dans la colonne droite, chat conversationnel
 * pour analyser les widgets du canvas
 */

let _getWidgets     = () => [];
let _getFilteredRows = () => null;
let _getRows        = () => [];
let _fmtNum         = v => v;
let _openAIKey      = () => '';

const MODEL = 'gpt-4o-mini';

// ── Init ──────────────────────────────────────────────────────────────────
export function initAnalyst({ getWidgets, getFilteredRows, getRows, fmtNum, getOpenAIKey }) {
  _getWidgets      = getWidgets;
  _getFilteredRows = getFilteredRows;
  _getRows         = getRows;
  _fmtNum          = fmtNum;
  _getOpenAIKey    = getOpenAIKey;

  injectCSS();
  injectButton();
}

// ── CSS ───────────────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById('fp-analyst-css')) return;
  const s = document.createElement('style');
  s.id = 'fp-analyst-css';
  s.textContent = `
    /* Bouton IA dans la colonne droite */
    #fp-analyst-btn {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      padding: 8px 6px;
      border-radius: 12px;
      transition: background .15s;
      width: 52px;
      border: none;
      background: none;
      font-family: 'DM Sans', sans-serif;
      margin-top: auto;
      margin-bottom: 8px;
    }
    #fp-analyst-btn:hover { background: rgba(127,119,221,.1); }
    #fp-analyst-btn svg { display: block; }
    #fp-analyst-btn-label {
      font-size: 9px;
      font-weight: 800;
      color: #7F77DD;
      letter-spacing: .02em;
    }

    /* Overlay */
    #fp-analyst-overlay {
      position: fixed; inset: 0; z-index: 490;
      background: rgba(13,27,42,.35);
      display: none;
    }

    /* Panneau chat */
    #fp-analyst-panel {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 380px;
      background: #fff;
      box-shadow: -4px 0 28px rgba(13,27,42,.16);
      z-index: 500;
      display: none;
      flex-direction: column;
      font-family: 'DM Sans', sans-serif;
    }
    #fp-analyst-panel.open { display: flex; }

    /* Header */
    .fp-an-head {
      background: linear-gradient(135deg, #2d2060, #4a3aaa);
      padding: 16px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .fp-an-head-left { display: flex; align-items: center; gap: 10px; }
    .fp-an-head-icon {
      width: 34px; height: 34px;
      background: rgba(255,255,255,.15);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .fp-an-head-title {
      font-family: 'Syne', sans-serif;
      font-size: 14px; font-weight: 800; color: #fff;
    }
    .fp-an-head-sub {
      font-size: 10px; color: rgba(255,255,255,.5); margin-top: 1px;
    }
    .fp-an-close {
      background: none; border: none;
      color: rgba(255,255,255,.5);
      font-size: 18px; cursor: pointer;
      line-height: 1; padding: 4px;
      border-radius: 6px; transition: color .15s;
    }
    .fp-an-close:hover { color: #fff; }

    /* Context bar */
    .fp-an-context {
      padding: 8px 14px;
      background: #f8f9ff;
      border-bottom: 1px solid #e8eaf6;
      font-size: 11px; color: #5c6bc0;
      display: flex; align-items: center; gap: 6px;
      flex-shrink: 0;
    }
    .fp-an-context-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #7F77DD;
      animation: fpPulse 2s infinite;
    }
    @keyframes fpPulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* Messages */
    #fp-an-messages {
      flex: 1; overflow-y: auto;
      padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .fp-an-msg {
      display: flex; gap: 8px; align-items: flex-start;
    }
    .fp-an-msg.user { flex-direction: row-reverse; }
    .fp-an-avatar {
      width: 28px; height: 28px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; flex-shrink: 0;
    }
    .fp-an-msg.assistant .fp-an-avatar { background: #ede7f6; }
    .fp-an-msg.user .fp-an-avatar { background: #e3f2fd; }
    .fp-an-bubble {
      max-width: 280px;
      padding: 9px 12px;
      border-radius: 12px;
      font-size: 12px;
      line-height: 1.6;
    }
    .fp-an-msg.assistant .fp-an-bubble {
      background: #f4f0ff;
      color: #1a1a2e;
      border-radius: 4px 12px 12px 12px;
    }
    .fp-an-msg.user .fp-an-bubble {
      background: #1a2733;
      color: #fff;
      border-radius: 12px 4px 12px 12px;
    }
    .fp-an-thinking {
      display: flex; gap: 4px; padding: 10px 12px;
    }
    .fp-an-thinking span {
      width: 6px; height: 6px; border-radius: 50%;
      background: #7F77DD; opacity: .4;
      animation: fpBounce .9s infinite;
    }
    .fp-an-thinking span:nth-child(2) { animation-delay: .15s; }
    .fp-an-thinking span:nth-child(3) { animation-delay: .3s; }
    @keyframes fpBounce { 0%,100%{transform:translateY(0);opacity:.4} 50%{transform:translateY(-4px);opacity:1} }

    /* Suggestions rapides */
    .fp-an-suggestions {
      padding: 0 14px 8px;
      display: flex; flex-wrap: wrap; gap: 6px;
      flex-shrink: 0;
    }
    .fp-an-suggestion {
      border: 1px solid #d1c4e9;
      background: #f4f0ff;
      border-radius: 16px;
      padding: 5px 11px;
      font-size: 11px; font-weight: 600;
      color: #5c35aa;
      cursor: pointer; transition: all .15s;
      font-family: 'DM Sans', sans-serif;
    }
    .fp-an-suggestion:hover { background: #ede7f6; border-color: #9c73d6; }

    /* Input */
    .fp-an-input-wrap {
      padding: 10px 14px 14px;
      border-top: 1px solid var(--border, #e5e7eb);
      display: flex; gap: 8px; align-items: flex-end;
      flex-shrink: 0;
    }
    #fp-an-input {
      flex: 1;
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 12px;
      font-family: 'DM Sans', sans-serif;
      resize: none; outline: none;
      max-height: 100px;
      line-height: 1.5;
      transition: border-color .15s;
    }
    #fp-an-input:focus { border-color: #7F77DD; }
    #fp-an-send {
      width: 34px; height: 34px;
      background: #7F77DD;
      border: none; border-radius: 9px;
      cursor: pointer; display: flex;
      align-items: center; justify-content: center;
      flex-shrink: 0; transition: background .15s;
    }
    #fp-an-send:hover { background: #6b65c8; }
    #fp-an-send svg { display: block; }
  `;
  document.head.appendChild(s);
}

// ── Injecter le bouton dans le widget-panel ────────────────────────────────
function injectButton() {
  const panel = document.getElementById('widget-panel');
  if (!panel || document.getElementById('fp-analyst-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'fp-analyst-btn';
  btn.title = 'Analyste IA — analyser le dashboard';
  btn.onclick = openAnalyst;
  btn.innerHTML = `
    <svg viewBox="0 0 40 40" width="38" height="38">
      <rect width="40" height="40" rx="10" fill="#EDE7F6"/>
      <circle cx="20" cy="17" r="7" fill="none" stroke="#7F77DD" stroke-width="2"/>
      <path d="M15 14 Q20 10 25 14" fill="none" stroke="#7F77DD" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="17" cy="17" r="1.5" fill="#7F77DD"/>
      <circle cx="23" cy="17" r="1.5" fill="#7F77DD"/>
      <path d="M17 21 Q20 23 23 21" fill="none" stroke="#7F77DD" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="20" y1="24" x2="20" y2="29" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
      <line x1="16" y1="29" x2="24" y2="29" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span id="fp-analyst-btn-label">IA</span>
  `;
  panel.appendChild(btn);

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'fp-analyst-overlay';
  overlay.onclick = closeAnalyst;
  document.body.appendChild(overlay);

  // Panneau
  const panelEl = document.createElement('div');
  panelEl.id = 'fp-analyst-panel';
  panelEl.innerHTML = `
    <div class="fp-an-head">
      <div class="fp-an-head-left">
        <div class="fp-an-head-icon">🧠</div>
        <div>
          <div class="fp-an-head-title">Analyste IA</div>
          <div class="fp-an-head-sub">Analyse de votre dashboard</div>
        </div>
      </div>
      <button class="fp-an-close" onclick="window.__fpAnalystClose()">✕</button>
    </div>
    <div class="fp-an-context" id="fp-an-context">
      <div class="fp-an-context-dot"></div>
      <span id="fp-an-context-txt">Chargement du contexte…</span>
    </div>
    <div id="fp-an-messages"></div>
    <div class="fp-an-suggestions" id="fp-an-suggestions"></div>
    <div class="fp-an-input-wrap">
      <textarea id="fp-an-input" rows="1" placeholder="Posez une question sur vos données…"></textarea>
      <button id="fp-an-send" onclick="window.__fpAnalystSend()">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <path d="M3 10L17 3L10 17L9 11L3 10Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(panelEl);

  // Exposer globalement
  window.__fpAnalystClose = closeAnalyst;
  window.__fpAnalystOpen  = openAnalyst;
  window.__fpAnalystSend  = sendMessage;

  // Enter pour envoyer
  document.getElementById('fp-an-input')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// ── Ouvrir / Fermer ────────────────────────────────────────────────────────
function openAnalyst() {
  const panel   = document.getElementById('fp-analyst-panel');
  const overlay = document.getElementById('fp-analyst-overlay');
  if (!panel) return;

  panel.classList.add('open');
  if (overlay) overlay.style.display = '';

  updateContext();
  showSuggestions();

  // Message d'accueil si vide
  const msgs = document.getElementById('fp-an-messages');
  if (msgs && !msgs.children.length) {
    addMessage('assistant', '👋 Bonjour ! Je suis votre analyste IA. Je peux analyser les widgets de votre dashboard, identifier des tendances, comparer des valeurs ou répondre à vos questions sur vos données. Par quoi commençons-nous ?');
  }

  setTimeout(() => document.getElementById('fp-an-input')?.focus(), 100);
}

function closeAnalyst() {
  document.getElementById('fp-analyst-panel')?.classList.remove('open');
  document.getElementById('fp-analyst-overlay').style.display = 'none';
}

// ── Contexte ──────────────────────────────────────────────────────────────
function updateContext() {
  const widgets = _getWidgets();
  const rows    = _getFilteredRows() || _getRows();
  const txt     = document.getElementById('fp-an-context-txt');
  if (txt) {
    txt.textContent = widgets.length + ' widget(s) · ' + rows.length.toLocaleString() + ' lignes' + (_getFilteredRows() ? ' filtrées' : '');
  }
}

function buildDashboardContext() {
  const widgets = _getWidgets();
  const rows    = _getFilteredRows() || _getRows();

  if (!widgets.length) return 'Le dashboard est vide — aucun widget créé.';

  const lines = ['Dashboard FlowPilot Studio — Contexte pour analyse :',
    '- ' + rows.length.toLocaleString() + ' lignes de données' + (_getFilteredRows() ? ' (filtrées)' : ''),
    '- ' + widgets.length + ' widget(s) sur le canvas :',
    ''
  ];

  widgets.forEach(function(w, i) {
    const typeLabels = { bar:'Histogramme', donut:'Secteurs', line:'Courbe', kpi:'KPI', table:'Tableau', gauge:'Jauge' };
    const type = typeLabels[w.type] || w.type;
    const title = w.title || (type + ' ' + (i+1));
    lines.push('Widget ' + (i+1) + ' : ' + title + ' (' + type + ')');
    if (w.col)  lines.push('  Dimension : ' + w.col);
    if (w.col2) lines.push('  Valeur : ' + w.col2 + ' (' + (w.aggr || 'sum') + ')');

    // Ajouter un résumé des valeurs si possible
    try {
      if (w.col2 && rows.length) {
        const vals = rows.map(r => parseFloat(r[w.col2])).filter(v => !isNaN(v));
        if (vals.length) {
          const sum = vals.reduce((s,v) => s+v, 0);
          const avg = sum / vals.length;
          const max = Math.max(...vals);
          const min = Math.min(...vals);
          lines.push('  Stats : total=' + _fmtNum(sum) + ', moy=' + _fmtNum(avg) + ', max=' + _fmtNum(max) + ', min=' + _fmtNum(min));
        }
      }
      // Top 5 pour histogramme/secteurs
      if ((w.type === 'bar' || w.type === 'donut') && w.col && w.col2 && rows.length) {
        const agg = {};
        rows.forEach(function(r) {
          const k = r[w.col] || '(vide)';
          agg[k] = (agg[k] || 0) + (parseFloat(r[w.col2]) || 0);
        });
        const sorted = Object.entries(agg).sort((a,b) => b[1]-a[1]).slice(0,5);
        lines.push('  Top 5 : ' + sorted.map(([k,v]) => k + '=' + _fmtNum(v)).join(', '));
      }
    } catch(e) {}
    lines.push('');
  });

  return lines.join('\n');
}

// ── Suggestions rapides ───────────────────────────────────────────────────
const SUGGESTIONS = [
  '📊 Analyse générale du dashboard',
  '📈 Quelles tendances observes-tu ?',
  '🏆 Quels sont les tops performers ?',
  '⚠️ Y a-t-il des anomalies ?',
  '💡 Recommandations d\'optimisation',
];

function showSuggestions() {
  const zone = document.getElementById('fp-an-suggestions');
  if (!zone) return;
  zone.innerHTML = '';
  SUGGESTIONS.forEach(function(s) {
    const btn = document.createElement('button');
    btn.className = 'fp-an-suggestion';
    btn.textContent = s;
    btn.onclick = function() {
      document.getElementById('fp-an-input').value = s;
      sendMessage();
    };
    zone.appendChild(btn);
  });
}

// ── Messages ──────────────────────────────────────────────────────────────
const _history = [];

function addMessage(role, text) {
  const msgs = document.getElementById('fp-an-messages');
  if (!msgs) return;

  const isUser = role === 'user';
  const div = document.createElement('div');
  div.className = 'fp-an-msg ' + role;
  div.innerHTML =
    '<div class="fp-an-avatar">' + (isUser ? '👤' : '🧠') + '</div>'
    + '<div class="fp-an-bubble">' + formatMessage(text) + '</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function formatMessage(text) {
  // Markdown minimal : **bold**, bullet points
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•] (.+)$/gm, '<div style="padding-left:8px;margin:2px 0">• $1</div>')
    .replace(/\n/g, '<br>');
}

function addThinking() {
  const msgs = document.getElementById('fp-an-messages');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = 'fp-an-msg assistant';
  div.id = 'fp-an-thinking';
  div.innerHTML = '<div class="fp-an-avatar">🧠</div>'
    + '<div class="fp-an-bubble fp-an-thinking"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// ── Envoyer un message ────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('fp-an-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  // Cacher suggestions
  const sugg = document.getElementById('fp-an-suggestions');
  if (sugg) sugg.style.display = 'none';

  // Ajouter message user
  addMessage('user', text);
  _history.push({ role: 'user', content: text });

  // Thinking
  const thinking = addThinking();

  // Construire le contexte
  const ctx = buildDashboardContext();

  // Appel API
  const apiKey = _getOpenAIKey ? _getOpenAIKey() : (sessionStorage.getItem('fp_openai_key') || '');

  if (!apiKey) {
    thinking?.remove();
    addMessage('assistant', '⚠️ Clé OpenAI non configurée. Renseignez votre clé dans les paramètres Studio pour activer l\'analyse IA.');
    return;
  }

  try {
    const reply = await window.fpAiChat([
      {
        role: 'system',
        content: 'Tu es un analyste BI expert. Tu analyses les données d\'un dashboard FlowPilot Studio et tu fournis des insights clairs, concis et actionnables. Réponds en français. Sois direct et précis. Utilise des bullet points quand c\'est pertinent. Voici le contexte du dashboard :\n\n' + ctx
      },
      ..._history
    ], { maxTokens: 600 });
    thinking?.remove();

    addMessage('assistant', reply || 'Pas de réponse.');
    _history.push({ role: 'assistant', content: reply || '' });
    updateContext();

  } catch(e) {
    thinking?.remove();
    addMessage('assistant', '❌ Erreur de connexion : ' + e.message);
    _history.pop();
  }
}
