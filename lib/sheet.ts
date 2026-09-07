import {
  cellsFromCsv,
  parseCsv,
  parseGrid,
  parseStyles,
  parseTabIndex,
  type Cell,
} from "./parse";

export type { Cell } from "./parse";

/**
 * The "Publish to web" id — the 2PACX-… string, NOT the id in the /edit URL.
 * Get it from File → Share → Publish to web; the link looks like
 * https://docs.google.com/spreadsheets/d/e/<PUB_ID>/pubhtml
 */
export const PUB_ID =
  process.env.SHEET_PUB_ID ??
  "2PACX-1vS21UA-jmPwn8Rk8R3aGzl_xejKnzwnWBHx7Ephbh7SWXIk_rafMiyoqRmjeqgwcOCWJXS1XAwykHFF";

/** The editable spreadsheet, used only for the "edit the sheet" link. */
export const SHEET_ID =
  process.env.SHEET_ID ?? "15kWHs1zXOvSkIj7s0QcbhcN4de0_bbMuNAE1hZ3VWvA";

export const EDIT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

/** How long (seconds) before we re-fetch the published sheet. */
export const REVALIDATE = Number(process.env.SHEET_REVALIDATE ?? 300);

export type Tab = {
  gid: string;
  name: string;
  /** Cells from the published HTML — carries colours, bold, merges. */
  rows: Cell[][];
  /**
   * Cells from the gviz values feed, when the tab needs it. The published
   * HTML renders a checkbox cell as empty, losing the boolean entirely; this
   * feed exports it as TRUE/FALSE. Only fetched for tabs that have a
   * checkbox-ish column, since it costs an extra request.
   */
  values?: Cell[][];
};

export class SheetNotPublishedError extends Error {
  constructor(detail = "") {
    super(
      `Couldn't read the published spreadsheet${detail ? ` (${detail})` : ""}.`,
    );
    this.name = "SheetNotPublishedError";
  }
}

const PUB_BASE = `https://docs.google.com/spreadsheets/d/e/${PUB_ID}`;

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    next: { revalidate: REVALIDATE },
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NudelmanTrip/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new SheetNotPublishedError(`HTTP ${res.status}`);
  return res.text();
}

const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * The gviz values feed for one tab, addressed by **gid**.
 *
 * Addressing it by sheet name is a trap: if the name doesn't match exactly —
 * a stray trailing space is enough — gviz silently returns the *first* sheet
 * instead of erroring, so the to-do list would quietly parse the schedule.
 * The gid is exact. The guard below is belt and braces.
 *
 * Requires the spreadsheet to be shared as "anyone with the link can view",
 * which is separate from Publish to web.
 */
async function fetchValues(gid: string, header: Cell[]): Promise<Cell[][] | null> {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?tqx=out:csv&headers=1&gid=${encodeURIComponent(gid)}`;
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const csv = await res.text();
    if (!csv.trim()) return null;

    const values = cellsFromCsv(parseCsv(csv));
    if (!values.length) return null;

    // Confirm we got the tab we asked for: its header must share a column
    // name with the one we already parsed from the published HTML.
    const want = new Set(
      header.map((c) => normalizeHeader(c.text)).filter((s) => s.length > 1),
    );
    const got = values[0].map((c) => normalizeHeader(c.text));
    if (want.size > 0 && !got.some((name) => want.has(name))) return null;

    return values;
  } catch {
    return null;
  }
}

/** Does this tab have a checkbox column whose value the HTML would drop? */
function needsValues(rows: Cell[][]): boolean {
  return rows
    .slice(0, 6)
    .some((row) =>
      row.some((cell) => /^done\??$|^complete[d]?\??$/i.test(cell.text.trim())),
    );
}

async function fetchTab(ref: { gid: string; name: string }): Promise<Tab> {
  // This endpoint renders exactly one sheet, which keeps parsing unambiguous.
  const html = await get(`${PUB_BASE}/pubhtml/sheet?gid=${ref.gid}`);
  const rows = parseGrid(html, parseStyles(html));

  const headerRow = rows.find((r) => r.filter((c) => c.text).length >= 2) ?? [];
  const values = needsValues(rows) ? await fetchValues(ref.gid, headerRow) : null;

  return { gid: ref.gid, name: ref.name, rows, ...(values ? { values } : {}) };
}

/** Fetch every tab of the published workbook, in sheet order. */
export async function fetchWorkbook(): Promise<Tab[]> {
  const html = await get(`${PUB_BASE}/pubhtml`);
  if (!html.trim()) throw new SheetNotPublishedError("empty response");

  const index = parseTabIndex(html);
  if (!index.length) throw new SheetNotPublishedError("no tabs found");

  return Promise.all(index.map(fetchTab));
}
