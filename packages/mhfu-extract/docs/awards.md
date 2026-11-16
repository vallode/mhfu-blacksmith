# Guild Card awards

What the game checks before it hands each of the 48 Guild Card awards over,
where their text is, and which save data each condition reads. Found on the
EU disc (ULES01213); the site's rules are `apps/blacksmith/src/lib/awards.ts`.

Everything here is static: read from the EBOOT and overlays, and checked
against the save fixture (`apps/blacksmith/test/fixtures/MHP2NDG.BIN`). None of
it was stepped through in PPSSPP; the doubtful points are marked.

## Addresses

- EBOOT: one PT_LOAD at file offset `0x25B4`, loaded at `0x08804000`.
  Overlays load at the address in their `MWo3` header (+8): `game_task`
  and `lobby_task` at `0x09A5F200`, `game_sub` at `0x09C19000`.
- The save in memory: the pointer at `0x089CC438` (`0x09999C60` in the
  savestates). Its persistent part starts at +`0x4A0`, which is offset 0 of a
  hunter's block in the save file (the block `save-worker.js` reads at
  `0x1000 + slot * 0x6B100`). So a save-struct offset minus `0x4A0` is a
  hunter-block offset. Offsets below are hunter-block offsets unless they
  say otherwise.

## Text

- Names: DATA.BIN 19 (English), table 0, entries 1285-1332, in award order.
- Descriptions: DATA.BIN 4781 (English; 4781-4785 are EN/FR/DE/IT/ES),
  table 0, entries 1726-1773, in award order. Both are ordinary message files
  (`src/strings/messages.ts` reads them). The game breaks the descriptions
  into lines; below, the breaks are spaces.

| #   | Name                          | Description                                                                      |
| --- | ----------------------------- | -------------------------------------------------------------------------------- |
| 0   | Village Chief's Glove         | Proof of completing Pokke Beginner Quests. Earned a present from the Chief.      |
| 1   | Village Chief's Hat           | Proof of completing Pokke Intermediate Quests. Shows courage in the brutal cold. |
| 2   | Village Chief's Scarf         | Proof of completing Pokke Hard Quests. When worn, it is quite warm.              |
| 3   | Village Chief's Coat          | Proof of completing all Pokke Quests. Proves one is a first-class hunter.        |
| 4   | Mane Necklace                 | Proof of slaying a Kirin. Retains the beauty of its thousand-year mane.          |
| 5   | Blood Onyx                    | Proof of slaying an Akantor. Its brilliance captivates the soul.                 |
| 6   | King's Crown                  | Symbol of continued hunting success against giant monsters.                      |
| 7   | Miniature Crown               | Symbol of continued hunting success against small beasts.                        |
| 8   | Bronze Medal                  | Proof of mastering all Gathering Hall ★ and ★★ Quests. No longer a novice.       |
| 9   | Silver Medal                  | Proof of mastering all Gathering Hall 3★ to 5★ Quests. Shows true courage.       |
| 10  | Gold Medal                    | Proof of mastering all Gathering Hall 6★ to 8★ Quests. A true achievement.       |
| 11  | Black Belt Badge              | training bits                                                                    |
| 12  | Expert Badge                  | training bits                                                                    |
| 13  | Legend Badge                  | Proof of passing all Group Training at the Training School. Sign of true power.  |
| 14  | Rare Species Report           | Record of the incredibly powerful colored monsters. Confirms all rare breeds.    |
| 15  | Ecology Research Report       | Report created from records of captured monsters. Proves successful captures.    |
| 16  | Azure Stone                   | Pure piece of Machalite Ore. Beautiful, it is proof of Mining Area development.  |
| 17  | Great Hornfly                 | Rare insect found in this area. Proves development of insect gathering area.     |
| 18  | Springnight Carp              | Splendid pink-scaled fish found during spring. Proves Fishing Pier development.  |
| 19  | Dosbiscus                     | A rare red flower found in an area with deep snow. Proof of Field development.   |
| 20  | Grateful Letter               | chefs                                                                            |
| 21  | Sage's Bracelet               | recipe count                                                                     |
| 22  | Wyverian Artisan's Hammer     | weapon lists (`award-weapons.ts`)                                                |
| 23  | Hunter's Progress             | untracked (doubtful)                                                             |
| 24  | Nekoht's Whiskers             | Proof of completing Nekoht 7★ Quests. Try it on, and become a majestic cat!      |
| 25  | Nekoht's Bell                 | Proof of completing Nekoht 8★ Quests. A mysterious-sounding, handcrafted bell.   |
| 26  | Nekoht's Coat                 | Proof of completing Nekoht 9★ Quests. A classy coat. Guild's crest in lining.    |
| 27  | Pokke Village Gourd           | Proof of completing all Pokke Urgent Quests. Warm up with a single sip.          |
| 28  | Orichalcum Shield             | Proof of mastering all Gathering Hall G-Level 1★ Quests. Exemplary hunter.       |
| 29  | Platinum Shield               | Proof of mastering all Gathering Hall G-Level 2★ Quests. Talk of the town.       |
| 30  | Gold Shield                   | Proof of mastering all Gathering Hall G-Level 3★ Quests. Renowned worldwide.     |
| 31  | Supreme Hunter's Crest        | Cleared all of the Pokke and Gathering Hall Quests. No one can even come close!  |
| 32  | Igneous Ring                  | Proof of slaying a Fatalis. Beneath its breathtaking sparkle lurks calamity...   |
| 33  | Ring of Fire                  | Proof of slaying a Red Fatalis. Its mighty flames brings destruction to all.     |
| 34  | Powder-White Crown            | Proof of slaying a White Fatalis. Its long, flowing white mane reveals its age.  |
| 35  | Gold Snowshoes                | Proof of successful Rajang hunt. Top-class snowshoes made of its golden hairs.   |
| 36  | Ukanlos Bead                  | Proof of slaying a Ukanlos. It is said to allow its bearer into Heaven.          |
| 37  | Epic Hunts Armband            | Proof of tough struggles overcome and battles won during arduous Epic Hunts.     |
| 38  | Warrior's Medal               | training bits                                                                    |
| 39  | Guardian's Award              | map counters                                                                     |
| 40  | Flower Bouquet from the Guild | Guild Points                                                                     |
| 41  | Adventurer's Helm             | treasures and scores                                                             |
| 42  | Trenya's Flag                 | Trenya byte                                                                      |
| 43  | The Ultimate Catnip           | Comrades                                                                         |
| 44  | Letter to My Fearless Leader  | Comrades                                                                         |
| 45  | Member's Card                 | special weapon count                                                             |
| 46  | Wyverian Artisan's Mitten     | rarity 9+ on the site                                                            |
| 47  | Hunter's Miracle              | map counters and award 23                                                        |

### In `data/`

`extract` reads both runs (`src/strings/awards.ts`) and writes
`awards.json`; `build-data --only awards` turns it into `data/awards.json`
(one record per award, only its `id`) and the strings `award` and
`award_description`, by index. `locales` writes the French, German,
Italian and Spanish text into each `data/locales/<code>.json`'s `award`
section, where it differs from English. The site's Awards page shows these,
and `apps/blacksmith/src/lib/awards.ts` holds only each award's rule.

The game breaks the descriptions into lines; the extractor joins them with
spaces. A hyphen at a break joins its word up again ("mysterious-sounding");
German also breaks between syllables ("Versamm-" and "lungshalle"), so a
German hyphen before a lower-case letter is dropped.

## Storage and granting

- The award bits: a u64 at `0x67400` (Guild Card +`0x148`), bit n = award n.
- `giveAward(save, n)` EBOOT `0x088551F0` ORs the bit in and calls
  `0x08858840(save, 8)`; `hasAward(save, n)` `0x08855278`. `game_sub`
  `0x09C27E38` counts the bits for the Guild Card's 7/24/48 tiers.
- Most awards are checked by one routine, EBOOT `0x0887BB48`: for each,
  `if (!hasAward(n) && condition) giveAward(n)`. The others are given where
  their condition changes: titles (EBOOT `0x088FD170`), the farm and Trenya
  (`lobby_task`), Felynes (`game_sub`), and the end of a quest.

Helpers the conditions use:

- `0x0884FE80(save, quest)`: the quest's cleared flag (bits at `0x3F88`,
  the ones the site reads), indexed through the table at `0x0899C0A8`.
- `0x0884FF4C(save, emID)`: kills plus captures; `0x0884FF38`: captures.
- `0x08850520(save, emID)`: kills plus captures summed over the monster's
  crown group (`CROWN_GROUPS`, `0x0899BF40`); `0x0885028C` the group's
  largest record, `0x08850338` its smallest non-zero one.
- Quest lists, 0-terminated u16s: Village by star level from the pointer
  table `0x089B1EBC`, Gathering Hall from `0x089B1E90`.

| Village list | Quests      | Site stars | Gathering Hall list | Quests    | Site stars |
| ------------ | ----------- | ---------- | ------------------- | --------- | ---------- |
| 0            | 10001-10005 | 1          | 0                   | 1-10      | 1          |
| 1            | 10101-10118 | 2          | 1                   | 101-109   | 2          |
| 2            | 10201-10218 | 3          | 2                   | 1001-1022 | 3          |
| 3            | 10301-10319 | 4          | 3                   | 1101-1126 | 4          |
| 4            | 10401-10418 | 5          | 4                   | 1201-1220 | 5          |
| 5            | 10501-10511 | 6          | 5                   | 2001-2013 | 6          |
| 6            | 11001-11014 | 7          | 6                   | 2101-2127 | 7          |
| 7            | 11101-11119 | 8          | 7                   | 2201-2236 | 8          |
| 8            | 11201-11226 | 9          | 8                   | 3001-3025 | 9 (G1)     |
|              |             |            | 9                   | 3101-3127 | 10 (G2)    |
|              |             |            | 10                  | 3201-3233 | 11 (G3)    |

The lists are exactly the site's quests at those star levels; the hidden
quests 30001-30090 are in none of them.

## Conditions

"Site" says how `awards.ts` follows it: a rule, or untracked with the
save data the condition needs.

| #     | Condition                                                                                                                                                                                                                                                                           | Where                                       | Site                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| 0     | Village lists 0-1 cleared                                                                                                                                                                                                                                                           | `0x08854CCC`                                | Village 1-2★                                 |
| 1     | Village lists 2-3                                                                                                                                                                                                                                                                   | `0x08854D18`                                | Village 3-4★                                 |
| 2     | Village list 4 only                                                                                                                                                                                                                                                                 | `0x08854D64`                                | Village 5★ (was 5-6★)                        |
| 3     | Village lists 0-5                                                                                                                                                                                                                                                                   | `0x08854D88`                                | Village 1-6★                                 |
| 4     | Kirin (emID 33) slain or captured                                                                                                                                                                                                                                                   | sweep                                       | hunt Kirin                                   |
| 5     | Akantor (76)                                                                                                                                                                                                                                                                        | sweep                                       | hunt Akantor                                 |
| 6     | Each of the 31 crown groups with crown sizes: group hunted, and its largest ≥ the gold size                                                                                                                                                                                         | `0x0887CA4C`                                | pooled groups (see below)                    |
| 7     | The same, its smallest non-zero ≤ the mini size                                                                                                                                                                                                                                     | `0x0887CAFC`                                | pooled groups                                |
| 8     | Gathering Hall lists 0-1                                                                                                                                                                                                                                                            | `0x08854EB0`                                | Guild 1-2★                                   |
| 9     | Lists 2-4                                                                                                                                                                                                                                                                           | `0x08854EFC`                                | Guild 3-5★                                   |
| 10    | Lists 5-7                                                                                                                                                                                                                                                                           | `0x08854F64`                                | Guild 6-8★                                   |
| 11    | Training 21001-21010, each with all five weapon sets: bits at `0x69234`, bit `(quest - 21001) * 5 + set` (read `0x08857058`, set `0x08857148`)                                                                                                                                      | `0x08856E8C`                                | training bits                                |
| 12    | The same bits for 21011-21015                                                                                                                                                                                                                                                       | `0x08856F04`                                | training bits                                |
| 13    | Training 22001-22006 cleared                                                                                                                                                                                                                                                        | `0x08856FF4`                                | those quests                                 |
| 14    | Each of 16 subspecies hunted (list `0x089A8968`)                                                                                                                                                                                                                                    | `0x0887CBAC`                                | hunt each                                    |
| 15    | Each of 43 monsters captured (list `0x089A898C`)                                                                                                                                                                                                                                    | `0x0887CC28`                                | capture each                                 |
| 16-19 | Farm levels, bytes at `0x69D98`: Mining (byte 2) 4 → Azure Stone, Insects (3) 4 → Great Hornfly, Pier (1) 2 → Springnight Carp, Field (0) 2 → Dosbiscus. Given on buying the upgrade                                                                                                | `lobby_task` `0x09A65578`                   | farm levels                                  |
| 20    | Five Felyne chefs (present byte `0x6925C + i * 0x70`, i < 5) each with byte `0x6925F + i * 0x70` ≥ 9                                                                                                                                                                                | `game_sub` `0x09C1E210`                     | chefs                                        |
| 21    | All 172 combination recipes known: the bitfield at `0x3FCC`, one bit per recipe (records at `0x089A47D0`, byte +6)                                                                                                                                                                  | title routine, `0x0885B048(…, 2) == 172`    | recipe count                                 |
| 22    | For each of 11 weapon classes, 4 weapons of that class's list in the equipment box (`0xA8`, 12-byte slots); type table `0x089B9140`, lists `0x089B9100`, counts `0x089B9150` (40/43/40/45/38/36/31/31/30/24/26 IDs)                                                                 | title routine, `0x08901664(ctx, class, 4)`  | weapon lists (`award-weapons.ts`)            |
| 23    | Title bits 6-11 of title word +`0x2C` (titles at `0x42FC`): each set by hunting 50 of Chameleos, Teostra, Lunastra, Shen Gaoren, Lao-Shan Lung, Akantor (group counts). **Doubtful:** the description speaks of travel                                                              | title routine `0x088FD170`                  | untracked (doubtful)                         |
| 24-26 | Village lists 6, 7, 8                                                                                                                                                                                                                                                               | `0x08854E44`, `E68`, `E8C`                  | Village 7★, 8★, 9★                           |
| 27    | The quest just ended was cleared (save-struct +`0x2E` byte 3 or 4, `0x0886A30C`) and was 11225 "Rise to the Summit"                                                                                                                                                                 | quest end                                   | quest 11225 (was every urgent Village quest) |
| 28-30 | Gathering Hall lists 8, 9, 10                                                                                                                                                                                                                                                       | `0x08854FCC`, `FF0`, `0x08855014`           | G1★, G2★, G3★                                |
| 31    | Every Village list and every Gathering Hall list (no Training School or Treasure quests)                                                                                                                                                                                            | `0x08855038`                                | Village and Guild boards                     |
| 32-34 | Quest 3230 / 3231 / 3232 (G Rank Fatalis / Crimson / White) cleared, and the hunter's own kill count in that quest > 0 (quest object `*0x08A62C7C` +`0x720` → player index +`0x1E8` → u16 +`0x29C[idx]`, counted by `0x0886AB7C`). HR Fatalis quests (2223, 2224, 2227) don't count | quest end                                   | that quest cleared (was "hunt a Fatalis")    |
| 35    | Quest 3212 "Child of Destruction" (Furious Rajang) cleared                                                                                                                                                                                                                          | quest end                                   | quest 3212 (was "hunt a Rajang")             |
| 36    | Ukanlos (88)                                                                                                                                                                                                                                                                        | sweep                                       | hunt Ukanlos                                 |
| 37    | Every quest of the list at `0x0899CBC0` cleared: 11014, 11112-11115, 11216-11219, 11226, 2125-2127, 2233-2236, 3024-3025, 3123-3126, 3216-3221                                                                                                                                      | `0x08855160`                                | those 29 quests (was untracked)              |
| 38    | The training bits for 21016-21023                                                                                                                                                                                                                                                   | `0x08856F7C`                                | training bits                                |
| 39    | Quest counters per map, bytes at `0x6A09C` (bumped per quest by `0x08869424` through the stage table `0x0893165C`): Fortress (12) ≥ 20 and Town (13) ≥ 20                                                                                                                           | sweep                                       | map counters                                 |
| 40    | Guild Points, the u32 at `0x6924C`, ≥ 1,000,000 (title bit 205; title thresholds at `0x089B86F8`)                                                                                                                                                                                   | title routine                               | Guild Points                                 |
| 41    | All 35 gold-crown treasures (the u32 at `0x67358` all set and the next one 7) and the 7 Treasure Hunt best scores (u32s at `0x67360`) ≥ 30000, 35000, 35000, 40000, 40000, 45000, 50000 (`0x089A894C`)                                                                              | sweep                                       | treasures and scores                         |
| 42    | Trenya's top trip paid for: the byte at `0x6A909` ≥ 100, checked at a trip's end                                                                                                                                                                                                    | `lobby_task` `0x09A94578`                   | Trenya byte                                  |
| 43    | A Felyne Comrade (13 slots at `0x6974C + i * 0x70`) whose skills u64 at +`0x3C` is `0xF_FFFFFFFF` (all 36) and whose owner name at +`0x4E` is the hunter's Guild Card name                                                                                                          | `game_sub` `0x09C1F918`                     | Comrades                                     |
| 44    | Five Comrades with fondness (s16 +`0x2A`) exactly 7000 (`==`, so an edited 9999 doesn't count)                                                                                                                                                                                      | `game_sub` `0x09C1F918`                     | Comrades                                     |
| 45    | 50 special weapons forged: popcount of the 9 u32s at `0x6A90C` (209 melee IDs listed at `lobby_task` `0x09B07970`, 56 gunner at `0x09B07B18`)                                                                                                                                       | `lobby_task` `0x09AA5670`                   | special weapon count                         |
| 46    | Five pieces of raw rarity 8 or more (0-based: the site's 9 or more) of each armor slot in the equipment box (`0x0885C83C` reads the armor table's byte +1)                                                                                                                          | title routine, `0x08901664(ctx, 11..15, 5)` | rarity 9+ on the site                        |
| 47    | Map counters 7-11 (Great Forest, Old Jungle, Old Volcano, Old Desert, Old Swamp) each ≥ 20, and award 23                                                                                                                                                                            | title routine                               | map counters and award 23                    |

The map counters' indexes: 0 Forest and Hills, 1 Jungle, 2 Desert, 3 Swamp,
4 Volcano, 5 Snowy Mountains, 6 Tower, 7 Great Forest, 8 Old Jungle,
9 Old Volcano, 10 Old Desert, 11 Old Swamp, 12 Fortress, 13 Town.

### The crown groups

The crown routines walk the 62 crown table entries (`monsters/sizes.ts`
`CROWNS`), skipping those without crown sizes, which leaves 31. A group is
the entry's monster and the subspecies that share its records: Rathian
(Pink, Gold), Yian Kut-Ku (Blue), Cephadrome, Rathalos (Silver, Azure),
Diablos (Black), Khezu (Red), Gravios (Black), Gypceros (Purple), Plesioth
(Green), Basarios, Monoblos (White), Velocidrome, Gendrome, Iodrome, Kirin,
Scarred Yian Garuga (Yian Garuga), Daimyo Hermitaur (Plum), Blangonga
(Copper), Congalala (Emerald), Rajang (Furious), Kushala Daora (Rusted),
Chameleos, Lunastra, Teostra, Shogun Ceanataur (Terra), Bulldrome, Tigrex,
Giadrome, Nargacuga, Hypnocatrice, Lavasioth. The sizes are the site's
`crowns`.

## Evidence and doubts

- All static. The savestates available are early game (no awards); they
  only confirmed the save's place in memory and the offsets above.
- The fixture's first hunter has awards 0-3, 5, 8-10, 20, 24-31, 37 and 46.
  The conditions above hold for each except 20 (its chefs' bytes are now 9, 9,
  3, 3, 2); the save looks edited, and the award is kept once given. Its
  second hunter has every quest cleared and no awards, also edited. The
  Fatalis rings and Gold Snowshoes are absent despite their quests'
  cleared flags, which fits their being given at a quest's end.
- To confirm in PPSSPP: award 23's condition against its description, 20,
  and whether a ring needs the hunter's own kill in multiplayer.
- The site reads the other records for 11-22 and 38-47 (`save-worker.js`,
  `AwardRecords` in `save-store.ts`). Each offset was checked in the code
  that reads it except 40's Guild Points, taken from the title routine as
  above. Small differences: 43 counts the 36 skill bits, while the game wants
  the u64 to equal `0xF_FFFFFFFF`; 41 counts treasure bits 0-34, while the
  game wants the first u32 all set and the second exactly 7. Neither differs
  on a save the game wrote. 22's gunlance list holds one ID the site's data
  resolves to a lance.
- The site's rules for 27 and 32-35 use the quest's cleared flag: a hunter
  who cleared the quest has met the condition (for the rings, unless someone
  else made every kill).
