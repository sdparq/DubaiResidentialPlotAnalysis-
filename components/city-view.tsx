"use client";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { load } from "@2gis/mapgl";
import type { Map as MapGLMap } from "@2gis/mapgl/types";
import type { Point } from "@/lib/geom";
import type { LatLng } from "@/lib/site-context";
import { cityCamera, lngLatToMapPoint, mapPointsPerMetre } from "@/lib/two-gis";
import { buildSchemeModel, type SchemeModelInput } from "./scheme-model";
import type { CaptureFn } from "./massing-scene";

export interface CityStatus {
  state: "loading" | "ready" | "error";
  message?: string;
}

/** MapGL internals the official 2GIS glTF plugin relies on to draw models in the map. */
type MapInternals = MapGLMap & {
  getProjectionMatrixForGltfPlugin?: () => number[];
  setHiddenObjects?: (ids: string[]) => void;
  triggerRerender?: () => void;
};

interface Props {
  apiKey: string;
  location: LatLng;
  northDeg: number;
  /** Plot centroid in plan metres — the point placed on `location`. */
  centroid: Point;
  model: SchemeModelInput;
  heightM: number;
  /** 2GIS buildings hidden to clear the plot. */
  hiddenIds: string[];
  /** While true, clicking a building on the map hides or shows it. */
  picking: boolean;
  onPick: (id: string) => void;
  captureRef: MutableRefObject<CaptureFn | null>;
  resetView: number;
  autoRotate: boolean;
  onStatus: (s: CityStatus) => void;
}

/**
 * The scheme in the real city: the 2GIS 3D map of Dubai (MapGL) with the
 * designed building drawn into it by a custom layer — the same three.js
 * objects and materials as the massing viewer, placed on the plot's
 * coordinates, turned by true north, at true scale.
 */
export default function CityView(props: Props) {
  const { apiKey, location, northDeg, centroid, model, heightM, hiddenIds, picking, captureRef, resetView, autoRotate } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInternals | null>(null);
  const holderRef = useRef<{ anchor: THREE.Group; holder: THREE.Group } | null>(null);
  const [ready, setReady] = useState(0);
  const latest = useRef(props);
  latest.current = props;

  // The map and its custom layer — once per key and location.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let map: MapInternals | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let resize: ResizeObserver | null = null;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;

    // Map space: x east, y north, z up, in map points.
    const scene = new THREE.Scene();
    const anchor = new THREE.Group(); // position, scale and heading on the map
    const holder = new THREE.Group(); // the viewer's y-up frame stood up to z-up
    holder.rotation.x = Math.PI / 2;
    anchor.add(holder);
    scene.add(anchor);
    const sky = new THREE.HemisphereLight("#eef4fb", "#b8a888", 1.7);
    sky.position.set(0, 0, 1);
    const sun = new THREE.DirectionalLight("#fff3e0", 2.4);
    sun.position.set(-0.55, -0.7, 1.1);
    scene.add(sky, sun, new THREE.AmbientLight("#ffffff", 0.25));
    holderRef.current = { anchor, holder };

    const camera = new THREE.PerspectiveCamera();
    camera.matrixAutoUpdate = false;
    camera.matrixWorldAutoUpdate = false;
    const viewProj = new THREE.Matrix4();

    latest.current.onStatus({ state: "loading" });
    load()
      .then((mapgl) => {
        if (cancelled) return;
        const view = cityCamera(latest.current.northDeg, latest.current.heightM);
        map = new mapgl.Map(el, {
          key: apiKey,
          center: [location.lng, location.lat],
          zoom: view.zoom,
          pitch: view.pitch,
          rotation: view.rotation,
          webglVersion: 2,
          preserveDrawingBuffer: true,
          zoomControl: false,
          copyright: "bottomLeft",
        }) as MapInternals;
        mapRef.current = map;

        map.addLayer({
          id: "plotiq-scheme",
          type: "custom",
          onAdd: () => {
            if (!map) return;
            renderer = new THREE.WebGLRenderer({
              canvas: map.getCanvas(),
              context: map.getWebGLContext() as unknown as WebGL2RenderingContext,
            });
            renderer.autoClear = false;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
          },
          render: () => {
            const m = mapRef.current;
            if (!renderer || !m?.getProjectionMatrixForGltfPlugin) return;
            // Same camera reconstruction as the 2GIS glTF plugin.
            camera.projectionMatrix.fromArray(m.getProjectionMatrixForGltfPlugin());
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
            viewProj.fromArray(m.getProjectionMatrix());
            camera.matrixWorldInverse.multiplyMatrices(camera.projectionMatrixInverse, viewProj);
            camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
            camera.matrix.copy(camera.matrixWorld);
            renderer.resetState();
            const c = m.getCanvas();
            renderer.setViewport(0, 0, c.width, c.height);
            renderer.render(scene, camera);
          },
          onRemove: () => undefined,
        } as never);

        map.on("click", (e) => {
          const t = e.targetData;
          if (!latest.current.picking || !t || t.type !== "default" || !t.id) return;
          latest.current.onPick(t.id);
        });
        let ready = false;
        map.on("idle", () => {
          ready = true;
          latest.current.onStatus({ state: "ready" });
        });
        map.on("styleloaderror", () =>
          latest.current.onStatus({ state: "error", message: "2GIS refused the map style — check that the key is valid for the MapGL JS API." }),
        );
        slowTimer = setTimeout(() => {
          if (!ready && !cancelled) {
            latest.current.onStatus({ state: "error", message: "The 2GIS map is taking long to load — check the key and the connection." });
          }
        }, 25000);
        resize = new ResizeObserver(() => map?.invalidateSize());
        resize.observe(el);
        setReady((n) => n + 1);
      })
      .catch(() => {
        if (!cancelled) {
          latest.current.onStatus({
            state: "error",
            message: "The 2GIS map could not be loaded — check the key and the connection.",
          });
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      resize?.disconnect();
      mapRef.current = null;
      holderRef.current = null;
      try {
        map?.destroy();
      } catch {
        /* already gone */
      }
      renderer?.dispose();
    };
  }, [apiKey, location.lat, location.lng]);

  // The building: rebuilt when the design changes, re-placed when the plot moves.
  useEffect(() => {
    const h = holderRef.current;
    if (!h) return;
    const built = buildSchemeModel(model);
    // City glass has no reflections to pick up, so keep it from going dark.
    built.group.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && "metalness" in mat) mat.metalness = Math.min(mat.metalness, 0.25);
    });
    built.group.position.set(-centroid.x, 0, centroid.y);
    h.holder.add(built.group);
    const [mx, my] = lngLatToMapPoint(location.lng, location.lat);
    h.anchor.position.set(mx, my, 0);
    h.anchor.scale.setScalar(mapPointsPerMetre(location.lat));
    h.anchor.rotation.set(0, 0, (northDeg * Math.PI) / 180);
    mapRef.current?.triggerRerender?.();
    return () => {
      h.holder.remove(built.group);
      built.dispose();
    };
  }, [model, centroid, northDeg, location.lat, location.lng, ready]);

  useEffect(() => {
    const m = mapRef.current;
    m?.setHiddenObjects?.(hiddenIds);
    m?.triggerRerender?.();
  }, [hiddenIds, ready]);

  useEffect(() => {
    captureRef.current = async () => {
      const m = mapRef.current;
      if (!m) return null;
      m.triggerRerender?.();
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      try {
        return m.getCanvas().toDataURL("image/png");
      } catch {
        return null;
      }
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef, ready]);

  useEffect(() => {
    const m = mapRef.current;
    if (!resetView || !m) return;
    const view = cityCamera(northDeg, heightM);
    const anim = { duration: 900 };
    m.setCenter([location.lng, location.lat], anim);
    m.setZoom(view.zoom, anim);
    m.setPitch(view.pitch, anim);
    m.setRotation(view.rotation, anim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetView]);

  useEffect(() => {
    const m = mapRef.current;
    if (!autoRotate || !m) return;
    let raf = 0;
    let last = performance.now();
    const spin = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      m.setRotation(m.getRotation() + dt * 6, { animate: false, normalize: false });
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, ready]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${picking ? "cursor-crosshair" : ""}`}
      aria-label="2GIS 3D city map with the scheme"
    />
  );
}
