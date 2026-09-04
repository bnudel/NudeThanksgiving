import { parseGrid, parseStyles, parseTabIndex, type Cell } from "./parse";

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

export type Tab = { gid: string; name: string; rows: Cell[][] };

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

async function fetchTab(ref: { gid: string; name: string }): Promise<Tab> {
  // This endpoint renders exactly one sheet, which keeps parsing unambiguous.
  const html = await get(`${PUB_BASE}/pubhtml/sheet?gid=${ref.gid}`);
  return { gid: ref.gid, name: ref.name, rows: parseGrid(html, parseStyles(html)) };
}

/** Fetch every tab of the published workbook, in sheet order. */
export async function fetchWorkbook(): Promise<Tab[]> {
  const html = await get(`${PUB_BASE}/pubhtml`);
  if (!html.trim()) throw new SheetNotPublishedError("empty response");

  const index = parseTabIndex(html);
  if (!index.length) throw new SheetNotPublishedError("no tabs found");

  return Promise.all(index.map(fetchTab));
}
