import type { Cell, Tab } from "./sheet";

const txt = (row: Cell[] | undefined, i: number) => row?.[i]?.text?.trim() ?? "";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const rowHas = (row: Cell[], ...needles: string[]) => {
  const cells = row.map((c) => norm(c.text));
  return needles.every((n) => cells.includes(norm(n)));
};
const nonEmpty = (row: Cell[]) => row.filter((c) => c.text).length;

/**
 * Map a header row to column indexes by name. Reading columns by heading
 * rather than by position means a tab can gain, lose or reorder columns
 * without silently shifting data into the wrong field.
 */
export type Columns = Record<string, number>;

export function columnsOf(header: Cell[]): Columns {
  const map: Columns = {};
  header.forEach((cell, i) => {
    const key = norm(cell.text);
    if (key && !(key in map)) map[key] = i;
  });
  return map;
}

/** First matching column's text for this row, or "" if none of them exist. */
function col(row: Cell[], columns: Columns, ...names: string[]): string {
  for (const name of names) {
    const i = columns[norm(name)];
    if (i !== undefined) return txt(row, i);
  }
  return "";
}

function colCell(row: Cell[], columns: Columns, ...names: string[]): Cell | undefined {
  for (const name of names) {
    const i = columns[norm(name)];
    if (i !== undefined && row[i]) return row[i];
  }
  return undefined;
}

/**
 * Kept as a runtime array with the type derived from it, so tests can iterate
 * every kind and assert the lookup tables cover them. A bare union type is
 * only checked at build time, which is too late when the build runs on a
 * server somewhere else.
 */
export const TAB_KINDS = [
  "schedule",
  "lodging",
  "flights",
  "activities",
  "restaurants",
  "payments",
  "todo",
  "generic",
] as const;

export type TabKind = (typeof TAB_KINDS)[number];

/**
 * Identify a tab by the shape of its header row rather than its name, so
 * renaming a tab in the sheet doesn't break the site.
 */
export function classify(tab: Tab): TabKind {
  const header = findHeaderRow(tab.rows);
  if (!header) return "generic";
  if (rowHas(header, "Day", "Summary")) return "schedule";
  if (rowHas(header, "Dates") && rowHas(header, "Cancel policy")) return "lodging";
  if (rowHas(header, "Things to do") || rowHas(header, "Hike Name")) return "activities";
  if (rowHas(header, "Name") && (rowHas(header, "Arrival Day") || rowHas(header, "Depart Day")))
    return "flights";
  if (rowHas(header, "Done?") || rowHas(header, "Done")) return "todo";
  if (rowHas(header, "How Much")) return "payments";
  if (rowHas(header, "Name", "Location", "Notes")) return "restaurants";
  return "generic";
}

const DEFAULT_TITLES: Record<TabKind, string> = {
  schedule: "Schedule",
  lodging: "Lodging",
  flights: "Flights",
  activities: "Things to do",
  restaurants: "Restaurants",
  payments: "Payments",
  todo: "To do",
  generic: "More",
};

/** Prefer the sheet's own tab name; fall back to the detected kind. */
export function titleFor(tab: Tab, kind: TabKind): string {
  return tab.name.trim() || DEFAULT_TITLES[kind];
}

export function findHeaderRow(rows: Cell[][]): Cell[] | undefined {
  return rows.find((r) => nonEmpty(r) >= 2);
}

function headerIndex(rows: Cell[][]): number {
  return rows.findIndex((r) => nonEmpty(r) >= 2);
}

/* ------------------------------------------------------------------ schedule */

export type ScheduleEvent = {
  time: string;
  text: string;
  bg: string;
  fg: string;
  /** Activity type from the colour key, e.g. "Hiking". */
  type?: string;
  /** City from the colour key, e.g. "Portland, OR". */
  city?: string;
  /** How many hour columns the entry spans. */
  span: number;
};

export type ScheduleDay = {
  label: string;
  summary: string;
  driveTime: string;
  /** ISO date resolved from the label, e.g. "2026-11-21". */
  date?: string;
  /** Where most of the day happens, for weather and daylight. */
  city?: string;
  events: ScheduleEvent[];
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * "Saturday, November 21" -> "2026-11-21".
 *
 * The sheet doesn't carry a year, so we solve for it: pick the nearby year
 * where that date actually falls on the named weekday. Self-correcting if the
 * trip ever moves.
 */
export function resolveDayDate(label: string, today = new Date()): string | undefined {
  const m = label.match(/(?:([a-z]+)\s*,\s*)?([a-z]+)\.?\s+(\d{1,2})/i);
  if (!m) return undefined;
  const [, dow, monthName, dayStr] = m;
  const month = MONTHS.indexOf(monthName.toLowerCase());
  if (month < 0) return undefined;

  const day = Number(dayStr);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const base = today.getUTCFullYear();

  for (let y = base - 1; y <= base + 3; y++) {
    const d = new Date(Date.UTC(y, month, day));
    if (d.getUTCMonth() !== month || d.getUTCDate() !== day) continue;
    if (!dow) {
      // No weekday to match on: take the first occurrence not in the past.
      if (d.valueOf() >= Date.UTC(base, today.getUTCMonth(), today.getUTCDate())) return iso(d);
      continue;
    }
    const name = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    if (name.toLowerCase() === dow.toLowerCase()) return iso(d);
  }
  return undefined;
}

/** The city most of a day's entries sit in; ties go to where the day ends. */
function dominantCity(events: ScheduleEvent[]): string | undefined {
  const tally = new Map<string, number>();
  let last: string | undefined;
  for (const e of events) {
    if (!e.city) continue;
    tally.set(e.city, (tally.get(e.city) ?? 0) + e.span);
    last = e.city;
  }
  if (tally.size === 0) return undefined;

  let best: string | undefined;
  let bestCount = -1;
  for (const [city, count] of tally) {
    if (count > bestCount || (count === bestCount && city === last)) {
      best = city;
      bestCount = count;
    }
  }
  return best;
}

export type LegendEntry = { label: string; bg: string; fg: string };

export type Schedule = {
  days: ScheduleDay[];
  /** Fill colours: what kind of activity it is. */
  types: LegendEntry[];
  /** Text colours: which city it's in. */
  cities: LegendEntry[];
};

const HOUR = /^\d{1,2}\s*(am|pm)$/i;

/**
 * Expand a row into absolute column slots so merged cells don't shift
 * anything. A cell sits at its starting column; the columns it spans are
 * left empty.
 */
function byColumn(row: Cell[]): (Cell | undefined)[] {
  const out: (Cell | undefined)[] = [];
  let i = 0;
  for (const cell of row) {
    out[i] = cell;
    i += cell.colspan;
  }
  return out;
}

/** Place names used to guess a city when the colour doesn't resolve. */
const CITY_HINTS: [RegExp, string][] = [
  [/cannon beach|seaside|ecola|hug point|short sand|manzanita|wheeler|rockway|rockaway|tillamoolk|tillamook|arch cape/i, "Cannon Beach, OR"],
  [/vancouver|beacon rock|bonneville|hot springs|big al/i, "Vancouver, WA"],
  [/portland|pdx|japaneese|japanese garden|hopscotch|aerial tram|din thai|din tai|top golf|saturday market|winery|quarterworld|kingpins/i, "Portland, OR"],
];

function cityFromText(text: string): string | undefined {
  for (const [re, city] of CITY_HINTS) if (re.test(text)) return city;
  return undefined;
}

/** "Cannon Beach, OR" / "Vancouver, WA" — a key entry naming a place. */
export function isPlaceLabel(label: string): boolean {
  return /,\s*(or|wa|oregon|washington)\.?\s*$/i.test(label.trim());
}

export function parseSchedule(tab: Tab): Schedule {
  const rows = tab.rows;
  const hIdx = rows.findIndex((r) => rowHas(r, "Day", "Summary"));
  if (hIdx < 0) return { days: [], types: [], cities: [] };

  // Hour columns are found by their heading ("7am"), so inserting a column
  // like "Total Drive Time" can't shift the timeline.
  const header = byColumn(rows[hIdx]);
  const hourLabel = new Map<number, string>();
  let firstHour = Number.POSITIVE_INFINITY;
  header.forEach((cell, i) => {
    if (cell && HOUR.test(cell.text.trim())) {
      hourLabel.set(i, cell.text.trim());
      firstHour = Math.min(firstHour, i);
    }
  });

  const indexOf = (...names: string[]) => {
    for (const name of names) {
      const i = header.findIndex((c) => c && norm(c.text) === norm(name));
      if (i >= 0) return i;
    }
    return -1;
  };
  const summaryAt = indexOf("Summary");
  const driveAt = indexOf("Total Drive Time", "Drive Time");

  const days: ScheduleDay[] = [];
  const legendRows: LegendEntry[] = [];

  for (const raw of rows.slice(hIdx + 1)) {
    const cols = byColumn(raw);
    const day = cols[0]?.text ?? "";

    if (day) {
      const events: ScheduleEvent[] = [];
      cols.forEach((cell, i) => {
        if (!cell || !cell.text || i < firstHour) return;
        events.push({
          time: hourLabel.get(i) ?? "",
          text: cell.text,
          bg: cell.bg,
          fg: cell.fg,
          span: cell.colspan,
        });
      });
      days.push({
        label: day,
        summary: summaryAt >= 0 ? (cols[summaryAt]?.text ?? "") : "",
        driveTime: driveAt >= 0 ? (cols[driveAt]?.text ?? "") : "",
        events,
      });
      continue;
    }

    // A key row: no day, but a label somewhere in the row.
    const labelCell = raw.find((c) => c.text);
    if (!labelCell) continue;
    if (norm(labelCell.text) === "key") continue;
    legendRows.push({
      label: labelCell.text,
      bg: raw.find((c) => c.bg)?.bg ?? "",
      fg: raw.find((c) => c.fg)?.fg ?? "",
    });
  }

  // A key entry naming a place ("Cannon Beach, OR") is a city; everything else
  // describes the kind of activity. Splitting on the label rather than on
  // which colour channel happens to be set means a city still appears in the
  // key whether it was coloured by fill, by text colour, or not at all.
  const types = legendRows.filter((e) => !isPlaceLabel(e.label));
  const cities = legendRows.filter((e) => isPlaceLabel(e.label));

  const typeByBg = new Map(types.filter((e) => e.bg).map((e) => [e.bg, e.label]));
  const cityByFg = new Map(cities.filter((e) => e.fg).map((e) => [e.fg, e.label]));
  const cityByBg = new Map(cities.filter((e) => e.bg).map((e) => [e.bg, e.label]));

  for (const day of days) {
    for (const event of day.events) {
      event.type = (event.bg && typeByBg.get(event.bg)) || undefined;
      event.city =
        (event.fg && cityByFg.get(event.fg)) ||
        (event.bg && cityByBg.get(event.bg)) ||
        cityFromText(event.text) ||
        undefined;
    }
    day.date = resolveDayDate(day.label);
    day.city = dominantCity(day.events);
  }

  return { days, types, cities };
}

/* ------------------------------------------------------------------- lodging */

export type Stay = {
  /** "Option 1" and friends — the label column left of Dates. */
  label: string;
  dates: string;
  acct: string;
  cost: string;
  location: string;
  cancel: string;
  status: string;
  /** The sheet says this one is already paid for. */
  paid: boolean;
};

/** Options are grouped under a location heading like "Portland". */
export type LodgingGroup = { name: string; stays: Stay[] };

const isLodgingHeader = (row: Cell[]) =>
  rowHas(row, "Dates") && rowHas(row, "Cancel policy");

/**
 * The lodging tab is a stack of sections: a location heading on its own row,
 * then a header row, then one row per candidate option. Sections repeat, so
 * this walks the rows rather than assuming a single header at the top.
 */
export function parseLodging(tab: Tab): LodgingGroup[] {
  const groups: LodgingGroup[] = [];
  let columns: Columns | null = null;
  let current: LodgingGroup | null = null;

  const open = (name: string) => {
    current = { name, stays: [] };
    groups.push(current);
    return current;
  };

  for (const row of tab.rows) {
    if (!nonEmpty(row)) continue;

    if (isLodgingHeader(row)) {
      columns = columnsOf(row);
      continue;
    }

    // A lone cell on a row is a section heading, not a booking.
    if (nonEmpty(row) === 1) {
      open(row.find((c) => c.text)!.text);
      continue;
    }

    if (!columns) continue;
    if (!current) open("");

    const cost = col(row, columns, "Cost");
    // The label column has a blank heading, so find it by position: whatever
    // sits left of Dates.
    const datesAt = columns[norm("Dates")] ?? 0;
    const label = datesAt > 0 ? txt(row, datesAt - 1) : "";

    current!.stays.push({
      label,
      dates: col(row, columns, "Dates"),
      acct: col(row, columns, "Acct", "Account"),
      cost,
      location: col(row, columns, "Location", "Address"),
      cancel: col(row, columns, "Cancel policy", "Cancellation"),
      status: col(row, columns, "Status", "Booked", "Decision"),
      paid: /\bpaid\b/i.test(cost),
    });
  }

  return groups.filter((g) => g.stays.length > 0);
}

/** Total options across all groups, for the section subheading. */
export function countStays(groups: LodgingGroup[]): number {
  return groups.reduce((n, g) => n + g.stays.length, 0);
}

/* ------------------------------------------------------------------- flights */

export type Leg = { day: string; time: string; details: string };
export type Traveler = { name: string; arrive?: Leg; depart?: Leg };

export function parseFlights(tab: Tab): Traveler[] {
  const byName = new Map<string, Traveler>();
  const order: string[] = [];
  let mode: "arrive" | "depart" | null = null;

  for (const row of tab.rows) {
    const first = norm(txt(row, 0));
    if (first === "name") {
      const second = norm(txt(row, 1));
      mode = second.startsWith("depart") ? "depart" : "arrive";
      continue;
    }
    const name = txt(row, 0);
    if (!name || !mode) continue;

    if (!byName.has(name)) {
      byName.set(name, { name });
      order.push(name);
    }
    const leg: Leg = { day: txt(row, 1), time: txt(row, 2), details: txt(row, 3) };
    if (!leg.day && !leg.time && !leg.details) {
      byName.get(name)![mode] = undefined;
    } else {
      byName.get(name)![mode] = leg;
    }
  }

  return order.map((n) => byName.get(n)!);
}

/* ---------------------------------------------------------------- activities */

export type Activity = {
  name: string;
  location: string;
  needsReservation: string;
  when: string;
  rank: string;
  notes: string;
  href?: string;
  /** Came from a hikes tab — rendered with a mountain marker. */
  isHike: boolean;
};

/** A tab whose rows are hikes rather than a general things-to-do list. */
export function isHikeTab(tab: Tab): boolean {
  const header = findHeaderRow(tab.rows);
  return !!header && rowHas(header, "Hike Name");
}

/**
 * Columns are read by heading, so the coast tab (Things to do / Location /
 * Notes), the Portland tab (six columns) and the Hikes tab (Hike Name /
 * Notes) all parse correctly without special cases.
 */
export function parseActivities(tab: Tab): Activity[] {
  const i = headerIndex(tab.rows);
  if (i < 0) return [];
  const columns = columnsOf(tab.rows[i]);
  const nameAt =
    columns[norm("Things to do")] ??
    columns[norm("Hike Name")] ??
    columns[norm("Activity")] ??
    columns[norm("Name")] ??
    0;

  const hike = isHikeTab(tab);

  return tab.rows
    .slice(i + 1)
    .filter((r) => txt(r, nameAt))
    .map((r) => ({
      name: txt(r, nameAt),
      location: col(r, columns, "Location"),
      needsReservation: col(r, columns, "Need Reservation?", "Need Reservation", "Reservation"),
      when: col(r, columns, "Reservation Date and Time", "Date and Time", "When"),
      rank: col(r, columns, "Rank of Importance", "Rank", "Priority"),
      notes: col(r, columns, "Notes"),
      href: r[nameAt]?.href ?? colCell(r, columns, "Notes")?.href,
      isHike: hike,
    }));
}

/* ------------------------------------------------- merging the hikes tab */

const COASTAL = /cannon|seaside|manzanita|rockaway|tillamook|tillamoolk|nehalem|hug point|wheeler|ecola|short sand|arch cape|oceanside|astoria/i;
const PORTLAND = /portland|pdx|hillsboro|beaverton|hawthorne|multnomah|willamette|gresham/i;
const WASHINGTON = /vancouver|\bwa\b|washington|stevenson|bonneville|beacon rock|cascade locks|bridge of the gods/i;

const PLACES: [ActivityRole, RegExp][] = [
  ["coast", COASTAL],
  ["inland", PORTLAND],
  ["washington", WASHINGTON],
];

function hits(tab: Tab, re: RegExp): number {
  const text = [tab.name, ...tab.rows.flatMap((r) => r.map((c) => c.text))].join(" \n ");
  return (text.match(new RegExp(re.source, "gi")) ?? []).length;
}

/**
 * How coastal a things-to-do tab looks, judged from its contents rather than
 * its tab name — the sheet's tab names aren't guaranteed to say "Cannon Beach".
 * Positive means coast.
 */
export function coastAffinity(tab: Tab): number {
  return hits(tab, COASTAL) - Math.max(hits(tab, PORTLAND), hits(tab, WASHINGTON));
}

/** Best-matching place for a things-to-do tab, or "other" if nothing fits. */
export function placeOf(tab: Tab): ActivityRole {
  let best: ActivityRole = "other";
  let bestScore = 0;
  for (const [role, re] of PLACES) {
    const score = hits(tab, re);
    if (score > bestScore) {
      bestScore = score;
      best = role;
    }
  }
  return best;
}

/**
 * A hike belongs on the coast list if its Location says so — or if its own
 * name is unmistakably coastal, since the hikes tab has no Location column
 * today and "Ecola" or "Short Sand" shouldn't need one.
 */
export function isCoastBound(activity: Activity): boolean {
  return COASTAL.test(activity.location) || COASTAL.test(activity.name);
}

/** Which things-to-do list this is. */
export const ACTIVITY_ROLES = ["coast", "inland", "washington", "other"] as const;
export type ActivityRole = (typeof ACTIVITY_ROLES)[number];

export type ActivitySection = {
  tab: Tab;
  activities: Activity[];
  role: ActivityRole;
  /** What to show on the toggle button. */
  label: string;
};

const ROLE_LABELS: Record<ActivityRole, string> = {
  coast: "Cannon Beach",
  inland: "Portland",
  washington: "Washington",
  other: "",
};

/** Prefer a place name we're confident about; fall back to the sheet's tab name. */
export function labelFor(tab: Tab, role: ActivityRole): string {
  return ROLE_LABELS[role] || tab.name.trim() || "Things to do";
}

/**
 * Fold hikes into the things-to-do lists instead of giving them their own
 * section. Hikes default to the most Portland-ish list; putting "Cannon Beach"
 * or "Coast" in a hike's Location cell moves it to the coast list.
 *
 * Returns the sections to render plus the tabs that were absorbed, so the
 * caller can drop them from the page and the nav.
 */
export function mergeActivityTabs(activityTabs: Tab[]): {
  sections: ActivitySection[];
  absorbed: Tab[];
} {
  const hikeTabs = activityTabs.filter(isHikeTab);
  const listTabs = activityTabs.filter((t) => !isHikeTab(t));

  const listOrAll = listTabs.length ? listTabs : activityTabs;

  // Assign each list a place from its contents, so tab names don't have to
  // spell it out. If two tabs claim the same place, the stronger match keeps
  // it and the other falls back to its own tab name.
  const claims = new Map<ActivityRole, { tab: Tab; score: number }>();
  const roles = new Map<Tab, ActivityRole>();

  for (const tab of listOrAll) {
    const role = placeOf(tab);
    roles.set(tab, role);
    if (role === "other") continue;
    const held = claims.get(role);
    const score = hits(tab, PLACES.find(([r]) => r === role)![1]);
    if (!held || score > held.score) {
      if (held) roles.set(held.tab, "other");
      claims.set(role, { tab, score });
    } else {
      roles.set(tab, "other");
    }
  }

  const roleOf = (tab: Tab): ActivityRole => roles.get(tab) ?? "other";
  const coastTab = claims.get("coast")?.tab ?? null;
  // Hikes that aren't coastal belong with Portland; if there's no Portland
  // list, the first list takes them.
  const inlandTab = claims.get("inland")?.tab ?? listTabs.find((t) => t !== coastTab) ?? null;

  // Nothing to fold into, or nothing to fold: render each tab as it comes.
  if (!hikeTabs.length || !listTabs.length) {
    return {
      sections: activityTabs.map((tab) => {
        const role = roleOf(tab);
        return { tab, activities: parseActivities(tab), role, label: labelFor(tab, role) };
      }),
      absorbed: [],
    };
  }

  const hikes = hikeTabs.flatMap(parseActivities);

  const sections = listTabs.map((tab) => {
    const own = parseActivities(tab);
    let extra: Activity[] = [];
    if (tab === coastTab) extra = hikes.filter(isCoastBound);
    else if (tab === inlandTab) extra = hikes.filter((h) => !isCoastBound(h));
    const role = roleOf(tab);
    return { tab, activities: [...own, ...extra], role, label: labelFor(tab, role) };
  });

  return { sections, absorbed: hikeTabs };
}

/* --------------------------------------------------------------- restaurants */

export type Restaurant = {
  name: string;
  location: string;
  notes: string;
  /** "Thai BBQ", "Korean", … */
  cuisine: string;
  /** e.g. "Trivia Wed 7-9", pulled out of the notes. */
  trivia: string;
  /** Opening constraints found in the notes, e.g. "Wed-Sat". */
  hours: string[];
  href?: string;
};

/** Turn eempdx.com / hanoakpdx.com / kmdpdx.com / dtf.com into a readable name. */
export function nameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    const known: Record<string, string> = {
      eempdx: "Eem",
      hanoakpdx: "Han Oak",
      kmdpdx: "Kann",
      dtf: "Din Tai Fung",
    };
    if (known[base]) return known[base];
    const stripped = base.replace(/pdx$/, "");
    return stripped.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

/** "Trivia Wed 7-9" and similar, so it can be pilled separately. */
const TRIVIA = /\btrivia\b[^,;]*/i;
/** Day-range or last-entry style constraints worth surfacing. */
const HOURS = [
  /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\s*[-–]\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\b/i,
  /\blast entry[^,;]*/i,
  /\bclosed[^,;]*/i,
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  /\bcan book[^,;]*/i,
];

export function parseRestaurants(tab: Tab): Restaurant[] {
  const i = headerIndex(tab.rows);
  if (i < 0) return [];
  const columns = columnsOf(tab.rows[i]);

  return tab.rows
    .slice(i + 1)
    .filter((r) => nonEmpty(r) > 0)
    .map((r) => {
      const href =
        colCell(r, columns, "Website", "Link", "URL")?.href ?? r.find((c) => c.href)?.href;
      const linkText =
        col(r, columns, "Website", "Link", "URL") ||
        (r.find((c) => /^https?:\/\//i.test(c.text))?.text ?? "");
      const url = href || (/^https?:\/\//i.test(linkText) ? linkText : undefined);

      const name = col(r, columns, "Name") || (url ? nameFromUrl(url) : "");
      const rawNotes = col(r, columns, "Notes");
      const notes = rawNotes && rawNotes === url ? "" : rawNotes;

      const trivia = notes.match(TRIVIA)?.[0]?.trim() ?? "";
      const hours: string[] = [];
      let rest = trivia ? notes.replace(TRIVIA, "") : notes;
      for (const re of HOURS) {
        const hit = rest.match(re)?.[0]?.trim();
        if (hit) {
          hours.push(hit);
          rest = rest.replace(re, "");
        }
      }

      return {
        name,
        location: col(r, columns, "Location", "Address"),
        cuisine: col(r, columns, "Type of Food", "Type", "Cuisine"),
        notes: rest.replace(/\s*[,;]\s*/g, ", ").replace(/^[\s,;]+|[\s,;]+$/g, ""),
        trivia,
        hours,
        href: url,
      };
    })
    .filter((r) => r.name || r.href);
}

/* ------------------------------------------------------------------ payments */

export type Payment = { date: string; what: string; amount: string };

export function parsePayments(tab: Tab): Payment[] {
  const i = headerIndex(tab.rows);
  return tab.rows
    .slice(i + 1)
    .filter((r) => nonEmpty(r) > 0)
    .map((r) => ({ date: txt(r, 0), what: txt(r, 1), amount: txt(r, 2) }));
}

/* ---------------------------------------------------------------------- todo */

export type TodoItem = {
  task: string;
  when: string;
  who: string;
  done: boolean;
  details: string;
  notes: string;
};

export type TodoGroup = { name: string; items: TodoItem[] };

/**
 * What a ticked checkbox looks like once it's been through "Publish to web".
 *
 * Google renders checkbox cells inconsistently depending on the sheet: TRUE /
 * FALSE text, a 1 or 0, a ballot-box glyph, a tick, or a real checkbox input.
 * All of them are accepted so a ticked box reads as done whichever way this
 * particular sheet exports.
 */
const CHECKED = new Set([
  "true",
  "t",
  "yes",
  "y",
  "1",
  "done",
  "complete",
  "completed",
  "booked",
  "x",
  "checked",
  "✓",
  "✔",
  "✅",
  "☑",
  "☑️",
  "☒",
  "🗹",
]);

export function isChecked(value: string): boolean {
  // Strip the variation selector some tick emoji carry.
  const v = value.trim().toLowerCase().replace(/️/g, "");
  return CHECKED.has(v);
}

export function parseTodos(tab: Tab): TodoGroup[] {
  const i = headerIndex(tab.rows);
  if (i < 0) return [];
  const columns = columnsOf(tab.rows[i]);
  const taskAt = columns[norm("Type")] ?? columns[norm("Task")] ?? 0;

  const groups: TodoGroup[] = [];
  let current: TodoGroup | null = null;

  for (const row of tab.rows.slice(i + 1)) {
    if (!nonEmpty(row)) continue;

    const label = txt(row, taskAt);
    if (!label) continue;

    const doneRaw = col(row, columns, "Done?", "Done", "Complete");
    const struck = row[taskAt]?.strike === true;

    // A section heading is a lone label with no checkbox beside it. Testing
    // for the checkbox — not just for a lone cell — matters because a task
    // whose only filled-in field is its name would otherwise be swallowed as
    // a heading, taking the rest of its group with it.
    if (nonEmpty(row) === 1 && !doneRaw.trim() && !struck) {
      current = { name: label, items: [] };
      groups.push(current);
      continue;
    }

    if (!current) {
      current = { name: "", items: [] };
      groups.push(current);
    }

    current.items.push({
      task: label,
      when: col(row, columns, "When?", "When", "Deadline"),
      who: col(row, columns, "Who?", "Who", "Owner"),
      // A struck-through task counts as finished too, not just a ticked box.
      done: isChecked(doneRaw) || struck,
      details: col(row, columns, "Details if Booked", "Details"),
      notes: col(row, columns, "Notes"),
    });
  }

  return groups.filter((g) => g.items.length > 0);
}

export function countTodos(groups: TodoGroup[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const g of groups) {
    for (const item of g.items) {
      total += 1;
      if (item.done) done += 1;
    }
  }
  return { done, total };
}

/* ------------------------------------------------------------------- generic */

export type GenericTable = { headers: string[]; rows: { text: string; href?: string }[][] };

export function parseGeneric(tab: Tab): GenericTable {
  const i = headerIndex(tab.rows);
  if (i < 0) return { headers: [], rows: [] };
  const headers = tab.rows[i].map((c) => c.text);
  const rows = tab.rows
    .slice(i + 1)
    .filter((r) => nonEmpty(r) > 0)
    .map((r) => r.map((c) => ({ text: c.text, href: c.href })));
  return { headers, rows };
}

/* --------------------------------------------------------------------- utils */

/** A stable #anchor id for a tab name. */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "tab"
  );
}
