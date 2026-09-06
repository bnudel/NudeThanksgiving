import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeColor, parseGrid, parseStyles, parseTabIndex, unwrapHref } from "./parse.ts";
import {
  classify,
  coastAffinity,
  countStays,
  mergeActivityTabs,
  nameFromUrl,
  parseActivities,
  parseFlights,
  parseLodging,
  parseRestaurants,
  parseSchedule,
  slug,
  titleFor,
} from "./model.ts";

/* Markup below mirrors what Google's "Publish to web" actually emits: a
   <style> block of .s<N> classes, a #sheet-menu tab strip, and rows whose
   first child is a <th> row header. */

const STYLE = `<style type="text/css">
.ritz .waffle .s0{background-color:#ffffff;color:#000000;font-size:10pt;}
.ritz .waffle .s1{background-color:#ffffff;font-weight:bold;}
.ritz .waffle .s2{background-color:#a4c2f4;color:#000000;}
.ritz .waffle .s3{background-color:#ffe599;color:#000000;}
.ritz .waffle .s4{background-color:#b6d7a8;color:#000000;}
</style>`;

const MENU = `<ul id="sheet-menu">
<li id="sheet-button-1116700360"><a href="/spreadsheets/d/e/X/pubhtml?gid=1116700360&amp;single=true">Schedule</a></li>
<li id="sheet-button-222"><a href="#">Lodging</a></li>
<li id="sheet-button-333"><a href="#">Flights</a></li>
<li id="sheet-button-444"><a href="#">Restaurants</a></li>
</ul>`;

function row(cells: string) {
  return `<tr style="height:20px"><th class="row-headers-background"><div>1</div></th>${cells}</tr>`;
}
const td = (cls: string, text: string, extra = "") =>
  `<td class="${cls}" dir="ltr"${extra}>${text}</td>`;
const blank = (n: number) => td("s0", "").repeat(n);

function page(rows: string[]) {
  return `<html><head>${STYLE}</head><body>${MENU}
<div id="sheets-viewport"><div class="ritz grid-container" id="1116700360" dir="ltr">
<table class="waffle" cellspacing="0" cellpadding="0">
<thead><tr><th class="row-header"></th><th class="column-headers-background">A</th></tr></thead>
<tbody>${rows.join("")}</tbody></table></div></div></body></html>`;
}

/* --------------------------------------------------------------- primitives */

test("normalizeColor folds white to empty and normalizes formats", () => {
  assert.equal(normalizeColor("#FFFFFF"), "");
  assert.equal(normalizeColor("#fff"), "");
  assert.equal(normalizeColor("rgb(255, 229, 153)"), "#ffe599");
  assert.equal(normalizeColor("#A4C2F4"), "#a4c2f4");
  assert.equal(normalizeColor(undefined), "");
  assert.equal(normalizeColor("transparent"), "");
});

test("unwrapHref unwraps Google redirects and drops internal tab links", () => {
  assert.equal(
    unwrapHref("https://www.google.com/url?q=https://www.eempdx.com/&sa=D"),
    "https://www.eempdx.com/",
  );
  assert.equal(unwrapHref("https://www.hanoakpdx.com/"), "https://www.hanoakpdx.com/");
  assert.equal(unwrapHref("https://docs.google.com/spreadsheets/d/X/pubhtml?gid=1"), undefined);
  assert.equal(unwrapHref(undefined), undefined);
});

test("parseStyles reads background colours and weight", () => {
  const styles = parseStyles(STYLE);
  assert.equal(styles.s3.bg, "#ffe599");
  assert.equal(styles.s0.bg, "", "white is treated as no fill");
  assert.equal(styles.s1.bold, true);
});

test("parseTabIndex reads every tab in sheet order", () => {
  const tabs = parseTabIndex(page([]));
  assert.deepEqual(
    tabs.map((t) => t.name),
    ["Schedule", "Lodging", "Flights", "Restaurants"],
  );
  assert.equal(tabs[0].gid, "1116700360");
});

test("parseGrid skips row headers, keeps colspan, and trims empty edges", () => {
  const html = page([
    row(td("s1", "Day") + td("s1", "Summary") + td("s1", "6am")),
    row(td("s0", "Sunday") + td("s0", "") + td("s3", "Brunch", ' colspan="2"')),
    row(blank(3)),
  ]);
  const rows = parseGrid(html);
  assert.equal(rows.length, 2, "trailing all-empty row dropped");
  assert.deepEqual(
    rows[0].map((c) => c.text),
    ["Day", "Summary", "6am"],
  );
  assert.equal(rows[1][2].colspan, 2);
  assert.equal(rows[1][2].bg, "#ffe599");
});

test("freezebar spacer cells from frozen rows/columns don't shift columns", () => {
  // A sheet with a frozen header row and frozen first column: Google injects
  // an empty classless <td> after column A, plus a whole spacer row.
  const freeze = '<td class="freezebar-cell freezebar-vertical-handle"></td>';
  const html = page([
    row(td("s1", "Day") + freeze + td("s1", "Summary") + td("s1", "6am") + td("s1", "7am")),
    `<tr class="freezebar-cell freezebar-horizontal-handle"><th class="row-headers-background"></th><td></td><td></td><td></td><td></td></tr>`,
    row(
      td("s0", "Saturday, November 21") +
        freeze +
        td("s0", "Vedrans arrive 8:15pm") +
        td("s0", "") +
        td("s2", "3 Vs arrive"),
    ),
  ]);

  const rows = parseGrid(html);
  assert.deepEqual(
    rows[0].map((c) => c.text),
    ["Day", "Summary", "6am", "7am"],
    "the spacer column is removed, not left as a blank column",
  );

  const s = parseSchedule({ gid: "1", name: "Schedule", rows });
  assert.equal(s.days.length, 1);
  assert.equal(s.days[0].summary, "Vedrans arrive 8:15pm", "summary stays in column B");
  assert.deepEqual(
    s.days[0].events.map((e) => [e.time, e.text]),
    [["7am", "3 Vs arrive"]],
    "hour columns are not shifted by the freezebar",
  );
});

test("classify still works on a frozen sheet", () => {
  const freeze = '<td class="freezebar-cell freezebar-vertical-handle"></td>';
  const html = page([
    row(td("s1", "Name") + freeze + td("s1", "Arrival Day") + td("s1", "Arrival Time")),
    row(td("s0", "Grandma") + freeze + td("s0", "11/21/26") + td("s0", "9:36 AM")),
  ]);
  assert.equal(classify({ gid: "1", name: "", rows: parseGrid(html) }), "flights");
});

test("parseTabIndex falls back to bare gid references when the menu is missing", () => {
  const html = `<html><body>
    <a href="/spreadsheets/d/e/X/pubhtml/sheet?gid=111">a</a>
    <a href="/spreadsheets/d/e/X/pubhtml/sheet?gid=222">b</a>
    <a href="/spreadsheets/d/e/X/pubhtml/sheet?gid=111">dupe</a>
  </body></html>`;
  const tabs = parseTabIndex(html);
  assert.deepEqual(
    tabs.map((t) => t.gid),
    ["111", "222"],
  );
  assert.equal(tabs[0].name, "", "unnamed tabs get titled from their detected kind");
});

test("titleFor prefers the sheet tab name, falls back to the kind", () => {
  assert.equal(titleFor({ gid: "1", name: "Coast ideas", rows: [] }, "activities"), "Coast ideas");
  assert.equal(titleFor({ gid: "1", name: "  ", rows: [] }, "flights"), "Flights");
});

/* ----------------------------------------------------------------- schedule */

const SCHEDULE_HTML = page([
  row(td("s1", "Day") + td("s1", "Summary") + td("s1", "6am") + td("s1", "7am") + td("s1", "8am")),
  row(
    td("s0", "Saturday, November 21") +
      td("s0", "Vedrans arrive 8:15pm") +
      td("s0", "") +
      td("s2", "3 Vs arrive"),
  ),
  row(td("s0", "Sunday, November 22") + blank(4)),
  row(td("s0", "") + td("s2", "Travel") + blank(3)),
  row(td("s0", "") + td("s3", "Dinner Reservation Booked") + blank(3)),
  row(td("s0", "") + td("s4", "No reservation needed") + blank(3)),
]);

test("parseSchedule separates days from the colour legend", () => {
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(SCHEDULE_HTML) });

  assert.equal(s.days.length, 2);
  assert.equal(s.days[0].label, "Saturday, November 21");
  assert.equal(s.days[0].summary, "Vedrans arrive 8:15pm");
  assert.equal(s.days[1].events.length, 0, "empty day has no events");

  assert.deepEqual(
    s.legend.map((l) => [l.label, l.bg]),
    [
      ["Travel", "#a4c2f4"],
      ["Dinner Reservation Booked", "#ffe599"],
      ["No reservation needed", "#b6d7a8"],
    ],
  );
});

test("schedule events land on the right hour and match a legend colour", () => {
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(SCHEDULE_HTML) });
  const [event] = s.days[0].events;
  assert.equal(event.text, "3 Vs arrive");
  assert.equal(event.time, "7am", "column offset accounts for the leading blank cell");
  assert.equal(event.bg, "#a4c2f4");

  const legendColors = new Set(s.legend.map((l) => l.bg));
  assert.ok(legendColors.has(event.bg), "event colour resolves to a legend category");
});

test("colspan advances the hour cursor", () => {
  const html = page([
    row(td("s1", "Day") + td("s1", "Summary") + td("s1", "6am") + td("s1", "7am") + td("s1", "8am")),
    row(
      td("s0", "Monday, November 23") +
        td("s0", "") +
        td("s3", "Long brunch", ' colspan="2"') +
        td("s2", "Drive to coast"),
    ),
  ]);
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });
  assert.deepEqual(
    s.days[0].events.map((e) => [e.time, e.text, e.span]),
    [
      ["6am", "Long brunch", 2],
      ["8am", "Drive to coast", 1],
    ],
  );
});

/* ------------------------------------------------------------------ flights */

const FLIGHTS_HTML = page([
  row(td("s1", "Name") + td("s1", "Arrival Day") + td("s1", "Arrival Time") + td("s1", "Airline and flight info")),
  row(td("s0", "Grandma") + td("s0", "11/21/26") + td("s0", "9:36 AM") + td("s0", "UA 1247 DEN-PDX")),
  row(td("s0", "Ben") + blank(3)),
  row(blank(4)),
  row(td("s1", "Name") + td("s1", "Depart Day") + td("s1", "Depart Time") + td("s1", "Airline and flight info")),
  row(td("s0", "Grandma") + td("s0", "11/29/26") + td("s0", "4:35 PM") + td("s0", "Frontier F9 1790")),
  row(td("s0", "Ben") + blank(3)),
]);

test("parseFlights merges the arrival and departure blocks per person", () => {
  const people = parseFlights({ gid: "3", name: "Flights", rows: parseGrid(FLIGHTS_HTML) });
  const names = people.map((p) => p.name);
  assert.deepEqual(names, ["Grandma", "Ben"], "each person appears once, in sheet order");

  const grandma = people[0];
  assert.equal(grandma.arrive?.time, "9:36 AM");
  assert.equal(grandma.depart?.details, "Frontier F9 1790");

  const ben = people[1];
  assert.equal(ben.arrive, undefined, "blank rows stay unbooked rather than rendering empty");
  assert.equal(ben.depart, undefined);
});

/* ------------------------------------------------------------------ lodging */

const LODGING_HEADER =
  td("s0", "") +
  td("s1", "Dates") +
  td("s1", "Acct") +
  td("s1", "Cost") +
  td("s1", "Location") +
  td("s1", "Cancel policy");

const option = (label: string, dates: string, acct: string, cost: string, loc: string) =>
  row(
    td("s0", label) +
      td("s0", dates) +
      td("s0", acct) +
      td("s0", cost) +
      td("s0", loc) +
      td("s0", "Cancel before November 16 for a full refund."),
  );

const GROUPED_LODGING = page([
  row(td("s1", "Cannon Beach/Seaside") + blank(5)),
  row(LODGING_HEADER),
  option("Option 1", "11/21-24", "E Airbnb", "$904.46 paid on K Sapphire 3306", "111-119 9th Ave"),
  option("Option 2", "11/21-24", "E Airbnb", "$880.23 will be charged", "188 East Van Buren"),
  row(blank(6)),
  row(td("s1", "Portland") + blank(5)),
  row(LODGING_HEADER),
  option("Option 1", "11/24-29", "E Airbnb", "$5588.93 will be charged", "1032 SE 12th Ave"),
  option("Option 2", "11/24-29", "T Airbnb", "$4528.92 will be charged", "925 NE 23rd Ave"),
  option("Option 3", "11/24-29", "E Airbnb", "5227.47 will be charged", "2034 NE Flanders St"),
]);

test("parseLodging groups options under their location headings", () => {
  const groups = parseLodging({ gid: "2", name: "Lodging", rows: parseGrid(GROUPED_LODGING) });

  assert.deepEqual(
    groups.map((g) => [g.name, g.stays.length]),
    [
      ["Cannon Beach/Seaside", 2],
      ["Portland", 3],
    ],
  );
  assert.equal(countStays(groups), 5);

  const first = groups[0].stays[0];
  assert.equal(first.label, "Option 1", "the unlabelled column left of Dates is the option name");
  assert.equal(first.dates, "11/21-24", "columns are not shifted by the label column");
  assert.equal(first.acct, "E Airbnb");
  assert.equal(first.paid, true, '"paid on" in the cost marks it as paid');
  assert.equal(groups[0].stays[1].paid, false, '"will be charged" is not paid');
});

test("parseLodging still handles a flat sheet with no section headings", () => {
  const html = page([
    row(
      td("s1", "Dates") +
        td("s1", "Acct") +
        td("s1", "Cost") +
        td("s1", "Location") +
        td("s1", "Cancel policy"),
    ),
    row(
      td("s0", "11/21-24") +
        td("s0", "E Airbnb") +
        td("s0", "$904.46") +
        td("s0", "111-119 9th Avenue Seaside, OR 97138") +
        td("s0", "Cancel before November 16 for a full refund."),
    ),
  ]);
  const groups = parseLodging({ gid: "2", name: "Lodging", rows: parseGrid(html) });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "");
  assert.equal(groups[0].stays[0].dates, "11/21-24");
  assert.equal(groups[0].stays[0].cancel, "Cancel before November 16 for a full refund.");
});

test("a Status column marks an option as booked", () => {
  const html = page([
    row(
      td("s0", "") +
        td("s1", "Dates") +
        td("s1", "Acct") +
        td("s1", "Cost") +
        td("s1", "Location") +
        td("s1", "Cancel policy") +
        td("s1", "Status"),
    ),
    row(
      td("s0", "Option 1") +
        td("s0", "11/24-29") +
        td("s0", "E Airbnb") +
        td("s0", "$5588.93") +
        td("s0", "1032 SE 12th") +
        td("s0", "Cancel by Nov 19") +
        td("s0", "Booked"),
    ),
  ]);
  const groups = parseLodging({ gid: "2", name: "Lodging", rows: parseGrid(html) });
  assert.equal(groups[0].stays[0].status, "Booked");
});

/* ------------------------------------------- activities across column sets */

test("activity columns are read by name, not position", () => {
  // The coast tab lost its reservation columns; Notes moved from column 6 to
  // column 3. Position-based parsing silently dropped these notes.
  const coast = page([
    row(td("s1", "Things to do") + td("s1", "Location") + td("s1", "Notes")),
    row(td("s0", "Hug Point") + td("s0", "") + td("s0", "Best at low tide")),
  ]);
  const [hug] = parseActivities({ gid: "3", name: "Coast", rows: parseGrid(coast) });
  assert.equal(hug.name, "Hug Point");
  assert.equal(hug.notes, "Best at low tide", "notes survive a narrower tab");
  assert.equal(hug.needsReservation, "", "a missing column reads as empty, not as the notes");

  // The Portland tab still has all six columns.
  const pdx = page([
    row(
      td("s1", "Things to do") +
        td("s1", "Location") +
        td("s1", "Need Reservation?") +
        td("s1", "Reservation Date and Time") +
        td("s1", "Rank of Importance") +
        td("s1", "Notes"),
    ),
    row(
      td("s0", "Big Al's") +
        td("s0", "Vancouver") +
        td("s0", "Yes") +
        td("s0", "11/28 7pm") +
        td("s0", "2") +
        td("s0", "Bowling"),
    ),
  ]);
  const [al] = parseActivities({ gid: "4", name: "Portland", rows: parseGrid(pdx) });
  assert.deepEqual(
    [al.location, al.needsReservation, al.when, al.rank, al.notes],
    ["Vancouver", "Yes", "11/28 7pm", "2", "Bowling"],
  );
});

/* --------------------------------------------- folding hikes into the lists */

const COAST_TAB = {
  gid: "10",
  name: "Cannon Beach",
  rows: parseGrid(
    page([
      row(td("s1", "Things to do") + td("s1", "Location") + td("s1", "Notes")),
      row(td("s0", "Cannon Beach") + td("s0", "") + td("s0", "")),
      row(td("s0", "Seaside pier") + td("s0", "") + td("s0", "")),
      row(td("s0", "Hug Point") + td("s0", "") + td("s0", "Best at low tide")),
      row(td("s0", "Rockaway Beach") + td("s0", "") + td("s0", "Twin rocks")),
      row(td("s0", "Tillamook tour") + td("s0", "") + td("s0", "1.5 hours")),
    ]),
  ),
};

const PORTLAND_TAB = {
  gid: "11",
  name: "Portland",
  rows: parseGrid(
    page([
      row(td("s1", "Things to do") + td("s1", "Location") + td("s1", "Notes")),
      row(td("s0", "Japanese Garden") + td("s0", "Portland") + td("s0", "")),
      row(td("s0", "Portland Aerial Tram") + td("s0", "") + td("s0", "")),
      row(td("s0", "Big Al's Vancouver") + td("s0", "Vancouver") + td("s0", "")),
    ]),
  ),
};

const hikesTab = (locations: string[] = ["", "", ""]) => ({
  gid: "12",
  name: "Hikes",
  rows: parseGrid(
    page([
      row(td("s1", "Hike Name") + td("s1", "Location") + td("s1", "Notes")),
      row(td("s0", "Multnomah Falls") + td("s0", locations[0]) + td("s0", "1.2 miles up")),
      row(td("s0", "Latourell Falls") + td("s0", locations[1]) + td("s0", "200 ft walk")),
      row(td("s0", "Silver Falls state park") + td("s0", locations[2]) + td("s0", "7.6 mile loop")),
    ]),
  ),
});

test("the hikes tab is absorbed rather than becoming a third section", () => {
  const { sections, absorbed } = mergeActivityTabs([COAST_TAB, PORTLAND_TAB, hikesTab()]);

  assert.equal(sections.length, 2, "exactly two things-to-do sections remain");
  assert.deepEqual(
    sections.map((s) => s.tab.name),
    ["Cannon Beach", "Portland"],
  );
  assert.deepEqual(absorbed.map((t) => t.name), ["Hikes"], "the hikes tab is reported as absorbed");
});

test("hikes default to the Portland list and are tagged", () => {
  const { sections } = mergeActivityTabs([COAST_TAB, PORTLAND_TAB, hikesTab()]);
  const coast = sections.find((s) => s.tab.name === "Cannon Beach")!;
  const pdx = sections.find((s) => s.tab.name === "Portland")!;

  assert.equal(coast.activities.filter((a) => a.isHike).length, 0);
  assert.equal(pdx.activities.filter((a) => a.isHike).length, 3);

  assert.ok(
    pdx.activities.slice(0, 3).every((a) => !a.isHike),
    "the tab's own entries keep their order, hikes are appended",
  );
  assert.equal(pdx.activities.at(-1)?.name, "Silver Falls state park");
  assert.equal(pdx.activities.at(-1)?.notes, "7.6 mile loop", "hike notes survive the merge");
});

test("a Location naming the coast moves that hike to the coast list", () => {
  const { sections } = mergeActivityTabs([
    COAST_TAB,
    PORTLAND_TAB,
    hikesTab(["", "Cannon Beach", ""]),
  ]);
  const coast = sections.find((s) => s.tab.name === "Cannon Beach")!;
  const pdx = sections.find((s) => s.tab.name === "Portland")!;

  assert.deepEqual(
    coast.activities.filter((a) => a.isHike).map((a) => a.name),
    ["Latourell Falls"],
  );
  assert.equal(pdx.activities.filter((a) => a.isHike).length, 2);
});

test("the coast list is identified by content, not by tab name", () => {
  // Tab names the sheet might not spell helpfully.
  const vague = { ...COAST_TAB, name: "Tab 3" };
  const alsoVague = { ...PORTLAND_TAB, name: "Tab 4" };
  assert.ok(
    coastAffinity(vague) > coastAffinity(alsoVague),
    "the coastal tab scores higher on coastal place names",
  );

  const { sections } = mergeActivityTabs([vague, alsoVague, hikesTab(["Seaside", "", ""])]);
  const coast = sections.find((s) => s.tab.name === "Tab 3")!;
  assert.deepEqual(
    coast.activities.filter((a) => a.isHike).map((a) => a.name),
    ["Multnomah Falls"],
  );
});

test("with only one things-to-do list, all hikes go there", () => {
  const { sections, absorbed } = mergeActivityTabs([PORTLAND_TAB, hikesTab()]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].activities.filter((a) => a.isHike).length, 3);
  assert.equal(absorbed.length, 1);
});

test("with no hikes tab, the lists are left alone", () => {
  const { sections, absorbed } = mergeActivityTabs([COAST_TAB, PORTLAND_TAB]);
  assert.equal(sections.length, 2);
  assert.equal(absorbed.length, 0);
  assert.ok(sections.every((s) => s.activities.every((a) => !a.isHike)));
});

test("a Hikes tab renders as an activity list", () => {
  const html = page([
    row(td("s1", "Hike Name") + td("s1", "Notes")),
    row(td("s0", "Latourell Falls") + td("s0", "200 Ft walk from the parking lot")),
    row(td("s0", "Multnomah Falls") + td("s0", "1.2 miles to the top bridge")),
  ]);
  const tab = { gid: "5", name: "Hikes", rows: parseGrid(html) };

  const kind = classify(tab);
  assert.equal(kind, "activities");
  assert.equal(titleFor(tab, kind), "Hikes", "the section keeps the sheet's tab name");

  const items = parseActivities(tab);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Latourell Falls");
  assert.equal(items[0].notes, "200 Ft walk from the parking lot");
});

/* -------------------------------------------------------------- restaurants */

test("nameFromUrl produces readable names", () => {
  assert.equal(nameFromUrl("https://www.eempdx.com/"), "Eem");
  assert.equal(nameFromUrl("https://www.hanoakpdx.com/"), "Han Oak");
  assert.equal(nameFromUrl("https://www.kmdpdx.com/menu"), "Kann");
  assert.equal(nameFromUrl("https://dtf.com/en-us"), "Din Tai Fung");
  assert.equal(nameFromUrl("https://www.some-new-spot.com/"), "Some New Spot");
});

test("parseRestaurants fills blank names from the link", () => {
  const html = page([
    row(td("s1", "Name") + td("s1", "Location") + td("s1", "Notes")),
    row(
      td("s0", "") +
        td("s0", "") +
        td("s0", '<a href="https://www.google.com/url?q=https://www.eempdx.com/&amp;sa=D">https://www.eempdx.com/</a>'),
    ),
    row(td("s0", "Nostrana") + td("s0", "SE Portland") + td("s0", "Pizza")),
  ]);
  const items = parseRestaurants({ gid: "4", name: "Restaurants", rows: parseGrid(html) });
  assert.equal(items[0].name, "Eem");
  assert.equal(items[0].href, "https://www.eempdx.com/");
  assert.equal(items[0].notes, "", "the bare URL isn't repeated as a note");
  assert.equal(items[1].name, "Nostrana");
});

/* --------------------------------------------------------------- classifier */

test("classify identifies tabs by header shape, not tab name", () => {
  const of = (html: string) => ({ gid: "1", name: "whatever", rows: parseGrid(html) });
  assert.equal(classify(of(SCHEDULE_HTML)), "schedule");
  assert.equal(classify(of(FLIGHTS_HTML)), "flights");
  assert.equal(
    classify(
      of(page([row(td("s1", "Dates") + td("s1", "Acct") + td("s1", "Cost") + td("s1", "Location") + td("s1", "Cancel policy"))])),
    ),
    "lodging",
  );
  assert.equal(
    classify(of(page([row(td("s1", "Things to do") + td("s1", "Location") + td("s1", "Need Reservation?"))]))),
    "activities",
  );
  assert.equal(
    classify(of(page([row(td("s1", "Date") + td("s1", "What") + td("s1", "How Much"))]))),
    "payments",
  );
  assert.equal(
    classify(of(page([row(td("s1", "Name") + td("s1", "Location") + td("s1", "Notes"))]))),
    "restaurants",
  );
  assert.equal(
    classify(of(page([row(td("s1", "Packing list") + td("s1", "Who"))]))),
    "generic",
    "an unrecognised new tab still renders as a table",
  );
});

/* ------------------------------------------------------- payments gate */

test("the prerendered page never reads payment data", async () => {
  // The homepage is statically generated, so anything parsed at build time is
  // baked into public HTML. Payment rows must only be read inside the
  // password-checked route handler.
  const fs = await import("node:fs/promises");
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const page = stripComments(
    await fs.readFile(`${import.meta.dirname}/../app/page.tsx`, "utf8"),
  );

  assert.ok(
    !/parsePayments/.test(page),
    "app/page.tsx must not call parsePayments — that would leak the rows into the static HTML",
  );
  assert.ok(/PaymentsGate/.test(page), "payments should render through the gate component");

  // Imports naturally sit above everything, so compare call sites, not the
  // import statement.
  const route = stripComments(
    await fs.readFile(`${import.meta.dirname}/../app/api/payments/route.ts`, "utf8"),
  ).replace(/^import[\s\S]*?;$/gm, "");

  const gateIndex = route.indexOf("matches(supplied, expected)");
  const parseIndex = route.indexOf("parsePayments(");
  assert.ok(gateIndex > 0, "route must compare the supplied password");
  assert.ok(parseIndex > 0, "route must parse the payments tab");
  assert.ok(
    parseIndex > gateIndex,
    "payment rows must only be parsed after the password check passes",
  );
  assert.ok(/timingSafeEqual/.test(route), "password comparison should be constant-time");
});

test("no password is committed to the repo", async () => {
  const fs = await import("node:fs/promises");
  const example = await fs.readFile(`${import.meta.dirname}/../.env.example`, "utf8");
  assert.ok(/PAYMENTS_PASSWORD=/.test(example));

  const ignore = await fs.readFile(`${import.meta.dirname}/../.gitignore`, "utf8");
  assert.ok(/\.env\*\.local/.test(ignore), ".env.local must stay untracked");
});

test("slug makes stable anchors", () => {
  assert.equal(slug("Cannon Beach / Coast"), "cannon-beach-coast");
  assert.equal(slug("  Flights  "), "flights");
});
