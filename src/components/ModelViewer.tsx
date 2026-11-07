"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** URL of a .glb file. */
  src: string;
  /** Accessible description, e.g. the monster's name. */
  label: string;
}

type Status = "loading" | "ready" | "error";

/**
 * Interactive 3D view of a .glb model: drag to rotate, scroll/pinch to zoom.
 * three.js is imported on demand so it only loads on pages that show a model.
 */
export default function ModelViewer({ src, label }: Props) {
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
      });

      const resize = () => {
        const { clientWidth, clientHeight } = container;
        if (!clientWidth || !clientHeight) return;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
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
        const gltf = await new GLTFLoader().loadAsync(src);
        if (disposed) return;
        model = gltf.scene;
        scene.add(model);

        // Frame the model for a turntable: fit its horizontal reach (any side
        // can face the camera while it spins) and its height, then view from
        // slightly above. A bounding sphere leaves flat models like a
        // wyvern with spread wings far too small.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const reach = Math.hypot(size.x, size.z) / 2;
        const radius = size.length() / 2;
        const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const horizontal = vertical * camera.aspect;
        const distance = 1.1 * Math.max(reach / horizontal, size.y / 2 / vertical) + reach * 0.3;
        const direction = new THREE.Vector3(1, 0.35, 1).normalize();
        camera.position.copy(center).addScaledVector(direction, distance);
        camera.near = distance / 100;
        camera.far = distance * 10;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.minDistance = radius * 0.5;
        controls.maxDistance = distance * 3;
        controls.update();

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
  }, [src]);

  return (
    <div className="relative w-full" style={{ aspectRatio: "4 / 3", maxHeight: "24rem" }}>
      <div ref={containerRef} className="absolute inset-0" role="img" aria-label={`3D model of ${label}`} />
      {status !== "ready" && (
        <p className="absolute inset-0 flex items-center justify-center text-center opacity-70">
          {status === "loading" ? "Loading model…" : "Model unavailable."}
        </p>
      )}
    </div>
  );
}
