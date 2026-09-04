import { NextResponse } from "next/server";

import { classify, findHeaderRow, titleFor } from "@/lib/model";
import { fetchWorkbook, PUB_ID } from "@/lib/sheet";

/**
 * Diagnostics: what did we actually read out of the spreadsheet? Useful when a
 * tab renders as a plain table and you expected a designed view — the header
 * row shown here is what the classifier saw.
 */
export async function GET() {
  try {
    const tabs = await fetchWorkbook();
    return NextResponse.json({
      pubId: PUB_ID,
      tabs: tabs.map((tab) => {
        const kind = classify(tab);
        return {
          gid: tab.gid,
          name: tab.name,
          title: titleFor(tab, kind),
          renderedAs: kind,
          rows: tab.rows.length,
          columns: Math.max(0, ...tab.rows.map((r) => r.length)),
          headerRow: findHeaderRow(tab.rows)?.map((c) => c.text) ?? [],
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { pubId: PUB_ID, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
