# Monster attacks: where things stand

Notes for whoever picks up monster attacks next. The README's "Monster
attacks" section says how `export-site` finds them; this file keeps what was
learned about the attack row along the way, and what is still open.

## How the site gets attacks

`src/monsters/attacks.ts` runs each monster's attack spawner on a small
Allegrex interpreter (`src/monsters/mips.ts`) for every motion slot and
every frame the spawner asks about, and reads back each attack object it
makes (vallode/mhfu-blacksmith#300). `export-site` writes the result to
`apps/blacksmith/public/models/monsters/emNN.attacks.json`, one file per
monster. The 3D viewer draws the capsules, and the monster page's Attacks
tab lists each motion's hits. EU disc only.

To refresh the files after changing what they hold (from the repo root):

```bash
pnpm --filter mhfu-extract export-site --unpacked .cache/mhfu
```

## The row

Each attack object copies a 24-byte row out of the species' attack table.
It has the layout of the player's `PlayerMotVal`:

| Offset         | `PlayerMotVal`    | Meaning                                                                                         |
| -------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `0x00`, `0x01` |                   | delay, duration (60 fps on the disc, halved into 30 Hz ticks in the object)                     |
| `0x02`         | MotionValue       | damage (power)                                                                                  |
| `0x03`         | KnockbackStrength | the hunter's reaction (1 or 2 in most rows; values not mapped)                                  |
| `0x07`         |                   | `0xE0` in nearly every row                                                                      |
| `0x08`         |                   | guard knockback                                                                                 |
| `0x09`         | DamageType        | element bits: `0x04` fire, `0x10` water, `0x20` dragon, `0x40` thunder, `0x80` ice              |
| `0x0A`         |                   | shape list index                                                                                |
| `0x0C`, `0x0D` | EffectonHit1, 2   | status bits: `0x0C` 1 sleep, 2 poison, 4 paralysis; `0x0D` 2 snowman, 4 soiled, 16 defense down |
| `0x0E`         | StatusDuration    | the status's buildup (Rathian's Backflip: poison 25)                                            |
| `0x14`         | KO                | stun                                                                                            |

The guard, element and status meanings were found by searching the EU disc
for the Monster Hunter Wiki's MHFU numbers per attack (damage, stun, guard
knockback, element, status; 283 attacks of 38 monsters): 249 of the 259
attacks with damage and guard knockback had a row with the same numbers,
and the element and status bits are those rows' named elements and
statuses (vallode/mhfu-blacksmith#122). Bytes `0x04`, `0x11`, `0x13`,
`0x15` and `0x17` were zero in every row, the top two bits of `0x07` set,
and `0x10` at most 5.

## Open questions

- **Element bit `0x01`** is set in all but 3 rows, and **`0x08`** shows on
  Teostra's blast; neither is known. The site leaves both out.
- **Dragon on Rathian and Rathalos.** The static search found four
  76-damage rows and a Swoop-like row with bit `0x20` among the records
  Rathian's and Rathalos's code uses, though the wiki gives none of their
  attacks an element. Elsewhere `0x20` matches dragon (Lao-Shan Lung,
  Kushala Daora, Fatalis, Tigrex's family). Worth checking against
  `em11.attacks.json` and `em01.attacks.json` once they carry elements.
- **Reaction** (`0x03`) values: which hunter reaction each is.
- **Bytes `0x07`, `0x10` and the rest** of the row.
- **Gaps in the sweep** (README): shapes the game places in code (joints
  0x7D-0x7F) are skipped, and Bulldrome, Mosswine, Bullfango, the Lynians,
  Great Thunderbugs and Remobras make no attacks through their spawner.
- **Attack names.** The disc has none. The only source found is the wiki,
  which is CC BY-SA 4.0, so names on the site would need its credit.
- **Patterns.** Which attacks a monster picks, when, and in what order, is
  in its AI code; `packages/randomfu/docs/monster-ai.md` maps that code.
