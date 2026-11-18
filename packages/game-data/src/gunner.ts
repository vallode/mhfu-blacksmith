// Bowgun stat levels in the game's own order. Pure constants with no Node
// imports, so the site's client code can import them ("game-data/gunner").

/** Bowgun reload speeds, slowest first: the game's `Reload` 0-4. */
export const RELOAD_LEVELS = ["VerySlow", "Slow", "Normal", "Fast", "VeryFast"] as const;

/**
 * Bowgun recoil levels, heaviest first: the game's `RecoilCharge` 2-5
 * (0 and 1 don't occur). Light is one step under Moderate; VeryWeak is the
 * lightest.
 */
export const RECOIL_LEVELS = ["Moderate", "Light", "Weak", "VeryWeak"] as const;

/** The `RecoilCharge` of RECOIL_LEVELS[0]. */
export const RECOIL_CODE_BASE = 2;
