"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import type { FinishSelections } from "@/lib/catalog/materials";
import { exteriorPalette } from "@/lib/render/palette";
import { buildScene3D, type Box3 } from "@/lib/render/scene3d";
import type { HomeStyle, ParametricModel } from "@/lib/types";
import { concreteTexture, grassTexture, roofTextureFor, TILE_FT, wallTextureFor } from "./textures3d";

/**
 * The interactive 3D viewer (BS-MOD-001), real-time edition: PBR
 * materials with procedural textures, an atmospheric sky driving
 * image-based lighting, soft sun shadows, and the deterministic
 * landscaping from the scene builder. Still a pure consumer of scene3d —
 * every geometry decision lives in the engine.
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
    const palette = exteriorPalette(finishes);
    const { cx, cz, w, d, h } = scene3d.bounds;
    const radius = Math.max(w, d, h);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // Software rasterizers (SwiftShader/llvmpipe) mis-render the PMREM
    // half-float pipeline and every environment-lit material goes black —
    // detect them and rely on analytic lights there instead.
    const gl = renderer.getContext();
    const dbgInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const glRenderer = dbgInfo ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : "";
    const softwareGL = /swiftshader|llvmpipe|software/i.test(glRenderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xdce9f2, radius * 6, radius * 14);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, radius * 30);
    camera.position.set(cx - radius * 0.85, h * 0.5 + radius * 0.45, cz - radius * 1.15);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, h / 2.8, cz);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = radius * 0.3;
    controls.maxDistance = radius * 6;

    // Sky + image-based lighting, guarded: software WebGL (and some old
    // GPUs) can fail the PMREM/half-float path — fall back to a plain sky
    // color and hemisphere-only ambience rather than a black scene.
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(-140));
    scene.background = new THREE.Color(0xcfe3f2);
    let sky: Sky | null = null;
    let envSky: Sky | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    let envMap: THREE.Texture | null = null;
    try {
      sky = new Sky();
      sky.scale.setScalar(radius * 25);
      sky.position.set(cx, 0, cz);
      sky.material.uniforms.turbidity.value = 6;
      sky.material.uniforms.rayleigh.value = 1.6;
      sky.material.uniforms.mieCoefficient.value = 0.004;
      sky.material.uniforms.sunPosition.value.copy(sunDir);
      scene.add(sky);

      pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envSky = new Sky();
      envSky.scale.setScalar(1000);
      envSky.material.uniforms.turbidity.value = 6;
      envSky.material.uniforms.rayleigh.value = 1.6;
      envSky.material.uniforms.sunPosition.value.copy(sunDir);
      envScene.add(envSky);
      envMap = pmrem.fromScene(envScene, 0.02).texture;
      if (!softwareGL) scene.environment = envMap;
    } catch {
      if (sky) scene.remove(sky);
      sky = null;
      scene.environment = null;
    }

    const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    sun.position.copy(sunDir).multiplyScalar(radius * 2.2).add(new THREE.Vector3(cx, 0, cz));
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = radius * 1.6;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = radius * 8;
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xcfe4f5, 0x6a7a55, 0.9));

    const disposables: { dispose(): void }[] = [];
    if (pmrem) disposables.push(pmrem);
    if (envMap) disposables.push(envMap);
    const track = <T extends { dispose(): void }>(x: T): T => {
      disposables.push(x);
      return x;
    };

    // Ground: textured lawn.
    const grass = track(grassTexture());
    grass.repeat.set(radius / 2, radius / 2);
    const ground = new THREE.Mesh(
      track(new THREE.CircleGeometry(radius * 8, 48)),
      track(new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.06, cz);
    ground.receiveShadow = true;
    scene.add(ground);

    // Shared materials.
    const wallTex = track(wallTextureFor(palette));
    const roofTex = track(roofTextureFor(palette));
    const driveTex = track(concreteTexture("#a8a49c"));
    const glassMat = track(
      new THREE.MeshStandardMaterial({ color: 0xbfd9e8, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.62, envMapIntensity: 1.6 }),
    );
    const plainMats = new Map<string, THREE.MeshStandardMaterial>();
    const plain = (color: string, roughness = 0.85) => {
      const key = `${color}-${roughness}`;
      if (!plainMats.has(key)) plainMats.set(key, track(new THREE.MeshStandardMaterial({ color, roughness })));
      return plainMats.get(key)!;
    };

    const materialFor = (box: Box3): THREE.Material => {
      if (box.kind === "wall") {
        const m = track(new THREE.MeshStandardMaterial({ map: wallTex.clone(), roughness: 0.9 }));
        const len = Math.max(box.w, box.d);
        (m.map as THREE.Texture).repeat.set(len / TILE_FT, box.h / TILE_FT);
        (m.map as THREE.Texture).needsUpdate = true;
        track(m.map as THREE.Texture);
        return m;
      }
      if (box.kind === "window") return glassMat;
      if (box.kind === "slab") {
        const m = track(new THREE.MeshStandardMaterial({ map: roofTex.clone(), roughness: 0.9 }));
        (m.map as THREE.Texture).repeat.set(box.w / TILE_FT, box.d / TILE_FT);
        (m.map as THREE.Texture).needsUpdate = true;
        track(m.map as THREE.Texture);
        return m;
      }
      if (box.kind === "drive" || box.kind === "path" || box.kind === "stoop") {
        const m = track(new THREE.MeshStandardMaterial({ map: driveTex.clone(), roughness: 0.95, color: box.color }));
        (m.map as THREE.Texture).repeat.set(Math.max(box.w, 1) / TILE_FT, Math.max(box.d, 1) / TILE_FT);
        (m.map as THREE.Texture).needsUpdate = true;
        track(m.map as THREE.Texture);
        return m;
      }
      if (box.kind === "door") return plain(box.color, 0.6);
      if (box.kind === "trim") return plain(box.color, 0.55);
      return plain(box.color);
    };

    for (const box of scene3d.boxes) {
      const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(box.w, box.h, box.d)), materialFor(box));
      mesh.position.set(box.x + box.w / 2, box.y + box.h / 2, box.z + box.d / 2);
      mesh.castShadow = box.kind !== "drive" && box.kind !== "path" && box.kind !== "floor";
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    for (const roof of scene3d.roofs) {
      const positions: number[] = [];
      const uvs: number[] = [];
      for (const face of roof.faces) {
        for (let i = 1; i + 1 < face.length; i++) {
          for (const idx of [face[0], face[i], face[i + 1]]) {
            const [vx, vy, vz] = roof.vertices[idx];
            positions.push(vx, vy, vz);
            uvs.push(vx / TILE_FT, (vz + vy) / TILE_FT);
          }
        }
      }
      const geometry = track(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      const material = track(new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.85, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Landscaping: low-poly trees and bushes.
    const trunkMat = plain("#6d543a", 1);
    const canopyMat = track(new THREE.MeshStandardMaterial({ color: 0x5d7f46, roughness: 1, flatShading: true }));
    const bushMat = track(new THREE.MeshStandardMaterial({ color: 0x55763f, roughness: 1, flatShading: true }));
    for (const tree of scene3d.trees) {
      const trunk = new THREE.Mesh(track(new THREE.CylinderGeometry(0.35, 0.55, tree.trunkH, 7)), trunkMat);
      trunk.position.set(tree.x, tree.trunkH / 2, tree.z);
      trunk.castShadow = true;
      const canopy = new THREE.Mesh(track(new THREE.IcosahedronGeometry(tree.canopyR, 1)), canopyMat);
      canopy.position.set(tree.x, tree.trunkH + tree.canopyR * 0.7, tree.z);
      canopy.castShadow = true;
      scene.add(trunk, canopy);
    }
    for (const bush of scene3d.bushes) {
      const mesh = new THREE.Mesh(track(new THREE.IcosahedronGeometry(bush.r, 1)), bushMat);
      mesh.position.set(bush.x, bush.r * 0.6, bush.z);
      mesh.castShadow = true;
      scene.add(mesh);
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
      if (sky) {
        sky.material.dispose();
        sky.geometry.dispose();
      }
      if (envSky) {
        envSky.material.dispose();
        envSky.geometry.dispose();
      }
      for (const disp of disposables) disp.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [model, style, finishes]);

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", borderRadius: 8, overflow: "hidden" }} />
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
        Drag to orbit · scroll to zoom · right-drag to pan. Real-time preview with your selected
        materials — photorealistic still renders arrive with the ModelSphere pipeline.
      </p>
    </div>
  );
}
