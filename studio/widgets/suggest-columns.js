/*!
 * FlowPilot Studio — Copyright (c) 2026 Jeremy Ducrot. Tous droits réservés.
 * Logiciel propriétaire. Voir LICENSE. Reproduction ou réutilisation du code
 * interdites sans autorisation écrite.
 */
/* ===========================================================================
   suggest-columns.js — Propositions de colonnes calculées, sans IA.

   Principe : l'application classe déjà chaque colonne dans un type métier
   (`businessType` : date, revenue, cost, distance, weight, postal_code…).
   Ce module croise ces types pour proposer des colonnes calculées dont la
   formule est écrite d'avance, dans le langage de widgets/formula.js.

   Règle d'or : une suggestion n'est retournée que si elle a été ÉVALUÉE sur
   un échantillon réel et qu'elle produit assez de valeurs exploitables.
   On ne propose jamais une colonne qui sortirait vide sur les données de
   l'utilisateur — c'est ce qui sépare une liste utile d'un catalogue générique.

   Aucun appel réseau, aucune dépendance. Import pur.
   =========================================================================== */

const SAMPLE_SIZE = 400;        // lignes évaluées pour valider une suggestion
const MIN_FILL_RATIO = 0.8;     // ≥ 80 % de valeurs non vides exigées
const MAX_SUGGESTIONS = 12;
const DISTINCT_TABLE_MAX = 25;  // au-delà, on montre un aperçu ligne à ligne

/* ---------------------------------------------------------------------------
   Utilitaires
   --------------------------------------------------------------------------- */

function bt(col) { return (col && col.businessType) || ''; }
function isNum(col) { return col && col.type === 'number'; }
function isDate(col) { return col && col.type === 'date'; }
function isText(col) { return col && col.type === 'text'; }

/** Échantillon régulier plutôt que les N premières lignes : un fichier trié
 *  par date donnerait sinon une image fausse de la variété des valeurs. */
function sample(rows, n) {
  const total = rows.length;
  if (total <= n) return rows;
  const step = Math.max(1, Math.floor(total / n));
  const out = [];
  for (let i = 0; i < total && out.length < n; i += step) out.push(rows[i]);
  return out;
}

/** Référence de colonne échappée pour le langage de formules. */
function ref(name) { return '[' + String(name).replace(/]/g, '') + ']'; }

/** Cherche la première colonne dont le businessType figure dans `types`. */
function findBy(columns, types, exclude) {
  const set = new Set(types);
  return columns.find(c => set.has(bt(c)) && (!exclude || c.name !== exclude.name)) || null;
}

function findAllBy(columns, types) {
  const set = new Set(types);
  return columns.filter(c => set.has(bt(c)));
}

/* ---------------------------------------------------------------------------
   Catalogue de règles

   Chaque règle reçoit le contexte { columns, rows } et retourne 0..n
   candidats { id, label, name, formula, why, category }.
   `name` est le nom pré-rempli de la colonne, modifiable par l'utilisateur.
   --------------------------------------------------------------------------- */

const RULES = [

  /* --- Dates : délai entre deux dates ------------------------------------ */
  function delaiEntreDates({ columns }) {
    const dates = columns.filter(isDate);
    if (dates.length < 2) return [];
    // Heuristique de sens : « chargement » avant « livraison », sinon ordre du fichier.
    const score = c => {
      const n = c.name.toLowerCase();
      if (/livr|arriv|reception|réception|fin|retour/.test(n)) return 2;
      if (/chgt|charg|depart|départ|debut|début|commande|emission|émission/.test(n)) return 0;
      return 1;
    };
    const sorted = [...dates].sort((a, b) => score(a) - score(b));
    const from = sorted[0], to = sorted[sorted.length - 1];
    if (from.name === to.name) return [];
    return [{
      id: 'delai',
      category: 'Dates',
      label: 'Délai en jours',
      name: 'Délai (jours)',
      // DATEDIFF(a, b) vaut a − b : pour un délai positif, la date de FIN vient en premier.
      formula: `DATEDIFF(${ref(to.name)}, ${ref(from.name)}, "day")`,
      why: `Nombre de jours entre « ${from.name} » et « ${to.name} ».`,
    }];
  },

  /* --- Dates : découpage calendaire -------------------------------------- */
  function decoupageDate({ columns }) {
    const dates = columns.filter(isDate);
    if (!dates.length) return [];
    const d = dates[0];
    const R = ref(d.name);
    return [
      { id: 'annee',     category: 'Dates', label: 'Année',           name: 'Année',           formula: `YEAR(${R})`,      why: `Année de « ${d.name} ».` },
      { id: 'mois',      category: 'Dates', label: 'Mois (AAAA-MM)',  name: 'Mois',            formula: `FORMATDATE(${R}, "YYYY-MM")`, why: `Mois de « ${d.name} », triable chronologiquement.` },
      { id: 'trimestre', category: 'Dates', label: 'Trimestre',       name: 'Trimestre',       formula: `CONCAT("T", TEXT(QUARTER(${R})), " ", TEXT(YEAR(${R})))`, why: `Trimestre de « ${d.name} ».` },
      { id: 'semaine',   category: 'Dates', label: 'Semaine ISO',     name: 'Semaine',         formula: `WEEK(${R})`,      why: `Numéro de semaine ISO de « ${d.name} ».` },
      { id: 'jsem',      category: 'Dates', label: 'Jour de semaine', name: 'Jour de semaine', formula: `WEEKDAY(${R})`,   why: `1 = lundi … 7 = dimanche.` },
      { id: 'anciennete',category: 'Dates', label: 'Ancienneté',      name: 'Jours écoulés',   formula: `DAYS_SINCE(${R})`,why: `Nombre de jours depuis « ${d.name} ».` },
    ];
  },

  /* --- Argent : marge et taux -------------------------------------------- */
  function marge({ columns }) {
    const rev = findBy(columns, ['revenue']);
    const cost = findBy(columns, ['cost']);
    if (!rev || !cost) return [];
    return [
      { id: 'marge', category: 'Rentabilité', label: 'Marge', name: 'Marge',
        formula: `${ref(rev.name)} - ${ref(cost.name)}`,
        why: `« ${rev.name} » moins « ${cost.name} ».` },
      { id: 'txmarge', category: 'Rentabilité', label: 'Taux de marge %', name: 'Taux de marge %',
        formula: `IF(${ref(rev.name)} > 0, ROUND((${ref(rev.name)} - ${ref(cost.name)}) / ${ref(rev.name)} * 100, 1), 0)`,
        why: `Marge rapportée au chiffre d'affaires, en %. Protégée contre la division par zéro.` },
    ];
  },

  /* --- Ratios usuels du transport ---------------------------------------- */
  function ratiosTransport({ columns }) {
    const out = [];
    const money = findBy(columns, ['revenue', 'cost']);
    const dist = findBy(columns, ['distance']);
    const weight = findBy(columns, ['weight']);
    const len = findBy(columns, ['length']);

    if (money && dist) out.push({
      id: 'prix_km', category: 'Ratios', label: 'Prix au km', name: 'Prix / km',
      formula: `IF(${ref(dist.name)} > 0, ROUND(${ref(money.name)} / ${ref(dist.name)}, 2), 0)`,
      why: `« ${money.name} » divisé par « ${dist.name} ».`,
    });
    if (money && weight) out.push({
      id: 'prix_tonne', category: 'Ratios', label: 'Prix à la tonne', name: 'Prix / tonne',
      formula: `IF(${ref(weight.name)} > 0, ROUND(${ref(money.name)} / ${ref(weight.name)}, 2), 0)`,
      why: `« ${money.name} » divisé par « ${weight.name} ».`,
    });
    if (weight && len) out.push({
      id: 'densite', category: 'Ratios', label: 'Densité au mètre', name: 'Densité (par m)',
      formula: `IF(${ref(len.name)} > 0, ROUND(${ref(weight.name)} / ${ref(len.name)}, 2), 0)`,
      why: `« ${weight.name} » rapporté à « ${len.name} ».`,
    });
    return out;
  },

  /* --- Code postal → département ----------------------------------------- */
  function departement({ columns }) {
    const cp = findBy(columns, ['postal_code']);
    if (!cp) return [];
    return [{
      id: 'departement', category: 'Géographie', label: 'Département', name: 'Département',
      formula: `LEFT(TEXT(${ref(cp.name)}), 2)`,
      why: `Deux premiers caractères de « ${cp.name} ».`,
    }];
  },

  /* --- Texte : préfixe technique commun ----------------------------------
     Cas très fréquent des exports d'ERP : toutes les valeurs partagent un
     préfixe (« L_TRUCK_ », « CLI-», « REF_ ») qui n'apporte rien à l'analyse.
     On le détecte sur les valeurs réelles et on propose de le retirer, en
     traitant le cas où il ne reste rien après le préfixe.               */
  function prefixeCommun({ columns, rows }) {
    const out = [];
    const texts = columns.filter(c => isText(c) && !c._computed);
    const rs = sample(rows, SAMPLE_SIZE);

    /** Coupe une chaîne au dernier séparateur, préfixe inclus. « L_TRUCK_X » → « L_TRUCK_ » */
    const cutAtSep = str => {
      const cut = Math.max(str.lastIndexOf('_'), str.lastIndexOf('-'), str.lastIndexOf('.'), str.lastIndexOf('/'));
      return cut < 1 ? '' : str.slice(0, cut + 1);
    };

    /** Plus long préfixe commun à une liste de chaînes. */
    const commonPrefix = list => {
      let pre = list[0] || '';
      for (const d of list) {
        let i = 0;
        while (i < pre.length && i < d.length && pre[i] === d[i]) i++;
        pre = pre.slice(0, i);
        if (!pre) break;
      }
      return pre;
    };

    for (const col of texts) {
      const vals = [];
      for (const r of rs) {
        const v = r[col.name];
        if (v !== null && v !== undefined && v !== '') vals.push(String(v));
      }
      if (vals.length < 20) continue;

      const counts = new Map();
      for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
      const distinct = [...counts.keys()];
      // Un préfixe technique n'a de sens que sur une colonne peu variée.
      if (distinct.length < 2 || distinct.length > 60) continue;

      const R = ref(col.name);
      const proposals = [];

      /* --- Niveau 1 : le préfixe commun à TOUTES les valeurs --------------
         Sur « L_TRUCK », « L_WAGON_EXT », « L_SEASHIP » → « L_ ».           */
      const base = cutAtSep(commonPrefix(distinct));
      if (base.length >= 2) proposals.push({ prefix: base, scope: distinct });

      /* --- Niveau 2 : le préfixe DOMINANT ---------------------------------
         Beaucoup d'exports ERP ont une famille majoritaire sous un préfixe
         plus long — « L_TRUCK_ » ici. Le préfixe commun à tout le monde ne
         la voit pas : on la cherche séparément, et on garde les valeurs
         hors famille en leur retirant seulement le préfixe de base.        */
      const deeper = new Map();
      for (const d of distinct) {
        const p = cutAtSep(d);
        if (p.length > base.length) deeper.set(p, (deeper.get(p) || 0) + (counts.get(d) || 0));
      }
      let domPrefix = '', domCount = 0;
      for (const [p, n] of deeper) if (n > domCount) { domPrefix = p; domCount = n; }
      const covered = domPrefix ? distinct.filter(d => d.startsWith(domPrefix)) : [];
      if (domPrefix && covered.length >= 2 && domCount / vals.length >= 0.25) {
        proposals.push({ prefix: domPrefix, scope: covered, dominant: true });
      }

      for (const p of proposals) {
        const { prefix, scope, dominant } = p;
        const naked = prefix.slice(0, -1);                       // « L_TRUCK_ » → « L_TRUCK »
        const short = naked.replace(/^.*[_\-./]/, '') || naked;  // « L_TRUCK »  → « TRUCK »
        const hasBare = distinct.includes(naked);                // des lignes valant exactement le préfixe nu ?
        const outsiders = distinct.filter(d => !d.startsWith(prefix) && d !== naked);

        // Cœur : on retire le préfixe.
        let formula = `REPLACE(TEXT(${R}), "${prefix}", "")`;

        // Les valeurs hors famille gardent au moins le nettoyage de base.
        if (outsiders.length && base && base !== prefix) {
          formula = `IF(STARTSWITH(TEXT(${R}), "${prefix}"), ${formula}, REPLACE(TEXT(${R}), "${base}", ""))`;
        }

        // Le préfixe nu ne laisserait rien : on lui donne son propre libellé.
        if (hasBare) {
          formula = `IF(TEXT(${R}) == "${naked}", "${short.toUpperCase()}", ${formula})`;
        }

        const notes = [];
        if (hasBare) notes.push(`les lignes valant « ${naked} » deviennent « ${short.toUpperCase()} »`);
        if (outsiders.length) notes.push(`${outsiders.length} valeur(s) hors famille (${outsiders.slice(0, 3).join(', ')}) gardent le nettoyage de base`);

        out.push({
          id: 'prefixe_' + col.name + '_' + prefix,
          category: 'Nettoyage',
          label: `Retirer « ${prefix} » de ${col.name}`,
          name: col.name + (dominant ? ' (type)' : ' (net)'),
          formula,
          sourceColumn: col.name,
          why: (dominant
            ? `${Math.round(domCount / vals.length * 100)} % des lignes de « ${col.name} » commencent par « ${prefix} ».`
            : `Toutes les valeurs de « ${col.name} » commencent par « ${prefix} », qui n'apporte rien à l'analyse.`)
            + (notes.length ? ' ' + notes.join(' ; ') + '.' : ''),
        });
      }
    }
    return out.slice(0, 4);
  },

  /* --- Texte : découpe sur séparateur constant ---------------------------- */
  function decoupeSeparateur({ columns, rows }) {
    const out = [];
    const rs = sample(rows, SAMPLE_SIZE);
    for (const col of columns.filter(c => isText(c) && !c._computed)) {
      const vals = rs.map(r => r[col.name]).filter(v => v !== null && v !== undefined && v !== '').map(String);
      if (vals.length < 20) continue;
      for (const sep of [' - ', ' / ', ' | ', ', ']) {
        const withSep = vals.filter(v => v.includes(sep)).length;
        if (withSep / vals.length < 0.9) continue;
        out.push({
          id: 'split_' + col.name,
          category: 'Nettoyage',
          label: `Découper « ${col.name} » sur « ${sep.trim()} »`,
          name: col.name + ' — 1re partie',
          formula: `TRIM(SPLIT(TEXT(${ref(col.name)}), "${sep.trim()}", 1))`,
          why: `${Math.round(withSep / vals.length * 100)} % des valeurs contiennent « ${sep.trim()} ».`,
        });
        break;
      }
    }
    return out.slice(0, 2);
  },

  /* --- Mesure numérique : tranches calculées sur les données réelles ------ */
  function tranches({ columns, rows }) {
    const measures = findAllBy(columns, ['revenue', 'cost', 'weight', 'distance', 'quantity', 'numeric_measure', 'length']);
    const col = measures.find(isNum);
    if (!col) return [];
    const rs = sample(rows, SAMPLE_SIZE);
    const nums = rs.map(r => parseFloat(r[col.name])).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (nums.length < 30) return [];
    const q = p => nums[Math.min(nums.length - 1, Math.floor(nums.length * p))];
    const q1 = Math.round(q(0.25)), q2 = Math.round(q(0.5)), q3 = Math.round(q(0.75));
    if (!(q1 < q2 && q2 < q3)) return [];   // distribution trop plate pour découper
    const R = ref(col.name);
    return [{
      id: 'tranches', category: 'Segmentation',
      label: `Tranches de « ${col.name} »`,
      name: col.name + ' — tranche',
      formula: `IF(${R} <= ${q1}, "1. ≤ ${q1}", IF(${R} <= ${q2}, "2. ${q1}–${q2}", IF(${R} <= ${q3}, "3. ${q2}–${q3}", "4. > ${q3}")))`,
      why: `Quatre tranches d'effectif comparable, bornes calculées sur tes données (quartiles : ${q1}, ${q2}, ${q3}).`,
    }];
  },

  /* --- Colonne à trous : valeur de repli ---------------------------------- */
  function valeurDeRepli({ columns, rows }) {
    const rs = sample(rows, SAMPLE_SIZE);
    const out = [];
    for (const col of columns.filter(c => !c._computed)) {
      const empty = rs.filter(r => {
        const v = r[col.name];
        return v === null || v === undefined || v === '';
      }).length;
      const ratio = empty / Math.max(1, rs.length);
      if (ratio > 0.05 && ratio < 0.6) {
        out.push({
          id: 'repli_' + col.name,
          category: 'Nettoyage',
          label: `Combler les vides de « ${col.name} »`,
          name: col.name + ' (complété)',
          formula: `COALESCE(${ref(col.name)}, "Non renseigné")`,
          why: `${Math.round(ratio * 100)} % des lignes sont vides sur cette colonne.`,
          skipFillCheck: true,   // le but même de cette colonne est de traiter des vides
        });
      }
    }
    return out.slice(0, 2);
  },
];

/* ---------------------------------------------------------------------------
   Moteur
   --------------------------------------------------------------------------- */

/**
 * Répartition des valeurs distinctes en entrée et en sortie.
 * C'est l'écran de contrôle : sur une colonne peu variée, il montre d'un coup
 * d'œil les cas qui n'ont PAS été traités par la formule — exactement ce qu'un
 * aperçu de cinq lignes ne peut pas montrer quand un cas pèse 1 % du volume.
 *
 * @returns {{kind:'table', rows:Array<{from:*, to:*, count:number}>, truncated:boolean}
 *         | {kind:'lines', rows:Array<{from:*, to:*}>}}
 */
export function previewFormula(compiled, rows, sourceColumn, helpers) {
  const rs = sample(rows, Math.min(rows.length, 4000));

  if (sourceColumn) {
    const map = new Map();
    for (const r of rs) {
      const from = r[sourceColumn];
      const key = JSON.stringify(from);
      let e = map.get(key);
      if (!e) { e = { from, to: compiled.evaluate(r, helpers), count: 0 }; map.set(key, e); }
      e.count++;
      if (map.size > DISTINCT_TABLE_MAX + 1) break;
    }
    if (map.size <= DISTINCT_TABLE_MAX) {
      return {
        kind: 'table',
        rows: [...map.values()].sort((a, b) => b.count - a.count),
        truncated: false,
      };
    }
  }

  return {
    kind: 'lines',
    rows: rs.slice(0, 6).map(r => ({
      from: sourceColumn ? r[sourceColumn] : null,
      to: compiled.evaluate(r, helpers),
    })),
  };
}

/**
 * Produit les suggestions retenues pour ce jeu de données.
 *
 * @param {Object} opts
 * @param {Array}  opts.columns  colonnes de l'app (avec .type et .businessType)
 * @param {Array}  opts.rows     lignes de données
 * @param {Function} opts.compile  la fonction compile() de formula.js
 * @param {Object} [opts.helpers]  helpers passés à evaluate() (parseDateValue)
 * @returns {Array<{id,label,name,formula,why,category,type,preview,fillRatio}>}
 */
export function suggestColumns({ columns, rows, compile, helpers }) {
  if (!Array.isArray(columns) || !Array.isArray(rows) || !rows.length) return [];
  if (typeof compile !== 'function') return [];

  const ctx = { columns, rows };
  const existing = new Set(columns.map(c => String(c.name).toLowerCase()));
  const candidates = [];

  for (const rule of RULES) {
    let produced = [];
    try { produced = rule(ctx) || []; }
    catch (e) { produced = []; }        // une règle qui échoue ne casse jamais le reste
    for (const c of produced) candidates.push(c);
  }

  const colDefs = columns.map(c => ({ name: c.name, type: c.type }));
  const rs = sample(rows, SAMPLE_SIZE);
  const kept = [];
  const seenFormula = new Set();

  for (const cand of candidates) {
    if (kept.length >= MAX_SUGGESTIONS) break;
    if (existing.has(String(cand.name).toLowerCase())) continue;   // déjà créée
    if (seenFormula.has(cand.formula)) continue;
    seenFormula.add(cand.formula);

    const compiled = compile(cand.formula, colDefs);
    if (!compiled.ok) continue;          // une règle qui produit une formule invalide est ignorée

    // Validation sur les données réelles : c'est ici que se joue la pertinence.
    let filled = 0;
    const values = new Set();
    for (const r of rs) {
      const v = compiled.evaluate(r, helpers);
      if (v !== null && v !== undefined && v !== '') filled++;
      if (values.size <= 2) values.add(JSON.stringify(v));
    }
    const fillRatio = filled / Math.max(1, rs.length);
    if (!cand.skipFillCheck && fillRatio < MIN_FILL_RATIO) continue;
    if (values.size <= 1) continue;      // colonne constante : sans intérêt

    kept.push({
      ...cand,
      type: compiled.type,
      fillRatio,
      compiled,
    });
  }

  return kept;
}

export const SUGGEST_LIMITS = { SAMPLE_SIZE, MIN_FILL_RATIO, MAX_SUGGESTIONS, DISTINCT_TABLE_MAX };

/* ===========================================================================
   ASSISTANT GUIDÉ — catalogue d'opérations

   Les suggestions couvrent ce que l'application sait deviner. L'assistant
   couvre le reste sans passer par la syntaxe : l'utilisateur choisit une
   opération, remplit des champs, et la formule est fabriquée pour lui.

   Chaque opération déclare ses entrées ; l'interface les rend automatiquement.
   Aucune connaissance du langage n'est requise côté UI : ajouter une opération
   ici suffit à la faire apparaître dans l'assistant.

   Types d'entrée :
     column  — liste déroulante des colonnes, filtrée par `accept`
     text    — champ libre (échappé avant insertion dans la formule)
     number  — champ numérique
     select  — liste de valeurs imposées
   =========================================================================== */

/** Échappe un texte saisi par l'utilisateur pour l'insérer en littéral. */
function lit(v) {
  return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
}

/** Nombre sûr : jamais d'injection possible via un champ numérique. */
function numLit(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? String(n) : '0';
}

export const OPERATIONS = [

  /* ── Texte ──────────────────────────────────────────────────────────── */
  {
    id: 'retirer_texte', category: 'Texte',
    label: 'Retirer un morceau de texte',
    hint: 'Supprime toutes les occurrences d\u2019un texte : préfixe technique, code, séparateur…',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'txt', kind: 'text', label: 'Retirer', placeholder: 'L_TRUCK_', required: true },
    ],
    name: v => `${v.colName} (net)`,
    build: v => `REPLACE(TEXT(${v.col}), ${lit(v.txt)}, "")`,
  },
  {
    id: 'remplacer_texte', category: 'Texte',
    label: 'Remplacer un texte par un autre',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'from', kind: 'text', label: 'Remplacer', required: true },
      { key: 'to', kind: 'text', label: 'Par' },
    ],
    name: v => `${v.colName} (corrigé)`,
    build: v => `REPLACE(TEXT(${v.col}), ${lit(v.from)}, ${lit(v.to)})`,
  },
  {
    id: 'debut_fin', category: 'Texte',
    label: 'Extraire le début ou la fin',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'side', kind: 'select', label: 'Prendre', options: [
        { value: 'left', label: 'les premiers caractères' },
        { value: 'right', label: 'les derniers caractères' },
      ] },
      { key: 'n', kind: 'number', label: 'Combien', value: 2, min: 1, max: 200 },
    ],
    name: v => `${v.colName} (extrait)`,
    build: v => `${v.side === 'right' ? 'RIGHT' : 'LEFT'}(TEXT(${v.col}), ${numLit(v.n)})`,
  },
  {
    id: 'decouper', category: 'Texte',
    label: 'Découper sur un séparateur',
    hint: 'Prend le n-ième morceau, par exemple la ville dans « 57000 - METZ ».',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'sep', kind: 'text', label: 'Séparateur', placeholder: '-', required: true },
      { key: 'n', kind: 'number', label: 'Quel morceau', value: 1, min: 1, max: 20 },
    ],
    name: v => `${v.colName} (morceau ${v.n})`,
    build: v => `TRIM(SPLIT(TEXT(${v.col}), ${lit(v.sep)}, ${numLit(v.n)}))`,
  },
  {
    id: 'casse', category: 'Texte',
    label: 'Harmoniser la casse',
    hint: 'Utile quand « Metz », « METZ » et « metz » coexistent et comptent pour trois.',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'mode', kind: 'select', label: 'Mettre en', options: [
        { value: 'upper', label: 'MAJUSCULES' },
        { value: 'lower', label: 'minuscules' },
      ] },
    ],
    name: v => `${v.colName} (uniformisé)`,
    build: v => `${v.mode === 'lower' ? 'LOWER' : 'UPPER'}(TRIM(TEXT(${v.col})))`,
  },
  {
    id: 'coller', category: 'Texte',
    label: 'Coller deux colonnes',
    inputs: [
      { key: 'a', kind: 'column', accept: 'any', label: 'Première colonne' },
      { key: 'sep', kind: 'text', label: 'Séparateur', placeholder: ' - ', value: ' ' },
      { key: 'b', kind: 'column', accept: 'any', label: 'Deuxième colonne' },
    ],
    name: v => `${v.aName} + ${v.bName}`,
    build: v => `CONCAT(TEXT(${v.a}), ${lit(v.sep)}, TEXT(${v.b}))`,
  },
  {
    id: 'contient', category: 'Texte',
    label: 'Marquer si le texte contient…',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'txt', kind: 'text', label: 'Contient', required: true },
      { key: 'yes', kind: 'text', label: 'Alors écrire', value: 'Oui' },
      { key: 'no', kind: 'text', label: 'Sinon écrire', value: 'Non' },
    ],
    name: v => `Contient ${v.txt || '…'}`,
    build: v => `IF(CONTAINS(TEXT(${v.col}), ${lit(v.txt)}), ${lit(v.yes)}, ${lit(v.no)})`,
  },

  /* ── Dates ──────────────────────────────────────────────────────────── */
  {
    id: 'periode', category: 'Dates',
    label: 'Extraire une période',
    inputs: [
      { key: 'col', kind: 'column', accept: 'date', label: 'À partir de la date' },
      { key: 'grain', kind: 'select', label: 'Extraire', options: [
        { value: 'year', label: 'l\u2019année (2025)' },
        { value: 'month', label: 'le mois (2025-03)' },
        { value: 'quarter', label: 'le trimestre (T1 2025)' },
        { value: 'week', label: 'la semaine ISO (12)' },
        { value: 'weekday', label: 'le jour de semaine (1 = lundi)' },
        { value: 'day', label: 'le jour du mois' },
      ] },
    ],
    name: v => ({ year: 'Année', month: 'Mois', quarter: 'Trimestre', week: 'Semaine', weekday: 'Jour de semaine', day: 'Jour' })[v.grain] || 'Période',
    build: v => {
      switch (v.grain) {
        case 'month':   return `FORMATDATE(${v.col}, "YYYY-MM")`;
        case 'quarter': return `CONCAT("T", TEXT(QUARTER(${v.col})), " ", TEXT(YEAR(${v.col})))`;
        case 'week':    return `WEEK(${v.col})`;
        case 'weekday': return `WEEKDAY(${v.col})`;
        case 'day':     return `DAY(${v.col})`;
        default:        return `YEAR(${v.col})`;
      }
    },
  },
  {
    id: 'ecart_dates', category: 'Dates',
    label: 'Écart entre deux dates',
    inputs: [
      { key: 'from', kind: 'column', accept: 'date', label: 'De' },
      { key: 'to', kind: 'column', accept: 'date', label: 'À' },
      { key: 'unit', kind: 'select', label: 'En', options: [
        { value: 'day', label: 'jours' },
        { value: 'week', label: 'semaines' },
        { value: 'month', label: 'mois' },
        { value: 'year', label: 'années' },
      ] },
    ],
    name: v => `Écart (${({ day: 'jours', week: 'semaines', month: 'mois', year: 'années' })[v.unit] || 'jours'})`,
    // DATEDIFF(a, b) vaut a − b : « De X à Y » doit donner Y − X.
    build: v => `DATEDIFF(${v.to}, ${v.from}, ${lit(v.unit)})`,
  },
  {
    id: 'anciennete', category: 'Dates',
    label: 'Ancienneté (jours écoulés)',
    inputs: [{ key: 'col', kind: 'column', accept: 'date', label: 'Depuis la date' }],
    name: () => 'Jours écoulés',
    build: v => `DAYS_SINCE(${v.col})`,
  },

  /* ── Calculs ────────────────────────────────────────────────────────── */
  {
    id: 'operation', category: 'Calculs',
    label: 'Combiner deux colonnes',
    inputs: [
      { key: 'a', kind: 'column', accept: 'number', label: 'Colonne' },
      { key: 'op', kind: 'select', label: 'Opération', options: [
        { value: '-', label: 'moins (−)' },
        { value: '+', label: 'plus (+)' },
        { value: '*', label: 'multiplié par (×)' },
        { value: '/', label: 'divisé par (÷)' },
      ] },
      { key: 'b', kind: 'column', accept: 'number', label: 'Colonne' },
      { key: 'dec', kind: 'number', label: 'Décimales', value: 2, min: 0, max: 6 },
    ],
    name: v => ({ '-': 'Écart', '+': 'Total', '*': 'Produit', '/': 'Ratio' })[v.op] || 'Calcul',
    // La division est protégée : un diviseur nul renverrait null et viderait la colonne.
    build: v => v.op === '/'
      ? `IF(${v.b} > 0, ROUND(${v.a} / ${v.b}, ${numLit(v.dec)}), 0)`
      : `ROUND(${v.a} ${v.op} ${v.b}, ${numLit(v.dec)})`,
  },
  {
    id: 'pourcentage', category: 'Calculs',
    label: 'Pourcentage d\u2019une colonne sur une autre',
    inputs: [
      { key: 'part', kind: 'column', accept: 'number', label: 'Part' },
      { key: 'total', kind: 'column', accept: 'number', label: 'Sur le total' },
      { key: 'dec', kind: 'number', label: 'Décimales', value: 1, min: 0, max: 4 },
    ],
    name: v => `${v.partName} / ${v.totalName} %`,
    build: v => `IF(${v.total} > 0, ROUND(${v.part} / ${v.total} * 100, ${numLit(v.dec)}), 0)`,
  },
  {
    id: 'arrondi', category: 'Calculs',
    label: 'Arrondir une valeur',
    inputs: [
      { key: 'col', kind: 'column', accept: 'number', label: 'Colonne' },
      { key: 'dec', kind: 'number', label: 'Décimales', value: 0, min: 0, max: 6 },
    ],
    name: v => `${v.colName} (arrondi)`,
    build: v => `ROUND(${v.col}, ${numLit(v.dec)})`,
  },

  /* ── Classement ─────────────────────────────────────────────────────── */
  {
    id: 'seuil', category: 'Classement',
    label: 'Classer selon un seuil',
    hint: 'Deux catégories, séparées par une valeur limite.',
    inputs: [
      { key: 'col', kind: 'column', accept: 'number', label: 'Colonne' },
      { key: 'cmp', kind: 'select', label: 'Est', options: [
        { value: '>', label: 'supérieure à' },
        { value: '>=', label: 'supérieure ou égale à' },
        { value: '<', label: 'inférieure à' },
        { value: '<=', label: 'inférieure ou égale à' },
      ] },
      { key: 'seuil', kind: 'number', label: 'Seuil', value: 0 },
      { key: 'yes', kind: 'text', label: 'Alors', value: 'Au-dessus' },
      { key: 'no', kind: 'text', label: 'Sinon', value: 'En dessous' },
    ],
    name: v => `${v.colName} (classé)`,
    build: v => `IF(${v.col} ${v.cmp} ${numLit(v.seuil)}, ${lit(v.yes)}, ${lit(v.no)})`,
  },
  {
    id: 'trois_tranches', category: 'Classement',
    label: 'Classer en trois tranches',
    inputs: [
      { key: 'col', kind: 'column', accept: 'number', label: 'Colonne' },
      { key: 's1', kind: 'number', label: 'Premier seuil', value: 0 },
      { key: 's2', kind: 'number', label: 'Second seuil', value: 0 },
      { key: 'l1', kind: 'text', label: 'En dessous', value: 'Faible' },
      { key: 'l2', kind: 'text', label: 'Entre les deux', value: 'Moyen' },
      { key: 'l3', kind: 'text', label: 'Au-dessus', value: 'Élevé' },
    ],
    name: v => `${v.colName} (tranche)`,
    build: v => `IF(${v.col} <= ${numLit(v.s1)}, ${lit(v.l1)}, IF(${v.col} <= ${numLit(v.s2)}, ${lit(v.l2)}, ${lit(v.l3)}))`,
  },
  {
    id: 'egal', category: 'Classement',
    label: 'Renommer une valeur précise',
    hint: 'Par exemple : remplacer « L_TRUCK » par « Standard », le reste inchangé.',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'val', kind: 'text', label: 'Si la valeur est', required: true },
      { key: 'yes', kind: 'text', label: 'Écrire', required: true },
    ],
    name: v => `${v.colName} (renommé)`,
    build: v => `IF(TEXT(${v.col}) == ${lit(v.val)}, ${lit(v.yes)}, TEXT(${v.col}))`,
  },
  {
    id: 'combler', category: 'Classement',
    label: 'Combler les cases vides',
    inputs: [
      { key: 'col', kind: 'column', accept: 'any', label: 'Dans la colonne' },
      { key: 'val', kind: 'text', label: 'Mettre à la place', value: 'Non renseigné' },
    ],
    name: v => `${v.colName} (complété)`,
    build: v => `COALESCE(${v.col}, ${lit(v.val)})`,
  },
];

/**
 * Fabrique la formule d'une opération à partir des valeurs saisies.
 * Retourne null si une entrée obligatoire manque — l'UI n'affiche alors
 * simplement pas encore d'aperçu, sans message d'erreur intempestif.
 *
 * @returns {{formula:string, name:string, sourceColumn:string|null}|null}
 */
export function buildOperation(op, values) {
  if (!op) return null;
  const v = {};
  let firstColumn = null;

  for (const input of op.inputs) {
    let raw = values[input.key];
    if (raw === undefined || raw === null || raw === '') {
      if (input.required) return null;        // saisie indispensable, encore absente
      if (input.kind === 'text') raw = ('value' in input) ? input.value : '';
      else if (input.kind === 'number' && 'value' in input) raw = input.value;
      else if (input.kind === 'select') raw = input.options[0].value;
      else return null;                       // colonne non choisie : rien à construire
    }
    if (input.kind === 'column') {
      v[input.key] = '[' + String(raw).replace(/]/g, '') + ']';
      v[input.key + 'Name'] = String(raw);
      if (!firstColumn) firstColumn = String(raw);
    } else {
      v[input.key] = raw;
    }
  }

  const formula = op.build(v);
  const name = typeof op.name === 'function' ? op.name(v) : (op.label || 'Colonne calculée');
  return { formula, name: String(name).trim(), sourceColumn: firstColumn };
}
