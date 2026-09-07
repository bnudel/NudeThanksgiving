/**
 * Typical late-November conditions, averaged from ten years of actual
 * observations.
 *
 * The forecast only reaches ~16 days out, so until November the schedule days
 * would show nothing but daylight. These normals fill that gap with real
 * measured history rather than invented figures, and step aside the moment a
 * genuine forecast exists for a day.
 */

import { PLACES, type Place } from "./weather";

export type Normals = {
  place: string;
  /** Mean daily high, °F. */
  hi: number;
  /** Mean daily low, °F. */
  lo: number;
  /** Mean daily precipitation, inches. */
  inches: number;
  /** Share of days with measurable rain, 0–100. */
  wetPct: number;
  /** How many observed days went into the average. */
  samples: number;
};

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

/** The window either side of the trip that counts as "this time of year". */
const FROM_MONTH = 11;
const FROM_DAY = 15;
const TO_DAY = 30;
const YEARS = 10;

type DailyBlock = Record<string, unknown> & { time?: unknown };

function numberAt(daily: DailyBlock, key: string, i: number): number | null {
  const arr = daily[key];
  if (!Array.isArray(arr)) return null;
  const v = arr[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function fetchNormals(place: Place): Promise<Normals | null> {
  // Archive data lags a few days, so end on last year to stay safely inside it.
  const lastYear = new Date().getUTCFullYear() - 1;
  const start = `${lastYear - YEARS + 1}-${String(FROM_MONTH).padStart(2, "0")}-${FROM_DAY}`;
  const end = `${lastYear}-${String(FROM_MONTH).padStart(2, "0")}-${TO_DAY}`;

  const url =
    `${ARCHIVE}?latitude=${place.lat}&longitude=${place.lon}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FLos_Angeles`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;

    const json = (await res.json()) as { daily?: DailyBlock };
    const daily = json.daily;
    const time = daily?.time;
    if (!daily || !Array.isArray(time)) return null;

    let his = 0;
    let los = 0;
    let precip = 0;
    let wet = 0;
    let n = 0;

    time.forEach((raw, i) => {
      const date = String(raw);
      const [, m, d] = date.split("-").map(Number);
      // Only the days that sit around the trip, not the whole span between.
      if (m !== FROM_MONTH || d < FROM_DAY || d > TO_DAY) return;

      const hi = numberAt(daily, "temperature_2m_max", i);
      const lo = numberAt(daily, "temperature_2m_min", i);
      const mm = numberAt(daily, "precipitation_sum", i);
      if (hi === null || lo === null) return;

      his += hi;
      los += lo;
      if (mm !== null) {
        precip += mm;
        if (mm >= 0.01) wet += 1;
      }
      n += 1;
    });

    if (n === 0) return null;

    return {
      place: place.name,
      hi: Math.round((his / n) * 10) / 10,
      lo: Math.round((los / n) * 10) / 10,
      inches: Math.round((precip / n) * 100) / 100,
      wetPct: Math.round((wet / n) * 100),
      samples: n,
    };
  } catch {
    return null;
  }
}

export async function fetchClimate(): Promise<Normals[]> {
  const results = await Promise.all(PLACES.map(fetchNormals));
  return results.filter((r): r is Normals => r !== null);
}

export function normalsFor(normals: Normals[], place: string): Normals | undefined {
  return normals.find((n) => n.place === place);
}
