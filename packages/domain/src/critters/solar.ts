/**
 * Sunrise and sunset per place and local date, on the device and the server alike, with no
 * network: the NOAA solar calculator's equations (Meeus, "Astronomical Algorithms"), good to about
 * a minute between the polar circles. Polar day or night returns `null` for the event that does
 * not happen.
 */
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

function julianCentury(jd: number): number {
  return (jd - 2451545) / 36525;
}

function sunGeometry(t: number): { readonly declination: number; readonly eqTimeMin: number } {
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const mRad = toRad(m);
  const centre =
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289;
  const omega = toRad(125.04 - 1934.136 * t);
  const lambda = toRad(l0 + centre - 0.00569 - 0.00478 * Math.sin(omega));
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const epsilon = toRad(23 + (26 + seconds / 60) / 60 + 0.00256 * Math.cos(omega));
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const y = Math.tan(epsilon / 2) ** 2;
  const l0Rad = toRad(l0);
  const eqTime =
    y * Math.sin(2 * l0Rad) -
    2 * e * Math.sin(mRad) +
    4 * e * y * Math.sin(mRad) * Math.cos(2 * l0Rad) -
    0.5 * y * y * Math.sin(4 * l0Rad) -
    1.25 * e * e * Math.sin(2 * mRad);
  return { declination, eqTimeMin: toDeg(eqTime) * 4 };
}

/** Minutes after 00:00 UTC of the Julian day `jd0`; null when the sun never crosses the horizon. */
function eventMinutes(rise: boolean, jd0: number, lat: number, lng: number): number | null {
  const at = (minutes: number): number | null => {
    const { declination, eqTimeMin } = sunGeometry(julianCentury(jd0 + minutes / 1440));
    const latRad = toRad(lat);
    const cosH =
      Math.cos(toRad(90.833)) / (Math.cos(latRad) * Math.cos(declination)) -
      Math.tan(latRad) * Math.tan(declination);
    if (cosH < -1 || cosH > 1) return null;
    const hourAngle = toDeg(Math.acos(cosH)) * (rise ? 1 : -1);
    return 720 - 4 * (lng + hourAngle) - eqTimeMin;
  };
  const first = at(0);
  return first === null ? null : at(first);
}

export interface SolarDay {
  readonly sunrise: Date | null;
  readonly sunset: Date | null;
}

/**
 * The sunrise and sunset of `localDate` (`YYYY-MM-DD`, the place's own calendar day) at `lat`/`lng`
 * (east positive). Places east of Greenwich get a sunrise on the previous UTC day, as they should.
 */
export function solarDay(localDate: string, lat: number, lng: number): SolarDay {
  const midnightUtc = Date.parse(`${localDate}T00:00:00Z`);
  // Julian day of that UTC midnight; the events land either side of it by longitude.
  const jd0 = midnightUtc / 86_400_000 + 2440587.5;
  const toDate = (minutes: number | null): Date | null =>
    minutes === null ? null : new Date(midnightUtc + Math.round(minutes * 60_000));
  return {
    sunrise: toDate(eventMinutes(true, jd0, lat, lng)),
    sunset: toDate(eventMinutes(false, jd0, lat, lng)),
  };
}

export const SOLAR_CONDITIONS = ['after_dark', 'by_sunrise'] as const;
export type SolarCondition = (typeof SOLAR_CONDITIONS)[number];

/** `by_sunrise` opens this long before sunrise and closes this long after it. */
export const BY_SUNRISE_BEFORE_MIN = 60;
export const BY_SUNRISE_AFTER_MIN = 30;

/**
 * Whether a solar condition holds at `at` for a place whose calendar day is `localDate`:
 * `after_dark` from sunset until the next sunrise (so also before this morning's), `by_sunrise`
 * in the hour before sunrise and half an hour after. Polar night is dark all day; polar day never is.
 */
export function solarConditionHolds(
  condition: SolarCondition,
  at: Date,
  localDate: string,
  lat: number,
  lng: number,
): boolean {
  const { sunrise, sunset } = solarDay(localDate, lat, lng);
  const t = at.getTime();
  if (condition === 'by_sunrise') {
    if (sunrise === null) return false;
    const s = sunrise.getTime();
    return t >= s - BY_SUNRISE_BEFORE_MIN * 60_000 && t <= s + BY_SUNRISE_AFTER_MIN * 60_000;
  }
  if (sunrise === null || sunset === null) {
    // No crossing: dark all day when the sun stays below the horizon (lat and declination apart).
    const jd0 = Date.parse(`${localDate}T12:00:00Z`) / 86_400_000 + 2440587.5;
    return lat * sunGeometry(julianCentury(jd0)).declination < 0;
  }
  return t < sunrise.getTime() || t >= sunset.getTime();
}
