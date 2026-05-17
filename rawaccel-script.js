/**
 * ZIG-ON — Smart Raw Accel Generator
 * rawaccel-script.js
 *
 * Architecture :
 *  1. UI bootstrap (mode tabs, objective buttons, param visibility)
 *  2. Parameter recommendation engine (per mode × objective)
 *  3. Curve math functions (per mode)
 *  4. Canvas rendering
 *  5. Synthesis table + copy hint
 */

'use strict';

/* ═══════════════════════════════════════════════
   CONSTANTS & REFERENCES
═══════════════════════════════════════════════ */
const BASE_POLLING = 1000; // Reference polling rate for all calculations

const $ = id => document.getElementById(id);

// Hardware inputs
const hwDpi    = $('hw-dpi');
const hwSens   = $('hw-sens');
const hwPoll   = $('hw-poll');
const hwRes    = $('hw-res');

// Mode tabs
const modeTabs = document.querySelectorAll('.mode-tab');

// Objective buttons
const objBtns  = document.querySelectorAll('.obj-btn');

// Output elements
const outputZone  = $('output-zone');
const outputStrip = $('output-strip');
const statsStrip  = $('stats-strip');
const synthTable  = $('synth-table');
const copyHint    = $('copy-hint');
const canvas      = $('ra-canvas');
const ctx         = canvas.getContext('2d');

// Stat tiles
const stSlow  = $('st-slow');
const stMed   = $('st-med');
const stFast  = $('st-fast');
const stBoost = $('st-boost');

let currentMode = 'linear';
let lastResult  = null;  // Store generated params for chart redraw on resize


/* ═══════════════════════════════════════════════
   1. UI BOOTSTRAP
═══════════════════════════════════════════════ */

// Mode tabs
modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    showParamsFor(currentMode);
  });
});

function showParamsFor(mode) {
  document.querySelectorAll('.param-group').forEach(g => {
    g.classList.toggle('visible', g.dataset.for === mode);
  });
}

// Objective radio buttons styled as cards
objBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    objBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    btn.querySelector('input[type="radio"]').checked = true;
  });
});

// Generate button
$('btn-generate').addEventListener('click', generate);

// Resize → redraw
window.addEventListener('resize', () => {
  if (lastResult) drawChart(lastResult.curveFn, lastResult.params);
});

// Init
showParamsFor(currentMode);


/* ═══════════════════════════════════════════════
   2. PARAMETER RECOMMENDATION ENGINE
   All calculations reference BASE_POLLING=1000 Hz.
   Formula foundation:
     eDPI  = DPI × in-game sensitivity
     pollingFactor = BASE_POLLING / actualPolling
       → higher polling = more counts/ms at same speed
         → slower threshold speeds needed
     speedRef (counts/ms) = DPI × pollingFactor / 1000
       (counts per millisecond a "medium" wrist movement produces)
═══════════════════════════════════════════════ */

function getHardware() {
  return {
    dpi:     parseInt(hwDpi.value, 10),
    sens:    parseFloat(hwSens.value) || 0.4,
    polling: parseInt(hwPoll.value, 10),
    res:     parseInt(hwRes.value, 10),
  };
}

function getObjective() {
  const checked = document.querySelector('input[name="objective"]:checked');
  return checked ? checked.value : 'stable';
}

/**
 * Core recommendation factory.
 * Returns an object with:
 *   { params: {key: value}, curveFn: (speed) => multiplier }
 */
function computeRecommendation(mode, hw, objective) {
  const pf = BASE_POLLING / hw.polling;  // polling factor: >1 at low Hz, <1 at high Hz
  const eDPI = hw.dpi * hw.sens;

  // Normalised "medium speed" in counts/ms at actual polling rate
  // Typical medium flick ~ 20 cm/s. At 800dpi/1000Hz that's ~2.6 c/ms
  const medSpeed = (hw.dpi / 800) * (BASE_POLLING / hw.polling) * 2.6;

  // Objective multipliers
  const objMap = {
    stable: { accelMult: 0.6,  capMult: 1.4,  offsetMult: 1.3, aggrMult: 0.8 },
    hybrid: { accelMult: 1.0,  capMult: 1.8,  offsetMult: 1.0, aggrMult: 1.0 },
    aggro:  { accelMult: 1.5,  capMult: 2.4,  offsetMult: 0.6, aggrMult: 1.4 },
  };
  const O = objMap[objective] || objMap.hybrid;

  // Sens multiplier range we want: 1× at slow, up to cap at fast
  const targetCap = O.capMult;  // max multiplier

  switch (mode) {

    /* ─── LINEAR ──────────────────────────────────
       sens(v) = baseSens × clamp(1 + accel × max(0, v - offset), 1, cap)
       Raw Accel formula: gain = accel × (v - offset); multiplier = 1 + gain
    ─────────────────────────────────────────────── */
    case 'linear': {
      // offset: begin acceleration after ~30% of medSpeed (stable), ~15% (aggro)
      const offset   = round3(medSpeed * O.offsetMult * 0.35);
      // accel: at medSpeed the multiplier should reach ~50% of cap
      const accel    = round3(((targetCap - 1) * 0.5) / Math.max(medSpeed - offset, 0.5) * O.accelMult);
      const cap      = round2(targetCap);
      const capType  = 'Output';

      const curveFn = v => {
        const gain = accel * Math.max(0, v - offset);
        return Math.min(1 + gain, cap);
      };

      return {
        params: {
          'Acceleration':  accel,
          'Cap Type':      capType,
          'Cap: Output':   cap,
          'Input Offset':  offset,
        },
        curveFn,
      };
    }

    /* ─── CLASSIC ─────────────────────────────────
       Classic: sens(v) = 1 + accel × max(0, v - offset)^power
       Approximation of old Windows acceleration.
    ─────────────────────────────────────────────── */
    case 'classic': {
      const power   = objective === 'aggro' ? 2.0 : (objective === 'stable' ? 1.5 : 1.8);
      const offset  = round3(medSpeed * O.offsetMult * 0.3);
      // Solve for accel: at medSpeed, multiplier = (targetCap-1)*0.5
      const vRef    = Math.max(medSpeed - offset, 0.5);
      const accel   = round4(((targetCap - 1) * 0.5) / Math.pow(vRef, power) * O.accelMult);
      const cap     = round2(targetCap);

      const curveFn = v => {
        const base = Math.max(0, v - offset);
        return Math.min(1 + accel * Math.pow(base, power), cap);
      };

      return {
        params: {
          'Acceleration':  accel,
          'Cap Type':      'Output',
          'Cap: Output':   cap,
          'Input Offset':  offset,
          'Power':         power,
        },
        curveFn,
      };
    }

    /* ─── JUMP ────────────────────────────────────
       Jump: below threshold → ×1; above → ×output (smooth sigmoid blend)
       Real Raw Accel "Jump" uses a sigmoid around the input speed point.
       sens(v) = 1 + (output - 1) × sigmoid((v - input) × smooth)
    ─────────────────────────────────────────────── */
    case 'jump': {
      // Jump point at medSpeed × objective factor
      const jumpInput  = round2(medSpeed * (objective === 'aggro' ? 0.7 : objective === 'stable' ? 1.1 : 0.9));
      const jumpOutput = round2(targetCap);
      const smooth     = round2(objective === 'stable' ? 1.5 : objective === 'aggro' ? 3.5 : 2.5);

      const curveFn = v => {
        const sig = 1 / (1 + Math.exp(-smooth * (v - jumpInput)));
        return 1 + (jumpOutput - 1) * sig;
      };

      return {
        params: {
          'Smooth':  smooth,
          'Input':   jumpInput,
          'Output':  jumpOutput,
        },
        curveFn,
      };
    }

    /* ─── NATURAL ─────────────────────────────────
       Natural: sens(v) = 1 + (limit - 1) × (1 - e^(-decay × max(0, v - offset)))
       Saturates smoothly toward a limit.
    ─────────────────────────────────────────────── */
    case 'natural': {
      const limit  = round2(targetCap);
      const offset = round3(medSpeed * O.offsetMult * 0.3);
      // Solve decay so at medSpeed the function reaches 50% of (limit-1)
      // 0.5 = 1 - e^(-decay × vRef)  →  decay = ln(2) / vRef
      const vRef   = Math.max(medSpeed - offset, 0.5);
      const decay  = round4(Math.log(2) / vRef * O.accelMult);

      const curveFn = v => {
        const base = Math.max(0, v - offset);
        return 1 + (limit - 1) * (1 - Math.exp(-decay * base));
      };

      return {
        params: {
          'Decay Rate':   decay,
          'Input Offset': offset,
          'Limit':        limit,
        },
        curveFn,
      };
    }

    /* ─── POWER ───────────────────────────────────
       Power: sens(v) = outputOffset + scale × v^exponent, capped at cap
       Aggressive, exponential-style. Exponent < 1 → concave (fast rise then flat).
    ─────────────────────────────────────────────── */
    case 'power': {
      // exponent: aggressive → convex (>1), stable → concave (<1)
      const exponent     = objective === 'aggro' ? 1.5 : objective === 'stable' ? 0.65 : 1.0;
      const cap          = round2(targetCap);
      const outputOffset = 0; // Raw Accel convention: 0 = no floor boost
      // Solve scale so at medSpeed multiplier is ~50% of cap
      const scale = round4((cap * 0.5) / (Math.pow(Math.max(medSpeed, 0.5), exponent)) * O.accelMult);

      const curveFn = v => {
        const raw = outputOffset + scale * Math.pow(Math.max(v, 0), exponent);
        return Math.min(raw, cap);
      };

      return {
        params: {
          'Scale':          scale,
          'Cap Type':       'Output',
          'Cap: Output':    cap,
          'Exponent':       exponent,
          'Output Offset':  outputOffset,
        },
        curveFn,
      };
    }

    default: return null;
  }
}

/* Helpers */
function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
function round4(n) { return Math.round(n * 10000) / 10000; }


/* ═══════════════════════════════════════════════
   3. GENERATE — Main entry point
═══════════════════════════════════════════════ */
function generate() {
  const hw        = getHardware();
  const objective = getObjective();
  const result    = computeRecommendation(currentMode, hw, objective);

  if (!result) return;

  // Fill param inputs with generated values
  fillParamInputs(currentMode, result.params);

  // Compute stats at key speeds
  const slowMult  = result.curveFn(1);
  const medMult   = result.curveFn(5);
  const fastMult  = result.curveFn(15);
  const boostMax  = result.curveFn(30);

  stSlow.textContent  = (hw.sens * slowMult).toFixed(3);
  stMed.textContent   = (hw.sens * medMult).toFixed(3);
  stFast.textContent  = (hw.sens * fastMult).toFixed(3);
  stBoost.textContent = boostMax.toFixed(2) + '×';

  // Show output sections
  outputStrip.style.display = '';
  outputZone.classList.add('visible');
  statsStrip.classList.add('visible');

  // Synthesis table
  buildSynthTable(result.params, hw, objective);

  // Chart
  lastResult = result;
  drawChart(result.curveFn, result.params);

  // Scroll to results
  outputStrip.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* ═══════════════════════════════════════════════
   4. FILL PARAM INPUTS
═══════════════════════════════════════════════ */
function fillParamInputs(mode, params) {
  const map = {
    linear:  { 'Acceleration': 'lin-accel', 'Cap: Output': 'lin-cap', 'Input Offset': 'lin-offset' },
    classic: { 'Acceleration': 'cl-accel',  'Cap: Output': 'cl-cap',  'Input Offset': 'cl-offset', 'Power': 'cl-power' },
    jump:    { 'Smooth': 'jmp-smooth', 'Input': 'jmp-input', 'Output': 'jmp-output' },
    natural: { 'Decay Rate': 'nat-decay', 'Input Offset': 'nat-offset', 'Limit': 'nat-limit' },
    power:   { 'Scale': 'pw-scale', 'Cap: Output': 'pw-cap', 'Exponent': 'pw-exp', 'Output Offset': 'pw-offset' },
  };
  const modeMap = map[mode] || {};
  Object.entries(modeMap).forEach(([paramKey, inputId]) => {
    const el = $(inputId);
    if (el && params[paramKey] !== undefined) el.value = params[paramKey];
  });
}


/* ═══════════════════════════════════════════════
   5. SYNTHESIS TABLE
═══════════════════════════════════════════════ */
function buildSynthTable(params, hw, objective) {
  // Build rows
  const rows = [
    ['Mode',          currentMode.charAt(0).toUpperCase() + currentMode.slice(1), false],
    ['DPI',           hw.dpi + ' DPI', false],
    ['In-Game Sens',  hw.sens, false],
    ['Polling Rate',  hw.polling + ' Hz', false],
    ['Objectif',      { stable: 'Stabilité / Tracking', hybrid: 'Hybride Équilibré', aggro: 'Flicks / Aggro' }[objective], false],
    ...Object.entries(params).map(([k, v]) => [k, v, true]),
  ];

  synthTable.innerHTML = rows.map(([label, val, highlight]) => `
    <tr>
      <td>${label}</td>
      <td class="${highlight ? 'val-highlight' : ''}">${val}</td>
    </tr>
  `).join('');

  // Build copy hint
  const paramLines = Object.entries(params)
    .filter(([k]) => k !== 'Cap Type')   // cap type is a dropdown, not a number
    .map(([k, v]) => `  ${k.padEnd(16)} ${v}`)
    .join('\n');

  copyHint.innerHTML = `
    <strong>→ Dans Raw Accel :</strong><br>
    Mode : <strong>${currentMode}</strong><br>
    ${Object.entries(params).map(([k,v]) =>
      `${k} : <strong>${v}</strong>`
    ).join(' &nbsp;·&nbsp; ')}<br><br>
    <span style="opacity:.6">Copie ces valeurs dans l'interface Raw Accel → onglet Graphs → Apply.</span>
  `;
}


/* ═══════════════════════════════════════════════
   6. CANVAS CHART
═══════════════════════════════════════════════ */
function drawChart(curveFn, params) {
  // Responsive size
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.parentElement.clientWidth - 56;  // 28px padding each side
  const H   = 260;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const PAD = { top: 24, right: 20, bottom: 44, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  // Data range
  const maxSpeed = 25;
  const maxMult  = Math.min(Math.max(curveFn(25) * 1.15, 2.5), 6);

  // Helpers
  const xPx = v => PAD.left + (v / maxSpeed) * plotW;
  const yPx = m => PAD.top  + plotH - (m / maxMult) * plotH;

  /* Background */
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, W, H);

  /* Grid */
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth   = 1;
  const gridX = [0, 5, 10, 15, 20, 25];
  const gridY  = [];
  for (let m = 0; m <= maxMult + 0.01; m += 0.5) gridY.push(m);

  gridX.forEach(v => {
    ctx.beginPath();
    ctx.moveTo(xPx(v), PAD.top);
    ctx.lineTo(xPx(v), PAD.top + plotH);
    ctx.stroke();
  });
  gridY.forEach(m => {
    ctx.beginPath();
    ctx.moveTo(PAD.left, yPx(m));
    ctx.lineTo(PAD.left + plotW, yPx(m));
    ctx.stroke();
  });

  /* Axis labels */
  ctx.fillStyle = '#718096';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  gridX.forEach(v => {
    ctx.fillText(v, xPx(v), H - PAD.bottom + 16);
  });
  ctx.textAlign = 'right';
  gridY.filter((_, i) => i % 2 === 0).forEach(m => {
    ctx.fillText(m.toFixed(1) + '×', PAD.left - 6, yPx(m) + 3.5);
  });

  /* Axis labels */
  ctx.fillStyle = 'rgba(113,128,150,.5)';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('counts / ms', PAD.left + plotW / 2, H - 4);

  /* Baseline (y=1) */
  ctx.strokeStyle = 'rgba(255,255,255,.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(xPx(0), yPx(1));
  ctx.lineTo(xPx(maxSpeed), yPx(1));
  ctx.stroke();
  ctx.setLineDash([]);

  /* Gradient fill under curve */
  const steps = 200;
  const grad  = ctx.createLinearGradient(PAD.left, PAD.top, PAD.left, PAD.top + plotH);
  grad.addColorStop(0,   'rgba(79,209,197,.25)');
  grad.addColorStop(1,   'rgba(79,209,197,.02)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(xPx(0), yPx(Math.min(curveFn(0), maxMult)));
  for (let i = 1; i <= steps; i++) {
    const v = (i / steps) * maxSpeed;
    ctx.lineTo(xPx(v), yPx(Math.min(curveFn(v), maxMult)));
  }
  ctx.lineTo(xPx(maxSpeed), yPx(0));
  ctx.lineTo(xPx(0), yPx(0));
  ctx.closePath();
  ctx.fill();

  /* Main curve */
  ctx.strokeStyle = '#4fd1c5';
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = '#4fd1c5';
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const v = (i / steps) * maxSpeed;
    const m = Math.min(curveFn(v), maxMult);
    if (i === 0) ctx.moveTo(xPx(v), yPx(m));
    else         ctx.lineTo(xPx(v), yPx(m));
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  /* Reference dots at key speeds */
  const dots = [
    { v: 1,  label: 'Lente' },
    { v: 5,  label: 'Moy.' },
    { v: 15, label: 'Rapide' },
  ];
  dots.forEach(({ v, label }) => {
    const m = Math.min(curveFn(v), maxMult);
    ctx.fillStyle    = '#4fd1c5';
    ctx.strokeStyle  = '#0d0f14';
    ctx.lineWidth    = 2;
    ctx.shadowColor  = '#4fd1c5';
    ctx.shadowBlur   = 10;
    ctx.beginPath();
    ctx.arc(xPx(v), yPx(m), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle  = 'rgba(79,209,197,.8)';
    ctx.font       = '9px JetBrains Mono, monospace';
    ctx.textAlign  = 'center';
    ctx.fillText(label, xPx(v), yPx(m) - 10);
  });
}


/* ═══════════════════════════════════════════════
   TOAST UTILITY
═══════════════════════════════════════════════ */
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// Allow clicking the synthesis table to copy all values
synthTable.addEventListener('click', () => {
  if (!lastResult) return;
  const text = Object.entries(lastResult.params)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('✓ Paramètres copiés !'));
});