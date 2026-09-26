/*
 * Placement of the scheme in the 2GIS 3D map (MapGL). MapGL's world is a Web
 * Mercator square 2^32 "map points" wide, x to the east, y to the north, z up —
 * the same space the official 2GIS glTF plugin places models in.
 */

const WORLD = 2 ** 32;
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137;

/** Map point of a longitude/latitude. */
export function lngLatToMapPoint(lng: number, lat: number): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180);
  const x = (lng * WORLD) / 360;
  const y = (Math.log((1 + s) / (1 - s)) * WORLD) / (4 * Math.PI);
  const h = WORLD / 2;
  return [Math.min(h, Math.max(-h, x)), Math.min(h, Math.max(-h, y))];
}

/** Map points per metre on the ground at a latitude. */
export function mapPointsPerMetre(lat: number): number {
  return WORLD / EARTH_CIRCUMFERENCE / Math.cos((lat * Math.PI) / 180);
}

/**
 * Opening camera for the city view: close enough to read the tower, far
 * enough to take in its block, looking from the plot's front-right corner
 * like the aerial view of the massing.
 */
export function cityCamera(northDeg: number, heightM: number) {
  const zoom = Math.min(18.5, Math.max(15.5, 17.8 - Math.log2(Math.max(1, (heightM + 60) / 120))));
  return { zoom, pitch: 50, rotation: normaliseDeg(38 + northDeg) };
}

function normaliseDeg(d: number) {
  const r = ((d % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

/** Key used for the 2GIS map: the deployment's, unless this browser has its own. */
export const TWO_GIS_ENV_KEY = (process.env.NEXT_PUBLIC_2GIS_KEY ?? "").trim();
const KEY_STORAGE = "plotiq.2gis.key";

export function readBrowserKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeBrowserKey(key: string) {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode — the key just isn't remembered */
  }
}
