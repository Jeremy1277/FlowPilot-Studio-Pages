/**
 * FlowPilot Studio — Assistant de recommandation de widget (recommend.js)
 *
 * POURQUOI CE FICHIER
 * Le bouton « Analyse automatique » produisait un tableau de bord d'un bloc,
 * sans que l'utilisateur sache pourquoi tel graphique plutôt que tel autre.
 * Quand le résultat ne lui convenait pas, il n'avait rien à corriger : il
 * recommençait. On remplace ce coup de dé par un assistant guidé en trois
 * questions — quoi mesurer, comment le répartir, sur quelle période — qui
 * explique sa recommandation dans les mots du métier.
 *
 * PÉRIMÈTRE
 * Moteur PUR et 100 % LOCAL : aucun `import`, aucune globale, aucun accès au
 * DOM, aucun `fetch`, aucune IA distante. Les données ne sortent jamais du
 * navigateur. Tout entre par paramètre, tout sort par valeur de retour.
 * Déterministe : pas de `Math.random`, pas de `Date.now()` (la date de
 * référence, quand il en faut une, est un paramètre de l'appelant).
 * Aucune exception ne franchit la frontière du module : chaque export est
 * protégé et renvoie une valeur exploitable même sur entrées dégradées
 * (colonnes vides, lignes vides, `fieldModels` absent, colonne 100 % nulle).
 *
 * CE QUE LE MODULE NE FAIT PAS
 * Il ne lit ni ne modifie l'état de l'app, ne crée pas de widget, ne rend rien.
 * Il produit des DESCRIPTIONS (options de questions, recommandation, objet de
 * configuration) que `index.html` applique. Le rendu, les couleurs, les
 * identifiants de widget et l'insertion dans la grille restent à l'appelant.
 *
 * MODÈLE DE DONNÉES ATTENDU (celui de l'app, repris tel quel)
 *   columns     : [{ name, type:'text'|'number'|'date', label? }]
 *   fieldModels : { [colName]: { role, businessType, label, defaultAgg, icon } }
 *                 tel que produit par `classifyColumn()`. Peut être absent :
 *                 le module retombe alors sur une classification minimale
 *                 déduite de `type` et du libellé (voir `resolveModel`).
 *   stats       : { [colName]: { distinct, nullCount, min, max, sample } }
 *                 tel que produit par `computeColumnStats()` ci-dessous.
 *                 Peut porter en plus `periodPresets` et `labels` (voir infra).
 *
 * CONFIGURATION PRODUITE
 * `recommendWidget().config` est un objet de PROPRIÉTÉS DE WIDGET de l'app,
 * directement applicable : `{type, col, col2, aggr, kpiCol, aggrKpi, barTopN,
 * tableCols, period, …}`. Les conventions sont celles d'`index.html` :
 *   - `col`  = colonne de regroupement (axe des abscisses, lieu, période)
 *   - `col2` = colonne de valeur ; vide + `aggr:'count'` = comptage de lignes
 *   - `kpiCol` / `aggrKpi` pour le KPI, `tableCols` pour le tableau
 * La granularité d'une date n'est PAS une propriété de widget dans l'app : elle
 * vit dans `colDateFormats[col]`. Elle est donc renvoyée à part, dans
 * `result.dateGrain`, à charge de l'appelant de l'appliquer.
 *
 * BRANCHEMENT (à faire dans index.html, hors de ce fichier)
 *   import { buildFlow, recommendWidget, computeColumnStats,
 *            rankMeasures, rankDimensions } from './widgets/recommend.js';
 *   window.FP_buildFlow = buildFlow; // etc.
 *
 * Convention du dépôt : commentaires et libellés en français, identifiants en
 * anglais.
 */

/* ════════════════════════════════════════════════════════════════════════
   SEUILS — chaque valeur est une décision, pas un réglage au hasard
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Échantillon maximal pour les statistiques de colonnes. 2 000 lignes se
 * parcourent en quelques millisecondes ; un fichier transport de 300 000 lignes
 * bloquerait l'onglet une seconde entière à chaque frappe dans l'assistant.
 * On préfère une approximation instantanée à une exactitude qui fige l'écran —
 * l'assistant sert à CHOISIR un widget, le widget lui recalcule tout, exact.
 */
const STATS_SAMPLE_SIZE = 2000;

/**
 * Au-delà de 8 parts, un camembert n'est plus lisible (la palette de l'app
 * compte 10 couleurs, dont les dernières se ressemblent à l'œil) et un
 * histogramme reste confortable jusque-là sans étiquettes penchées.
 * 8 est donc la frontière « je vois tout d'un coup ».
 */
const CARD_LOW_MAX = 8;

/**
 * Jusqu'à 25 barres tiennent encore dans une carte large : on lit un classement,
 * pas des valeurs individuelles. Au-delà, l'œil ne compare plus rien et le
 * tableau — triable, cherchable, exhaustif — devient l'outil honnête.
 */
const CARD_MID_MAX = 25;

/**
 * Un camembert dit « ces parts forment un tout ». Au-delà de 6 parts, les
 * petites tranches deviennent des filets illisibles : on garde le camembert en
 * ALTERNATIVE seulement en dessous de ce seuil, jamais en recommandation.
 */
const DONUT_MAX_SLICES = 6;

/**
 * Une courbe raconte une tendance ; il lui faut de la matière. À 3, 5 ou 8
 * points, on voit des segments, pas une évolution — et l'histogramme compare
 * mieux des périodes qu'on peut encore nommer une à une.
 */
const FEW_PERIODS_MAX = 8;

/**
 * Top N par défaut quand la dimension est trop riche pour tout afficher.
 * 10 est le format de lecture usuel d'un classement métier (« mes 10 premiers
 * clients ») et tient sans étiquettes tronquées.
 */
const DEFAULT_TOP_N = 10;

/**
 * Types métier qu'il est pertinent de COMPTER en valeurs distinctes.
 * Volontairement restrictif : la liste des mesures proposées doit tenir en un
 * regard. Un code postal, un statut ou une ville sont des façons de découper,
 * pas des choses qu'on dénombre pour piloter.
 */
const COUNTABLE_ENTITIES = new Set(['client', 'carrier', 'vehicle', 'identifier']);

/**
 * Une colonne dont presque chaque ligne porte une valeur différente n'est pas
 * une dimension : c'est une référence. 90 % de valeurs distinctes sur au moins
 * 20 valeurs observées — la borne basse évite de traiter « 3 lignes, 3 valeurs »
 * comme un numéro de commande.
 */
const IDENTIFIER_DISTINCT_RATIO = 0.9;
const IDENTIFIER_MIN_DISTINCT = 20;

/**
 * Au-delà de 12 options, une liste de boutons devient un mur : on bascule sur
 * les 8 plus pertinentes + une recherche. 8 remplit un écran de téléphone sans
 * défilement, 12 est la limite haute d'un choix qu'on embrasse d'un regard.
 */
const MAX_OPTIONS_INLINE = 12;
const TOP_OPTIONS_COUNT = 8;

/**
 * Une colonne vide à plus de 60 % donne des graphiques pleins de trous ; on ne
 * l'interdit pas (parfois c'est justement le sujet), on la relègue avec une
 * raison affichée.
 */
const HIGH_NULL_RATIO = 0.6;

/* ── Vocabulaire ────────────────────────────────────────────────────────── */

const AGGR_LABELS = {
  sum: 'Somme', avg: 'Moyenne', age: 'Âge moyen', min: 'Minimum', max: 'Maximum',
  count: 'Nombre', countd: 'Distincts', std: 'Écart type', median: 'Médiane',
};

/** Types métier dont la nature est géographique (le widget carte sait les lire). */
const GEO_TYPES = ['country', 'city', 'postal_code'];

/**
 * Priorité métier des mesures. Un transporteur ouvre son fichier pour regarder
 * son chiffre d'affaires et sa marge — pas la longueur moyenne de ses remorques.
 * L'ordre alphabétique, lui, mettrait « Âge » avant « CA ».
 */
const MEASURE_PRIORITY = {
  revenue: 100, margin: 96, cost: 92, quantity: 78, weight: 74,
  distance: 70, delay: 64, rate: 60, length: 52, numeric_measure: 40,
};

/**
 * Priorité métier des dimensions à cardinalité comparable. « Par transporteur »
 * et « par client » sont les deux questions posées en premier dans ce métier.
 */
const DIMENSION_PRIORITY = {
  carrier: 10, client: 10, status: 6, vehicle: 5,
  country: 4, city: 3, postal_code: 2,
};

/**
 * Pluriels métier, pour écrire « 12 transporteurs » plutôt que « 12 valeurs
 * distinctes de la colonne Transporteur ». L'assistant parle à un exploitant,
 * pas à un analyste.
 */
const BUSINESS_PLURAL = {
  carrier: 'transporteurs', client: 'clients', country: 'pays', city: 'villes',
  postal_code: 'codes postaux', status: 'statuts', vehicle: 'véhicules',
  identifier: 'références', date: 'périodes',
};

/** Libellés de granularité, au pluriel, pour les phrases d'explication. */
const GRAIN_PLURAL = {
  day: 'jours', week: 'semaines', month: 'mois', quarter: 'trimestres', year: 'années',
};

/* ════════════════════════════════════════════════════════════════════════
   OUTILS INTERNES
   ════════════════════════════════════════════════════════════════════════ */

/** @returns {Array} le tableau tel quel, ou un tableau vide si l'entrée est douteuse. */
function safeArray(v) { return Array.isArray(v) ? v : []; }

/** @returns {Object} l'objet tel quel, ou un objet vide (jamais null, jamais un tableau). */
function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

/** PGCD, pour garantir qu'un pas d'échantillonnage visite bien toutes les lignes. */
function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) { const t = x % y; x = y; y = t; }
  return x;
}

/**
 * Pas d'échantillonnage : le nombre d'or (suite à faible discrépance, elle
 * répartit les tirages sans jamais retomber sur un cycle du fichier), ramené au
 * premier entier premier avec `total` pour que `(i × k) mod total` ne repasse
 * jamais deux fois sur la même ligne avant d'avoir tout parcouru.
 */
function coprimeStride(total) {
  if (total < 3) return 1;
  let k = Math.max(1, Math.round(total * 0.6180339887498949));
  let guard = 0;
  while (gcd(k, total) !== 1 && guard < 1000) { k++; guard++; if (k >= total) k = 1; }
  return gcd(k, total) === 1 ? k : 1;
}

/** Nombre fini, sinon `fallback`. */
function num(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Mise en forme française d'un entier : espace fine insécable comme séparateur
 * de milliers. Implémentée à la main plutôt que via `toLocaleString`, dont le
 * résultat dépend de l'environnement — le module doit être déterministe.
 */
function frInt(n) {
  const v = Math.round(num(n, 0));
  const s = String(Math.abs(v));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return (v < 0 ? '−' : '') + out;
}

/**
 * Normalisation d'un nom de colonne pour la reconnaissance par mots-clés.
 * Même traitement que `normalizeFieldName()` d'index.html : accents retirés,
 * minuscules, ponctuation ramenée à des espaces.
 */
function normalizeName(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[._\-\/()[\]€$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Libellé affichable d'une colonne : alias fourni, sinon libellé, sinon nom brut. */
function labelOf(colName, columns, labels) {
  if (colName == null) return '';
  const alias = safeObject(labels)[colName];
  if (typeof alias === 'string' && alias.trim()) return alias;
  const col = safeArray(columns).find((c) => c && c.name === colName);
  if (col && typeof col.label === 'string' && col.label.trim()) return col.label;
  return String(colName);
}

/**
 * Classification de repli, utilisée UNIQUEMENT quand `fieldModels` est absent
 * ou incomplet. Volontairement pauvre : la vraie intelligence métier vit dans
 * `BUSINESS_RULES` / `classifyColumn()` d'index.html, ce module ne la duplique
 * pas (deux tables de mots-clés finissent toujours par diverger). On se limite
 * à ce qui empêche l'assistant de dire une bêtise : date, géo, référence.
 */
function fallbackModel(col) {
  const name = normalizeName(col && col.name);
  const type = (col && col.type) || 'text';
  if (/(^| )(pays|country)( |$)/.test(name)) return { role: 'dimension', businessType: 'country', label: 'Pays', defaultAgg: 'none' };
  if (/(^| )(ville|city|localite)( |$)/.test(name)) return { role: 'dimension', businessType: 'city', label: 'Ville', defaultAgg: 'none' };
  if (/(^| )(cp|code postal|postal|zip|postcode)( |$)/.test(name)) return { role: 'dimension', businessType: 'postal_code', label: 'Code postal', defaultAgg: 'none' };
  if (type === 'date' || /(^| )(date|jour|mois|annee)( |$)/.test(name)) return { role: 'date', businessType: 'date', label: 'Date', defaultAgg: 'none' };
  if (/(^| )(id|n|no|num|numero|ordre|order|commande|cmd|ref|reference)( |$)/.test(name)) return { role: 'identifier', businessType: 'identifier', label: 'Identifiant', defaultAgg: 'none' };
  if (type === 'number') return { role: 'measure', businessType: 'numeric_measure', label: 'Mesure numérique', defaultAgg: 'sum' };
  return { role: 'dimension', businessType: 'dimension', label: 'Dimension texte', defaultAgg: 'none' };
}

/** Modèle métier d'une colonne : celui de l'app s'il existe, sinon le repli. */
function resolveModel(col, fieldModels) {
  const fm = safeObject(fieldModels)[col && col.name];
  if (fm && typeof fm === 'object' && fm.role) return fm;
  return fallbackModel(col);
}

/** Statistiques d'une colonne, avec des valeurs neutres si elles manquent. */
function resolveStats(colName, stats) {
  const s = safeObject(safeObject(stats)[colName]);
  return {
    distinct: num(s.distinct, null),
    nullCount: num(s.nullCount, 0),
    count: num(s.count, null),
    sampledRows: num(s.sampledRows, null),
    totalRows: num(s.totalRows, null),
    min: s.min === undefined ? null : s.min,
    max: s.max === undefined ? null : s.max,
    sample: safeArray(s.sample),
    // Une colonne 100 % vide n'est pas « une colonne à une seule valeur » : la
    // distinction change la phrase affichée, donc on la recalcule si l'appelant
    // a fourni des statistiques partielles.
    allNull: s.allNull === true || (num(s.count, null) === 0 && num(s.sampledRows, 0) > 0),
  };
}

/**
 * Nom commun pluriel pour parler d'une dimension dans une phrase.
 * « 12 transporteurs » si on connaît le métier, « 12 valeurs de "Zone" » sinon.
 */
function pluralFor(businessType, label) {
  const p = BUSINESS_PLURAL[businessType];
  if (p) return p;
  return 'valeurs différentes de « ' + label + ' »';
}

/* ════════════════════════════════════════════════════════════════════════
   1. STATISTIQUES DE COLONNES
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Calcule des statistiques par colonne sur un ÉCHANTILLON BORNÉ.
 *
 * APPROXIMATION ASSUMÉE — à lire avant d'utiliser les valeurs renvoyées.
 * Au-delà de `sampleSize` lignes (2 000 par défaut), l'échantillon est prélevé
 * à pas constant sur tout le fichier (1 ligne sur N, jamais les N premières :
 * un fichier trié par date donnerait sinon un `max` faux). Conséquences :
 *   - `distinct` est un MINORANT : 400 clients répartis sur 100 000 lignes
 *     peuvent n'en montrer que 380 dans l'échantillon ;
 *   - `nullCount` compte les vides DANS L'ÉCHANTILLON, pas dans le fichier ;
 *     utiliser `nullCount / sampledRows` comme taux ;
 *   - `min` / `max` sont ceux des lignes vues, donc potentiellement à
 *     l'intérieur des vraies bornes.
 * C'est suffisant pour CHOISIR un widget (les seuils utilisés sont 8, 25, 90 %,
 * jamais des valeurs exactes) et jamais utilisé pour afficher un chiffre à
 * l'utilisateur — les widgets, eux, recalculent sur la totalité des lignes.
 * Le drapeau `approx` vaut `true` dès qu'un échantillonnage a eu lieu.
 *
 * @param {Array<Object>} rows        Lignes du jeu de données (non modifiées).
 * @param {Array<{name:string,type?:string}>} columns Colonnes à analyser.
 * @param {{sampleSize?:number, maxSampleValues?:number}} [opts]
 * @returns {Object<string, {distinct:number, nullCount:number, min:*, max:*,
 *   sample:Array, count:number, sampledRows:number, totalRows:number,
 *   distinctRatio:number, approx:boolean, allNull:boolean, type:string}>}
 *   Un objet vide si les entrées sont inexploitables — jamais d'exception.
 */
export function computeColumnStats(rows, columns, opts) {
  const out = {};
  try {
    const list = safeArray(rows);
    const cols = safeArray(columns).filter((c) => c && c.name != null);
    if (!cols.length) return out;

    const o = safeObject(opts);
    const sampleSize = Math.max(1, num(o.sampleSize, STATS_SAMPLE_SIZE));
    const maxSampleValues = Math.max(1, num(o.maxSampleValues, 5));

    const total = list.length;
    const approx = total > sampleSize;
    // CHOIX DES LIGNES ÉCHANTILLONNÉES
    // Ni les N premières (un fichier trié par date donnerait un `max` faux), ni
    // un pas constant : les exports d'exploitation sont souvent cycliques
    // (une ligne par transporteur, tournée après tournée), et un pas de 100 sur
    // un cycle de 12 ne verrait jamais que 3 transporteurs sur 12. On avance
    // donc d'un pas issu du nombre d'or, rendu premier avec le nombre de lignes
    // pour que la suite `(i × k) mod total` visite des lignes toutes
    // différentes, réparties sur tout le fichier et sans résonance avec un
    // cycle du fichier. Déterministe : même fichier, mêmes lignes tirées.
    const stride = approx ? coprimeStride(total) : 1;

    // Un seul balayage pour toutes les colonnes : on ne relit pas les lignes
    // une fois par colonne (60 colonnes × 2 000 lignes = 120 000 lectures,
    // contre 2 000 itérations ici).
    const acc = cols.map((c) => ({
      name: c.name,
      type: c.type || '',
      set: new Set(),
      nullCount: 0,
      count: 0,
      min: null,
      max: null,
      numMin: null,
      numMax: null,
      sample: [],
    }));

    const passes = approx ? sampleSize : total;
    let sampled = 0;
    let cursor = 0;
    for (let p = 0; p < passes; p++) {
      const row = list[cursor];
      cursor = approx ? (cursor + stride) % total : cursor + 1;
      sampled++;
      if (!row || typeof row !== 'object') {
        for (let j = 0; j < acc.length; j++) acc[j].nullCount++;
        continue;
      }
      for (let j = 0; j < acc.length; j++) {
        const a = acc[j];
        const v = row[a.name];
        if (v === null || v === undefined || v === '') { a.nullCount++; continue; }
        a.count++;
        // La clé de distinction est la forme texte : c'est ce que fait
        // `groupByDim()` dans l'app, donc c'est ce que verra l'utilisateur.
        const key = v instanceof Date ? String(v.getTime()) : String(v);
        if (a.set.size < sampleSize) a.set.add(key);
        if (a.sample.length < maxSampleValues && !a.sample.some((x) => String(x) === String(v))) a.sample.push(v);

        if (v instanceof Date) {
          const t = v.getTime();
          if (Number.isFinite(t)) {
            if (a.min === null || t < a.min.getTime()) a.min = v;
            if (a.max === null || t > a.max.getTime()) a.max = v;
          }
        } else {
          const n = typeof v === 'number' ? v
            : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
          if (Number.isFinite(n)) {
            if (a.numMin === null || n < a.numMin) a.numMin = n;
            if (a.numMax === null || n > a.numMax) a.numMax = n;
          }
        }
      }
    }

    for (let j = 0; j < acc.length; j++) {
      const a = acc[j];
      const min = a.min !== null ? a.min : a.numMin;
      const max = a.max !== null ? a.max : a.numMax;
      out[a.name] = {
        distinct: a.set.size,
        nullCount: a.nullCount,
        count: a.count,
        min,
        max,
        sample: a.sample,
        sampledRows: sampled,
        totalRows: total,
        distinctRatio: a.count > 0 ? a.set.size / a.count : 0,
        allNull: a.count === 0,
        type: a.type,
        // `true` = les chiffres ci-dessus viennent d'un échantillon, pas du
        // fichier entier. Voir le bloc APPROXIMATION du JSDoc.
        approx,
      };
    }
    return out;
  } catch (e) {
    return out;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   2. CLASSEMENT DES MESURES
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Classe les colonnes mesurables par PERTINENCE MÉTIER, pas par ordre
 * alphabétique : dans un fichier transport, « CA » et « Marge » passent devant
 * « N° commande », même si celui-ci est numérique et arrive en premier dans le
 * fichier.
 *
 * L'entrée synthétique `{name:null, label:'Nombre de lignes', defaultAgg:'count'}`
 * est TOUJOURS placée en tête : compter est le besoin le plus fréquent
 * (« combien de transports le mois dernier ? »), ça marche même sur un fichier
 * sans une seule colonne numérique, et ça ne dépend d'aucune colonne.
 *
 * @param {Array<{name:string,type?:string}>} columns
 * @param {Object} [fieldModels]  Modèles métier de l'app (facultatif).
 * @param {Object} [stats]        Sortie de `computeColumnStats` (facultatif).
 *                                `stats.labels` peut porter les alias de colonnes.
 * @returns {Array<{name:?string,label:string,defaultAgg:string,businessType:string,
 *   score:number,reason:string,icon:string,nullRatio:number}>}
 */
export function rankMeasures(columns, fieldModels, stats) {
  try {
    const cols = safeArray(columns).filter((c) => c && c.name != null);
    const labels = safeObject(stats).labels;

    const countEntry = {
      name: null,
      label: 'Nombre de lignes',
      defaultAgg: 'count',
      businessType: 'row_count',
      icon: '#',
      score: 100,
      nullRatio: 0,
      reason: 'Compter les lignes marche toujours, même sans colonne de montant.',
    };

    const scored = [];
    cols.forEach((col, index) => {
      const model = resolveModel(col, fieldModels);
      const st = resolveStats(col.name, stats);
      const label = labelOf(col.name, cols, labels);
      const bt = model.businessType || 'dimension';
      const isNumeric = col.type === 'number' || MEASURE_PRIORITY[bt] !== undefined;

      let score = null;
      let reason = '';
      let agg = model.defaultAgg && model.defaultAgg !== 'none' ? model.defaultAgg : 'sum';

      if (model.role === 'measure' || (isNumeric && model.role !== 'date' && model.role !== 'identifier')) {
        score = MEASURE_PRIORITY[bt] !== undefined ? MEASURE_PRIORITY[bt] : 35;
        reason = MEASURE_PRIORITY[bt] !== undefined && bt !== 'numeric_measure'
          ? 'Un montant de type « ' + (model.label || label) + ' » : c\'est ce qu\'on regarde en premier.'
          : 'Colonne de nombres : on peut en faire un total ou une moyenne.';
      } else if (model.role === 'identifier') {
        // Une référence ne s'additionne pas, mais la COMPTER en valeurs
        // distinctes répond à une vraie question métier : « combien de
        // commandes ? ». On la garde donc, loin derrière les montants.
        score = 20;
        agg = 'countd';
        reason = 'Une référence ne s\'additionne pas ; on peut en revanche compter combien il y en a de différentes.';
      } else if (model.role === 'dimension' && col.type !== 'number' && COUNTABLE_ENTITIES.has(bt)) {
        // « Combien de clients différents » est une vraie question de gestion.
        // « Combien de codes postaux différents » n'en est pas une : on ne
        // propose le comptage que sur des ENTITÉS, pas sur des attributs
        // géographiques, des statuts ou des libellés techniques. Un menu qui
        // propose tout ne guide plus personne.
        score = 12;
        agg = 'countd';
        reason = 'Compter combien de « ' + label + ' » différents apparaissent.';
      }

      if (score === null) return;

      const sampledRows = st.sampledRows || 0;
      const nullRatio = sampledRows > 0 ? st.nullCount / sampledRows : 0;

      // Pénalités : une colonne vide ou constante produit un graphique plat.
      // On ne la cache pas — parfois c'est le sujet — on la relègue en disant
      // pourquoi, ce qui vaut mieux qu'une liste où tout se vaut.
      if (st.allNull && sampledRows > 0) {
        score -= 90;
        reason = 'Cette colonne est vide : il n\'y a rien à mesurer.';
      } else if (st.distinct !== null && st.distinct <= 1 && sampledRows > 0) {
        score -= 40;
        reason = 'Toujours la même valeur : le graphique serait plat.';
      } else if (nullRatio > HIGH_NULL_RATIO) {
        score -= 25;
        reason = 'Souvent vide (' + Math.round(nullRatio * 100) + ' % des lignes) : le résultat sera partiel.';
      }

      scored.push({
        name: col.name,
        label,
        defaultAgg: agg,
        businessType: bt,
        icon: model.icon || '#',
        score,
        nullRatio,
        reason,
        _index: index,
      });
    });

    // Tri déterministe : score décroissant, puis ordre du fichier (jamais
    // alphabétique — l'ordre des colonnes porte du sens dans un export métier).
    scored.sort((a, b) => (b.score - a.score) || (a._index - b._index));
    return [countEntry].concat(scored.map((s) => {
      const { _index, ...rest } = s;
      return rest;
    }));
  } catch (e) {
    return [{
      name: null, label: 'Nombre de lignes', defaultAgg: 'count', businessType: 'row_count',
      icon: '#', score: 100, nullRatio: 0, reason: 'Compter les lignes marche toujours.',
    }];
  }
}

/* ════════════════════════════════════════════════════════════════════════
   3. CLASSEMENT DES DIMENSIONS
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Détermine la nature d'une colonne en tant qu'axe de répartition.
 * @returns {'text'|'date'|'geo'|'identifier'}
 */
function dimensionKindOf(model, st, colType) {
  const bt = model.businessType || '';
  if (GEO_TYPES.indexOf(bt) !== -1) return 'geo';
  if (model.role === 'date' || bt === 'date' || colType === 'date') return 'date';
  if (model.role === 'identifier' || bt === 'identifier') return 'identifier';
  // La détection par les valeurs ne s'applique PAS à une mesure : un poids en
  // kilos prend presque toujours une valeur différente à chaque ligne sans
  // être pour autant une référence. C'est une grandeur continue, ce qui se
  // traite plus bas (elle n'a simplement rien à faire en axe).
  if (model.role === 'measure') return 'text';
  // 800 valeurs différentes sur 800 lignes, c'est une référence, quel que soit
  // le nom de la colonne. Le libellé peut mentir (« Zone » qui contient un
  // numéro de dossier), les données non.
  if (st.distinct !== null && st.count > 0
      && st.distinct >= IDENTIFIER_MIN_DISTINCT
      && st.distinct / st.count >= IDENTIFIER_DISTINCT_RATIO) return 'identifier';
  return 'text';
}

/**
 * Classe les colonnes utilisables comme axe de répartition, de la plus
 * exploitable à la moins exploitable.
 *
 * Le critère décisif n'est pas le type mais la CARDINALITÉ : une colonne à
 * 800 valeurs différentes sur 800 lignes n'est pas une dimension, c'est un
 * identifiant — regroupé, il produit 800 barres d'une unité. Elle finit donc en
 * fin de liste, avec une raison affichable, plutôt que d'être proposée en
 * premier parce qu'elle est en tête du fichier.
 *
 * @param {Array<{name:string,type?:string}>} columns
 * @param {Object} [fieldModels]
 * @param {Object} [stats]  Sortie de `computeColumnStats` (+ `labels` facultatif).
 * @param {{includeDates?:boolean, includeIdentifiers?:boolean}} [opts]
 * @returns {Array<{name:string,label:string,cardinality:?number,
 *   kind:'text'|'date'|'geo'|'identifier',score:number,reason:string,
 *   businessType:string,icon:string,approx:boolean}>}
 */
export function rankDimensions(columns, fieldModels, stats, opts) {
  try {
    const cols = safeArray(columns).filter((c) => c && c.name != null);
    const o = safeObject(opts);
    const includeDates = o.includeDates !== false;
    const includeIdentifiers = o.includeIdentifiers !== false;
    const labels = safeObject(stats).labels;

    const scored = [];
    cols.forEach((col, index) => {
      const model = resolveModel(col, fieldModels);
      const st = resolveStats(col.name, stats);
      const label = labelOf(col.name, cols, labels);
      const kind = dimensionKindOf(model, st, col.type);
      const bt = model.businessType || 'dimension';

      if (kind === 'date' && !includeDates) return;
      if (kind === 'identifier' && !includeIdentifiers) return;
      // Une mesure continue ne sert pas d'axe : regrouper par « CA » produirait
      // une barre par montant. Seule exception, utile en exploitation : une
      // mesure qui ne prend que quelques valeurs entières (« nombre de
      // palettes » 1 à 5), qui se comporte alors comme une catégorie.
      if (model.role === 'measure' && kind === 'text'
          && !(st.distinct !== null && st.distinct > 1 && st.distinct <= CARD_LOW_MAX)) return;

      const card = st.distinct;
      const sampledRows = st.sampledRows || 0;
      const nullRatio = sampledRows > 0 ? st.nullCount / sampledRows : 0;
      let score;
      let reason;

      if (st.allNull && sampledRows > 0) {
        score = 1;
        reason = 'Cette colonne est vide : elle ne peut rien répartir.';
      } else if (kind === 'identifier') {
        // Volontairement au plancher : un identifiant en axe produit autant de
        // barres que de lignes. On l'affiche quand même, avec l'explication —
        // l'utilisateur qui le cherche comprend pourquoi ce n'est pas proposé.
        score = 5;
        reason = 'Presque chaque ligne a sa propre valeur : c\'est une référence, pas une catégorie.';
      } else if (kind === 'date') {
        score = 86;
        reason = 'Une date : elle permet de suivre l\'évolution dans le temps.';
      } else if (card === null) {
        score = 50;
        reason = 'Répartition possible, mais on ne connaît pas encore le nombre de valeurs.';
      } else if (card <= 1) {
        score = 3;
        reason = 'Une seule valeur dans tout le fichier : il n\'y a rien à comparer.';
      } else if (card <= CARD_LOW_MAX) {
        score = 92;
        reason = frInt(card) + ' ' + pluralFor(bt, label) + ' : tout tient dans un seul graphique.';
      } else if (card <= CARD_MID_MAX) {
        score = 82;
        reason = frInt(card) + ' ' + pluralFor(bt, label) + ' : lisible en classement.';
      } else if (card <= 100) {
        score = 58;
        reason = frInt(card) + ' ' + pluralFor(bt, label) + ' : trop pour un graphique, on en montrera les premiers.';
      } else {
        score = 38;
        reason = 'Beaucoup de valeurs différentes (' + frInt(card) + ') : un tableau sera plus lisible.';
      }

      // Un axe géographique mérite une carte : c'est le seul cas où la valeur
      // ajoutée du widget dépasse celle d'un simple classement.
      if (kind === 'geo' && score > 10) score += 6;
      if (score > 10) score += (DIMENSION_PRIORITY[bt] || 0);
      if (score > 10 && nullRatio > HIGH_NULL_RATIO) {
        score -= 20;
        reason = 'Souvent vide (' + Math.round(nullRatio * 100) + ' % des lignes) : une grosse part passera en « non renseigné ».';
      }

      scored.push({
        name: col.name,
        label,
        cardinality: card,
        kind,
        businessType: bt,
        icon: model.icon || 'T',
        score,
        reason,
        approx: !!safeObject(safeObject(stats)[col.name]).approx,
        _index: index,
      });
    });

    scored.sort((a, b) => (b.score - a.score) || (a._index - b._index));
    return scored.map((s) => { const { _index, ...rest } = s; return rest; });
  } catch (e) {
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════════════
   4. RECOMMANDATION DE WIDGET
   ════════════════════════════════════════════════════════════════════════ */

/** Base commune de configuration : mesure + agrégation + portée temporelle. */
function baseConfig(spec, type) {
  const cfg = { type };
  const measure = spec.measure || '';
  const aggr = spec.aggregation || (measure ? 'sum' : 'count');
  if (type === 'kpi') {
    // `computeKPI(col, 'count')` compte les valeurs non vides d'une colonne :
    // pour un comptage de lignes il faut donc une colonne de référence, la plus
    // remplie possible. L'appelant la fournit (`spec.countColumn`, calculée par
    // `buildFlow`) ; à défaut on retombe sur la dimension choisie.
    cfg.kpiCol = measure || spec.countColumn || spec.dimension || '';
    cfg.aggrKpi = aggr;
  } else {
    cfg.col = spec.dimension || '';
    cfg.col2 = measure;
    cfg.aggr = aggr;
  }
  const preset = spec.periodPreset;
  if (preset && preset !== 'all') {
    const dateCol = spec.dateColumn || (spec.dimensionKind === 'date' ? spec.dimension : null) || null;
    cfg.period = { preset, col: dateCol, from: '', to: '' };
  }
  return cfg;
}

/** Titre français par défaut, du genre « CA par transporteur ». */
function buildTitle(spec, type) {
  const m = spec.measureLabel || (spec.measure ? String(spec.measure) : 'Nombre de lignes');
  const d = spec.dimensionLabel || (spec.dimension ? String(spec.dimension) : '');
  if (!d) return m;
  if (spec.dimensionKind === 'date') return 'Évolution — ' + m;
  if (type === 'geo') return m + ' par ' + d + ' (carte)';
  return m + ' par ' + d;
}

/**
 * Le camembert affirme « ces parts forment un tout ». Ce n'est vrai que si les
 * valeurs s'ADDITIONNENT : une somme d'euros ou un comptage, oui ; une moyenne
 * de délais ou un taux de remplissage, non — additionner des moyennes ne veut
 * rien dire. Une marge peut par ailleurs être négative, et une part négative
 * n'existe pas dans un camembert.
 */
function donutMakesSense(spec) {
  const aggr = spec.aggregation || (spec.measure ? 'sum' : 'count');
  if (aggr !== 'sum' && aggr !== 'count') return false;
  const bt = spec.measureBusinessType || '';
  if (bt === 'margin' || bt === 'rate' || bt === 'delay') return false;
  if (spec.measureHasNegative === true) return false;
  const card = num(spec.cardinality, null);
  if (card === null) return false;
  return card >= 2 && card <= DONUT_MAX_SLICES;
}

/**
 * Recommande UN widget à partir des réponses de l'assistant, avec la raison en
 * français et des alternatives.
 *
 * Les règles encodées sont des conventions établies de visualisation, pas des
 * préférences : une mesure seule est un chiffre (KPI) ; le temps se lit en
 * courbe, sauf quand il y a trop peu de points pour qu'une courbe raconte
 * quelque chose ; comparer des catégories se fait en barres tant qu'on les
 * distingue ; au-delà, un tableau est plus honnête qu'un graphique illisible ;
 * un lieu se lit sur une carte ; une référence ne s'agrège pas.
 *
 * @param {{measure:?string, aggregation?:string, dimension:?string,
 *   dimensionKind?:'text'|'date'|'geo'|'identifier', cardinality?:?number,
 *   grain?:string, periodPreset?:string,
 *   measureLabel?:string, dimensionLabel?:string, measureBusinessType?:string,
 *   measureHasNegative?:boolean, dimensionBusinessType?:string,
 *   dateColumn?:string, countColumn?:string}} spec
 * @returns {{type:string, confidence:'haute'|'moyenne'|'basse', reason:string,
 *   alternatives:Array<{type:string,reason:string,config:Object}>,
 *   config:Object, dateGrain:?string, topN:?number}}
 */
export function recommendWidget(spec) {
  try {
    const s = safeObject(spec);
    const measure = s.measure || null;
    const dimension = s.dimension || null;
    const card = num(s.cardinality, null);
    const grain = s.grain || null;
    const measureLabel = s.measureLabel || (measure ? String(measure) : 'Nombre de lignes');
    const dimLabel = s.dimensionLabel || (dimension ? String(dimension) : '');
    const bt = s.dimensionBusinessType || '';
    const things = pluralFor(bt, dimLabel);
    const norm = {
      ...s,
      measure,
      dimension,
      measureLabel,
      dimensionLabel: dimLabel,
      aggregation: s.aggregation || (measure ? 'sum' : 'count'),
    };
    const kind = s.dimensionKind
      || (dimension ? 'text' : null);

    const make = (type, extra) => {
      const cfg = baseConfig(norm, type);
      Object.keys(safeObject(extra)).forEach((k) => { cfg[k] = extra[k]; });
      cfg.title = buildTitle(norm, type);
      return cfg;
    };

    const aggrLabel = (AGGR_LABELS[norm.aggregation] || 'Total').toLowerCase();

    /* ── Aucune répartition : un seul chiffre ─────────────────────────── */
    if (!dimension) {
      return {
        type: 'kpi',
        confidence: 'haute',
        reason: 'Un seul chiffre à retenir : ' + (measure ? aggrLabel + ' de « ' + measureLabel + ' »' : 'le nombre total de lignes') + '.',
        alternatives: [{
          type: 'table',
          reason: 'Pour voir le détail ligne par ligne plutôt que le total.',
          config: make('table', { tableCols: [measure].filter(Boolean), tableMode: 'auto' }),
        }],
        config: make('kpi'),
        dateGrain: null,
        topN: null,
      };
    }

    /* ── Un lieu : la carte avant tout ────────────────────────────────── */
    if (kind === 'geo') {
      return {
        type: 'geo',
        confidence: 'haute',
        reason: '« ' + dimLabel + ' » contient des lieux : la carte montre d\'un coup d\'œil où se concentre l\'activité.',
        alternatives: [{
          type: 'bar',
          reason: 'Pour classer les lieux du plus fort au plus faible, avec les chiffres exacts.',
          config: make('bar', { barTopN: card !== null && card > CARD_LOW_MAX ? DEFAULT_TOP_N : 0, barSort: 'value' }),
        }],
        config: make('geo', { geoScope: 'auto' }),
        dateGrain: null,
        topN: null,
      };
    }

    /* ── Une référence : agréger n'a pas de sens ──────────────────────── */
    if (kind === 'identifier') {
      return {
        type: 'table',
        confidence: 'haute',
        reason: '« ' + dimLabel + ' » identifie chaque ligne : regrouper dessus ne rassemble rien, chaque barre vaudrait une seule ligne. Le tableau, lui, se trie et se cherche.',
        alternatives: [{
          type: 'kpi',
          reason: 'Pour connaître simplement le nombre de références différentes.',
          config: (() => { const c = make('kpi'); c.kpiCol = dimension; c.aggrKpi = 'countd'; return c; })(),
        }],
        config: make('table', { tableCols: [dimension, measure].filter(Boolean), tableMode: 'auto' }),
        dateGrain: grain || null,
        topN: null,
      };
    }

    /* ── Une date : courbe, sauf trop peu de points ───────────────────── */
    if (kind === 'date') {
      const periods = GRAIN_PLURAL[grain] || 'périodes';
      if (card !== null && card <= FEW_PERIODS_MAX) {
        return {
          type: 'bar',
          confidence: card <= 2 ? 'moyenne' : 'haute',
          reason: 'Seulement ' + frInt(card) + ' ' + periods + ' : des barres se comparent mieux qu\'une courbe à ' + frInt(card) + ' points.',
          alternatives: [{
            type: 'line',
            reason: 'Si vous attendez d\'autres ' + periods + ' et souhaitez voir la tendance se dessiner.',
            config: make('line', { lineSortMode: 'label' }),
          }],
          config: make('bar', { barSort: 'label', barVariant: 'vertical' }),
          dateGrain: grain || null,
          topN: null,
        };
      }
      return {
        type: 'line',
        confidence: card === null ? 'moyenne' : 'haute',
        reason: card !== null
          ? frInt(card) + ' ' + periods + ' d\'historique : la courbe montre la tendance et les creux.'
          : 'Sur une date, la courbe montre la tendance et les creux.',
        alternatives: [
          {
            type: 'bar',
            reason: 'Pour comparer les ' + periods + ' un à un plutôt que suivre la tendance.',
            config: make('bar', { barSort: 'label', barVariant: 'vertical' }),
          },
          {
            type: 'kpi',
            reason: 'Pour ne garder que le total de la période, sans le détail.',
            config: make('kpi'),
          },
        ],
        config: make('line', { lineFill: false, lineSortMode: 'label' }),
        dateGrain: grain || null,
        topN: null,
      };
    }

    /* ── Une catégorie : tout dépend du nombre de valeurs ─────────────── */
    if (card === null) {
      // Cardinalité inconnue (statistiques absentes) : les barres limitées au
      // Top 10 restent lisibles quel que soit le nombre réel de valeurs.
      return {
        type: 'bar',
        confidence: 'basse',
        reason: 'On ne sait pas encore combien de « ' + dimLabel + ' » différents existent : on affiche les 10 premiers, à ajuster ensuite.',
        alternatives: [{
          type: 'table',
          reason: 'Pour tout voir sans limite d\'affichage.',
          config: make('table', { tableCols: [dimension, measure].filter(Boolean), tableMode: 'auto' }),
        }],
        config: make('bar', { barTopN: DEFAULT_TOP_N, barSort: 'value' }),
        dateGrain: null,
        topN: DEFAULT_TOP_N,
      };
    }

    if (card <= 1) {
      return {
        type: 'kpi',
        confidence: 'moyenne',
        reason: card <= 0
          ? '« ' + dimLabel + ' » est vide : il n\'y a rien à répartir, on affiche donc le total.'
          : '« ' + dimLabel + ' » ne contient qu\'une seule valeur : il n\'y a rien à comparer, autant afficher le total.',
        alternatives: [{
          type: 'bar',
          reason: 'Si d\'autres valeurs doivent arriver dans les prochains fichiers.',
          config: make('bar', { barSort: 'value' }),
        }],
        config: make('kpi'),
        dateGrain: null,
        topN: null,
      };
    }

    if (card <= CARD_LOW_MAX) {
      const alts = [];
      if (donutMakesSense(norm)) {
        alts.push({
          type: 'donut',
          reason: 'Les parts s\'additionnent pour former le total : le camembert montre le poids de chacun.',
          config: make('donut', {}),
        });
      }
      alts.push({
        type: 'table',
        reason: 'Pour lire les valeurs exactes, au chiffre près.',
        config: make('table', { tableCols: [dimension, measure].filter(Boolean), tableMode: 'auto' }),
      });
      return {
        type: 'bar',
        confidence: 'haute',
        reason: frInt(card) + ' ' + things + ', c\'est le bon nombre pour un histogramme.',
        alternatives: alts,
        config: make('bar', { barSort: 'value', barVariant: 'vertical' }),
        dateGrain: null,
        topN: null,
      };
    }

    if (card <= CARD_MID_MAX) {
      // Un Top N supérieur ou égal à la cardinalité ne retire rien : l'annoncer
      // serait mentir à l'utilisateur (« on garde les 10 premiers » sur 9 valeurs).
      const capped = card !== null && card > DEFAULT_TOP_N;
      return {
        type: 'bar',
        confidence: 'haute',
        reason: capped
          ? frInt(card) + ' ' + things + ' : on garde les ' + DEFAULT_TOP_N + ' premiers pour que les barres restent lisibles.'
          : frInt(card) + ' ' + things + ' : les barres restent lisibles, on les affiche toutes.',
        alternatives: [
          {
            type: 'bar',
            reason: capped
              ? 'Pour afficher les ' + frInt(card) + ' sans limite, en barres horizontales.'
              : 'En barres horizontales, si les noms sont longs.',
            config: make('bar', { barTopN: 0, barSort: 'value', barVariant: 'horizontal' }),
          },
          {
            type: 'table',
            reason: 'Pour tout voir et pouvoir trier soi-même.',
            config: make('table', { tableCols: [dimension, measure].filter(Boolean), tableMode: 'auto' }),
          },
        ],
        config: make('bar', { barTopN: capped ? DEFAULT_TOP_N : 0, barSort: 'value', barVariant: 'vertical' }),
        dateGrain: null,
        topN: capped ? DEFAULT_TOP_N : null,
      };
    }

    // Au-delà de 25 : un graphique deviendrait une haie de barres anonymes.
    return {
      type: 'table',
      confidence: 'haute',
      reason: frInt(card) + ' ' + things + ' : trop pour un graphique lisible. Le tableau se trie et se cherche, rien n\'est caché.',
      alternatives: [
        {
          type: 'bar',
          reason: 'Pour ne garder que le Top ' + DEFAULT_TOP_N + ' et voir tout de suite qui domine.',
          config: make('bar', { barTopN: DEFAULT_TOP_N, barSort: 'value', barVariant: 'horizontal' }),
        },
        {
          type: 'kpi',
          reason: 'Pour ne retenir que le total, sans le détail.',
          config: make('kpi'),
        },
      ],
      config: make('table', { tableCols: [dimension, measure].filter(Boolean), tableMode: 'auto' }),
      dateGrain: null,
      topN: null,
    };
  } catch (e) {
    // Dernier filet : un tableau est toujours affichable et ne ment jamais.
    return {
      type: 'table',
      confidence: 'basse',
      reason: 'Recommandation impossible avec ces informations : le tableau affiche les données telles quelles.',
      alternatives: [],
      config: { type: 'table', tableCols: [], tableMode: 'auto' },
      dateGrain: null,
      topN: null,
    };
  }
}

/* ════════════════════════════════════════════════════════════════════════
   5. DÉFINITION DÉCLARATIVE DU PARCOURS
   ════════════════════════════════════════════════════════════════════════ */

/** Valeurs réservées des options, pour éviter toute collision avec un nom de colonne. */
const OPT_COUNT = '__count__';
const OPT_NONE = '__none__';
const OPT_TIME = '__time__';

/**
 * Emballe une liste d'options en étape, en gérant le passage à l'échelle.
 * En dessous de 12 options on affiche tout ; au-delà on n'affiche que les 8
 * plus pertinentes et on active la recherche — un fichier à 60 colonnes doit
 * poser une question, pas dresser un mur.
 */
function makeStep(id, question, options, extra) {
  const all = safeArray(options);
  const overflow = all.length > MAX_OPTIONS_INLINE;
  const top = overflow ? all.slice(0, TOP_OPTIONS_COUNT) : all.slice();
  return {
    id,
    question,
    // `options` = ce qu'il faut afficher d'emblée. En cas de débordement, c'est
    // `topOptions` ; le reste est atteignable par la recherche dans `allOptions`.
    options: overflow ? top : all,
    topOptions: top,
    allOptions: all,
    allowSearch: overflow,
    optional: !!safeObject(extra).optional,
    ...safeObject(extra),
  };
}

/**
 * Estime le nombre de périodes couvertes par une colonne de date, pour chaque
 * granularité, à partir de ses bornes.
 *
 * POURQUOI PAS `distinct` : une colonne de dates sur 18 mois porte ~540 valeurs
 * distinctes (les jours), pas 18. Choisir « courbe ou barres » demande le
 * nombre de POINTS AFFICHÉS, donc le nombre de périodes à la granularité
 * retenue — jamais le nombre de dates différentes.
 * L'estimation part de l'écart entre min et max : c'est un majorant du nombre
 * de points réellement tracés (une période sans données reste un trou).
 *
 * @returns {?{day:number, week:number, month:number, quarter:number, year:number}}
 */
function estimatePeriodCounts(min, max) {
  const a = min instanceof Date ? min : null;
  const b = max instanceof Date ? max : null;
  if (!a || !b || isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  // Comparaison en UTC reconstruit à partir des composantes locales : l'UTC
  // n'a pas d'heure d'été, l'écart y est un multiple exact de 86 400 000 ms
  // (même convention que timeintel.js).
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  const days = Math.max(0, Math.round((ub - ua) / 86400000)) + 1;
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return {
    day: days,
    week: Math.max(1, Math.ceil(days / 7)),
    month: Math.max(1, months),
    quarter: Math.max(1, Math.ceil(months / 3)),
    year: Math.max(1, b.getFullYear() - a.getFullYear() + 1),
  };
}

/**
 * Choisit la granularité de lecture : la plus fine qui tienne en un graphique
 * lisible. 30 points est la limite au-delà de laquelle les étiquettes d'axe se
 * chevauchent sur une carte de largeur standard ; en dessous, plus c'est fin,
 * plus on voit de détail (3 mois de données se lisent par semaine, 18 mois par
 * mois, 10 ans par trimestre).
 */
const MAX_POINTS_PER_CHART = 30;
function suggestGrain(counts) {
  if (!counts) return 'month';
  const order = ['day', 'week', 'month', 'quarter', 'year'];
  for (let i = 0; i < order.length; i++) {
    if (counts[order[i]] <= MAX_POINTS_PER_CHART) return order[i];
  }
  return 'year';
}

/** Petite phrase d'aide sous une option de mesure. */
function measureHint(m) {
  const agg = AGGR_LABELS[m.defaultAgg] || 'Total';
  if (m.name === null) return 'Combien de lignes au total';
  return agg + ' de cette colonne';
}

/**
 * Construit la définition déclarative des trois questions de l'assistant.
 * Le module décrit le parcours, l'appelant le rend : aucune balise ici.
 *
 * Étapes :
 *   1. `measure`   — que veut-on mesurer (comptage de lignes en tête) ;
 *   2. `dimension` — comment le répartir (« Dans le temps », les dimensions
 *      classées, puis « Rien, juste le total ») ;
 *   3. `period`    — sur quelle période, à partir des presets fournis par
 *      l'appelant dans `stats.periodPresets` (l'app est seule maîtresse de sa
 *      liste de périodes et de la date de référence ; ce module n'a pas
 *      d'horloge). Étape facultative, et réduite à « Tout l'historique » quand
 *      le fichier ne contient aucune date.
 *
 * Chaque option porte `meta`, qui contient tout ce qu'il faut pour composer le
 * `spec` de `recommendWidget()` sans recalculer quoi que ce soit.
 *
 * @param {Array<{name:string,type?:string}>} columns
 * @param {Object} [fieldModels]
 * @param {Object} [stats]  + `stats.periodPresets` : [{id,label,short?}]
 *                          + `stats.labels` : alias de colonnes
 * @returns {Array<{id:string, question:string,
 *   options:Array<{value:string,label:string,hint:string,icon:string,meta:Object}>,
 *   topOptions:Array, allOptions:Array, allowSearch:boolean, optional:boolean}>}
 */
export function buildFlow(columns, fieldModels, stats) {
  try {
    const cols = safeArray(columns).filter((c) => c && c.name != null);
    const st = safeObject(stats);
    const measures = rankMeasures(cols, fieldModels, st);
    const dims = rankDimensions(cols, fieldModels, st);

    // Colonne de référence pour compter des lignes : la plus remplie. L'app
    // compte les valeurs NON VIDES d'une colonne, donc compter sur une colonne
    // à moitié vide renverrait la moitié des lignes.
    let countColumn = null;
    let bestFilled = -1;
    cols.forEach((c) => {
      const s = resolveStats(c.name, st);
      const filled = s.count === null ? 0 : s.count;
      if (filled > bestFilled) { bestFilled = filled; countColumn = c.name; }
    });

    /* ── Étape 1 : la mesure ──────────────────────────────────────────── */
    const measureOptions = measures.map((m) => ({
      value: m.name === null ? OPT_COUNT : m.name,
      label: m.label,
      hint: measureHint(m),
      icon: m.name === null ? '#' : (m.icon || '#'),
      meta: {
        column: m.name,
        aggregation: m.defaultAgg,
        businessType: m.businessType,
        countColumn,
        score: m.score,
        reason: m.reason,
      },
    }));

    /* ── Étape 2 : la répartition ─────────────────────────────────────── */
    const dateDims = dims.filter((d) => d.kind === 'date');
    const bestDate = dateDims.length ? dateDims[0] : null;
    const dimensionOptions = [];

    // Métadonnées temporelles d'une colonne de date : granularité conseillée et
    // nombre de points qui en résulte — c'est ce nombre, pas le nombre de dates
    // distinctes, qui décide entre courbe et barres.
    const timeMeta = (d) => {
      const s = resolveStats(d.name, st);
      const counts = estimatePeriodCounts(s.min, s.max);
      const grain = suggestGrain(counts);
      return {
        column: d.name,
        kind: 'date',
        grain,
        periodCounts: counts,
        cardinality: counts ? counts[grain] : null,
        distinctValues: d.cardinality,
        businessType: d.businessType,
        label: d.label,
        reason: d.reason,
      };
    };

    if (bestDate) {
      // Une seule colonne de date : on ne parle jamais de « colonne », on dit
      // « Dans le temps ». Plusieurs : la meilleure devient « Dans le temps »
      // et les autres restent proposées sous leur propre nom.
      dimensionOptions.push({
        value: OPT_TIME,
        label: 'Dans le temps',
        hint: dateDims.length > 1
          ? 'D\'après « ' + bestDate.label + ' »'
          : 'Voir l\'évolution période par période',
        icon: '📅',
        meta: timeMeta(bestDate),
      });
    }

    dims.forEach((d) => {
      if (bestDate && d.name === bestDate.name) return; // déjà couvert par « Dans le temps »
      dimensionOptions.push({
        value: d.name,
        label: d.label,
        hint: d.reason,
        icon: d.kind === 'geo' ? '🌍' : (d.kind === 'date' ? '📅' : (d.kind === 'identifier' ? 'ID' : (d.icon || 'T'))),
        meta: d.kind === 'date' ? { ...timeMeta(d), score: d.score } : {
          column: d.name,
          kind: d.kind,
          cardinality: d.cardinality,
          businessType: d.businessType,
          label: d.label,
          reason: d.reason,
          score: d.score,
        },
      });
    });

    // « Rien, juste le total » ferme la liste : c'est la sortie de secours de
    // celui qui ne veut pas répartir, pas le choix qu'on met en avant.
    dimensionOptions.push({
      value: OPT_NONE,
      label: 'Rien, juste le total',
      hint: 'Un seul chiffre, toutes lignes confondues',
      icon: '◈',
      meta: { column: null, kind: null, cardinality: null },
    });

    /* ── Étape 3 : la période ─────────────────────────────────────────── */
    const presets = safeArray(st.periodPresets).filter((p) => p && p.id);
    const hasDate = !!bestDate;
    let periodOptions;
    if (!hasDate || !presets.length) {
      // Sans date exploitable, filtrer par période n'a aucun sens : on garde
      // une option unique pour que l'étape reste cohérente au lieu d'un écran
      // vide, et on la marque facultative.
      periodOptions = [{
        value: 'all',
        label: 'Tout l\'historique',
        hint: hasDate ? '' : 'Aucune date dans ce fichier',
        icon: '∞',
        meta: { preset: 'all', dateColumn: bestDate ? bestDate.name : null },
      }];
    } else {
      periodOptions = presets
        // La plage personnalisée demande deux dates : elle n'a pas sa place
        // dans un QCM, l'app la propose dans le réglage fin du widget.
        .filter((p) => p.id !== 'custom')
        .map((p) => ({
          value: p.id,
          label: p.label || p.short || p.id,
          hint: p.id === 'all' ? 'Aucun filtre de date' : 'D\'après « ' + bestDate.label + ' »',
          icon: p.id === 'all' ? '∞' : '📆',
          meta: { preset: p.id, dateColumn: bestDate.name },
        }));
    }

    return [
      makeStep('measure', 'Que souhaitez-vous mesurer ?', measureOptions, { optional: false }),
      makeStep('dimension', 'Comment souhaitez-vous le voir réparti ?', dimensionOptions, { optional: false }),
      makeStep('period', 'Sur quelle période ?', periodOptions, { optional: true, defaultValue: 'all' }),
    ];
  } catch (e) {
    // Même en échec total, l'assistant doit rester utilisable : compter les
    // lignes, sans répartition, sur tout l'historique.
    return [
      makeStep('measure', 'Que souhaitez-vous mesurer ?', [{
        value: OPT_COUNT, label: 'Nombre de lignes', hint: 'Combien de lignes au total', icon: '#',
        meta: { column: null, aggregation: 'count' },
      }], { optional: false }),
      makeStep('dimension', 'Comment souhaitez-vous le voir réparti ?', [{
        value: OPT_NONE, label: 'Rien, juste le total', hint: 'Un seul chiffre', icon: '◈',
        meta: { column: null, kind: null, cardinality: null },
      }], { optional: false }),
      makeStep('period', 'Sur quelle période ?', [{
        value: 'all', label: 'Tout l\'historique', hint: '', icon: '∞', meta: { preset: 'all' },
      }], { optional: true, defaultValue: 'all' }),
    ];
  }
}
