/**
 * List rows a filter rules out (the weapon tree's hunter filter, the monster
 * lists' Captured and Hunted) fade in place rather than leave the list.
 */
export const filterFade = "transition-opacity duration-150 ease-out motion-reduce:transition-none";

/** A row the filter rules out. */
export const filteredOut = "opacity-30";

/**
 * A tree row's height in px (WeaponTreeRow), which TreeBranch also sizes the
 * rows it skips by.
 */
export const TREE_ROW_HEIGHT = 38;
