/**
 * FlowPilot Studio — Module Polices (fonts.js)
 * Bibliothèque de 10 polices libres de droit (Google Fonts, licence OFL)
 * Utilisables dans le Tuning des widgets (titres, valeurs KPI).
 */

// ── Bibliothèque de polices ──────────────────────────────────────────────
const FONT_LIBRARY = [
  { id: 'dmsans',     label: 'DM Sans',          family: "'DM Sans', sans-serif",          weights: '400;500;600;700;800', category: 'Par défaut' },
  { id: 'inter',      label: 'Inter',            family: "'Inter', sans-serif",             weights: '400;500;600;700;800', category: 'Professionnel' },
  { id: 'manrope',    label: 'Manrope',          family: "'Manrope', sans-serif",           weights: '400;500;600;700;800', category: 'Professionnel' },
  { id: 'sora',       label: 'Sora',             family: "'Sora', sans-serif",              weights: '400;500;600;700;800', category: 'Professionnel' },
  { id: 'outfit',     label: 'Outfit',           family: "'Outfit', sans-serif",            weights: '400;500;600;700;800', category: 'Professionnel' },
  { id: 'spacegro',   label: 'Space Grotesk',    family: "'Space Grotesk', sans-serif",     weights: '400;500;600;700',     category: 'Professionnel' },
  { id: 'plexsans',   label: 'IBM Plex Sans',    family: "'IBM Plex Sans', sans-serif",     weights: '400;500;600;700',     category: 'Professionnel' },
  { id: 'lexend',     label: 'Lexend',           family: "'Lexend', sans-serif",            weights: '400;500;600;700;800', category: 'Professionnel' },
  { id: 'oswald',     label: 'Oswald',           family: "'Oswald', sans-serif",            weights: '400;500;600;700',     category: 'Condensé' },
  { id: 'jbmono',     label: 'JetBrains Mono',   family: "'JetBrains Mono', monospace",     weights: '400;500;600;700',     category: 'Mono (chiffres)' },
  { id: 'bricolage',  label: 'Bricolage Grotesque', family: "'Bricolage Grotesque', sans-serif", weights: '400;500;600;700;800', category: 'Distinctive' },
];

let _loadedFonts = new Set();

// ── Chargement dynamique (une seule fois par police) ─────────────────────
function loadFont(fontId) {
  const font = FONT_LIBRARY.find(f => f.id === fontId);
  if (!font || _loadedFonts.has(fontId)) return;
  if (font.id === 'dmsans') { _loadedFonts.add(fontId); return; } // déjà chargée par défaut

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  const familyParam = font.label.replace(/ /g, '+');
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${font.weights}&display=swap`;
  document.head.appendChild(link);
  _loadedFonts.add(fontId);
}

function getFontFamily(fontId) {
  const font = FONT_LIBRARY.find(f => f.id === fontId);
  return font ? font.family : "'DM Sans', sans-serif";
}

// ── Sélecteur de police (pour panneau Tuning) ────────────────────────────
function buildFontPicker(currentFontId, onSelect) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:6px';

  const categories = [...new Set(FONT_LIBRARY.map(f => f.category))];
  categories.forEach(cat => {
    const catLabel = document.createElement('div');
    catLabel.textContent = cat;
    catLabel.style.cssText = 'font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#6b7280);padding:6px 6px 2px';
    wrap.appendChild(catLabel);

    FONT_LIBRARY.filter(f => f.category === cat).forEach(font => {
      loadFont(font.id); // précharger pour l'aperçu
      const item = document.createElement('button');
      const active = font.id === (currentFontId || 'dmsans');
      item.style.cssText = `display:flex;align-items:center;justify-content:space-between;width:100%;border:1.5px solid ${active ? 'var(--accent,#EF9F27)' : 'transparent'};background:${active ? 'var(--accent-soft,#FFF3E0)' : '#fff'};border-radius:7px;padding:7px 10px;cursor:pointer;font-family:${font.family};font-size:14px;color:var(--dark,#1a2733);transition:all .15s`;
      item.innerHTML = `<span>${font.label}</span>` + (active ? '<span style="font-size:11px;color:var(--accent,#EF9F27)">✓</span>' : '');
      item.addEventListener('mouseenter', () => { if (!active) item.style.background = '#f8fafc'; });
      item.addEventListener('mouseleave', () => { if (!active) item.style.background = '#fff'; });
      item.addEventListener('click', () => onSelect(font.id));
      wrap.appendChild(item);
    });
  });

  return wrap;
}

export { FONT_LIBRARY, loadFont, getFontFamily, buildFontPicker };
