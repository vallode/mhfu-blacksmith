# Monster Hunter Freedom Unite Rich Presence

A PPSSPP plugin that shows what you're doing in Monster Hunter Freedom Unite
as your Discord status:

- **On a quest:** the target ("Hunting Tigrex", or the quest's title when it
  has no target monster), where you are ("Jungle area 5", numbered as the
  game's map numbers it), and the quest's own elapsed time. The picture is
  the target monster, or a Herb on gathering and delivery quests; hovering
  it shows the star level and title ("G★3 · Tigrex Tamer").
- **In town:** where you are (Pokke Village, home, the Felyne Kitchen, Pokke
  Farm, the Gathering Hall, the Training School) and your hunter's name.
- **Always:** your weapon's mini icon in its rarity's colour as the small
  picture, its name and class on hover.

It works with the EU release (ULES01213) and the Japanese release
(ULJM05500), FUComplete included.

## Installing it

It needs a PPSSPP build with Lua plugins (`type = lua` in a plugin's
`plugin.ini`). From the repository root:

```sh
pnpm install
pnpm --filter rich-presence plugin --out <memory stick>/PSP/PLUGINS
```

That writes `mhfu-presence/` (`plugin.ini` and `presence.lua`). The memory
stick is PPSSPP's `memstick` folder: `~/.config/ppsspp` on macOS and Linux,
`Documents\PPSSPP` on Windows. In PPSSPP, turn on "Enable plugins" (Settings
→ System) and "Send Discord Presence information" (Settings → Networking,
off by default), then start the game.

Discord shows "Playing PPSSPP" with the game below it, since the plugin
speaks through PPSSPP's own Discord application. In town the timer counts
from when the game started.

## How it works

`src/plugin.ts` writes every quest, monster, weapon and map name, the star
labels, area numbers and picture URLs into the script as tables. The Lua
reads the hunter's block, the current stage and the quest object, and picks
from them; PPSSPP sends the result to Discord when it changes. The addresses
and how they were found are in
[docs/discord-rich-presence.md](../../docs/discord-rich-presence.md).

| File              | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| `src/layout.ts`   | The addresses                                             |
| `src/names.ts`    | Quest, monster, weapon and map names from `data/`         |
| `src/presence.ts` | The labels and pictures                                   |
| `src/plugin.ts`   | The plugin: `plugin.ini` and `presence.lua` with its data |

The pictures are served by the Blacksmith site (`/embed/presence/` on
mhfu.vallode.com, written by its `scripts/generate-embeds.ts` from
`src/lib/presence-icons.ts`), and Discord fetches them by URL. The hunter
block's address, the star levels and the map's area numbers are the site's
(`apps/blacksmith/src/lib/`).

```sh
pnpm --filter rich-presence test
pnpm --filter rich-presence typecheck
```
