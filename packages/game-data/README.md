# game-data

The one way into the game data in `data/`. The site (`apps/blacksmith`: its
pages, scripts and tests) and `packages/mhfu-extract` read every data file
with `readData(dataDir, "weapons/bow.json")` instead of parsing it
themselves, so the files' on-disk shape can change behind one function.

```ts
import { readData } from "game-data";

const { weapons } = readData<{ weapons: Weapon[] }>(DATA_DIR, "weapons", "bow.json");
```

Each caller passes its own `data/` directory (the site's `DATA_DIR`,
mhfu-extract's `--data`).

The site imports this package's TypeScript source directly, so
`apps/blacksmith/next.config.mjs` lists it in `transpilePackages`.
