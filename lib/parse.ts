/**
 * Dependency-free parser for Google Sheets "Publish to web" HTML.
 *
 * Google emits very regular, generated markup, so targeted string scanning is
 * both sufficient and much lighter than pulling in a full HTML parser. Keeping
 * this file free of framework imports means it can be unit-tested with plain
 * `node --experimental-strip-types`.
 */

export type Cell = {
  text: string;
  /** Normalized background colour, e.g. "#ffe599". "" means default/white. */
  bg: string;
  /**
   * Normalized text colour, e.g. "#c00000". "" means default/black. The
   * schedule uses fill for the activity type and text colour for the city,
   * so both channels have to be read.
   */
  fg: string;
  bold: boolean;
  /** Struck-through text — another way sheets mark something finished. */
  strike: boolean;
  colspan: number;
  href?: string;
};

export type TabRef = { gid: string; name: string };

/* ----------------------------------------------------------------- helpers */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]) : undefined;
}

/**
 * "#FFF" | "rgb(255,255,255)" -> "#ffffff".
 *
 * `blank` is the value that counts as "no colour set" and returns "": white
 * for fills, black for text.
 */
export function normalizeColor(raw: string | undefined, blank = "#ffffff"): string {
  if (!raw) return "";
  const v = raw.trim().toLowerCase();
  if (!v || v === "transparent" || v === "none") return "";
  let hex: string;
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    hex =
      "#" +
      [rgb[1], rgb[2], rgb[3]]
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("");
  } else if (v.startsWith("#")) {
    hex =
      v.length === 4
        ? "#" +
          v
            .slice(1)
            .split("")
            .map((c) => c + c)
            .join("")
        : v;
  } else {
    return "";
  }
  // Unstyled cells must never read as a category.
  return hex === blank ? "" : hex;
}

/** Google rewrites outbound links as /url?q=<real>&sa=... — unwrap them. */
export function unwrapHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href, "https://docs.google.com");
    if (u.pathname === "/url") {
      const q = u.searchParams.get("q");
      if (q) return q;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    // Internal tab links aren't content.
    if (u.hostname.endsWith("docs.google.com") && u.pathname.includes("pubhtml")) {
      return undefined;
    }
    return u.toString();
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ styles */

export type StyleMap = Record<string, { bg: string; fg: string; bold: boolean; strike: boolean }>;

/** Read `.ritz .waffle .s3{background-color:#ffe599;...}` rules. */
export function parseStyles(html: string): StyleMap {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");
  const map: StyleMap = {};
  const re = /\.ritz\s+\.waffle\s+\.(s\d+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const [, cls, body] = m;
    const bg = body.match(/background-color\s*:\s*([^;]+)/i)?.[1];
    // `color:` but not `background-color:` — the negative lookbehind keeps
    // the two from colliding.
    const fg = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
    const weight = body.match(/font-weight\s*:\s*([^;]+)/i)?.[1]?.trim();
    map[cls] = {
      bg: normalizeColor(bg),
      fg: normalizeColor(fg, "#000000"),
      bold: weight === "bold" || Number(weight) >= 600,
      strike: /text-decoration\s*:[^;]*line-through/i.test(body),
    };
  }
  return map;
}

/* -------------------------------------------------------------- tab index */

/** Read the published tab strip: gid + name, in sheet order. */
export function parseTabIndex(html: string): TabRef[] {
  const tabs: TabRef[] = [];
  const seen = new Set<string>();

  const menu = html.match(/<ul[^>]*id="sheet-menu"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? "";
  for (const m of menu.matchAll(/<li[^>]*id="sheet-button-(\d+)"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const [, gid, inner] = m;
    if (seen.has(gid)) continue;
    seen.add(gid);
    tabs.push({ gid, name: stripTags(inner) || `Sheet ${tabs.length + 1}` });
  }
  if (tabs.length) return tabs;

  // Fallback 1: any sheet-button id anywhere on the page.
  for (const m of html.matchAll(/sheet-button-(\d+)/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      tabs.push({ gid: m[1], name: "" });
    }
  }
  if (tabs.length) return tabs;

  // Fallback 2: grid containers carry the gid as their element id.
  for (const m of html.matchAll(
    /<div[^>]*class="[^"]*grid-container[^"]*"[^>]*id="(\d+)"|<div[^>]*id="(\d+)"[^>]*class="[^"]*grid-container[^"]*"/gi,
  )) {
    const gid = m[1] ?? m[2];
    if (gid && !seen.has(gid)) {
      seen.add(gid);
      tabs.push({ gid, name: "" });
    }
  }
  if (tabs.length) return tabs;

  // Fallback 3: every gid referenced anywhere, in document order. Names are
  // unknown here, so the caller titles the section from its detected kind.
  for (const m of html.matchAll(/[?&;]gid=(\d+)/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      tabs.push({ gid: m[1], name: "" });
    }
  }
  return tabs;
}

/* -------------------------------------------------------------------- grid */

/** Parse the cell grid of a single published sheet. */
export function parseGrid(html: string, styles: StyleMap = parseStyles(html)): Cell[][] {
  const table =
    html.match(/<table[^>]*class="[^"]*waffle[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1] ??
    html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)?.[1] ??
    "";

  const body = table.replace(/<thead[\s\S]*?<\/thead>/gi, "");
  const rows: Cell[][] = [];

  for (const trMatch of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: Cell[] = [];
    for (const tdMatch of trMatch[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)) {
      const [, attrs, inner] = tdMatch;
      const classAttr = attr(attrs, "class") ?? "";
      const cls = classAttr.split(/\s+/).find((c) => /^s\d+$/.test(c));

      // When a sheet has frozen rows or columns, Google injects empty
      // "freezebar" spacer cells into the grid. Left in, they shift every
      // column after the freeze by one. Real data cells always carry an
      // .s<N> style class, so anything classless *and* empty is structural.
      const isSpacer = /freezebar/i.test(classAttr) || (!cls && !stripTags(inner));
      if (isSpacer) continue;

      const style = (cls && styles[cls]) || { bg: "", fg: "", bold: false, strike: false };
      const inlineStyle = attr(attrs, "style") ?? "";
      const inlineBg = normalizeColor(
        inlineStyle.match(/background-color\s*:\s*([^;]+)/i)?.[1],
      );
      const inlineFg = normalizeColor(
        inlineStyle.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1],
        "#000000",
      );
      // Some sheets publish checkboxes as a real input rather than TRUE/FALSE.
      const checkbox = /<input[^>]*type=["']?checkbox/i.test(inner)
        ? /<input[^>]*\bchecked\b/i.test(inner)
          ? "TRUE"
          : "FALSE"
        : null;

      row.push({
        text: checkbox ?? stripTags(inner),
        bg: inlineBg || style.bg,
        fg: inlineFg || style.fg,
        bold: style.bold || /<(b|strong)\b/i.test(inner),
        strike: style.strike || /<(s|strike|del)\b/i.test(inner),
        colspan: Number(attr(attrs, "colspan") ?? 1) || 1,
        href: unwrapHref(inner.match(/<a[^>]*\shref\s*=\s*"([^"]*)"/i)?.[1]),
      });
    }
    if (row.length) rows.push(row);
  }

  return trimEmptyEdges(rows);
}

/** Drop fully-empty trailing rows and trailing columns. */
export function trimEmptyEdges(rows: Cell[][]): Cell[][] {
  const isBlank = (c: Cell) => !c.text;
  let last = rows.length - 1;
  while (last >= 0 && rows[last].every(isBlank)) last--;
  const trimmed = rows.slice(0, last + 1);
  const width = trimmed.reduce((w, r) => {
    let i = r.length - 1;
    while (i >= 0 && isBlank(r[i])) i--;
    return Math.max(w, i + 1);
  }, 0);
  return trimmed.map((r) => r.slice(0, width));
}
