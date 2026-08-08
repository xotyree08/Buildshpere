"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import type { FinishSelections } from "@/lib/catalog/materials";
import { WALL_HEIGHT_FT } from "@/lib/engine/iso";
import { exteriorPalette } from "@/lib/render/palette";
import { buildScene3D, type Box3 } from "@/lib/render/scene3d";
import type { HomeStyle, ParametricModel } from "@/lib/types";
import { BrandMark } from "./BrandMark";
import {
  clapboardBump,
  concreteTexture,
  grassTexture,
  plasterTexture,
  roofTextureFor,
  shingleBump,
  TILE_FT,
  tileFloorTexture,
  wallTextureFor,
  woodFloorTexture,
} from "./textures3d";

const EYE_FT = 5.5;
const WALK_SPEED = 14; // ft/s
const BODY_R = 0.4;

/**
 * The interactive 3D viewer (BS-MOD-001), real-time edition: PBR
 * materials with procedural textures, an atmospheric sky, soft sun
 * shadows, deterministic landscaping — and a first-person Walk mode
 * through the real doorway voids the scene builder cuts. Still a pure
 * consumer of scene3d — every geometry decision lives in the engine.
 */
export function Viewer3D({
  model,
  style,
  finishes,
  interiorScheme,
  projectId,
}: {
  model: ParametricModel;
  style?: HomeStyle;
  finishes?: FinishSelections;
  /** Interior scheme key; defaults to the style's natural scheme. */
  interiorScheme?: string;
  /** Photoreal stills bill to this project's license when set. */
  projectId?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<(() => string) | null>(null);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState<{ busy: boolean; image: string | null; error: string | null; note?: string | null }>({
    busy: false,
    image: null,
    error: null,
  });
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [level, setLevel] = useState(0);

  useEffect(() => {
    setReady(false);
    const mount = mountRef.current;
    if (!mount) return;

    const scene3d = buildScene3D(model, style, finishes, interiorScheme);
    const palette = exteriorPalette(finishes);
    const { cx, cz, w, d, h } = scene3d.bounds;
    const radius = Math.max(w, d, h);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xdce9f2, radius * 6, radius * 14);

    const camera = new THREE.PerspectiveCamera(mode === "walk" ? 65 : 42, 1, 0.2, radius * 30);
    camera.position.set(cx - radius * 0.85, h * 0.5 + radius * 0.45, cz - radius * 1.15);

    // Sky dome + analytic lights only. The PMREM environment-map path
    // renders BLACK on more real-world GPUs than it works on (SwiftShader,
    // llvmpipe, and iOS Safari all failed it in testing) — the analytic
    // setup below is proven correct everywhere and looks nearly as good.
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(-140));
    scene.background = new THREE.Color(0xcfe3f2);
    const sky = new Sky();
    sky.scale.setScalar(radius * 25);
    sky.position.set(cx, 0, cz);
    sky.material.uniforms.turbidity.value = 6;
    sky.material.uniforms.rayleigh.value = 1.6;
    sky.material.uniforms.mieCoefficient.value = 0.004;
    sky.material.uniforms.sunPosition.value.copy(sunDir);
    scene.add(sky);

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
    const wallBump = track(clapboardBump());
    const roofTex = track(roofTextureFor(palette));
    const roofBump = track(shingleBump());
    const driveTex = track(concreteTexture("#a8a49c"));
    const plasterTex = track(plasterTexture("#efece4"));
    const floorMats = new Map<string, THREE.MeshStandardMaterial>();
    // Wood in living spaces, tile where the palette paints a cool wet-room
    // tone — keyed by the scheme color the floor box already carries.
    const floorMaterial = (color: string) => {
      if (!floorMats.has(color)) {
        const n = parseInt(color.slice(1), 16);
        const cool = (n & 255) > ((n >> 16) & 255); // blue > red reads as tile
        const tex = track(cool ? tileFloorTexture(color) : woodFloorTexture(color));
        tex.repeat.set(1, 1);
        floorMats.set(color, track(new THREE.MeshStandardMaterial({ map: tex, roughness: cool ? 0.5 : 0.72 })));
      }
      return floorMats.get(color)!;
    };
    const glassMat = track(
      new THREE.MeshStandardMaterial({ color: 0xbfd9e8, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.62 }),
    );
    const plainMats = new Map<string, THREE.MeshStandardMaterial>();
    const plain = (color: string, roughness = 0.85) => {
      const key = `${color}-${roughness}`;
      if (!plainMats.has(key)) plainMats.set(key, track(new THREE.MeshStandardMaterial({ color, roughness })));
      return plainMats.get(key)!;
    };

    const materialFor = (box: Box3): THREE.Material => {
      if (box.kind === "wall") {
        // Inside the walkthrough, walls are painted plaster — siding
        // belongs on the outside of a house, not in the hallway.
        const len = Math.max(box.w, box.d);
        if (mode === "walk") {
          const m = track(new THREE.MeshStandardMaterial({ map: plasterTex.clone(), roughness: 0.94 }));
          (m.map as THREE.Texture).repeat.set(len / TILE_FT, box.h / TILE_FT);
          (m.map as THREE.Texture).needsUpdate = true;
          track(m.map as THREE.Texture);
          return m;
        }
        const m = track(
          new THREE.MeshStandardMaterial({ map: wallTex.clone(), bumpMap: wallBump.clone(), bumpScale: 0.35, roughness: 0.9 }),
        );
        (m.map as THREE.Texture).repeat.set(len / TILE_FT, box.h / TILE_FT);
        (m.bumpMap as THREE.Texture).repeat.set(len / TILE_FT, box.h / TILE_FT);
        (m.map as THREE.Texture).needsUpdate = true;
        (m.bumpMap as THREE.Texture).needsUpdate = true;
        track(m.map as THREE.Texture);
        track(m.bumpMap as THREE.Texture);
        return m;
      }
      if (box.kind === "floor") {
        const m = floorMaterial(box.color);
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
      if (box.kind === "furn") return plain(box.color, 0.75);
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
      const material = track(
        new THREE.MeshStandardMaterial({
          map: roofTex,
          bumpMap: roofBump,
          bumpScale: 0.5,
          roughness: 0.85,
          side: THREE.DoubleSide,
        }),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Landscaping: varied trees — three canopy tones, multi-lobe crowns.
    const trunkMat = plain("#6d543a", 1);
    const canopyMats = [0x5d7f46, 0x4f7038, 0x6b8a50].map((color) =>
      track(new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })),
    );
    const bushMat = track(new THREE.MeshStandardMaterial({ color: 0x55763f, roughness: 1, flatShading: true }));
    scene3d.trees.forEach((tree, ti) => {
      const canopyMat = canopyMats[ti % canopyMats.length];
      const trunk = new THREE.Mesh(track(new THREE.CylinderGeometry(0.35, 0.55, tree.trunkH, 7)), trunkMat);
      trunk.position.set(tree.x, tree.trunkH / 2, tree.z);
      trunk.castShadow = true;
      scene.add(trunk);
      // A crown is lobes, not a ball: one main mass and two offset lobes,
      // rotated per tree so no two silhouettes repeat side by side.
      const lobes: [number, number, number, number][] = [
        [0, 0.75, 0, 1],
        [0.55, 0.55, 0.2, 0.62],
        [-0.45, 0.95, -0.3, 0.55],
      ];
      const spin = (ti * 2.4) % (Math.PI * 2);
      for (const [lx, ly, lz, lr] of lobes) {
        const x = lx * Math.cos(spin) - lz * Math.sin(spin);
        const z = lx * Math.sin(spin) + lz * Math.cos(spin);
        const lobe = new THREE.Mesh(track(new THREE.IcosahedronGeometry(tree.canopyR * lr, 1)), canopyMat);
        lobe.position.set(tree.x + x * tree.canopyR, tree.trunkH + ly * tree.canopyR, tree.z + z * tree.canopyR);
        lobe.castShadow = true;
        scene.add(lobe);
      }
    });
    if (mode === "walk") {
      // Ceilings: a walkthrough without one reads as a movie set. One
      // plane per room floor, hung just under the storey above.
      const ceilingMat = track(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.96 }));
      for (const box of scene3d.boxes) {
        if (box.kind !== "floor") continue;
        const ceiling = new THREE.Mesh(track(new THREE.BoxGeometry(box.w, 0.15, box.d)), ceilingMat);
        ceiling.position.set(box.x + box.w / 2, box.y + WALL_HEIGHT_FT - 0.2, box.z + box.d / 2);
        ceiling.receiveShadow = false;
        ceiling.castShadow = false;
        scene.add(ceiling);
      }
    }

    for (const bush of scene3d.bushes) {
      const mesh = new THREE.Mesh(track(new THREE.IcosahedronGeometry(bush.r, 1)), bushMat);
      mesh.position.set(bush.x, bush.r * 0.6, bush.z);
      mesh.castShadow = true;
      scene.add(mesh);
    }

    // ---------- Walk mode ----------
    let controls: OrbitControls | null = null;
    let walkCleanup: (() => void) | null = null;
    const clock = new THREE.Clock();

    if (mode === "orbit") {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(cx, h / 2.8, cz);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.minDistance = radius * 0.3;
      controls.maxDistance = radius * 6;
    } else {
      // Interior fill + room lights so rooms under the roof aren't caves.
      scene.add(new THREE.AmbientLight(0xfff6e8, 0.5));
      for (const room of model.rooms) {
        if (room.kind === "garage" || room.kind === "outdoor") continue;
        const [rx, rz, rw, rd] = room.rect;
        const light = new THREE.PointLight(0xfff3e0, 80, Math.max(rw, rd) * 1.8, 2);
        light.position.set(rx + rw / 2, room.level * WALL_HEIGHT_FT + WALL_HEIGHT_FT - 0.8, rz + rd / 2);
        scene.add(light);
      }

      const eyeBase = level * WALL_HEIGHT_FT;

      // Solid obstacles at body height on this level: cut wall segments
      // (doorway voids excluded by their y-span), door leaves, furniture.
      const solids = scene3d.boxes.filter(
        (b) =>
          (b.kind === "wall" || b.kind === "door" || b.kind === "furn") &&
          b.y < eyeBase + 6.0 &&
          b.y + b.h > eyeBase + 1.2,
      );
      const blocked = (px: number, pz: number) =>
        solids.some(
          (b) => px > b.x - BODY_R && px < b.x + b.w + BODY_R && pz > b.z - BODY_R && pz < b.z + b.d + BODY_R,
        );

      // Spawn in the living room (or the first habitable room) at the
      // first clear spot — the room's center may hold furniture now.
      const ground0 = model.rooms.filter((r) => r.level === level && r.kind !== "garage" && r.kind !== "outdoor");
      const spawn = ground0.find((r) => r.kind === "living") ?? ground0[0];
      const [sx, sz, sw, sd] = spawn.rect;
      let spawnX = sx + sw / 2;
      let spawnZ = sz + sd / 2;
      for (const [ox, oz] of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [3.5, 3.5], [-3.5, -3.5]]) {
        if (!blocked(sx + sw / 2 + ox, sz + sd / 2 + oz)) {
          spawnX = sx + sw / 2 + ox;
          spawnZ = sz + sd / 2 + oz;
          break;
        }
      }
      const pos = new THREE.Vector3(spawnX, eyeBase + EYE_FT, spawnZ);
      let yaw = 0; // facing +Z: toward the hallway side
      let pitch = 0;

      const keys = new Set<string>();
      const touchMove = { forward: 0 };
      const onKeyDown = (e: KeyboardEvent) => {
        if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
          keys.add(e.code);
          e.preventDefault();
        }
      };
      const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      // Drag to look, mouse or touch.
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const el = renderer.domElement;
      el.style.touchAction = "none";
      const onPointerDown = (e: PointerEvent) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return;
        yaw -= (e.clientX - lastX) * 0.004;
        pitch = THREE.MathUtils.clamp(pitch - (e.clientY - lastY) * 0.003, -1.2, 1.2);
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onPointerUp = () => {
        dragging = false;
      };
      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);

      // On-screen buttons (touch) talk through data attributes on the HUD.
      const hud = mount.parentElement?.querySelectorAll<HTMLButtonElement>("[data-walk]") ?? [];
      const hudHandlers: [HTMLButtonElement, string, (e: Event) => void][] = [];
      hud.forEach((btn) => {
        const dir = btn.dataset.walk === "fwd" ? 1 : -1;
        const press = (e: Event) => {
          e.preventDefault();
          touchMove.forward = dir;
        };
        const release = () => {
          touchMove.forward = 0;
        };
        btn.addEventListener("pointerdown", press);
        btn.addEventListener("pointerup", release);
        btn.addEventListener("pointerleave", release);
        hudHandlers.push([btn, "pointerdown", press], [btn, "pointerup", release], [btn, "pointerleave", release]);
      });

      const stepWalk = (dt: number) => {
        let fwd = touchMove.forward;
        let strafe = 0;
        if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
        if (keys.has("KeyA")) strafe -= 1;
        if (keys.has("KeyD")) strafe += 1;
        if (keys.has("ArrowLeft")) yaw += dt * 1.8;
        if (keys.has("ArrowRight")) yaw -= dt * 1.8;
        if (fwd !== 0 || strafe !== 0) {
          const dirX = Math.sin(yaw);
          const dirZ = Math.cos(yaw);
          const mx = (dirX * fwd + dirZ * strafe) * WALK_SPEED * dt;
          const mz = (dirZ * fwd - dirX * strafe) * WALK_SPEED * dt;
          // Axis-sliding collision: try full move, then each axis alone.
          if (!blocked(pos.x + mx, pos.z + mz)) {
            pos.x += mx;
            pos.z += mz;
          } else if (!blocked(pos.x + mx, pos.z)) {
            pos.x += mx;
          } else if (!blocked(pos.x, pos.z + mz)) {
            pos.z += mz;
          }
          // Stay near the property.
          pos.x = THREE.MathUtils.clamp(pos.x, cx - radius * 2, cx + radius * 2);
          pos.z = THREE.MathUtils.clamp(pos.z, cz - radius * 2, cz + radius * 2);
        }
        camera.position.copy(pos);
        camera.lookAt(
          pos.x + Math.sin(yaw) * Math.cos(pitch),
          pos.y + Math.sin(pitch),
          pos.z + Math.cos(yaw) * Math.cos(pitch),
        );
      };

      walkCleanup = () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerUp);
        for (const [btn, event, handler] of hudHandlers) btn.removeEventListener(event, handler);
      };
      (camera as THREE.PerspectiveCamera & { stepWalk?: (dt: number) => void }).stepWalk = stepWalk;
    }

    let frame = 0;
    let announced = false;
    const renderLoop = () => {
      frame = requestAnimationFrame(renderLoop);
      const dt = Math.min(clock.getDelta(), 0.1);
      if (controls) controls.update();
      const stepWalk = (camera as THREE.PerspectiveCamera & { stepWalk?: (dt: number) => void }).stepWalk;
      if (stepWalk) stepWalk(dt);
      renderer.render(scene, camera);
      if (!announced) {
        announced = true;
        setReady(true);
      }
    };

    // Fresh frame, then read the canvas — no preserveDrawingBuffer needed.
    captureRef.current = () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/jpeg", 0.92);
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
      if (controls) controls.dispose();
      if (walkCleanup) walkCleanup();
      sky.material.dispose();
      sky.geometry.dispose();
      for (const disp of disposables) disp.dispose();
      captureRef.current = null;
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [model, style, finishes, interiorScheme, mode, level]);

  async function photoreal() {
    const capture = captureRef.current;
    if (!capture) return;
    setStill({ busy: true, image: null, error: null });
    try {
      const res = await fetch("/api/v1/render/photoreal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageDataUrl: capture(), style, finishes, projectId }),
      });
      const body = (await res.json()) as { imageDataUrl?: string; error?: string; remaining?: number };
      if (!res.ok || !body.imageDataUrl) {
        setStill({ busy: false, image: null, error: body.error ?? "The render failed — try again." });
        return;
      }
      setStill({
        busy: false,
        image: body.imageDataUrl,
        error: null,
        note:
          typeof body.remaining === "number"
            ? `${body.remaining} premium render${body.remaining === 1 ? "" : "s"} remaining on this project's license.`
            : null,
      });
    } catch {
      setStill({ busy: false, image: null, error: "Could not reach the server — check your connection." });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0 0 0.4rem", flexWrap: "wrap" }}>
        <button
          className={mode === "orbit" ? "btn" : "btn secondary"}
          style={{ padding: "0.25rem 0.8rem", fontSize: "0.8rem" }}
          type="button"
          onClick={() => setMode("orbit")}
        >
          Orbit
        </button>
        <button
          className={mode === "walk" ? "btn" : "btn secondary"}
          style={{ padding: "0.25rem 0.8rem", fontSize: "0.8rem" }}
          type="button"
          onClick={() => setMode("walk")}
        >
          Walk inside
        </button>
        <button
          className="btn secondary"
          style={{ padding: "0.25rem 0.8rem", fontSize: "0.8rem" }}
          type="button"
          disabled={still.busy || !ready}
          onClick={() => void photoreal()}
        >
          {still.busy ? "Rendering…" : "Photoreal still"}
        </button>
        {mode === "walk" && model.levels > 1 && (
          <span style={{ display: "inline-flex", gap: "0.35rem" }}>
            {Array.from({ length: model.levels }, (_, i) => (
              <button
                key={i}
                className={level === i ? "btn" : "btn secondary"}
                style={{ padding: "0.25rem 0.7rem", fontSize: "0.8rem" }}
                type="button"
                onClick={() => setLevel(i)}
              >
                Level {i + 1}
              </button>
            ))}
          </span>
        )}
      </div>
      <div className="viewer-shell">
        <div ref={mountRef} style={{ width: "100%", borderRadius: 8, overflow: "hidden" }} />
        {mode === "walk" && (
          <div
            style={{
              position: "absolute",
              bottom: 14,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: "0.6rem",
              zIndex: 2,
            }}
          >
            <button data-walk="fwd" className="btn" style={{ padding: "0.5rem 1.1rem" }} type="button" aria-label="Walk forward">
              ▲
            </button>
            <button data-walk="back" className="btn" style={{ padding: "0.5rem 1.1rem" }} type="button" aria-label="Walk backward">
              ▼
            </button>
          </div>
        )}
        <div className={ready ? "viewer-loading hidden" : "viewer-loading"}>
          <BrandMark size={44} />
          <span>Raising your home</span>
        </div>
      </div>
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
        {mode === "orbit"
          ? "Drag to orbit · scroll to zoom · right-drag to pan. Real-time preview with your selected materials — Photoreal still turns the current view into an architectural photo."
          : "Drag to look around · WASD/arrow keys or the ▲▼ buttons to move. Walls stop you; doorways don't — walk the real plan."}
      </p>
      {still.error && (
        <p className="status-warn" style={{ marginTop: "0.5rem" }}>
          {still.error}
        </p>
      )}
      {still.image && (
        <div style={{ marginTop: "0.6rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={still.image}
            alt="Photoreal rendering of this concept"
            style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)" }}
          />
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.35rem 0 0", display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <span>
              AI-interpreted photograph of this concept — the plans and estimate, not this image,
              are the source of truth.{still.note ? ` ${still.note}` : ""}
            </span>
            <a
              className="btn secondary"
              style={{ padding: "0.2rem 0.7rem", fontSize: "0.8rem" }}
              href={still.image}
              download="buildsphere-photoreal.jpg"
            >
              Download
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
