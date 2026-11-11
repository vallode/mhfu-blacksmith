"use client";

import { useEffect, useRef, useState } from "react";
import Loading from "@/components/Loading";
import { capsuleBone } from "@/lib/capsule-bone";
import { cn } from "@/lib/cn";
import {
  fetchHunterClips,
  HUNTER_MODEL,
  WEAPON_MOUNTS,
  type HunterClip,
  type WeaponMount,
} from "@/lib/hunter";
import { fetchMotions, inPlace, type MotionClip } from "@/lib/motions";
import { modelPanel, modelPanelButton } from "@/styles/model";

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

interface Props {
  /** URL of a .glb file. */
  src: string;
  /** Accessible description, e.g. the monster's name. */
  label: string;
  /**
   * Show the model twice, fanned out from the grip and mirrored, as the game
   * shows a pair of dual blades (each blade's file holds only one).
   */
  pair?: boolean;
  /** Translucent capsules over the model, e.g. a monster's hitboxes. */
  capsules?: ModelCapsule[];
  /** Show `src` (a weapon) in the hands of the hunter, playing this weapon type's motions. */
  hunter?: string;
}

type Three = typeof import("three");

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

/** What the capsule effect needs of a shown model. */
interface SceneHandle {
  THREE: Three;
  scene: import("three").Scene;
  /** The bone a capsule (in the bind pose) rides on; null for an unskinned model. */
  mount: (
    start: ModelCapsule["start"],
    end: ModelCapsule["end"],
    radius: number,
  ) => CapsuleMount | null;
}

/** Angle of each blade of a pair from the centre line. */
const PAIR_OFFSET = (32 * Math.PI) / 180;

type Status = "loading" | "ready" | "error";

/** How long a model waits for its motions before showing still (see the effect). */
const MOTIONS_WAIT_MS = 1500;
/**
 * A two-handed weapon goes to its holding hand (`WeaponMount.hold`) while the
 * other fist is within GRIP_ON of the handle line, and back by GRIP_OFF. The
 * fist can slide GRIP_SLIDE along the handle and still count as on it.
 */
const GRIP_ON = 8;
const GRIP_OFF = 16;
const GRIP_SLIDE = 20;

/** Poses of the first motion sampled for the ground's height. */
const GROUND_SAMPLES = 8;
/** The ground shadow's width, against the model's widest side. */
const GROUND_SCALE = 1.4;

/** The model's motions, once loaded (monsters only; see src/lib/motions.ts). */
interface MotionState {
  count: number;
  index: number;
  playing: boolean;
  /** Each clip's name, when they have them (the hunter's). */
  labels?: string[];
}

/** Drives the loaded motions from React; set while a model with motions shows. */
interface MotionPlayer {
  select: (index: number) => void;
  setPlaying: (playing: boolean) => void;
}

const panelButton = cn(modelPanelButton, "text-parchment");

/**
 * Interactive 3D view of a .glb model: drag to rotate, scroll/pinch to zoom.
 * three.js is imported on demand so it only loads on pages that show a model.
 */
export default function ModelViewer({ src, label, pair = false, capsules, hunter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  /** Set while a model is shown, for the capsule effect below. */
  const sceneRef = useRef<SceneHandle | null>(null);
  const [motion, setMotion] = useState<MotionState | null>(null);
  const playerRef = useRef<MotionPlayer | null>(null);

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
      const animate = () => {
        frame = requestAnimationFrame(animate);
        mixer?.update(clock.getDelta());
        holdWeapon?.();
        controls.update();
        renderer.render(scene, camera);
      };

      let model: import("three").Object3D | null = null;
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
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        model?.traverse((object) => {
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
        const gltf = await loader.loadAsync(hunter ? HUNTER_MODEL : src);
        const weapon = hunter ? (await loader.loadAsync(src)).scene : null;
        if (disposed) return;
        model = gltf.scene;
        const copies = [model];
        if (weapon) {
          scene.add(model);
          // A two-piece weapon's nodes are part_0, part_1; a whole one is one mesh.
          const named = weapon.children.filter((child) => child.name.startsWith("part_"));
          const parts = named.length > 0 ? named : [weapon.children[0]!];
          const mounts = WEAPON_MOUNTS[hunter!];
          const body = model;
          type Held = {
            part: import("three").Object3D;
            bone: import("three").Object3D;
            holder: import("three").Object3D;
            mount: WeaponMount & { hold: NonNullable<WeaponMount["hold"]> };
          };
          let held: Held[] = [];
          placeWeapon = (sheathed) => {
            const plan = mounts && (sheathed ? mounts.sheathed : mounts.drawn);
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
            body.updateMatrixWorld(true);
            for (const { part, bone, holder, mount } of held) {
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
          // flat in the XZ plane: turn each copy PAIR_OFFSET about Y, and
          // mirror the second across X so it's the left-hand blade.
          const second = model.clone();
          model.rotation.y = PAIR_OFFSET;
          second.rotation.y = -PAIR_OFFSET;
          second.scale.x = -1;
          copies.push(second);
          scene.add(model, second);
        } else {
          scene.add(model);
        }

        // A skinned model moves away from its bind pose, which is all that
        // three.js's culling bounds cover.
        model.traverse((object) => {
          if ((object as import("three").SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
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
        /** Bounds of the model as posed, leaving out the capsules on its bones. */
        const bounds = (target: import("three").Box3) => {
          // A skinned mesh comes before its bones in the scene, so their
          // world matrices must be current before the box reads them.
          scene.updateMatrixWorld(true);
          target.makeEmpty();
          for (const object of copies)
            object.traverse((child) => {
              if ((child as import("three").Mesh).isMesh && !child.userData.overlay)
                target.expandByObject(child, true);
            });
          return target;
        };
        const measure = () => {
          bounds(box);
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
          sceneRef.current = { THREE, scene, mount };
          setStatus("ready");
          animate();
        };

        // Motions come after the model, from the file its GLB names. The
        // model waits a moment for them, so it first shows already posed and
        // framed: its first pose can stand far from the bind pose (Rathian's
        // is ~320 units up). On a slow connection it shows still meanwhile.
        const motionsFile = (gltf.asset.extras as { motions?: unknown } | undefined)?.motions;
        const motions: Promise<MotionClip[]> = hunter
          ? fetchHunterClips(hunter, abort.signal).catch(() => [])
          : typeof motionsFile === "string" && !pair
            ? fetchMotions(new URL(motionsFile, new URL(src, location.href)).href, abort.signal)
                // The model still shows, just still.
                .catch(() => [])
            : Promise.resolve([]);
        const early = await Promise.race([
          motions,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), MOTIONS_WAIT_MS)),
        ]);
        if (disposed) return;
        if (early === null) show();
        const loaded = early ?? (await motions);
        if (disposed) return;

        if (loaded.length > 0) {
          const root = model;
          const node = (bone: number) => root.getObjectByName(`bone_${bone}`);
          const parentOf = (bone: number) => {
            const match = /^bone_(\d+)$/.exec(node(bone)?.parent?.name ?? "");
            return match ? Number(match[1]) : -1;
          };
          const bind = (bone: number) =>
            (node(bone)?.position.toArray() ?? [0, 0, 0]) as [number, number, number];
          const sources = loaded.map((source) => inPlace(source, parentOf, bind));
          const clips = sources.map(
            (clip) =>
              new THREE.AnimationClip(
                `Motion ${clip.slot}`,
                clip.duration,
                clip.tracks.map((track) => {
                  const name = `bone_${track.bone}`;
                  if (track.path === "rotation")
                    return new THREE.QuaternionKeyframeTrack(
                      `${name}.quaternion`,
                      track.times,
                      track.values,
                    );
                  const property = track.path === "translation" ? "position" : "scale";
                  return new THREE.VectorKeyframeTrack(
                    `${name}.${property}`,
                    track.times,
                    track.values,
                  );
                }),
              ),
          );
          mixer = new THREE.AnimationMixer(root);
          // Each action plays once and stops on its last frame; the
          // "finished" handler below restarts it where the game would.
          const actions = clips.map((clip) => mixer!.clipAction(clip).setLoop(THREE.LoopOnce, 1));
          for (const action of actions) action.clampWhenFinished = true;

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
            floor = Math.min(floor, bounds(sample).min.y);
          }
          first.stop();

          const state = { index: 0, playing: true };
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
            if (!action.isRunning() && !action.paused) action.play();
            action.paused = !state.playing;
            setMotion({
              count: actions.length,
              index: state.index,
              playing: state.playing,
              labels: sources.some((clip) => (clip as HunterClip).label)
                ? sources.map((clip) => (clip as HunterClip).label)
                : undefined,
            });
          };
          playerRef.current = {
            select: (index) => {
              actions[state.index]!.stop();
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
  }, [src, pair, hunter]);

  // Capsules live in their own group, rebuilt when they change; there are
  // few (Rathian has 32), so rebuilding is cheaper than diffing.
  useEffect(() => {
    const target = sceneRef.current;
    const container = containerRef.current;
    if (status !== "ready" || !target || !container || !capsules?.length) return;
    const { THREE, scene, mount } = target;
    const meshes: import("three").Mesh[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const capsule of capsules) {
      if (capsule.opacity <= 0) continue;
      const start = new THREE.Vector3(...capsule.start);
      const end = new THREE.Vector3(...capsule.end);
      const length = start.distanceTo(end);
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(capsule.radius, length, 8, 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(resolveColor(container, capsule.color)),
          transparent: true,
          opacity: capsule.opacity,
          // Drawn after the model and not hidden by it, so capsules inside
          // the body still show; not writing depth keeps overlaps visible.
          depthTest: false,
          depthWrite: false,
        }),
      );
      mesh.position.copy(start).lerp(end, 0.5);
      if (length > 0) mesh.quaternion.setFromUnitVectors(up, end.clone().sub(start).normalize());
      mesh.renderOrder = 1;
      mesh.userData.overlay = true;
      // On its bone, at the same place while the bone holds its bind pose.
      const mounted = mount(capsule.start, capsule.end, capsule.radius);
      if (mounted) {
        mesh.updateMatrix();
        mesh.matrix.premultiply(mounted.inverse);
        mesh.matrixAutoUpdate = false;
        mounted.parent.add(mesh);
      } else {
        scene.add(mesh);
      }
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

  return (
    <div className="relative h-full min-h-48 w-full">
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label={`3D model of ${label}`}
      />
      {status === "loading" && (
        <Loading className="absolute inset-0 justify-center opacity-70">Loading model…</Loading>
      )}
      {motion && (
        <div
          role="group"
          aria-label="Motions"
          className={cn(
            modelPanel,
            "absolute right-2 bottom-2 z-10 flex items-center gap-[0.8rem]",
          )}
        >
          <button
            type="button"
            className={panelButton}
            aria-label="Previous motion"
            onClick={() => playerRef.current?.select(motion.index - 1)}
          >
            ‹
          </button>
          {motion.labels ? (
            <select
              aria-label="Motion"
              className="cursor-pointer bg-transparent tracking-game"
              value={motion.index}
              onChange={(event) => playerRef.current?.select(Number(event.target.value))}
            >
              {motion.labels.map((name, index) => (
                <option key={index} value={index} className="bg-black">
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <span className="tabular-nums" aria-live="polite">
              Motion {/* As wide as the largest number, so the panel keeps its size. */}
              <span
                className="inline-block text-right"
                style={{ width: `calc(var(--cell) * ${String(motion.count).length})` }}
              >
                {motion.index + 1}
              </span>
              /{motion.count}
            </span>
          )}
          <button
            type="button"
            className={panelButton}
            aria-label="Next motion"
            onClick={() => playerRef.current?.select(motion.index + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className={cn(panelButton, "w-cells-5 text-left")}
            onClick={() => playerRef.current?.setPlaying(!motion.playing)}
          >
            {motion.playing ? "Pause" : "Play"}
          </button>
        </div>
      )}
      {status === "error" && (
        <p className="absolute inset-0 flex items-center justify-center text-center opacity-70">
          Model unavailable.
        </p>
      )}
    </div>
  );
}
