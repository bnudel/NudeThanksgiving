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

export type TabKind =
  | "schedule"
  | "lodging"
  | "flights"
  | "activities"
  | "restaurants"
  | "payments"
  | "generic";

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
  /** How many hour columns the entry spans. */
  span: number;
};

export type ScheduleDay = {
  label: string;
  summary: string;
  events: ScheduleEvent[];
};

export type LegendEntry = { label: string; bg: string };

export type Schedule = {
  days: ScheduleDay[];
  legend: LegendEntry[];
};

export function parseSchedule(tab: Tab): Schedule {
  const rows = tab.rows;
  const hIdx = rows.findIndex((r) => rowHas(r, "Day", "Summary"));
  if (hIdx < 0) return { days: [], legend: [] };

  const header = rows[hIdx];
  // Column 0 = Day, column 1 = Summary, columns 2+ = hours.
  const hours = header.slice(2).map((c) => c.text);

  const days: ScheduleDay[] = [];
  const legend: LegendEntry[] = [];

  for (const row of rows.slice(hIdx + 1)) {
    const day = txt(row, 0);
    if (day) {
      const events: ScheduleEvent[] = [];
      let col = 0;
      for (const cell of row.slice(2)) {
        if (cell.text) {
          events.push({
            time: hours[col] ?? "",
            text: cell.text,
            bg: cell.bg,
            span: cell.colspan,
          });
        }
        col += cell.colspan;
      }
      days.push({ label: day, summary: txt(row, 1), events });
    } else {
      // A legend row: no day, but a label somewhere in the row.
      const labelCell = row.find((c) => c.text);
      if (!labelCell) continue;
      const swatch = row.find((c) => c.bg) ?? labelCell;
      legend.push({ label: labelCell.text, bg: swatch.bg });
    }
  }

  return { days, legend };
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

const COASTAL = /cannon|seaside|coast|manzanita|rockaway|tillamook|tillamoolk|nehalem|hug point|wheeler|ecola|short sand|oceanside|astoria/i;
const INLAND = /portland|pdx|vancouver|gorge|columbia|hillsboro|beaverton|multnomah|silver falls|willamette/i;

/**
 * How coastal a things-to-do tab looks, judged from its contents rather than
 * its tab name — the sheet's tab names aren't guaranteed to say "Cannon Beach".
 * Positive means coast, negative means Portland.
 */
export function coastAffinity(tab: Tab): number {
  const text = [tab.name, ...tab.rows.flatMap((r) => r.map((c) => c.text))].join(" \n ");
  const count = (re: RegExp) => (text.match(new RegExp(re.source, "gi")) ?? []).length;
  return count(COASTAL) - count(INLAND);
}

/**
 * A hike belongs on the coast list if its Location says so — or if its own
 * name is unmistakably coastal, since the hikes tab has no Location column
 * today and "Ecola" or "Short Sand" shouldn't need one.
 */
export function isCoastBound(activity: Activity): boolean {
  return COASTAL.test(activity.location) || COASTAL.test(activity.name);
}

export type ActivitySection = { tab: Tab; activities: Activity[] };

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

  // Nothing to fold into, or nothing to fold: render each tab as it comes.
  if (!hikeTabs.length || !listTabs.length) {
    return {
      sections: activityTabs.map((tab) => ({ tab, activities: parseActivities(tab) })),
      absorbed: [],
    };
  }

  const hikes = hikeTabs.flatMap(parseActivities);
  const scored = listTabs.map((tab) => ({ tab, score: coastAffinity(tab) }));
  const coastTab =
    listTabs.length > 1
      ? scored.reduce((best, cur) => (cur.score > best.score ? cur : best)).tab
      : null;
  const inlandTab =
    listTabs.length > 1
      ? scored.reduce((best, cur) => (cur.score < best.score ? cur : best)).tab
      : listTabs[0];

  const sections = listTabs.map((tab) => {
    const own = parseActivities(tab);
    let extra: Activity[] = [];
    if (tab === coastTab) extra = hikes.filter(isCoastBound);
    else if (tab === inlandTab) extra = hikes.filter((h) => !isCoastBound(h));
    return { tab, activities: [...own, ...extra] };
  });

  return { sections, absorbed: hikeTabs };
}

/* --------------------------------------------------------------- restaurants */

export type Restaurant = { name: string; location: string; notes: string; href?: string };

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

export function parseRestaurants(tab: Tab): Restaurant[] {
  const i = headerIndex(tab.rows);
  return tab.rows
    .slice(i + 1)
    .filter((r) => nonEmpty(r) > 0)
    .map((r) => {
      const href = r.find((c) => c.href)?.href;
      const rawNotes = txt(r, 2);
      const linkText = r.find((c) => /^https?:\/\//i.test(c.text))?.text;
      const url = href ?? linkText;
      const name = txt(r, 0) || (url ? nameFromUrl(url) : "");
      const notes = rawNotes && rawNotes === url ? "" : rawNotes;
      return { name, location: txt(r, 1), notes, href: url };
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
