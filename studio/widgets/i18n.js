/*!
 * FlowPilot Studio — Copyright (c) 2026 Jeremy Ducrot. Tous droits réservés.
 * Logiciel propriétaire. Voir LICENSE. Reproduction ou réutilisation du code
 * interdites sans autorisation écrite.
 */
/**
 * FlowPilot Studio — Module Internationalisation (i18n.js)
 * Dictionnaire FR/EN, sélecteur de langue, persistance localStorage.
 * Indépendant de la devise (gérée séparément).
 */

const STORAGE_KEY = 'fp_lang';
const DEFAULT_LANG = 'fr';

// ── Dictionnaire ──────────────────────────────────────────────────────────
// Clés organisées par écran/contexte pour rester lisible.
const I18N = {
  fr: {
    // Navigation générale
    nav_data: 'Données',
    nav_templates: 'Templates',
    nav_table: 'Table',
    nav_widgets: 'Widgets',
    nav_design: 'Design',
    btn_back: '← Retour',

    // Écran Données (étape 1)
    data_step_label: 'ÉTAPE 1',
    data_title: 'DONNÉES',
    data_subtitle: 'FlowPilot analysera les colonnes, contrôlera la qualité des données, puis proposera les templates adaptés.',
    data_dropzone_text: "Excel ou CSV — jusqu'à 50 000 lignes",
    data_browse_btn: 'Parcourir…',
    data_formats_allowed: 'Formats autorisés',
    data_clean_table_note: "Idéalement un tableau propre : une ligne d'en-tête, une colonne par information, pas de cellules fusionnées.",
    data_open_project_btn: '📂 Ouvrir un projet .fpstudio',
    btn_design_export: 'Design & Export →',

    // Panneau Visuels (droite)
    panel_visuals_title: 'Visuels',
    panel_columns_label: 'Colonnes',
    panel_columns_desc: 'Gérer · Renommer',
    widget_bar_label: 'Histogramme',
    widget_bar_desc: 'Comparaison par catégorie',
    widget_donut_label: 'Secteurs',
    widget_donut_desc: 'Répartition en parts',
    widget_line_label: 'Courbe',
    widget_line_desc: 'Évolution dans le temps',
    widget_kpi_label: 'KPI',
    widget_kpi_desc: 'Indicateur clé',
    widget_table_label: 'Tableau',
    widget_table_desc: 'Données détaillées',
    widget_geo_label: 'Carte',
    widget_geo_desc: 'Répartition géographique',

    // Canvas vide
    canvas_empty_title: 'Ton canvas est vide',
    canvas_empty_sub: 'Utilise les boutons à gauche pour ajouter des widgets',

    // Popup Colonnes
    colpop_title: 'Colonnes',
    colpop_search_placeholder: 'Rechercher…',
    colpop_rename_label: 'Renommer',
    colpop_rename_placeholder: 'Laisser vide = nom original',
    colpop_dateformat_label: 'Format date',
    colpop_no_results: 'Aucun résultat',
    colpop_auto: 'Auto',

    // Mini sélecteur de type (drop colonne)
    typepicker_column_label: 'Colonne',
    typepicker_choose_visual: 'Choisir un visuel',

    // Modale création widget
    modal_visual_name: 'Nom du visuel',
    modal_visual_name_placeholder: 'Laisser vide pour auto',
    modal_axis_x: 'Axe X — Dimension',
    modal_axis_y: 'Axe Y — Valeur',
    modal_aggregation: 'Agrégation',
    modal_trend_checkbox: 'Ajouter une courbe de tendance',
    modal_orientation: 'Orientation',
    modal_orientation_vertical: 'Vertical',
    modal_orientation_horizontal: 'Horizontal',
    modal_orientation_stacked: 'Empilé',
    modal_create_btn: '✓ Créer le visuel',

    // Boutons widget (barre d'actions)
    wc_btn_fullscreen: 'Plein écran',
    wc_btn_values: 'Valeurs',
    wc_btn_tuning: '⚙ Tuning',
    wc_btn_ai: '✨ IA',
    wc_btn_edit: 'Modifier',
    wc_btn_delete: 'Supprimer',

    // Panneau Tuning
    tuning_title: '⚙ Tuning du visuel',
    tuning_shape: 'Forme',
    tuning_colors: 'Couleurs',
    tuning_sort_topn: 'Tri & Top N',
    tuning_appearance: 'Apparence',
    tuning_objective: 'Objectif',
    tuning_axis_sort: "Classement de l'axe",
    tuning_apply_btn: '✓ Appliquer',
    tuning_fill_under_curve: 'Remplissage sous la courbe',
    tuning_show_values_bars: 'Afficher les valeurs sur les barres',
    tuning_target_value: 'Valeur cible',
    tuning_max_value: 'Valeur max',
    tuning_label: 'Label',

    // Filtre global
    filter_global_label: '📅 FILTRE GLOBAL',
    filter_date_col_placeholder: '— Colonne date —',
    filter_reset: 'Réinitialiser',
    filter_period_btn: 'Période',
    filter_impacts_all: 'Impacte tous les widgets du dashboard',
    filter_lines_filtered: 'lignes filtrées',
    filter_lines_no_filter: 'lignes · aucun filtre actif',
    period_day: 'Jour précis',
    period_day_desc: 'Une date exacte',
    period_week: 'Semaine',
    period_week_desc: 'Lundi → Dimanche',
    period_month: 'Mois',
    period_month_desc: '1er → dernier jour',
    period_year: 'Année',
    period_year_desc: '1er janv → 31 déc',

    // Toasts
    toast_alias_removed: 'Alias supprimé',
    toast_no_dashboard_capture: 'Aucun dashboard à capturer.',
    toast_no_dashboard_export: 'Aucun dashboard à exporter.',
    toast_blank_canvas_opened: 'Canvas vierge ouvert',
    toast_ai_module_loading: "Module IA en cours de chargement, réessayez dans un instant",
    toast_widget_deleted: 'Widget supprimé',
    toast_incompatible_column: '⚠ Colonne incompatible',
    toast_load_data_first: '⚠ Charge un fichier de données d\'abord',
    toast_empty_file: '⚠ Fichier vide',
    toast_select_one_column: '⚠ Sélectionne au moins une colonne',
    toast_image_copied: '✅ Image copiée ! Collez directement dans votre mail ou rapport (Ctrl+V).',
    toast_pdf_exported: '✅ PDF exporté !',
    toast_blank_canvas_manual: '✓ Canvas vierge ouvert — tu peux ajouter tes widgets manuellement',
    toast_column_renamed: '✓ Colonne renommée',
    toast_colors_reset: '✓ Couleurs réinitialisées',
    toast_data_loaded: '✓ Données chargées — choisis maintenant ton template',
    toast_dateformat_updated: '✓ Format de date mis à jour',
    toast_tuning_applied: '✓ Tuning appliqué',
    toast_widget_moved: '✓ Widget déplacé',
    toast_pdf_error: '❌ Erreur PDF : ',
    toast_capture_error: '❌ Erreur capture : ',
    toast_html_export_generated: '⬇ Export HTML généré !',
    toast_pdf_generating: '📄 Génération du PDF…',
    toast_image_downloaded: '📥 Image téléchargée (presse-papier non disponible sur ce navigateur).',
    toast_capturing: '📷 Capture en cours…',
  },

  en: {
    nav_data: 'Data',
    nav_templates: 'Templates',
    nav_table: 'Table',
    nav_widgets: 'Widgets',
    nav_design: 'Design',
    btn_back: '← Back',

    // Data screen (step 1)
    data_step_label: 'STEP 1',
    data_title: 'DATA',
    data_subtitle: 'FlowPilot will analyze your columns, check data quality, then suggest the right templates.',
    data_dropzone_text: 'Excel or CSV — up to 50,000 rows',
    data_browse_btn: 'Browse…',
    data_formats_allowed: 'Allowed formats',
    data_clean_table_note: 'Ideally a clean table: one header row, one column per field, no merged cells.',
    data_open_project_btn: '📂 Open a .fpstudio project',
    btn_design_export: 'Design & Export →',

    panel_visuals_title: 'Visuals',
    panel_columns_label: 'Columns',
    panel_columns_desc: 'Manage · Rename',
    widget_bar_label: 'Bar Chart',
    widget_bar_desc: 'Comparison by category',
    widget_donut_label: 'Pie Chart',
    widget_donut_desc: 'Breakdown by share',
    widget_line_label: 'Line Chart',
    widget_line_desc: 'Trend over time',
    widget_kpi_label: 'KPI',
    widget_kpi_desc: 'Key indicator',
    widget_table_label: 'Table',
    widget_table_desc: 'Detailed data',
    widget_geo_label: 'Map',
    widget_geo_desc: 'Geographic breakdown',

    canvas_empty_title: 'Your canvas is empty',
    canvas_empty_sub: 'Use the buttons on the left to add widgets',

    colpop_title: 'Columns',
    colpop_search_placeholder: 'Search…',
    colpop_rename_label: 'Rename',
    colpop_rename_placeholder: 'Leave empty = original name',
    colpop_dateformat_label: 'Date format',
    colpop_no_results: 'No results',
    colpop_auto: 'Auto',

    typepicker_column_label: 'Column',
    typepicker_choose_visual: 'Choose a visual',

    modal_visual_name: 'Visual name',
    modal_visual_name_placeholder: 'Leave empty for auto',
    modal_axis_x: 'X Axis — Dimension',
    modal_axis_y: 'Y Axis — Value',
    modal_aggregation: 'Aggregation',
    modal_trend_checkbox: 'Add a trend line',
    modal_orientation: 'Orientation',
    modal_orientation_vertical: 'Vertical',
    modal_orientation_horizontal: 'Horizontal',
    modal_orientation_stacked: 'Stacked',
    modal_create_btn: '✓ Create visual',

    wc_btn_fullscreen: 'Fullscreen',
    wc_btn_values: 'Values',
    wc_btn_tuning: '⚙ Tuning',
    wc_btn_ai: '✨ AI',
    wc_btn_edit: 'Edit',
    wc_btn_delete: 'Delete',

    tuning_title: '⚙ Visual Tuning',
    tuning_shape: 'Shape',
    tuning_colors: 'Colors',
    tuning_sort_topn: 'Sort & Top N',
    tuning_appearance: 'Appearance',
    tuning_objective: 'Target',
    tuning_axis_sort: 'Axis sorting',
    tuning_apply_btn: '✓ Apply',
    tuning_fill_under_curve: 'Fill under the curve',
    tuning_show_values_bars: 'Show values on bars',
    tuning_target_value: 'Target value',
    tuning_max_value: 'Max value',
    tuning_label: 'Label',

    filter_global_label: '📅 GLOBAL FILTER',
    filter_date_col_placeholder: '— Date column —',
    filter_reset: 'Reset',
    filter_period_btn: 'Period',
    filter_impacts_all: 'Affects all widgets on the dashboard',
    filter_lines_filtered: 'rows filtered',
    filter_lines_no_filter: 'rows · no active filter',
    period_day: 'Specific day',
    period_day_desc: 'An exact date',
    period_week: 'Week',
    period_week_desc: 'Monday → Sunday',
    period_month: 'Month',
    period_month_desc: '1st → last day',
    period_year: 'Year',
    period_year_desc: 'Jan 1 → Dec 31',

    toast_alias_removed: 'Alias removed',
    toast_no_dashboard_capture: 'No dashboard to capture.',
    toast_no_dashboard_export: 'No dashboard to export.',
    toast_blank_canvas_opened: 'Blank canvas opened',
    toast_ai_module_loading: 'AI module is loading, please try again shortly',
    toast_widget_deleted: 'Widget deleted',
    toast_incompatible_column: '⚠ Incompatible column',
    toast_load_data_first: '⚠ Load a data file first',
    toast_empty_file: '⚠ Empty file',
    toast_select_one_column: '⚠ Select at least one column',
    toast_image_copied: '✅ Image copied! Paste it directly into your email or report (Ctrl+V).',
    toast_pdf_exported: '✅ PDF exported!',
    toast_blank_canvas_manual: '✓ Blank canvas opened — you can add your widgets manually',
    toast_column_renamed: '✓ Column renamed',
    toast_colors_reset: '✓ Colors reset',
    toast_data_loaded: '✓ Data loaded — now choose your template',
    toast_dateformat_updated: '✓ Date format updated',
    toast_tuning_applied: '✓ Tuning applied',
    toast_widget_moved: '✓ Widget moved',
    toast_pdf_error: '❌ PDF error: ',
    toast_capture_error: '❌ Capture error: ',
    toast_html_export_generated: '⬇ HTML export generated!',
    toast_pdf_generating: '📄 Generating PDF…',
    toast_image_downloaded: '📥 Image downloaded (clipboard not available on this browser).',
    toast_capturing: '📷 Capturing…',
  }
};

// ── API ───────────────────────────────────────────────────────────────────

function getLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && I18N[stored]) return stored;
  } catch (e) {}
  return DEFAULT_LANG;
}

function setLang(lang) {
  if (!I18N[lang]) return;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  document.dispatchEvent(new CustomEvent('fp-lang-changed', { detail: { lang } }));
}

function t(key, fallback) {
  const lang = getLang();
  const dict = I18N[lang] || I18N[DEFAULT_LANG];
  if (dict[key] !== undefined) return dict[key];
  if (I18N[DEFAULT_LANG][key] !== undefined) return I18N[DEFAULT_LANG][key];
  return fallback !== undefined ? fallback : key;
}

// ── Sélecteur de langue (drapeau) ───────────────────────────────────────
function injectLangSwitcherCSS() {
  if (document.getElementById('fp-i18n-css')) return;
  const s = document.createElement('style');
  s.id = 'fp-i18n-css';
  s.textContent = `
    #fp-lang-switch {
      display: flex; align-items: center; gap: 2px;
      background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 2px; font-family: 'DM Sans', sans-serif;
    }
    #fp-lang-switch button {
      border: none; background: none; cursor: pointer;
      padding: 5px 8px; border-radius: 6px;
      line-height: 1; transition: background .15s, opacity .15s;
      opacity: .45; display: flex; align-items: center;
    }
    #fp-lang-switch button svg { display: block; border-radius: 2px; }
    #fp-lang-switch button.active {
      background: #fff; opacity: 1;
      box-shadow: 0 1px 3px rgba(13,27,42,.12);
    }
    #fp-lang-switch button:hover { opacity: .8; }
  `;
  document.head.appendChild(s);
}

// Drapeaux en SVG (fiables sur toutes plateformes, pas de dépendance aux polices emoji)
const FLAG_FR = '<svg viewBox="0 0 24 16" width="18" height="13"><rect width="8" height="16" fill="#0055A4"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#EF4135"/></svg>';
const FLAG_GB = '<svg viewBox="0 0 24 16" width="18" height="13"><rect width="24" height="16" fill="#00247d"/><path d="M0 0L24 16M24 0L0 16" stroke="#fff" stroke-width="2.4"/><path d="M0 0L24 16M24 0L0 16" stroke="#cf142b" stroke-width="1.2"/><path d="M12 0V16M0 8H24" stroke="#fff" stroke-width="4"/><path d="M12 0V16M0 8H24" stroke="#cf142b" stroke-width="2.2"/></svg>';

function createLangSwitcher() {
  injectLangSwitcherCSS();
  const wrap = document.createElement('div');
  wrap.id = 'fp-lang-switch';
  const current = getLang();

  const frBtn = document.createElement('button');
  frBtn.innerHTML = FLAG_FR;
  frBtn.title = 'Français';
  frBtn.className = current === 'fr' ? 'active' : '';
  frBtn.onclick = () => { setLang('fr'); };

  const enBtn = document.createElement('button');
  enBtn.innerHTML = FLAG_GB;
  enBtn.title = 'English';
  enBtn.className = current === 'en' ? 'active' : '';
  enBtn.onclick = () => { setLang('en'); };

  wrap.appendChild(frBtn);
  wrap.appendChild(enBtn);
  return wrap;
}

// ── Application automatique aux éléments marqués [data-i18n] ────────────
// Permet de traduire le HTML statique sans toucher à chaque ligne de JS.
function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key, el.textContent);
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key, el.getAttribute('placeholder') || ''));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', t(key, el.getAttribute('title') || ''));
  });
}

export { t, getLang, setLang, createLangSwitcher, applyI18n, I18N };
