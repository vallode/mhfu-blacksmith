# Dizzy (faint)

How a monster hit builds the hunter's dizzy status, and which attacks feed
it. Found on the EU disc (ULES01213). The attack values are the `stun` field
in `apps/blacksmith/public/models/monsters/emNN.attacks.json`
(`monsters/attacks.ts`); the mechanics were read from `game_task.ovl` and
`game_sub.ovl`.

The English skill tree for the status is `data/strings/en.json`'s `Faint`
(4), with Faint Negated at +15, Faint Prob Halved at +10 and Faint
Duration(x2) at -10.

## The gauge

An attack row's stun byte is row `0x14` (the object's `+0x30`). The hit code
adds it to the hunter's pending stun, `+0x394` (s16), in `game_sub`
`0x09C43320`.

`game_task` then folds that into the stun gauge, `+0x440` (s16), and writes
150 into the hold timer, `+0x442`, at `0x09A6B748`. The hold timer is
decremented first (`0x09A69AEC`); only when it reaches 0 does the gauge
drain, one point per update.

The dizzy check is `+0x440 >= 50` at `0x09A6C4EC`. Reaching 50 plays the
hunter's dizzy action (19 or 27). The 150 is the hold before the gauge
starts draining, not the dizzy threshold; the old `monster-ai.md` wording
"checks against 150" described that timer.

The hold and the drain share the same update. A 2/sec drain would make the
150-tick hold 75 seconds, so the "2 per second" in the GameFAQs monster
attack guide does not fit; the code and the 5-second hold point to the
per-frame update (30 points/sec at 30 Hz). No clean in-game measurement of
the drain has been made yet.

The Faint skill works on this gauge:

- +10 (Faint Prob Halved): at 50 or above, a 50% roll can clear it
  (`0x09A6B778`).
- +15 (Faint Negated): the pending stun is cleared before it is folded in
  (`0x09A6B700`).
- -10 (Faint Duration (x2)): doubles the dizzy duration, per the skill
  data; this note did not trace the duration timer itself.

On a clean gauge, with no Faint skill:

| Stun per hit | Hits to reach 50 |
| -----------: | ---------------: |
|           50 |                1 |
|        40/30 |                2 |
|           20 |                3 |
|           10 |                5 |
|            5 |               10 |
|            2 |               25 |

## Frames and ticks

The game updates at 30 Hz. The motion banks are a 60 fps timeline, so two
motion frames pass per update. The site's `from`/`to` are motion frames;
halve them for game updates (Rathian's motion 53's 90-104 is active on
updates 45-51, `to` not included). The row's delay and duration are 60 fps
frames on the disc and the loader halves them into 30 Hz ticks;
`export-site` doubles them back.

The 150 hold is 150 game ticks, i.e. 5 seconds at 30 Hz.

## How common it is

The EU attack files hold 1,255 hit windows with stun above 0, across all 76
monsters that have an attack file. The values:

| Stun | Windows |
| ---: | ------: |
|    2 |     341 |
|    5 |      70 |
|   10 |     527 |
|   15 |       2 |
|   20 |     156 |
|   25 |       5 |
|   30 |     120 |
|   40 |      20 |
|   50 |      14 |

Most of those are chip stun. A normal attack's 10 is a fifth of the gauge;
2 and 5 are walking contact and light bites.

## Attacks that dizzy quickly

The frames are 60 fps motion frames. "Feet", "tail" and "body" are where the
attack capsules sit in the bind pose (feet are joints 22/28 on the Rath and
Hypnocatrice skeletons; tail is 41/44; body is the root, joint 2, on the
Plesioth/Cephadrome skeletons).

### Stun 50: one hit

| Monster                                   | Motion | Frames             | Power | Capsule |
| ----------------------------------------- | -----: | ------------------ | ----: | ------- |
| Rathian, Pink Rathian, Gold Rathian       |     53 | 90-104 and 108-122 |    55 | feet    |
| Rathalos, Azure Rathalos, Silver Rathalos |     53 | 90-104 and 108-122 |    55 | feet    |
| Hypnocatrice                              |     45 | 22-130             |    65 | feet    |

### Stun 40: two hits

| Monster                          | Motion | Frames  | Power | Capsule |
| -------------------------------- | -----: | ------- | ----: | ------- |
| Rathian/Rathalos family          |     92 | 108-140 |    75 | tail    |
| Yian Garuga, Scarred Yian Garuga |     41 | 108-140 |    75 | tail    |
| Hypnocatrice                     |    111 | 26-46   |    40 | feet    |
| Cephadrome                       |    119 | 0-198   |    40 | body    |
| Cephadrome                       |    136 | 60-70   |    50 | body    |
| Cephalos                         |    119 | 0-198   |    10 | body    |
| Cephalos                         |    136 | 60-70   |    30 | body    |
| Plesioth, Green Plesioth         |    119 | 50-248  |    60 | body    |
| Plesioth, Green Plesioth         |    136 | 54-64   |    50 | body    |
| Lavasioth                        |    119 | 50-248  |    80 | body    |
| Lavasioth                        |    136 | 54-64   |    70 | body    |

### Stun 30: also two hits

- Yian Kut-Ku, Blue Yian Kut-Ku, Gypceros, Purple Gypceros: motions 41, 45,
  102, 106.
- Diablos, Black Diablos, Monoblos, White Monoblos: motion 109.
- Daimyo/Plum Daimyo Hermitaur, Shogun/Terra Shogun Ceanataur: motion 85.
- Fatalis, Crimson Fatalis, White Fatalis: motion 35.
- Tigrex, Nargacuga: motions 41, 42.
- Chameleos: motions 41, 49, 50, 51.
- Akantor, Ukanlos: motions 43, 46, 90, 93, 94, 99.

### Stun 20: three hits

Most other large monsters have at least one. Common ones:

- Rath family: motions 17, 40, 42, 43.
- Kut-Ku/Gypceros family: motions 17, 40, 42, 43, 104.
- Diablos/Monoblos family: motions 17, 42, 110, 116.
- Teostra, Lunastra: motions 33, 42.
- Khezu, Red Khezu: motion 43.
- Gravios, Basarios, Black Gravios: motions 17, 42, 43.
- Tigrex, Nargacuga: motions 43, 45, 47, 102-104.

## Roars

Roars are in the same motion records. They appear in the attack files as
`power: 0` effect objects with very large capsules, usually a sphere on
the head or body:

- Rathian/Rathalos family motion 54: radius 2000 on the body/root, stun 0.
- Fatalis motion 32: radius 1000 on the body/root, reaction 27, stun 0.
- Tigrex/Nargacuga motion 47: radius 400 on the body/root, reaction 5,
  stun 0.
- Lao-Shan Lung motion 7: radius 3000, reaction 29, stun 0.

Most roars do not add stun; they trigger the hunter's roar/ear-cover
reaction instead. The exceptions:

| Monster                                          | Motion | Frames  | Reaction | Stun |
| ------------------------------------------------ | -----: | ------- | -------: | ---: |
| Diablos, Black Diablos, Monoblos, White Monoblos |    111 | 112-268 |       28 |   10 |
| Rajang, Furious Rajang                           |     52 | 46-60   |        2 |   10 |

The Blos row is the roar (radius 2000 on the head), and community reports
that Blos roar-spam builds faint; the data agrees. The Rajang row is a
zero-damage 10-stun object.

The attack files hold 59 `power: 0` rows in total. Six of them carry stun
10 (the two groups above); the rest have stun 0. So:

- `stun > 0` is everything these files find that can dizzy: 1,255 windows,
  including the six zero-power rows.
- `stun > 0 && power > 0` is damaging attacks only: 1,249 windows.

randomfu's attack classification still treats `power: 0` rows as **no
attack** because they do no damage. The site's attack viewer draws them
anyway, since the export keeps every row with capsules.

## Gaps

- The attack sweep only records objects made by the swept spawner/factories
  (`monsters/attacks.ts`, "Monster attacks" in the README). A roar or other
  effect made directly by action code, like Bulldrome's attacks, is missing.
- Most small monsters top out at stun 2-5, but Cephalos (40), Hermitaur and
  Ceanataur (30), Blango (25) and Conga (10) are exceptions. Kirin and
  Lao-Shan Lung only have stun 2 contact rows, so they have no real dizzy
  attack.
- The dizzy duration was not traced. The gauge drain's update rate was not
  measured in game either; this note records the static code (50 threshold,
  150-tick hold, one point per update after it, i.e. 30 points/sec if the
  update is the 30 Hz frame).
