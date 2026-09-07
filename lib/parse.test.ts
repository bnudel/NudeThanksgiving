import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cellsFromCsv,
  normalizeColor,
  parseCsv,
  parseGrid,
  parseStyles,
  parseTabIndex,
  unwrapHref,
} from "./parse.ts";
import {
  ACTIVITY_ROLES,
  TAB_KINDS,
  classify,
  coastAffinity,
  labelFor,
  countStays,
  countTodos,
  isChecked,
  isPlaceLabel,
  mergeActivityTabs,
  nameFromUrl,
  parseActivities,
  parseFlights,
  parseLodging,
  parseRestaurants,
  parseSchedule,
  parseTodos,
  placeOf,
  resolveDayDate,
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
.ritz .waffle .s6{background-color:#b6d7a8;color:#b45f06;}
.ritz .waffle .s7{background-color:#ffffff;color:#b45f06;}
.ritz .waffle .s8{background-color:#ffffff;color:#674ea7;}
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

test("every tab kind has a fallback title", () => {
  // A missing entry here is a TypeScript error, but TS errors only surface at
  // build time — on Vercel, minutes after a push. This catches it locally.
  for (const kind of TAB_KINDS) {
    const title = titleFor({ gid: "1", name: "", rows: [] }, kind);
    assert.ok(title && title.length > 0, `${kind} needs a default title`);
  }
});

test("every activity role has a toggle label or falls back to the tab name", () => {
  for (const role of ACTIVITY_ROLES) {
    const named = labelFor({ gid: "1", name: "My tab", rows: [] }, role);
    assert.ok(named.length > 0, `${role} must produce a label`);
    // "other" has no place name of its own and must use the tab's.
    if (role === "other") assert.equal(named, "My tab");
  }
  assert.equal(
    labelFor({ gid: "1", name: "", rows: [] }, "other"),
    "Things to do",
    "an unnamed tab still gets a usable button label",
  );
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

test("parseSchedule separates days from the colour key", () => {
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(SCHEDULE_HTML) });

  assert.equal(s.days.length, 2);
  assert.equal(s.days[0].label, "Saturday, November 21");
  assert.equal(s.days[0].summary, "Vedrans arrive 8:15pm");
  assert.equal(s.days[1].events.length, 0, "empty day has no events");

  assert.deepEqual(
    s.types.map((l) => [l.label, l.bg]),
    [
      ["Travel", "#a4c2f4"],
      ["Dinner Reservation Booked", "#ffe599"],
      ["No reservation needed", "#b6d7a8"],
    ],
  );
});

test("schedule events land on the right hour and pick up their type", () => {
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(SCHEDULE_HTML) });
  const [event] = s.days[0].events;
  assert.equal(event.text, "3 Vs arrive");
  assert.equal(event.time, "7am", "column offset accounts for the leading blank cell");
  assert.equal(event.bg, "#a4c2f4");
  assert.equal(event.type, "Travel", "the fill resolves to a key entry");
});

test("an inserted metadata column doesn't shift the timeline", () => {
  // "Total Drive Time" took 6am's place, so hours now start at 7am. Hour
  // columns are found by their heading, not by counting from the left.
  const html = page([
    row(
      td("s1", "Day") +
        td("s1", "Summary") +
        td("s1", "Total Drive Time") +
        td("s1", "7am") +
        td("s1", "8am") +
        td("s1", "9am") +
        td("s1", "10am"),
    ),
    row(
      td("s0", "Saturday, November 21") +
        td("s0", "Travel Day") +
        td("s0", "1 hour and 40 Minutes") +
        td("s0", "") +
        td("s0", "") +
        td("s0", "") +
        td("s2", "K,T,E,M,Gma Land"),
    ),
  ]);
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });
  const day = s.days[0];

  assert.equal(day.summary, "Travel Day");
  assert.equal(day.driveTime, "1 hour and 40 Minutes");
  assert.deepEqual(
    day.events.map((e) => [e.time, e.text]),
    [["10am", "K,T,E,M,Gma Land"]],
    "the drive-time column is not mistaken for an hour",
  );
});

test("the key splits into activity fills and city text colours", () => {
  const cityTd = (label: string, cls: string) => row(td("s0", "") + td(cls, label));
  const html = page([
    row(td("s1", "Day") + td("s1", "Summary") + td("s1", "Total Drive Time") + td("s1", "9am")),
    row(
      td("s0", "Sunday, November 22") +
        td("s0", "Beach day") +
        td("s0", "15 Minutes") +
        // Fill = Beach, text colour = Cannon Beach.
        td("s6", "Cannon Beach"),
    ),
    row(td("s0", "") + td("s0", "Key")),
    row(td("s0", "") + td("s3", "Dining")),
    row(td("s0", "") + td("s4", "Beach")),
    row(blank(2)),
    cityTd("Cannon Beach, OR", "s7"),
    cityTd("Portland, OR", "s8"),
  ]);

  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });

  assert.deepEqual(s.types.map((t) => t.label), ["Dining", "Beach"], "fills are activity types");
  assert.deepEqual(
    s.cities.map((c) => c.label),
    ["Cannon Beach, OR", "Portland, OR"],
    "text-coloured rows are cities, and the 'Key' heading is skipped",
  );

  const event = s.days[0].events[0];
  assert.equal(event.type, "Beach", "fill resolves to the activity type");
  assert.equal(event.city, "Cannon Beach, OR", "text colour resolves to the city");
});

test("every city in the key is listed, however it was coloured", () => {
  // The regression: cities were split from types by guessing which colour
  // channel was set, so a city row coloured differently from the others (or
  // not coloured at all) vanished from the key.
  const html = page([
    row(td("s1", "Day") + td("s1", "Summary") + td("s1", "Total Drive Time") + td("s1", "9am")),
    row(td("s0", "Sunday, November 22") + td("s0", "Beach") + td("s0", "15 Minutes") + td("s6", "Ecola State Park")),
    row(td("s0", "") + td("s0", "Key")),
    row(td("s0", "") + td("s3", "Dining")),
    row(td("s0", "") + td("s4", "Beach")),
    row(blank(2)),
    // Cannon Beach carries a fill; Portland carries text colour; Vancouver
    // has neither. All three are still cities.
    row(td("s0", "") + td("s2", "Cannon Beach, OR")),
    row(td("s0", "") + td("s8", "Portland, OR")),
    row(td("s0", "") + td("s0", "Vancouver, WA")),
  ]);

  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });

  assert.deepEqual(
    s.cities.map((c) => c.label),
    ["Cannon Beach, OR", "Portland, OR", "Vancouver, WA"],
    "all three cities appear in the key",
  );
  assert.deepEqual(
    s.types.map((t) => t.label),
    ["Dining", "Beach"],
    "place names are not mistaken for activity types",
  );
});

test("isPlaceLabel tells cities from activity types", () => {
  for (const city of ["Cannon Beach, OR", "Portland, OR", "Vancouver, WA", "Seaside, Oregon"]) {
    assert.ok(isPlaceLabel(city), `${city} should read as a place`);
  }
  for (const type of ["Travel", "Beach", "Hiking", "Dinner Reservation Booked", "Shopping"]) {
    assert.ok(!isPlaceLabel(type), `${type} should read as an activity type`);
  }
});

test("a city keyed by fill still tags its events", () => {
  const html = page([
    row(td("s1", "Day") + td("s1", "Summary") + td("s1", "Total Drive Time") + td("s1", "9am")),
    // s2 fill is shared with the "Cannon Beach, OR" key row below.
    row(td("s0", "Monday, November 23") + td("s0", "Coast") + td("s0", "15 Minutes") + td("s2", "Hug Point")),
    row(td("s0", "") + td("s2", "Cannon Beach, OR")),
  ]);
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });
  assert.equal(s.days[0].events[0].city, "Cannon Beach, OR");
  assert.equal(s.days[0].events[0].type, undefined, "a city fill isn't also an activity type");
});

test("a city is inferred from the text when no colour matches", () => {
  const html = page([
    row(td("s1", "Day") + td("s1", "Summary") + td("s1", "Total Drive Time") + td("s1", "2pm")),
    row(
      td("s0", "Saturday, November 28") +
        td("s0", "Vancouver") +
        td("s0", "20 Minutes") +
        td("s0", "Vancouver, WA Shops and Downtown"),
    ),
  ]);
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });
  assert.equal(
    s.days[0].events[0].city,
    "Vancouver, WA",
    "falls back to place names in the entry itself",
  );
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

test("each list gets a place label for the toggle button", () => {
  const { sections } = mergeActivityTabs([COAST_TAB, PORTLAND_TAB, hikesTab()]);
  assert.deepEqual(
    sections.map((s) => [s.role, s.label]),
    [
      ["coast", "Cannon Beach"],
      ["inland", "Portland"],
    ],
    "labels come from the detected role, not the sheet's tab names",
  );
});

test("toggle labels survive unhelpful tab names", () => {
  const { sections } = mergeActivityTabs([
    { ...COAST_TAB, name: "Sheet 3" },
    { ...PORTLAND_TAB, name: "Sheet 4" },
    hikesTab(),
  ]);
  assert.deepEqual(sections.map((s) => s.label), ["Cannon Beach", "Portland"]);
});

test("a Washington list gets its own toggle button", () => {
  const washington = {
    gid: "14",
    name: "Washington",
    rows: parseGrid(
      page([
        row(td("s1", "Things to do") + td("s1", "Location") + td("s1", "Notes")),
        row(td("s0", "Vancouver waterfront") + td("s0", "1515 Broadway St, Vancouver, WA 98663") + td("s0", "")),
        row(td("s0", "Beacon Rock") + td("s0", "34841 WA-14, Stevenson, WA 98648") + td("s0", "")),
        row(td("s0", "Bonneville Hot Springs") + td("s0", "North Bonneville, WA 98639") + td("s0", "")),
      ]),
    ),
  };

  assert.equal(placeOf(washington), "washington");

  const { sections } = mergeActivityTabs([COAST_TAB, PORTLAND_TAB, washington, hikesTab()]);
  assert.deepEqual(
    sections.map((s) => s.label),
    ["Cannon Beach", "Portland", "Washington"],
  );
  const wa = sections.find((s) => s.label === "Washington")!;
  assert.equal(wa.activities.filter((a) => a.isHike).length, 0, "hikes still split coast/Portland");
  assert.equal(
    sections.find((s) => s.label === "Portland")!.activities.filter((a) => a.isHike).length,
    3,
  );
});

test("a third list keeps its own tab name as its label", () => {
  const extra = {
    gid: "13",
    name: "Rainy day backups",
    rows: parseGrid(
      page([
        row(td("s1", "Things to do") + td("s1", "Location") + td("s1", "Notes")),
        row(td("s0", "Movie theatre") + td("s0", "") + td("s0", "")),
      ]),
    ),
  };
  const { sections } = mergeActivityTabs([COAST_TAB, PORTLAND_TAB, extra, hikesTab()]);
  const third = sections.find((s) => s.tab.name === "Rainy day backups")!;
  assert.equal(third.role, "other");
  assert.equal(third.label, "Rainy day backups");
  assert.equal(third.activities.filter((a) => a.isHike).length, 0, "extra lists get no hikes");
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

test("restaurants split cuisine, trivia and opening constraints into pills", () => {
  const html = page([
    row(
      td("s1", "Name") +
        td("s1", "Location") +
        td("s1", "Website") +
        td("s1", "Type of Food") +
        td("s1", "Notes"),
    ),
    row(
      td("s0", "Han Oak") +
        td("s0", "511 NE 24th Ave, Portland, OR 97232") +
        td("s0", '<a href="https://www.hanoakpdx.com/">hanoakpdx.com</a>') +
        td("s0", "Korean") +
        td("s0", "Wed-Sat"),
    ),
    row(
      td("s0", "Wonderwood Springs") +
        td("s0", "8811 N Lombard St, Portland, OR 97203") +
        td("s0", "") +
        td("s0", "American") +
        td("s0", "Trivia Friday 6-8, Mini Golf, Ice cream Weird Vibes"),
    ),
  ]);
  const [hanOak, wonderwood] = parseRestaurants({ gid: "6", name: "Food", rows: parseGrid(html) });

  assert.equal(hanOak.cuisine, "Korean");
  assert.deepEqual(hanOak.hours, ["Wed-Sat"], "day ranges become their own pill");
  assert.equal(hanOak.href, "https://www.hanoakpdx.com/", "the Website column supplies the link");
  assert.equal(hanOak.location, "511 NE 24th Ave, Portland, OR 97232");

  assert.equal(wonderwood.trivia, "Trivia Friday 6-8");
  assert.equal(
    wonderwood.notes,
    "Mini Golf, Ice cream Weird Vibes",
    "what's left of the notes stays as text",
  );
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

/* --------------------------------------------------- dates and locations */

test("the year is solved from the weekday, since the sheet omits it", () => {
  const nov2026 = new Date("2026-09-04T00:00:00Z");
  // Nov 21 falls on a Saturday in 2026, not 2025 or 2027.
  assert.equal(resolveDayDate("Saturday, November 21", nov2026), "2026-11-21");
  assert.equal(resolveDayDate("Thursday, November 26", nov2026), "2026-11-26");
  assert.equal(resolveDayDate("Sunday, November 29", nov2026), "2026-11-29");
});

test("a wrong weekday finds the year that actually matches", () => {
  const ref = new Date("2026-09-04T00:00:00Z");
  // Nov 21 is a Friday in 2025 — so this label resolves to 2025, not 2026.
  assert.equal(resolveDayDate("Friday, November 21", ref), "2025-11-21");
});

test("resolveDayDate copes with no weekday and with nonsense", () => {
  const ref = new Date("2026-09-04T00:00:00Z");
  assert.equal(resolveDayDate("November 21", ref), "2026-11-21");
  assert.equal(resolveDayDate("Somenonsense", ref), undefined);
  assert.equal(resolveDayDate("", ref), undefined);
});

test("each day picks up the city it mostly happens in", () => {
  const html = page([
    row(
      td("s1", "Day") + td("s1", "Summary") + td("s1", "Total Drive Time") +
        td("s1", "9am") + td("s1", "10am") + td("s1", "11am") + td("s1", "12pm"),
    ),
    // Three coastal stops then one drive inland — the coast should win, as it
    // does on the real 24th.
    row(
      td("s0", "Tuesday, November 24") + td("s0", "Coast to Portland") + td("s0", "2 Hours") +
        td("s0", "Manzanita Beach Town") + td("s0", "Rockaway Beach") +
        td("s0", "Tillamook Tour") + td("s0", "Drive to Portland"),
    ),
    // Entirely Portland-side.
    row(
      td("s0", "Wednesday, November 25") + td("s0", "Portland") + td("s0", "20 minutes") +
        td("s0", "Japaneese Gardens") + td("s0", "Downtown Portland Shops") +
        td("s0", "") + td("s0", ""),
    ),
  ]);
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });

  assert.equal(s.days[0].date, "2026-11-24");
  assert.equal(s.days[0].city, "Cannon Beach, OR", "most of the 24th is on the coast");
  assert.equal(s.days[1].city, "Portland, OR");
});

test("an evenly split day is credited to where it ends up", () => {
  // Half coast, half Portland. The tie goes to the later location, since
  // that's where the evening — and the night's weather — happens.
  const html = page([
    row(
      td("s1", "Day") + td("s1", "Summary") + td("s1", "Total Drive Time") +
        td("s1", "9am") + td("s1", "10am") + td("s1", "11am") + td("s1", "12pm"),
    ),
    row(
      td("s0", "Tuesday, November 24") + td("s0", "Split") + td("s0", "2 Hours") +
        td("s0", "Manzanita Beach Town") + td("s0", "Tillamook Tour") +
        td("s0", "Drive to Portland") + td("s0", "Dinner in Portland"),
    ),
  ]);
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });
  assert.equal(s.days[0].city, "Portland, OR");
});

test("a day with no recognisable location has none, and no weather is forced", () => {
  const html = page([
    row(td("s1", "Day") + td("s1", "Summary") + td("s1", "Total Drive Time") + td("s1", "9am")),
    row(td("s0", "Sunday, November 29") + td("s0", "Travel Day") + td("s0", "20 minutes") + td("s0", "K,T Leave")),
  ]);
  const s = parseSchedule({ gid: "1", name: "Schedule", rows: parseGrid(html) });
  assert.equal(s.days[0].city, undefined);
  assert.equal(s.days[0].date, "2026-11-29", "the date still resolves for daylight hours");
});

/* ---------------------------------------------------------------- to-do */

const TODO_HTML = page([
  row(
    td("s1", "Type") + td("s1", "When?") + td("s1", "Who?") +
      td("s1", "Done?") + td("s1", "Details if Booked") + td("s1", "Notes"),
  ),
  row(td("s1", "Activities") + blank(5)),
  row(td("s0", "Japaneese Garden") + td("s0", "") + td("s0", "") + td("s0", "FALSE") + td("s0", "") + td("s0", "")),
  row(td("s0", "Top Golf") + td("s0", "14 Days in Advance") + td("s0", "") + td("s0", "FALSE") + td("s0", "") + td("s0", "Can Book 14 days in advance")),
  row(blank(6)),
  row(td("s1", "Dinner Reservations") + blank(5)),
  row(td("s0", "Oakshire Beer Hall") + td("s0", "Trivia Wed 7-9") + td("s0", "") + td("s0", "TRUE") + td("s0", "") + td("s0", "Arrive early")),
  row(td("s0", "Order Thanksgiving Food") + td("s0", "October 25th") + td("s0", "") + td("s0", "FALSE") + td("s0", "") + td("s0", "")),
  row(td("s1", "Rental Cars") + blank(5)),
  row(td("s0", "Book Rental Car") + td("s0", "NOW") + td("s0", "Eric") + td("s0", "FALSE") + td("s0", "") + td("s0", "")),
]);

/* The current layout: task names in a blank-headed first column, `Type`
   naming the section, no heading rows at all. */
const TODO_CSV = [
  ["", "Type", "When?", "Who?", "Done? ", "Details if Booked", "Notes"],
  ["Japaneese Garden", "Activities ", "", "", "FALSE", "", ""],
  ["Top Golf", "Activities ", "14 Days in Advance", "", "FALSE", "", "Book 14 days ahead"],
  ["Din Thai Fung ", "Dinner Reservations ", "30 days in advance ", "", "FALSE", "", ""],
  ["Oakshire Beer Hall", "Dinner Reservations ", "Trivia Wed 7-9", "", "TRUE", "", "Arrive early"],
  ["Cancel/ Re Book lodging ", "Lodging", "November 7th ", "Eric", "FALSE", "", ""],
  ["Book Reantal Car ", "Rental Cars", "NOW", "Eric", "FALSE", "", ""],
  ["Book Reantal Car ", "Rental Cars", "NOW", "Rich", "FALSE", "", ""],
];

test("a Type column groups tasks into sections", () => {
  const values = cellsFromCsv(TODO_CSV);
  const groups = parseTodos({ gid: "9", name: "To-Do List", rows: values, values });

  assert.deepEqual(
    groups.map((g) => [g.name, g.items.length]),
    [
      ["Activities", 2],
      ["Dinner Reservations", 2],
      ["Lodging", 1],
      ["Rental Cars", 2],
    ],
    "sections come from the Type column, in first-appearance order",
  );

  const [first] = groups[0].items;
  assert.equal(first.task, "Japaneese Garden", "the task is the blank-headed column, not Type");
  assert.equal(groups[3].items[1].who, "Rich");
  assert.deepEqual(countTodos(groups), { done: 1, total: 7 });
  assert.equal(
    groups.flatMap((g) => g.items).find((t) => t.done)?.task,
    "Oakshire Beer Hall",
  );
});

test("two tasks with the same name in one section both survive", () => {
  const values = cellsFromCsv(TODO_CSV);
  const cars = parseTodos({ gid: "9", name: "To-Do List", rows: values, values }).at(-1)!;
  assert.equal(cars.items.length, 2, "grouping by Type mustn't dedupe identical task names");
  assert.deepEqual(cars.items.map((t) => t.who), ["Eric", "Rich"]);
});

test("the legacy heading-row layout still parses", () => {
  const values = cellsFromCsv([
    ["Type ", "When?", "Who?", "Done? ", "Details if Booked", "Notes"],
    ["Activities ", "", "", "", "", ""],
    ["Japaneese Garden", "", "", "FALSE", "", ""],
    ["Dinner Reservations ", "", "", "", "", ""],
    ["Oakshire Beer Hall", "Trivia Wed 7-9", "", "TRUE", "", "Arrive early"],
  ]);
  const groups = parseTodos({ gid: "9", name: "old", rows: values, values });

  assert.deepEqual(
    groups.map((g) => [g.name, g.items.length]),
    [
      ["Activities", 1],
      ["Dinner Reservations", 1],
    ],
    "an older copy of the sheet keeps working",
  );
  assert.equal(countTodos(groups).done, 1);
});

test("a Done? column makes the tab a to-do list", () => {
  assert.equal(classify({ gid: "9", name: "To-Do List", rows: parseGrid(TODO_HTML) }), "todo");
});

test("to-do items group under their headings and read their checkboxes", () => {
  const groups = parseTodos({ gid: "9", name: "To-Do List", rows: parseGrid(TODO_HTML) });

  assert.deepEqual(
    groups.map((g) => [g.name, g.items.length]),
    [
      ["Activities", 2],
      ["Dinner Reservations", 2],
      ["Rental Cars", 1],
    ],
  );

  const oakshire = groups[1].items[0];
  assert.equal(oakshire.task, "Oakshire Beer Hall");
  assert.equal(oakshire.done, true, "TRUE is a ticked box");
  assert.equal(oakshire.notes, "Arrive early");

  assert.equal(groups[0].items[0].done, false, "FALSE is unticked");
  assert.equal(groups[2].items[0].who, "Eric");
  assert.equal(groups[2].items[0].when, "NOW");

  assert.deepEqual(countTodos(groups), { done: 1, total: 5 });
});

test("checkboxes are recognised however the sheet publishes them", () => {
  const yes = [
    "TRUE", "true", " True ", "T", "Yes", "y", "1",
    "DONE", "complete", "completed", "booked",
    "x", "checked", "✓", "✔", "✅", "☑", "☑️", "☒",
  ];
  for (const v of yes) assert.ok(isChecked(v), `«${v}» should read as done`);

  const no = ["FALSE", "false", "0", "no", "n", "", "  ", "maybe", "☐", "-", "TBD"];
  for (const v of no) assert.ok(!isChecked(v), `«${v || "blank"}» should read as not done`);
});

test("a struck-through task counts as done even with no checkbox", () => {
  const STRIKE_STYLE = `<style>.ritz .waffle .s9{background-color:#ffffff;text-decoration:line-through;}</style>`;
  const html = `<html><head>${STRIKE_STYLE}</head><body>
<div id="sheets-viewport"><div class="ritz grid-container" id="1" dir="ltr">
<table class="waffle"><tbody>
${row(td("s1", "Type") + td("s1", "Done?"))}
${row(td("s9", "Already sorted") + td("s0", ""))}
${row(td("s0", "Still outstanding") + td("s0", "FALSE"))}
</tbody></table></div></div></body></html>`;

  const rows = parseGrid(html);
  assert.equal(rows[1][0].strike, true, "line-through is captured off the style class");

  const groups = parseTodos({ gid: "9", name: "To-Do", rows });
  assert.deepEqual(
    groups[0].items.map((t) => [t.task, t.done]),
    [
      ["Already sorted", true],
      ["Still outstanding", false],
    ],
    "a struck task is done, and isn't mistaken for a group heading",
  );
});

test("csv parsing survives quotes, commas and newlines inside fields", () => {
  const csv = '"a","b,c","d""e"\n"multi\nline","",""\n';
  assert.deepEqual(parseCsv(csv), [
    ["a", "b,c", 'd"e'],
    ["multi\nline", "", ""],
  ]);
});

test("the values feed recovers checkboxes the published HTML drops", () => {
  // Google publishes a checkbox cell as empty, so the Done column arrives
  // blank from the HTML. Without the values feed every tick is lost AND bare
  // task rows collapse into headings.
  const header = ["Type", "When?", "Who?", "Done?", "Details if Booked", "Notes"];
  const data = [
    ["Activities", "", "", "", "", ""],
    ["Japaneese Garden", "", "", "FALSE", "", ""],
    ["Amaterra Winery", "", "", "FALSE", "", ""],
    ["Dinner Reservations", "", "", "", "", ""],
    ["Oakshire Beer Hall", "Trivia Wed 7-9", "", "TRUE", "", "Arrive early"],
    ["Order Thanksgiving Food", "October 25th", "", "FALSE", "", ""],
  ];
  const values = cellsFromCsv([header, ...data]);
  // What the published HTML gives us: the same grid with the Done column blank.
  const rows = cellsFromCsv([header, ...data.map((r) => r.map((v, i) => (i === 3 ? "" : v)))]);

  const withValues = parseTodos({ gid: "9", name: "To-Do List", rows, values });
  assert.deepEqual(
    withValues.map((g) => g.name),
    ["Activities", "Dinner Reservations"],
    "only the real headings become sections",
  );
  assert.deepEqual(countTodos(withValues), { done: 1, total: 4 });
  assert.equal(
    withValues[1].items.find((t) => t.done)?.task,
    "Oakshire Beer Hall",
    "the ticked item is the one that's ticked in the sheet",
  );

  const htmlOnly = parseTodos({ gid: "9", name: "To-Do List", rows });
  assert.equal(countTodos(htmlOnly).done, 0, "without the feed, every tick is lost");
  assert.ok(
    countTodos(htmlOnly).total < countTodos(withValues).total,
    "and tasks go missing, having been read as section headings",
  );
  assert.ok(
    !htmlOnly.some((g) => g.items.some((t) => t.task === "Japaneese Garden")),
    "a bare task row vanishes entirely — read as a heading, then dropped as empty",
  );
});

test("classify reads the values feed when the HTML header is thin", () => {
  const values = cellsFromCsv([
    ["Type", "When?", "Who?", "Done?", "Details if Booked", "Notes"],
    ["Activities", "", "", "", "", ""],
  ]);
  assert.equal(classify({ gid: "9", name: "To-Do", rows: [], values }), "todo");
});

test("a task with only a name isn't swallowed as a group heading", () => {
  // The failure mode if a checkbox ever publishes as an empty cell: a task
  // row would look exactly like a section heading, and the whole group under
  // it would disappear. The checkbox column being present is what tells them
  // apart.
  const html = page([
    row(td("s1", "Type") + td("s1", "When?") + td("s1", "Done?")),
    row(td("s1", "Activities") + td("s0", "") + td("s0", "")),
    row(td("s0", "Japaneese Garden") + td("s0", "") + td("s0", "FALSE")),
    row(td("s0", "Top Golf") + td("s0", "") + td("s0", "TRUE")),
  ]);
  const groups = parseTodos({ gid: "9", name: "To-Do", rows: parseGrid(html) });

  assert.equal(groups.length, 1, "one group, not three");
  assert.equal(groups[0].name, "Activities");
  assert.deepEqual(
    groups[0].items.map((t) => [t.task, t.done]),
    [
      ["Japaneese Garden", false],
      ["Top Golf", true],
    ],
  );
});

test("a real checkbox input is read as its checked state", () => {
  const html = page([
    row(td("s1", "Type") + td("s1", "Done?")),
    row(td("s0", "Booked thing") + td("s0", '<input type="checkbox" checked disabled>')),
    row(td("s0", "Unbooked thing") + td("s0", '<input type="checkbox" disabled>')),
  ]);
  const groups = parseTodos({ gid: "9", name: "To-Do List", rows: parseGrid(html) });
  assert.deepEqual(
    groups[0].items.map((t) => [t.task, t.done]),
    [
      ["Booked thing", true],
      ["Unbooked thing", false],
    ],
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
