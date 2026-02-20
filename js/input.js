/* ══════════════════════════════════════════════════════════════════
   input.js — Keyboard input handler
   Passes { key, shift } objects to the registered game handler.
   Modifier-only keys (Shift, Control, Alt, Meta) are silently ignored
   so holding Shift between presses never triggers a false error.
══════════════════════════════════════════════════════════════════ */

const InputHandler = (() => {

    const held = new Set();
    let onKeyHandler = null;

    // Keys that are pure modifiers — never forwarded to game logic
    const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta',
        'CapsLock', 'NumLock', 'ScrollLock']);

    function register(handler) {
        onKeyHandler = handler;
    }

    function handleKeyDown(e) {
        // Prevent browser shortcuts for game-used keys
        if (['Backspace', ' ', 'Tab'].includes(e.key)) {
            e.preventDefault();
        }

        // Ignore modifier-only keydowns entirely
        if (MODIFIER_KEYS.has(e.key)) return;

        // De-bounce: ignore key-repeat events
        if (held.has(e.code)) return;
        held.add(e.code);

        if (!onKeyHandler) return;

        let key = e.key;

        // Normalise letter keys to uppercase
        if (/^[a-zA-Z]$/.test(key)) {
            key = key.toUpperCase();
        }

        onKeyHandler({ key, shift: e.shiftKey });
    }

    function handleKeyUp(e) {
        held.delete(e.code);
    }

    function enable() {
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
    }

    function disable() {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        held.clear();
    }

    return { register, enable, disable };

})();
