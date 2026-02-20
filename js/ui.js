/* ══════════════════════════════════════════════════════════════════
   ui.js — HUD rendering & DOM updates
   Manages: score, timer, circuit grid, integrity bar (4-slot),
            powerup slots, screen transitions, digital rain, pause.
══════════════════════════════════════════════════════════════════ */

const UI = (() => {

  const $ = id => document.getElementById(id);

  const els = {
    screenStart: $('screen-start'),
    screenGame: $('screen-game'),
    screenEnd: $('screen-end'),
    score: $('hud-score'),
    totalErrors: $('hud-errors'),
    time: $('hud-time'),
    circuitGrid: $('circuit-grid'),
    circuitCtr: $('circuit-counter'),
    intBar: $('integrity-bar'),
    intLabel: $('integrity-label'),
    intErrors: $('integrity-errors'),
    puActiveLabel: $('pu-active-label'),
    flash: $('flash-overlay'),
    endScore: $('end-score'),
    endCircuits: $('end-circuits'),
    endTime: $('end-time'),
    endBreaks: $('end-breaks'),
    endHits: $('end-hits'),
    endMisses: $('end-misses'),
    endRank: $('end-rank'),
    endRankLabel: $('end-rank-label'),
    pauseOverlay: $('pause-overlay'),
  };

  let circuitIcons = [];

  // ─── Helpers ─────────────────────────────────────────────────────

  function pad(n, len = 3) { return String(n).padStart(len, '0'); }

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${pad(m, 2)}:${pad(s, 2)}`;
  }

  // ─── Screen management ───────────────────────────────────────────

  function showScreen(name) {
    ['screen-start', 'screen-game', 'screen-end'].forEach(id => {
      const el = $(id);
      if (el) el.classList.remove('active');
    });
    const target = $(`screen-${name}`);
    if (target) target.classList.add('active');
  }

  // ─── Circuit grid ────────────────────────────────────────────────

  function buildCircuitGrid() {
    els.circuitGrid.innerHTML = '';
    circuitIcons = [];
    for (let i = 0; i < 30; i++) {
      const div = document.createElement('div');
      div.className = 'circuit-icon';
      div.title = `Circuito ${i + 1}`;
      els.circuitGrid.appendChild(div);
      circuitIcons.push(div);
    }
  }

  /**
   * Light a single specific slot on the circuit grid (called once per earned circuit).
   * Never re-renders the whole range — only touches the one new slot.
   */
  function lightCircuit(index) {
    if (index < 0 || index >= circuitIcons.length) return;
    const icon = circuitIcons[index];
    if (!icon.classList.contains('broken')) {
      icon.classList.add('lit');
    }
  }

  /** Update the "X / 30 CIRCUITOS" counter text (does NOT redraw the grid). */
  function updateCircuits(count) {
    els.circuitCtr.textContent = `${count} / 30 CIRCUITOS`;
  }

  /** Mark a circuit as permanently broken with a red ✕ */
  function markCircuitBroken(index) {
    if (index < 0 || index >= circuitIcons.length) return;
    const icon = circuitIcons[index];
    icon.classList.remove('lit');
    icon.classList.add('broken');
    icon.textContent = '✕';
  }

  // ─── Score & timer ───────────────────────────────────────────────

  function updateScore(score) { els.score.textContent = pad(score, 3); }
  function updateTotalErrors(n) { els.totalErrors.textContent = pad(n, 3); }
  function updateTime(seconds) { els.time.textContent = fmtTime(seconds); }

  // ─── Integrity bar (3-slot scale) ────────────────────────────────

  /** errorsLeft: how many hits remain before circuit break (0–3) */
  function updateIntegrity(errorsLeft) {
    const MAX = 3;
    const pct = (errorsLeft / MAX) * 100;
    els.intBar.style.width = `${pct}%`;
    els.intLabel.textContent = `${errorsLeft} / ${MAX}`;
    els.intErrors.textContent = `Erros consecutivos: ${MAX - errorsLeft}`;

    if (errorsLeft <= 1) {
      els.intBar.style.background = 'linear-gradient(90deg, var(--red), #ff6644)';
    } else if (errorsLeft <= 2) {
      els.intBar.style.background = 'linear-gradient(90deg, var(--yellow), #ffaa00)';
    } else {
      els.intBar.style.background = 'linear-gradient(90deg, var(--green-dim), var(--green))';
    }
  }

  // ─── Power-up HUD ────────────────────────────────────────────────

  function updatePowerupCharges(slot, charges) {
    const chargesEl = $(`pu-charges-${slot}`);
    const slotEl = $(`pu-${slot}`);
    if (chargesEl) chargesEl.textContent = `x${charges}`;
    if (slotEl) slotEl.classList.toggle('empty', charges === 0);
  }

  function setPowerupActive(slot) {
    [1, 2, 3].forEach(i => {
      const el = $(`pu-${i}`);
      if (el) el.classList.toggle('active-pu', i === slot);
    });
    const names = { 1: '⚔ SWORD ATIVO', 2: '🛡 SHIELD ATIVO', 3: '⚡ OVERCLOCK ATIVO' };
    els.puActiveLabel.textContent = slot ? names[slot] : '';
  }

  // ─── Pause overlay ────────────────────────────────────────────────

  function showPause(visible) {
    if (els.pauseOverlay) els.pauseOverlay.style.display = visible ? 'flex' : 'none';
  }

  // ─── Flash FX ────────────────────────────────────────────────────

  function flashRed() {
    const f = els.flash;
    f.classList.remove('flash-active');
    void f.offsetWidth;
    f.classList.add('flash-active');
  }

  // ─── End screen ──────────────────────────────────────────────────

  const RANK_DATA = {
    S: { label: 'RANK S — INVASÃO PERFEITA', cls: 'rank-s' },
    A: { label: 'RANK A — 1–2 QUEBRAS', cls: 'rank-a' },
    B: { label: 'RANK B — 3–5 QUEBRAS', cls: 'rank-b' },
    C: { label: 'RANK C — MUITAS QUEBRAS', cls: 'rank-c' },
  };

  function showEndScreen(stats) {
    const breaks = stats.circuitBreaks || 0;
    let rank = 'C';
    if (breaks === 0) rank = 'S';
    else if (breaks <= 2) rank = 'A';
    else if (breaks <= 5) rank = 'B';

    const rd = RANK_DATA[rank];
    els.endRank.textContent = rank;
    els.endRank.className = `end-rank ${rd.cls}`;
    els.endRankLabel.textContent = rd.label;
    els.endScore.textContent = pad(stats.score, 3);
    els.endCircuits.textContent = `${stats.circuits} / 30`;
    els.endTime.textContent = fmtTime(stats.time);
    els.endBreaks.textContent = breaks;
    els.endHits.textContent = stats.hits || 0;
    els.endMisses.textContent = stats.misses || 0;

    showScreen('end');
  }

  // ─── Digital rain spawner ─────────────────────────────────────────

  function spawnDigitalRain(container) {
    container.innerHTML = '';
    const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF><[]{}|01';
    const colCount = Math.floor(window.innerWidth / 18);

    for (let i = 0; i < colCount; i++) {
      const col = document.createElement('div');
      col.className = 'rain-col';
      col.style.left = `${i * 18}px`;
      let text = '';
      const len = 12 + Math.floor(Math.random() * 20);
      for (let j = 0; j < len; j++) {
        text += chars[Math.floor(Math.random() * chars.length)] + '\n';
      }
      col.textContent = text;
      const duration = 4 + Math.random() * 8;
      const delay = Math.random() * 8;
      col.style.animationDuration = `${duration}s`;
      col.style.animationDelay = `${-delay}s`;
      col.style.fontSize = `${12 + Math.floor(Math.random() * 6)}px`;
      col.style.opacity = `${0.4 + Math.random() * 0.6}`;
      container.appendChild(col);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────

  return {
    showScreen,
    buildCircuitGrid,
    updateCircuits,
    lightCircuit,
    markCircuitBroken,
    updateScore,
    updateTotalErrors,
    updateTime,
    updateIntegrity,
    updatePowerupCharges,
    setPowerupActive,
    showPause,
    flashRed,
    showEndScreen,
    spawnDigitalRain,
    fmtTime,
    pad,
  };

})();
