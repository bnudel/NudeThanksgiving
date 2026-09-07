# Nudelman/Veldran Thanksgiving 2026

A rainy-Oregon-coast trip site that reads a Google Sheet as its database.
Every tab in the spreadsheet becomes a section on the page — when someone fills
in a cell, the site picks it up on the next refresh. No code changes needed to
add a tab, rename a tab, or add a row.

---

## The spreadsheet connection

Already set up. The site reads the sheet's *published* HTML, which is what
carries your colour-coded schedule legend through to the page.

The published id (`SHEET_PUB_ID`) is the `2PACX-…` string from
**File → Share → Publish to web** — not the id in the `/edit` URL. It's baked
in as a default and can be overridden with an environment variable.

If you ever re-publish and get a new `2PACX-…` link, update `SHEET_PUB_ID`.

> Publishing makes the sheet readable at a public URL. The site is public too,
> so this is consistent — but it does mean flight record locators and Airbnb
> addresses are visible to anyone with either link.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # parser unit tests, no network needed
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel              # first deploy, accept the defaults
vercel --prod
```

Or push this folder to a GitHub repo and import it at
[vercel.com/new](https://vercel.com/new). Framework preset: **Next.js**.
Root directory: this folder. No build settings to change.

### Environment variables (all optional)

| Variable | Default | What it does |
| --- | --- | --- |
| `PAYMENTS_PASSWORD` | *(none — required)* | Unlocks the Payments section |
| `SHEET_PUB_ID` | the published `2PACX-…` id | Where the data is read from |
| `SHEET_ID` | the `/edit` sheet id | Only used for the "edit the spreadsheet" link |
| `SHEET_REVALIDATE` | `300` | Seconds between re-reads of the sheet |
| `SITE_URL` | `http://localhost:3000` | Where `/api/refresh` redirects back to |

Set `SITE_URL` to your Vercel domain after the first deploy.

## The Payments password

Set `PAYMENTS_PASSWORD` in **Vercel → Project Settings → Environment Variables**
(all three environments), and in `.env.local` for local dev. Never commit it —
`.env.local` is gitignored and `.env.example` holds only a placeholder.

How it works: the homepage is statically prerendered, so any payment data read
at build time would be sitting in the public HTML for anyone to view-source.
Instead the Payments section renders a locked card with no data in it. The rows
are fetched from `/api/payments` only after that route verifies the password
server-side, using a constant-time comparison, with a per-minute attempt limit.
A correct password is remembered for the browser tab (`sessionStorage`), so
people don't retype it while browsing.

**What this does and doesn't protect.** It stops anyone with the site link from
seeing payment amounts. It does *not* hide them from someone who has the
published `2PACX-…` spreadsheet URL — publishing to the web makes every tab
readable at that address, and no site-side gate can change that. If that
matters later, the fix is to move Payments into its own unpublished
spreadsheet read through a Google service account.

To change the password, update the Vercel variable and redeploy. To revoke
access from someone, changing it is the only lever — there are no accounts.

## Keeping Next.js patched

Pinned to **Next 15.5.24** (the Maintenance LTS line as of August 2026). Next.js
ships security releases roughly monthly, and App Router apps like this one are
usually in scope, so check for a newer patch before any redeploy:

```bash
npm outdated next
npm install next@latest-15.5   # or bump the pin in package.json
```

Next 16.x is the Active LTS line if you'd rather move up; it's a bigger jump
than this site needs before November.

This app doesn't use `next/image`, so the AVIF image-optimization advisories
don't apply to it.

## Troubleshooting

- **`/api/tabs`** — shows every tab found, the header row the classifier saw,
  and which layout each one got. Start here if a tab renders as a plain table
  when you expected a designed view.
- **`/api/refresh`** — clears the cache and reloads the homepage immediately.

## How updates reach the site

The page is statically rendered and revalidated every 5 minutes, so a sheet
edit shows up within about 5 minutes (Google's own publish cache accounts for
most of that). To see a change right now, hit **`/api/refresh`** — it clears the
cache and bounces you back to the homepage.

## How tabs are matched to layouts

Tabs are identified by the **shape of their header row**, not their name, so
renaming a tab won't break anything:

| Header row contains | Rendered as |
| --- | --- |
| `Day` + `Summary` | Day-by-day schedule with colour-coded event badges |
| `Dates` + `Cancel policy` | Lodging options, grouped under location headings |
| `Name` + `Arrival Day` / `Depart Day` | Per-person flight cards, arrivals + departures merged |
| `Things to do` | Activity cards with rank, reservation flag, notes |
| `Hike Name` | Folded into the things-to-do lists, tagged as a hike |
| `Date` + `What` + `How Much` | Payments table |
| `Name` + `Location` + `Notes` | Restaurant cards with cuisine, trivia and hours pills |
| anything else | A plain styled table |

That last row matters: **a brand-new tab you add later will still render**, just
as a table. If you want it styled specially, tell Claude what the tab is.

**Columns are matched by heading, not position.** Add, remove or reorder a
column in any tab and the site follows — the coast tab (three columns) and the
Portland tab (six) share one layout.

### Things to do, and the Hikes tab

There is **one** "Things to do" section with a toggle between **Cannon Beach**,
**Portland** and **Washington**, each button showing its count. Both panels stay in the page
markup (the inactive one is `hidden`), so browser find still reaches every
entry and the content is there without JavaScript.

The toggle labels come from the place each tab's contents point at, not from
the tab names — a list full of Vancouver and Stevenson addresses becomes
"Washington" whatever its tab is called. A list that doesn't match any known
place keeps its own tab name as its label.

The Hikes tab stays in the spreadsheet — it's still the easiest place to
collect them — but it doesn't get a section of its own. Its rows are appended
to the lists and marked with a mountain icon and a "Hike" pill.

Which list a hike lands in:

1. If its **Location** cell names a coastal place ("Cannon Beach", "Seaside",
   "Coast", "Manzanita"…), it goes to the coast list.
2. Otherwise, if the **hike's own name** is unmistakably coastal ("Ecola",
   "Short Sand"), it goes to the coast list. The Hikes tab has no Location
   column today, so this is what makes the rule usable without editing it.
3. Otherwise it goes to the Portland list — where all seven Gorge hikes
   currently land.

Which list counts as "the coast one" is decided by scanning each tab's contents
for coastal versus inland place names, not by its tab name — so renaming a tab
won't misroute anything.

Adding a third things-to-do tab is fine; it just won't receive hikes. Deleting
the Hikes tab is also fine — the two lists carry on unchanged.

### Weather

A seven-day forecast for Cannon Beach and Portland, from
[Open-Meteo](https://open-meteo.com) — free, no API key, no account. Fetched
server-side and cached for 30 minutes. It isn't a spreadsheet tab; the section
is slotted in after the schedule.

If the API is down or returns something unexpected, the section says so and the
rest of the page is unaffected. Coordinates and the place list live in
`lib/weather.ts`.

Until early November the trip dates are outside forecast range, so this shows
the coming week rather than Thanksgiving. It becomes the trip forecast on its
own — no change needed.

### Lodging

Structure the tab as: a location name alone on a row, a header row, then one
row per option with its label (`Option 1`, `Option 2`…) in the blank column to
the left of `Dates`. Repeat for each location. A flat sheet with a single
header and no location headings also works.

Add a **`Status`** column and put `Booked` in it to mark the option you chose —
it gets a badge and the group header switches from "3 options" to "booked". A
cost containing the word "paid" shows a Paid badge automatically.

### Schedule colours

The key at the bottom of the Schedule tab drives two separate badges.

**Which is which comes from the label, not the colour.** A key entry ending in
a state — `Cannon Beach, OR`, `Vancouver, WA` — is a city; everything else
(Travel, Dining, Hiking…) is an activity type. That means a city shows up in
the key whether you coloured it by fill, by text colour, or not at all.

Matching entries to the key:

- **Cell fill → activity type**, matched against the type entries.
- **Text colour → city**, matched against the city entries. If a city was
  keyed by fill instead, that's matched too.
- If neither resolves, the city is guessed from place names in the entry text,
  so "Dinner in Vancouver" still gets tagged with no colour at all.

A row labelled "Key" is treated as a heading and skipped.

**Hour columns are found by their heading** ("7am", "2pm"), not by counting
from the left, so inserting a column like `Total Drive Time` doesn't shift the
timeline. Total Drive Time renders under the day's summary. Merged cells become
multi-hour entries automatically.

## Layout

```
app/
  layout.tsx           page shell + metadata
  page.tsx             fetches the workbook, renders a section per tab
  globals.css          the rainy Cannon Beach theme
  api/refresh/route.ts manual cache bust
components/
  Atmosphere.tsx       rain and drifting fog
  Haystack.tsx         Haystack Rock + the Needles, in silhouette
  Countdown.tsx        time until the first arrivals land at PDX
  sections.tsx         one view component per tab kind
lib/
  parse.ts             zero-dependency parser for published-sheet HTML
  sheet.ts             fetching + caching
  model.ts             tab classifier and typed row parsers
  parse.test.ts        unit tests
```
