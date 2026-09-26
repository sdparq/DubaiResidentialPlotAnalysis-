import * as THREE from "three";
import type { Point } from "@/lib/geom";
import type { Volume } from "@/lib/massing";
import type { FacadeParams } from "@/lib/facade";
import { planPodiumAmenities } from "@/lib/podium-amenities";
import { boxAt, prismGeometry } from "./scene-kit";
import { buildLobby, buildPodium, buildTower, facadeMaterials, layersToObjects, type Layers } from "./tower-facade";

/** Plain tier colours for volumes without a designed façade (Realistic look). */
const TIER_FILL: Record<NonNullable<Volume["kind"]>, string> = {
  basement: "#bfb6a3",
  ground: "#e9e4d9",
  podium: "#e2dbcd",
  tower: "#cfdbe1",
};

export interface SchemeModelInput {
  volumes: Volume[];
  plot: Point[];
  floorHeight: number;
  facade: FacadeParams;
}

/**
 * The designed building as a plain three.js group, in the massing scene's
 * world frame (plan x → x, height → y, plan y → −z) — for renderers outside
 * the React viewer such as the 2GIS city map. Basements are left out.
 */
export function buildSchemeModel({ volumes, plot, floorHeight, facade }: SchemeModelInput) {
  const group = new THREE.Group();
  const layers: Layers[] = [];
  const own: { dispose(): void }[] = [];
  const mats = facadeMaterials(facade, "real");
  const designed = facade.mode === "residential";

  for (const v of volumes) {
    if (v.kind === "basement" || v.toY <= v.fromY || v.polygon.length < 3) continue;
    const isDesigned =
      designed && !v.hole && (v.kind === "tower" || v.kind === "podium" || (v.kind === "ground" && facade.entrance));
    if (isDesigned) {
      const l =
        v.kind === "tower"
          ? buildTower({
              polygon: v.polygon,
              fromY: v.fromY,
              toY: v.toY,
              floorHeight,
              floors: v.floors,
              style: facade.style,
              roundedCorners: facade.roundedCorners,
              crown: facade.crown,
              balconyDepthM: facade.balconyDepthM,
            })
          : v.kind === "podium"
            ? buildPodium(
                v.polygon, v.fromY, v.toY, v.floors, facade.groundPodiumTreatment === "fins",
                facade.finSpacingM, facade.finWidthM, facade.finDepthM,
              )
            : buildLobby(v.polygon, v.fromY, v.toY, v.floors ?? 1, plot);
      layers.push(l);
      for (const o of layersToObjects(l, mats)) group.add(o);
      continue;
    }
    const geometry = prismGeometry(v.polygon, v.hole ?? null, v.toY - v.fromY);
    if (!geometry) continue;
    const material = new THREE.MeshStandardMaterial({ color: TIER_FILL[v.kind ?? "tower"], roughness: 0.75 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = v.fromY;
    group.add(mesh);
    own.push(geometry, material);
  }

  // The pool on the podium (or ground) roof, when there is room for it.
  const deck = volumes.find((v) => v.kind === "podium") ?? volumes.find((v) => v.kind === "ground");
  const tower = volumes.find((v) => v.kind === "tower");
  if (deck && facade.podiumPool) {
    const pool = planPodiumAmenities(deck.polygon, tower?.polygon ?? [], { pool: true, lounge: false }).pool;
    if (pool) {
      const rim = new THREE.MeshStandardMaterial({ color: "#e3ddcf", roughness: 0.9 });
      const water = new THREE.MeshStandardMaterial({ color: "#2fb2cf", roughness: 0.05, metalness: 0.1 });
      const box = new THREE.BoxGeometry(1, 1, 1);
      const a = new THREE.Mesh(box, rim);
      a.applyMatrix4(boxAt(pool.center.x, pool.center.y, deck.toY + 0.06, pool.yaw, pool.length + 0.6, 0.12, pool.width + 0.6));
      const b = new THREE.Mesh(box, water);
      b.applyMatrix4(boxAt(pool.center.x, pool.center.y, deck.toY + 0.13, pool.yaw, pool.length, 0.04, pool.width));
      group.add(a, b);
      own.push(box, rim, water);
    }
  }

  return {
    group,
    dispose() {
      layers.forEach((l) => l.dispose());
      own.forEach((o) => o.dispose());
      group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
    },
  };
}
