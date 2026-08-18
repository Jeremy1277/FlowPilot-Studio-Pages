/**
 * FlowPilot Studio — Widget Histogramme (bar.js)
 * Module autonome, chargé par index.html
 * Toutes les options d'affichage de l'histogramme sont gérées ici.
 *
 * Options disponibles sur l'objet widget (w) :
 *   w.barVariant   : 'vertical' | 'horizontal' | 'stacked'   (défaut: vertical)
 *   w.barColor     : 'mono' | 'palette' | 'gradient'         (défaut: mono)
 *   w.color        : string hex (si mono)
 *   w.barRounded   : 0-12 (px, défaut: 5)
 *   w.barTrend     : true | false (courbe de tendance)
 *   w.barGoal      : number | null (ligne objectif)
 *   w.barGoalLabel : string (label de la ligne objectif)
 *   w.barSort      : 'desc' | 'asc' | 'alpha' | 'natural'    (défaut: desc)
 *   w.barTopN      : number | null (5, 10, 20, null = tout)
 *   w.showValues   : true | false (valeurs sur barres)
 */

const FP_PALETTE = [
  '#4a7fa5','#EF9F27','#1D9E75','#D85A30','#7F77DD','#85BC25',
  '#D4537E','#378ADD','#639922','#E8A838','#5C9BC1','#A66C9F'
];

/**
 * Calcule un dégradé de couleur du plus clair au plus foncé
 * selon la valeur (plus haute = plus saturée)
 */


/**
 * Calcule la droite de tendance (régression linéaire)
 * Retourne un tableau de N valeurs
 */
function trendLine(values) {
  const n = values.length;
  if (n < 2) return values.slice();
  const xs = values.map((_,i) => i);
  const meanX = xs.reduce((s,x)=>s+x,0)/n;
  const meanY = values.reduce((s,y)=>s+y,0)/n;
  const slope = xs.reduce((s,x,i)=>s+(x-meanX)*(values[i]-meanY),0) /
                xs.reduce((s,x)=>s+(x-meanX)**2,0);
  const intercept = meanY - slope*meanX;
  return xs.map(x => slope*x + intercept);
}

/**
 * Prépare les données triées et filtrées selon les options du widget
 */
function prepareBarData(labels, values, w) {
  const topN = w.barTopN || null;
  const sort = w.barSort || 'desc';

  let pairs = labels.map((l,i) => [l, values[i]]);

  if (sort === 'desc') pairs.sort((a,b) => b[1]-a[1]);
  else if (sort === 'asc') pairs.sort((a,b) => a[1]-b[1]);
  else if (sort === 'alpha') pairs.sort((a,b) => String(a[0]).localeCompare(String(b[0])));
  // 'natural' = ordre d'arrivée, pas de tri

  if (topN && pairs.length > topN) {
    const top = pairs.slice(0, topN);
    const rest = pairs.slice(topN);
    const restSum = rest.reduce((s,p) => s+p[1], 0);
    if (restSum > 0) top.push(['Autres', restSum]);
    pairs = top;
  }

  return {
    labels: pairs.map(p => p[0]),
    values: pairs.map(p => p[1])
  };
}

/**
 * Calcule les couleurs selon le mode choisi
 */
function computeColors(values, w) {
  const mode = w.barColor || 'mono';
  const base = w.color || '#4a7fa5';
  const n = values.length;

  if (mode === 'palette') {
    return values.map((_,i) => FP_PALETTE[i % FP_PALETTE.length]);
  }
  if (mode === 'gradient') {
    // Trier par valeur pour le dégradé : plus haute valeur = couleur plus intense
    const max = Math.max(...values);
    return values.map(v => {
      const t = max > 0 ? 0.3 + (v/max)*0.7 : 0.5;
      const r = parseInt(base.slice(1,3),16);
      const g = parseInt(base.slice(3,5),16);
      const b = parseInt(base.slice(5,7),16);
      const nr = Math.round(r+(255-r)*(1-t));
      const ng = Math.round(g+(255-g)*(1-t));
      const nb = Math.round(b+(255-b)*(1-t));
      return `rgb(${nr},${ng},${nb})`;
    });
  }
  // mono
  return values.map(() => base + 'cc');
}

/**
 * Rendu principal du widget histogramme
 * @param {Object} w       - objet widget
 * @param {string} elId    - id du conteneur DOM
 * @param {Array}  rawLabels - labels bruts
 * @param {Array}  rawValues - valeurs brutes
 * @param {Object} chartInstances - registre Chart.js global
 * @param {Function} fmtNum - formateur de nombres global
 */
export function renderBar(w, elId, rawLabels, rawValues, chartInstances, fmtNum, canvasId) {
  const el = document.getElementById(elId);
  if (!el) return;

  // Utiliser le canvasId fourni ou en générer un propre (sans tirets)
  if (!canvasId) canvasId = 'cvb' + w.id.replace(/[^a-zA-Z0-9]/g, '');
  el.innerHTML = '<div class="chart-wrap"><canvas id="'+canvasId+'"></canvas></div>';

  if (!rawLabels.length) return;

  const { labels, values } = prepareBarData(rawLabels, rawValues, w);
  // Couleur par défaut si non définie
  if (!w.color || w.color === '#000000') w.color = '#4a7fa5';
  const colors = computeColors(values, w);
  const isHorizontal = w.barVariant === 'horizontal';
  const isStacked   = w.barVariant === 'stacked';
  const rounded     = w.barRounded ?? 5;
  const showValues  = w.showValues !== false;

  // Datasets
  const datasets = [];

  // Dataset principal
  const mainDataset = {
    data: values,
    backgroundColor: colors,
    borderColor: colors.map(c => c.replace('cc','').replace('rgb(','rgba(').replace(')',',0.9)')),
    borderWidth: 0,
    borderRadius: rounded,
    borderSkipped: false,
    label: w.title || 'Valeur'
  };

  if (isStacked && w.col2b) {
    // Pour les barres empilées — à implémenter avec 2 colonnes
    mainDataset.stack = 'stack0';
  }
  datasets.push(mainDataset);

  // Courbe de tendance
  if (w.barTrend && !isHorizontal && values.length >= 3) {
    const trend = trendLine(values);
    datasets.push({
      type: 'line',
      label: 'Tendance',
      data: trend,
      borderColor: '#D85A30',
      borderWidth: 2,
      borderDash: [5,4],
      pointRadius: 0,
      fill: false,
      tension: 0.3,
      backgroundColor: 'transparent'
    });
  }

  // Options Chart.js
  const chartType = 'bar';
  const indexAxis = isHorizontal ? 'y' : 'x';

  const annotation = {};
  if (w.barGoal != null && !isNaN(Number(w.barGoal))) {
    annotation.goal = {
      type: 'line',
      [isHorizontal ? 'xMin' : 'yMin']: Number(w.barGoal),
      [isHorizontal ? 'xMax' : 'yMax']: Number(w.barGoal),
      borderColor: '#D85A30',
      borderWidth: 2,
      borderDash: [6,4],
      label: {
        content: w.barGoalLabel || ('Objectif: '+fmtNum(Number(w.barGoal))),
        enabled: true,
        position: 'end',
        backgroundColor: '#D85A30',
        color: '#fff',
        font: { size: 10, weight: 'bold' }
      }
    };
  }

  const cfg = {
    type: chartType,
    data: { labels, datasets },
    options: {
      indexAxis,
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => fmtNum(c.raw)
          }
        },
        fpValueLabels: { display: showValues, maxLabels: 15 },
        ...(Object.keys(annotation).length ? { annotation: { annotations: annotation } } : {})
      },
      layout: { padding: { top: showValues ? 20 : 8, right: 8, left: 4 } },
      scales: {
        x: {
          stacked: isStacked,
          grid: { display: isHorizontal },
          ticks: {
            font: { size: 9 },
            maxRotation: isHorizontal ? 0 : 38,
            autoSkip: true,
            maxTicksLimit: 20,
            callback: function(v) {
              if (isHorizontal) return fmtNum(v);
              return this.getLabelForValue(v);
            }
          }
        },
        y: {
          stacked: isStacked,
          grid: { color: (window.FP_THEME&&window.FP_THEME.grid)||'#f0f3f7', display: !isHorizontal },
          ticks: {
            font: { size: 9 },
            callback: function(v) {
              if (isHorizontal) return this.getLabelForValue(v);
              return fmtNum(v);
            }
          }
        }
      }
    }
  };

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (chartInstances[canvasId]) {
    try { chartInstances[canvasId].destroy(); } catch(e) {}
  }
  chartInstances[canvasId] = new Chart(canvas, cfg);
}

/**
 * Panneau d'options de l'histogramme
 * Génère le HTML du panneau latéral "Modifier" pour ce widget
 */


/**
 * Lit les valeurs du panneau et retourne un objet de mise à jour
 */

