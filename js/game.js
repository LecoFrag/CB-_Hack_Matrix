/* ══════════════════════════════════════════════════════════════════
   game.js — Main engine: game loop, state, rendering, audio, logic
   Depends on: ui.js, input.js, spawn.js, powerups.js
══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─── Canvas setup ────────────────────────────────────────────────
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const HUD_W = 260;

    function resizeCanvas() {
        canvas.width = Math.max(window.innerWidth - HUD_W, 300);
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', () => {
        resizeCanvas();
        rainCanvas.updateSize(canvas.width, canvas.height);
    });
    resizeCanvas();

    // ─── COLOUR CONSTANTS ─────────────────────────────────────────────
    const C = {
        bg: '#010801',
        green: '#00FF66',
        greenDim: '#00aa44',
        greenFaint: 'rgba(0,255,102,0.08)',
        greenGlow: 'rgba(0,255,102,0.35)',
        red: '#FF1133',
        cyan: '#00FFFF',
        yellow: '#FFD700',
        purple: '#cc44ff',
        laneDiv: 'rgba(0,255,102,0.1)',
        captureZone: 'rgba(0,255,102,0.06)',
        captureLine: 'rgba(0,255,102,0.5)',
    };

    // ─── GAME CONSTANTS ───────────────────────────────────────────────
    const MAX_SCOREABLE = 200;  // Total STANDARD+ENCRYPTED blocks per session
    const PTS_PER_CIRCUIT = 6;    // Score points to unlock one circuit
    const MAX_CIRCUITS = 30;   // Circuit grid slots
    const MAX_ERRORS = 3;    // Consecutive errors before circuit break
    // Speed ramp: +29 px/s every 20 scoreable blocks (8 steps), max at block 160
    // Base 117, step 29 → block 160 = 117 + 8×29 = 349 → clamped to 340
    const MAX_SPEED = 340;
    const SPEED_STEP_BLOCKS = 20;  // Every N scoreable blocks → +speedStep
    const BASE_COL_H = 60;  // Column-label base bar height (px)
    const COL_LOCK_DURATION = 5.0; // Seconds a column stays locked after virus miss

    // ─── GLOBAL GAME STATE ────────────────────────────────────────────
    const GS = {
        status: 'idle',  // 'idle' | 'playing' | 'paused' | 'gameover'

        score: 0,
        circuits: 0,
        circuitBreaks: 0,
        hits: 0,
        misses: 0,
        brokenCircuits: new Set(),
        scorableSpawned: 0,   // STANDARD + ENCRYPTED blocks spawned so far

        consecutiveErrors: 0,
        integrityLeft: MAX_ERRORS,

        baseSpeed: 117,
        speed: 117,
        speedStep: 29,        // (340-117)/8 — 8 ramp steps to reach max at block 160

        lockedColumns: [0, 0, 0, 0, 0], // Per-column lock timer (seconds remaining)

        startTime: 0,
        elapsedSec: 0,
        lastFrameTs: 0,

        blocks: [],
        nextSpawnIn: 0,
        spawnInterval: 1.4,
        lastGrantCircuit: 0,

        glitchTimer: 0,       // Short error glitch (seconds)
        colErrorCooldown: [false, false, false, false, false], // Per-column false-press cooldown
    };

    // ─── AUDIO ENGINE ─────────────────────────────────────────────────
    let audioCtx = null, droneNode = null, droneGain = null;
    let bgMusic = new Audio('queda_blocos.mp3');
    bgMusic.loop = true;
    bgMusic.volume = 0.6;

    function ensureAudio() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function startDrone(speed) {
        ensureAudio();
        if (droneNode) { droneNode.stop(); droneNode = null; }
        const freq = 80 + ((speed - 90) / (250 - 90)) * 60;
        droneGain = audioCtx.createGain();
        droneGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        droneGain.connect(audioCtx.destination);
        [0, 7, -7].forEach(detune => {
            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            osc.detune.value = detune;
            const g = audioCtx.createGain();
            g.gain.value = 0.04;
            osc.connect(g);
            g.connect(droneGain);
            osc.start();
            if (!droneNode) droneNode = osc;
        });
    }

    function updateDronePitch(speed) {
        if (!droneNode) return;
        const freq = 80 + ((speed - 90) / (250 - 90)) * 60;
        droneNode.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.5);
    }

    function dronePanic() {
        if (!droneGain) return;
        droneGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        droneGain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.8);
    }

    function stopDrone() {
        if (droneNode) { try { droneNode.stop(); } catch (e) { } droneNode = null; }
        droneGain = null;
    }

    function sfxHit() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.08);
        g.gain.setValueAtTime(0.15, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.13);
    }

    function sfxError() {
        if (!audioCtx) return;
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.25, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = audioCtx.createBufferSource(), g = audioCtx.createGain();
        src.buffer = buf;
        g.gain.setValueAtTime(0.2, audioCtx.currentTime);
        src.connect(g); g.connect(audioCtx.destination); src.start();
    }

    function sfxBreak() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(25, audioCtx.currentTime + 0.6);
        g.gain.setValueAtTime(0.3, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.7);
    }

    function sfxPowerup() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.2);
        g.gain.setValueAtTime(0.2, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    }

    // ─── MATRIX RAIN (canvas layer) ──────────────────────────────────
    const rainCanvas = (() => {
        const CHARS = '01アイウエオ><[]{}|ABCDEF';
        const drops = [];
        let w = canvas.width, h = canvas.height;
        const COL_SIZE = 16;

        function init(cw, ch) {
            w = cw; h = ch;
            drops.length = 0;
            const cols = Math.floor(cw / COL_SIZE);
            for (let i = 0; i < cols; i++) {
                drops.push({
                    x: i * COL_SIZE, y: Math.random() * -h,
                    speed: 30 + Math.random() * 60,
                    char: CHARS[Math.floor(Math.random() * CHARS.length)],
                    alpha: 0.05 + Math.random() * 0.1,
                    len: 6 + Math.floor(Math.random() * 12),
                });
            }
        }
        function updateSize(cw, ch) { init(cw, ch); }
        function draw(ctx, dt) {
            for (const d of drops) {
                d.y += d.speed * dt;
                if (d.y > h + 100) {
                    d.y = -COL_SIZE * d.len;
                    d.char = CHARS[Math.floor(Math.random() * CHARS.length)];
                    d.speed = 30 + Math.random() * 60;
                }
                ctx.globalAlpha = d.alpha * 3;
                ctx.fillStyle = C.green;
                ctx.font = `${COL_SIZE - 2}px 'Share Tech Mono', monospace`;
                ctx.fillText(d.char, d.x, d.y);
                for (let t = 1; t < d.len; t++) {
                    ctx.globalAlpha = d.alpha * (1 - t / d.len);
                    ctx.fillStyle = C.greenDim;
                    ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], d.x, d.y - t * COL_SIZE);
                }
            }
            ctx.globalAlpha = 1;
        }
        init(canvas.width, canvas.height);
        return { draw, updateSize };
    })();

    // ─── RENDERING HELPERS ────────────────────────────────────────────
    const FONT_MONO = "'Share Tech Mono', monospace";
    const FONT_HEAD = "'Orbitron', monospace";

    function clearCanvas() {
        ctx.fillStyle = 'rgba(1,8,1,0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    /** Lane dividers — NO top labels; labels are in the base bar instead */
    function drawLanes() {
        const laneW = canvas.width / Spawner.LANES;
        ctx.strokeStyle = C.laneDiv;
        ctx.lineWidth = 1;
        for (let i = 1; i < Spawner.LANES; i++) {
            ctx.beginPath();
            ctx.moveTo(i * laneW, 0);
            ctx.lineTo(i * laneW, canvas.height);
            ctx.stroke();
        }
    }

    /** Capture zone band */
    function drawCaptureZone() {
        const capY = Spawner.getCaptureY(canvas.height);
        const zh = Spawner.CAPTURE_ZONE_H;

        ctx.fillStyle = C.captureZone;
        ctx.fillRect(0, capY, canvas.width, zh);

        ctx.strokeStyle = C.captureLine;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, capY);
        ctx.lineTo(canvas.width, capY);
        ctx.stroke();

        ctx.font = `10px ${FONT_MONO}`;
        ctx.fillStyle = C.captureLine;
        ctx.textAlign = 'right';
        ctx.fillText('▶ CAPTURE ZONE', canvas.width - 6, capY - 4);
        ctx.textAlign = 'left';
    }

    /**
     * Column-key base bar — drawn at bottom of canvas.
     * Acts as the "receiving terminal" for falling blocks.
     */
    function drawColumnBase() {
        const laneW = canvas.width / Spawner.LANES;
        const baseY = canvas.height - BASE_COL_H;
        const colKeys = Spawner.COLUMN_KEYS;

        // Container background
        ctx.fillStyle = 'rgba(0,18,6,0.92)';
        ctx.fillRect(0, baseY, canvas.width, BASE_COL_H);

        // Top border (glowing)
        ctx.strokeStyle = C.green;
        ctx.lineWidth = 2;
        ctx.shadowColor = C.greenGlow;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        ctx.lineTo(canvas.width, baseY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Column dividers inside base
        ctx.strokeStyle = 'rgba(0,255,102,0.22)';
        ctx.lineWidth = 1;
        for (let i = 1; i < Spawner.LANES; i++) {
            ctx.beginPath();
            ctx.moveTo(i * laneW, baseY);
            ctx.lineTo(i * laneW, canvas.height);
            ctx.stroke();
        }

        // Key labels — large, centred in each cell
        ctx.font = `bold 24px ${FONT_HEAD}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = C.greenGlow;
        ctx.shadowBlur = 10;
        for (let i = 0; i < Spawner.LANES; i++) {
            ctx.fillStyle = C.green;
            ctx.fillText(colKeys[i], i * laneW + laneW / 2, baseY + BASE_COL_H / 2);
        }
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
    }

    /** Render a single falling block */
    function drawBlock(block) {
        const laneW = canvas.width / Spawner.LANES;
        const x = (block.lane - 1) * laneW + (laneW - Spawner.BLOCK_W) / 2;
        const y = block.y;
        const bw = Spawner.BLOCK_W;
        const bh = Spawner.BLOCK_H;
        const inZone = Spawner.isInCaptureZone(block, canvas.height);
        const gx = (block.glitchT > 0) ? (Math.random() - 0.5) * 6 * block.glitchT : 0;

        let bgColor, borderColor, textColor, glowColor;
        switch (block.type) {
            case 'STANDARD':
                bgColor = inZone ? 'rgba(0,255,102,0.18)' : 'rgba(0,80,30,0.5)';
                borderColor = inZone ? C.green : C.greenDim;
                textColor = C.green;
                glowColor = C.greenGlow;
                break;
            case 'ENCRYPTED':
                bgColor = inZone ? 'rgba(0,255,255,0.15)' : 'rgba(0,60,80,0.5)';
                borderColor = inZone ? C.cyan : '#005566';
                textColor = C.cyan;
                glowColor = 'rgba(0,255,255,0.3)';
                break;
            case 'MALWARE':
                bgColor = inZone ? 'rgba(255,17,51,0.2)' : 'rgba(80,0,12,0.5)';
                borderColor = inZone ? C.red : '#550010';
                textColor = C.red;
                glowColor = 'rgba(255,17,51,0.4)';
                break;
            case 'VIRUS':
                bgColor = inZone ? 'rgba(204,68,255,0.2)' : 'rgba(60,0,80,0.5)';
                borderColor = inZone ? C.purple : '#440066';
                textColor = C.purple;
                glowColor = 'rgba(204,68,255,0.35)';
                break;
        }

        if (inZone) { ctx.shadowColor = glowColor; ctx.shadowBlur = 18; }
        ctx.fillStyle = bgColor;
        ctx.fillRect(x + gx, y, bw, bh);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = inZone ? 2 : 1;
        ctx.strokeRect(x + gx + 1, y + 1, bw - 2, bh - 2);

        // Corner accents
        const CA = 6;
        ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5;
        [[x + gx, y], [x + gx + bw, y], [x + gx, y + bh], [x + gx + bw, y + bh]]
            .forEach(([cx, cy], idx) => {
                const dx = idx % 2 === 0 ? 1 : -1;
                const dy = idx < 2 ? 1 : -1;
                ctx.beginPath();
                ctx.moveTo(cx + dx * CA, cy);
                ctx.lineTo(cx, cy);
                ctx.lineTo(cx, cy + dy * CA);
                ctx.stroke();
            });

        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = block.type === 'VIRUS' ? `22px ${FONT_MONO}` : `bold 17px ${FONT_HEAD}`;
        ctx.fillText(block.label, x + gx + bw / 2, y + bh / 2);

        // ENCRYPTED: show SHIFT hint below block when in zone
        if (block.type === 'ENCRYPTED' && inZone) {
            ctx.font = `9px ${FONT_MONO}`;
            ctx.fillStyle = C.cyan;
            ctx.fillText(`SHIFT+${block.columnKey}`, x + gx + bw / 2, y + bh + 11);
        }

        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    /** HUD: speed indicator top-left, active power-up banner */
    function drawCanvasHUD() {
        ctx.font = `10px ${FONT_MONO}`;
        ctx.fillStyle = C.greenDim;
        ctx.textAlign = 'left';
        const speedPct = Math.min(100, Math.round(((GS.speed - GS.baseSpeed) / (MAX_SPEED - GS.baseSpeed)) * 100));
        ctx.fillText(
            `VELOCIDADE: ${GS.speed.toFixed(0)} px/s  [${speedPct}%]  ` +
            `BLOCOS: ${GS.scorableSpawned}/${MAX_SCOREABLE}  SCORE: ${GS.score}`,
            8, 18
        );

        if (PowerupSystem.isOverclockActive()) {
            ctx.fillStyle = C.yellow; ctx.font = `bold 12px ${FONT_HEAD}`; ctx.textAlign = 'center';
            ctx.fillText('⚡ OVERCLOCK — SLOW MOTION', canvas.width / 2, 46);
        } else if (PowerupSystem.isSwordActive()) {
            ctx.fillStyle = C.green; ctx.font = `bold 12px ${FONT_HEAD}`; ctx.textAlign = 'center';
            ctx.fillText('⚔ SWORD — AUTO-KILL', canvas.width / 2, 46);
        } else if (PowerupSystem.isShieldActive()) {
            ctx.fillStyle = C.cyan; ctx.font = `bold 12px ${FONT_HEAD}`; ctx.textAlign = 'center';
            ctx.fillText('🛡 SHIELD — BUFFER ATIVO', canvas.width / 2, 46);
        }
        ctx.textAlign = 'left';
    }


    /** Standard error glitch overlay (active ~0.5s after each error) */
    function drawGlitchOverlay() {
        if (GS.glitchTimer <= 0) return;
        const t = GS.glitchTimer;
        const alpha = Math.min(0.3, t * 0.6);
        ctx.fillStyle = `rgba(255,17,51,${alpha})`;
        const numLines = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < numLines; i++) {
            ctx.fillRect(0, Math.random() * canvas.height, canvas.width, 2 + Math.random() * 8);
        }
        ctx.font = `bold 14px ${FONT_HEAD}`;
        ctx.fillStyle = `rgba(255,17,51,${alpha * 2})`;
        ctx.textAlign = 'center';
        ctx.fillText('// BREACH DETECTED //', canvas.width / 2, canvas.height / 2 + (Math.random() - 0.5) * 20);
        ctx.textAlign = 'left';
    }

    /**
     * Per-column lock overlay — neon-purple glitch band over locked columns.
     * Columns are locked for COL_LOCK_DURATION seconds when a virus escapes.
     * Duration does NOT stack: a second virus on the same locked column is ignored.
     */
    function drawLockedColumns() {
        const laneW = canvas.width / Spawner.LANES;
        const capY = Spawner.getCaptureY(canvas.height);

        for (let i = 0; i < Spawner.LANES; i++) {
            const t = GS.lockedColumns[i];
            if (t <= 0) continue;

            const x = i * laneW;
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
            const alpha = 0.18 + 0.12 * pulse;

            // Column fill
            ctx.fillStyle = `rgba(204,0,255,${alpha})`;
            ctx.fillRect(x, 0, laneW, canvas.height - BASE_COL_H);

            // Scanlines
            ctx.fillStyle = `rgba(204,0,255,${0.25 + 0.15 * pulse})`;
            for (let y = 0; y < canvas.height - BASE_COL_H; y += 6) {
                ctx.fillRect(x, y, laneW, 2);
            }

            // Random horizontal glitch slices
            const slices = 3 + Math.floor(Math.random() * 4);
            for (let s = 0; s < slices; s++) {
                const sy = Math.random() * (canvas.height - BASE_COL_H);
                ctx.fillStyle = 'rgba(255,0,255,0.25)';
                ctx.fillRect(x + (Math.random() - 0.5) * 10, sy, laneW, 2 + Math.random() * 6);
            }

            // Left and right border glow
            ctx.strokeStyle = `rgba(204,0,255,${0.6 + 0.4 * pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height - BASE_COL_H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + laneW, 0); ctx.lineTo(x + laneW, canvas.height - BASE_COL_H); ctx.stroke();

            // BLOQUEADA label + countdown timer
            ctx.font = `bold 11px ${FONT_HEAD}`;
            ctx.fillStyle = `rgba(255,0,255,${0.85 + 0.15 * pulse})`;
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(204,0,255,0.8)';
            ctx.shadowBlur = 10;
            ctx.fillText('BLOQUEADA', x + laneW / 2, capY - 18);
            ctx.font = `10px ${FONT_MONO}`;
            ctx.fillText(`${t.toFixed(1)}s`, x + laneW / 2, capY - 4);
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
        }
    }

    // ─── PARTICLES ───────────────────────────────────────────────────
    const particles = [];

    function spawnParticle(x, y, success) {
        for (let i = 0; i < (success ? 6 : 4); i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 30 + Math.random() * 80;
            particles.push({
                x, y,
                vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                alpha: 1,
                color: success ? C.green : C.red,
                size: 2 + Math.random() * 3,
                life: 0.5 + Math.random() * 0.3,
                maxLife: 0.5 + Math.random() * 0.3,
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.life -= dt; p.alpha = p.life / p.maxLife;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ─── GAME LOGIC ───────────────────────────────────────────────────

    /**
     * Difficulty ramp — called after each scoreable block is spawned.
     * Speed increases every SPEED_STEP_BLOCKS blocks (20, 40, ..., 160).
     * At block 160 the speed reaches MAX_SPEED (260 px/s).
     */
    function checkDifficulty() {
        if (GS.scorableSpawned > 0 &&
            GS.scorableSpawned % SPEED_STEP_BLOCKS === 0 &&
            GS.scorableSpawned <= 160) {
            GS.speed = Math.min(GS.maxSpeed, GS.speed + GS.speedStep);
            GS.spawnInterval = Math.max(0.45, GS.spawnInterval - 0.08);
            updateDronePitch(GS.speed);
        }
    }

    /** Pixel position helpers (using live Spawner values) */
    function blockCanvasX(block) {
        const laneW = canvas.width / Spawner.LANES;
        return (block.lane - 1) * laneW + laneW / 2;
    }

    function onHit(block) {
        GS.hits++;
        GS.consecutiveErrors = 0;
        GS.integrityLeft = MAX_ERRORS;

        // Only STANDARD and ENCRYPTED count toward the player's score
        if (block.type === 'STANDARD' || block.type === 'ENCRYPTED') {
            GS.score++;

            // Circuit progression: earn one new circuit slot per PTS_PER_CIRCUIT points
            // The sequential slot pointer is GS.circuits + GS.circuitBreaks so that
            // earned circuits and broken circuits both advance the tape forward.
            const target = Math.min(MAX_CIRCUITS, Math.floor(GS.score / PTS_PER_CIRCUIT));
            while (GS.circuits < target) {
                const slot = GS.circuits + GS.circuitBreaks;
                UI.lightCircuit(slot);   // light exactly this one new slot
                GS.circuits++;
            }

            // Power-up grant every 5 circuits
            const grantAt = Math.floor(GS.circuits / 5) * 5;
            if (grantAt > 0 && grantAt > GS.lastGrantCircuit && GS.circuits >= grantAt) {
                GS.lastGrantCircuit = grantAt;
                PowerupSystem.grantRandom();
            }

            UI.updateScore(GS.score);
            UI.updateCircuits(GS.circuits);
        }

        spawnParticle(blockCanvasX(block), Spawner.getCaptureY(canvas.height) + Spawner.BLOCK_H / 2, true);
        sfxHit();
        UI.updateIntegrity(GS.integrityLeft);
    }

    function onError(block) {
        GS.misses++;
        if (!PowerupSystem.isShieldActive()) {
            GS.consecutiveErrors++;
            GS.totalErrors++;
            GS.integrityLeft = MAX_ERRORS - GS.consecutiveErrors;
        }
        UI.updateIntegrity(GS.integrityLeft);
        UI.updateTotalErrors(GS.totalErrors);

        // ── 10-error milestone: takes priority over 3-consecutive ─────────────
        // If both would fire on the same error, only ONE circuit breaks.
        // The milestone resets consecutiveErrors so the 3-consec check below won't fire.
        if (GS.totalErrors > 0 && GS.totalErrors % 10 === 0) {
            GS.consecutiveErrors = 0;     // prevent double-break
            GS.integrityLeft = MAX_ERRORS;
            UI.updateIntegrity(GS.integrityLeft);
            onCircuitBreak();
            return;
        }

        // ── 3 consecutive errors ─────────────────────────────────────────────
        if (GS.consecutiveErrors >= MAX_ERRORS) {
            onCircuitBreak();
            return;
        }

        sfxError();
        UI.flashRed();
        GS.glitchTimer = 0.5;

        if (block) spawnParticle(blockCanvasX(block), Spawner.getCaptureY(canvas.height) + Spawner.BLOCK_H / 2, false);
    }

    function onCircuitBreak() {
        // The next available slot is always the shared sequential pointer
        const slot = GS.circuits + GS.circuitBreaks;
        GS.circuitBreaks++;
        GS.consecutiveErrors = 0;
        GS.integrityLeft = MAX_ERRORS;

        GS.brokenCircuits.add(slot);
        UI.markCircuitBroken(slot);

        // Lose partial score progress toward the NEXT circuit (already-earned circuits stay lit)
        GS.score = Math.floor(GS.score / PTS_PER_CIRCUIT) * PTS_PER_CIRCUIT;

        sfxBreak(); dronePanic(); UI.flashRed();
        GS.glitchTimer = 1.2;
        UI.updateScore(GS.score);
        UI.updateCircuits(GS.circuits);
        UI.updateIntegrity(GS.integrityLeft);
        GS.nextSpawnIn = Math.max(GS.nextSpawnIn, 2.0);
    }

    /**
     * Route key → block interaction.
     * Column key routing:
     *   STANDARD   → column key (no shift)
     *   ENCRYPTED  → SHIFT + column key (shift OK to hold in advance)
     *   MALWARE    → no key (any column/space = error)
     *   VIRUS      → Space
     *   1/2/3      → power-up activation
     */
    function processKey({ key, shift }) {
        if (GS.status === 'paused' || GS.status !== 'playing') return;

        // Power-up slots
        if (['1', '2', '3'].includes(key)) {
            const slot = parseInt(key);
            const activated = PowerupSystem.activate(slot, performance.now());
            if (activated) { sfxPowerup(); UI.setPowerupActive(slot); }
            return;
        }

        const capBlocks = GS.blocks.filter(b =>
            b.state === 'falling' && Spawner.isInCaptureZone(b, canvas.height)
        );
        const isColumnKey = Spawner.COLUMN_KEYS.includes(key);
        const isActionKey = isColumnKey || key === ' ';

        // If the pressed column key maps to a locked column, silently ignore it
        if (isColumnKey) {
            const colIdx = Spawner.COLUMN_KEYS.indexOf(key);
            if (colIdx >= 0 && GS.lockedColumns[colIdx] > 0) return;
        }

        if (capBlocks.length === 0) {
            // No block in zone: column key triggers one error then cooldown (prevents double-hit)
            if (isColumnKey) {
                const colIdx = Spawner.COLUMN_KEYS.indexOf(key);
                if (colIdx >= 0 && !GS.colErrorCooldown[colIdx]) {
                    GS.colErrorCooldown[colIdx] = true;
                    onError(null);
                }
                // If already in cooldown: silently ignore (player already paid for this miss)
            } else if (key === ' ') {
                onError(null); // Space on empty zone: error (no cooldown for space)
            }
            return;
        }

        capBlocks.sort((a, b) => b.y - a.y);
        let handled = false;

        for (const block of capBlocks) {
            // SWORD: any action key = hit (except MALWARE)
            if (PowerupSystem.isSwordActive() && block.type !== 'MALWARE') {
                if (isActionKey) { block.state = 'dead'; onHit(block); handled = true; break; }
            }

            switch (block.type) {
                case 'STANDARD':
                    if (isColumnKey && key === block.columnKey && !shift) {
                        block.state = 'dead'; onHit(block); handled = true;
                    } else if (isActionKey) {
                        // Wrong key or wrong modifier on standard = error
                        onError(block); handled = true;
                    }
                    break;

                case 'ENCRYPTED':
                    if (isColumnKey && key === block.columnKey && shift) {
                        block.state = 'dead'; onHit(block); handled = true;
                    } else if (isActionKey) {
                        // Wrong column or missing shift = error
                        onError(block); handled = true;
                    }
                    break;

                case 'MALWARE':
                    if (isActionKey) {
                        block.glitchT = 0.6; onError(block); handled = true;
                    }
                    break;

                case 'VIRUS':
                    if (key === ' ') {
                        block.state = 'dead'; onHit(block); handled = true;
                    } else if (isColumnKey) {
                        onError(block); handled = true;
                    }
                    break;
            }
            if (handled) break;
        }

        if (!handled && isActionKey) onError(null);
    }

    function updateBlocks(dt) {
        const speedMult = PowerupSystem.isOverclockActive() ? 0.5 : 1.0;
        const effectiveSpd = GS.speed * speedMult;
        const ch = canvas.height;

        for (let i = GS.blocks.length - 1; i >= 0; i--) {
            const block = GS.blocks[i];

            if (block.state === 'dead') { GS.blocks.splice(i, 1); continue; }

            block.y += effectiveSpd * dt;
            if (block.glitchT > 0) block.glitchT -= dt;

            // Track zone entry (so we only trigger miss after block entered)
            if (!block.enteredZone && Spawner.isInCaptureZone(block, ch)) {
                block.enteredZone = true;
            }

            // ── Immediate miss: block exited capture zone bottom ──────────────────
            if (block.enteredZone && Spawner.hasPassedCaptureBottom(block, ch)) {
                const laneIdx = block.lane - 1;
                // Capture the cooldown flag BEFORE resetting it
                const hadCooldown = GS.colErrorCooldown[laneIdx];
                GS.colErrorCooldown[laneIdx] = false; // reset for next block in this lane

                if (block.state === 'falling') {
                    if (block.type === 'MALWARE') {
                        // MALWARE passing = player correctly did nothing — no error
                    } else if (block.type === 'VIRUS') {
                        // Virus escaped: error + lock that column for 5s (does NOT stack)
                        onError(block);
                        if (GS.lockedColumns[laneIdx] <= 0) {
                            GS.lockedColumns[laneIdx] = COL_LOCK_DURATION;
                        }
                    } else {
                        // Skip auto-miss if player already paid for this block via false press
                        if (!hadCooldown) onError(block);
                    }
                    block.state = 'passed';
                }
                GS.blocks.splice(i, 1);
                continue;
            }

            // Safety-net: remove anything that left the screen entirely
            if (Spawner.hasPassed(block, ch)) {
                GS.blocks.splice(i, 1);
            }
        }
    }

    function updateSpawn(dt) {
        const speedMult = PowerupSystem.isOverclockActive() ? 0.5 : 1.0;
        GS.nextSpawnIn -= dt / speedMult;
        if (GS.nextSpawnIn <= 0) {
            // Once the 200-block quota is used up, only spawn disruptors (MALWARE/VIRUS)
            const forceDisruptor = GS.scorableSpawned >= MAX_SCOREABLE;
            const block = Spawner.createBlock(GS.circuits, canvas.height, forceDisruptor);

            if (!forceDisruptor &&
                (block.type === 'STANDARD' || block.type === 'ENCRYPTED')) {
                GS.scorableSpawned++;
                checkDifficulty();   // speed ramp is block-count based
            }

            block.speed = GS.speed;
            GS.blocks.push(block);
            GS.nextSpawnIn = GS.spawnInterval * (0.7 + Math.random() * 0.6);
        }
    }

    // ─── PAUSE ────────────────────────────────────────────────────────
    function togglePause() {
        if (GS.status === 'playing') {
            GS.status = 'paused';
            cancelAnimationFrame(rafId);
            bgMusic.pause();
            UI.showPause(true);
        } else if (GS.status === 'paused') {
            GS.status = 'playing';
            UI.showPause(false);
            bgMusic.play().catch(e => console.warn("Audio autoplay blocked", e));
            GS.lastFrameTs = performance.now();
            rafId = requestAnimationFrame(gameLoop);
        }
    }

    // ─── GAME LOOP ────────────────────────────────────────────────────
    let rafId = null;

    function gameLoop(ts) {
        if (GS.status !== 'playing') return;

        const dt = Math.min((ts - GS.lastFrameTs) / 1000, 0.1);
        GS.lastFrameTs = ts;
        GS.elapsedSec += dt;

        if (GS.glitchTimer > 0) GS.glitchTimer -= dt;
        // Tick per-column lock timers
        for (let i = 0; i < GS.lockedColumns.length; i++) {
            if (GS.lockedColumns[i] > 0) GS.lockedColumns[i] = Math.max(0, GS.lockedColumns[i] - dt);
        }

        PowerupSystem.tick(ts);
        UI.setPowerupActive(PowerupSystem.getActive());

        updateSpawn(dt);
        updateBlocks(dt);
        updateParticles(dt);
        UI.updateTime(GS.elapsedSec);

        // Render
        clearCanvas();
        rainCanvas.draw(ctx, dt);
        drawLanes();
        drawCaptureZone();
        GS.blocks.forEach(drawBlock);
        drawParticles();
        drawGlitchOverlay();
        drawLockedColumns();           // column lock neon overlays
        drawColumnBase();              // base bar drawn on top so it clips falling blocks
        drawCanvasHUD();

        // End condition: all 30 circuit slots filled (lit + broken = MAX_CIRCUITS)
        if (GS.circuits + GS.circuitBreaks >= MAX_CIRCUITS) {
            endGame();
            return;
        }

        rafId = requestAnimationFrame(gameLoop);
    }

    // ─── GAME STATE ───────────────────────────────────────────────────
    function startGame() {
        ensureAudio();

        // Read lane selector
        const laneRadio = document.querySelector('input[name="lane-mode"]:checked');
        Spawner.setLanes(laneRadio ? parseInt(laneRadio.value) : 5);

        // Read difficulty selector and compute speed multiplier
        // N1=1.0, N2=+25%, N3=+50%, N4=+100%, N5=+200%
        const diffRadio = document.querySelector('input[name="difficulty"]:checked');
        const diffLevel = diffRadio ? parseInt(diffRadio.value) : 1;
        const DIFF_MULT = [1.0, 1.0, 1.25, 1.5, 2.0, 3.0];
        const dm = DIFF_MULT[diffLevel] || 1.0;
        // N1 baseline: base=140, step=(340-140)/8=25, max=340
        const diffBaseSpeed = Math.round(140 * dm);
        const diffSpeedStep = Math.round(25 * dm);
        const diffMaxSpeed = Math.round(340 * dm);

        Object.assign(GS, {
            status: 'playing',
            score: 0, circuits: 0, circuitBreaks: 0,
            hits: 0, misses: 0, totalErrors: 0,
            brokenCircuits: new Set(),
            scorableSpawned: 0,
            consecutiveErrors: 0, integrityLeft: MAX_ERRORS,
            baseSpeed: diffBaseSpeed,
            speed: diffBaseSpeed,
            speedStep: diffSpeedStep,
            maxSpeed: diffMaxSpeed,
            spawnInterval: 1.4,
            elapsedSec: 0, glitchTimer: 0,
            lockedColumns: [0, 0, 0, 0, 0],
            colErrorCooldown: [false, false, false, false, false],
            blocks: [], nextSpawnIn: 0.8, lastGrantCircuit: 0,
        });
        particles.length = 0;

        PowerupSystem.reset();
        UI.buildCircuitGrid();
        UI.updateScore(0);
        UI.updateCircuits(0);
        UI.updateIntegrity(MAX_ERRORS);
        UI.setPowerupActive(null);
        UI.showPause(false);
        UI.showScreen('game');
        resizeCanvas();
        startDrone(GS.speed);
        bgMusic.currentTime = 0;
        bgMusic.play().catch(e => console.warn("Audio autoplay blocked", e));

        GS.lastFrameTs = performance.now();
        rafId = requestAnimationFrame(gameLoop);
    }

    // ─── ENDING ANIMATION ─────────────────────────────────────────────
    /**
     * 5-second canvas cinematic before the end screen.
     * Phases: 0-1.5s intensity build, 1.5-3.5s main reveal, 3.5-5s fade-out.
     */
    function drawEndingFrame(elapsed, stats) {
        const cw = canvas.width, ch = canvas.height;
        const t = elapsed;   // 0..5
        const progress = Math.min(1, t / 5);

        // ── background ── dark with slight green tint
        ctx.fillStyle = `rgba(1,8,1,${t < 4 ? 0.3 : 0.12})`;
        ctx.fillRect(0, 0, cw, ch);

        // ── phase 1 (0-1.5s): red breach flash + glitch lines ──
        if (t < 1.5) {
            const intensity = (1.5 - t) / 1.5;
            ctx.fillStyle = `rgba(255,17,51,${0.15 * intensity})`;
            ctx.fillRect(0, 0, cw, ch);
            const numG = Math.floor(8 + 12 * (1 - intensity));
            for (let i = 0; i < numG; i++) {
                const y = Math.random() * ch;
                ctx.fillStyle = `rgba(255,17,51,${0.4 * intensity})`;
                ctx.fillRect((Math.random() - 0.5) * 40, y, cw + 40, 2 + Math.random() * 8);
            }
        }

        // ── glitch stripes always present (dimming over time) ──
        const stripeFade = Math.max(0, 1 - t / 3.5);
        if (Math.random() < 0.7 && stripeFade > 0) {
            const ns = 3 + Math.floor(Math.random() * 5);
            for (let i = 0; i < ns; i++) {
                const sy = Math.random() * ch;
                ctx.fillStyle = `rgba(0,255,102,${0.08 * stripeFade})`;
                ctx.fillRect(0, sy, cw, 1 + Math.random() * 4);
            }
        }

        // ── main central text ──
        const textAlpha = Math.min(1, t < 0.5 ? t * 2 : t > 4 ? (5 - t) : 1);
        const jitter = t < 2 ? (Math.random() - 0.5) * 14 * (1 - t / 2) : 0;

        ctx.save();
        ctx.textAlign = 'center';

        // Stacked label
        ctx.font = `bold 13px ${FONT_HEAD}`;
        ctx.fillStyle = `rgba(0,255,102,${textAlpha * 0.6})`;
        ctx.fillText('[ SISTEMA ]', cw / 2 + jitter, ch / 2 - 80 + jitter * 0.3);

        // Main headline with neon glow
        ctx.shadowColor = `rgba(0,255,102,${textAlpha * 0.9})`;
        ctx.shadowBlur = 28;
        ctx.font = `bold 46px ${FONT_HEAD}`;
        ctx.fillStyle = `rgba(0,255,102,${textAlpha})`;
        ctx.fillText('INVASÃO', cw / 2 + jitter, ch / 2 - 18);

        ctx.shadowColor = `rgba(0,200,255,${textAlpha * 0.9})`;
        ctx.font = `bold 36px ${FONT_HEAD}`;
        ctx.fillStyle = `rgba(0,220,255,${textAlpha})`;
        ctx.fillText('CONCLUÍDA', cw / 2 - jitter, ch / 2 + 38);
        ctx.shadowBlur = 0;

        // Score flash (appears after 1.5s)
        if (t > 1.5) {
            const sA = Math.min(1, (t - 1.5) / 1);
            ctx.font = `12px ${FONT_MONO}`;
            ctx.fillStyle = `rgba(0,255,102,${sA * 0.7})`;
            ctx.fillText(`SCORE  ${String(stats.score).padStart(3, '0')}  ·  CIRCUITOS  ${stats.circuits} / 30  ·  QUEBRAS  ${stats.circuitBreaks}`, cw / 2, ch / 2 + 88);
        }

        // Countdown pill bottom
        const secLeft = Math.max(0, Math.ceil(5 - t));
        ctx.font = `11px ${FONT_MONO}`;
        ctx.fillStyle = `rgba(0,170,68,${textAlpha * 0.5})`;
        ctx.fillText(`// calculando resultado em ${secLeft}s //`, cw / 2, ch - 40);

        // Progress bar
        const barW = Math.min(300, cw * 0.4);
        ctx.strokeStyle = `rgba(0,255,102,${textAlpha * 0.3})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(cw / 2 - barW / 2, ch - 30, barW, 4);
        ctx.fillStyle = `rgba(0,255,102,${textAlpha * 0.7})`;
        ctx.fillRect(cw / 2 - barW / 2, ch - 30, barW * progress, 4);

        ctx.restore();
    }

    function endGame() {
        const finalStats = {
            score: GS.score, circuits: GS.circuits, time: GS.elapsedSec,
            circuitBreaks: GS.circuitBreaks, hits: GS.hits, misses: GS.misses,
        };
        GS.status = 'ending';
        cancelAnimationFrame(rafId);
        stopDrone();
        bgMusic.pause();
        InputHandler.disable();

        // Run 5-second ending animation, then show results
        const ANIM_DURATION = 5.0;
        let elapsed = 0;
        let lastTs = performance.now();

        function endingFrame(ts) {
            const dt = Math.min((ts - lastTs) / 1000, 0.1);
            lastTs = ts;
            elapsed += dt;

            // Draw rain background + ending cinematic
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = C.bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            rainCanvas.draw(ctx, 0.016);   // advance rain at ~60fps pace
            drawEndingFrame(elapsed, finalStats);

            if (elapsed < ANIM_DURATION) {
                requestAnimationFrame(endingFrame);
            } else {
                UI.showEndScreen(finalStats);
            }
        }
        requestAnimationFrame(endingFrame);
    }

    function goToMenu() {
        GS.status = 'idle';
        cancelAnimationFrame(rafId);
        stopDrone();
        bgMusic.pause();
        InputHandler.disable();
        UI.showPause(false);
        UI.showScreen('start');
    }

    // ─── POWERUP UI SYNC ──────────────────────────────────────────────
    PowerupSystem.init(({ charges, active }) => {
        [1, 2, 3].forEach(slot => UI.updatePowerupCharges(slot, charges[slot]));
        UI.setPowerupActive(active);
    });

    // ─── GLOBAL KEYS (ESC / Enter — outside of InputHandler) ─────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (GS.status === 'playing' || GS.status === 'paused') goToMenu();
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (GS.status === 'playing' || GS.status === 'paused') togglePause();
        }
    });

    // ─── BUTTON WIRING ────────────────────────────────────────────────
    document.getElementById('btn-start').addEventListener('click', () => {
        InputHandler.enable();
        InputHandler.register(processKey);
        startGame();
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
        InputHandler.enable();
        InputHandler.register(processKey);
        startGame();
    });
    document.getElementById('btn-menu').addEventListener('click', goToMenu);

    // ─── DIGITAL RAIN on start/end screens ───────────────────────────
    UI.spawnDigitalRain(document.getElementById('rain-bg-start'));
    UI.spawnDigitalRain(document.getElementById('rain-bg-end'));

    // ─── INITIAL STATE ────────────────────────────────────────────────
    UI.buildCircuitGrid();
    UI.updateScore(0);
    UI.updateIntegrity(MAX_ERRORS);
    UI.updateTime(0);
    [1, 2, 3].forEach(s => UI.updatePowerupCharges(s, 1));
    UI.showScreen('start');

})();
