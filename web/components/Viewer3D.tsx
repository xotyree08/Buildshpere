"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { FinishSelections } from "@/lib/catalog/materials";
import { buildScene3D } from "@/lib/render/scene3d";
import type { HomeStyle, ParametricModel } from "@/lib/types";

/**
 * The interactive 3D viewer (BS-MOD-001): drag to orbit, scroll to zoom,
 * right-drag to pan. Pure consumer of the deterministic scene3d builder —
 * all geometry decisions live in the engine, not here.
 */
export function Viewer3D({
  model,
  style,
  finishes,
}: {
  model: ParametricModel;
  style?: HomeStyle;
  finishes?: FinishSelections;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene3d = buildScene3D(model, style, finishes);
    const { cx, cz, w, d, h } = scene3d.bounds;
    const radius = Math.max(w, d, h);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdcebf5);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, radius * 20);
    camera.position.set(cx - radius * 0.9, h + radius * 0.6, cz - radius * 1.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, h / 2.5, cz);
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // never dive below grade
    controls.minDistance = radius * 0.3;
    controls.maxDistance = radius * 5;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f7a, 0.95));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
    sun.position.set(cx - radius, radius * 1.4, cz - radius * 0.6);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 6, 48),
      new THREE.MeshLambertMaterial({ color: 0x9dbb7e }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.05, cz);
    scene.add(ground);

    const disposables: { dispose(): void }[] = [ground.geometry, ground.material];

    for (const box of scene3d.boxes) {
      const geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
      const material = new THREE.MeshLambertMaterial({
        color: box.color,
        transparent: box.kind === "window",
        opacity: box.kind === "window" ? 0.75 : 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(box.x + box.w / 2, box.y + box.h / 2, box.z + box.d / 2);
      scene.add(mesh);
      disposables.push(geometry, material);
    }

    for (const roof of scene3d.roofs) {
      const positions: number[] = [];
      for (const face of roof.faces) {
        for (let i = 1; i + 1 < face.length; i++) {
          for (const idx of [face[0], face[i], face[i + 1]]) {
            positions.push(...roof.vertices[idx]);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({ color: roof.color, side: THREE.DoubleSide });
      scene.add(new THREE.Mesh(geometry, material));
      disposables.push(geometry, material);
    }

    let frame = 0;
    const renderLoop = () => {
      frame = requestAnimationFrame(renderLoop);
      controls.update();
      renderer.render(scene, camera);
    };

    const resize = () => {
      const width = mount.clientWidth;
      const height = Math.max(280, Math.round(width * 0.62));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    renderLoop();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [model, style, finishes]);

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", borderRadius: 8, overflow: "hidden" }} />
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
        Drag to orbit · scroll to zoom · right-drag to pan. Massing-level 3D — photorealistic
        rendering arrives with the ModelSphere pipeline.
      </p>
    </div>
  );
}
