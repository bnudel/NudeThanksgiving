/**
 * Sunrise and sunset, computed rather than fetched.
 *
 * Forecast APIs only reach ~16 days out, but daylight is pure astronomy — so
 * this works for Thanksgiving from any distance. Standard NOAA sunrise
 * equation; accurate to roughly a minute, which is plenty for "when does it
 * get dark on the beach".
 */

const DEG = Math.PI / 180;
const J1970 = 2440587.5;
const J2000 = 2451545.0;

/** Solar disc centre at -0.833° accounts for refraction and the sun's radius. */
const ZENITH = -0.833;

function toJulian(date: Date): number {
  return date.valueOf() / 86400000 + J1970;
}

function fromJulian(j: number): Date {
  return new Date((j - J1970) * 86400000);
}

export type SunTimes = { sunrise: Date; sunset: Date } | null;

/**
 * @param date any instant on the local calendar day
 * @param lat  degrees north
 * @param lon  degrees east (negative for the Americas)
 */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  // Longitude west, positive — the convention the equation is written in.
  const lw = -lon;

  const n = Math.round(toJulian(date) - J2000 - 0.0009 - lw / 360);
  const meanSolarNoon = J2000 + 0.0009 + lw / 360 + n;

  // Solar mean anomaly.
  const M = (357.5291 + 0.98560028 * (meanSolarNoon - J2000)) % 360;
  // Equation of the centre.
  const C =
    1.9148 * Math.sin(M * DEG) +
    0.02 * Math.sin(2 * M * DEG) +
    0.0003 * Math.sin(3 * M * DEG);
  // Ecliptic longitude.
  const lambda = (M + C + 180 + 102.9372) % 360;

  const solarTransit =
    meanSolarNoon + 0.0053 * Math.sin(M * DEG) - 0.0069 * Math.sin(2 * lambda * DEG);

  // Declination of the sun.
  const sinDec = Math.sin(lambda * DEG) * Math.sin(23.44 * DEG);
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosOmega =
    (Math.sin(ZENITH * DEG) - Math.sin(lat * DEG) * sinDec) / (Math.cos(lat * DEG) * cosDec);

  // Polar day or polar night — no sunrise or sunset to report.
  if (cosOmega > 1 || cosOmega < -1) return null;

  const omega = Math.acos(cosOmega) / DEG;

  return {
    sunrise: fromJulian(solarTransit - omega / 360),
    sunset: fromJulian(solarTransit + omega / 360),
  };
}

/** "7:34 AM" in the given zone. */
export function formatTime(date: Date, timeZone = "America/Los_Angeles"): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** Hours of daylight, to one decimal. */
export function daylightHours(times: NonNullable<SunTimes>): number {
  return Math.round(((times.sunset.valueOf() - times.sunrise.valueOf()) / 3600000) * 10) / 10;
}
