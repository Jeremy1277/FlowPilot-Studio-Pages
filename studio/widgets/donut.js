/**
 * FlowPilot Studio — Widget Secteurs (donut.js) v3
 * Légende comme bloc flottant draggable sur le graphique
 */

const DONUT_PALETTES = {
  vif: ['#4a7fa5','#EF9F27','#1D9E75','#D85A30','#7F77DD','#85BC25','#D4537E','#378ADD','#639922','#E8A838'],
  pastel: ['#9FB8CE','#F0C896','#8FCBAE','#E3A98C','#BCB6E8','#BBD89A','#E3A6BE','#9EC3E8','#A8C481','#F0D29E'],
  nb: ['#2B2F36','#46505A','#626D78','#7E8993','#99A3AC','#B3BBC2','#CBD1D6','#E0E3E6','#525252','#717171']
};

function donutPalette(w) {
  return DONUT_PALETTES[w.donutPalette] || DONUT_PALETTES.vif;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function shade(hex, pct) {
  const [r,g,b] = hexToRgb(hex);
  const f = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  return 'rgb(' + Math.round((f-r)*p+r) + ',' + Math.round((f-g)*p+g) + ',' + Math.round((f-b)*p+b) + ')';
}
// Génère un dégradé radial clair→foncé par couleur, centré sur le donut.
function donutRadialGradients(ctx, colors, cx, cy, rInner, rOuter) {
  return colors.map(c => {
    const g = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
    g.addColorStop(0, shade(c, 0.35));
    g.addColorStop(1, shade(c, -0.1));
    return g;
  });
}
// Plugin Chart.js : ombre portée douce sous l'ensemble du graphique (pas par segment).
const donutShadowPlugin = {
  id: 'fpDonutShadow',
  beforeDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(20,30,45,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
  },
  afterDatasetsDraw(chart) {
    chart.ctx.restore();
  }
};
// Plugin Chart.js : reflet de brillance façon "glace" sur le tiers supérieur
// de chaque part. Actif uniquement quand la palette "vif" est sélectionnée.
function donutGlossPlugin(active) {
  return {
    id: 'fpDonutGloss',
    afterDatasetsDraw(chart) {
      if (!active) return;
      const ctx  = chart.ctx;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      meta.data.forEach(function(arc) {
        const startAngle = arc.startAngle;
        const endAngle   = arc.endAngle;
        const outerR     = arc.outerRadius;
        const innerR     = arc.innerRadius;
        const x = arc.x, y = arc.y;
        const grad = ctx.createLinearGradient(x, y - outerR, x, y);
        grad.addColorStop(0,   'rgba(255,255,255,0.38)');
        grad.addColorStop(0.55,'rgba(255,255,255,0.08)');
        grad.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(x, y, outerR, startAngle, endAngle);
        ctx.arc(x, y, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      });
      ctx.restore();
    }
  };
}

// Détermine si le mode d'affichage par défaut doit être "valeur" plutôt que
// "%", selon l'agrégation choisie à la création du widget (count/countd → %,
// sum/avg/min/max/median/std/age → valeur réelle), sauf si l'utilisateur a
// explicitement défini son propre choix (donutShowPct/donutShowVal).
function donutLabelDefaults(w) {
  const isCountAggr = !w.aggr || w.aggr === 'count' || w.aggr === 'countd';
  const showPct = w.donutShowPct !== undefined ? w.donutShowPct !== false : isCountAggr;
  const showVal = w.donutShowVal !== undefined ? !!w.donutShowVal       : !isCountAggr;
  return { showPct, showVal };
}

export function renderDonut(w, elId, rawLabels, rawValues, chartInstances, fmtNum, canvasId) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (!rawLabels.length) {
    el.innerHTML = '<div class="wc-empty"><div>Aucune donnée</div></div>';
    return;
  }

  const variant   = w.donutVariant  || 'donut';
  const topN      = w.donutTopN     || 8;
  const explode   = w.donutExplode  || false;
  const hoverFx   = w.donutHoverFx  || false;
  const { showPct, showVal } = donutLabelDefaults(w);
  const labelSize = w.donutLabelSize || 12;
  const showLegend = w.donutLegend  !== 'none';
  // Position légende : {x, y} en % du conteneur
  const legX      = w.donutLegX     ?? 82;
  const legY      = w.donutLegY     ?? 10;
  const legW      = w.donutLegW     ?? 160;
  const legH      = w.donutLegH     ?? null; // null = auto (max-height 80%)

  const colors    = donutPalette(w);
  const isVifPalette = !w.donutPalette || w.donutPalette === 'vif';
  let   cutout    = variant === 'pie' ? '0%' : variant === 'semi' ? '50%' : ((w.donutCutout ?? 62) + '%');
  const rotation  = variant === 'semi' ? -90 : 0;
  const circumference = variant === 'semi' ? 180 : 360;

  // Données
  let pairs = rawLabels.map((l, i) => [l, rawValues[i]]);
  pairs.sort((a, b) => b[1] - a[1]);
  if (pairs.length > topN) {
    const rest = pairs.slice(topN).reduce((s, p) => s + p[1], 0);
    pairs = pairs.slice(0, topN);
    if (rest > 0) pairs.push(['Autres', rest]);
  }
  const labels   = pairs.map(p => p[0]);
  const values   = pairs.map(p => p[1]);
  const total    = values.reduce((s, v) => s + v, 0);
  const overrides = w.donutColorOverrides || {};
  const bgColors = labels.map((l, i) => overrides[l] || colors[i % colors.length]);
  const offset   = explode ? labels.map(() => 10) : labels.map(() => 0);

  // ── Structure : conteneur relatif + canvas plein + légende absolue ──
  el.innerHTML = '';
  el.style.cssText = 'position:relative;width:100%;height:100%';

  // Canvas plein
  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  el.appendChild(canvas);

  // Légende flottante draggable
  if (showLegend) {
    const leg = document.createElement('div');
    leg.id = canvasId + '-leg';
    leg.style.cssText = [
      'position:absolute',
      'left:' + legX + '%',
      'top:' + legY + '%',
      'width:' + legW + 'px',
      (legH ? 'height:' + legH + 'px' : 'max-height:80%'),
      'background:'+(document.body&&document.body.classList.contains('fp-dark')?'rgba(21,31,44,0.92)':'rgba(255,255,255,0.92)'),
      'backdrop-filter:blur(4px)',
      'border:1px solid var(--border)',
      'border-radius:10px',
      'padding:8px 10px',
      'box-shadow:0 2px 10px rgba(13,27,42,.1)',
      'cursor:grab',
      'user-select:none',
      'z-index:10',
      'overflow-y:auto',
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      'font-family:DM Sans,sans-serif',
      'box-sizing:border-box',
    ].join(';');

    labels.forEach(function(l, i) {
      const pct = total ? Math.round(values[i] / total * 100) : 0;
      let legTxt;
      if (showVal && showPct) legTxt = fmtNum(values[i]) + ' (' + pct + '%)';
      else if (showVal)       legTxt = fmtNum(values[i]);
      else                    legTxt = pct + '%';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0';
      row.innerHTML =
        '<div style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:' + bgColors[i] + '"></div>'
        + '<div style="font-size:12px;color:var(--dark,#1a2733);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + l + '">' + l + '</div>'
        + '<div style="font-size:11px;font-weight:700;color:var(--mid);flex-shrink:0;margin-left:4px">' + legTxt + '</div>';
      leg.appendChild(row);
    });

    el.appendChild(leg);

    // Drag & drop de la légende
    makeDraggableLegend(leg, el, w, canvasId);

    // Resize par les 4 coins
    makeResizableLegend(leg, el, w, canvasId);
  }

  // Détruire chart existant
  if (chartInstances[canvasId]) {
    try { chartInstances[canvasId].destroy(); } catch(e) {}
    delete chartInstances[canvasId];
  }

  // Plugin étiquettes
  const labelsPlugin = {
    id: 'fpDonutLabels',
    afterDatasetsDraw(chart) {
      if (!showPct && !showVal) return;
      const ctx    = chart.ctx;
      const meta   = chart.getDatasetMeta(0);
      const ds     = chart.data.datasets[0].data;
      const total_ = ds.reduce((s, v) => s + Number(v), 0);
      ctx.save();
      meta.data.forEach(function(arc, i) {
        const val  = Number(ds[i]);
        const pct_ = total_ ? Math.round(val / total_ * 100) : 0;
        if (pct_ < 3) return;
        const angle  = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;
        const radius = (arc.outerRadius + arc.innerRadius) / 2;
        const x = arc.x + Math.cos(angle) * radius;
        const y = arc.y + Math.sin(angle) * radius;
        const bg  = bgColors[i] || '#888';
        const r_  = parseInt(bg.slice(1,3),16);
        const g_  = parseInt(bg.slice(3,5),16);
        const b_  = parseInt(bg.slice(5,7),16);
        const lum = (0.299*r_ + 0.587*g_ + 0.114*b_) / 255;
        ctx.fillStyle   = lum > 0.55 ? '#1a2733' : '#ffffff';
        ctx.strokeStyle = lum > 0.55 ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.25)';
        ctx.lineWidth   = 3;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        if (showPct && showVal) {
          ctx.font = 'bold ' + labelSize + 'px DM Sans,sans-serif';
          ctx.strokeText(pct_ + '%', x, y - labelSize * 0.65);
          ctx.fillText(pct_ + '%',   x, y - labelSize * 0.65);
          ctx.font = 'bold ' + (labelSize - 2) + 'px DM Sans,sans-serif';
          ctx.strokeText(fmtNum(val), x, y + labelSize * 0.65);
          ctx.fillText(fmtNum(val),   x, y + labelSize * 0.65);
        } else {
          ctx.font = 'bold ' + labelSize + 'px DM Sans,sans-serif';
          const txt = showPct ? pct_ + '%' : fmtNum(val);
          ctx.strokeText(txt, x, y);
          ctx.fillText(txt,   x, y);
        }
      });
      ctx.restore();
    }
  };

  // Dégradé radial clair→foncé par segment, centré sur le canvas une fois
  // sa taille connue (le conteneur a déjà sa hauteur/largeur via le CSS).
  const cw = canvas.clientWidth  || el.clientWidth  || 200;
  const ch = canvas.clientHeight || el.clientHeight || 200;
  const cx = cw / 2;
  const cy = variant === 'semi' ? ch : ch / 2;
  const rOuter = Math.min(cw, ch * (variant === 'semi' ? 2 : 1)) / 2;
  const rInner = rOuter * (variant === 'pie' ? 0.12 : parseFloat(cutout) / 100 * 0.9);
  const ctx2d  = canvas.getContext('2d');
  const gradColors = donutRadialGradients(ctx2d, bgColors, cx, cy, rInner, rOuter);

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    plugins: [donutShadowPlugin, donutGlossPlugin(isVifPalette), labelsPlugin],
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: gradColors,
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: (explode || !hoverFx) ? 0 : 8,
        offset
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      rotation,
      circumference,
      cutout,
      onClick: function(evt, elements) {
        if (!elements.length) return;
        const idx = elements[0].index;
        openDonutColorPicker(canvas, evt, labels[idx], bgColors[idx], w, elId);
      },
      onHover: function(evt, elements) {
        canvas.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(c) {
              const pct = total ? Math.round(c.raw / total * 100) : 0;
              return c.label + ' : ' + fmtNum(c.raw) + ' (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

// Ouvre un <input type="color"> natif au point cliqué pour personnaliser
// la couleur d'une part précise. La valeur choisie est persistée dans
// w.donutColorOverrides[label] puis le graphique est redessiné.
function openDonutColorPicker(canvas, evt, label, currentColor, w, elId) {
  const native = (evt && evt.native) ? evt.native : evt;
  const rect = canvas.getBoundingClientRect();
  const picker = document.createElement('input');
  picker.type = 'color';
  // Les inputs color n'acceptent que #RRGGBB ; on convertit si besoin.
  picker.value = /^#[0-9a-fA-F]{6}$/.test(currentColor) ? currentColor : '#4a7fa5';
  picker.style.cssText = [
    'position:fixed',
    'left:' + (native ? native.clientX : rect.left + rect.width / 2) + 'px',
    'top:' + (native ? native.clientY : rect.top + rect.height / 2) + 'px',
    'width:1px',
    'height:1px',
    'opacity:0',
    'border:none',
    'pointer-events:none',
    'z-index:9999'
  ].join(';');
  document.body.appendChild(picker);

  function cleanup() {
    picker.removeEventListener('change', onChange);
    picker.removeEventListener('blur', onBlur);
    if (picker.parentNode) picker.parentNode.removeChild(picker);
  }
  function onChange() {
    if (!w.donutColorOverrides) w.donutColorOverrides = {};
    w.donutColorOverrides[label] = picker.value;
    if (typeof window.renderWidgetBody === 'function') {
      window.renderWidgetBody(w, elId, false);
    }
    cleanup();
  }
  function onBlur() {
    setTimeout(cleanup, 150);
  }
  picker.addEventListener('change', onChange);
  picker.addEventListener('blur', onBlur);
  picker.click();
}

// Rendre la légende draggable dans son conteneur
function makeDraggableLegend(leg, container, w, canvasId) {
  let startX, startY, startLeft, startTop;

  leg.addEventListener('mousedown', function(e) {
    if (e.target !== leg && !e.target.closest('[id$="-leg"]')) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    startX    = e.clientX;
    startY    = e.clientY;
    startLeft = parseFloat(leg.style.left) / 100 * rect.width;
    startTop  = parseFloat(leg.style.top)  / 100 * rect.height;
    leg.style.cursor = 'grabbing';

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const r2 = container.getBoundingClientRect();
      const newL = Math.max(0, Math.min(r2.width  - leg.offsetWidth,  startLeft + dx));
      const newT = Math.max(0, Math.min(r2.height - leg.offsetHeight, startTop  + dy));
      const pctL = newL / r2.width  * 100;
      const pctT = newT / r2.height * 100;
      leg.style.left = pctL + '%';
      leg.style.top  = pctT + '%';
      // Sauvegarder dans le widget
      const widgetObj = window.__fpWidgets ? window.__fpWidgets.find(x=>x.id && canvasId.includes(x.id)) : null;
      if (widgetObj) { widgetObj.donutLegX = pctL; widgetObj.donutLegY = pctT; }
    }

    function onUp() {
      leg.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Ajoute 4 poignées de redimensionnement aux coins de la légende
function makeResizableLegend(leg, container, w, canvasId) {
  const CORNERS = [
    { key: 'nw', cursor: 'nwse-resize', top: '-4px',  left: '-4px',  signX: -1, signY: -1 },
    { key: 'ne', cursor: 'nesw-resize', top: '-4px',  right: '-4px', signX:  1, signY: -1 },
    { key: 'sw', cursor: 'nesw-resize', bottom: '-4px', left: '-4px', signX: -1, signY: 1 },
    { key: 'se', cursor: 'nwse-resize', bottom: '-4px', right: '-4px', signX: 1, signY: 1 },
  ];

  // Révéler les poignées au survol de la légende
  leg.addEventListener('mouseenter', function(){
    leg.querySelectorAll('.fp-donut-resize-handle').forEach(function(h){ h.style.opacity = '1'; });
  });
  leg.addEventListener('mouseleave', function(){
    leg.querySelectorAll('.fp-donut-resize-handle').forEach(function(h){ h.style.opacity = '0'; });
  });

  CORNERS.forEach(function(c) {
    const handle = document.createElement('div');
    handle.className = 'fp-donut-resize-handle';
    let posCss = 'position:absolute;width:11px;height:11px;border-radius:50%;background:var(--card);border:2px solid #EF9F27;cursor:' + c.cursor + ';z-index:11;opacity:0;transition:opacity .15s;';
    if (c.top)    posCss += 'top:' + c.top + ';';
    if (c.bottom) posCss += 'bottom:' + c.bottom + ';';
    if (c.left)   posCss += 'left:' + c.left + ';';
    if (c.right)  posCss += 'right:' + c.right + ';';
    handle.style.cssText = posCss;
    leg.appendChild(handle);

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation(); // ne pas déclencher le drag de la légende

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = leg.offsetWidth;
      const startH = leg.offsetHeight;
      const rect = container.getBoundingClientRect();
      const startLeftPx = parseFloat(leg.style.left) / 100 * rect.width;
      const startTopPx  = parseFloat(leg.style.top)  / 100 * rect.height;

      function onMove(ev) {
        const dx = (ev.clientX - startX) * c.signX;
        const dy = (ev.clientY - startY) * c.signY;

        let newW = Math.max(90, Math.min(rect.width * 0.9, startW + dx));
        let newH = Math.max(40, Math.min(rect.height * 0.9, startH + dy));

        leg.style.width  = newW + 'px';
        leg.style.height = newH + 'px';

        // Si on resize depuis le coin gauche/haut, il faut aussi repositionner
        // pour que le coin opposé reste fixe (effet "ancré")
        if (c.signX < 0) {
          const newLeftPx = startLeftPx - (newW - startW);
          leg.style.left = Math.max(0, newLeftPx / rect.width * 100) + '%';
        }
        if (c.signY < 0) {
          const newTopPx = startTopPx - (newH - startH);
          leg.style.top = Math.max(0, newTopPx / rect.height * 100) + '%';
        }

        // Sauvegarder dans le widget
        const widgetObj = window.__fpWidgets ? window.__fpWidgets.find(x => x.id && canvasId.includes(x.id)) : null;
        if (widgetObj) {
          widgetObj.donutLegW = Math.round(newW);
          widgetObj.donutLegH = Math.round(newH);
          if (c.signX < 0) widgetObj.donutLegX = parseFloat(leg.style.left);
          if (c.signY < 0) widgetObj.donutLegY = parseFloat(leg.style.top);
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

export function renderDonutPanel(w) {
  const variant   = w.donutVariant  || 'donut';
  const palette   = w.donutPalette  || 'vif';
  const legend    = w.donutLegend !== undefined ? w.donutLegend : 'right';
  const topN      = w.donutTopN    || 8;
  const explode   = w.donutExplode || false;
  const hoverFx   = w.donutHoverFx || false;
  const { showPct, showVal } = donutLabelDefaults(w);
  const cutout    = w.donutCutout  ?? 62;
  const labelSize = w.donutLabelSize || 12;
  const legW      = w.donutLegW    || 160;

  function sec(title, html) {
    return '<div style="border-top:1px solid var(--border);padding:8px 0 4px">'
      + '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:7px">' + title + '</div>'
      + html + '</div>';
  }
  function rd(name, val, lbl, cur) {
    return '<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">'
      + '<input type="radio" name="' + name + '" value="' + val + '" ' + (cur===val?'checked':'') + ' style="accent-color:#EF9F27"/> ' + lbl + '</label>';
  }
  function chk(field, lbl, checked) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-top:5px">'
      + '<input type="checkbox" data-field="' + field + '" ' + (checked?'checked':'') + ' style="accent-color:#EF9F27"/> ' + lbl + '</label>';
  }
  function slider(id, label, min, max, val, unit) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-top:7px">'
      + '<span style="font-size:11px;color:var(--muted);white-space:nowrap;width:90px">' + label + '</span>'
      + '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '" style="flex:1;accent-color:#EF9F27"/>'
      + '<span id="' + id + '-val" style="font-size:10px;color:var(--muted);width:32px">' + val + unit + '</span>'
      + '</div>';
  }
  function swatch(name, val, lbl, cur, colors) {
    const grad = 'linear-gradient(90deg,' + colors.slice(0,5).join(',') + ')';
    return '<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;padding:5px 9px;border:1px solid ' + (cur===val?'#EF9F27':'#e2e8f0') + ';border-radius:9px;background:' + (cur===val?'#fff7ec':'linear-gradient(180deg,#ffffff,#f6f9fc)') + ';box-shadow:0 1px 3px rgba(13,27,42,.08)">'
      + '<input type="radio" name="' + name + '" value="' + val + '" ' + (cur===val?'checked':'') + ' style="accent-color:#EF9F27"/>'
      + '<span class="fp-chip" style="width:36px;height:16px;background:' + grad + ';display:inline-block"></span>'
      + lbl + '</label>';
  }

  return sec('Forme',
    '<div style="display:flex;flex-wrap:wrap;gap:4px 14px">'
    + rd('dn-variant','donut','Anneau',variant)
    + rd('dn-variant','pie','Camembert',variant)
    + rd('dn-variant','semi','Semi-cercle',variant)
    + '</div>'
    + '<div id="dn-cutout-row" style="display:' + (variant==='pie'?'none':'flex') + ';align-items:center;gap:8px;margin-top:8px">'
    + '<span style="font-size:11px;color:var(--muted);white-space:nowrap">Épaisseur trou</span>'
    + '<input type="range" id="dn-cutout" min="20" max="85" value="' + cutout + '" style="flex:1;accent-color:#EF9F27"/>'
    + '<span id="dn-cutout-val" style="font-size:10px;color:var(--muted);width:28px">' + cutout + '%</span>'
    + '</div>'
  )
  + sec('Couleurs',
    '<div style="display:flex;flex-wrap:wrap;gap:6px">'
    + swatch('dn-palette','vif','Vif',palette,DONUT_PALETTES.vif)
    + swatch('dn-palette','pastel','Pastel',palette,DONUT_PALETTES.pastel)
    + swatch('dn-palette','nb','Noir & blanc',palette,DONUT_PALETTES.nb)
    + '</div>'
    + '<div style="font-size:10px;color:var(--muted);margin-top:8px;font-style:italic">Cliquez sur une part du graphique pour personnaliser sa couleur individuellement.</div>'
    + (Object.keys(w.donutColorOverrides || {}).length
        ? '<button type="button" id="dn-reset-colors" style="margin-top:7px;font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);cursor:pointer;color:var(--mid)">↺ Réinitialiser les couleurs personnalisées</button>'
        : '')
  )
  + sec('Étiquettes sur les parts',
    chk('donutShowPct','Pourcentages', showPct)
    + chk('donutShowVal','Valeurs', showVal)
    + slider('dn-labelsize','Taille texte',8,18,labelSize,'px')
  )
  + sec('Légende',
    chk('donutShowLeg','Afficher la légende', legend !== 'none')
    + slider('dn-legw','Largeur légende',80,280,legW,'px')
    + '<div style="font-size:10px;color:var(--muted);margin-top:6px;font-style:italic">Glissez la légende directement sur le graphique pour la repositionner.</div>'
  )
  + sec('Affichage',
    chk('donutExplode','Parts éclatées', explode)
    + chk('donutHoverFx','Effet de survol (halo)', hoverFx)
    + '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">'
    + '<span style="font-size:11px;color:var(--muted)">Top N</span>'
    + '<select id="dn-topn" style="border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11px;font-family:DM Sans,sans-serif">'
    + [5,8,10,15].map(n => '<option value="'+n+'" '+(topN===n?'selected':'')+'>Top '+n+'</option>').join('')
    + '</select>'
    + '</div>'
  );
}

export function readDonutPanel(container) {
  const get = sel => container.querySelector(sel);
  const showLeg = get('input[data-field="donutShowLeg"]')?.checked !== false;
  return {
    donutVariant:   get('input[name="dn-variant"]:checked')?.value || 'donut',
    donutPalette:   get('input[name="dn-palette"]:checked')?.value || 'vif',
    donutLegend:    showLeg ? 'float' : 'none',
    donutTopN:      parseInt(get('#dn-topn')?.value) || 8,
    donutCutout:    parseInt(get('#dn-cutout')?.value) ?? 62,
    donutExplode:   get('input[data-field="donutExplode"]')?.checked || false,
    donutHoverFx:   get('input[data-field="donutHoverFx"]')?.checked || false,
    donutShowPct:   get('input[data-field="donutShowPct"]')?.checked !== false,
    donutShowVal:   get('input[data-field="donutShowVal"]')?.checked || false,
    donutLabelSize: parseInt(get('#dn-labelsize')?.value) || 12,
    donutLegW:      parseInt(get('#dn-legw')?.value) || 160,
  };
}
