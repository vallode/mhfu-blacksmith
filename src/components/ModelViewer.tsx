"use client";

import { useEffect, useRef, useState } from "react";
import Loading from "@/components/Loading";

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
}

/** Angle of each blade of a pair from the centre line. */
const PAIR_OFFSET = (34.5 * Math.PI) / 180;

type Status = "loading" | "ready" | "error";

/**
 * Interactive 3D view of a .glb model: drag to rotate, scroll/pinch to zoom.
 * three.js is imported on demand so it only loads on pages that show a model.
 */
export default function ModelViewer({ src, label, pair = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};
    setStatus("loading");

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      // Models are meshopt-compressed (EXT_meshopt_compression; see tools/mhfu-extract).
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
      const animate = () => {
        frame = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };

      let model: import("three").Object3D | null = null;
      cleanup = () => {
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

        // Frame the model for a turntable, viewed from slightly above (see fit).
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const radius = size.length() / 2;
        // Fit by projection: the closest camera distance at which every corner
        // of the bounding box stays inside the frame (with a small margin)
        // from all around the turntable, at the current viewing elevation.
        // Exact for any shape and aspect ratio, unlike a bounding sphere.
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
          (i) =>
            new THREE.Vector3(
              i & 1 ? box.max.x : box.min.x,
              i & 2 ? box.max.y : box.min.y,
              i & 4 ? box.max.z : box.min.z,
            ),
        );
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
      {status === "error" && (
        <p className="absolute inset-0 flex items-center justify-center text-center opacity-70">
          Model unavailable.
        </p>
      )}
    </div>
  );
}
