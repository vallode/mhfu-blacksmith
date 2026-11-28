import type { WeaponType } from "./constants";

/** The PSP buttons a move's input can take; `stick` is the analog stick pushed forward. */
export type InputButton = "triangle" | "circle" | "cross" | "r" | "select" | "stick";

/** One step of an input: buttons pressed together, or held to charge. */
export interface InputStep {
  buttons: InputButton[];
  hold?: true;
}

/** A move's input: its steps, one after another (a combo's earlier moves first). */
export type MoveInput = InputStep[];

const SYMBOLS: Record<string, InputButton> = {
  "△": "triangle",
  "○": "circle",
  "×": "cross",
  R: "r",
  SELECT: "select",
  "↑": "stick",
};

/**
 * An input written as in `MOVE_INPUTS`: steps split by " › ", buttons
 * pressed together by "+", "hold " before a held step ("hold △",
 * "R+△ › △"). Throws on a symbol it doesn't know.
 */
export function parseInput(text: string): MoveInput {
  return text.split(" › ").map((step) => {
    const hold = step.startsWith("hold ");
    const buttons = (hold ? step.slice(5) : step).split("+").map((s) => {
      const button = SYMBOLS[s];
      if (!button) throw new Error(`Unknown button "${s}" in "${text}".`);
      return button;
    });
    return hold ? { buttons, hold: true } : { buttons };
  });
}

/**
 * Each move's input with the game's default controls (Type 1), by weapon
 * type and the move's key in data/motion-values.json: △ ○ × R SELECT,
 * ↑ the analog stick pushed. A step after "×" follows a roll; a draw attack
 * is done moving with the weapon sheathed. The disc doesn't list them; they
 * follow GameFAQs' MHFU guides (DS31's Melee Damage FAQ, Darksun45230's
 * walkthrough, Joritoes' weapon guide) and the Monster Hunter wiki's MHFU
 * controls. The Hunting Horn's recital finish (R again) is Joritoes' alone.
 */
export const MOVE_INPUTS: Partial<Record<WeaponType, Record<string, string>>> = {
  "great-sword": {
    "vertical-slash": "△",
    "side-slash": "○",
    upswing: "△+○",
    "charge-1": "hold △",
    "charge-2": "hold △",
    "charge-3": "hold △",
    kick: "SELECT",
  },
  "long-sword": {
    "step-slash": "△",
    "vertical-slash": "△ › △",
    thrust: "○",
    "rising-slash": "○ › △",
    "fade-slash": "△+○",
    "spirit-slash-1": "R",
    "spirit-slash-2": "R › R",
    "spirit-slash-3": "R › R › R",
    "spirit-slash-empty": "R",
  },
  "sword-and-shield": {
    "jumping-slash": "△+○",
    slash: "△",
    "horizontal-slash": "△ › △",
    "shield-bash-combo": "△ › △ › △",
    roundslash: "○",
    "rising-slash": "× › △",
    "guard-slash": "R+○",
    "guard-rising-slash": "R+△",
  },
  "dual-blades": {
    "combo-1": "△",
    "combo-2": "△ › △",
    "combo-3": "△ › △ › △",
    roundslash: "○",
    "lunging-slash": "△+○",
    "rising-slash": "× › △",
    "demon-roundslash": "○",
    "demon-dance": "△+○",
  },
  hammer: {
    "draw-attack": "↑+△",
    "overhead-smash-1": "△",
    "overhead-smash-2": "△ › △",
    upswing: "△ › △ › △",
    "side-smash": "○",
    "charge-1": "hold R",
    "charge-2": "hold R",
    superpound: "hold R",
    "spinning-bludgeon": "hold R+↑",
  },
  "hunting-horn": {
    swing: "△",
    jab: "○",
    "overhead-smash": "△+○",
    "recital-start": "R",
    "recital-note-1": "R › ○",
    "recital-note-2": "R › △",
    "recital-note-3": "R › △+○",
    "recital-end": "R › R",
  },
  lance: {
    "draw-attack": "↑+△",
    "forward-thrust": "△",
    "forward-thrust-3": "△ › △ › △",
    "upward-thrust": "○",
    "upward-thrust-3": "○ › ○ › ○",
    "guard-thrust": "R+△",
    charge: "△+○",
    "charge-finisher": "△+○ › △",
  },
  gunlance: {
    "draw-attack": "↑+△",
    "forward-thrust": "△",
    "forward-thrust-3": "△ › △ › △",
    "upward-thrust": "△+○",
    "guard-thrust": "R+△",
    "rushing-thrust": "↑+△",
  },
  bow: {
    "melee-1": "○",
    "melee-2": "○ › ○",
  },
};

/** A move's input, if it has one listed. */
export function moveInput(type: WeaponType, move: string): MoveInput | null {
  const text = MOVE_INPUTS[type]?.[move];
  return text ? parseInput(text) : null;
}
