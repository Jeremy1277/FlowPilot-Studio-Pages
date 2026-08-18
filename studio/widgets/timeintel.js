/**
 * FlowPilot Studio — Time intelligence (timeintel.js)
 *
 * POURQUOI CE FICHIER
 * Un reporting de gestion mensuel ne se lit pas sans trois choses : la même
 * période l'an dernier, le cumul depuis le 1er janvier, et un lissage qui
 * enlève le bruit des mois courts. Le Studio savait agréger par période
 * (`groupByTime`) mais pas comparer ni cumuler. C'est ce que fait ce module.
 *
 * PÉRIMÈTRE
 * Moteur PUR : aucune dépendance, aucun accès au DOM ni aux globales de l'app,
 * aucune mutation des entrées, aucun `eval`. Il travaille sur des séries DÉJÀ
 * AGRÉGÉES (le résultat de `groupByTime`), jamais sur les lignes brutes.
 *
 * MODÈLE
 *   Point  = { key, start, value }   key = clé canonique, start = Date locale
 *                                    au premier instant de la période,
 *                                    value = nombre ou null
 *                                    (+ `filled` : période absente des données,
 *                                    comblée ; `label` si opts.labels)
 *   Series = tableau de Points, trié, sans doublon, sans trou (fillGaps).
 *
 * CLÉS CANONIQUES
 *   day '2026-03-17' · week '2026-W12' · month '2026-03' · quarter '2026-Q1'
 *   year '2026'      (la semaine est ISO 8601 : lundi → dimanche, semaine 1 =
 *   celle du premier jeudi ; certaines années ont 53 semaines).
 *
 * RÈGLE DES FUSEAUX (la source n°1 de bugs de dates)
 * Tout se calcule en heure LOCALE avec le constructeur `new Date(y, m, d)`, qui
 * normalise les débordements (`new Date(2026, 0, 32)` = 1er février) sans jamais
 * passer par des millisecondes. On n'utilise JAMAIS `toISOString()` sur une date
 * locale (il décale d'un jour à l'est de Greenwich) et JAMAIS `+ 30*86400000`
 * pour ajouter un mois (faux les jours de changement d'heure). Seule exception,
 * documentée et sûre : `daysBetween()` compare deux `Date.UTC(y, m, d)`
 * reconstruits à partir des composantes locales — l'UTC n'a pas d'heure d'été,
 * l'écart y est donc toujours un multiple exact de 86 400 000 ms.
 *
 * DÉCISIONS DE CONCEPTION EXPLICITES
 * - 29 février : le comparatif N-1 d'un 29/02 est le 28/02 de l'année
 *   précédente (repli sur le dernier jour existant du mois). Conséquence
 *   assumée : sur une année bissextile, le 28 et le 29 février se comparent
 *   tous deux au 28/02 N-1. L'alternative (renvoyer null) creusait un trou dans
 *   la courbe de comparaison un jour sur 1461, ce qui se lit comme une panne.
 * - Semaine 53 : si la semaine demandée n'existe pas l'année précédente
 *   (S53 → une année N-1 de 52 semaines), le comparatif vaut `null`. On ne
 *   replie PAS sur S1 ni sur S52 : ce serait comparer janvier à décembre.
 * - Comparatif journalier : même date calendaire (17/03/2026 → 17/03/2025), pas
 *   « 52 semaines en arrière ». Le jour de la semaine n'est donc pas conservé ;
 *   c'est la convention comptable, pas la convention retail.
 * - `pct` est exprimé en POINTS DE POURCENTAGE (12.5 = +12,5 %), comme le reste
 *   de l'app, et vaut `null` — jamais Infinity — quand la base est 0 ou absente.
 *
 * BRANCHEMENT (à faire dans index.html, hors de ce fichier)
 *   import { computeTimeIntel, TIME_COMPARE_MODES, TIME_CUMUL_MODES }
 *     from './widgets/timeintel.js';
 *   window.FP_computeTimeIntel   = computeTimeIntel;
 *   window.FP_TIME_COMPARE_MODES = TIME_COMPARE_MODES;
 *   window.FP_TIME_CUMUL_MODES   = TIME_CUMUL_MODES;
 *
 * Convention du dépôt : commentaires en français, identifiants en anglais.
 */

/* ════════════════════════════════════════════════════════════════════════
   GARDE-FOUS
   ════════════════════════════════════════════════════════════════════════ */

// Une série de 10 000 points se traite en quelques millisecondes ; au-delà de
// ces plafonds on tronque proprement plutôt que de figer l'onglet.
const MAX_INPUT_POINTS = 500000; // points d'entrée examinés
const MAX_SERIES_LENGTH = 200000; // points produits, comblement des trous inclus

/* ════════════════════════════════════════════════════════════════════════
   GRANULARITÉS
   ════════════════════════════════════════════════════════════════════════ */

export const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'];

// Alias tolérés : l'app parle parfois français ('mois'), parfois abrégé ('M').
const GRAIN_ALIASES = {
  day: 'day', days: 'day', daily: 'day', d: 'day', jour: 'day', jours: 'day', journalier: 'day',
  week: 'week', weeks: 'week', weekly: 'week', w: 'week', s: 'week',
  semaine: 'week', semaines: 'week', hebdo: 'week', hebdomadaire: 'week',
  month: 'month', months: 'month', monthly: 'month', m: 'month',
  mois: 'month', mensuel: 'month',
  quarter: 'quarter', quarters: 'quarter', quarterly: 'quarter', q: 'quarter', t: 'quarter',
  trimestre: 'quarter', trimestres: 'quarter', trimestriel: 'quarter',
  year: 'year', years: 'year', yearly: 'year', annual: 'year', y: 'year', a: 'year',
  an: 'year', annee: 'year', annees: 'year', annuel: 'year',
};

// « Année » → « annee » : les alias sont comparés sans accent ni casse.
function normalizeWord(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Renvoie une granularité canonique, ou null si le grain est inconnu.
// Chemin rapide d'abord : `normalize('NFD')` coûte cher et cette fonction est
// appelée une fois par point sur des séries de 10 000 points.
function normGrain(grain) {
  if (typeof grain !== 'string') return null;
  if (grain === 'day' || grain === 'week' || grain === 'month'
    || grain === 'quarter' || grain === 'year') return grain;
  const key = normalizeWord(grain);
  return Object.prototype.hasOwnProperty.call(GRAIN_ALIASES, key) ? GRAIN_ALIASES[key] : null;
}

/* ════════════════════════════════════════════════════════════════════════
   PRIMITIVES DE DATE (100 % heure locale, zéro arithmétique en millisecondes)
   ════════════════════════════════════════════════════════════════════════ */

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Reconnaît un nom de mois écrit en toutes lettres ou abrégé, français ou
 * anglais ('mars', 'Mar', 'Fév', 'Aoû', 'March') → index 0-11, sinon -1.
 * Sert à relire les libellés déjà produits par l'app.
 */
function parseMonthName(token) {
  const t = normalizeWord(token).slice(0, 3);
  if (t.length < 3) return -1;
  for (let i = 0; i < 12; i++) {
    if (normalizeWord(MONTHS_FR[i]).slice(0, 3) === t) return i;
  }
  for (let i = 0; i < 12; i++) {
    if (MONTHS_EN_SHORT[i].toLowerCase() === t) return i;
  }
  return -1;
}

// Jours cumulés au 1er de chaque mois, année non bissextile.
const CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function pad4(n) {
  const s = String(Math.abs(n));
  const p = s.length >= 4 ? s : '0'.repeat(4 - s.length) + s;
  return n < 0 ? '-' + p : p;
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function daysInMonth(y, m) {
  return m === 1 && isLeapYear(y) ? 29 : MONTH_LENGTHS[m];
}

// Quantième (1 = 1er janvier), sans construire de Date : appelé une fois par
// point sur les séries hebdomadaires.
function dayOfYear(y, m, d) {
  return CUMULATIVE_DAYS[m] + d + (m > 1 && isLeapYear(y) ? 1 : 0);
}

/**
 * Convertit une entrée quelconque en Date locale, ou null.
 * Accepte : Date, chaîne ISO / française, timestamp en millisecondes.
 * Refuse le reste (dont les numéros de série Excel, ambigus ici : c'est le
 * travail de `parseDateValue` en amont, pas celui d'un moteur de périodes).
 */
function toDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    // Un timestamp plausible seulement (≥ ~1973 ou ≤ ~1967 en valeur absolue).
    if (!Number.isFinite(v) || Math.abs(v) < 1e8) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  // AAAA-MM-JJ [HH:MM[:SS]] — construit en local, jamais via Date.parse (qui
  // interprète « 2026-03-17 » comme de l'UTC et décale d'un jour à l'ouest).
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const y = +m[1], mo = +m[2] - 1, da = +m[3];
    if (mo < 0 || mo > 11 || da < 1 || da > 31) return null;
    const d = new Date(y, mo, da, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da ? d : null;
  }
  // JJ/MM/AAAA [HH:MM[:SS]]
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const y = String(m[3]).length === 2 ? 2000 + (+m[3]) : +m[3];
    const mo = +m[2] - 1, da = +m[1];
    if (mo < 0 || mo > 11 || da < 1 || da > 31) return null;
    const d = new Date(y, mo, da, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da ? d : null;
  }
  return null;
}

// Minuit local du jour de `d`. Dans les rares fuseaux où minuit n'existe pas
// (changement d'heure à 00:00), le moteur JS renvoie 01:00 le MÊME jour : la
// clé de période reste juste.
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Ajoute n jours calendaires. Le débordement (32 janvier) est normalisé par le
// constructeur ; aucune heure n'est manipulée, donc aucun décalage d'été.
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Écart en jours calendaires entiers entre deux dates locales.
 * On repasse par Date.UTC des seules composantes locales (y, m, d) : l'UTC
 * ignore l'heure d'été, la différence est donc un multiple exact de 86 400 s.
 */
function daysBetween(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/* ── Semaine ISO 8601 ─────────────────────────────────────────────────── */

/**
 * Décompose une date en semaine ISO : { year, week, start }.
 * `year` est l'année ISO (celle du jeudi de la semaine), qui peut différer de
 * l'année civile aux bornes : le 1er janvier 2027 appartient à S53 de 2026.
 */
function isoWeekParts(date) {
  const dow = (date.getDay() + 6) % 7;        // 0 = lundi … 6 = dimanche
  const monday = addDays(startOfDay(date), -dow);
  const thursday = addDays(monday, 3);        // le jeudi porte l'année ISO
  const year = thursday.getFullYear();
  // Le premier jeudi de l'année civile tombe forcément entre le 1er et le 7 :
  // son quantième - 1 divisé par 7 donne donc directement l'indice de semaine.
  const week = Math.floor((dayOfYear(year, thursday.getMonth(), thursday.getDate()) - 1) / 7) + 1;
  return { year, week, start: monday };
}

// Nombre de semaines ISO d'une année : le 28 décembre appartient toujours à la
// dernière semaine ISO de son année civile (propriété de la norme).
// Mémoïsé : une série hebdomadaire interroge la même poignée d'années.
const WEEKS_IN_YEAR = new Map();
function isoWeeksInYear(y) {
  let n = WEEKS_IN_YEAR.get(y);
  if (n === undefined) {
    if (WEEKS_IN_YEAR.size > 500) WEEKS_IN_YEAR.clear(); // cache borné
    n = isoWeekParts(new Date(y, 11, 28)).week;
    WEEKS_IN_YEAR.set(y, n);
  }
  return n;
}

// Lundi de la semaine ISO (y, w). Renvoie null si la semaine n'existe pas.
function isoWeekStart(y, w) {
  if (!Number.isFinite(y) || !Number.isFinite(w) || w < 1) return null;
  if (w > isoWeeksInYear(y)) return null;
  // Le 4 janvier est toujours en semaine 1 (norme ISO).
  const week1Monday = isoWeekParts(new Date(y, 0, 4)).start;
  return addDays(week1Monday, (w - 1) * 7);
}

/* ════════════════════════════════════════════════════════════════════════
   PÉRIODES : début, fin, clé, libellé, décalage
   ════════════════════════════════════════════════════════════════════════ */

// Version interne : `d` est une Date valide et `g` un grain déjà canonique.
// Les boucles chaudes appellent celle-ci, la version exportée valide d'abord.
function rawStart(d, g) {
  switch (g) {
    case 'day': return startOfDay(d);
    case 'week': return isoWeekParts(d).start;
    case 'month': return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'quarter': return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    case 'year': return new Date(d.getFullYear(), 0, 1);
    default: return null;
  }
}

// Idem pour la clé : aucune validation, aucun `normalize()`.
function rawKey(d, g) {
  switch (g) {
    case 'day':
      return pad4(d.getFullYear()) + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    case 'week': {
      const p = isoWeekParts(d);
      return pad4(p.year) + '-W' + pad2(p.week);
    }
    case 'month':
      return pad4(d.getFullYear()) + '-' + pad2(d.getMonth() + 1);
    case 'quarter':
      return pad4(d.getFullYear()) + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
    case 'year':
      return pad4(d.getFullYear());
    default: return null;
  }
}

/**
 * Premier instant (minuit local) de la période contenant `date`.
 * @returns {Date|null}
 */
export function periodStart(date, grain) {
  const g = normGrain(grain);
  const d = toDate(date);
  if (!g || !d) return null;
  return rawStart(d, g);
}

/**
 * Premier instant de la période SUIVANTE (borne de fin exclusive).
 * Sert à savoir si une période est terminée.
 * @returns {Date|null}
 */
export function periodEnd(date, grain) {
  const g = normGrain(grain);
  const s = periodStart(date, g);
  if (!s) return null;
  switch (g) {
    case 'day': return addDays(s, 1);
    case 'week': return addDays(s, 7);
    case 'month': return new Date(s.getFullYear(), s.getMonth() + 1, 1);
    case 'quarter': return new Date(s.getFullYear(), s.getMonth() + 3, 1);
    case 'year': return new Date(s.getFullYear() + 1, 0, 1);
    default: return null;
  }
}

/**
 * Clé canonique de la période contenant `date`.
 * '2026-03-17' | '2026-W12' | '2026-03' | '2026-Q1' | '2026'
 * @returns {string|null}
 */
export function periodKey(date, grain) {
  const g = normGrain(grain);
  const d = toDate(date);
  if (!g || !d) return null;
  return rawKey(d, g);
}

/**
 * Inverse exact de `periodKey` : la clé redonne le début de période.
 * Tolère aussi les formats historiques du Studio ('2026-S12', 'T1 2026',
 * 'Mar 2026', '03/2026').
 * Renvoie null si la clé est invalide ou décrit une période inexistante
 * (30 février, semaine 53 d'une année qui n'en compte que 52).
 * @returns {Date|null}
 */
export function keyToStart(key, grain) {
  const g = normGrain(grain);
  if (!g || typeof key !== 'string') return null;
  const s = key.trim();
  if (!s) return null;
  let m;
  switch (g) {
    case 'day': {
      m = s.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
      if (!m) return null;
      const y = +m[1], mo = +m[2] - 1, da = +m[3];
      if (mo < 0 || mo > 11 || da < 1 || da > 31) return null;
      const d = new Date(y, mo, da);
      // Contrôle de cohérence : « 2026-02-30 » déborderait sur mars.
      return (d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da) ? d : null;
    }
    case 'week': {
      // Canonique '2026-W12' ; tolérance sur 'S' (format hérité) et 'S12 2026'.
      m = s.match(/^(\d{1,4})-?[WS](\d{1,2})$/i) || s.match(/^[WS](\d{1,2})[ -](\d{4})$/i);
      if (!m) return null;
      const y = m[2] !== undefined && m[2].length === 4 ? +m[2] : +m[1];
      const w = m[2] !== undefined && m[2].length === 4 ? +m[1] : +m[2];
      return isoWeekStart(y, w);
    }
    case 'month': {
      // Canonique '2026-03' ; tolérances : '03/2026' et 'mars 2026' / 'Mar 2026'
      // (c'est le libellé que sort déjà `groupByTime`).
      m = s.match(/^(\d{1,4})-(\d{1,2})$/);
      if (m) {
        const mo = +m[2] - 1;
        return mo >= 0 && mo <= 11 ? new Date(+m[1], mo, 1) : null;
      }
      m = s.match(/^(\d{1,2})[/.](\d{4})$/);
      if (m) {
        const mo = +m[1] - 1;
        return mo >= 0 && mo <= 11 ? new Date(+m[2], mo, 1) : null;
      }
      m = s.match(/^([A-Za-z\u00c0-\u024f]+)\.?[ \u00a0-]+(\d{4})$/);
      if (m) {
        const mo = parseMonthName(m[1]);
        return mo >= 0 ? new Date(+m[2], mo, 1) : null;
      }
      return null;
    }
    case 'quarter': {
      // Canonique '2026-Q1' ; tolérance sur 'T' et sur l'ordre 'T1 2026'.
      m = s.match(/^(\d{1,4})-?[QT]([1-4])$/i) || s.match(/^[QT]([1-4])[ -](\d{4})$/i);
      if (!m) return null;
      const y = m[2].length === 4 ? +m[2] : +m[1];
      const q = m[2].length === 4 ? +m[1] : +m[2];
      if (q < 1 || q > 4) return null;
      return new Date(y, (q - 1) * 3, 1);
    }
    case 'year': {
      m = s.match(/^(\d{1,4})$/);
      return m ? new Date(+m[1], 0, 1) : null;
    }
    default: return null;
  }
}

/**
 * Libellé lisible d'une clé de période.
 * fr : '17 mars 2026' · 'S12 2026' · 'mars 2026' · 'T1 2026' · '2026'
 * en : 'Mar 17, 2026' · 'W12 2026' · 'March 2026' · 'Q1 2026' · '2026'
 * @returns {string} chaîne vide si la clé est illisible (jamais d'exception)
 */
export function periodLabel(key, grain, lang) {
  const g = normGrain(grain);
  const d = keyToStart(key, g);
  if (!g || !d) return typeof key === 'string' ? key : '';
  const fr = normalizeWord(lang || 'fr') !== 'en';
  switch (g) {
    case 'day':
      return fr
        ? d.getDate() + ' ' + MONTHS_FR[d.getMonth()] + ' ' + d.getFullYear()
        : MONTHS_EN_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    case 'week': {
      const p = isoWeekParts(d);
      return (fr ? 'S' : 'W') + p.week + ' ' + p.year;
    }
    case 'month':
      return (fr ? MONTHS_FR[d.getMonth()] : MONTHS_EN[d.getMonth()]) + ' ' + d.getFullYear();
    case 'quarter':
      return (fr ? 'T' : 'Q') + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
    case 'year':
      return String(d.getFullYear());
    default: return '';
  }
}

/**
 * Décale une clé de n périodes (n négatif = vers le passé).
 * Les bornes d'année sont gérées par le calendrier, pas par un compteur :
 * '2026-01' -1 → '2025-12', '2026-W01' -1 → '2025-W52'.
 * @returns {string|null}
 */
export function shiftKey(key, grain, n) {
  const g = normGrain(grain);
  const start = keyToStart(key, g);
  if (!g || !start) return null;
  const step = Number(n);
  if (!Number.isFinite(step)) return null;
  const k = Math.trunc(step);
  let target;
  switch (g) {
    case 'day': target = addDays(start, k); break;
    case 'week': target = addDays(start, k * 7); break;
    case 'month': target = new Date(start.getFullYear(), start.getMonth() + k, 1); break;
    case 'quarter': target = new Date(start.getFullYear(), start.getMonth() + k * 3, 1); break;
    case 'year': target = new Date(start.getFullYear() + k, 0, 1); break;
    default: return null;
  }
  return periodKey(target, g);
}

/**
 * Clé de la MÊME période l'année précédente (comparatif N-1 « métier »).
 * - mois/trimestre/année : même rang, année - 1 (mars 2026 → mars 2025).
 * - semaine ISO : même numéro, année ISO - 1 ; null si la semaine n'existe pas
 *   l'an dernier (S53 → année N-1 de 52 semaines).
 * - jour : même date calendaire ; le 29/02 se replie sur le 28/02.
 * @returns {string|null}
 */
export function previousYearKey(key, grain) {
  const g = normGrain(grain);
  const start = keyToStart(key, g);
  if (!g || !start) return null;
  return refKeyFromStart(start, g, 'yoy');
}

/**
 * Cœur des comparatifs, à partir du DÉBUT de période (pas de la clé) : on évite
 * ainsi de re-parser une chaîne pour chaque point d'une série de 10 000 points.
 * mode 'yoy' = même période N-1 · mode 'prev' = période précédente.
 */
function refKeyFromStart(start, g, mode) {
  if (!isValidDate(start)) return null;
  const y = start.getFullYear();
  const mo = start.getMonth();
  if (mode === 'yoy') {
    switch (g) {
      case 'day': {
        // Repli sur le dernier jour du mois : seul cas concret, le 29 février.
        // La date visée est valide par construction : on écrit la clé
        // directement, sans fabriquer d'objet Date (chemin chaud).
        const da = Math.min(start.getDate(), daysInMonth(y - 1, mo));
        return pad4(y - 1) + '-' + pad2(mo + 1) + '-' + pad2(da);
      }
      case 'week': {
        const p = isoWeekParts(start);
        const py = p.year - 1;
        if (p.week > isoWeeksInYear(py)) return null; // S53 sans équivalent
        return pad4(py) + '-W' + pad2(p.week);
      }
      case 'month': return pad4(y - 1) + '-' + pad2(mo + 1);
      case 'quarter': return pad4(y - 1) + '-Q' + (Math.floor(mo / 3) + 1);
      case 'year': return pad4(y - 1);
      default: return null;
    }
  }
  switch (g) {
    case 'day': {
      const da = start.getDate();
      if (da > 1) return pad4(y) + '-' + pad2(mo + 1) + '-' + pad2(da - 1);
      const py = mo === 0 ? y - 1 : y;
      const pm = mo === 0 ? 11 : mo - 1;
      return pad4(py) + '-' + pad2(pm + 1) + '-' + pad2(daysInMonth(py, pm));
    }
    case 'week': return rawKey(addDays(start, -7), 'week');
    case 'month': return rawKey(new Date(y, mo - 1, 1), 'month');
    case 'quarter': return rawKey(new Date(y, mo - 3, 1), 'quarter');
    case 'year': return pad4(y - 1);
    default: return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   VALEURS
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Coercition douce vers un nombre : accepte « 1 234,56 », « 1,234.56 »,
 * « 12 € », « 8% ». Tout le reste (texte, null, NaN, Infinity) donne null.
 */
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s) return null;
  s = s.replace(/[\s\u00a0\u202f\u2009]/g, '').replace(/[€$£%]/g, '');
  const hasComma = s.indexOf(',') >= 0;
  const hasDot = s.indexOf('.') >= 0;
  if (hasComma && hasDot) {
    // Le séparateur décimal est le dernier des deux ; l'autre est un millier.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ════════════════════════════════════════════════════════════════════════
   CONSTRUCTION DE SÉRIE
   ════════════════════════════════════════════════════════════════════════ */

// Tous les points d'une série partagent EXACTEMENT la même forme (mêmes
// propriétés, même ordre) : les moteurs JS peuvent alors les traiter avec une
// seule classe interne, ce qui double la vitesse des boucles qui suivent.
// `filled` marque une période absente des données, comblée par le moteur.
function makePoint(key, start, value, filled, label) {
  return { key, start, value, filled, label };
}

/**
 * Rang absolu d'une période : deux périodes consécutives diffèrent de 1.
 * Ne sert qu'à DÉTECTER les trous par soustraction — aucune date n'en sort,
 * donc aucun risque de dérive de fuseau (`Date.UTC` sur des composantes locales
 * est un simple encodage entier, pas une conversion d'heure).
 */
function periodIndex(start, g) {
  const y = start.getFullYear();
  const m = start.getMonth();
  switch (g) {
    case 'day': return Math.round(Date.UTC(y, m, start.getDate()) / 86400000);
    // Les débuts de semaine sont tous des lundis : leur rang de jour varie de 7
    // en 7, la division entière donne donc bien des rangs consécutifs.
    case 'week': return Math.floor(Math.round(Date.UTC(y, m, start.getDate()) / 86400000) / 7);
    case 'month': return y * 12 + m;
    case 'quarter': return y * 4 + Math.floor(m / 3);
    case 'year': return y;
    default: return 0;
  }
}

// Début de la période suivante, à partir d'un début de période (chemin chaud du
// comblement de trous : pas de re-normalisation inutile).
function nextStart(start, grain) {
  switch (grain) {
    case 'day': return addDays(start, 1);
    case 'week': return addDays(start, 7);
    case 'month': return new Date(start.getFullYear(), start.getMonth() + 1, 1);
    case 'quarter': return new Date(start.getFullYear(), start.getMonth() + 3, 1);
    case 'year': return new Date(start.getFullYear() + 1, 0, 1);
    default: return null;
  }
}

/**
 * Construit une série propre à partir de points bruts déjà agrégés.
 *
 * Chaque point d'entrée peut fournir sa date sous n'importe quelle forme :
 * `start` / `date` / `x` (Date, chaîne, timestamp) ou `key` (clé de période, y
 * compris aux formats hérités). La valeur est lue dans `value` / `y` / `v`, ou
 * dans l'index 1 si le point est un tuple `[cle, valeur]`.
 *
 * @param {Array} points
 * @param {string} grain
 * @param {Object} [opts]
 * @param {boolean} [opts.fillGaps=true]   comble les périodes absentes
 * @param {number|null} [opts.gapValue=0]  valeur des périodes comblées
 * @param {string} [opts.duplicates='sum'] 'sum' | 'first' | 'last'
 * @param {boolean} [opts.labels=false]    ajoute un `label` à chaque point
 * @param {string} [opts.lang='fr']
 * @returns {Array} série triée, dédoublonnée, sans trou (jamais null)
 */
export function buildSeries(points, grain, opts) {
  const o = opts || {};
  const g = normGrain(grain);
  if (!g || !points || typeof points.length !== 'number') return [];

  const fillGaps = o.fillGaps !== false;
  const gapValue = o.gapValue === undefined ? 0 : (o.gapValue === null ? null : toNumber(o.gapValue));
  const dupMode = o.duplicates === 'first' || o.duplicates === 'last' ? o.duplicates : 'sum';
  const withLabels = o.labels === true;
  const lang = o.lang || 'fr';

  const n = Math.min(points.length, MAX_INPUT_POINTS);
  const items = [];   // { key, start, value, idx } dans l'ordre d'arrivée
  let ordered = true; // l'entrée est-elle déjà triée et sans doublon ?
  let lastIdx = null;

  for (let i = 0; i < n; i++) {
    const raw = points[i];
    if (raw === null || raw === undefined) continue;

    let start = null;
    let value;

    if (Array.isArray(raw)) {
      // Tuple [clé|date, valeur] — c'est la forme que sort `groupByTime`.
      const d0 = toDate(raw[0]);
      start = d0 ? rawStart(d0, g) : keyToStart(raw[0], g);
      value = raw[1];
    } else if (typeof raw === 'object') {
      const dateLike = raw.start !== undefined ? raw.start
        : raw.date !== undefined ? raw.date
          : raw.x !== undefined ? raw.x : undefined;
      if (dateLike !== undefined) {
        const d0 = toDate(dateLike);
        if (d0) start = rawStart(d0, g);
      }
      if (!start && raw.key !== undefined) start = keyToStart(raw.key, g);
      if (!start && typeof raw.label === 'string') start = keyToStart(raw.label, g);
      value = raw.value !== undefined ? raw.value
        : raw.y !== undefined ? raw.y
          : raw.v !== undefined ? raw.v : null;
    } else {
      // Valeur nue : on ne sait pas la dater, on l'ignore.
      continue;
    }

    if (!start) continue; // date invalide → point écarté, sans exception
    const key = rawKey(start, g);
    if (!key) continue;
    const idx = periodIndex(start, g);
    if (lastIdx !== null && idx <= lastIdx) ordered = false; // désordre ou doublon
    lastIdx = idx;
    items.push({ key, start, value: toNumber(value), idx });
  }

  if (items.length === 0) return [];

  // Chemin rapide : `groupByTime` sort déjà des périodes triées et uniques —
  // dans ce cas ni table de hachage ni tri, on garde le tableau tel quel.
  let entries = items;
  if (!ordered) {
    const byKey = new Map();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const prev = byKey.get(it.key);
      if (!prev) {
        byKey.set(it.key, it);
      } else if (dupMode === 'last') {
        prev.value = it.value;
      } else if (dupMode === 'sum') {
        if (it.value !== null) prev.value = prev.value === null ? it.value : prev.value + it.value;
      } // 'first' : on ne touche à rien
    }
    entries = Array.from(byKey.values());
    // Tri sur le rang de période : un simple entier, pas de calcul de date.
    entries.sort((a, b) => a.idx - b.idx);
  }

  const out = [];
  if (!fillGaps) {
    for (let i = 0; i < entries.length && out.length < MAX_SERIES_LENGTH; i++) {
      const it = entries[i];
      out.push(makePoint(it.key, it.start, it.value, false,
        withLabels ? periodLabel(it.key, g, lang) : undefined));
    }
    return out;
  }

  // Comblement : une période sans donnée DOIT exister, sinon la courbe ment et
  // le cumul saute une marche. On ne fabrique de nouvelles dates QUE pour les
  // trous réels : le cas dense (aucun trou) ne coûte rien, le rang de période
  // détectant l'écart par simple soustraction.
  let prevIdx = null;
  for (let i = 0; i < entries.length && out.length < MAX_SERIES_LENGTH; i++) {
    const it = entries[i];
    if (prevIdx !== null && it.idx > prevIdx + 1) {
      // Trou : on avance période par période jusqu'au point suivant.
      let cursor = nextStart(out[out.length - 1].start, g);
      let guard = it.idx - prevIdx - 1;
      while (cursor && guard-- > 0 && out.length < MAX_SERIES_LENGTH) {
        const gapKey = rawKey(cursor, g);
        out.push(makePoint(gapKey, cursor, gapValue, true,
          withLabels ? periodLabel(gapKey, g, lang) : undefined));
        cursor = nextStart(cursor, g);
      }
    }
    out.push(makePoint(it.key, it.start, it.value, false,
      withLabels ? periodLabel(it.key, g, lang) : undefined));
    prevIdx = it.idx;
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
   ALIGNEMENT DES COMPARATIFS
   ════════════════════════════════════════════════════════════════════════ */

export const TIME_COMPARE_MODES = [
  { id: 'none', label: 'Aucune comparaison', desc: 'Afficher uniquement la période en cours.' },
  { id: 'prev', label: 'Période précédente', desc: 'Chaque point est comparé à celui d\'avant (mars vs février).' },
  { id: 'yoy', label: 'Même période l\'an dernier', desc: 'Chaque point est comparé au même mois, à la même semaine ou au même jour de l\'année précédente.' },
];

export const TIME_CUMUL_MODES = [
  { id: 'none', label: 'Pas de cumul', desc: 'Valeur de chaque période, telle quelle.' },
  { id: 'ytd', label: 'Cumul depuis le 1er janvier', desc: 'Total accumulé depuis le début de l\'année, remis à zéro chaque 1er janvier.' },
  { id: 'qtd', label: 'Cumul depuis le début du trimestre', desc: 'Total accumulé depuis le 1er jour du trimestre.' },
  { id: 'mtd', label: 'Cumul depuis le début du mois', desc: 'Total accumulé depuis le 1er jour du mois.' },
  { id: 'running', label: 'Cumul total', desc: 'Total accumulé depuis le tout premier point, sans remise à zéro.' },
];

/**
 * Série de comparaison ALIGNÉE sur `series` : mêmes clés, même longueur, même
 * ordre — c'est ce qui permet à Chart.js de superposer deux jeux de données
 * sans décalage. Une valeur introuvable vaut null (trou dans la courbe), jamais
 * un « décalage de 12 index » qui casse dès qu'un mois manque.
 *
 * @param {Array} series série de base
 * @param {string} grain
 * @param {string} [mode='prev'] 'prev' (période précédente) | 'yoy' (N-1)
 * @returns {Array} série alignée (vide si entrée invalide)
 */
export function alignPrevious(series, grain, mode) {
  const g = normGrain(grain);
  if (!g || !Array.isArray(series) || series.length === 0) return [];
  const m = mode === 'yoy' ? 'yoy' : 'prev';

  // Index clé → valeur : la recherche du comparatif est un accès O(1).
  const index = new Map();
  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    if (p && typeof p.key === 'string') index.set(p.key, p.value === undefined ? null : p.value);
  }

  const out = new Array(series.length);
  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    const key = p && typeof p.key === 'string' ? p.key : null;
    // On repart du `start` déjà connu du point : pas de re-parsing de la clé.
    const start = p && isValidDate(p.start) ? p.start : (key ? keyToStart(key, g) : null);
    const from = start ? refKeyFromStart(start, g, m) : null;
    const value = from !== null && index.has(from) ? index.get(from) : null;
    out[i] = {
      key: key,
      start: start,
      value: value === undefined ? null : value,
      fromKey: from, // clé réellement lue : indispensable dans les info-bulles
    };
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
   CUMULS
   ════════════════════════════════════════════════════════════════════════ */

// Identifiant de la « tranche » de cumul : dès qu'il change, on repart de zéro.
function cumulAnchor(start, mode) {
  if (!isValidDate(start)) return null;
  const y = start.getFullYear();
  switch (mode) {
    case 'ytd': return y;
    case 'qtd': return y * 10 + Math.floor(start.getMonth() / 3);
    case 'mtd': return y * 100 + start.getMonth();
    default: return 0; // 'running' : une seule tranche
  }
}

/**
 * Cumul aligné sur `series`.
 * - 'running' : cumul total, sans remise à zéro
 * - 'ytd' / 'qtd' / 'mtd' : remise à zéro au 1er janvier / 1er jour du
 *   trimestre / 1er du mois. La remise à zéro est déduite de la DATE du point,
 *   pas de sa position : une série qui commence en mars cumule bien « depuis le
 *   1er janvier » (les mois absents valent 0), et repart à zéro au 1er janvier
 *   suivant.
 * Un point sans valeur reporte le cumul en cours (la courbe ne retombe pas à
 * zéro) ; tant qu'aucune valeur n'a été vue dans la tranche, il vaut null.
 *
 * @returns {Array} série alignée (vide si entrée invalide)
 */
export function cumulate(series, grain, mode) {
  if (!Array.isArray(series) || series.length === 0) return [];
  const m = mode === 'ytd' || mode === 'qtd' || mode === 'mtd' ? mode : 'running';

  const out = new Array(series.length);
  let anchor = null;
  let sum = 0;
  let seen = false;

  for (let i = 0; i < series.length; i++) {
    const p = series[i] || {};
    const start = isValidDate(p.start) ? p.start : keyToStart(p.key, grain);
    const a = cumulAnchor(start, m);
    if (a === null || a !== anchor) {
      anchor = a;
      sum = 0;
      seen = false;
    }
    const v = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null;
    if (v !== null) { sum += v; seen = true; }
    out[i] = { key: p.key, start: start || null, value: seen ? sum : null };
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
   MOYENNE MOBILE
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Moyenne mobile alignée sur `series`.
 * Par défaut TRAÎNANTE (`center: false`) : la moyenne d'un mois porte sur ce
 * mois et les précédents — c'est la convention de gestion, la seule qui
 * n'utilise pas d'information future. `center: true` centre la fenêtre (lissage
 * de forme, à ne pas utiliser pour piloter).
 *
 * @param {Array} series
 * @param {number} window taille de la fenêtre en périodes (≥ 1)
 * @param {Object} [opts]
 * @param {boolean} [opts.center=false]
 * @param {number} [opts.minPeriods=1] valeurs non nulles requises, sinon null
 * @returns {Array} série alignée (vide si entrée invalide)
 */
export function movingAverage(series, window, opts) {
  if (!Array.isArray(series) || series.length === 0) return [];
  const o = opts || {};
  let w = Math.trunc(Number(window));
  if (!Number.isFinite(w) || w < 1) w = 1;
  if (w > series.length) w = series.length;
  const center = o.center === true;
  let minPeriods = Math.trunc(Number(o.minPeriods));
  if (!Number.isFinite(minPeriods) || minPeriods < 1) minPeriods = 1;
  if (minPeriods > w) minPeriods = w;

  const before = center ? Math.floor((w - 1) / 2) : w - 1;
  const after = w - 1 - before;
  const n = series.length;

  // Somme glissante : chaque point entre et sort une seule fois → O(n).
  const val = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = series[i] && series[i].value;
    val[i] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  let sum = 0;
  let count = 0;
  const enter = (j) => { if (j >= 0 && j < n && val[j] !== null) { sum += val[j]; count++; } };
  const leave = (j) => { if (j >= 0 && j < n && val[j] !== null) { sum -= val[j]; count--; } };

  // Fenêtre initiale du point 0 : [0 .. after] (les indices négatifs n'existent pas).
  for (let j = 0; j <= after && j < n; j++) enter(j);

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      enter(i + after);
      leave(i - before - 1);
    }
    const p = series[i] || {};
    out[i] = {
      key: p.key,
      start: isValidDate(p.start) ? p.start : null,
      value: count >= minPeriods ? sum / count : null,
    };
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
   VARIATIONS
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Écart entre une valeur et sa référence.
 * @returns {{abs:number|null, pct:number|null, direction:'up'|'down'|'flat'}}
 *  - `pct` en points de pourcentage (12.5 = +12,5 %).
 *  - `pct` vaut null si la référence est 0, null ou absente : « +∞ % » n'est
 *    pas une information, c'est un bug affiché à l'utilisateur.
 */
export function variation(current, previous) {
  const c = toNumber(current);
  const p = toNumber(previous);
  if (c === null || p === null) {
    return { abs: null, pct: null, direction: 'flat' };
  }
  const abs = c - p;
  const pct = p === 0 ? null : (abs / Math.abs(p)) * 100;
  const direction = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  return { abs, pct, direction };
}

/* ════════════════════════════════════════════════════════════════════════
   SYNTHÈSE
   ════════════════════════════════════════════════════════════════════════ */

function emptySummary(grain) {
  return {
    grain: grain || null,
    count: 0,
    filledCount: 0,
    firstKey: null,
    lastKey: null,
    last: null,
    previous: null,
    lastYear: null,
    vsPrevious: { abs: null, pct: null, direction: 'flat' },
    vsLastYear: { abs: null, pct: null, direction: 'flat' },
    total: null,
    average: null,
    min: null,
    max: null,
    ytd: null,
    ytdLastYear: null,
    vsYtdLastYear: { abs: null, pct: null, direction: 'flat' },
    lastPeriodPartial: false,
    lastPeriodProgress: null,
  };
}

/**
 * Chiffres clés d'une série, prêts pour un bandeau de KPI.
 *
 * `lastPeriodPartial` est le drapeau le plus important : le dernier mois d'un
 * export est presque toujours incomplet, et comparer un mois de 12 jours à un
 * mois plein est le piège n°1 du reporting mensuel. Il est calculé en comparant
 * la fin de la dernière période à `opts.today` (par défaut : maintenant).
 * `lastPeriodProgress` donne la part écoulée de cette période (0 → 1).
 *
 * Comme `cumulate`, cette fonction suppose la série triée par ordre
 * chronologique croissant — ce que garantit `buildSeries`.
 *
 * @param {Array} series
 * @param {string} grain
 * @param {Object} [opts] { today }
 */
export function summarize(series, grain, opts) {
  const g = normGrain(grain);
  if (!g || !Array.isArray(series) || series.length === 0) return emptySummary(g);
  const o = opts || {};
  const today = toDate(o.today) || new Date();

  const lastPoint = series[series.length - 1] || null;
  const lastKey = lastPoint && typeof lastPoint.key === 'string' ? lastPoint.key : null;
  const lastValue = lastPoint && typeof lastPoint.value === 'number' && Number.isFinite(lastPoint.value)
    ? lastPoint.value : null;
  const lastStart = lastPoint && isValidDate(lastPoint.start)
    ? lastPoint.start : (lastKey ? keyToStart(lastKey, g) : null);

  // Les deux clés de référence sont connues AVANT le parcours : une seule
  // passe suffit alors pour tout calculer, sans table de hachage intermédiaire.
  const prevKey = lastStart ? refKeyFromStart(lastStart, g, 'prev') : null;
  const yoyKey = lastStart ? refKeyFromStart(lastStart, g, 'yoy') : null;

  let total = 0;
  let valued = 0;
  let filledCount = 0;
  let min = null;
  let max = null;
  let prevPoint = null;
  let yoyPoint = null;
  // Cumul annuel courant, remis à zéro à chaque 1er janvier : donne à la fois
  // le YTD du dernier point et celui de la période N-1 équivalente (le
  // « YTD vs YTD » que réclame tout contrôleur de gestion).
  let ytdRunning = 0;
  let ytdSeen = false;
  let ytdYear = null;
  let ytd = null;
  let ytdLastYear = null;

  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    if (!p || typeof p.key !== 'string') continue;
    if (p.filled) filledCount++;
    if (p.key === prevKey) prevPoint = p;
    if (p.key === yoyKey) yoyPoint = p;

    const start = isValidDate(p.start) ? p.start : keyToStart(p.key, g);
    const year = start ? start.getFullYear() : null;
    if (year !== ytdYear) { ytdYear = year; ytdRunning = 0; ytdSeen = false; }

    const v = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null;
    if (v !== null) {
      total += v;
      valued++;
      ytdRunning += v;
      ytdSeen = true;
      if (!min || v < min.value) min = { key: p.key, value: v };
      if (!max || v > max.value) max = { key: p.key, value: v };
    }
    if (p.key === yoyKey) ytdLastYear = ytdSeen ? ytdRunning : null;
    ytd = ytdSeen ? ytdRunning : null; // au sortir de la boucle : le dernier point
  }

  const asRef = (key, point) => (key
    ? { key, value: point && typeof point.value === 'number' ? point.value : null, present: !!point }
    : null);

  // Période partielle : la dernière période a-t-elle une fin dans le futur ?
  let lastPeriodPartial = false;
  let lastPeriodProgress = null;
  if (lastStart) {
    const end = periodEnd(lastStart, g);
    if (end && today.getTime() >= lastStart.getTime() && today.getTime() < end.getTime()) {
      lastPeriodPartial = true;
      const totalDays = daysBetween(lastStart, end);
      const doneDays = daysBetween(lastStart, today) + 1; // jour en cours inclus
      lastPeriodProgress = totalDays > 0
        ? Math.max(0, Math.min(1, doneDays / totalDays))
        : null;
    } else if (end && today.getTime() >= end.getTime()) {
      lastPeriodProgress = 1;
    }
  }

  return {
    grain: g,
    count: series.length,
    filledCount,
    firstKey: series[0] && series[0].key ? series[0].key : null,
    lastKey,
    last: lastKey ? { key: lastKey, value: lastValue, label: periodLabel(lastKey, g) } : null,
    previous: asRef(prevKey, prevPoint),
    lastYear: asRef(yoyKey, yoyPoint),
    vsPrevious: variation(lastValue, prevPoint ? prevPoint.value : null),
    vsLastYear: variation(lastValue, yoyPoint ? yoyPoint.value : null),
    total: valued > 0 ? total : null,
    average: valued > 0 ? total / valued : null,
    min,
    max,
    ytd,
    ytdLastYear,
    vsYtdLastYear: variation(ytd, ytdLastYear),
    lastPeriodPartial,
    lastPeriodProgress,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   POINT D'ENTRÉE DE HAUT NIVEAU
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Tout en un appel : c'est la fonction que l'app utilise.
 *
 *   const ti = computeTimeIntel(groupByTime(...), 'month',
 *              { compare: 'yoy', cumul: 'ytd', movingAvg: 3 });
 *   ti.base      → série de base (trous comblés)
 *   ti.compare   → série de comparaison, MÊMES CLÉS que base, ou null
 *   ti.cumul     → série cumulée, MÊMES CLÉS que base, ou null
 *   ti.movingAvg → moyenne mobile, MÊMES CLÉS que base, ou null
 *   ti.summary   → chiffres clés (voir summarize)
 *
 * Toutes les séries renvoyées ont exactement la même longueur et les mêmes
 * clés dans le même ordre : deux datasets Chart.js se superposent donc sans
 * aucun décalage, y compris quand des périodes manquent dans les données.
 *
 * @param {Array} points  sortie de `groupByTime` (tuples ou objets)
 * @param {string} grain  'day' | 'week' | 'month' | 'quarter' | 'year'
 * @param {Object} [opts]
 * @param {string} [opts.compare='none']  voir TIME_COMPARE_MODES
 * @param {string} [opts.cumul='none']    voir TIME_CUMUL_MODES
 * @param {number|Object} [opts.movingAvg=0] taille de fenêtre, ou { window, center }
 * @param {number|null} [opts.gapValue=0] valeur des périodes comblées
 * @param {boolean} [opts.fillGaps=true]
 * @param {boolean} [opts.labels=false]
 * @param {Date} [opts.today]             utile pour les tests et les rejeux
 * @returns {{base:Array, compare:Array|null, cumul:Array|null, movingAvg:Array|null, summary:Object}}
 */
export function computeTimeIntel(points, grain, opts) {
  const o = opts || {};
  const g = normGrain(grain);

  // Contrat de robustesse : jamais d'exception, même sur une entrée absurde.
  try {
    if (!g) {
      return { base: [], compare: null, cumul: null, movingAvg: null, summary: emptySummary(null) };
    }

    const base = buildSeries(points, g, {
      fillGaps: o.fillGaps !== false,
      gapValue: o.gapValue === undefined ? 0 : o.gapValue,
      duplicates: o.duplicates,
      labels: o.labels === true,
      lang: o.lang,
    });

    if (base.length === 0) {
      return { base: [], compare: null, cumul: null, movingAvg: null, summary: emptySummary(g) };
    }

    const compareMode = o.compare === 'prev' || o.compare === 'yoy' ? o.compare : null;
    const cumulMode = o.cumul === 'running' || o.cumul === 'ytd' || o.cumul === 'qtd' || o.cumul === 'mtd'
      ? o.cumul : null;

    let maWindow = 0;
    let maOpts = null;
    if (o.movingAvg && typeof o.movingAvg === 'object') {
      maWindow = Math.trunc(Number(o.movingAvg.window));
      maOpts = { center: o.movingAvg.center === true, minPeriods: o.movingAvg.minPeriods };
    } else {
      maWindow = Math.trunc(Number(o.movingAvg));
    }
    if (!Number.isFinite(maWindow) || maWindow < 2) maWindow = 0; // < 2 = sans effet

    return {
      base,
      compare: compareMode ? alignPrevious(base, g, compareMode) : null,
      cumul: cumulMode ? cumulate(base, g, cumulMode) : null,
      movingAvg: maWindow ? movingAverage(base, maWindow, maOpts) : null,
      summary: summarize(base, g, { today: o.today }),
    };
  } catch (e) {
    // Un tableau de graphiques ne doit jamais tomber à cause d'une date pourrie.
    return { base: [], compare: null, cumul: null, movingAvg: null, summary: emptySummary(g) };
  }
}
