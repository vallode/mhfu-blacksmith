# Discord Rich Presence

`apps/rich-presence` builds a PPSSPP Lua plugin that shows a player's MHFU
game as their Discord status. PPSSPP already talks to the Discord desktop
app; with Lua plugins (proposed upstream on hrydgard/ppsspp#20851, documented
in PPSSPP's `docs/lua-plugins.md` on that branch) a game's script reads its
memory on a vblank timer, read-only, and PPSSPP sends what the script asks
for as the game's presence.

## Where the game keeps it

Everything is at a fixed distance from the loaded hunter's character block
(EU 0x0999A100, JP 0x09995E40, the site's `HUNTER_ADDRESSES`), the same on
both releases.

| What                       | Where                   | EU         | JP / FUC   |
| -------------------------- | ----------------------- | ---------- | ---------- |
| Current stage (u16)        | block − 0x4A4           | 0x09999C5C | 0x0999599C |
| Hunter's name              | block + 0x00            | 0x0999A100 | 0x09995E40 |
| Equipped weapon            | block + 0x20 (box slot) | 0x0999A120 | 0x09995E60 |
| Quest object               | block + 0x6BCC0         | 0x09A05DC0 | 0x09A01B00 |
| Map stage lists (game_sub) |                         | 0x09CE4708 | 0x09CDF678 |

- **The stage** is numbered across the whole game, as quest files' spawn
  records and game_sub's map tables number them. Found by comparing five EU
  savestates (two in the village, three on quests) for a u16 equal to the
  hunter object's stage (`hunter + 0x29A`) in all of them, then the same
  distance on four JP savestates. In town, walked to on EU: 139 Pokke
  Village, 66 home, 13 the Felyne Kitchen, 46 Pokke Farm, 85 the Gathering
  Hall; it reads 0 in the Training School. Map 0's stage list also has 17,
  not yet seen.
- **The equipped weapon** is a copy of its equipment box slot (`01 05` +
  u16 melee ID, or `01 06` + ranged ID), as the save worker's
  `parseEquipSlot` reads box slots.
- **The quest object** is what `*0x08A62C7C` (EU) points at. It's zeroed in
  town. On a quest: +0x00 state (0 under way, 1 completed or timed out, 2
  rewards), +0x10 frames left (30 a second), +0x4C the loaded quest file
  (EU 0x08A5C440, JP 0x08A57510), set from departure to the reward screen.
- **The quest file's header** is the one mhfu-extract's `readQuestHeader`
  reads: ID at +0x64, stars +0x66, map +0x68, time limit +0x5C, target emID
  +0x70 and count +0x72 (an item ID on deliveries, whose quest type's low
  byte is 2). Reading these from RAM rather than `data/` keeps a randomized
  quest's map and target right; only the title comes from `data/`.
- **The area.** game_sub's table gives each map's stage list
  (`{ u32 count, u32 pointer }` by map, mhfu-extract's
  `src/tables/map-layout.ts`). A stage's place in it isn't the number the
  game's map prints: in game on EU, Snowy Mountains' stages 99, 95 and 94
  (list places 7, 4, 3) were areas 1, 2 and 3. No RAM value or table holds
  the printed number (searched for both, stage-indexed and list-indexed), as
  it's drawn into the map art. The site's `area-numbers.json` (read off the
  textures) maps list places to printed numbers and agrees with all three,
  so the presence uses it.

The addresses were checked live on EU (village, home, kitchen, farm, Gathering Hall, Training
School, a Snowy Mountains quest through areas 1-3) and on FUC (village, a
Snowy Mountains quest's Base Camp and area 1), and against the savestates
of both.

## The plugin

`src/plugin.ts` writes `mhfu-presence/` (`plugin.ini` and `presence.lua`).
Everything from `data/` (quest, monster, weapon and map names, star labels,
area numbers, picture URLs) is worked out in TypeScript and written into the
script as tables; the Lua only reads the game's memory, at the addresses
above, and picks from them.

- The hunter's name is read as UTF-16 units with `r16` (`rstr` stops at the
  first zero byte). The block counts as loaded on the name and sex byte
  checks of the site's `looksLikeHunter`, without its box scans; before that
  the presence says "In the menus".
- It runs every 60 vblanks. PPSSPP compares the presence once a second and
  sends it at most every 4 seconds; the quest's `elapsed` is recomputed each
  time, and moves of 2 seconds or less aren't resent.
- The quest timer is the game's own (time limit − time left), so it stops
  when the emulator does. In town the timer counts from when the game
  started.
- Discord shows "Playing PPSSPP" above the presence, since PPSSPP's own
  Discord application sends it.
- Checked in PPSSPPHeadless against five EU and four FUC savestates (the
  village, the farm and quests in three maps).

## Pictures

Discord fetches a presence's pictures itself, by asset key or by URL, and
PPSSPP's Discord application has no art for games, so the pictures are
files on the Blacksmith site.
The site's embed build writes them to `public/embed/presence/`
(`src/lib/presence-icons.ts`, `writePresenceIcons` in
`scripts/generate-embeds.ts`): each weapon class's mini icon in each rarity
tint (multiplied, as the site tints icons), each monster's portrait (its
category's icon where it has none) and the Herb (item icon 15 in its colour
2). They are 160px squares on transparency, the sprites scaled by whole
numbers, since Discord shows the large picture at about 80px and the small
one at about 30px. The felyne icon (`/images/favicons/felyne-icon-512.png`)
stands for the game in town and in the menus.
