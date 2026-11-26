# Discord Rich Presence

`apps/rich-presence` shows a player's MHFU game as their Discord status. A
web page can't set Discord presence, so it's a local app: it reads the game
from PPSSPP's remote debugger, as the site's PPSSPP link does
(`apps/blacksmith/src/lib/ppsspp-link.ts`), and talks to the Discord
desktop app over its local IPC socket.

## Where the game keeps it

Everything is at a fixed distance from the loaded hunter's character block
(EU 0x0999A100, JP 0x09995E40, the site's `HUNTER_ADDRESSES`), the same on
both releases, so one read from block − 0x4A4 to block + 0x6BD10 covers it.

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

Checked live on EU (village, home, kitchen, farm, Gathering Hall, Training
School, a Snowy Mountains quest through areas 1-3) and on FUC (village, a
Snowy Mountains quest's Base Camp and area 1), and against the savestates
of both.

## IPC, not the Social SDK

Discord offers two ways for a game to set presence:

- **The local RPC over IPC**: a Unix socket (`discord-ipc-0` in the temp
  directory) or named pipe (`\\?\pipe\discord-ipc-0`) the desktop client
  listens on. A handshake with the application ID, then `SET_ACTIVITY`
  frames of JSON. About 150 lines of Node with no dependencies
  (`src/discord.ts`), no Discord login of its own, and the activity accepts
  image URLs, so no art has to be uploaded.
- **The Discord Social SDK**: a native C++ library for account linking,
  lobbies, invites and voice. Node would need native bindings built per
  platform, and the app an OAuth flow, for what the IPC route does with one
  message.

For presence alone IPC is the simpler route, so the prototype uses it. The
IPC protocol also carries the older join flow (`party`, `secrets.join`,
`ACTIVITY_JOIN` events), so Gathering Hall invites could start there; the
Social SDK is the route if invites need its lobbies. Only unmodified discs
could use them: RandomFU discs keep networking off on purpose.

## Pictures

Discord takes image URLs in an activity's assets, so the pictures are files
on the Blacksmith site rather than art uploaded to the Discord application.
The site's embed build writes them to `public/embed/presence/`
(`src/lib/presence-icons.ts`, `writePresenceIcons` in
`scripts/generate-embeds.ts`): each weapon class's mini icon in each rarity
tint (multiplied, as the site tints icons), each monster's portrait (its
category's icon where it has none) and the Herb (item icon 15 in its colour
2). They are 160px squares on transparency, the sprites scaled by whole
numbers, since Discord shows the large picture at about 80px and the small
one at about 30px. The felyne icon (`/images/favicons/felyne-icon-512.png`)
stands for the game in town and in the menus.

## Behaviour

- Reads every 5 s (`--interval`). Each read pauses the CPU for a few
  milliseconds, the way the site's link does: reading while the game runs
  makes PPSSPP pause around every call, which has crashed it.
- Sends `SET_ACTIVITY` only when what Discord would show changes; the quest
  timer's start is recomputed every read but resent only when it moves by
  more than 5 s (a paused emulator). Discord allows 5 updates per 20 s.
- Clears the presence when no game or another game is running, when PPSSPP
  goes away, and on Ctrl+C. Quitting waits for a read in progress, so a
  pause it started is always resumed.
- One debugger client at a time: while two companions were swapped, both
  pausing and resuming, PPSSPP's debugger stopped answering (even
  `version`) until PPSSPP restarted, the game running on.
- The quest timer is the game's own (time limit − time left), so it stops
  when the emulator does. In town the timer counts from when the companion
  first saw the game.
