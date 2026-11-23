"use client";

import { useEffect, useRef, useState } from "react";
import Loading from "@/components/Loading";
import { capsuleBone } from "@/lib/capsule-bone";
import { cn } from "@/lib/cn";
import {
  fetchHunterClips,
  fetchHunterIdle,
  HUNTER_BARE_FEMALE_MODEL,
  HUNTER_BARE_MODEL,
  HUNTER_MODEL,
  SHEATHED_TARGET,
  WEAPON_MOUNTS,
  type HunterClip,
  type HunterMotion,
  type WeaponMount,
} from "@/lib/hunter";
import type { GamePose } from "@/lib/bone-scaling";
import {
  dressHunter,
  dyeHair,
  faceMask,
  hideFace,
  skinHunter,
  type DressSlot,
  type HunterOutfit,
  type HunterSlot,
  type WornPiece,
} from "@/lib/hunter-armor";
import {
  clampLook,
  CLOTHING_SLOTS,
  DEFAULT_LOOK,
  faceUrl,
  fetchLookData,
  hairstyleUrl,
  skinUrl,
  type HunterLook,
} from "@/lib/hunter-look";
import { armorModelFile, armorModelSlot, armorSlotModelUrl } from "@/lib/models";
import { fetchMotions, inPlace, MOTION_FPS, underneath, type MotionClip } from "@/lib/motions";
import { modelPanel, modelPanelButton } from "@/styles/model";
import { useT } from "@/context/LanguageContext";
import type { Messages } from "@/lib/i18n/messages";

/** A capsule drawn over the model, in the model's space: a sphere of `radius` swept from `start` to `end`. */
export interface ModelCapsule {
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  /** A CSS colour, or a `var(--color-…)` token. */
  color: string;
  /** 0 hides it. */
  opacity: number;
}

/**
 * An attack a monster's motion makes: capsules on its joints that show only
 * while motion `slot` is between frames `from` (inclusive) and `to`.
 */
export interface ModelAttack {
  slot: number;
  from: number;
  to: number;
  /** Each on the model's `bone_<joint>`, placed in the bind pose like `ModelCapsule`. */
  capsules: (Pick<ModelCapsule, "start" | "end" | "radius"> & { joint: number })[];
}

interface Props {
  /** URL of a .glb file. */
  src: string;
  /** Accessible description, e.g. the monster's name. */
  label: string;
  /**
   * Show the model twice, fanned out from the grip and mirrored, as the game
   * shows a pair of dual blades (each blade's file holds only one). Only when
   * the model shows alone, not held by the hunter.
   */
  pair?: boolean;
  /** Translucent capsules over the model, e.g. a monster's hitboxes. */
  capsules?: ModelCapsule[];
  /** A monster's attacks, drawn while the motion playing can hit with them. */
  attacks?: ModelAttack[];
  /** Slots of a monster's motions that nothing in the game plays. */
  unusedMotions?: number[];
  /**
   * Show `src` (a weapon) in the hands of the hunter, playing this weapon
   * type's motions. If the hunter's model can't load, the weapon shows alone.
   */
  hunter?: string;
  /**
   * Show `src` (an armor piece, with `parts`: its set) worn by the hunter of
   * its sex, standing idle, in place of the default set's pieces of their
   * slots. If the hunter's model can't load, the pieces show alone. The
   * hunter takes `wear.look`, which can change while it's shown.
   */
  wear?: HunterOutfit;
  /**
   * More .glb files shown with `src`, in the same space: the rest of an
   * armor set, whose pieces all sit on the player's skeleton. One that can't
   * load is left out.
   */
  parts?: string[];
  /**
   * The model's base scale (a monster's `base_scale`): a hunter stands
   * beside it, idle, at 1/scale, as the game draws the two at size 100.
   */
  sizeHunter?: number;
  /** Whether that hunter shows (default true); toggling it keeps the camera. */
  showSizeHunter?: boolean;
}

type Three = typeof import("three");

/**
 * Draws an effect layer as the game does: a material whose `extras.blend`
 * (mhfu-extract's gltf.ts) is `add` adds its colour to what is behind it,
 * `revsub` takes it away. Both scale by the texture's alpha and leave the
 * depth buffer alone. Other materials are left as they are.
 */
function effectBlend(THREE: typeof import("three"), material: import("three").Material) {
  const blend = material.userData.blend;
  if (blend !== "add" && blend !== "revsub") return;
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = blend === "add" ? THREE.AddEquation : THREE.ReverseSubtractEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneFactor;
}

/**
 * A translucent capsule (a sphere of `radius` swept from `start` to `end`),
 * drawn after the model and not hidden by it, so capsules inside the body
 * still show; not writing depth keeps overlaps visible.
 */
function capsuleMesh(
  THREE: Three,
  { start, end, radius }: Pick<ModelCapsule, "start" | "end" | "radius">,
  color: string,
  opacity: number,
): import("three").Mesh {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 8, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.position.copy(from).lerp(to, 0.5);
  if (length > 0)
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
  mesh.renderOrder = 1;
  mesh.userData.overlay = true;
  return mesh;
}

/** Puts `mesh` (placed in the bind pose) on its bone, at the same place while the bone holds that pose. */
function mountMesh(mesh: import("three").Mesh, mounted: CapsuleMount): void {
  mesh.updateMatrix();
  mesh.matrix.premultiply(mounted.inverse);
  mesh.matrixAutoUpdate = false;
  mounted.parent.add(mesh);
}

/** Opacity of an attack's capsules while it can hit. */
const ATTACK_OPACITY = 0.5;

/** Resolves a `var(--name)` colour against `element`; other colours pass through. */
function resolveColor(element: Element, color: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(color);
  return match ? getComputedStyle(element).getPropertyValue(match[1]!).trim() : color;
}

/** Where a capsule rides once the model animates: under `parent`, after `inverse` (its bind-pose world matrix, inverted). */
interface CapsuleMount {
  parent: import("three").Object3D;
  inverse: import("three").Matrix4;
}

/** What the capsule effects need of a shown model. */
interface SceneHandle {
  THREE: Three;
  scene: import("three").Scene;
  /** Where a capsule on joint `joint` (in the bind pose) rides; null if the model has no such bone. */
  jointMount: (joint: number) => CapsuleMount | null;
  /** Called every frame, after the motion moves on. */
  frameHooks: Set<() => void>;
  /** The motion playing and its frame (60 fps); null before motions load. */
  now: () => { slot: number; frame: number } | null;
  /** The hunter standing beside the model for its size (`sizeHunter`), if any. */
  sizeHunter: import("three").Object3D | null;
  /** Dresses the hunter wearing armor in a look; absent for other models. */
  relook?: (look: HunterLook) => Promise<void>;
  /** The bone a capsule (in the bind pose) rides on; null for an unskinned model. */
  mount: (
    start: ModelCapsule["start"],
    end: ModelCapsule["end"],
    radius: number,
  ) => CapsuleMount | null;
}

/**
 * Motions made playable on a model whose bones are named `bone_<joint>`:
 * each clip in place (see `inPlace`) and as a three.js clip, a mixer for
 * them, and the game's bone scaling where a motion needs it.
 */
function animate3d(
  THREE: Three,
  boneScaling: typeof import("@/lib/bone-scaling"),
  root: import("three").Object3D,
  loaded: MotionClip[],
): {
  sources: MotionClip[];
  clips: import("three").AnimationClip[];
  /** A three.js clip of a motion, as `clips` are made. */
  toClip: (clip: MotionClip, name: string) => import("three").AnimationClip;
  mixer: import("three").AnimationMixer;
  pose: GamePose | null;
} {
  const node = (bone: number) => root.getObjectByName(`bone_${bone}`);
  const parentOf = (bone: number) => {
    const match = /^bone_(\d+)$/.exec(node(bone)?.parent?.name ?? "");
    return match ? Number(match[1]) : -1;
  };
  const bind = (bone: number) =>
    (node(bone)?.position.toArray() ?? [0, 0, 0]) as [number, number, number];
  const sources = loaded.map((source) => inPlace(source, parentOf, bind));
  const toClip = (clip: MotionClip, name: string) =>
    new THREE.AnimationClip(
      name,
      clip.duration,
      clip.tracks.map((track) => {
        const bone = `bone_${track.bone}`;
        if (track.path === "rotation")
          return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, track.times, track.values);
        const property = track.path === "translation" ? "position" : "scale";
        return new THREE.VectorKeyframeTrack(`${bone}.${property}`, track.times, track.values);
      }),
    );
  const clips = sources.map((clip) => toClip(clip, `Motion ${clip.slot}`));
  // Only a motion that scales a bone with bones under it poses differently
  // the game's way; the rest keep three.js's own.
  const hasChildBones = (bone: number) =>
    node(bone)?.children.some((child) => (child as import("three").Bone).isBone) ?? false;
  const pose = sources.some((clip) => boneScaling.scalesParent(clip.tracks, hasChildBones))
    ? new boneScaling.GamePose(root)
    : null;
  return { sources, clips, toClip, mixer: new THREE.AnimationMixer(root), pose };
}

/** Angle of each blade of a pair from the centre line. */
const PAIR_OFFSET = (32 * Math.PI) / 180;

type Status = "loading" | "ready" | "error";

/** How long a model waits for its motions before showing still (see the effect). */
const MOTIONS_WAIT_MS = 1500;
/**
 * A two-handed weapon is wholly in its holding hand (`WeaponMount.hold`) while
 * the other fist is within GRIP_ON of the handle line, wholly in that fist
 * from GRIP_OFF, and blended between the two in between (no latch: each frame
 * stands alone). The fist can slide GRIP_SLIDE along the handle and still
 * count as on it.
 */
const GRIP_ON = 8;
const GRIP_OFF = 16;
const GRIP_SLIDE = 20;

/** Gap between a model and the hunter beside it, in the hunter's units (about centimetres). */
const SIZE_HUNTER_GAP = 60;

/** Poses of the first motion sampled for the ground's height. */
const GROUND_SAMPLES = 8;
/** The ground shadow's width, against the model's widest side. */
const GROUND_SCALE = 1.4;

/** The model's motions, once loaded (monsters only; see src/lib/motions.ts). */
interface MotionState {
  count: number;
  index: number;
  /** The game's slot of the motion shown. */
  slot: number;
  playing: boolean;
  /** What each clip is, when the clips are the hunter's (named by `motionLabel`). */
  motions?: HunterMotion[];
}

/** Drives the loaded motions from React; set while a model with motions shows. */
interface MotionPlayer {
  select: (index: number) => void;
  setPlaying: (playing: boolean) => void;
}

const panelButton = cn(modelPanelButton, "text-parchment");

/** A hunter motion's name in the site's language ("Sheathed idle", "Move 3", "Attack 12"). */
function motionLabel(t: Messages, motion: HunterMotion): string {
  const m = t.equipment.model;
  switch (motion.kind) {
    case "sheathed-idle":
      return m.sheathedIdle;
    case "drawn-idle":
      return m.drawnIdle;
    case "idle":
      return m.idle;
    case "move":
      return m.moveN(motion.n);
    case "attack":
      return m.attackN(motion.n);
  }
}

/**
 * Interactive 3D view of a .glb model: drag to rotate, scroll/pinch to zoom.
 * three.js is imported on demand so it only loads on pages that show a model.
 */
export default function ModelViewer({
  src,
  label,
  pair = false,
  capsules,
  attacks,
  unusedMotions,
  hunter,
  parts,
  wear,
  sizeHunter,
  showSizeHunter = true,
}: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  /** Set while a model is shown, for the capsule effect below. */
  const sceneRef = useRef<SceneHandle | null>(null);
  const [motion, setMotion] = useState<MotionState | null>(null);
  const playerRef = useRef<MotionPlayer | null>(null);
  // The effect below re-runs on the list's contents, not its identity.
  const partsKey = parts?.join("\n") ?? "";
  const look = wear?.look;
  const lookKey = look ? `${look.face}|${look.hair}|${look.hairColor}|${look.clothing}` : "";
  /** The look to show, for the model's first showing (the effect below follows later changes). */
  const lookRef = useRef(look);
  /** Whether the size hunter shows, for its first showing (the effect below follows changes). */
  const showSizeHunterRef = useRef(showSizeHunter);
  useEffect(() => {
    showSizeHunterRef.current = showSizeHunter;
  }, [showSizeHunter]);
  useEffect(() => {
    lookRef.current = look;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};
    setStatus("loading");
    setMotion(null);

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      // Models are meshopt-compressed (EXT_meshopt_compression; see packages/mhfu-extract).
      const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      // Three.js-based, so it loads with three.
      const boneScaling = await import("@/lib/bone-scaling");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.touchAction = "none";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(1, 2, 3);
      scene.add(sun);

      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1e6);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.5;
      // Stop spinning once the visitor takes over.
      controls.addEventListener("start", () => {
        controls.autoRotate = false;
        interacted = true;
      });

      // Set once the model loads; re-run on resize so the fit uses the
      // viewer's real aspect ratio (it can still be laying out at load time).
      let fit: (() => void) | null = null;
      let interacted = false;

      const resize = () => {
        const { clientWidth, clientHeight } = container;
        if (!clientWidth || !clientHeight) return;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        if (fit && !interacted) fit();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();

      let frame = 0;
      const clock = new THREE.Clock();
      let mixer: import("three").AnimationMixer | null = null;
      /** Poses the bones after the mixer moves them, when its motions need the game's scaling. */
      let pose: GamePose | null = null;
      const frameHooks = new Set<() => void>();
      /** The motion playing and its frame; set once motions load. */
      let now: SceneHandle["now"] = () => null;
      /** The size hunter's idle and its bone scaling, once loaded. */
      let standInMixer: import("three").AnimationMixer | null = null;
      let standInPose: GamePose | null = null;
      const animate = () => {
        frame = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        mixer?.update(delta);
        pose?.update();
        standInMixer?.update(delta);
        standInPose?.update();
        holdWeapon?.();
        for (const hook of frameHooks) hook();
        controls.update();
        renderer.render(scene, camera);
      };

      let model: import("three").Object3D | null = null;
      /** The hunter beside the model for its size (`sizeHunter`). */
      let standIn: import("three").Object3D | null = null;
      /** Moves the weapon between the hunter's hands and back; only with `hunter`. */
      let placeWeapon: ((sheathed: boolean) => void) | null = null;
      /** Hands a two-handed weapon between the fists each frame (`WeaponMount.hold`). */
      let holdWeapon: (() => void) | null = null;
      let ground: import("three").Mesh | null = null;
      const abort = new AbortController();
      cleanup = () => {
        abort.abort();
        sceneRef.current = null;
        playerRef.current = null;
        mixer?.stopAllAction();
        standInMixer?.stopAllAction();
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        for (const root of [model, standIn])
          root?.traverse((object) => {
            const mesh = object as import("three").Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry.dispose();
            for (const material of [mesh.material].flat()) {
              (material as import("three").MeshStandardMaterial).map?.dispose();
              material.dispose();
            }
          });
        if (ground) {
          ground.geometry.dispose();
          const material = ground.material as import("three").MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
        }
        renderer.dispose();
        renderer.domElement.remove();
      };

      try {
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        // Without the hunter (an export that couldn't make one), the weapon
        // or armor shows alone.
        // Armor goes on the bare hunter of its sex; a weapon is held by the
        // hunter in the default set.
        const bodyModel = wear
          ? wear.sex === "female"
            ? HUNTER_BARE_FEMALE_MODEL
            : HUNTER_BARE_MODEL
          : HUNTER_MODEL;
        const standInLoad = sizeHunter
          ? loader.loadAsync(HUNTER_MODEL).catch(() => null)
          : Promise.resolve(null);
        const [body, own, ...extra] = await Promise.all([
          hunter || wear ? loader.loadAsync(bodyModel).catch(() => null) : null,
          loader.loadAsync(src),
          ...(partsKey ? partsKey.split("\n") : []).map((url) =>
            loader.loadAsync(url).catch(() => null),
          ),
        ]);
        if (disposed) return;
        // Each piece goes in the slot its file is for (a set's first file
        // needn't be the page's piece), one a slot.
        const worn: (WornPiece & { url: string })[] = [];
        const wearing = (() => {
          if (!body || !wear) return false;
          const partUrls = partsKey ? partsKey.split("\n") : [];
          worn.push({
            slot: (armorModelSlot(src) as HunterSlot | undefined) ?? wear.slot,
            model: own.scene,
            url: src,
          });
          extra.forEach((part, i) => {
            const url = partUrls[i] ?? "";
            const slot = armorModelSlot(url) as HunterSlot | undefined;
            if (part && slot && !worn.some((piece) => piece.slot === slot))
              worn.push({ slot, model: part.scene, url });
          });
          try {
            dressHunter(THREE, body.scene, worn);
            return true;
          } catch {
            return false;
          }
        })();
        /**
         * Dresses the hunter in a look (hunter-look.ts) around the armor it
         * wears: its face, its hairstyle under no helmet, its clothes in the
         * slots it wears no armor in; then dyes the hair, gives the skin the
         * face's tone, and hides what the helmet hides of the face. Only the
         * latest call goes on, once its pieces load.
         */
        let relook: SceneHandle["relook"];
        if (wearing && body && wear) {
          const hunterScene = body.scene;
          const sex = wear.sex === "female" ? "f" : "m";
          const helmet = worn.find((piece) => piece.slot === "helmet");
          const helmetId = helmet ? armorModelFile(helmet.url)?.id : undefined;
          const wornSlots = new Set<DressSlot>(worn.map((piece) => piece.slot));
          const pieceLoads = new Map<string, Promise<{ scene: import("three").Object3D } | null>>();
          const loadPiece = (url: string) => {
            let load = pieceLoads.get(url);
            if (!load) {
              load = loader.loadAsync(url).catch(() => null);
              pieceLoads.set(url, load);
            }
            return load;
          };
          const textureLoader = new THREE.TextureLoader();
          const skinLoads = new Map<string, Promise<import("three").Texture | null>>();
          const loadSkin = (url: string) => {
            let load = skinLoads.get(url);
            if (!load) {
              load = textureLoader.loadAsync(url).catch(() => null);
              skinLoads.set(url, load);
            }
            return load;
          };
          // The bare hunter comes dressed in the default look.
          let dressedIn = JSON.stringify(DEFAULT_LOOK);
          let latest = 0;
          relook = async (picked) => {
            const call = ++latest;
            const options = (await fetchLookData())?.[sex];
            if (disposed || call !== latest || !options) return;
            const look = clampLook(picked, options);
            if (JSON.stringify(look) !== dressedIn) {
              const tone = options.faceSkinTones[look.face] ?? 0;
              const wanted: [DressSlot, string][] = [["face", faceUrl(sex, look.face)]];
              if (!wornSlots.has("helmet")) wanted.push(["helmet", hairstyleUrl(sex, look.hair)]);
              for (const slot of CLOTHING_SLOTS)
                if (!wornSlots.has(slot))
                  wanted.push([
                    slot,
                    armorSlotModelUrl(
                      slot,
                      sex,
                      options.clothing[slot][look.clothing]?.[tone] ?? 0,
                    ),
                  ]);
              const [loaded, images] = await Promise.all([
                Promise.all(wanted.map(([, url]) => loadPiece(url))),
                Promise.all(
                  Array.from({ length: options.skinImages }, (_, k) =>
                    loadSkin(skinUrl(sex, tone, k)),
                  ),
                ),
              ]);
              if (disposed || call !== latest) return;
              const pieces = wanted.flatMap(([slot], i) => {
                const piece = loaded[i];
                return piece ? [{ slot, model: piece.scene }] : [];
              });
              try {
                dressHunter(THREE, hunterScene, pieces);
              } catch {
                return;
              }
              dyeHair(hunterScene, look.hairColor);
              skinHunter(hunterScene, (k) => images[k] ?? undefined);
              dressedIn = JSON.stringify(look);
            }
            if (helmetId) hideFace(hunterScene, faceMask(options.faceMasks, helmetId));
          };
          await relook(lookRef.current ?? DEFAULT_LOOK);
          if (disposed) return;
        }
        const weapon = body && hunter ? own.scene : null;
        const gltf = weapon || wearing ? body! : own;
        const holding = weapon ? hunter : undefined;
        model = gltf.scene;
        if (!wearing) for (const part of extra) if (part) model.add(part.scene);
        const copies = [model];
        if (weapon && holding) {
          scene.add(model);
          // A two-piece weapon's nodes are part_0, part_1; a whole one is one mesh.
          const named = weapon.children.filter((child) => child.name.startsWith("part_"));
          const parts = named.length > 0 ? named : [weapon.children[0]!];
          const mounts = WEAPON_MOUNTS[holding];
          const body = model;
          type Held = {
            part: import("three").Object3D;
            bone: import("three").Object3D;
            holder: import("three").Object3D;
            mount: WeaponMount & { hold: NonNullable<WeaponMount["hold"]> };
          };
          let held: Held[] = [];
          // A posed weapon's bones in the sheathed pose (a bowgun or bow folded),
          // as a morph target on the drawn mesh (mhfu-extract's weapon-pose.ts).
          const poses: { influences: number[]; sheathed: number }[] = [];
          weapon.traverse((node) => {
            const mesh = node as import("three").Mesh;
            const sheathed = mesh.morphTargetDictionary?.[SHEATHED_TARGET];
            if (sheathed !== undefined && mesh.morphTargetInfluences)
              poses.push({ influences: mesh.morphTargetInfluences, sheathed });
          });
          placeWeapon = (sheathed) => {
            const plan = mounts && (sheathed ? mounts.sheathed : mounts.drawn);
            for (const pose of poses) pose.influences[pose.sheathed] = sheathed ? 1 : 0;
            held = [];
            parts.forEach((part, i) => {
              const mount = plan?.[Math.min(i, plan.length - 1)];
              const bone = mount && body.getObjectByName(`bone_${mount.joint}`);
              if (!mount || !bone) return;
              bone.add(part);
              part.position.set(...mount.position);
              part.rotation.set(...mount.rotation);
              const holder = mount.hold && body.getObjectByName(`bone_${mount.hold.joint}`);
              if (mount.hold && holder)
                held.push({ part, bone, holder, mount: { ...mount, hold: mount.hold } });
            });
          };
          const fist = new THREE.Vector3();
          const toHolder = new THREE.Matrix4();
          const inHolder = new THREE.Matrix4();
          const one = new THREE.Vector3(1, 1, 1);
          const euler = new THREE.Euler();
          const own = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
          const taken = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
          const scale = new THREE.Vector3();
          holdWeapon = () => {
            if (held.length === 0) return;
            for (const { part, bone, holder, mount } of held) {
              // Only the two hands' chains are read; render updates the rest.
              bone.updateWorldMatrix(true, false);
              holder.updateWorldMatrix(true, false);
              const { hold } = mount;
              // Where the first fist is along the holder's grip line.
              toHolder.copy(holder.matrixWorld).invert();
              fist
                .set(...hold.fist)
                .applyMatrix4(bone.matrixWorld)
                .applyMatrix4(toHolder);
              const off = Math.hypot(
                fist.x - hold.grip[0],
                fist.y - hold.grip[1],
                Math.max(0, Math.abs(fist.z - hold.grip[2]) - GRIP_SLIDE),
              );
              const weight = 1 - THREE.MathUtils.smoothstep(off, GRIP_ON, GRIP_OFF);
              own.position.set(...mount.position);
              own.quaternion.setFromEuler(euler.set(...mount.rotation));
              // The holder's place, in the first fist's frame (the part's parent).
              inHolder.compose(
                taken.position.set(...hold.position),
                taken.quaternion.setFromEuler(euler.set(...hold.rotation)),
                one,
              );
              inHolder
                .premultiply(holder.matrixWorld)
                .premultiply(toHolder.copy(bone.matrixWorld).invert())
                .decompose(taken.position, taken.quaternion, scale);
              part.position.lerpVectors(own.position, taken.position, weight);
              part.quaternion.slerpQuaternions(own.quaternion, taken.quaternion, weight);
            }
          };
          placeWeapon(true);
        } else if (pair) {
          // Weapon models hold the grip at the origin with the blade along +Z,
          // flat in the XZ plane: turn each copy PAIR_OFFSET about Y. The
          // model is the left-hand blade; the second, the right-hand one,
          // turns half round its length first, as the hunter holds it
          // (WEAPON_MOUNTS).
          const second = model.clone();
          model.rotation.y = PAIR_OFFSET;
          second.rotation.set(0, -PAIR_OFFSET, Math.PI);
          copies.push(second);
          scene.add(model, second);
        } else {
          scene.add(model);
        }

        // A skinned model moves away from its bind pose, which is all that
        // three.js's culling bounds cover.
        model.traverse((object) => {
          if ((object as import("three").SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
          const mesh = object as import("three").Mesh;
          if (mesh.isMesh)
            for (const material of [mesh.material].flat()) effectBlend(THREE, material);
        });

        // Capsules are placed on the bind pose: each rides the bone that
        // carries most of the mesh it covers (see capsuleBone), so they
        // follow the model as it moves. Read now, while it holds that pose.
        const mount = (() => {
          if (pair) return () => null;
          scene.updateMatrixWorld(true);
          const bones: import("three").Object3D[] = [];
          const boneIndex = new Map<import("three").Object3D, number>();
          const skin = {
            positions: [] as number[],
            bones: [] as number[],
            weights: [] as number[],
          };
          const vertex = new THREE.Vector3();
          model.traverse((object) => {
            const mesh = object as import("three").SkinnedMesh;
            if (!mesh.isSkinnedMesh) return;
            const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
            if (!position || !skinIndex || !skinWeight) return;
            for (let i = 0; i < position.count; i++) {
              mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
              skin.positions.push(vertex.x, vertex.y, vertex.z);
              for (let k = 0; k < 4; k++) {
                const bone = mesh.skeleton.bones[skinIndex.getComponent(i, k)];
                let index = bone ? boneIndex.get(bone) : 0;
                if (bone && index === undefined) {
                  index = bones.push(bone) - 1;
                  boneIndex.set(bone, index);
                }
                skin.bones.push(index ?? 0);
                skin.weights.push(bone ? skinWeight.getComponent(i, k) : 0);
              }
            }
          });
          const inverses = bones.map((bone) => bone.matrixWorld.clone().invert());
          // The capsule effect re-runs on every highlight; the bones don't change.
          const found = new Map<string, CapsuleMount | null>();
          return (start: ModelCapsule["start"], end: ModelCapsule["end"], radius: number) => {
            const key = `${start}|${end}|${radius}`;
            if (!found.has(key)) {
              const index = capsuleBone(skin, start, end, radius);
              found.set(
                key,
                index === null ? null : { parent: bones[index]!, inverse: inverses[index]! },
              );
            }
            return found.get(key)!;
          };
        })();

        // Attack capsules name their joint: each rides that bone, read in
        // the bind pose like the hitboxes (the matrices are current above).
        const jointMounts = new Map<number, CapsuleMount>();
        if (!pair)
          model.traverse((object) => {
            const match = /^bone_(\d+)$/.exec(object.name);
            if (match && !jointMounts.has(Number(match[1])))
              jointMounts.set(Number(match[1]), {
                parent: object,
                inverse: object.matrixWorld.clone().invert(),
              });
          });

        // The size hunter, at the game's scale against the model's.
        standIn = sizeHunter ? ((await standInLoad)?.scene ?? null) : null;
        if (disposed) return;
        if (standIn && sizeHunter) {
          standIn.scale.setScalar(1 / sizeHunter);
          // Facing the model, from its right.
          standIn.rotation.y = -Math.PI / 2;
          standIn.visible = showSizeHunterRef.current;
          standIn.traverse((object) => {
            if ((object as import("three").SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
          });
          scene.add(standIn);
        }

        // Frame the model for a turntable, viewed from slightly above (see fit).
        // Measured as posed (precise), so it's redone once a motion poses it.
        const box = new THREE.Box3();
        const center = new THREE.Vector3();
        let radius = 0;
        // Fit by projection: the closest camera distance at which every corner
        // of the bounding box stays inside the frame (with a small margin)
        // from all around the turntable, at the current viewing elevation.
        // Exact for any shape and aspect ratio, unlike a bounding sphere.
        let corners: import("three").Vector3[] = [];
        /**
         * Bounds of the model (or of `objects`) as posed, leaving out the
         * capsules on its bones.
         */
        const bounds = (target: import("three").Box3, objects = copies) => {
          // A skinned mesh comes before its bones in the scene, so their
          // world matrices must be current before the box reads them.
          scene.updateMatrixWorld(true);
          target.makeEmpty();
          for (const object of objects)
            object.traverse((child) => {
              if ((child as import("three").Mesh).isMesh && !child.userData.overlay)
                target.expandByObject(child, true);
            });
          return target;
        };
        /** What the camera frames: the model and the size hunter, shown or not. */
        const framed = standIn ? [...copies, standIn] : copies;
        /**
         * Stands the size hunter beside the model as posed, on `floor` (the
         * model's lowest point if not given), past its widest reach on +X.
         */
        const placeStandIn = (floor?: number) => {
          if (!standIn || !sizeHunter) return;
          const own = bounds(new THREE.Box3());
          const hunter = bounds(new THREE.Box3(), [standIn]);
          const ownCenter = own.getCenter(new THREE.Vector3());
          const hunterCenter = hunter.getCenter(new THREE.Vector3());
          standIn.position.x += own.max.x + SIZE_HUNTER_GAP / sizeHunter - hunter.min.x;
          standIn.position.y += (floor ?? own.min.y) - hunter.min.y;
          standIn.position.z += ownCenter.z - hunterCenter.z;
        };
        placeStandIn();
        const measure = () => {
          bounds(box, framed);
          box.getCenter(center);
          radius = box.getSize(new THREE.Vector3()).length() / 2;
          corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
            (i) =>
              new THREE.Vector3(
                i & 1 ? box.max.x : box.min.x,
                i & 2 ? box.max.y : box.min.y,
                i & 4 ? box.max.z : box.min.z,
              ),
          );
        };
        measure();
        const MARGIN = 0.92;
        const probe = camera.clone();
        const projected = new THREE.Vector3();
        const fitsAt = (distance: number, elevation: number): boolean => {
          probe.near = distance / 100;
          probe.far = distance * 10;
          probe.aspect = camera.aspect;
          probe.updateProjectionMatrix();
          for (let step = 0; step < 16; step++) {
            const azimuth = (step / 16) * Math.PI * 2;
            probe.position.set(
              center.x + distance * Math.cos(elevation) * Math.sin(azimuth),
              center.y + distance * Math.sin(elevation),
              center.z + distance * Math.cos(elevation) * Math.cos(azimuth),
            );
            probe.lookAt(center);
            probe.updateMatrixWorld();
            for (const corner of corners) {
              projected.copy(corner).project(probe);
              if (
                projected.z > 1 ||
                Math.abs(projected.x) > MARGIN ||
                Math.abs(projected.y) > MARGIN
              )
                return false;
            }
          }
          return true;
        };
        fit = () => {
          // Keep the current viewing elevation; change only the distance.
          const offset = camera.position.clone().sub(controls.target);
          const elevation = offset.lengthSq()
            ? Math.asin(THREE.MathUtils.clamp(offset.y / offset.length(), -1, 1))
            : 0.33;
          let near = radius * 0.5;
          let far = radius * 50;
          for (let i = 0; i < 30; i++) {
            const mid = (near + far) / 2;
            if (fitsAt(mid, elevation)) far = mid;
            else near = mid;
          }
          const distance = far;
          const direction = offset.lengthSq()
            ? offset.normalize()
            : new THREE.Vector3(1, 0.35, 1).normalize();
          controls.target.copy(center);
          camera.position.copy(center).addScaledVector(direction, distance);
          camera.near = distance / 100;
          camera.far = distance * 10;
          camera.updateProjectionMatrix();
          controls.minDistance = radius * 0.5;
          controls.maxDistance = distance * 3;
          controls.update();
        };
        camera.position.set(1, 0.35, 1);
        controls.target.set(0, 0, 0);
        fit();

        let shown = false;
        const show = () => {
          if (shown) return;
          shown = true;
          sceneRef.current = {
            THREE,
            scene,
            sizeHunter: standIn,
            mount,
            jointMount: (joint) => jointMounts.get(joint) ?? null,
            frameHooks,
            now: () => now(),
            relook,
          };
          setStatus("ready");
          animate();
        };

        // Motions come after the model, from the file its GLB names. The
        // model waits a moment for them, so it first shows already posed and
        // framed: its first pose can stand far from the bind pose (Rathian's
        // is ~320 units up). On a slow connection it shows still meanwhile.
        const motionsFile = (gltf.asset.extras as { motions?: unknown } | undefined)?.motions;
        const motions: Promise<MotionClip[]> = holding
          ? fetchHunterClips(holding, abort.signal).catch(() => [])
          : wearing
            ? fetchHunterIdle("idle", abort.signal).catch(() => [])
            : typeof motionsFile === "string" && !pair
              ? fetchMotions(new URL(motionsFile, new URL(src, location.href)).href, abort.signal)
                  // The model still shows, just still.
                  .catch(() => [])
              : Promise.resolve([]);
        const idle = standIn
          ? fetchHunterIdle("idle", abort.signal).catch(() => [])
          : Promise.resolve([]);
        const early = await Promise.race([
          motions,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), MOTIONS_WAIT_MS)),
        ]);
        if (disposed) return;
        if (early === null) show();
        const [loaded, standInIdle] = await Promise.all([early ?? motions, idle]);
        if (disposed) return;
        if (standIn && standInIdle.length > 0) {
          const animated = animate3d(THREE, boneScaling, standIn, standInIdle);
          standInMixer = animated.mixer;
          standInPose = animated.pose;
          standInMixer.clipAction(animated.clips[0]!).play();
          standInMixer.update(0);
          standInPose?.update();
        }

        if (loaded.length > 0) {
          const root = model;
          const animated = animate3d(THREE, boneScaling, root, loaded);
          const { sources, clips, toClip } = animated;
          mixer = animated.mixer;
          pose = animated.pose;
          // Each action plays once and stops on its last frame; the
          // "finished" handler below restarts it where the game would.
          const actions = clips.map((clip) => mixer!.clipAction(clip).setLoop(THREE.LoopOnce, 1));
          for (const action of actions) action.clampWhenFinished = true;
          // A head or tail motion (Rathian's 20-28) is one the game plays
          // over the rest of the body's motion: the first whole-body one
          // (standing, for most monsters) plays on the other bones meanwhile,
          // looping on its own.
          const base = sources.find((clip) => !clip.bones);
          const under = sources.map((clip) => {
            const rest = base && underneath(clip, base);
            return rest ? mixer!.clipAction(toClip(rest, `Motion ${clip.slot} under`)) : null;
          });

          // The ground: the lowest the first motion (standing, for most
          // monsters) reaches. Its height differs between models (Rathian
          // stands ~290 units below her origin, most monsters near it).
          const first = actions[0]!;
          first.play();
          let floor = Infinity;
          const sample = new THREE.Box3();
          for (let i = 0; i < GROUND_SAMPLES; i++) {
            first.time = (i / GROUND_SAMPLES) * clips[0]!.duration;
            mixer.update(0);
            pose?.update();
            floor = Math.min(floor, bounds(sample).min.y);
          }
          first.stop();

          const state = { index: 0, playing: true };
          now = () => {
            const clip = sources[state.index];
            const action = actions[state.index];
            return clip && action ? { slot: clip.slot, frame: action.time * MOTION_FPS } : null;
          };
          // A looping motion goes on from its loop start, as in the game, so
          // its lead-in plays once; any other replays from the start.
          mixer.addEventListener("finished", ({ action }) => {
            const clip = sources[actions.indexOf(action)];
            if (!clip) return;
            action.time = clip.loop ? clip.loopStart : 0;
            action.paused = !state.playing;
          });
          const apply = () => {
            const action = actions[state.index]!;
            placeWeapon?.((sources[state.index] as HunterClip | undefined)?.sheathed === true);
            for (const playing of [action, under[state.index]]) {
              if (!playing) continue;
              if (!playing.isRunning() && !playing.paused) playing.play();
              playing.paused = !state.playing;
            }
            setMotion({
              count: actions.length,
              index: state.index,
              slot: sources[state.index]!.slot,
              playing: state.playing,
              motions: sources.some((clip) => (clip as HunterClip).motion)
                ? sources.map((clip) => (clip as HunterClip).motion)
                : undefined,
            });
          };
          playerRef.current = {
            select: (index) => {
              actions[state.index]!.stop();
              under[state.index]?.stop();
              state.index = (index + actions.length) % actions.length;
              apply();
            },
            setPlaying: (playing) => {
              state.playing = playing;
              apply();
            },
          };
          apply();
          mixer.update(0);
          pose?.update();
          placeStandIn(Number.isFinite(floor) ? floor : undefined);
          measure();
          // Frame the first motion's pose, unless the visitor has moved the camera.
          if (!interacted) fit?.();

          // A patch of ground under the model, lit at the rim and shaded in
          // the middle, so a motion that rises or sinks reads as one; the
          // camera stays put meanwhile.
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const context = canvas.getContext("2d");
          if (context && Number.isFinite(floor)) {
            const paint = (stops: [number, string][]) => {
              const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
              for (const [at, color] of stops) gradient.addColorStop(at, color);
              context.fillStyle = gradient;
              context.fillRect(0, 0, 256, 256);
            };
            paint([
              [0, "rgba(255, 255, 255, 0.14)"],
              [0.7, "rgba(255, 255, 255, 0.08)"],
              [1, "rgba(255, 255, 255, 0)"],
            ]);
            paint([
              [0, "rgba(0, 0, 0, 0.6)"],
              [0.35, "rgba(0, 0, 0, 0.35)"],
              [0.55, "rgba(0, 0, 0, 0)"],
            ]);
            const map = new THREE.CanvasTexture(canvas);
            map.colorSpace = THREE.SRGBColorSpace;
            ground = new THREE.Mesh(
              new THREE.PlaneGeometry(1, 1),
              new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
            );
            const size = box.getSize(new THREE.Vector3());
            ground.scale.setScalar(Math.max(size.x, size.z) * GROUND_SCALE);
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(center.x, floor, center.z);
            scene.add(ground);
          }
        } else if (standIn) {
          // The hunter is posed now; the model stands as it was.
          placeStandIn();
          measure();
          if (!interacted) fit?.();
        }
        show();
      } catch {
        if (!disposed) setStatus("error");
      }
    })().catch(() => {
      if (!disposed) setStatus("error");
    });

    return () => {
      disposed = true;
      cleanup();
    };
    // `wear` is compared by its fields: callers pass a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, pair, hunter, partsKey, wear?.slot, wear?.sex, sizeHunter]);

  // The size hunter shows or hides where it stands.
  useEffect(() => {
    const standIn = sceneRef.current?.sizeHunter;
    if (status === "ready" && standIn) standIn.visible = showSizeHunter;
  }, [status, showSizeHunter]);

  // A new look goes on the hunter already shown.
  useEffect(() => {
    if (status !== "ready" || !look) return;
    void sceneRef.current?.relook?.(look);
    // `look` is compared by its fields, as `wear` is above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lookKey]);

  // Capsules live in their own group, rebuilt when they change; there are
  // few (Rathian has 32), so rebuilding is cheaper than diffing.
  useEffect(() => {
    const target = sceneRef.current;
    const container = containerRef.current;
    if (status !== "ready" || !target || !container || !capsules?.length) return;
    const { THREE, scene, mount } = target;
    const meshes: import("three").Mesh[] = [];
    for (const capsule of capsules) {
      if (capsule.opacity <= 0) continue;
      const mesh = capsuleMesh(
        THREE,
        capsule,
        resolveColor(container, capsule.color),
        capsule.opacity,
      );
      const mounted = mount(capsule.start, capsule.end, capsule.radius);
      if (mounted) mountMesh(mesh, mounted);
      else scene.add(mesh);
      meshes.push(mesh);
    }
    return () => {
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        (mesh.material as import("three").Material).dispose();
      }
    };
  }, [capsules, status]);

  // Attack capsules are all built up front, hidden, and shown each frame
  // while the motion playing is within an attack's frames.
  useEffect(() => {
    const target = sceneRef.current;
    const container = containerRef.current;
    if (status !== "ready" || !target || !container || !attacks?.length) return;
    const { THREE, jointMount, frameHooks, now } = target;
    const color = resolveColor(container, "var(--color-attack)");
    const shown = attacks.map((attack) => ({
      attack,
      meshes: attack.capsules.flatMap((capsule) => {
        const mounted = jointMount(capsule.joint);
        if (!mounted) return [];
        const mesh = capsuleMesh(THREE, capsule, color, ATTACK_OPACITY);
        mesh.visible = false;
        mountMesh(mesh, mounted);
        return [mesh];
      }),
    }));
    const update = () => {
      const at = now();
      for (const { attack, meshes } of shown) {
        const active =
          at !== null && at.slot === attack.slot && at.frame >= attack.from && at.frame < attack.to;
        for (const mesh of meshes) mesh.visible = active;
      }
    };
    frameHooks.add(update);
    return () => {
      frameHooks.delete(update);
      for (const { meshes } of shown)
        for (const mesh of meshes) {
          mesh.removeFromParent();
          mesh.geometry.dispose();
          (mesh.material as import("three").Material).dispose();
        }
    };
  }, [attacks, status]);

  const attackSlots = new Set(attacks?.map((attack) => attack.slot));
  const unused = motion !== null && (unusedMotions?.includes(motion.slot) ?? false);

  const playWidth = Math.max(t.equipment.model.play.length, t.equipment.model.pause.length);

  return (
    <div className="relative h-full min-h-48 w-full">
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label={t.equipment.model.label(label)}
      />
      {status === "loading" && (
        <Loading className="absolute inset-0 justify-center opacity-70">
          {t.equipment.model.loading}
        </Loading>
      )}
      {motion && (
        <div
          role="group"
          aria-label={t.equipment.model.motions}
          className={cn(
            modelPanel,
            "absolute right-2 bottom-2 z-10 flex items-center gap-[0.8rem]",
          )}
        >
          <button
            type="button"
            className={panelButton}
            aria-label={t.equipment.model.previousMotion}
            onClick={() => playerRef.current?.select(motion.index - 1)}
          >
            ‹
          </button>
          {motion.motions ? (
            <select
              aria-label={t.equipment.model.motion}
              className="cursor-pointer bg-transparent tracking-game"
              value={motion.index}
              onChange={(event) => playerRef.current?.select(Number(event.target.value))}
            >
              {motion.motions.map((m, index) => (
                <option key={index} value={index} className="bg-black">
                  {motionLabel(t, m)}
                </option>
              ))}
            </select>
          ) : (
            <span
              className="tabular-nums"
              aria-live="polite"
              title={unused ? t.equipment.model.unusedMotionHint : undefined}
            >
              {t.equipment.model.motion}{" "}
              {/* As wide as the largest number, so the panel keeps its size. */}
              <span
                className={cn(
                  "inline-block text-right",
                  // An unused motion greys out, whether or not it would hit.
                  unused ? "text-unavailable" : attackSlots.has(motion.slot) && "text-negative",
                )}
                style={{ width: `calc(var(--cell) * ${String(motion.count).length})` }}
              >
                {motion.index + 1}
              </span>
              /{motion.count}
              {attackSlots.has(motion.slot) && (
                <span className="sr-only"> {t.equipment.model.attackMotion}</span>
              )}
              {unused && <span className="sr-only"> {t.equipment.model.unusedMotion}</span>}
            </span>
          )}
          <button
            type="button"
            className={panelButton}
            aria-label={t.equipment.model.nextMotion}
            onClick={() => playerRef.current?.select(motion.index + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className={cn(panelButton, "text-left")}
            // As wide as the longer word, so the panel keeps its size.
            style={{ width: `calc(var(--cell) * ${playWidth})` }}
            onClick={() => playerRef.current?.setPlaying(!motion.playing)}
          >
            {motion.playing ? t.equipment.model.pause : t.equipment.model.play}
          </button>
        </div>
      )}
      {status === "error" && (
        <p className="absolute inset-0 flex items-center justify-center text-center opacity-70">
          {t.equipment.model.unavailable}
        </p>
      )}
    </div>
  );
}
