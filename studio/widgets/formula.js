/*!
 * FlowPilot Studio — Copyright (c) 2026 Jeremy Ducrot. Tous droits réservés.
 * Logiciel propriétaire. Voir LICENSE. Reproduction ou réutilisation du code
 * interdites sans autorisation écrite.
 */
/**
 * FlowPilot Studio — Moteur de formules (formula.js)
 *
 * POURQUOI CE FICHIER
 * Les « colonnes calculées » utilisaient jusqu'ici du JavaScript généré par une
 * IA puis exécuté avec `new Function(...)`. C'est de l'exécution de code
 * arbitraire dans le navigateur de l'utilisateur : une formule malveillante (ou
 * une IA qui déraille) pouvait lire le localStorage, appeler fetch(), etc.
 *
 * Ce module remplace ce mécanisme par un petit langage d'expression maison,
 * volontairement proche d'Excel (cible : PME transport-logistique), qui est
 * tokenisé, parsé en AST puis évalué à la main. Aucun `eval`, aucun
 * `new Function`, aucun `setTimeout(string)`, aucune construction équivalente :
 * l'AST n'est JAMAIS reconverti en chaîne pour être exécuté. La seule chose
 * qu'une formule peut faire, c'est lire les colonnes de la ligne courante et
 * appeler une fonction de l'allowlist ci-dessous.
 *
 * PIPELINE
 *   source (texte) → tokenize() → parse() → AST → compile() → evaluate(row)
 *
 * On compile UNE fois, on évalue N fois (jusqu'à ~100 000 lignes) : toutes les
 * validations coûteuses (colonnes, fonctions, arités, garde-fous) ont lieu à la
 * compilation ; l'évaluation ne fait que parcourir l'AST, sans allocation ni
 * regex construite dans la boucle.
 *
 * Convention du dépôt : commentaires en français, identifiants en anglais.
 */

/* ════════════════════════════════════════════════════════════════════════
   GARDE-FOUS
   ════════════════════════════════════════════════════════════════════════ */

const MAX_SOURCE_LENGTH = 2000; // caractères
const MAX_NODES         = 500;  // nœuds d'AST
const MAX_DEPTH         = 100;  // profondeur d'AST / de récursion du parseur

/* ════════════════════════════════════════════════════════════════════════
   ERREURS
   ════════════════════════════════════════════════════════════════════════ */

// Erreur de compilation : message français + position (index dans la source).
class FormulaError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'FormulaError';
    this.position = typeof position === 'number' && position >= 0 ? position : 0;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   OUTILS TEXTE (normalisation, distance de Levenshtein, suggestions)
   ════════════════════════════════════════════════════════════════════════ */

const RE_DIACRITICS = /[\u0300-\u036f]/g;

// « Coût HT » → « cout ht » : sert aux comparaisons tolérantes (colonnes,
// booléens textuels, comparaison de chaînes).
function normalizeText(s) {
  return String(s).normalize('NFD').replace(RE_DIACRITICS, '').toLowerCase().trim();
}

// Distance d'édition classique, en deux lignes de travail (peu d'allocations).
function levenshtein(a, b) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (Math.abs(la - lb) > 12) return Math.abs(la - lb); // inutile d'affiner
  let prev = new Array(lb + 1);
  let cur  = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      let v = prev[j] + 1;
      const del = cur[j - 1] + 1;
      if (del < v) v = del;
      const sub = prev[j - 1] + cost;
      if (sub < v) v = sub;
      cur[j] = v;
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[lb];
}

// Les 2 candidats les plus proches, uniquement s'ils sont vraiment proches.
function closestNames(needle, candidates, limit) {
  const target = normalizeText(needle);
  const scored = [];
  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    const norm = normalizeText(name);
    let d = levenshtein(target, norm);
    // Un préfixe / une inclusion est presque toujours ce que l'utilisateur voulait.
    if (norm.indexOf(target) === 0 || target.indexOf(norm) === 0) d -= 2;
    else if (norm.indexOf(target) >= 0 || target.indexOf(norm) >= 0) d -= 1;
    scored.push({ name, d });
  }
  scored.sort((x, y) => x.d - y.d || x.name.localeCompare(y.name));
  const maxDist = Math.max(2, Math.ceil(target.length / 2));
  const out = [];
  for (let i = 0; i < scored.length && out.length < (limit || 2); i++) {
    if (scored[i].d <= maxDist) out.push(scored[i].name);
  }
  return out;
}

function quoteList(names) {
  return names.map(n => '"' + n + '"').join(', ');
}

/* ════════════════════════════════════════════════════════════════════════
   TOKENIZER
   ════════════════════════════════════════════════════════════════════════ */

// Types de jetons : 'num' 'str' 'bool' 'null' 'col' 'name' 'op' 'eof'
const RE_IDENT_START = /[A-Za-z_\u00c0-\u024f]/;
const RE_IDENT_PART  = /[A-Za-z0-9_\u00c0-\u024f]/;

const TWO_CHAR_OPS = ['||', '&&', '==', '!=', '<>', '<=', '>='];
const ONE_CHAR_OPS = '+-*/%^&<>!?:(),';

const KEYWORDS = {
  true:  { type: 'bool', value: true  },
  false: { type: 'bool', value: false },
  null:  { type: 'null', value: null  },
  vrai:  { type: 'bool', value: true  },
  faux:  { type: 'bool', value: false },
};

function tokenize(source) {
  const tokens = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const ch = source[i];

    // Espaces
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }

    // Nombre : 12, 3.5 (pas d'exposant, pas de .5)
    if (ch >= '0' && ch <= '9') {
      const start = i;
      while (i < n && source[i] >= '0' && source[i] <= '9') i++;
      if (source[i] === '.' && source[i + 1] >= '0' && source[i + 1] <= '9') {
        i++;
        while (i < n && source[i] >= '0' && source[i] <= '9') i++;
      }
      if (source[i] === '.') {
        throw new FormulaError('Nombre mal écrit : un seul point décimal est autorisé.', start);
      }
      tokens.push({ type: 'num', value: parseFloat(source.slice(start, i)), pos: start });
      continue;
    }

    // Chaîne : "…" ou '…' — le guillemet doublé échappe ("il ""dit""")
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i++;
      let buf = '';
      let closed = false;
      while (i < n) {
        const c = source[i];
        if (c === quote) {
          if (source[i + 1] === quote) { buf += quote; i += 2; continue; }
          i++; closed = true; break;
        }
        if (c === '\\' && i + 1 < n) {
          const next = source[i + 1];
          buf += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
          continue;
        }
        buf += c;
        i++;
      }
      if (!closed) {
        throw new FormulaError('Guillemet non refermé : ajoute un ' + quote + ' à la fin du texte.', start);
      }
      tokens.push({ type: 'str', value: buf, pos: start });
      continue;
    }

    // Référence de colonne : [Nom de colonne]
    if (ch === '[') {
      const start = i;
      const end = source.indexOf(']', i + 1);
      if (end < 0) {
        throw new FormulaError('Crochet non refermé : une colonne s\'écrit [Nom de colonne].', start);
      }
      const raw = source.slice(i + 1, end).trim();
      if (!raw) {
        throw new FormulaError('Référence de colonne vide : écris [Nom de colonne].', start);
      }
      tokens.push({ type: 'col', value: raw, pos: start });
      i = end + 1;
      continue;
    }

    // Identifiant nu : nom de colonne sans espace, mot-clé, ou nom de fonction
    if (RE_IDENT_START.test(ch)) {
      const start = i;
      while (i < n && RE_IDENT_PART.test(source[i])) i++;
      const word = source.slice(start, i);
      const kw = KEYWORDS[word.toLowerCase()];
      if (kw) tokens.push({ type: kw.type, value: kw.value, pos: start });
      else    tokens.push({ type: 'name', value: word, pos: start });
      continue;
    }

    // Opérateurs à deux caractères
    const two = source.substr(i, 2);
    if (TWO_CHAR_OPS.indexOf(two) >= 0) {
      tokens.push({ type: 'op', value: two, pos: i });
      i += 2;
      continue;
    }

    // Opérateurs à un caractère
    if (ONE_CHAR_OPS.indexOf(ch) >= 0) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }

    // Erreurs fréquentes, avec un message qui explique quoi faire
    // « = » seul : accepté comme égalité. Une formule est une expression, il n'y
    // a pas d'affectation possible — autant accepter ce qu'un utilisateur Excel tape.
    if (ch === '=') {
      tokens.push({ type: 'op', value: '==', pos: i });
      i++;
      continue;
    }
    if (ch === '.') {
      throw new FormulaError('Le point « . » n\'existe pas dans les formules. Pour une colonne, écris [Nom de colonne].', i);
    }
    if (ch === '{' || ch === '}' || ch === ';') {
      throw new FormulaError('Caractère interdit « ' + ch + ' » : une formule est une expression, pas du code.', i);
    }
    throw new FormulaError('Caractère inattendu « ' + ch + ' ».', i);
  }

  tokens.push({ type: 'eof', value: null, pos: n });
  return tokens;
}

/* ════════════════════════════════════════════════════════════════════════
   REGISTRE DES FONCTIONS (allowlist stricte)
   ════════════════════════════════════════════════════════════════════════ */

// Chaque entrée : arité, type de retour, métadonnées d'aide et implémentation.
// `lazy: true` = les arguments ne sont PAS pré-évalués (IF, AND, OR, COALESCE),
// ce qui permet à IF([KM] > 0, [CA] / [KM], 0) de ne pas calculer la branche
// morte, et à AND/OR de court-circuiter.
/**
 * Alias Excel. Les noms de fonctions ne sont pas protégeables (ce sont des
 * mots fonctionnels), et un utilisateur qui connaît Excel doit pouvoir taper
 * ce qu'il a dans les doigts. L'anglais partage déjà l'essentiel des noms :
 * cette table couvre surtout Excel francophone.
 *
 * Ce ne sont que des synonymes de surface : même fonction, même sémantique.
 * Aucune tentative d'imiter DAX, dont le modèle (contexte de ligne, contexte
 * de filtre) n'existe pas ici — mieux vaut ne pas l'offrir que le faire faux.
 */
const FUNCTION_ALIASES = {
  // Logique
  SI: 'IF', ET: 'AND', OU: 'OR', NON: 'NOT', ESTVIDE: 'ISBLANK',
  // Texte
  GAUCHE: 'LEFT', DROITE: 'RIGHT', STXT: 'MID', NBCAR: 'LEN',
  MAJUSCULE: 'UPPER', MINUSCULE: 'LOWER', SUPPRESPACE: 'TRIM',
  CONCATENER: 'CONCAT', SUBSTITUE: 'REPLACE', 'SUBSTITUTE': 'REPLACE',
  // Maths
  ARRONDI: 'ROUND', ENT: 'FLOOR', PLAFOND: 'CEIL', PLANCHER: 'FLOOR',
  PUISSANCE: 'POW', RACINE: 'SQRT', SIGNE: 'SIGN',
  // Dates
  ANNEE: 'YEAR', MOIS: 'MONTH', JOUR: 'DAY', JOURSEM: 'WEEKDAY',
  AUJOURDHUI: 'TODAY', "AUJOURD'HUI": 'TODAY', NOSEM: 'WEEK',
  // Conversion
  CNUM: 'NUMBER', TEXTE: 'TEXT',
};

const FUNCTIONS = {};

function defineFunction(spec) {
  FUNCTIONS[spec.name] = spec;
}

const FUNCTION_NAMES = [];

/* ── Coercions ──────────────────────────────────────────────────────────── */

const RE_NUM_STRIP  = /[\s\u00a0\u202f\u2009\u20ac$\u00a3]/g;
const RE_ALL_COMMAS = /,/g;
const RE_ALL_DOTS   = /\./g;

// Toute valeur non convertible → null (jamais NaN, jamais d'exception).
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v;
  if (t === 'number')  return Number.isFinite(v) ? v : null;
  if (t === 'boolean') return v ? 1 : 0;
  if (t === 'string') {
    const s = v.trim();
    if (!s) return null;
    const fast = Number(s);
    if (!Number.isNaN(fast)) return Number.isFinite(fast) ? fast : null;
    // Formats français : « 1 234,56 », « 1.234,56 », « 12,5 € »
    let cleaned = s.replace(RE_NUM_STRIP, '');
    const commas = (cleaned.match(RE_ALL_COMMAS) || []).length;
    const hasDot = cleaned.indexOf('.') >= 0;
    if (commas > 1)            cleaned = cleaned.replace(RE_ALL_COMMAS, '');
    else if (commas === 1 && hasDot) cleaned = cleaned.replace(RE_ALL_DOTS, '').replace(RE_ALL_COMMAS, '.');
    else if (commas === 1)     cleaned = cleaned.replace(RE_ALL_COMMAS, '.');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null; // objets, Date, fonctions… : pas d'arithmétique implicite
}

// Évite « 0.30000000000000004 » à l'affichage sans toucher aux vrais décimaux.
function numberToText(v) {
  if (!Number.isFinite(v)) return null;
  if (Number.isInteger(v)) return String(v);
  const rounded = Math.round(v * 1e10) / 1e10;
  return String(rounded);
}

function toText(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'string')  return v;
  if (t === 'number')  return numberToText(v);
  if (t === 'boolean') return v ? 'VRAI' : 'FAUX';
  if (v instanceof Date) return isNaN(v.getTime()) ? null : formatDate(v, 'YYYY-MM-DD');
  return null;
}

// Pour l'opérateur & et CONCAT : un blanc vaut chaîne vide (comme Excel).
function toTextOrEmpty(v) {
  const s = toText(v);
  return s === null ? '' : s;
}

const TRUE_WORDS  = ['true', 'vrai', 'oui', 'yes', 'y', 'o', 'x', '1'];
const FALSE_WORDS = ['false', 'faux', 'non', 'no', 'n', '0'];

function toBool(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v;
  if (t === 'boolean') return v;
  if (t === 'number')  return Number.isFinite(v) ? v !== 0 : null;
  if (t === 'string') {
    const s = normalizeText(v);
    if (TRUE_WORDS.indexOf(s) >= 0)  return true;
    if (FALSE_WORDS.indexOf(s) >= 0) return false;
    return null;
  }
  if (v instanceof Date) return !isNaN(v.getTime());
  return null;
}

function isBlank(v) {
  return v === null || v === undefined || v === '' ||
         (typeof v === 'string' && v.trim() === '');
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

// Repli interne minimal si l'app ne fournit pas son parseDateValue :
// ISO (YYYY-MM-DD), DD/MM/YYYY, et série Excel.
const RE_DATE_ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const RE_DATE_FR  = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function fallbackParseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Série Excel (même fenêtre que l'app principale)
    if (v >= 20000 && v <= 80000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }
  const s = String(v).trim();
  let m = RE_DATE_ISO.exec(s);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) return d;
    return null;
  }
  m = RE_DATE_FR.exec(s);
  if (m) {
    const year = String(m[3]).length === 2 ? 2000 + (+m[3]) : +m[3];
    const d = new Date(year, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (d.getFullYear() === year && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1]) return d;
    return null;
  }
  return null;
}

// `ctx.parseDate` est parseDateValue fourni par l'app, sinon le repli.
function toDate(v, ctx) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return null;
  let d = null;
  try {
    d = ctx.parseDate(v);
  } catch (e) {
    d = null;
  }
  if (d instanceof Date && !isNaN(d.getTime())) return d;
  return null;
}

// TODAY() : mis en cache jusqu'à minuit — sinon on allouerait une Date par ligne.
let _todayCache  = null;
let _todayExpiry = 0;

function today() {
  const now = Date.now();
  if (_todayCache === null || now >= _todayExpiry) {
    const d = new Date();
    _todayCache  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    _todayExpiry = _todayCache.getTime() + 86400000;
  }
  return _todayCache;
}

// Numéro de jour absolu (minuit local) — base des différences en jours,
// insensible aux changements d'heure.
function dayNumber(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function isoWeek(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = Date.UTC(tmp.getUTCFullYear(), 0, 1);
  return Math.ceil((((tmp.getTime() - yearStart) / 86400000) + 1) / 7);
}

const DATE_FORMATS = ['YYYY-MM-DD', 'YYYY-MM', 'DD/MM/YYYY', 'MM/YYYY', 'YYYY'];

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatDate(d, fmt) {
  const y = d.getFullYear(), m = pad2(d.getMonth() + 1), day = pad2(d.getDate());
  switch (fmt) {
    case 'YYYY-MM-DD': return y + '-' + m + '-' + day;
    case 'DD/MM/YYYY': return day + '/' + m + '/' + y;
    case 'YYYY-MM':    return y + '-' + m;
    case 'MM/YYYY':    return m + '/' + y;
    case 'YYYY':       return String(y);
    default:           return null;
  }
}

const DATEDIFF_UNITS = ['day', 'week', 'month', 'year'];

// DATEDIFF(d1, d2, unit) = d1 − d2 (positif si d1 est postérieure).
function dateDiff(d1, d2, unit) {
  switch (unit) {
    case 'day':  return dayNumber(d1) - dayNumber(d2);
    case 'week': return Math.trunc((dayNumber(d1) - dayNumber(d2)) / 7);
    case 'month': {
      let months = (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth());
      // On compte les mois RÉVOLUS : le 30/01 → 05/02 fait 0 mois.
      if (months > 0 && d1.getDate() < d2.getDate()) months--;
      else if (months < 0 && d1.getDate() > d2.getDate()) months++;
      return months;
    }
    case 'year': {
      let years = d1.getFullYear() - d2.getFullYear();
      const md1 = d1.getMonth() * 100 + d1.getDate();
      const md2 = d2.getMonth() * 100 + d2.getDate();
      if (years > 0 && md1 < md2) years--;
      else if (years < 0 && md1 > md2) years++;
      return years;
    }
    default: return null;
  }
}

/* ── Comparaisons ───────────────────────────────────────────────────────── */

// −1 / 0 / 1, ou null si les deux valeurs ne sont pas comparables.
function compareValues(a, b, ctx) {
  if (a instanceof Date || b instanceof Date) {
    const da = toDate(a, ctx), db = toDate(b, ctx);
    if (da === null || db === null) return null;
    const ta = da.getTime(), tb = db.getTime();
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  }
  const na = toNumber(a), nb = toNumber(b);
  if (na !== null && nb !== null) return na < nb ? -1 : na > nb ? 1 : 0;
  const sa = toText(a), sb = toText(b);
  if (sa === null || sb === null) return null;
  const ka = normalizeText(sa), kb = normalizeText(sb);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function valuesEqual(a, b, ctx) {
  const ba = isBlank(a), bb = isBlank(b);
  if (ba || bb) return ba && bb;
  const cmp = compareValues(a, b, ctx);
  return cmp === null ? false : cmp === 0;
}

/* ── Maths ──────────────────────────────────────────────────────────────── */

function numArg(args, i) {
  return toNumber(args[i]);
}

defineFunction({
  name: 'ABS', category: 'Maths', min: 1, max: 1, returns: 'number',
  signature: 'ABS(nombre)', description: 'Valeur absolue (supprime le signe).',
  example: 'ABS([Écart])',
  impl: a => { const x = numArg(a, 0); return x === null ? null : Math.abs(x); },
});

defineFunction({
  name: 'ROUND', category: 'Maths', min: 1, max: 2, returns: 'number',
  signature: 'ROUND(nombre, décimales)', description: 'Arrondit à n décimales (0 par défaut).',
  example: 'ROUND([CA] * 1.2, 2)',
  impl: a => {
    const x = numArg(a, 0);
    if (x === null) return null;
    let n = a.length > 1 ? numArg(a, 1) : 0;
    if (n === null) return null;
    n = Math.max(-10, Math.min(10, Math.trunc(n)));
    const f = Math.pow(10, n);
    // Arrondi « commercial » : 2,5 → 3 et −2,5 → −3 (Excel), pas Math.round.
    const r = (x < 0 ? -1 : 1) * Math.round(Math.abs(x) * f) / f;
    return Number.isFinite(r) ? r : null;
  },
});

defineFunction({
  name: 'FLOOR', category: 'Maths', min: 1, max: 1, returns: 'number',
  signature: 'FLOOR(nombre)', description: 'Arrondit à l\'entier inférieur.',
  example: 'FLOOR([Tonnage])',
  impl: a => { const x = numArg(a, 0); return x === null ? null : Math.floor(x); },
});

defineFunction({
  name: 'CEIL', category: 'Maths', min: 1, max: 1, returns: 'number',
  signature: 'CEIL(nombre)', description: 'Arrondit à l\'entier supérieur.',
  example: 'CEIL([Palettes])',
  impl: a => { const x = numArg(a, 0); return x === null ? null : Math.ceil(x); },
});

defineFunction({
  name: 'MIN', category: 'Maths', min: 1, max: Infinity, returns: 'number',
  signature: 'MIN(a, b, …)', description: 'Le plus petit des nombres (ignore les vides).',
  example: 'MIN([Prix A], [Prix B])',
  impl: a => {
    let best = null;
    for (let i = 0; i < a.length; i++) {
      const x = toNumber(a[i]);
      if (x !== null && (best === null || x < best)) best = x;
    }
    return best;
  },
});

defineFunction({
  name: 'MAX', category: 'Maths', min: 1, max: Infinity, returns: 'number',
  signature: 'MAX(a, b, …)', description: 'Le plus grand des nombres (ignore les vides).',
  example: 'MAX([Prix A], [Prix B])',
  impl: a => {
    let best = null;
    for (let i = 0; i < a.length; i++) {
      const x = toNumber(a[i]);
      if (x !== null && (best === null || x > best)) best = x;
    }
    return best;
  },
});

defineFunction({
  name: 'SQRT', category: 'Maths', min: 1, max: 1, returns: 'number',
  signature: 'SQRT(nombre)', description: 'Racine carrée (négatif → vide).',
  example: 'SQRT([Surface])',
  impl: a => { const x = numArg(a, 0); return x === null || x < 0 ? null : Math.sqrt(x); },
});

defineFunction({
  name: 'POW', category: 'Maths', min: 2, max: 2, returns: 'number',
  signature: 'POW(nombre, puissance)', description: 'Élève un nombre à une puissance.',
  example: 'POW([Côté], 2)',
  impl: a => {
    const x = numArg(a, 0), y = numArg(a, 1);
    if (x === null || y === null) return null;
    const r = Math.pow(x, y);
    return Number.isFinite(r) ? r : null;
  },
});

defineFunction({
  name: 'MOD', category: 'Maths', min: 2, max: 2, returns: 'number',
  signature: 'MOD(nombre, diviseur)', description: 'Reste de la division (signe du diviseur, comme Excel).',
  example: 'MOD([Numéro], 2)',
  impl: a => {
    const x = numArg(a, 0), y = numArg(a, 1);
    if (x === null || y === null || y === 0) return null;
    const r = ((x % y) + y) % y;
    return Number.isFinite(r) ? r : null;
  },
});

defineFunction({
  name: 'SIGN', category: 'Maths', min: 1, max: 1, returns: 'number',
  signature: 'SIGN(nombre)', description: 'Renvoie −1, 0 ou 1 selon le signe.',
  example: 'SIGN([Marge])',
  impl: a => { const x = numArg(a, 0); return x === null ? null : (x > 0 ? 1 : x < 0 ? -1 : 0); },
});

/* ── Logique ────────────────────────────────────────────────────────────── */

defineFunction({
  name: 'IF', category: 'Logique', min: 3, max: 3, returns: 'derived', lazy: true,
  signature: 'IF(condition, si_vrai, si_faux)', description: 'Renvoie une valeur ou l\'autre selon la condition.',
  example: 'IF([Marge] > 0, "positif", "négatif")',
});

defineFunction({
  name: 'AND', category: 'Logique', min: 1, max: Infinity, returns: 'bool', lazy: true,
  signature: 'AND(cond1, cond2, …)', description: 'Vrai si toutes les conditions sont vraies.',
  example: 'AND([CA] > 0, [KM] > 0)',
});

defineFunction({
  name: 'OR', category: 'Logique', min: 1, max: Infinity, returns: 'bool', lazy: true,
  signature: 'OR(cond1, cond2, …)', description: 'Vrai si au moins une condition est vraie.',
  example: 'OR([Statut] == "Annulé", [Statut] == "Reporté")',
});

defineFunction({
  name: 'NOT', category: 'Logique', min: 1, max: 1, returns: 'bool',
  signature: 'NOT(condition)', description: 'Inverse une condition.',
  example: 'NOT(ISBLANK([Client]))',
  impl: a => { const b = toBool(a[0]); return b === null ? null : !b; },
});

defineFunction({
  name: 'ISBLANK', category: 'Logique', min: 1, max: 1, returns: 'bool',
  signature: 'ISBLANK(valeur)', description: 'Vrai si la valeur est vide.',
  example: 'ISBLANK([Date livraison])',
  impl: a => isBlank(a[0]),
});

defineFunction({
  name: 'COALESCE', category: 'Logique', min: 1, max: Infinity, returns: 'derived', lazy: true,
  signature: 'COALESCE(v1, v2, …)', description: 'Première valeur non vide.',
  example: 'COALESCE([Client final], [Donneur d\'ordre], "Inconnu")',
});

/* ── Texte ──────────────────────────────────────────────────────────────── */

function textArg(args, i) {
  return toText(args[i]);
}

defineFunction({
  name: 'CONCAT', category: 'Texte', min: 1, max: Infinity, returns: 'text',
  signature: 'CONCAT(a, b, …)', description: 'Colle plusieurs textes bout à bout.',
  example: 'CONCAT([Ville départ], " → ", [Ville arrivée])',
  impl: a => {
    let out = '';
    for (let i = 0; i < a.length; i++) out += toTextOrEmpty(a[i]);
    return out;
  },
});

defineFunction({
  name: 'UPPER', category: 'Texte', min: 1, max: 1, returns: 'text',
  signature: 'UPPER(texte)', description: 'Met en majuscules.',
  example: 'UPPER([Transporteur])',
  impl: a => { const s = textArg(a, 0); return s === null ? null : s.toUpperCase(); },
});

defineFunction({
  name: 'LOWER', category: 'Texte', min: 1, max: 1, returns: 'text',
  signature: 'LOWER(texte)', description: 'Met en minuscules.',
  example: 'LOWER([Email])',
  impl: a => { const s = textArg(a, 0); return s === null ? null : s.toLowerCase(); },
});

defineFunction({
  name: 'TRIM', category: 'Texte', min: 1, max: 1, returns: 'text',
  signature: 'TRIM(texte)', description: 'Supprime les espaces en début et fin.',
  example: 'TRIM([Transporteur])',
  impl: a => { const s = textArg(a, 0); return s === null ? null : s.trim(); },
});

defineFunction({
  name: 'LEN', category: 'Texte', min: 1, max: 1, returns: 'number',
  signature: 'LEN(texte)', description: 'Nombre de caractères.',
  example: 'LEN([Immatriculation])',
  impl: a => { const s = textArg(a, 0); return s === null ? null : s.length; },
});

defineFunction({
  name: 'LEFT', category: 'Texte', min: 2, max: 2, returns: 'text',
  signature: 'LEFT(texte, n)', description: 'Les n premiers caractères.',
  example: 'LEFT([Code postal], 2)',
  impl: a => {
    const s = textArg(a, 0), n = toNumber(a[1]);
    if (s === null || n === null) return null;
    return s.slice(0, Math.max(0, Math.trunc(n)));
  },
});

defineFunction({
  name: 'RIGHT', category: 'Texte', min: 2, max: 2, returns: 'text',
  signature: 'RIGHT(texte, n)', description: 'Les n derniers caractères.',
  example: 'RIGHT([Référence], 4)',
  impl: a => {
    const s = textArg(a, 0), n = toNumber(a[1]);
    if (s === null || n === null) return null;
    const k = Math.max(0, Math.trunc(n));
    return k === 0 ? '' : s.slice(-k);
  },
});

defineFunction({
  name: 'MID', category: 'Texte', min: 3, max: 3, returns: 'text',
  signature: 'MID(texte, début, longueur)', description: 'Extrait une portion (début à partir de 1).',
  example: 'MID([Référence], 3, 5)',
  impl: a => {
    const s = textArg(a, 0), start = toNumber(a[1]), len = toNumber(a[2]);
    if (s === null || start === null || len === null) return null;
    const from = Math.max(0, Math.trunc(start) - 1);
    return s.substr(from, Math.max(0, Math.trunc(len)));
  },
});

defineFunction({
  name: 'CONTAINS', category: 'Texte', min: 2, max: 2, returns: 'bool',
  signature: 'CONTAINS(texte, morceau)', description: 'Vrai si le texte contient le morceau (ignore casse et accents).',
  example: 'CONTAINS([Observation], "retard")',
  impl: a => {
    const s = textArg(a, 0), sub = textArg(a, 1);
    if (s === null || sub === null) return null;
    return normalizeText(s).indexOf(normalizeText(sub)) >= 0;
  },
});

defineFunction({
  name: 'STARTSWITH', category: 'Texte', min: 2, max: 2, returns: 'bool',
  signature: 'STARTSWITH(texte, début)', description: 'Vrai si le texte commence par ce début.',
  example: 'STARTSWITH([Code postal], "69")',
  impl: a => {
    const s = textArg(a, 0), sub = textArg(a, 1);
    if (s === null || sub === null) return null;
    return normalizeText(s).indexOf(normalizeText(sub)) === 0;
  },
});

defineFunction({
  name: 'ENDSWITH', category: 'Texte', min: 2, max: 2, returns: 'bool',
  signature: 'ENDSWITH(texte, fin)', description: 'Vrai si le texte se termine par cette fin.',
  example: 'ENDSWITH([Fichier], ".pdf")',
  impl: a => {
    const s = textArg(a, 0), sub = textArg(a, 1);
    if (s === null || sub === null) return null;
    const ns = normalizeText(s), nsub = normalizeText(sub);
    if (nsub.length > ns.length) return false;
    return ns.lastIndexOf(nsub) === ns.length - nsub.length;
  },
});

defineFunction({
  name: 'REPLACE', category: 'Texte', min: 3, max: 3, returns: 'text',
  signature: 'REPLACE(texte, ancien, nouveau)', description: 'Remplace toutes les occurrences (texte brut, pas de motif).',
  example: 'REPLACE([Client], "SARL ", "")',
  impl: a => {
    const s = textArg(a, 0), oldS = textArg(a, 1), newS = textArg(a, 2);
    if (s === null || oldS === null || newS === null) return null;
    if (oldS === '') return s;
    return s.split(oldS).join(newS); // split/join : aucun risque d'injection de regex
  },
});

defineFunction({
  name: 'SPLIT', category: 'Texte', min: 2, max: 3, returns: 'text',
  signature: 'SPLIT(texte, séparateur, n)', description: 'n-ième morceau après découpe (n commence à 1).',
  example: 'SPLIT([Trajet], "-", 2)',
  impl: a => {
    const s = textArg(a, 0), sep = textArg(a, 1);
    if (s === null || sep === null || sep === '') return null;
    let idx = a.length > 2 ? toNumber(a[2]) : 1;
    if (idx === null) return null;
    idx = Math.trunc(idx);
    const parts = s.split(sep);
    if (idx < 0) idx = parts.length + idx + 1; // −1 = dernier morceau
    if (idx < 1 || idx > parts.length) return null;
    return parts[idx - 1];
  },
});

/* ── Dates ──────────────────────────────────────────────────────────────── */

function dateArg(args, i, ctx) {
  return toDate(args[i], ctx);
}

defineFunction({
  name: 'YEAR', category: 'Dates', min: 1, max: 1, returns: 'number',
  signature: 'YEAR(date)', description: 'Année (4 chiffres).',
  example: 'YEAR([Date chargement])',
  impl: (a, ctx) => { const d = dateArg(a, 0, ctx); return d ? d.getFullYear() : null; },
});

defineFunction({
  name: 'MONTH', category: 'Dates', min: 1, max: 1, returns: 'number',
  signature: 'MONTH(date)', description: 'Mois de 1 à 12.',
  example: 'MONTH([Date livraison])',
  impl: (a, ctx) => { const d = dateArg(a, 0, ctx); return d ? d.getMonth() + 1 : null; },
});

defineFunction({
  name: 'DAY', category: 'Dates', min: 1, max: 1, returns: 'number',
  signature: 'DAY(date)', description: 'Jour du mois de 1 à 31.',
  example: 'DAY([Date livraison])',
  impl: (a, ctx) => { const d = dateArg(a, 0, ctx); return d ? d.getDate() : null; },
});

defineFunction({
  name: 'WEEKDAY', category: 'Dates', min: 1, max: 1, returns: 'number',
  signature: 'WEEKDAY(date)', description: 'Jour de la semaine : 1 = lundi … 7 = dimanche.',
  example: 'WEEKDAY([Date chargement])',
  impl: (a, ctx) => { const d = dateArg(a, 0, ctx); return d ? (d.getDay() === 0 ? 7 : d.getDay()) : null; },
});

defineFunction({
  name: 'QUARTER', category: 'Dates', min: 1, max: 1, returns: 'number',
  signature: 'QUARTER(date)', description: 'Trimestre de 1 à 4.',
  example: 'QUARTER([Date facture])',
  impl: (a, ctx) => { const d = dateArg(a, 0, ctx); return d ? Math.ceil((d.getMonth() + 1) / 3) : null; },
});

defineFunction({
  name: 'WEEK', category: 'Dates', min: 1, max: 1, returns: 'number',
  signature: 'WEEK(date)', description: 'Numéro de semaine ISO (1 à 53).',
  example: 'WEEK([Date chargement])',
  impl: (a, ctx) => { const d = dateArg(a, 0, ctx); return d ? isoWeek(d) : null; },
});

defineFunction({
  name: 'DATEDIFF', category: 'Dates', min: 2, max: 3, returns: 'number',
  signature: 'DATEDIFF(date1, date2, unité)', description: 'date1 − date2 dans l\'unité "day" (défaut), "week", "month" ou "year".',
  example: 'DATEDIFF([Date livraison], [Date chargement], "day")',
  // L'unité est vérifiée dès la compilation quand c\'est un texte littéral.
  literalArg: { index: 2, values: DATEDIFF_UNITS, label: 'unité' },
  impl: (a, ctx) => {
    const d1 = dateArg(a, 0, ctx), d2 = dateArg(a, 1, ctx);
    if (!d1 || !d2) return null;
    let unit = a.length > 2 ? toText(a[2]) : 'day';
    if (unit === null) return null;
    unit = normalizeText(unit);
    if (DATEDIFF_UNITS.indexOf(unit) < 0) return null;
    return dateDiff(d1, d2, unit);
  },
});

defineFunction({
  name: 'TODAY', category: 'Dates', min: 0, max: 0, returns: 'date',
  signature: 'TODAY()', description: 'La date du jour.',
  example: 'DATEDIFF(TODAY(), [Date chargement], "day")',
  impl: () => today(),
});

defineFunction({
  name: 'DAYS_SINCE', category: 'Dates', min: 1, max: 1, returns: 'number',
  signature: 'DAYS_SINCE(date)', description: 'Nombre de jours écoulés depuis cette date.',
  example: 'DAYS_SINCE([Date facture])',
  impl: (a, ctx) => {
    const d = dateArg(a, 0, ctx);
    return d ? dayNumber(today()) - dayNumber(d) : null;
  },
});

defineFunction({
  name: 'FORMATDATE', category: 'Dates', min: 2, max: 2, returns: 'text',
  signature: 'FORMATDATE(date, format)', description: 'Formate une date : "YYYY-MM-DD", "YYYY-MM", "DD/MM/YYYY", "MM/YYYY" ou "YYYY".',
  example: 'FORMATDATE([Date chargement], "MM/YYYY")',
  literalArg: { index: 1, values: DATE_FORMATS, label: 'format', caseSensitive: true },
  impl: (a, ctx) => {
    const d = dateArg(a, 0, ctx), fmt = toText(a[1]);
    if (!d || fmt === null) return null;
    if (DATE_FORMATS.indexOf(fmt) < 0) return null;
    return formatDate(d, fmt);
  },
});

/* ── Conversion ─────────────────────────────────────────────────────────── */

defineFunction({
  name: 'NUMBER', category: 'Conversion', min: 1, max: 1, returns: 'number',
  signature: 'NUMBER(valeur)', description: 'Convertit en nombre (vide si impossible).',
  example: 'NUMBER([Poids saisi])',
  impl: a => toNumber(a[0]),
});

defineFunction({
  name: 'TEXT', category: 'Conversion', min: 1, max: 1, returns: 'text',
  signature: 'TEXT(valeur)', description: 'Convertit en texte.',
  example: 'TEXT([Tonnage])',
  impl: a => toText(a[0]),
});

defineFunction({
  name: 'BOOL', category: 'Conversion', min: 1, max: 1, returns: 'bool',
  signature: 'BOOL(valeur)', description: 'Convertit en vrai/faux ("oui", "1", "vrai"…).',
  example: 'BOOL([Livré])',
  impl: a => toBool(a[0]),
});

for (const key in FUNCTIONS) FUNCTION_NAMES.push(key);
FUNCTION_NAMES.sort();

/* ════════════════════════════════════════════════════════════════════════
   PARSEUR (precedence climbing / Pratt)
   ════════════════════════════════════════════════════════════════════════ */

// Précédences croissantes. `&` (concaténation) se place entre les comparaisons
// et « + − », comme dans Excel : "Total : " & [A] + [B] → "Total : " & ([A]+[B]).
const BINARY_PRECEDENCE = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3, '<>': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
  '&': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

const PREC_TERNARY = 0;
const PREC_UNARY   = 7;
const PREC_POWER   = 8;
const PREC_ATOM    = 9;

function createParser(tokens, source, columnIndex) {
  let pos   = 0;
  let nodes = 0;
  let depth = 0;

  function peek()   { return tokens[pos]; }
  function next()   { return tokens[pos++]; }

  function makeNode(node) {
    if (++nodes > MAX_NODES) {
      throw new FormulaError('Formule trop complexe (plus de ' + MAX_NODES + ' éléments). Découpe-la en plusieurs colonnes.', node.pos || 0);
    }
    return node;
  }

  function enter(pos0) {
    if (++depth > MAX_DEPTH) {
      throw new FormulaError('Formule trop imbriquée (plus de ' + MAX_DEPTH + ' niveaux). Simplifie-la.', pos0);
    }
  }
  function leave() { depth--; }

  // Décrit un jeton pour les messages d'erreur.
  function describeToken(t) {
    if (t.type === 'eof') return 'la fin de la formule';
    if (t.type === 'col') return '[' + t.value + ']';
    if (t.type === 'str') return '"' + t.value + '"';
    if (t.type === 'bool') return t.value ? 'true' : 'false';
    if (t.type === 'null') return 'null';
    return '« ' + t.value + ' »';
  }

  function expectOp(op, what) {
    const t = peek();
    if (t.type === 'op' && t.value === op) { pos++; return t; }
    throw new FormulaError(what + ' — trouvé ' + describeToken(t) + '.', t.pos);
  }

  /* ── Expression complète (ternaire au sommet) ── */
  function parseExpression() {
    const start = peek().pos;
    enter(start);
    const cond = parseBinary(1);
    const t = peek();
    if (t.type === 'op' && t.value === '?') {
      pos++;
      const whenTrue = parseExpression();
      expectOp(':', 'Il manque « : » dans le test « condition ? valeur1 : valeur2 »');
      const whenFalse = parseExpression();
      leave();
      return makeNode({ type: 'ternary', cond, whenTrue, whenFalse, pos: start });
    }
    leave();
    return cond;
  }

  /* ── Opérateurs binaires ── */
  function parseBinary(minPrecedence) {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t.type !== 'op') break;
      const prec = BINARY_PRECEDENCE[t.value];
      if (prec === undefined || prec < minPrecedence) break;
      pos++;
      const right = parseBinary(prec + 1); // tous associatifs à gauche
      left = makeNode({ type: 'binary', op: t.value, left, right, pos: t.pos });
    }
    return left;
  }

  /* ── Unaire − et ! ── */
  function parseUnary() {
    const t = peek();
    if (t.type === 'op' && (t.value === '-' || t.value === '!')) {
      pos++;
      enter(t.pos);
      const operand = parseUnary();
      leave();
      return makeNode({ type: 'unary', op: t.value, operand, pos: t.pos });
    }
    return parsePower();
  }

  /* ── Puissance ^ (associative à droite, autorise 2 ^ -3) ── */
  function parsePower() {
    const base = parsePrimary();
    const t = peek();
    if (t.type === 'op' && t.value === '^') {
      pos++;
      enter(t.pos);
      const exponent = parseUnary();
      leave();
      return makeNode({ type: 'binary', op: '^', left: base, right: exponent, pos: t.pos });
    }
    return base;
  }

  /* ── Atomes ── */
  function parsePrimary() {
    const t = next();

    if (t.type === 'num')  return makeNode({ type: 'number', value: t.value, pos: t.pos });
    if (t.type === 'str')  return makeNode({ type: 'string', value: t.value, pos: t.pos });
    if (t.type === 'bool') return makeNode({ type: 'boolean', value: t.value, pos: t.pos });
    if (t.type === 'null') return makeNode({ type: 'null', value: null, pos: t.pos });

    if (t.type === 'col') return makeNode(buildColumnNode(t.value, t.pos));

    if (t.type === 'name') {
      const after = peek();
      if (after.type === 'op' && after.value === '(') {
        return parseCall(t);
      }
      return makeNode(buildColumnNode(t.value, t.pos));
    }

    if (t.type === 'op' && t.value === '(') {
      enter(t.pos);
      const inner = parseExpression();
      leave();
      expectOp(')', 'Il manque une parenthèse fermante « ) »');
      return inner;
    }

    if (t.type === 'eof') {
      throw new FormulaError('Formule incomplète : il manque une valeur à la fin.', t.pos);
    }
    throw new FormulaError('Valeur attendue, trouvé ' + describeToken(t) + '.', t.pos);
  }

  /* ── Référence de colonne : validée MAINTENANT, pas à l'exécution ── */
  function buildColumnNode(rawName, posIdx) {
    const canonical = columnIndex.resolve(rawName);
    if (canonical === null) {
      const near = closestNames(rawName, columnIndex.names, 2);
      let msg = 'Colonne inconnue : "' + rawName + '".';
      if (near.length) msg += ' Colonnes proches : ' + quoteList(near);
      else if (columnIndex.names.length) msg += ' Écris le nom exact entre crochets, ex. [' + columnIndex.names[0] + '].';
      throw new FormulaError(msg, posIdx);
    }
    return { type: 'column', name: canonical, colType: columnIndex.typeOf(canonical), pos: posIdx };
  }

  /* ── Appel de fonction : allowlist stricte ── */
  function parseCall(nameToken) {
    const typed = String(nameToken.value).toUpperCase();
    const upper = Object.prototype.hasOwnProperty.call(FUNCTION_ALIASES, typed)
      ? FUNCTION_ALIASES[typed]
      : typed;
    const spec  = Object.prototype.hasOwnProperty.call(FUNCTIONS, upper) ? FUNCTIONS[upper] : null;
    if (!spec) {
      const near = closestNames(upper, FUNCTION_NAMES, 2);
      let msg = 'Fonction inconnue : "' + nameToken.value + '".';
      if (near.length) msg += ' Fonctions proches : ' + quoteList(near);
      else msg += ' Consulte la liste des fonctions disponibles.';
      throw new FormulaError(msg, nameToken.pos);
    }

    expectOp('(', 'Il manque « ( » après ' + upper);
    enter(nameToken.pos);
    const args = [];
    if (!(peek().type === 'op' && peek().value === ')')) {
      for (;;) {
        args.push(parseExpression());
        const t = peek();
        if (t.type === 'op' && t.value === ',') { pos++; continue; }
        break;
      }
    }
    leave();
    expectOp(')', 'Il manque une parenthèse fermante « ) » pour ' + upper);

    // Arité
    if (args.length < spec.min || args.length > spec.max) {
      throw new FormulaError(
        upper + ' attend ' + arityText(spec) + ', mais reçoit ' + args.length + ' argument' +
        (args.length > 1 ? 's' : '') + '. Syntaxe : ' + spec.signature,
        nameToken.pos
      );
    }

    // Arguments littéraux contraints (unité de DATEDIFF, format de FORMATDATE) :
    // erreur de COMPILATION si la valeur écrite en dur n'est pas dans la liste.
    if (spec.literalArg && args.length > spec.literalArg.index) {
      const argNode = args[spec.literalArg.index];
      if (argNode.type === 'string') {
        const allowed = spec.literalArg.values;
        const given   = spec.literalArg.caseSensitive ? argNode.value : normalizeText(argNode.value);
        if (allowed.indexOf(given) < 0) {
          throw new FormulaError(
            upper + ' : ' + spec.literalArg.label + ' "' + argNode.value + '" inconnu. Valeurs acceptées : ' + quoteList(allowed) + '.',
            argNode.pos
          );
        }
      }
    }

    return makeNode({ type: 'call', name: upper, args, pos: nameToken.pos });
  }

  function parseAll() {
    if (peek().type === 'eof') {
      throw new FormulaError('Formule vide.', 0);
    }
    const ast = parseExpression();
    const t = peek();
    if (t.type !== 'eof') {
      throw new FormulaError('Élément en trop après la formule : ' + describeToken(t) + '.', t.pos);
    }
    return ast;
  }

  return { parseAll, nodeCount: () => nodes };
}

function arityText(spec) {
  if (spec.min === spec.max) return spec.min + ' argument' + (spec.min > 1 ? 's' : '');
  if (spec.max === Infinity) return 'au moins ' + spec.min + ' argument' + (spec.min > 1 ? 's' : '');
  return 'entre ' + spec.min + ' et ' + spec.max + ' arguments';
}

/* ════════════════════════════════════════════════════════════════════════
   INDEX DES COLONNES
   ════════════════════════════════════════════════════════════════════════ */

// Accepte ['CA','KM'] ou [{name:'CA', type:'number'}, …].
function buildColumnIndex(columnNames) {
  const names = [];
  const types = Object.create(null);
  const exact = Object.create(null);
  const loose = Object.create(null); // clé normalisée → nom canonique

  const list = Array.isArray(columnNames) ? columnNames : [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const name = (c && typeof c === 'object') ? c.name : c;
    if (typeof name !== 'string' || !name) continue;
    if (exact[name] !== undefined) continue;
    names.push(name);
    exact[name] = name;
    types[name] = (c && typeof c === 'object' && c.type) ? c.type : null;
    const key = normalizeText(name);
    if (loose[key] === undefined) loose[key] = name;
  }

  return {
    names,
    // Correspondance exacte, puis tolérante (casse / accents / espaces).
    resolve(raw) {
      if (exact[raw] !== undefined) return exact[raw];
      const key = normalizeText(raw);
      return loose[key] !== undefined ? loose[key] : null;
    },
    typeOf(name) {
      const t = types[name];
      return t === 'number' || t === 'date' || t === 'text' || t === 'bool' ? t : null;
    },
  };
}

/* ════════════════════════════════════════════════════════════════════════
   ÉVALUATEUR — parcourt l'AST, ne le transforme JAMAIS en chaîne
   ════════════════════════════════════════════════════════════════════════ */

// Une valeur de cellule doit rester un scalaire : tout objet (y compris un
// prototype récupéré par une clé exotique) est ramené à null.
function readCell(row, name) {
  if (row === null || row === undefined) return null;
  const v = row[name];
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  return null;
}

function evalNode(node, row, ctx) {
  switch (node.type) {
    case 'number':
    case 'string':
    case 'boolean':
      return node.value;
    case 'null':
      return null;

    case 'column':
      return readCell(row, node.name);

    case 'unary': {
      const v = evalNode(node.operand, row, ctx);
      if (node.op === '-') {
        const n = toNumber(v);
        return n === null ? null : -n;
      }
      const b = toBool(v);
      return b === null ? null : !b;
    }

    case 'binary':
      return evalBinary(node, row, ctx);

    case 'ternary': {
      const cond = toBool(evalNode(node.cond, row, ctx));
      return evalNode(cond === true ? node.whenTrue : node.whenFalse, row, ctx);
    }

    case 'call':
      return evalCall(node, row, ctx);

    default:
      return null;
  }
}

function evalBinary(node, row, ctx) {
  const op = node.op;

  // Court-circuit logique
  if (op === '&&') {
    const left = toBool(evalNode(node.left, row, ctx));
    if (left !== true) return false;
    return toBool(evalNode(node.right, row, ctx)) === true;
  }
  if (op === '||') {
    const left = toBool(evalNode(node.left, row, ctx));
    if (left === true) return true;
    return toBool(evalNode(node.right, row, ctx)) === true;
  }

  const a = evalNode(node.left, row, ctx);
  const b = evalNode(node.right, row, ctx);

  switch (op) {
    case '&':
      return toTextOrEmpty(a) + toTextOrEmpty(b);

    case '==': return valuesEqual(a, b, ctx);
    case '!=':
    case '<>': return !valuesEqual(a, b, ctx);

    case '<': case '<=': case '>': case '>=': {
      const cmp = compareValues(a, b, ctx);
      if (cmp === null) return null;
      if (op === '<')  return cmp < 0;
      if (op === '<=') return cmp <= 0;
      if (op === '>')  return cmp > 0;
      return cmp >= 0;
    }

    default: {
      const x = toNumber(a), y = toNumber(b);
      if (x === null || y === null) return null;
      let r;
      switch (op) {
        case '+': r = x + y; break;
        case '-': r = x - y; break;
        case '*': r = x * y; break;
        case '/': if (y === 0) return null; r = x / y; break;      // division par zéro → vide
        case '%': if (y === 0) return null; r = ((x % y) + y) % y; break;
        case '^': r = Math.pow(x, y); break;
        default:  return null;
      }
      return Number.isFinite(r) ? r : null;
    }
  }
}

function evalCall(node, row, ctx) {
  const name = node.name;
  const args = node.args;

  // Formes paresseuses : on n'évalue que ce qui est nécessaire.
  switch (name) {
    case 'IF': {
      const cond = toBool(evalNode(args[0], row, ctx));
      return evalNode(cond === true ? args[1] : args[2], row, ctx);
    }
    case 'AND': {
      for (let i = 0; i < args.length; i++) {
        if (toBool(evalNode(args[i], row, ctx)) !== true) return false;
      }
      return true;
    }
    case 'OR': {
      for (let i = 0; i < args.length; i++) {
        if (toBool(evalNode(args[i], row, ctx)) === true) return true;
      }
      return false;
    }
    case 'COALESCE': {
      for (let i = 0; i < args.length; i++) {
        const v = evalNode(args[i], row, ctx);
        if (!isBlank(v)) return v;
      }
      return null;
    }
    default: break;
  }

  const spec = FUNCTIONS[name];
  if (!spec || !spec.impl) return null;

  const n = args.length;
  const values = new Array(n);
  for (let i = 0; i < n; i++) values[i] = evalNode(args[i], row, ctx);
  const out = spec.impl(values, ctx);
  return out === undefined || (typeof out === 'number' && !Number.isFinite(out)) ? null : out;
}

/* ════════════════════════════════════════════════════════════════════════
   ANALYSES SUR L'AST : profondeur, colonnes, type, description
   ════════════════════════════════════════════════════════════════════════ */

function childrenOf(node) {
  switch (node.type) {
    case 'unary':   return [node.operand];
    case 'binary':  return [node.left, node.right];
    case 'ternary': return [node.cond, node.whenTrue, node.whenFalse];
    case 'call':    return node.args;
    default:        return null;
  }
}

function astDepth(node) {
  const kids = childrenOf(node);
  if (!kids || !kids.length) return 1;
  let best = 0;
  for (let i = 0; i < kids.length; i++) {
    const d = astDepth(kids[i]);
    if (d > best) best = d;
  }
  return best + 1;
}

function collectColumns(node, out, seen) {
  if (node.type === 'column') {
    if (!seen[node.name]) { seen[node.name] = true; out.push(node.name); }
    return;
  }
  const kids = childrenOf(node);
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) collectColumns(kids[i], out, seen);
}

const COMPARISON_OPS = ['==', '!=', '<>', '<', '<=', '>', '>='];

/**
 * Type inféré de l'expression : 'number' | 'text' | 'date' | 'bool'.
 * Sert à l'app pour typer la colonne créée (format d'affichage, agrégations).
 */
export function inferType(ast) {
  if (!ast || typeof ast !== 'object') return 'text';
  switch (ast.type) {
    case 'number':  return 'number';
    case 'string':  return 'text';
    case 'boolean': return 'bool';
    case 'null':    return 'text';

    case 'column':
      return ast.colType === 'number' || ast.colType === 'date' || ast.colType === 'bool'
        ? ast.colType : 'text';

    case 'unary':
      return ast.op === '-' ? 'number' : 'bool';

    case 'binary':
      if (ast.op === '&') return 'text';
      if (ast.op === '||' || ast.op === '&&') return 'bool';
      if (COMPARISON_OPS.indexOf(ast.op) >= 0) return 'bool';
      return 'number';

    case 'ternary': {
      const a = inferType(ast.whenTrue), b = inferType(ast.whenFalse);
      return a === b ? a : 'text';
    }

    case 'call': {
      const spec = FUNCTIONS[ast.name];
      if (!spec) return 'text';
      if (spec.returns !== 'derived') return spec.returns;
      // IF / COALESCE : type des branches si elles s'accordent
      const branches = ast.name === 'IF' ? [ast.args[1], ast.args[2]] : ast.args;
      let type = null;
      for (let i = 0; i < branches.length; i++) {
        if (!branches[i]) continue;
        if (branches[i].type === 'null') continue;
        const t = inferType(branches[i]);
        if (type === null) type = t;
        else if (type !== t) return 'text';
      }
      return type || 'text';
    }

    default: return 'text';
  }
}

/* ── describe() : reconstitution lisible et normalisée ── */

function nodePrecedence(node) {
  switch (node.type) {
    case 'ternary': return PREC_TERNARY;
    case 'binary':  return node.op === '^' ? PREC_POWER : BINARY_PRECEDENCE[node.op];
    case 'unary':   return PREC_UNARY;
    default:        return PREC_ATOM;
  }
}

function quoteTextLiteral(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function describeNode(node, parentPrecedence) {
  let out;
  let prec = nodePrecedence(node);

  switch (node.type) {
    case 'number':  out = numberToText(node.value); break;
    case 'string':  out = quoteTextLiteral(node.value); break;
    case 'boolean': out = node.value ? 'true' : 'false'; break;
    case 'null':    out = 'null'; break;
    case 'column':  out = '[' + node.name + ']'; break;

    case 'unary':
      out = node.op + describeNode(node.operand, PREC_UNARY);
      break;

    case 'binary': {
      // ^ est associatif à droite : on protège la gauche, pas la droite.
      const isPower = node.op === '^';
      const left  = describeNode(node.left,  isPower ? prec + 1 : prec);
      const right = describeNode(node.right, isPower ? prec : prec + 1);
      out = left + ' ' + node.op + ' ' + right;
      break;
    }

    case 'ternary':
      out = describeNode(node.cond, PREC_TERNARY + 1) + ' ? ' +
            describeNode(node.whenTrue, PREC_TERNARY) + ' : ' +
            describeNode(node.whenFalse, PREC_TERNARY);
      break;

    case 'call': {
      const parts = [];
      for (let i = 0; i < node.args.length; i++) parts.push(describeNode(node.args[i], PREC_TERNARY));
      out = node.name + '(' + parts.join(', ') + ')';
      break;
    }

    default:
      out = '?';
  }

  if (prec < parentPrecedence && (node.type === 'binary' || node.type === 'ternary' || node.type === 'unary')) {
    return '(' + out + ')';
  }
  return out;
}

/**
 * Reconstitue une chaîne lisible et normalisée à partir de l'AST
 * (parenthèses minimales, fonctions en majuscules, colonnes entre crochets).
 */
export function describe(ast) {
  if (!ast || typeof ast !== 'object') return '';
  try {
    return describeNode(ast, PREC_TERNARY);
  } catch (e) {
    return '';
  }
}

/* ════════════════════════════════════════════════════════════════════════
   COMPILATION
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Compile une formule.
 *
 * @param {string} source        texte de la formule (max 2000 caractères)
 * @param {Array}  columnNames   ['CA','KM'] ou [{name, type}, …]
 * @returns {{ok:true, ast, columns:string[], type:string, normalized:string,
 *            evaluate:(row:Object, helpers?:{parseDateValue?:Function})=>*}}
 *        | {{ok:false, error:{message:string, position:number}}}
 *
 * evaluate() ne jette JAMAIS : toute anomalie renvoie null.
 */
export function compile(source, columnNames) {
  // ── Validations d'entrée ──
  if (typeof source !== 'string') {
    return { ok: false, error: { message: 'Formule vide : écris une expression, par exemple [CA] / [KM].', position: 0 } };
  }
  const text = source.trim();
  if (!text) {
    return { ok: false, error: { message: 'Formule vide : écris une expression, par exemple [CA] / [KM].', position: 0 } };
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    return {
      ok: false,
      error: {
        message: 'Formule trop longue (' + source.length + ' caractères, maximum ' + MAX_SOURCE_LENGTH + ').',
        position: MAX_SOURCE_LENGTH,
      },
    };
  }

  const columnIndex = buildColumnIndex(columnNames);

  let ast;
  try {
    const tokens = tokenize(source);
    ast = createParser(tokens, source, columnIndex).parseAll();

    // Garde-fou de profondeur, vérifié aussi sur l'arbre final.
    if (astDepth(ast) > MAX_DEPTH) {
      throw new FormulaError('Formule trop imbriquée (plus de ' + MAX_DEPTH + ' niveaux). Simplifie-la.', 0);
    }
  } catch (e) {
    if (e instanceof FormulaError) {
      return { ok: false, error: { message: e.message, position: e.position } };
    }
    // Filet de sécurité : jamais d'exception non maîtrisée vers l'appelant.
    return { ok: false, error: { message: 'Formule invalide.', position: 0 } };
  }

  const columns = [];
  collectColumns(ast, columns, Object.create(null));

  // Contexte unique réutilisé à chaque ligne : zéro allocation dans la boucle.
  const ctx = { parseDate: fallbackParseDate };
  let lastHelperFn = null;

  function evaluate(row, helpers) {
    try {
      const helperFn = helpers && typeof helpers.parseDateValue === 'function' ? helpers.parseDateValue : null;
      if (helperFn !== lastHelperFn) {
        lastHelperFn = helperFn;
        ctx.parseDate = helperFn || fallbackParseDate;
      }
      const v = evalNode(ast, row, ctx);
      if (v === undefined) return null;
      if (typeof v === 'number' && !Number.isFinite(v)) return null;
      return v;
    } catch (e) {
      // Une formule ne doit jamais casser le rendu d'un tableau de 100 000 lignes.
      return null;
    }
  }

  return {
    ok: true,
    ast,
    columns,
    type: inferType(ast),        // 'number' | 'text' | 'date' | 'bool'
    normalized: describe(ast),   // formule reformatée, prête à afficher
    evaluate,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   AIDE EN LIGNE (UI) ET GRAMMAIRE POUR LE PROMPT LLM
   ════════════════════════════════════════════════════════════════════════ */

const CATEGORY_ORDER = ['Maths', 'Logique', 'Texte', 'Dates', 'Conversion'];

/**
 * Catalogue des fonctions, en français, pour le panneau d'aide de l'UI.
 * [{name, signature, description, category, example}]
 */
export const FORMULA_FUNCTIONS = FUNCTION_NAMES
  .map(name => {
    const f = FUNCTIONS[name];
    return {
      name: f.name,
      signature: f.signature,
      description: f.description,
      category: f.category,
      example: f.example,
    };
  })
  .sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category), cb = CATEGORY_ORDER.indexOf(b.category);
    return ca - cb || a.name.localeCompare(b.name);
  });

function buildPromptGrammar() {
  const byCategory = {};
  for (let i = 0; i < FORMULA_FUNCTIONS.length; i++) {
    const f = FORMULA_FUNCTIONS[i];
    (byCategory[f.category] || (byCategory[f.category] = [])).push(f.signature);
  }
  const blocks = CATEGORY_ORDER
    .filter(c => byCategory[c])
    .map(c => '- ' + c + ' : ' + byCategory[c].join(' · '));

  return [
    'LANGAGE DE FORMULE FLOWPILOT (ce n\'est PAS du JavaScript).',
    'Réponds uniquement par UNE expression dans ce langage. Jamais de "r =>", jamais de code,',
    'jamais de point (.), jamais d\'accolades, jamais d\'appel à autre chose que les fonctions listées.',
    '',
    'RÉFÉRENCES',
    '- Une colonne s\'écrit entre crochets : [Nom de colonne] (les accents et espaces sont autorisés).',
    '- Un nom sans espace ni accent peut s\'écrire nu : CA.',
    '',
    'LITTÉRAUX',
    '- Nombres : 12, 3.5, -2 (point décimal, jamais de virgule).',
    '- Textes : "livré" ou \'livré\'.',
    '- Booléens et vide : true, false, null.',
    '',
    'OPÉRATEURS (du moins prioritaire au plus prioritaire)',
    '- || (ou)  puis  && (et)',
    '- comparaisons : == != <> < <= > >=',
    '- & (concaténation de textes)',
    '- + -   puis   * / %   puis   - unaire et !   puis   ^ (puissance)',
    '- Test conditionnel : condition ? valeur_si_vrai : valeur_si_faux',
    '- Parenthèses autorisées.',
    '',
    'FONCTIONS AUTORISÉES (aucune autre n\'existe ; noms insensibles à la casse)',
  ].concat(blocks).concat([
    '',
    'RÈGLES',
    '- DATEDIFF(date1, date2, unité) renvoie date1 − date2 ; unité = "day" (défaut), "week", "month" ou "year".',
    '- FORMATDATE n\'accepte que "YYYY-MM-DD", "YYYY-MM", "DD/MM/YYYY", "MM/YYYY", "YYYY".',
    '- Une division par zéro ou une valeur illisible renvoie automatiquement un vide : inutile de la tester,',
    '  sauf si tu veux une valeur de repli (utilise alors IF ou COALESCE).',
    '- Maximum 2000 caractères, 500 éléments, 100 niveaux d\'imbrication.',
    '',
    'EXEMPLES',
    '- [CA] / [KM]',
    '- ROUND([CA] * 1.2, 2)',
    '- IF([Marge] > 0, "positif", "négatif")',
    '- DATEDIFF([Date livraison], [Date chargement], "day")',
    '- UPPER(TRIM([Transporteur])) & " - " & TEXT([Tonnage])',
    '- IF(ISBLANK([Date livraison]), "en cours", FORMATDATE([Date livraison], "DD/MM/YYYY"))',
  ]).join('\n');
}

/**
 * Grammaire à injecter dans le prompt envoyé au LLM, pour qu'il génère ce
 * langage au lieu de JavaScript.
 */
export const PROMPT_GRAMMAR = buildPromptGrammar();

/* Limites exposées pour l'UI (compteur de caractères, messages d'aide). */
export const FORMULA_LIMITS = {
  maxSourceLength: MAX_SOURCE_LENGTH,
  maxNodes: MAX_NODES,
  maxDepth: MAX_DEPTH,
};
