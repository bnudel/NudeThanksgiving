/**
 * Seven-day forecast for the two places we're staying, from Open-Meteo.
 * Free, no API key, no attribution requirement. Fetched server-side so no
 * key or quota is ever exposed to the browser.
 */

export type Place = { name: string; lat: number; lon: number };

export const PLACES: Place[] = [
  { name: "Cannon Beach", lat: 45.8918, lon: -123.9615 },
  { name: "Portland", lat: 45.5152, lon: -122.6784 },
];

export type DayWeather = {
  /** ISO date, e.g. "2026-09-08" */
  date: string;
  code: number;
  hi: number | null;
  lo: number | null;
  /** Chance of precipitation, percent. */
  chance: number | null;
  /** Inches of precipitation. */
  inches: number | null;
  windMph: number | null;
};

export type PlaceForecast = { place: string; days: DayWeather[] };

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "precipitation_sum",
  "wind_speed_10m_max",
].join(",");

/** Open-Meteo returns parallel arrays; nothing is guaranteed to be present. */
type DailyBlock = Record<string, unknown> & { time?: unknown };

function column(daily: DailyBlock, key: string, i: number): number | null {
  const arr = daily[key];
  if (!Array.isArray(arr)) return null;
  const v = arr[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function fetchPlace(place: Place): Promise<PlaceForecast | null> {
  const url =
    `${ENDPOINT}?latitude=${place.lat}&longitude=${place.lon}` +
    `&daily=${DAILY}` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&timezone=America%2FLos_Angeles&forecast_days=7`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;

    const json = (await res.json()) as { daily?: DailyBlock };
    const daily = json.daily;
    const time = daily?.time;
    if (!daily || !Array.isArray(time) || time.length === 0) return null;

    const days: DayWeather[] = time.slice(0, 7).map((date, i) => ({
      date: String(date),
      code: column(daily, "weather_code", i) ?? 3,
      hi: column(daily, "temperature_2m_max", i),
      lo: column(daily, "temperature_2m_min", i),
      chance: column(daily, "precipitation_probability_max", i),
      inches: column(daily, "precipitation_sum", i),
      windMph: column(daily, "wind_speed_10m_max", i),
    }));

    return { place: place.name, days };
  } catch {
    // A weather outage must never take the trip page down with it.
    return null;
  }
}

export async function fetchForecasts(): Promise<PlaceForecast[]> {
  const results = await Promise.all(PLACES.map(fetchPlace));
  return results.filter((r): r is PlaceForecast => r !== null);
}

/* ------------------------------------------------------------- WMO codes */

export type Sky = "clear" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** https://open-meteo.com/en/docs — WMO weather interpretation codes. */
export function describe(code: number): { sky: Sky; label: string } {
  if (code === 0) return { sky: "clear", label: "Clear" };
  if (code === 1) return { sky: "clear", label: "Mostly clear" };
  if (code === 2) return { sky: "partly", label: "Partly cloudy" };
  if (code === 3) return { sky: "cloud", label: "Overcast" };
  if (code === 45 || code === 48) return { sky: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { sky: "drizzle", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { sky: "rain", label: "Rain" };
  if (code >= 71 && code <= 77) return { sky: "snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { sky: "rain", label: "Showers" };
  if (code === 85 || code === 86) return { sky: "snow", label: "Snow showers" };
  // WMO codes stop at 99; anything beyond is bad data, not a storm.
  if (code >= 95 && code <= 99) return { sky: "storm", label: "Thunderstorm" };
  return { sky: "cloud", label: "Cloudy" };
}

/** "2026-09-08" -> { dow: "Tue", day: "Sep 8" } without timezone drift. */
export function formatDate(iso: string): { dow: string; day: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return {
    dow: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}
