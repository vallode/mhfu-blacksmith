/**
 * Poogie's luck (`poogie.enabled`): pet Poogie successfully before a hunt and
 * that hunt's carves, captures, breaks and quest rewards favour rarer
 * rewards, more so the more often Poogie has been happy (its affection).
 *
 * What the game already does (found on the EU and JP discs):
 *
 * - Save event flags are a bit array at save `+0x508`, with set, clear and
 *   test helpers in the EBOOT. The save is reached through a global pointer.
 * - Petting Poogie at home (`lobby_task.ovl`) sets flag 0x1AC when Poogie
 *   lies down happily and 0x1AB when it knocks the hunter over. The quest's
 *   return-to-village step (`game_task.ovl`) clears both, so 0x1AC means
 *   "petted successfully since the last hunt" for the whole of the next one.
 * - Carves, captures and breaks draw from one weighted picker in the EBOOT,
 *   `pick(list, qtyOut)`: entries are (chance, item) or, with a quantity
 *   pointer, (chance, item, qty), ending at chance 0xFFFF. It rolls
 *   rng() % total chance and walks the list.
 * - The quest's own rewards are rolled in the reward state of `game_task`,
 *   one state before the flags are cleared, by an EBOOT function that does
 *   the same roll and walk inline over the quest's `RewardItem` lists
 *   (chance, item, amount) and writes each pick into the save's reward box
 *   (item at `+0x390`, amount at `+0x392`, 4 bytes a slot). A list whose
 *   header is 0x8000 always gives its first entry in its first slot.
 *
 * The luck is blob code (`blob/poogie.c`), on the code loader: the picker's
 * first words jump to the blob's `rf_hook5` (hook 5, `game-hooks.ts`), which
 * rolls as the game's does, except that while flag 0x1AC is set it rolls 2
 * to 4 times, by affection, and keeps the entry with the lower chance. The
 * blob counts happy pets and tumbles in randomfu's save data (`blob/rf.h`).
 * This patch also replaces the quest rewards' inline walk with a call to the
 * picker, keeping the forced first entry, so they get the luck too. Without
 * the blob (the title screen) the game's own picker runs. Everything is
 * found by code signatures, which match the EU and JP (FUC) EBOOTs, and
 * nothing is patched if one doesn't match.
 */
import { decodeObjects } from "../blob/link.js";
import { POOGIE_OBJECTS } from "../blob/poogie-object.js";
import type { Edits } from "../edits.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import type { PickSite } from "./game-hooks.js";
import {
  ADDIU,
  ADDU,
  Assembler,
  BEQL,
  BNE,
  LHU,
  ORI,
  R,
  SH,
  codeSegment,
  findUnique,
  luiLwAddress,
} from "./mips.js";

/**
 * Masked code signatures. `maskWord` drops the parts that move between
 * regions: jump targets, `lui` and `lw`/`sw` offsets, and constants loaded
 * from `$zero`.
 */
export const PICKER_SIGNATURE = [
  0x27bdffe0, 0xafbf0000, 0xafb30000, 0xafb20000, 0xafb10000, 0x00a09021, 0xafb00000, 0x16400003,
  0x00809821, 0x10000002, 0x24100000, 0x24100000, 0x96620000, 0x34040000, 0x00008821, 0x10440009,
  0x02602821, 0x00101840, 0x94a20000, 0x02221021, 0x3051ffff, 0x00a32821, 0x94a20000, 0x5444fffb,
  0x94a20000, 0x3c020000, 0x8c440000, 0x0c000000,
];
/** The game's picker ends with `jr $ra` at 0x108. */
export const PICKER_WORDS = 68;
/** `lui $v0, hi(save)`, `lw $v0, lo(save)($v0)`, then `lui $at, 6; ori $at, $at, 0xA5EA`. */
export const SAVE_POINTER_SIGNATURE = [0x3c020000, 0x8c420000, 0x3c010000, 0x3421a5ea];
/**
 * The quest rewards' inline roll and walk, then the code after it that stores
 * the pick into the reward box. In: `$s3` the list, `$s6` the list's header,
 * `$s1` the slot of the list, `$s2` the reward box offset. Out: `$a2` points at
 * the picked item and its amount.
 */
export const QUEST_REWARD_SIGNATURE = [
  0x96620000, 0x34030000, 0x00008021, 0x10430008, 0x02602021, 0x94820000, 0x02021021, 0x3050ffff,
  0x24840006, 0x94820000, 0x5443fffb, 0x94820000, 0x3c020000, 0x8c440000, 0x0c000000, 0x00002821,
  0x3043ffff, 0x3202ffff, 0x0062001a, 0x96c30000, 0x00002010, 0x34020000, 0x14620004, 0x3084ffff,
  0x56200003, 0x96620000, 0x00002021, 0x96620000, 0x34050000, 0x00003821, 0x1045000c, 0x02603021,
  0x3084ffff, 0x94c20000, 0x24c30002, 0x00e21021, 0x3047ffff, 0x0087102a, 0x14400004, 0x00603021,
  0x94620004, 0x1445fff7, 0x24660004, 0x94c40000, 0x5080000d, 0x2a810010, 0x3c020000, 0x8c430000,
  0x26940001, 0x00721821, 0xa4640390, 0x3c020000, 0x8c420000, 0x94c30002, 0x00521021, 0xa4430392,
  0x26520004,
];
/** Words of the inline walk the patch replaces: up to `lhu $a0, 0($a2)`, which reads the pick. */
export const QUEST_REWARD_WORDS = 43;
/** The reward box in the save: item and amount, 4 bytes a slot. */
const REWARD_BOX = 0x390;
/** A reward list header that makes the list's first slot always give its first entry. */
const FIRST_ENTRY_LIST = 0x8000;

/** A lucky pick's rolls in the test build (`guaranteed`): 1 << 10, plus one. */
const GUARANTEED_ROLLS = (1 << 10) + 1;

export interface PoogieLuckOptions {
  /**
   * For testing in game: a lucky pick rolls 1025 times instead of 2 to 4, so
   * it all but always lands on the rarest entry (a 1% entry is missed about
   * once in 30,000 picks).
   */
  guaranteed?: boolean;
}

export const poogieObjects = () => decodeObjects(POOGIE_OBJECTS);

/**
 * The quest rewards' walk, as a call to the picker: it rolls with the luck,
 * writes the amount into the reward box slot, and the item next to it, then
 * leaves `$a2` at the slot for the game's code after it. The list's forced
 * first entry stays as it was. Every register it uses is free there: the
 * game's version calls the RNG, and `$s0` is set again before it's read.
 */
export function assembleQuestRewardWalk(addresses: { save: number; picker: number }): number[] {
  const a = new Assembler();
  const s1 = 17;
  const s2 = 18;
  const s3 = 19;
  const s6 = 22;
  const move = (rd: number, rs: number) => a.r(rs, R.zero, rd, 0, ADDU);
  const slot = (reg: number) => {
    a.loadWord(reg, addresses.save);
    a.r(reg, s2, reg, 0, ADDU);
  };

  move(R.a0, s3);
  slot(R.a1);
  a.jal(addresses.picker);
  a.i(ADDIU, R.a1, R.a1, REWARD_BOX + 2); // the amount goes straight into the slot
  slot(R.a2);
  a.i(ADDIU, R.a2, R.a2, REWARD_BOX);
  a.i(LHU, s6, R.v1, 0);
  a.i(ORI, R.zero, R.a0, FIRST_ENTRY_LIST);
  a.branch(BNE, R.v1, R.a0, "store");
  a.emit(0);
  a.branch(BNE, s1, R.zero, "store");
  move(R.a0, s3);
  a.label("first"); // the first entry with a chance, as a roll of 0 finds
  a.i(LHU, R.a0, R.v1, 0);
  a.branch(BEQL, R.v1, R.zero, "first");
  a.i(ADDIU, R.a0, R.a0, 6);
  a.i(LHU, R.a0, R.v0, 2);
  a.i(LHU, R.a0, R.v1, 4);
  a.i(SH, R.a2, R.v1, 2);
  a.label("store");
  a.branch(BEQL, R.v0, R.zero, "item"); // no item: no amount either
  a.i(SH, R.a2, R.zero, 2);
  a.label("item");
  a.i(SH, R.a2, R.v0, 0);
  return a.link();
}

const TITLE = "Poogie";

export interface PoogieLuck {
  /** The picker, for the code loader's hook 5. */
  pick: PickSite;
  /** `blob/poogie.c`'s externs. */
  externs: Record<string, number>;
  /**
   * Routes the quest rewards through the picker once the loader is in, and
   * reports. Without the loader nothing is patched.
   */
  finish(applied: boolean): ShuffleReport;
}

/** Finds what Poogie's luck needs, or says why it can't go in this EBOOT. */
export function preparePoogieLuck(
  vanillaEboot: Buffer,
  edits: Edits,
  options: PoogieLuckOptions = {},
): PoogieLuck | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [picker, savePointer, questRewards] = findUnique(vanillaEboot, segment, [
    PICKER_SIGNATURE,
    SAVE_POINTER_SIGNATURE,
    QUEST_REWARD_SIGNATURE,
  ]);
  if (picker == null || savePointer == null || questRewards == null) {
    return "this EBOOT's code doesn't match";
  }

  const word = (vaddr: number) =>
    vanillaEboot.readUInt32LE(segment.offset + (vaddr - segment.vaddr));
  if (word(picker + (PICKER_WORDS - 2) * 4) !== 0x03e00008) {
    return "this EBOOT's code doesn't match";
  }
  const save = luiLwAddress(word(savePointer), word(savePointer + 4));
  // The game's picker loads the RNG's context and calls it at +0x64.
  const rngContext = luiLwAddress(word(picker + 0x64), word(picker + 0x68));
  const rng = (((word(picker + 0x6c) & 0x03ffffff) << 2) | (picker & 0xf0000000)) >>> 0;

  return {
    pick: { picker, prologue: [word(picker), word(picker + 4)] },
    externs: {
      rf_pick_rand: rng,
      rf_pick_rng: rngContext,
      rf_poogie_test_rolls: options.guaranteed ? GUARANTEED_ROLLS : 1,
    },
    finish(applied) {
      if (!applied) {
        const why = "the code loader isn't in this image";
        return {
          title: TITLE,
          notes: [`Poogie's luck isn't in this image: ${why}.`],
          lines: [],
          summary: `${TITLE}: not applied (${why})`,
        };
      }
      const walk = assembleQuestRewardWalk({ save, picker });
      if (walk.length > QUEST_REWARD_WORDS) {
        throw new Error(
          `Poogie's quest reward walk is ${walk.length} words, room for ${QUEST_REWARD_WORDS}`,
        );
      }
      const out = edits.eboot();
      const start = segment.offset + (questRewards - segment.vaddr);
      for (let k = 0; k < QUEST_REWARD_WORDS; k++) out.writeUInt32LE(walk[k] ?? 0, start + k * 4);
      const notes = [
        "Pet Poogie at home before a hunt. If it lies down happily, that hunt's carves, captures, breaks and quest rewards lean towards rarer rewards: each draw rolls twice and keeps the rarer, three times after 50 happy hunts and four after 200.",
      ];
      if (options.guaranteed) {
        notes.push("Test build: a happy Poogie always gives the rarest reward. Not for play.");
      }
      return {
        title: TITLE,
        notes,
        lines: [],
        summary: options.guaranteed
          ? `${TITLE}: test build, rarest reward guaranteed`
          : `${TITLE}: on`,
      };
    },
  };
}
