/*!
 * FlowPilot Studio — Copyright (c) 2026 Jeremy Ducrot. Tous droits réservés.
 * Logiciel propriétaire. Voir LICENSE. Reproduction ou réutilisation du code
 * interdites sans autorisation écrite.
 */

/* ===========================================================================
   xlsx-stream.js — Lecture d'une feuille Excel PAR FLUX.

   Pourquoi ce module existe
   -------------------------
   Le lecteur habituel charge le XML d'une feuille en entier, sous forme de
   chaîne de caractères. Un moteur JavaScript refuse toute chaîne de plus de
   512 Mo : au-delà, la lecture échoue et la feuille ressort vide. Ce n'est pas
   une question de mémoire disponible, c'est un plafond du langage.

   Ici on ne construit jamais cette chaîne. On décompresse par morceaux, on
   découpe sur les balises de fin de ligne, et on ne garde qu'un tampon de
   quelques centaines de kilo-octets. Une feuille de 662 Mo se lit avec la même
   empreinte mémoire qu'une feuille de 1 Mo.

   Aucune dépendance : `DecompressionStream('deflate-raw')` est natif dans les
   navigateurs récents. Le format ZIP est lu directement — c'est une centaine
   de lignes et ça évite d'embarquer une bibliothèque pour trois structures.

   Ce que ce module ne fait PAS
   ----------------------------
   Il ne remplace pas le lecteur existant. Il sert les cas que celui-ci ne peut
   pas traiter, et il ne lit que ce dont on a besoin : les valeurs en cache des
   cellules. Les formules, les styles décoratifs, les graphiques sont ignorés.
   =========================================================================== */

/* ── Lecture du conteneur ZIP ──────────────────────────────────────────── */

const EOCD_SIG = 0x06054b50;
const CEN_SIG  = 0x02014b50;

async function sliceBuffer(blob, start, end) {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

/**
 * Localise le répertoire central du ZIP et retourne ses entrées.
 * On lit la fin du fichier à rebours : le commentaire final est de taille
 * variable, il n'y a pas d'autre moyen de trouver la signature.
 */
export async function readZipDirectory(blob) {
  const tailLen = Math.min(blob.size, 66000);
  const tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());

  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Archive illisible : fin de répertoire introuvable');

  let count   = tail.getUint16(eocd + 10, true);
  let cenSize = tail.getUint32(eocd + 12, true);
  let cenOff  = tail.getUint32(eocd + 16, true);

  // ZIP64 : au-delà de 65 535 entrées ou 4 Go, les vraies valeurs sont
  // ailleurs. Un classeur Excel volumineux atteint vite ce seuil.
  if (cenOff === 0xffffffff || count === 0xffff) {
    let loc = -1;
    for (let i = eocd - 20; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x07064b50) { loc = i; break; }
    }
    if (loc < 0) throw new Error('Archive ZIP64 illisible');
    const z64Off = Number(tail.getBigUint64(loc + 8, true));
    const z64 = await sliceBuffer(blob, z64Off, z64Off + 56);
    count   = Number(z64.getBigUint64(32, true));
    cenSize = Number(z64.getBigUint64(40, true));
    cenOff  = Number(z64.getBigUint64(48, true));
  }

  const cen = new DataView(await blob.slice(cenOff, cenOff + cenSize).arrayBuffer());
  const dec = new TextDecoder();
  const entries = [];
  let p = 0;

  for (let i = 0; i < count && p + 46 <= cen.byteLength; i++) {
    if (cen.getUint32(p, true) !== CEN_SIG) break;
    const method   = cen.getUint16(p + 10, true);
    let   compSize = cen.getUint32(p + 20, true);
    let   rawSize  = cen.getUint32(p + 24, true);
    const nameLen  = cen.getUint16(p + 28, true);
    const extraLen = cen.getUint16(p + 30, true);
    const cmtLen   = cen.getUint16(p + 32, true);
    let   localOff = cen.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cen.buffer, cen.byteOffset + p + 46, nameLen));

    // Champ ZIP64 : les valeurs à 0xffffffff sont des marqueurs, les vraies
    // tailles vivent dans l'extra field.
    if (compSize === 0xffffffff || rawSize === 0xffffffff || localOff === 0xffffffff) {
      let e = p + 46 + nameLen;
      const endExtra = e + extraLen;
      while (e + 4 <= endExtra) {
        const id = cen.getUint16(e, true), sz = cen.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (rawSize  === 0xffffffff) { rawSize  = Number(cen.getBigUint64(q, true)); q += 8; }
          if (compSize === 0xffffffff) { compSize = Number(cen.getBigUint64(q, true)); q += 8; }
          if (localOff === 0xffffffff) { localOff = Number(cen.getBigUint64(q, true)); q += 8; }
          break;
        }
        e += 4 + sz;
      }
    }

    entries.push({ name, method, compSize, rawSize, localOff });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return entries;
}

/** Flux décompressé d'une entrée. Le tout sans jamais matérialiser le contenu. */
async function entryStream(blob, entry) {
  // L'en-tête local répète les longueurs de nom et d'extra, qui peuvent
  // différer de celles du répertoire central : il faut les relire ici.
  const head = await sliceBuffer(blob, entry.localOff, entry.localOff + 30);
  const nameLen = head.getUint16(26, true);
  const extraLen = head.getUint16(28, true);
  const start = entry.localOff + 30 + nameLen + extraLen;
  const raw = blob.slice(start, start + entry.compSize);
  if (entry.method === 0) return raw.stream();           // stocké tel quel
  return raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
}

/** Contenu texte complet d'une entrée. À réserver aux petits fichiers. */
async function entryText(blob, entry) {
  const chunks = [];
  const reader = (await entryStream(blob, entry)).pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks.join('');
}

/* ── Structures du classeur ────────────────────────────────────────────── */

function unescapeXml(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
          .replace(/&amp;/g, '&');   // en dernier, sinon on désamorce les autres
}

/** Table des chaînes partagées. Sur un classeur réel elle reste petite —
 *  3,2 Mo pour 74 000 entrées — parce qu'elle dédoublonne. */
function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    // Une entrée peut être découpée en plusieurs <t> (texte enrichi).
    let text = '';
    const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tre.exec(m[1]))) text += t[1];
    out.push(unescapeXml(text));
  }
  return out;
}

/** Formats de nombre associés aux styles, pour reconnaître les dates.
 *  Sans cela, une date ressort en numéro de série : 45658 au lieu de 2025-01-01. */
function parseDateStyles(xml) {
  const dateFmtIds = new Set([14,15,16,17,18,19,20,21,22,45,46,47]);
  const customDate = new Set();
  const numRe = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let m;
  while ((m = numRe.exec(xml))) {
    const code = m[2].replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
    if (/[ymdhs]/i.test(code) && !/^[#0.,%\s]*$/.test(code)) customDate.add(+m[1]);
  }
  const isDateFmt = id => dateFmtIds.has(id) || customDate.has(id);

  const block = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const styleIsDate = [];
  if (block) {
    const xfRe = /<xf[^>]*numFmtId="(\d+)"[^>]*?>|<xf[^>]*numFmtId="(\d+)"[^>]*\/>/g;
    let x;
    while ((x = xfRe.exec(block[1]))) styleIsDate.push(isDateFmt(+(x[1] || x[2])));
  }
  return styleIsDate;
}

/** Convertit un numéro de série Excel en date ISO. */
export function excelSerialToISO(n) {
  // 1900-02-29 n'a jamais existé : Excel l'a inventé. D'où l'origine au 30/12/1899.
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return String(n);
  const iso = d.toISOString();
  return (n % 1 === 0) ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

function colIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/* ── Lecture d'une feuille ─────────────────────────────────────────────── */

/**
 * Ouvre un classeur et renvoie de quoi lire ses feuilles.
 * @param {Blob|File} blob
 */
export async function openWorkbook(blob) {
  const entries = await readZipDirectory(blob);
  const byName = Object.create(null);
  entries.forEach(e => { byName[e.name] = e; });

  const wbXml = await entryText(blob, byName['xl/workbook.xml']);
  const relsXml = byName['xl/_rels/workbook.xml.rels']
    ? await entryText(blob, byName['xl/_rels/workbook.xml.rels']) : '';

  const rels = Object.create(null);
  let r;
  const relRe = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  while ((r = relRe.exec(relsXml))) rels[r[1]] = r[2].replace(/^\/?xl\//, '').replace(/^\//, '');

  const sheets = [];
  const shRe = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/?>/g;
  let m;
  while ((m = shRe.exec(wbXml))) {
    const target = rels[m[2]];
    const path = target ? ('xl/' + target) : null;
    const entry = path && byName[path];
    if (!entry) continue;
    sheets.push({ name: unescapeXml(m[1]), path, entry, bytes: entry.rawSize });
  }

  const shared = byName['xl/sharedStrings.xml']
    ? parseSharedStrings(await entryText(blob, byName['xl/sharedStrings.xml'])) : [];
  const styleIsDate = byName['xl/styles.xml']
    ? parseDateStyles(await entryText(blob, byName['xl/styles.xml'])) : [];

  return { blob, entries, byName, sheets, shared, styleIsDate };
}

/**
 * Parcourt les lignes d'une feuille. Générateur asynchrone : l'appelant
 * consomme à son rythme et peut s'arrêter quand il veut — c'est ce qui rend
 * l'aperçu instantané sur une feuille de 180 000 lignes.
 *
 * @param {Object} wb  résultat de openWorkbook()
 * @param {string} sheetName
 * @param {Object} [opts]
 * @param {number} [opts.limit]     nombre maximal de lignes à produire
 * @param {Function} [opts.onProgress]  reçoit les octets décompressés
 * @yields {Array<string|number>} une ligne, indexée par position de colonne
 */
export async function* streamSheetRows(wb, sheetName, opts = {}) {
  const sheet = wb.sheets.find(s => s.name === sheetName);
  if (!sheet) throw new Error('Feuille introuvable : ' + sheetName);

  const limit = opts.limit || Infinity;
  const reader = (await entryStream(wb.blob, sheet.entry))
    .pipeThrough(new TextDecoderStream()).getReader();

  let buf = '';
  let produced = 0;
  let bytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    bytes += value.length;
    if (opts.onProgress) opts.onProgress(bytes);

    for (;;) {
      const end = buf.indexOf('</row>');
      if (end < 0) break;
      const start = buf.lastIndexOf('<row', end);
      const rowXml = start >= 0 ? buf.slice(start, end + 6) : '';
      buf = buf.slice(end + 6);
      if (!rowXml) continue;

      yield parseRow(rowXml, wb);
      if (++produced >= limit) { try { await reader.cancel(); } catch (e) {} return; }
    }

    // Le tampon ne doit pas enfler si une « ligne » anormale n'a pas de fin.
    if (buf.length > 8 * 1024 * 1024) buf = buf.slice(-1024);
  }

  // Une dernière ligne peut rester sans marqueur de fin sur un fichier tronqué.
  const last = buf.indexOf('<row');
  if (last >= 0 && produced < limit) {
    const rowXml = buf.slice(last);
    if (rowXml.indexOf('</c>') > 0) yield parseRow(rowXml, wb);
  }
}

/* Le motif doit distinguer une cellule vide auto-fermante — <c r="C6" s="9"/> —
   d'une cellule avec contenu. Avec des attributs gloutons, le « / » final était
   absorbé, l'alternative auto-fermante ne s'appliquait plus, et la recherche du
   </c> suivant emportait la cellule d'après AVEC sa valeur : toute la ligne se
   décalait d'une colonne. Attributs paresseux et slash explicite. */
const CELL_RE = /<c r="([A-Z]+)\d+"([^>]*?)\s*(?:\/>|>([\s\S]*?)<\/c>)/g;

function parseRow(rowXml, wb) {
  const cells = [];
  CELL_RE.lastIndex = 0;
  let m;
  while ((m = CELL_RE.exec(rowXml))) {
    const idx = colIndex(m[1]);
    const attrs = m[2] || '';
    const inner = m[3] || '';
    if (!inner) { cells[idx] = ''; continue; }

    const tMatch = /\st="([^"]+)"/.exec(attrs);
    const type = tMatch ? tMatch[1] : 'n';
    let value = '';

    if (type === 'inlineStr') {
      let t; const tre = /<t[^>]*>([\s\S]*?)<\/t>/g; 
      while ((t = tre.exec(inner))) value += t[1];
      cells[idx] = unescapeXml(value);
      continue;
    }

    // <v xml:space="preserve"> conserve les espaces de fin. Exiger <v> nu
    // faisait ressortir ces cellules vides — silencieusement.
    const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(inner);
    if (!v) { cells[idx] = ''; continue; }
    value = v[1];

    if (type === 's') {
      // Chaîne partagée : la valeur est un index.
      const i = +value;
      cells[idx] = wb.shared[i] !== undefined ? wb.shared[i] : '';
    } else if (type === 'str' || type === 'e') {
      // « str » : résultat textuel d'une formule. C'est le cas de TOUTES les
      // cellules d'une feuille de calcul intermédiaire — les ignorer viderait
      // la feuille entière.
      cells[idx] = unescapeXml(value);
    } else if (type === 'b') {
      cells[idx] = value === '1' ? 'VRAI' : 'FAUX';
    } else {
      const num = +value;
      const sMatch = /\ss="(\d+)"/.exec(attrs);
      const styleIdx = sMatch ? +sMatch[1] : -1;
      if (styleIdx >= 0 && wb.styleIsDate[styleIdx] && Number.isFinite(num) && num > 0) {
        cells[idx] = excelSerialToISO(num);
      } else {
        cells[idx] = Number.isFinite(num) ? num : unescapeXml(value);
      }
    }
  }
  for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
  return cells;
}

/* ── Conversion CSV ────────────────────────────────────────────────────── */

function csvCell(v, sep) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

/**
 * Convertit une feuille en CSV sans jamais la charger en entier.
 *
 * Le résultat est assemblé en Blob par morceaux : contrairement à une chaîne,
 * un Blob n'a pas de limite de 512 Mo. C'est ce qui permet de produire un CSV
 * de plusieurs centaines de méga-octets depuis un onglet illisible autrement.
 *
 * @returns {Promise<{blob:Blob, rows:number, cols:number}>}
 */
export async function sheetToCsvBlob(wb, sheetName, opts = {}) {
  const sep = opts.separator || ';';
  const parts = [];
  let chunk = [];
  let rows = 0, cols = 0;

  // Un BOM pour qu'Excel ouvre l'accentuation correctement sans rien demander.
  parts.push('\ufeff');

  for await (const row of streamSheetRows(wb, sheetName, {
    limit: opts.limit,
    onProgress: opts.onProgress,
  })) {
    if (opts.filter && rows > 0 && !opts.filter(row)) continue;
    cols = Math.max(cols, row.length);
    chunk.push(row.map(c => csvCell(c, sep)).join(sep));
    rows++;
    if (chunk.length >= 2000) {
      parts.push(chunk.join('\r\n') + '\r\n');
      chunk = [];
      if (opts.onRows) opts.onRows(rows);
    }
  }
  if (chunk.length) parts.push(chunk.join('\r\n') + '\r\n');
  if (opts.onRows) opts.onRows(rows);

  return { blob: new Blob(parts, { type: 'text/csv;charset=utf-8' }), rows, cols };
}
