/* ══════════════════════════════════════════════════════════════════
   powerups.js — Power-up logic: Sword, Shield, Overclock
   Exposes PowerupSystem with methods to activate/query state.
══════════════════════════════════════════════════════════════════ */

const PowerupSystem = (() => {

    // ─── Power-up definitions ────────────────────────────────────────

    const DEFS = {
        1: { name: 'SWORD', duration: 15000 },  // 15 seconds auto-kill
        2: { name: 'SHIELD', duration: 15000 },  // 15 seconds error immunity
        3: { name: 'OVERCLOCK', duration: 15000 },  // 15 seconds slow motion
    };

    // ─── State ───────────────────────────────────────────────────────

    const charges = { 1: 1, 2: 1, 3: 1 };  // Starting charges per slot

    let active = null;   // Currently active powerup slot (1/2/3 or null)
    let activeEnd = 0;      // Timestamp when active powerup expires
    let onChangeCb = null;   // UI callback for charge updates

    // ─── Internal ────────────────────────────────────────────────────

    function notifyUI() {
        if (onChangeCb) onChangeCb({ charges: { ...charges }, active });
    }

    // ─── Public API ───────────────────────────────────────────────────

    /** Register UI update callback */
    function init(onChangeFn) {
        onChangeCb = onChangeFn;
    }

    /** Reset state for a new game */
    function reset() {
        charges[1] = 1;
        charges[2] = 1;
        charges[3] = 1;
        active = null;
        activeEnd = 0;
        notifyUI();
    }

    /**
     * Attempt to activate a power-up by slot number.
     * @param {number} slot - 1, 2, or 3
     * @param {number} now  - current timestamp (ms)
     * @returns {boolean} true if activated
     */
    function activate(slot, now) {
        if (!DEFS[slot]) return false;
        if (charges[slot] <= 0) return false;
        if (active !== null) return false; // Only one at a time

        charges[slot]--;
        active = slot;
        activeEnd = now + DEFS[slot].duration;
        notifyUI();
        return true;
    }

    /**
     * Called every frame to check expiry.
     * @param {number} now - current timestamp (ms)
     */
    function tick(now) {
        if (active !== null && now >= activeEnd) {
            active = null;
            activeEnd = 0;
            notifyUI();
        }
    }

    /**
     * Grant a random powerup (1 charge added to a random slot).
     * Called every 5 circuits = 50 pts.
     */
    function grantRandom() {
        const slot = 1 + Math.floor(Math.random() * 3); // 1, 2, or 3
        charges[slot]++;
        notifyUI();
        return slot;
    }

    // ─── Query helpers ────────────────────────────────────────────────

    /** Is SWORD currently active? (any key = hit) */
    function isSwordActive() { return active === 1; }

    /** Is SHIELD currently active? (errors don't stack) */
    function isShieldActive() { return active === 2; }

    /** Is OVERCLOCK active? (slowdown multiplier) */
    function isOverclockActive() { return active === 3; }

    /** Returns current active slot or null */
    function getActive() { return active; }

    /** Returns charges object copy */
    function getCharges() { return { ...charges }; }

    return {
        init,
        reset,
        activate,
        tick,
        grantRandom,
        isSwordActive,
        isShieldActive,
        isOverclockActive,
        getActive,
        getCharges,
        DEFS,
    };

})();
