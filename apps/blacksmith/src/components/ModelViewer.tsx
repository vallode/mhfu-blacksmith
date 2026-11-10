"use client";

import { useEffect, useRef, useState } from "react";
import Loading from "@/components/Loading";
import { cn } from "@/lib/cn";
import { fetchMotions, inPlace, type MotionClip } from "@/lib/motions";
import { modelPanel } from "@/styles/model";

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
}

type Three = typeof import("three");

/** Resolves a `var(--name)` colour against `element`; other colours pass through. */
function resolveColor(element: Element, color: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(color);
  return match ? getComputedStyle(element).getPropertyValue(match[1]!).trim() : color;
}

/** Angle of each blade of a pair from the centre line. */
const PAIR_OFFSET = (32 * Math.PI) / 180;

type Status = "loading" | "ready" | "error";

/** The model's motions, once loaded (monsters only; see src/lib/motions.ts). */
interface MotionState {
  count: number;
  index: number;
  playing: boolean;
}

/** Drives the loaded motions from React; set while a model with motions shows. */
interface MotionPlayer {
  select: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  /** Hold the bind pose (while hitboxes show: they're placed on it). */
  hold: (hold: boolean) => void;
}

const panelButton =
  "cursor-pointer tracking-game text-parchment hover:text-white focus-visible:text-white";

/**
 * Interactive 3D view of a .glb model: drag to rotate, scroll/pinch to zoom.
 * three.js is imported on demand so it only loads on pages that show a model.
 */
export default function ModelViewer({ src, label, pair = false, capsules }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  /** Set while a model is shown, for the capsule effect below. */
  const sceneRef = useRef<{ THREE: Three; scene: import("three").Scene } | null>(null);
  const [motion, setMotion] = useState<MotionState | null>(null);
  const playerRef = useRef<MotionPlayer | null>(null);
  /** Whether the model must hold its bind pose (hitboxes show); read when motions load. */
  const holdRef = useRef(false);

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
        controls.update();
        renderer.render(scene, camera);
      };

      let model: import("three").Object3D | null = null;
      cleanup = () => {
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
        renderer.dispose();
        renderer.domElement.remove();
      };

      try {
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(src);
        if (disposed) return;
        model = gltf.scene;
        if (pair) {
          // Weapon models hold the grip at the origin with the blade along +Z,
          // flat in the XZ plane: turn each copy PAIR_OFFSET about Y, and
          // mirror the second across X so it's the left-hand blade.
          const second = model.clone();
          model.rotation.y = PAIR_OFFSET;
          second.rotation.y = -PAIR_OFFSET;
          second.scale.x = -1;
          scene.add(model, second);
        } else {
          scene.add(model);
        }

        // A skinned model moves away from its bind pose, which is all that
        // three.js's culling bounds cover.
        model.traverse((object) => {
          if ((object as import("three").SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
        });

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
        const measure = () => {
          // A skinned mesh comes before its bones in the scene, so their
          // world matrices must be current before the box reads them.
          scene.updateMatrixWorld(true);
          box.setFromObject(scene, true);
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

        // Motions come after the model, from the file its GLB names. The
        // model shows once they're in, already posed and framed: its first
        // pose can stand far from the bind pose (Rathian's is ~320 units up).
        const motionsFile = (gltf.asset.extras as { motions?: unknown } | undefined)?.motions;
        let loaded: MotionClip[] = [];
        if (typeof motionsFile === "string" && !pair) {
          try {
            loaded = await fetchMotions(new URL(motionsFile, new URL(src, location.href)).href);
          } catch {
            // The model still shows, just still.
          }
          if (disposed) return;
        }
        if (loaded.length > 0) {
          const root = model;
          const node = (bone: number) => root.getObjectByName(`bone_${bone}`);
          const parentOf = (bone: number) => {
            const match = /^bone_(\d+)$/.exec(node(bone)?.parent?.name ?? "");
            return match ? Number(match[1]) : -1;
          };
          const bind = (bone: number) =>
            (node(bone)?.position.toArray() ?? [0, 0, 0]) as [number, number, number];
          const clips = loaded.map((source) => {
            const clip = inPlace(source, parentOf, bind);
            return new THREE.AnimationClip(
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
            );
          });
          mixer = new THREE.AnimationMixer(root);
          const actions = clips.map((clip) => mixer!.clipAction(clip));
          const state = { index: 0, playing: true, hold: holdRef.current };
          const apply = () => {
            const action = actions[state.index]!;
            if (state.hold)
              action.stop(); // back to the bind pose
            else if (!action.isRunning() && !action.paused) action.play();
            action.paused = !state.playing;
            setMotion({ count: actions.length, index: state.index, playing: state.playing });
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
            hold: (hold) => {
              state.hold = hold;
              apply();
              reframe();
            },
          };
          // Frame the pose the model takes (the first motion's, or the bind
          // pose under hitboxes), unless the visitor has moved the camera.
          const reframe = () => {
            if (interacted) return;
            mixer!.update(0);
            measure();
            fit?.();
          };
          apply();
          reframe();
        }

        sceneRef.current = { THREE, scene };
        setStatus("ready");
        animate();
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
  }, [src, pair]);

  // Hitboxes are placed on the bind pose, so the model holds it while they show.
  const holding = !!capsules?.some((capsule) => capsule.opacity > 0);
  const hasMotion = motion !== null;
  useEffect(() => {
    holdRef.current = holding;
    if (hasMotion) playerRef.current?.hold(holding);
  }, [holding, hasMotion]);

  // Capsules live in their own group, rebuilt when they change; there are
  // few (Rathian has 32), so rebuilding is cheaper than diffing.
  useEffect(() => {
    const target = sceneRef.current;
    const container = containerRef.current;
    if (status !== "ready" || !target || !container || !capsules?.length) return;
    const { THREE, scene } = target;
    const group = new THREE.Group();
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
      group.add(mesh);
    }
    scene.add(group);
    return () => {
      scene.remove(group);
      group.traverse((object) => {
        const mesh = object as import("three").Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as import("three").Material).dispose();
      });
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
      {motion && !holding && (
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
          <span className="tabular-nums" aria-live="polite">
            Motion {motion.index + 1}/{motion.count}
          </span>
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
            aria-pressed={!motion.playing}
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
