# Monster attacks: where the digging stands

Notes for whoever continues the attack work. The README's "Monster attacks
(in progress)" section is the reference for what is known and how the code
finds it; this file is the hand-off: the working loop, the addresses, what
is done, and what is still open.

## The loop

No disc files are in the repo, and none may be committed. The disc work runs
on the user's machine (EU disc, ULES01213, unpacked to
`tools/mhfu-extract/.cache/mhfu`):

1. Change the probe (`src/emit/attacks-raw.ts`, `src/monsters/*.ts`), with
   synthetic tests (`test/attacks-raw.test.ts`, `test/code-graph.test.ts`,
   `test/attack-usage.test.ts`: hand-assembled MIPS in a fake `.ovl`).
2. Commit and push; the user runs

   ```bash
   pnpm --filter mhfu-extract extract --unpacked .cache/mhfu --out .cache/mhfu/extracted --raw
   ```

   and uploads `raw/attacks.json` zipped, with the console lines
   (`Attack usage: …`, `Spawners: …`, `Wrote … attack tables`).

3. Read the dump in a scratch directory (never the repo). Keep the zip
   small: the probe output (`callees`, `code`, `data`, each table's
   `before`/`after` bytes) is what makes it large; a 35 MB zip was too big.

To refresh the site data from a new dump:

```bash
pnpm --filter mhfu-extract attack-data --dump <extracted>/raw/attacks.json
```

That writes `data/monster-attacks.json` (`src/emit/monster-attacks.ts`).
`extract --raw` also writes it to `<out>/monster-attacks.json`.

Analysis beyond what the dump decodes was done with a throwaway Python
Allegrex disassembler over the dump's hex (`code`, `data`, records' `hex`).
Anything learned that way went back into `src/monsters/` so the next run
decodes it.

## Addresses (EU disc)

| What                         | Where                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EBOOT vaddr of offset 0      | `0x08801a4c` (as JP); vtables live here                                                                                                                                                      |
| `game_task.ovl` load base    | `0x09a5f200` (JP `0x09a5a580`); its monster chunk array is 0x110 bytes later than JP's                                                                                                       |
| `overlay/emNN.ovl` load base | `0x09d1a180`, the same for every per-monster overlay (so their addresses overlap)                                                                                                            |
| Record copier entry          | `game_task.ovl` `0x1082c0` (`0x09b674c0`): `(shell, owner, index a2, struct a3)`; keeps the struct at `+0xC8`, tail-jumps to `0x108138`, which copies `table + index * 24` to `shell + 0x1C` |
| Second setter                | `0x1082d0` (`0x09b674d0`): sets another index later                                                                                                                                          |
| Generic spawner              | `0x104c40`: 0x250-byte shell, vtable `0x089bd428`, table `game_task.ovl` `0x1a0c60`                                                                                                          |
| Its init / setup             | `0x1189e8` stores kind (a2) at `+0x0D`, variant (a3) at `+0x8B`, owner slot at `+0x15`; `0x118a58` picks `variant + s16[0x09c00f68 + kind * 2]`                                              |
| Diablos's wrapper            | `0x1057d8` (`ShellManager`): kind in a2; each per-monster overlay has one like it                                                                                                            |

Shell layout: `+0x0D` kind, `+0x8B` variant, `+0x15` owner slot, `+0x26`
struct selector, `+0x34` struct, `+0xC8` struct after table, `+0x1C` the
copied record.

## The record

24 bytes (see `src/monsters/attacks.ts`): `+0x02` damage, `+0x08` guard
knockback, `+0x09` element bits, `+0x0C`/`+0x0D` status bits, `+0x0E` status
value, `+0x14` stun. These are confirmed against the wiki crib
(`src/overlay/attack-crib.json`, 249 of its 259 attacks with damage and
guard knockback have a record with the same numbers) and are the only
fields written to `data/monster-attacks.json`.

Unconfirmed: `+0x03` (2 or 1 mostly, maybe the hunter's reaction; Gravios's
and others' show 5 and 6), `+0x07` (`0xE0`), `+0x0A` (an index?), `+0x10`
(0, 1 or 5), element bit `0x08` (Teostra's blast), and bit `0x01` (set in
all but 3 records). The copier halves bytes `0x00`, `0x01`, `0x15`, `0x16`
(so they are probably two-byte values at odd offsets, or packed).

## Index rules

How a class's setup computes the record index from the shell
(`indexRules`, `valueOf`), all seen on the EU disc:

- `kind` (every per-monster overlay class)
- `kind + 1`
- `s8[array + kind]`
- `s16[array + kind * 2]`
- `variant + s16[start + kind * 2]` (`0x104c40`'s class)
- a constant

## State after the twelfth run

`raw/attacks.json` `usage`: 50 shell classes, 55 calling files, 84 spawn
calls unresolved. `data/monster-attacks.json`: 783 records in 31 monster
families (17 per-monster overlays, 14 `game_task.ovl` units), many with
the same numbers (separate hitboxes or attacks).

Families map to site monsters through `src/overlay/attack-families.json`
(hand-made; its comment says how). Families left out: `game_sub.ovl`, the
player and weapon units (`pl_*`, `player_cat`, `we*`), the shell units
(`shell*`, shells spawning shells) and `em29` (rocks).

## Open questions

- **Which monster of a family** uses which record. A family's code is
  shared (Diablos, Black Diablos, Monoblos, White Monoblos in `em14.ovl`;
  Tigrex, Nargacuga, Akantor, Ukanlos in `em75.ovl`; Blangonga, Congalala,
  Rajang in `game_task.ovl:em51`). The split would come from the monster
  code's branches on the monster's ID (the owner's emID) around each spawn
  call, or from each monster's action tables pointing at different code.
- **The 84 unresolved spawn calls**: the kind is computed (from a table, a
  loop, or the monster's state), not a constant. Kushala Daora's, Teostra's
  and Lunastra's physical attacks (`em54.ovl`, only 9 records resolved) are
  among them. `valueOf` would need to follow loads from constant arrays and
  loop counters.
- **Classes without entries**: `0x1066b8`'s class (its init chain goes
  deeper, through `0x09b92780`), `em75.ovl`'s vtables `0x089bf38c` and
  `0x089bf480`, and `em82.ovl`'s `0x089bf508` reach tables but no spawn
  entry was found for them.
- **Attack names.** Records are labelled from the wiki crib in
  `raw/attacks.json` only (by matching numbers, so ambiguous where numbers
  repeat). The crib is CC BY-SA 4.0, so names aren't in `data/`; adding
  them there is the user's call and needs attribution on the site.
- **The remaining bytes** listed above, and what the struct after each
  table holds beyond the table pointer (the class's other per-kind data:
  hitbox size, lifetime?).
- **Probe output to drop**: once the spawns are known, `callees`, `code`,
  `data`, `spawners`' code and the tables' `before`/`after` bytes can go.

## Run history

The README section narrates runs one to eleven. Twelfth run: families from
`game_task.ovl` keyed by the decompilation's code units (55 calling files),
which gave the small monsters and the `game_task.ovl` large monsters
(Blangonga, Hermitaurs, raptor leaders, Cephadrome, Bulldrome, Vespoid
Queen, Shakalakas, Great Thunderbug, Remobra) their own families.
