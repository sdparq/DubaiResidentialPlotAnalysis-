export interface LatLng {
  lat: number;
  lng: number;
}

const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Read a location from whatever the user pastes:
 *   "25.1972, 55.2744" · "25.1972 55.2744"
 *   Google Maps links — the place pin (!3d…!4d…) wins over the map centre (@lat,lng,zoom)
 *   "?q=25.19,55.27" style links
 *   degrees-minutes-seconds as copied from Google Maps: 25°11'50.0"N 55°16'28.0"E
 */
export function parseCoordinates(input: string): LatLng | null {
  const s = input.trim();
  if (!s) return null;

  const pin = s.match(new RegExp(`!3d${NUM}!4d${NUM}`));
  if (pin) return valid(Number(pin[1]), Number(pin[2]));

  const query = s.match(new RegExp(`[?&](?:q|query|ll|destination|center)=${NUM}(?:,|%2C)\\s*${NUM}`, "i"));
  if (query) return valid(Number(query[1]), Number(query[2]));

  const at = s.match(new RegExp(`@${NUM},\\s*${NUM}`));
  if (at) return valid(Number(at[1]), Number(at[2]));

  const dms = s.match(
    /(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)?["″]?\s*([NS])[\s,]+(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)?["″]?\s*([EW])/i
  );
  if (dms) {
    const toDeg = (d: string, m: string, sec: string | undefined, hemi: string) =>
      (Number(d) + Number(m) / 60 + Number(sec ?? 0) / 3600) * (/[SW]/i.test(hemi) ? -1 : 1);
    return valid(toDeg(dms[1], dms[2], dms[3], dms[4]), toDeg(dms[5], dms[6], dms[7], dms[8]));
  }

  const plain = s.match(new RegExp(`^${NUM}\\s*[,;\\s]\\s*${NUM}$`));
  if (plain) return valid(Number(plain[1]), Number(plain[2]));

  return null;
}
