/* ══════════════════════════════════════════════════════════════════
   spawn.js — Block spawning, types, and fall logic
   Block types:
     STANDARD    → Format "AB7"  → press column key (Z/X/C/V/B)
     ENCRYPTED   → Format "@X2"  → press SHIFT + column key
     MALWARE     → Format "A!5"  → do NOT press anything
     VIRUS       → Format "😈"   → press SPACE at impact
   Lane count is configurable at runtime: call Spawner.setLanes(4|5)
══════════════════════════════════════════════════════════════════ */

const Spawner = (() => {

    // ─── Constants ───────────────────────────────────────────────────

    let LANES = 5;            // Number of vertical lanes (4 or 5, configurable)
    const BLOCK_W = 80;         // Block width in px
    const BLOCK_H = 40;         // Block height in px
    const CAPTURE_Y = 0.82;     // Capture zone TOP = 82% of canvas height

    // Capture zone height — 20% taller than original (was BLOCK_H * 1.4)
    const CAPTURE_ZONE_H = BLOCK_H * 1.68;  // ≈ 67 px

    // All possible column names; active set = first LANES entries
    const ALL_COLUMN_KEYS = ['Z', 'X', 'C', 'V', 'B'];

    /** Returns the active column keys for the current LANES setting */
    function getColumnKeys() { return ALL_COLUMN_KEYS.slice(0, LANES); }

    // ─── Type pools ──────────────────────────────────────────────────

    const POOL_EARLY = [
        { type: 'STANDARD', weight: 50 },
        { type: 'ENCRYPTED', weight: 20 },
        { type: 'MALWARE', weight: 20 },
        { type: 'VIRUS', weight: 10 },
    ];
    const POOL_LATE = [
        { type: 'STANDARD', weight: 30 },
        { type: 'ENCRYPTED', weight: 25 },
        { type: 'MALWARE', weight: 25 },
        { type: 'VIRUS', weight: 20 },
    ];

    // Alphabet for generating display characters
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

    // ─── Utility ─────────────────────────────────────────────────────

    function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function randChar() { return ALPHA[Math.floor(Math.random() * ALPHA.length)]; }
    function randLane() { return randInt(1, LANES); }
    function randDigit() { return Math.floor(Math.random() * 10); }

    /** Set the number of active lanes (4 or 5). Call before startGame(). */
    function setLanes(n) { LANES = (n === 4) ? 4 : 5; }

    /** Weighted random pick from pool */
    function randomType(pool) {
        const total = pool.reduce((s, e) => s + e.weight, 0);
        let r = Math.random() * total;
        for (const entry of pool) {
            r -= entry.weight;
            if (r <= 0) return entry.type;
        }
        return pool[pool.length - 1].type;
    }

    function getPool(circuitsCompleted) {
        return circuitsCompleted >= 15 ? POOL_LATE : POOL_EARLY;
    }

    // ─── Block factory ───────────────────────────────────────────────

    /**
     * @param {boolean} [forceDisruptor=false]
     *   When true, only MALWARE or VIRUS are created.
     *   Use once the 200 scoreable blocks quota is exhausted.
     */
    function createBlock(circuitsCompleted, canvasHeight, forceDisruptor = false) {
        let type;
        if (forceDisruptor) {
            type = Math.random() < 0.5 ? 'MALWARE' : 'VIRUS';
        } else {
            const pool = getPool(circuitsCompleted);
            type = randomType(pool);
        }
        const lane = randLane();
        const columnKey = ALL_COLUMN_KEYS[lane - 1];

        let label = '';
        let targetKey = null;
        let shiftRequired = false;
        let allowedPress = true;

        switch (type) {
            case 'STANDARD': {
                const a = randChar(), b = randChar();
                label = `${a}${b}${randDigit()}`;
                targetKey = columnKey;
                break;
            }
            case 'ENCRYPTED': {
                const a = randChar(), b = randChar();
                label = `@${a}${b}${randDigit()}`;
                targetKey = columnKey;
                shiftRequired = true;
                break;
            }
            case 'MALWARE': {
                const a = randChar();
                label = `${a}!${randDigit()}`;
                targetKey = null;
                allowedPress = false;
                break;
            }
            case 'VIRUS': {
                label = '😈';
                targetKey = ' ';
                break;
            }
        }

        return {
            id: Math.random().toString(36).slice(2),
            type,
            label,
            lane,
            columnKey,
            targetKey,
            shiftRequired,
            allowedPress,
            y: -BLOCK_H,
            speed: 0,
            state: 'falling',
            hitTime: null,
            enteredZone: false,  // set true when block centre first enters capture zone
            glitchT: 0,
        };
    }

    // ─── Capture zone helpers ─────────────────────────────────────────

    function getCaptureY(canvasHeight) {
        return canvasHeight * CAPTURE_Y;
    }

    /** True while block's centre is inside the capture window */
    function isInCaptureZone(block, canvasHeight) {
        const captureTop = getCaptureY(canvasHeight);
        const centre = block.y + BLOCK_H / 2;
        return centre >= captureTop && centre <= captureTop + CAPTURE_ZONE_H;
    }

    /**
     * True once the block's centre has exited the BOTTOM of the capture window.
     * Used to trigger an immediate miss error (instead of waiting for off-screen).
     */
    function hasPassedCaptureBottom(block, canvasHeight) {
        const captureTop = getCaptureY(canvasHeight);
        const centre = block.y + BLOCK_H / 2;
        return centre > captureTop + CAPTURE_ZONE_H;
    }

    /** Safety-net: block has left the canvas entirely */
    function hasPassed(block, canvasHeight) {
        return block.y > canvasHeight + BLOCK_H;
    }

    function laneX(lane, canvasWidth) {
        const laneW = canvasWidth / LANES;
        return (lane - 1) * laneW + (laneW - BLOCK_W) / 2;
    }

    // ─── Public API ───────────────────────────────────────────────────

    return {
        get LANES() { return LANES; },
        get COLUMN_KEYS() { return getColumnKeys(); },
        BLOCK_W,
        BLOCK_H,
        CAPTURE_Y,
        CAPTURE_ZONE_H,
        setLanes,
        createBlock,
        getCaptureY,
        isInCaptureZone,
        hasPassedCaptureBottom,
        hasPassed,
        laneX,
    };

})();
