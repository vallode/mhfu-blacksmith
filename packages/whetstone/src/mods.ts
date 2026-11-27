/**
 * Applies Whetstone's mods to loaded game data: the camera, HUD, quality of
 * life and monster behaviour patches, and the code loader their blob code
 * goes in with. Deterministic: the same game and settings give the same
 * edits. A randomizer built on Whetstone (randomfu) runs its shuffles first,
 * then this, handing it the AI scripts and quests as it left them and its own
 * blob features to link in the same loader.
 */
import type { Edits } from "./edits.js";
import { loadEmOverlays, type GameData } from "./game/load.js";
import { monsterNames } from "./names.js";
import { DEMO_OBJECTS } from "./blob/demo-object.js";
import { decodeObjects } from "./blob/link.js";
import { RUNTIME_OBJECTS } from "./blob/runtime-object.js";
import {
  AGGRESSION_IDLE_FRAMES,
  AGGRESSION_TAIL_SPEED,
  ELITE_IDLE_FRAMES,
  ELITE_TAIL_SPEED,
  aggressionExterns,
  aggressionObjects,
  encodeMotionTails,
  idleCapProblem,
  tailSpeedProblem,
} from "./patches/aggression.js";
import { bootReport, patchBoot } from "./patches/boot.js";
import { addButtonIcons } from "./patches/button-icons.js";
import {
  FOV_SCALES,
  cameraObjects,
  cameraOn,
  cameraReport,
  patchFov,
  prepareCamera,
} from "./patches/camera.js";
import { addCodeLoader } from "./patches/code-loader.js";
import { type Combine, combineObjects, combineReport, prepareCombine } from "./patches/combine.js";
import { damageObjects, findDamageExterns } from "./patches/damage.js";
import { patchElementMotion } from "./patches/element-motion.js";
import { eliteObjects, findEliteExterns } from "./patches/elite.js";
import {
  findHitSite,
  FIRST_CALL_SITE,
  findHookSites,
  findPadSites,
  type HitSite,
  type HookSites,
  type MenuSites,
  type QuestLoadSites,
} from "./patches/game-hooks.js";
import { type Harvest, harvestObjects, harvestReport, prepareHarvest } from "./patches/harvest.js";
import { findHitboxExterns, hitboxObjects } from "./patches/hitboxes.js";
import {
  type ImprovePips,
  improvePipsObjects,
  improvePipsReport,
  prepareImprovePips,
} from "./patches/improve-pips.js";
import { findKeyQuestSites, keyQuestsObjects, keyQuestsReport } from "./patches/key-quests.js";
import { menuObjects, prepareMenu } from "./patches/menu.js";
import { keepMonstersInReach, makeMonstersAggressive, readScripts } from "./patches/monster-ai.js";
import { findMonsterHpExterns, monsterHpObjects } from "./patches/monster-hp.js";
import { monsterListReport, patchMonsterList } from "./patches/monster-list.js";
import { disableOnline, offlineReport } from "./patches/no-online.js";
import { addNodeMap } from "./patches/node-map.js";
import { paintReport, patchPaintStays } from "./patches/paint.js";
import {
  findPhotoExterns,
  findPhotoSites,
  patchDim,
  photoObjects,
  photoReport,
  type PhotoSites,
} from "./patches/photo.js";
import { poogieObjects, preparePoogieLuck } from "./patches/poogie-luck.js";
import {
  patchQuestEnd,
  questEndExterns,
  questEndObjects,
  questEndReport,
} from "./patches/quest-end.js";
import { prepareSendAll, type SendAll, sendAllObjects, sendAllReport } from "./patches/send-all.js";
import {
  prepareTargetCamera,
  type TargetCamera,
  targetCameraObjects,
  targetCameraReport,
} from "./patches/target-camera.js";
import { notApplied, type Report } from "./report.js";
import type { WhetstoneSettings } from "./settings.js";

/** Relocatable blob objects, as `decodeObjects` gives them. */
export type BlobObject = { name: string; data: Buffer };

/** What a feature's blob code brings to the code loader. */
export interface LoaderPart {
  objects: readonly BlobObject[];
  externs: Record<string, number>;
  /** Tables built per disc, linked after the code (`linkBlob`). */
  data?: Record<string, Buffer>;
  /** The quest loader's calls, for a feature that hooks them (hook 3). */
  questLoad?: QuestLoadSites;
  /** Its report, once it's known whether the loader went in. */
  finish?: (applied: boolean) => Report;
}

/**
 * A randomizer's own blob feature, linked in Whetstone's code loader beside
 * the mods (randomfu's Hunter's Pact and Unknown Monster quests).
 */
export interface LoaderFeature {
  /**
   * Its part for the loader, given the game hooks' sites (or why they weren't
   * found), or null when it doesn't go in: it reports why in `reports`.
   */
  prepare(sites: HookSites | string, reports: Report[]): LoaderPart | null;
}

export interface ModsOptions {
  /** For testing in game: a happy Poogie always gives the rarest reward. */
  poogieTest?: boolean;
  /** Prototype: the code loader with its demo blob (see `docs/code-loader.md`). */
  loaderDemo?: boolean;
  /** The AI scripts as a randomizer left them (`readScripts`); read from the disc otherwise. */
  scripts?: ReturnType<typeof readScripts>;
  /** The quests as a randomizer left them, for whose large monsters reach leans; the disc's otherwise. */
  quests?: readonly { largeMonsters: readonly { monsterId: number }[] }[];
  /** A randomizer's blob features, linked with the mods'. */
  features?: readonly LoaderFeature[];
  /** A randomizer's own late patches (randomfu's guides), run before the area map, paint, Monster List and button icons. */
  late?: () => Report[];
}

export interface ModsResult {
  reports: Report[];
  /** Testing options that changed this disc, for the log (not in the settings string). */
  testing: string[];
}

export function applyMods(
  game: GameData,
  edits: Edits,
  settings: WhetstoneSettings,
  options: ModsOptions = {},
): ModsResult {
  const reports: Report[] = [];
  const monsterName = monsterNames(game);

  const aggression = settings["monsterAi.aggression"];
  // Its odds are data; its shorter pauses go in with the blob, below, which notes them here.
  let aggressionReport: Report | null = null;
  const reach = settings["monsterAi.reach"];
  if (aggression !== "off" || reach !== "off") {
    const scripts = options.scripts ?? readScripts(game.gameTask, loadEmOverlays(game));
    // After a randomizer's reroll, so it leans whatever odds the choices have by then.
    if (aggression !== "off") {
      aggressionReport = makeMonstersAggressive(aggression, edits, scripts, monsterName);
      reports.push(aggressionReport);
    }
    // Last, so it leans the odds the others left.
    if (reach !== "off") {
      const quests = options.quests ?? game.quests.map((q) => q.parsed);
      const large = quests.flatMap((q) => q.largeMonsters.map((m) => m.monsterId));
      reports.push(keepMonstersInReach(reach, edits, scripts, game.gameTask, large, monsterName));
    }
  }

  if (settings["weapons.elementMotion"]) {
    reports.push(
      patchElementMotion(game.gameTask, game.gameSub, settings["weapons.elementMotionFrom"], edits),
    );
  }

  // The faster boot: a data patch of the title screens' overlays, no blob.
  const bootSkip = settings["boot.skip"];
  if (bootSkip !== "normal") {
    const { demoTask = null, contTask = null } = game;
    const result =
      demoTask && contTask
        ? patchBoot(bootSkip, demoTask, contTask, game.eboot, edits)
        : "its title overlays couldn't be read";
    reports.push(bootReport(bootSkip, demoTask, contTask, result, game.region));
  }

  const testing: string[] = [];
  // The wait after a quest: an EBOOT patch whose data word is the disc's
  // choice, so it works with no blob; the blob changes the word in game.
  // The EBOOT is patched before the blob is linked, so the blob only goes in
  // to write a word that's there.
  const questEndOn = settings["quest.endWait"] !== "normal";
  let questEndAt: number | string | null = null;
  const patchQuestEndNow = (): number | string =>
    (questEndAt = !game.eboot
      ? "the EBOOT wasn't loaded"
      : patchQuestEnd(edits.eboot(), settings["quest.endWait"]));
  let questEndInGame = false;
  // Whether aggression's shorter pauses went in with the blob, or why not.
  let pausesWhy: string | null = "the loader demo's blob replaces its code";
  // Why its quicker recoveries didn't go in where the shorter pauses did.
  let tailsWhy: string | null = null;
  if (options.loaderDemo) {
    const loader = addCodeLoader(game.eboot, game.gameSub, edits, {
      objects: decodeObjects(DEMO_OBJECTS),
    });
    reports.push(loader);
    if (loader.applied) {
      testing.push(
        `Code loader demo: Guild Cards are capped at ${loader.kept} and every save load adds 1000z. This disc is not for play.`,
      );
    }
    if (settings["poogie.enabled"]) {
      const why = "the loader demo's blob replaces its code";
      reports.push({
        title: "Poogie",
        notes: [`Poogie's luck isn't in this image: ${why}.`],
        lines: [],
        summary: `Poogie: not applied (${why})`,
      });
    }
    if (cameraOn(settings)) {
      const why = "the loader demo's blob replaces its code";
      reports.push({
        title: "Camera",
        notes: [`The camera isn't in this image: ${why}.`],
        lines: [],
        summary: `Camera: not applied (${why})`,
      });
    }
    if (settings["camera.photoMode"]) {
      const why = "the loader demo's blob replaces its code";
      reports.push({
        title: "Photo mode",
        notes: [`Photo mode isn't in this image: ${why}.`],
        lines: [],
        summary: `Photo mode: not applied (${why})`,
      });
    }
    if (questEndOn) patchQuestEndNow();
  } else {
    // Each feature is resolved on its own first: one that doesn't match this
    // disc is left out, and the loader (which caps Guild Cards) only goes in
    // for the ones that do. Monster health, attack hitboxes and damage numbers
    // can be turned on in game (the START menu's Whetstone entry), so they go
    // in even when they're off; only an option that's on reports not fitting.
    const objects = decodeObjects(RUNTIME_OBJECTS);
    // The features that are off but go in so the START menu can turn them on,
    // and the menu itself: left out if the loader doesn't fit with them.
    const optional: typeof objects = [];
    const externs: Record<string, number> = {};
    const { ovl } = game.gameTask;
    // The features run on the game hooks, found once here.
    const sites = game.eboot
      ? findHookSites(game.eboot, ovl.reader.buf, ovl.loadBase)
      : "the EBOOT wasn't loaded";
    const mode = settings["hud.monsterHp"];
    let monsterHp = false;
    {
      const found =
        typeof sites === "string"
          ? sites
          : findMonsterHpExterns(
              game.eboot!,
              sites.segment,
              sites.gauges,
              ovl.reader.buf,
              ovl,
              mode,
            );
      if (typeof found === "string") {
        if (mode !== "off") reports.push(notApplied("Monster health", found));
      } else {
        (mode === "off" ? optional : objects).push(...monsterHpObjects());
        Object.assign(externs, found);
        monsterHp = true;
      }
    }
    let hitboxes = false;
    {
      const found =
        typeof sites === "string"
          ? sites
          : findHitboxExterns(
              game.eboot!,
              sites.segment,
              ovl.reader.buf,
              ovl,
              game.gameSub.ovl.reader.buf,
              settings["hud.attackHitboxes"],
            );
      if (typeof found === "string") {
        if (settings["hud.attackHitboxes"]) reports.push(notApplied("Attack hitboxes", found));
      } else {
        (settings["hud.attackHitboxes"] ? objects : optional).push(...hitboxObjects());
        Object.assign(externs, found);
        hitboxes = true;
      }
    }
    // The camera: its EBOOT patch carries the disc's field of view, with the
    // blob or without; the blob moves the camera back, and changes both in
    // game. The EBOOT is patched once it's known the blob or the option needs it.
    const cameraWanted = cameraOn(settings);
    let camera = false;
    let cameraLinked = false;
    const cameraFound = !game.eboot
      ? "the EBOOT wasn't loaded"
      : cameraWanted || typeof sites !== "string"
        ? prepareCamera(game.eboot, settings, game.region, sites)
        : null;
    if (typeof cameraFound === "string") {
      if (cameraWanted) reports.push(notApplied("Camera", cameraFound));
    } else if (cameraFound && typeof sites !== "string") {
      (cameraWanted ? objects : optional).push(...cameraObjects());
      Object.assign(externs, cameraFound);
      camera = true;
    }
    // Photo mode: blob code on the pad and quest frame hooks, and the pause's dimming patched.
    const photoOn = settings["camera.photoMode"];
    let photo: PhotoSites | null = null;
    {
      const found = typeof sites === "string" ? sites : findPhotoSites(game.eboot!);
      const photoExterns =
        typeof found === "string" || typeof sites === "string"
          ? found
          : findPhotoExterns(game.eboot!, sites, found, photoOn);
      if (typeof photoExterns === "string") {
        if (photoOn) reports.push(notApplied("Photo mode", photoExterns));
      } else {
        (photoOn ? objects : optional).push(...photoObjects());
        Object.assign(externs, photoExterns);
        photo = found as PhotoSites;
      }
    }
    let questEnd = false;
    if (questEndOn || typeof sites !== "string") {
      const word = patchQuestEndNow();
      if (typeof word !== "string" && typeof sites !== "string") {
        optional.push(...questEndObjects());
        Object.assign(externs, questEndExterns(word, settings));
        questEnd = true;
      }
    }
    // A randomizer's own blob features (`LoaderFeature`), linked with these.
    const parts: LoaderPart[] = [];
    for (const feature of options.features ?? []) {
      const part = feature.prepare(sites, reports);
      if (part) {
        objects.push(...part.objects);
        Object.assign(externs, part.externs);
        parts.push(part);
      }
    }
    const questLoad = parts.find((p) => p.questLoad)?.questLoad;
    // Elites share the monster list and species table monster health finds.
    let elites = false;
    // Where moves are past their last hit, for elites' and aggression's quicker recoveries.
    let motionTails = false;
    if (settings["elites.enabled"]) {
      let found: Record<string, number> | string =
        typeof sites === "string"
          ? sites
          : findMonsterHpExterns(
              game.eboot!,
              sites.segment,
              sites.gauges,
              ovl.reader.buf,
              ovl,
              mode === "off" ? "always" : mode,
            );
      if (typeof sites !== "string" && typeof found !== "string") {
        const { rf_game_task, rf_monsters, rf_em_chunks } = found;
        const elite = findEliteExterns(game.eboot!, sites.segment, ovl, settings["elites.chance"]);
        found =
          typeof elite === "string"
            ? elite
            : {
                rf_game_task: rf_game_task!,
                rf_monsters: rf_monsters!,
                rf_em_chunks: rf_em_chunks!,
                ...elite,
              };
      }
      if (typeof found === "string") reports.push(notApplied("Elite monsters", found));
      else {
        objects.push(...eliteObjects());
        Object.assign(externs, found);
        elites = true;
        const idleWhy = idleCapProblem(ovl.reader.buf);
        if (idleWhy) reports.push(notApplied("Elite monsters' shorter pauses", idleWhy));
        const tailWhy = tailSpeedProblem(ovl.reader.buf);
        if (tailWhy) reports.push(notApplied("Elite monsters' quicker recoveries", tailWhy));
        else motionTails = true;
      }
    }
    // Aggression's shorter pauses: the shared monster boosts, on the same monster list.
    let aggressionIdle = false;
    pausesWhy = "the code loader didn't go in";
    if (aggression !== "off") {
      const found =
        typeof sites === "string"
          ? sites
          : (idleCapProblem(ovl.reader.buf) ??
            findMonsterHpExterns(
              game.eboot!,
              sites.segment,
              sites.gauges,
              ovl.reader.buf,
              ovl,
              mode === "off" ? "always" : mode,
            ));
      if (typeof found === "string") pausesWhy = found;
      else {
        const { rf_game_task, rf_monsters, rf_em_chunks } = found;
        objects.push(...aggressionObjects());
        Object.assign(externs, {
          rf_game_task: rf_game_task!,
          rf_monsters: rf_monsters!,
          rf_em_chunks: rf_em_chunks!,
          ...aggressionExterns(aggression),
        });
        aggressionIdle = true;
        tailsWhy = tailSpeedProblem(ovl.reader.buf);
        motionTails ||= tailsWhy === null;
      }
    }
    const data: Record<string, Buffer> = {};
    for (const part of parts) Object.assign(data, part.data);
    if (motionTails) data.rf_motion_tails = encodeMotionTails();
    // Poogie only needs the pad hook, so it doesn't wait on the HUD and reward code matching.
    const hookSites =
      typeof sites !== "string" ? sites : game.eboot ? findPadSites(game.eboot) : sites;
    const poogie = !settings["poogie.enabled"]
      ? null
      : typeof hookSites === "string"
        ? hookSites
        : preparePoogieLuck(game.eboot!, edits, { guaranteed: options.poogieTest });
    if (typeof poogie === "string") reports.push(notApplied("Poogie", poogie));
    else if (poogie) {
      objects.push(...poogieObjects());
      Object.assign(externs, poogie.externs);
    }
    const luck = typeof poogie === "string" ? null : poogie;
    const { ovl: lobbyOvl } = game.lobbyTask;
    const keySites = !settings["quests.keyLabel"]
      ? null
      : typeof hookSites === "string"
        ? hookSites
        : findKeyQuestSites(lobbyOvl.reader.buf, lobbyOvl.loadBase, game.eboot);
    if (typeof keySites === "string") reports.push(notApplied("Key quests", keySites));
    const keys = typeof keySites === "string" ? null : keySites;
    if (keys) {
      objects.push(...keyQuestsObjects());
      Object.assign(externs, keys.externs);
    }
    // Damage numbers are on the hit hook in game_sub.
    let hit: HitSite | null = null;
    const numbers = settings["hud.damageNumbers"];
    {
      const sub = game.gameSub.ovl;
      const site = typeof sites === "string" ? sites : findHitSite(sub.reader.buf, sub.loadBase);
      const found =
        typeof sites === "string"
          ? sites
          : typeof site === "string"
            ? site
            : findDamageExterns(game.eboot!, sites, ovl.reader.buf, ovl, numbers);
      if (typeof found === "string") {
        if (numbers !== "off") reports.push(notApplied("Damage numbers", found));
      } else {
        (numbers === "off" ? optional : objects).push(...damageObjects());
        Object.assign(externs, found);
        hit = site as HitSite;
      }
    }
    // Whetstone's START menu entry, where the features with settings can be changed in game.
    let menus: MenuSites[] | null = null;
    const sendAllOn = settings["rewards.sendAll"];
    const pipsOn = settings["smithy.improvePips"];
    const harvestOn = settings["farm.harvestAll"];
    const combineOn = settings["pouch.bulkCombine"];
    if (sendAllOn && typeof sites === "string")
      reports.push(notApplied("Send All to Item Box", sites));
    if (pipsOn && typeof sites === "string") reports.push(notApplied("Improve pips", sites));
    if (harvestOn && typeof sites === "string") reports.push(notApplied("Harvest all", sites));
    if (combineOn && typeof sites === "string") reports.push(notApplied("Bulk combine", sites));
    if (
      (hit ||
        monsterHp ||
        hitboxes ||
        camera ||
        questEnd ||
        photo ||
        sendAllOn ||
        pipsOn ||
        harvestOn ||
        combineOn) &&
      typeof sites !== "string"
    ) {
      const found = prepareMenu(game.eboot!, sites);
      if (typeof found === "string") {
        reports.push(
          notApplied(
            "Whetstone's START menu entry",
            `${found}; monster health, attack hitboxes, damage numbers, the camera, photo mode and the wait after a quest keep this disc's settings`,
          ),
        );
        if (sendAllOn) reports.push(notApplied("Send All to Item Box", found));
        if (pipsOn) reports.push(notApplied("Improve pips", found));
        if (harvestOn) reports.push(notApplied("Harvest all", found));
        if (combineOn) reports.push(notApplied("Bulk combine", found));
      } else {
        optional.push(...menuObjects());
        Object.assign(externs, found.externs);
        menus = found.sites;
      }
    }
    // Send All to Item Box: on the menu's hooks, so it goes in (and out) with them.
    let sendAll: SendAll | null = null;
    if (menus && sendAllOn && typeof sites !== "string") {
      // The overlays the game runs, for calls to the reward screen's draw from them.
      const overlays = [ovl, game.lobbyTask.ovl].map(({ reader }) => ({
        code: reader.buf,
        offset: 0,
        size: reader.buf.length,
      }));
      const found = prepareSendAll(game.eboot!, sites, overlays);
      if (typeof found === "string") reports.push(notApplied("Send All to Item Box", found));
      else {
        optional.push(...sendAllObjects());
        Object.assign(externs, found.externs);
        sendAll = found;
      }
    }
    // Improve pips: a call of the menu's hook in lobby_task, so it goes in (and out) with them.
    let improvePips: ImprovePips | null = null;
    if (menus && pipsOn) {
      const found = prepareImprovePips(game.eboot!, game.lobbyTask);
      if (typeof found === "string") reports.push(notApplied("Improve pips", found));
      else {
        optional.push(...improvePipsObjects());
        Object.assign(externs, found.externs);
        improvePips = found;
      }
    }
    // Harvest all: a call of the menu's hook, so it goes in (and out) with them.
    let harvest: Harvest | null = null;
    if (menus && harvestOn) {
      const found = prepareHarvest(game.eboot!, game.lobbyTask);
      if (typeof found === "string") reports.push(notApplied("Harvest all", found));
      else {
        optional.push(...harvestObjects());
        Object.assign(externs, found.externs);
        harvest = found;
      }
    }
    // Bulk combine: the menu's hook, and a call of it in the EBOOT, so it goes in (and out) with them.
    let combine: Combine | null = null;
    if (menus && combineOn) {
      const found = prepareCombine(game.eboot!, menus, game.lobbyTask);
      if (typeof found === "string") reports.push(notApplied("Bulk combine", found));
      else {
        optional.push(...combineObjects());
        Object.assign(externs, found.externs);
        combine = found;
      }
    }
    // The target camera: a call of the menu's hook, so it goes in (and out) with
    // them, and the read the game makes without the blob, in the camera's patch.
    let targetCamera: TargetCamera | null = null;
    let targetPatch: TargetCamera | null = null;
    const targetOn = settings["camera.target"] !== "off";
    if (menus && camera && typeof sites !== "string") {
      const found = prepareTargetCamera(game.eboot!, ovl.reader.buf, ovl, settings);
      if (typeof found === "string") {
        if (targetOn) reports.push(notApplied("Target camera", found));
      } else {
        (targetOn ? objects : optional).push(...targetCameraObjects());
        Object.assign(externs, found.externs);
        targetCamera = found;
      }
    } else if (targetOn) {
      reports.push(
        notApplied(
          "Target camera",
          typeof sites === "string"
            ? sites
            : !camera
              ? "the camera's code isn't on this disc"
              : "it goes in with the START menu entry, which wasn't found",
        ),
      );
    }
    if (
      typeof hookSites !== "string" &&
      (monsterHp ||
        hitboxes ||
        parts.length > 0 ||
        elites ||
        aggressionIdle ||
        luck ||
        keys ||
        hit ||
        camera ||
        questEnd ||
        photo ||
        sendAll ||
        improvePips ||
        harvest ||
        combine)
    ) {
      // Hook 8's other calls; harvest.c and combine.c know theirs by its site.
      const calls = [
        ...(sendAll?.calls ?? []),
        ...(targetCamera?.calls ?? []),
        ...(improvePips?.calls ?? []),
      ];
      if (harvest) {
        externs.rf_harvest_site = FIRST_CALL_SITE + calls.length;
        calls.push(...harvest.calls);
      }
      if (combine) {
        externs.rf_combine_site = FIRST_CALL_SITE + calls.length;
        calls.push(...combine.calls);
      }
      const install = (lean: boolean) => {
        const all = lean ? objects : [...objects, ...optional];
        return addCodeLoader(game.eboot, game.gameSub, edits, {
          // Elites and the pact both bring the shared monster boosts: link them once.
          objects: all.filter((o, k) => all.findIndex((x) => x.name === o.name) === k),
          hooks: {
            sites: hookSites,
            // Pad-only sites (Poogie alone) leave game_task as it is.
            ...(typeof sites !== "string" && { gameTask: game.gameTask }),
            ...(questLoad && { questLoad: { sites: questLoad, lobbyTask: game.lobbyTask } }),
            ...(luck && { pick: luck.pick }),
            ...(keys && {
              questCard: { call: keys.call, card: keys.card, lobbyTask: game.lobbyTask },
            }),
            // The hit hook is damage numbers' alone.
            ...(hit && !(lean && numbers === "off") && { hit }),
            ...(menus &&
              !lean && {
                menus,
                calls,
              }),
          },
          externs,
          data,
        });
      };
      let loader = install(false);
      let wentLean = false;
      // A loader that doesn't fit with the in-game settings goes in without
      // them (it checks before it takes any room), keeping the options that are on.
      if (!loader.applied && optional.length) {
        const leanLoader = install(true);
        if (leanLoader.applied) {
          reports.push(
            notApplied(
              "Whetstone's START menu entry",
              `${(loader.summary ?? "").replace(/^[^(]*\(|\)$/g, "")}; the options that are on keep this disc's settings`,
            ),
          );
          loader = leanLoader;
          wentLean = true;
        }
      }
      reports.push(loader);
      if (aggressionIdle && loader.applied) pausesWhy = null;
      // A lean loader leaves out the camera's code when its options are off.
      cameraLinked = loader.applied && camera && (cameraWanted || !wentLean);
      // Its code is always optional: the EBOOT patch alone carries the disc's
      // choice. It's a setting only when the START menu entry went in too.
      questEndInGame = loader.applied && questEnd && !wentLean && menus !== null;
      if (sendAll) {
        if (loader.applied && !wentLean) {
          sendAll.patch(edits.eboot());
          reports.push(sendAllReport());
        } else if (loader.applied) {
          reports.push(
            notApplied(
              "Send All to Item Box",
              "it goes in with the START menu entry, which didn't fit",
            ),
          );
        } else {
          reports.push(notApplied("Send All to Item Box", "the code loader isn't on this disc"));
        }
      }
      if (improvePips) {
        reports.push(
          loader.applied && !wentLean
            ? improvePipsReport()
            : notApplied(
                "Improve pips",
                loader.applied
                  ? "it goes in with the START menu entry, which didn't fit"
                  : "the code loader isn't on this disc",
              ),
        );
      }
      if (harvest) {
        reports.push(
          loader.applied && !wentLean
            ? harvestReport()
            : notApplied(
                "Harvest all",
                loader.applied
                  ? "it goes in with the START menu entry, which didn't fit"
                  : "the code loader isn't on this disc",
              ),
        );
      }
      if (combine) {
        reports.push(
          loader.applied && !wentLean
            ? combineReport()
            : notApplied(
                "Bulk combine",
                loader.applied
                  ? "it goes in with the START menu entry, which didn't fit"
                  : "the code loader isn't on this disc",
              ),
        );
      }
      // A lean loader leaves photo mode's code out when it's off.
      const photoLinked = loader.applied && photo !== null && (photoOn || !wentLean);
      if (photo && photoLinked) patchDim(edits.eboot(), photo);
      if (photoOn && photo) reports.push(photoReport(photoLinked, !wentLean && menus !== null));
      if (targetCamera) {
        // Written after the camera's patch below, whose unreached words it takes.
        if (loader.applied && !wentLean) {
          targetPatch = targetCamera;
        } else if (targetOn) {
          reports.push(
            notApplied(
              "Target camera",
              loader.applied
                ? "it goes in with the START menu entry, which didn't fit"
                : "the code loader isn't on this disc",
            ),
          );
        }
      }
      for (const part of parts) if (part.finish) reports.push(part.finish(loader.applied));
      if (keys) reports.push(keyQuestsReport(loader.applied));
      if (luck) {
        reports.push(luck.finish(loader.applied));
        if (loader.applied && options.poogieTest) {
          testing.push(
            "Poogie test: a happy Poogie always gives the rarest reward. This disc is not for play.",
          );
        }
      }
    }
    if (cameraFound && typeof cameraFound !== "string" && (cameraWanted || cameraLinked)) {
      const patched = patchFov(edits.eboot(), FOV_SCALES[settings["camera.fov"]]);
      if (typeof patched === "string") {
        if (cameraWanted) reports.push(notApplied("Camera", patched));
      } else {
        if (cameraWanted) reports.push(cameraReport(settings, cameraLinked, game.region));
        if (targetPatch) {
          targetPatch.patch(edits.eboot());
          if (targetOn) reports.push(targetCameraReport(settings));
          targetPatch = null;
        }
      }
    }
    // The call went in, but not the camera's patch: the ease's jal must go back to the game's read.
    if (targetPatch) throw new Error("The target camera's call went in without the camera's patch");
  }

  if (aggressionReport && aggression !== "off") {
    const frames = AGGRESSION_IDLE_FRAMES[aggression];
    const speed = AGGRESSION_TAIL_SPEED[aggression];
    // Where an elite's own is better, it says so.
    const elitesOn = settings["elites.enabled"];
    const eliteIdle =
      elitesOn && ELITE_IDLE_FRAMES < frames ? `; an elite's is ${ELITE_IDLE_FRAMES} frames` : "";
    const eliteSpeed =
      elitesOn && ELITE_TAIL_SPEED > speed ? ` (an elite's ${ELITE_TAIL_SPEED}%)` : "";
    aggressionReport.notes.push(
      pausesWhy === null
        ? `Between moves, a large monster stands in its idle at most ${frames} frames (${Math.round((frames / 30) * 100) / 100} s${eliteIdle}).`
        : `Pauses between moves aren't shortened: ${pausesWhy}.`,
    );
    if (pausesWhy === null) {
      aggressionReport.notes.push(
        tailsWhy === null
          ? `Once a move is past its last hit, and all through a turn, a large monster moves ${speed}% faster${eliteSpeed}.`
          : `Recoveries after a move aren't quicker: ${tailsWhy}.`,
      );
    }
    if (pausesWhy !== null) aggressionReport.summary += `; pauses not shortened (${pausesWhy})`;
  }

  if (questEndOn) {
    const why = typeof questEndAt === "string" ? questEndAt : null;
    reports.push(
      why === null
        ? questEndReport(settings, questEndInGame)
        : {
            title: "Quest end",
            notes: [`The wait after a quest isn't in this image: ${why}.`],
            lines: [],
            summary: `Quest end: not applied (${why})`,
          },
    );
  }

  // Every disc is offline, after the other patches so none of them reads it.
  reports.push(
    offlineReport(
      game.eboot
        ? disableOnline(game.eboot, game.region, game.dataBin.fileCount, edits)
        : "the EBOOT wasn't loaded",
    ),
  );

  // A randomizer's late patches (randomfu's guides), before the data patches below.
  if (options.late) reports.push(...options.late());

  if (settings["mods.nodeMap"]) reports.push(addNodeMap(game, edits));
  if (settings["paint.stays"]) reports.push(paintReport(patchPaintStays(game.gameTask, edits)));
  if (settings["monsterList.slainCaptured"]) {
    reports.push(monsterListReport(patchMonsterList(game.eboot, edits)));
  }
  const buttonIcons = settings["mods.buttonIcons"];
  if (buttonIcons !== "psp") reports.push(addButtonIcons(game, edits, buttonIcons));

  return { reports, testing };
}
