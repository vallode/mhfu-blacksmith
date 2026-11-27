# Hunter attacks: research note

Do two weapons of the same class swing the same hitboxes? Yes. A hunter's
attack shapes are chosen by class and move, never by the weapon's ID,
model or any per-weapon field. The weapon changes how hard a hit lands
(attack, element, sharpness and skills), not where it can land. The
exceptions are shots: the equipped bowgun or bow decides which shots and
arrows exist and how they fly, but each shot kind has one fixed shape.

Read from code on the EU disc (ULES01213) with a disassembler, then
checked against JP (FUC, ULJM05500 v1.4.0). One move was confirmed in
game, in PPSSPP (last section). Addresses are EU unless marked:
`game_task.ovl` loads at 0x09A5F200 (JP 0x09A5A580) and `game_sub.ovl` at
0x09C19000 (JP 0x09C14280). The monster side of the same machinery is in
the README's "Attack hitboxes" and `src/patches/hitboxes.ts`.

## From a swing to a live attack

Hunter attacks are the same attack objects as monster attacks: the pool
behind 0x09C18FD0 (JP 0x09C14250), live list at `+0x502C`, next at `+4`.
An object is tested against hunters and monsters while its `+0x14` is 2.
Melee swings are class A:

1. The class's motion code in `game_task` (around 0x09BA0000–0x09BB0000)
   calls the class-A factory 0x09B62E48 with a row index. It allocates
   0xE0 bytes from pool `+0x5000` (0x08859B44), constructs with vtable
   0x089BD290 (0x09B68158) and runs init 0x09B681F0.
2. Init copies the owner onto the object: `+0x15` from player `+0x1E6`
   (slot), `+0xF` from `+0x1E9` (0 means a hunter), `+0xC2` from the
   motion's `+0x324`, `+0xD0` from `+0x322`, `+0x8A` from `+0x55C`, and
   the owner's position `+0x200` into `+0x40`. The row index goes to
   `+0xD`, a flags argument to `+0x8B`, and the object joins the list.
3. The setup method 0x09B68318 loads the row (0x09B674C0 → 0x09B67338):
   the 24 bytes at `*(*0x09BFC948) + row × 24` go to `+0x1C..+0x33`, and
   `+0x14` becomes 1. Row byte 2 is power, byte 3 reaction, byte 10
   (`+0x26`) the shape set.
4. At 0x09B683B4 it stores `+0x34 = sets[+0x26]` from the table at
   0x09BFBEA8. If `+0x8B` bit 1 is set, sets 9 and 10 swap (the same swing
   from the other hand). A few rows (0x0B, 0x3E, 0x56 and others) also
   set `+0x40` from a joint position plus a constant.
5. Each frame 0x09C41E58 walks the live list, and 0x09C425E0 tests each
   attack (0x09C42650) against the 20 monster slots (0x09C121B0, stride
   0x1220) and the 4 hunters, placing each shape first:

| Joint   | Placed by  | Where                                                           |
| ------- | ---------- | --------------------------------------------------------------- |
| 0..0x7C | 0x09C37798 | On the owner's joint matrix, radius × owner `+0x220`            |
| 0x7F    | 0x09C37950 | Sphere offset from the object's `+0x40`, radius unscaled        |
| 0x7E    | 0x09C37AC0 | Capsule from `+0x40` to `+0x50`, record's radius, points unused |
| 0x7D    | owner code | Not placed by the shared code                                   |

The owner's matrices are `*(m + 0x190) + joint × 0x250 + 0xD0`, as for
monsters. Owner `+0x220` read 1.0 on every hunter in the states below; it
is the model scale, not a weapon field.

## The tables

Shape records are the monsters' 0x28-byte format, ending at joint −1 (u16
0xFFFF):

| Offset | Type   | What                                                          |
| ------ | ------ | ------------------------------------------------------------- |
| 0x00   | u16    | Joint (hunter: 14 left hand, 18 right hand, 4/5 and 7/8 legs) |
| 0x02   | u16    | 0 sphere, 1 capsule                                           |
| 0x0C   | f32    | Radius                                                        |
| 0x10   | f32[3] | Point 0, in the joint's space                                 |
| 0x1C   | f32[3] | Point 1 (capsules)                                            |

The hunter's classes (JP addresses are EU − 0x4D90; the bytes match):

| Class     | Vtable     | Row descriptor → rows             | Shape sets                                   |
| --------- | ---------- | --------------------------------- | -------------------------------------------- |
| A, melee  | 0x089BD290 | 0x09BFC948 → 0x09BFBEF8, 110 rows | 0x09BFBEA8, 20 sets (0x09BFB7A0..0x09BFBE58) |
| D, bowgun | 0x089BD35C | 0x09BFDEE8 → 0x09BFDD98, 14 rows  | 0x09BFDD88, 3 sets                           |
| E, arrows | 0x089BD3A0 | 0x09BFE6D8 → 0x09BFE390, 35 rows  | 0x09BFE370, 7 sets                           |

Classes B, C and F (vtables 0x089BD2D4, 0x089BD318, 0x089BD3E4) are
monster and effect attacks: their joints are 19–44, or monster code makes
them. F (factory 0x09B63C58) is the shared effect class.

Class A's sets, all lengths in model units along the hand joint's z:

| Set          | Shapes                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| 0            | Left hand, three capsules r52: z 60–100, 100–220, 220–260 (great sword rows 1–3, 91–93, and similar) |
| 1, 2         | Spheres r60 on the legs (4/5, 7/8): kicks                                                            |
| 3            | Left hand, capsule r50, z 90–160                                                                     |
| 4, 13        | Sphere at the object (0x7F), r200 and r120                                                           |
| 5, 14, 15    | Capsule along the object (0x7E), r40, r40 and r140 (0–500)                                           |
| 6, 9, 11     | Capsule r49, z 30–80: left hand, right hand, both                                                    |
| 7, 8, 10, 12 | Right hand                                                                                           |
| 16           | Left hand, capsule r50, z 40–190                                                                     |
| 17           | Left hand, capsule r50, z −30 to −80                                                                 |
| 18, 19       | Spheres r30                                                                                          |

Class D's sets are a sphere r30 at the shot (0x7F) and two capsules r30
along its path (0x7E). Class E's are capsules along the arrow (0x7E) of
r30, 300, 400, 500, 600, 700 and 250.

## What picks a row

- Class A: the row is a constant at each of the factory's 137 call sites,
  in per-class, per-motion code. Three sites read a static picker instead
  (0x09C0BB08, looped at 0x09BAA734; 0x09C0BB68, 12-byte rows, in
  0x09BAF848). Neither picker is indexed by a weapon.
- Class D: the method 0x09B6B428 maps the object's `+0xD` (the shot kind)
  through 0x09BFDEF0 to a row.
- Class E: arrows are spawned at 0x09BA356C, 0x09BA35C4 and 0x09BA35E4
  through factory 0x09B63710 with the shot kind (player `+0x55C`). The
  method 0x09B70CA8 also picks a set by a byte (`lbu 3($s1)`) whose source
  wasn't fully traced; no weapon read was found on its path.

Player `+0x55C` comes from the loaded ammo or coating, an item, not the
weapon: the item table 0x0899D1A0 through pouch `+0x5F6`, or 0x088D8000
through `+0x686`.

Searched for and not found on any path to a shape: every class-A/D/E
spawner and its callees two calls deep, and every method of the three
vtables, read none of the model ID (player `+0x534`, `+0x53A`), the model
row (`+0x7F4`, table 0x089B07A0/0x089B07B4), modelToWeaponType (0x08978488),
the equipment copy (`+0x4E8..`) or the weapon tables (blademaster
0x08959FCC, stride 0x18; gunner 0x08960B9C, stride 0x1C), except on the
damage paths below.

## What the weapon does change

| Code                                | Reads                                                          | Changes                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0x088DA398                          | Weapon row, skills                                             | Attack and skills                                                                                                                          |
| 0x09B67BF8                          | Weapon row                                                     | Element and status                                                                                                                         |
| 0x09B68A20 (0x0885F7D4, 0x0885F82C) | Dual blades' table 0x08979758, and the shape's joint           | Which of the two elements a dual-blade hit carries, by whether its shape is on joint 0x12 (right hand). Reads the shape, doesn't change it |
| 0x088D8000                          | 0x089786F8[BulletCharge `+0x10`][shot kind]                    | Player `+0x67D`, per shot kind and the bowgun's BulletCharge                                                                               |
| 0x09B70070                          | 0x08979448[gunner row byte 3] → 24-byte rows by `+0x4EC & 0xF` | Arrow `+0x120`: looks like a distance curve, for flight or damage                                                                          |

The model row's other readers are cosmetic: the weapon's pose on the back
(0x09A932C0, 0x088D3F68), sounds and effects by fold type (`game_sub`
0x09C4D750, where fold types 2 and 3 pick other IDs), and dangling-part
physics (0x09C56560).

So no weapon differs from another of its class in reach. Between bowguns
and bows, the weapon decides which shot kinds (and so which rows) can come
out, and how arrows travel, but a given shot kind has the same radius on
every weapon. Gunlance shells and wyvern fire, and horn notes, have no
class of their own: the hunter has only classes A, D and E, so they are
class-A rows from their classes' motion code, chosen by constants like any
swing (most likely the object-placed sets 4, 5 and 13–15; which row is
which move wasn't mapped).

## JP

Every function above was found in JP by a masked signature; the main ones:

| What           | EU         | JP         |
| -------------- | ---------- | ---------- |
| Place shape    | 0x09C37798 | 0x09C32788 |
| Attack loop    | 0x09C41E58 | 0x09C3CE48 |
| Shape test     | 0x09C425E0 | 0x09C3D640 |
| Factory A      | 0x09B62E48 | 0x09B5E0F0 |
| Init A         | 0x09B681F0 | 0x09B63498 |
| Setup A        | 0x09B68318 | 0x09B635C0 |
| Row load       | 0x09B67338 | 0x09B625E0 |
| Factory E      | 0x09B63710 | 0x09B5E9B8 |
| Arrow physics  | 0x09B70070 | 0x09B6B318 |
| Loadout        | 0x088DCFCC | 0x088DF914 |
| Ammo           | 0x088D8000 | 0x088DA948 |
| Player manager | 0x09A4F0C4 | 0x09A4AE04 |

The shape sets, rows, shot map and pickers are byte for byte the same,
0x4D90 lower, and the 137 class-A call sites carry the same row constants.

## Confirmed in game

In PPSSPP with the debugger, from copies of existing savestates: a
breakpoint on the `+0x34` store and on the placement call, then a great
sword overhead slash (triangle).

- EU, great sword model 422 (weapon 669): row 3, `+0x34` = 0x09BFB7A0
  (set 0), joint 14, r52, capsules z 100–220, 60–100, 220–260, placed 120,
  40 and 40 long.
- JP, great sword model 12 (weapon 8): row 3, `+0x34` = 0x09BF6A10 (EU −
  0x4D90), the same records, placed the same.

The two swords are on different discs: no EU savestate had a second great
sword. A same-disc pair of swords with clearly different blade lengths is
still to check. The tables in RAM matched the disc in all five EU states
looked at.

## A reach table

Since the shapes are static and per class and move, they could go into
`data/` for the site as a reach table: class A's 110 rows (power,
reaction, shape set) and 20 sets, keyed by class and move. The hard part
is naming the moves: the row-to-move link lives in the 137 call sites'
constants, under each class's motion code, so each site would need its
class and motion read off.
