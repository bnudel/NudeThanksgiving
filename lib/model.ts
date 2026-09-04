import type { Cell, Tab } from "./sheet";

const txt = (row: Cell[] | undefined, i: number) => row?.[i]?.text?.trim() ?? "";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const rowHas = (row: Cell[], ...needles: string[]) => {
  const cells = row.map((c) => norm(c.text));
  return needles.every((n) => cells.includes(norm(n)));
};
const nonEmpty = (row: Cell[]) => row.filter((c) => c.text).length;

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
  if (rowHas(header, "Things to do")) return "activities";
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
  dates: string;
  acct: string;
  cost: string;
  location: string;
  cancel: string;
};

export function parseLodging(tab: Tab): Stay[] {
  const i = headerIndex(tab.rows);
  return tab.rows
    .slice(i + 1)
    .filter((r) => nonEmpty(r) > 0)
    .map((r) => ({
      dates: txt(r, 0),
      acct: txt(r, 1),
      cost: txt(r, 2),
      location: txt(r, 3),
      cancel: txt(r, 4),
    }));
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
};

export function parseActivities(tab: Tab): Activity[] {
  const i = headerIndex(tab.rows);
  return tab.rows
    .slice(i + 1)
    .filter((r) => txt(r, 0))
    .map((r) => ({
      name: txt(r, 0),
      location: txt(r, 1),
      needsReservation: txt(r, 2),
      when: txt(r, 3),
      rank: txt(r, 4),
      notes: txt(r, 5),
      href: r[0]?.href ?? r[5]?.href,
    }));
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
