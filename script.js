/* ═══════════════════════════════════════════════════════
   FPS TOOLKIT — script.js
   Smart Sensitivity Randomizer
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIG ─────────────────────────────────────────────
   Tweak these values to adjust the randomizer behavior.
   ───────────────────────────────────────────────────── */
const CONFIG = {
  EDPI_MIN:         150,
  EDPI_MAX:         400,
  DPI_OPTIONS:      [400, 800, 1600, 3200],

  // Rolling animation
  ROLL_DURATION_MS:    900,   // Total animation time
  ROLL_TICK_MS:        40,    // Interval between "tick" updates

  // eDPI thresholds for style classification
  // > WRIST_THRESHOLD = wrist player, < ARM_THRESHOLD = arm player
  WRIST_THRESHOLD:  300,     // eDPI above this = wrist
  ARM_THRESHOLD:    200,     // eDPI below this = arm

  // Gauge: maps eDPI 150-400 → 0-100%
  // Low eDPI (arm) = right side, High eDPI (wrist) = left side
  EDPI_RANGE_MIN:   150,
  EDPI_RANGE_MAX:   400,

  // CS2 sensitivity multiplier relative to eDPI base
  // CS2 sens = eDPI / DPI (same formula, different game multiplier)
  CS2_MULTIPLIER:   1.0,
  VAL_MULTIPLIER:   1.0,
};

/* ── DOM REFS ───────────────────────────────────────── */
const elSlotEdpi    = document.getElementById('slot-edpi');
const elSlotDpi     = document.getElementById('slot-dpi');
const elSlotSens    = document.getElementById('slot-sens');

const elGaugeFill   = document.getElementById('gauge-fill');
const elGaugeCursor = document.getElementById('gauge-cursor');
const elGaugeVerdict= document.getElementById('gauge-verdict');

const elValSens     = document.getElementById('val-sens');
const elCS2Sens     = document.getElementById('cs2-sens');

const elBtn         = document.getElementById('btn-roll');

const elGaugeSection    = document.getElementById('gauge-section');
const elGameBreakdown   = document.getElementById('game-breakdown');

/* ── STATE ──────────────────────────────────────────── */
let isRolling = false;

/* ── UTILS ──────────────────────────────────────────── */

/**
 * Returns a random integer between min and max (inclusive).
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random element from an array.
 */
function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Rounds a number to a given number of decimal places.
 */
function round(value, decimals = 2) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

/**
 * Maps a value from [inMin, inMax] to [outMin, outMax].
 */
function mapRange(value, inMin, inMax, outMin, outMax) {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/* ── ROLLING TICKER ─────────────────────────────────── */

/**
 * Animates a slot element with rapidly changing random numbers,
 * then settles on the final value.
 *
 * @param {HTMLElement} el      - The span element to animate.
 * @param {Function}    genFn   - Function returning a random intermediate value (string).
 * @param {string}      final   - The final value to display.
 * @param {number}      delay   - Start delay in ms (for staggered effect).
 * @returns {Promise}           - Resolves when animation completes.
 */
function rollSlot(el, genFn, final, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      el.classList.add('rolling');

      const startTime  = performance.now();
      let   tickTimer  = null;

      function tick() {
        const elapsed = performance.now() - startTime;

        if (elapsed >= CONFIG.ROLL_DURATION_MS) {
          clearInterval(tickTimer);
          el.classList.remove('rolling');
          el.textContent = final;
          resolve();
          return;
        }

        // Slow down the "flicker" as we approach the end
        const progress     = elapsed / CONFIG.ROLL_DURATION_MS;
        const easedOpacity = progress > 0.7
          ? 1 - (progress - 0.7) / 0.3 * 0.4  // slightly fade as settling
          : 1;

        el.style.opacity = easedOpacity;
        el.textContent   = genFn();
      }

      tickTimer = setInterval(tick, CONFIG.ROLL_TICK_MS);
      tick(); // immediate first tick
    }, delay);
  });
}

/* ── GAUGE UPDATE ───────────────────────────────────── */

/**
 * Updates the visual gauge and verdict text based on eDPI.
 * High eDPI (wrist) → left side. Low eDPI (arm) → right side.
 *
 * @param {number} edpi - The rolled eDPI value.
 */
function updateGauge(edpi) {
  // Map eDPI: high = left (wrist), low = right (arm)
  const pct = mapRange(
    edpi,
    CONFIG.EDPI_RANGE_MIN,
    CONFIG.EDPI_RANGE_MAX,
    0,   // arm side (low eDPI)
    100  // wrist side (high eDPI)
  );

  elGaugeFill.style.width   = `${pct}%`;
  elGaugeCursor.style.left  = `${pct}%`;

  // Verdict
  let verdict, color;
  if (edpi >= CONFIG.WRIST_THRESHOLD) {
    verdict = '🖐️ Joueur Poignet — Petits mouvements, précision chirurgicale.';
    color   = 'var(--wrist-color)';
  } else if (edpi <= CONFIG.ARM_THRESHOLD) {
    verdict = '💪 Joueur Bras — Grand mousepad recommandé, flicks naturels.';
    color   = 'var(--arm-color)';
  } else {
    verdict = '⚖️ Style Hybride — Polyvalent entre précision et réactivité.';
    color   = 'var(--hybrid-color)';
  }

  elGaugeVerdict.textContent  = verdict;
  elGaugeVerdict.style.color  = color;
}

/* ── MAIN ROLL LOGIC ────────────────────────────────── */

async function rollSensitivity() {
  if (isRolling) return;
  isRolling = true;

  elBtn.disabled = true;
  elBtn.classList.add('rolling');

  // Hide breakdown & gauge during roll
  elGaugeSection.classList.remove('revealed');
  elGameBreakdown.classList.remove('revealed');

  // Generate final values
  const edpi = randInt(CONFIG.EDPI_MIN, CONFIG.EDPI_MAX);
  const dpi  = randChoice(CONFIG.DPI_OPTIONS);
  const sens = round(edpi / dpi, 3);

  // Remove stale ".has-value" states
  document.querySelectorAll('.result-card').forEach(c => c.classList.remove('has-value'));

  // ── Run rolling animations (staggered) ──────────────
  await Promise.all([
    rollSlot(
      elSlotEdpi,
      () => randInt(100, 500).toString(),
      edpi.toString(),
      0
    ),
    rollSlot(
      elSlotDpi,
      () => String(randChoice(CONFIG.DPI_OPTIONS)),
      dpi.toString(),
      150   // slight delay for cascade feel
    ),
    rollSlot(
      elSlotSens,
      () => round(Math.random() * 3, 2).toFixed(2),
      sens.toFixed(3),
      300
    ),
  ]);

  // Reset opacity on slots just in case
  [elSlotEdpi, elSlotDpi, elSlotSens].forEach(el => el.style.opacity = '');

  // ── Update card highlight states ─────────────────────
  document.querySelectorAll('.result-card').forEach(c => c.classList.add('has-value'));

  // ── Game-specific sensitivity ─────────────────────────
  // Valorant & CS2 use the same raw formula: in-game sens = eDPI / DPI
  // But each game has a different baseline. We display the same value
  // since the formula is identical (multiplier = 1.0 for both).
  elValSens.textContent  = sens.toFixed(3);
  elCS2Sens.textContent  = sens.toFixed(3);

  // ── Reveal gauge & breakdown ──────────────────────────
  setTimeout(() => {
    updateGauge(edpi);
    elGaugeSection.classList.add('revealed');
    elGameBreakdown.classList.add('revealed');
  }, 100);

  // ── Re-enable button ──────────────────────────────────
  setTimeout(() => {
    elBtn.disabled = false;
    elBtn.classList.remove('rolling');
    isRolling = false;
  }, 400);
}

/* ── EVENT LISTENERS ────────────────────────────────── */
elBtn.addEventListener('click', rollSensitivity);

// Keyboard shortcut: Space or Enter triggers the roll
document.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && !isRolling) {
    e.preventDefault();
    rollSensitivity();
  }
});

/* ── INIT ───────────────────────────────────────────── */
// Subtle entrance animation on page load
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.result-card, .info-card').forEach((el, i) => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(16px)';
    el.style.transition = `opacity 0.5s ease ${i * 80}ms, transform 0.5s ease ${i * 80}ms`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity   = '';
        el.style.transform = '';
      });
    });
  });
});


// --- GESTION DU MENU MOBILE ---
const hamburgerBtn = document.getElementById('hamburger-btn');
const navLinks = document.querySelector('.nav-links');

if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
        // Ajoute ou enlève la classe "active" pour afficher/cacher le menu
        navLinks.classList.toggle('active');
    });
}
