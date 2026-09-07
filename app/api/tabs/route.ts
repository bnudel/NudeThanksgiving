import { NextResponse } from "next/server";

import { classify, findHeaderRow, titleFor } from "@/lib/model";
import { fetchWorkbook, PUB_ID } from "@/lib/sheet";

export const dynamic = "force-dynamic";

/**
 * Diagnostics: what did we actually read out of the spreadsheet?
 *
 * `/api/tabs`            — one line per tab: name, kind, size, header row
 * `/api/tabs?gid=123`    — every cell of that tab, with its colours and flags
 * `/api/tabs?kind=todo`  — same, for the first tab of that kind
 *
 * Plain text so it's readable in a browser and fetchable by anything.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const gid = params.get("gid");
  const kind = params.get("kind");

  const text = (body: string, status = 200) =>
    new NextResponse(body, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });

  let tabs;
  try {
    tabs = await fetchWorkbook();
  } catch (e) {
    return text(`Could not read the sheet.\npubId: ${PUB_ID}\n${String(e)}`, 502);
  }

  if (gid || kind) {
    const tab = gid
      ? tabs.find((t) => t.gid === gid)
      : tabs.find((t) => classify(t) === kind);
    if (!tab) return text(`No tab matched ${gid ? `gid ${gid}` : `kind ${kind}`}.`, 404);

    const lines = [
      `tab:     ${tab.name || "(unnamed)"}`,
      `gid:     ${tab.gid}`,
      `kind:    ${classify(tab)}`,
      `rows:    ${tab.rows.length}`,
      "",
      "Each cell as: [index] «text» (bg fg flags)",
      "",
    ];

    tab.rows.forEach((row, r) => {
      lines.push(`row ${String(r).padStart(3)}:`);
      row.forEach((cell, c) => {
        const flags = [
          cell.bg && `bg=${cell.bg}`,
          cell.fg && `fg=${cell.fg}`,
          cell.bold && "bold",
          cell.strike && "strike",
          cell.colspan > 1 && `span=${cell.colspan}`,
          cell.href && `href=${cell.href}`,
        ]
          .filter(Boolean)
          .join(" ");
        // Show codepoints for short values so a checkbox glyph is unambiguous.
        const codes =
          cell.text.length > 0 && cell.text.length <= 3
            ? ` U+${[...cell.text].map((ch) => ch.codePointAt(0)!.toString(16).toUpperCase()).join(" U+")}`
            : "";
        lines.push(`  [${String(c).padStart(2)}] «${cell.text}»${codes}${flags ? `  (${flags})` : ""}`);
      });
    });

    return text(lines.join("\n"));
  }

  const lines = [`pubId: ${PUB_ID}`, `tabs:  ${tabs.length}`, ""];
  for (const tab of tabs) {
    const k = classify(tab);
    const header = findHeaderRow(tab.rows)?.map((c) => c.text) ?? [];
    const cols = Math.max(0, ...tab.rows.map((r) => r.length));
    lines.push(
      `gid ${tab.gid.padEnd(12)} ${titleFor(tab, k).padEnd(22)} kind=${k.padEnd(12)} ${tab.rows.length}×${cols}`,
      `    header: ${header.join(" | ")}`,
    );
  }
  lines.push("", "Add ?gid=<gid> to dump a tab's cells.");

  return text(lines.join("\n"));
}
