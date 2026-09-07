import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { describe, fetchForecasts, formatDate, lookup, placeForCity } from "./weather.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: () => unknown, ok = true, status = 200) {
  globalThis.fetch = (async () =>
    ({
      ok,
      status,
      json: async () => handler(),
    }) as unknown as Response) as typeof fetch;
}

/** Real date arithmetic — Nov 21 + 15 is Dec 6, not Nov 36. */
const isoFrom = (start: string, offset: number) => {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const dailyFor = (days: number) => ({
  daily: {
    time: Array.from({ length: days }, (_, i) => isoFrom("2026-11-21", i)),
    weather_code: Array.from({ length: days }, () => 61),
    temperature_2m_max: Array.from({ length: days }, () => 52.3),
    temperature_2m_min: Array.from({ length: days }, () => 41.8),
    precipitation_probability_max: Array.from({ length: days }, () => 70),
    precipitation_sum: Array.from({ length: days }, () => 0.21),
    wind_speed_10m_max: Array.from({ length: days }, () => 14.2),
  },
});

test("describe maps WMO codes to a sky and a label", () => {
  assert.deepEqual(describe(0), { sky: "clear", label: "Clear" });
  assert.deepEqual(describe(3), { sky: "cloud", label: "Overcast" });
  assert.deepEqual(describe(48), { sky: "fog", label: "Fog" });
  assert.deepEqual(describe(53), { sky: "drizzle", label: "Drizzle" });
  assert.deepEqual(describe(65), { sky: "rain", label: "Rain" });
  assert.deepEqual(describe(81), { sky: "rain", label: "Showers" });
  assert.deepEqual(describe(75), { sky: "snow", label: "Snow" });
  assert.deepEqual(describe(95), { sky: "storm", label: "Thunderstorm" });
  assert.equal(describe(12345).sky, "cloud", "an unknown code still renders something");
});

test("formatDate doesn't drift across timezones", () => {
  // Parsed as UTC and formatted as UTC, so a date never slips a day backwards
  // for anyone running west of Greenwich.
  assert.deepEqual(formatDate("2026-11-26"), { dow: "Thu", day: "Nov 26" });
  assert.deepEqual(formatDate("2026-01-01"), { dow: "Thu", day: "Jan 1" });
});

test("a good response yields seven days per place", async () => {
  mockFetch(() => dailyFor(7));
  const forecasts = await fetchForecasts();

  assert.deepEqual(forecasts.map((f) => f.place), ["Cannon Beach", "Portland"]);
  assert.equal(forecasts[0].days.length, 7);
  assert.deepEqual(forecasts[0].days[0], {
    date: "2026-11-21",
    code: 61,
    hi: 52.3,
    lo: 41.8,
    chance: 70,
    inches: 0.21,
    windMph: 14.2,
  });
});

test("the full forecast window is kept for date lookups", async () => {
  // Days are matched to schedule dates, so every day the API returns is
  // useful — trimming to a week would hide the back half of the trip.
  mockFetch(() => dailyFor(16));
  const [first] = await fetchForecasts();
  assert.equal(first.days.length, 16);
  assert.equal(first.days.at(-1)?.date, "2026-12-06");
});

test("lookup finds a day by place and date, and misses safely", async () => {
  mockFetch(() => dailyFor(16));
  const forecasts = await fetchForecasts();

  assert.equal(lookup(forecasts, "Portland", "2026-11-26")?.hi, 52.3);
  assert.equal(lookup(forecasts, "Portland", "2026-11-20"), undefined, "before the window");
  assert.equal(lookup(forecasts, "Portland", "2027-01-01"), undefined, "after the window");
  assert.equal(lookup(forecasts, "Nowhere", "2026-11-26"), undefined, "unknown place");
  assert.equal(lookup(forecasts, "Portland", undefined), undefined, "unresolved date");
  assert.equal(lookup([], "Portland", "2026-11-26"), undefined, "no forecast at all");
});

test("each schedule city maps to the right forecast station", () => {
  assert.equal(placeForCity("Cannon Beach, OR").name, "Cannon Beach");
  assert.equal(placeForCity("Seaside, OR").name, "Cannon Beach");
  assert.equal(placeForCity("Portland, OR").name, "Portland");
  // Vancouver's weather is Portland's; it doesn't get its own request.
  assert.equal(placeForCity("Vancouver, WA").name, "Portland");
  assert.equal(placeForCity(undefined).name, "Portland", "unknown days default inland");
});

test("an API outage degrades to an empty list rather than throwing", async () => {
  mockFetch(() => ({}), false, 503);
  assert.deepEqual(await fetchForecasts(), [], "the page still renders without a forecast");

  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  assert.deepEqual(await fetchForecasts(), []);
});

test("a malformed payload is discarded, not half-rendered", async () => {
  mockFetch(() => ({ daily: { time: "not an array" } }));
  assert.deepEqual(await fetchForecasts(), []);

  mockFetch(() => ({ hourly: {} }));
  assert.deepEqual(await fetchForecasts(), []);
});

test("missing columns become nulls instead of NaN", async () => {
  mockFetch(() => ({
    daily: {
      time: ["2026-11-21"],
      weather_code: [3],
      // No temperatures, probability, precipitation or wind at all.
    },
  }));
  const [first] = await fetchForecasts();
  const day = first.days[0];

  assert.equal(day.code, 3);
  assert.equal(day.hi, null);
  assert.equal(day.lo, null);
  assert.equal(day.chance, null);
  assert.equal(day.windMph, null);
});

test("nulls inside a column stay null", async () => {
  mockFetch(() => ({
    daily: {
      time: ["2026-11-21", "2026-11-22"],
      weather_code: [3, 61],
      temperature_2m_max: [null, 50.1],
      temperature_2m_min: [38.2, null],
    },
  }));
  const [first] = await fetchForecasts();
  assert.equal(first.days[0].hi, null);
  assert.equal(first.days[0].lo, 38.2);
  assert.equal(first.days[1].hi, 50.1);
  assert.equal(first.days[1].lo, null);
});
