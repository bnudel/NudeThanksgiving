# Nudelman Thanksgiving 2026

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
| `SHEET_PUB_ID` | the published `2PACX-…` id | Where the data is read from |
| `SHEET_ID` | the `/edit` sheet id | Only used for the "edit the spreadsheet" link |
| `SHEET_REVALIDATE` | `300` | Seconds between re-reads of the sheet |
| `SITE_URL` | `http://localhost:3000` | Where `/api/refresh` redirects back to |

Set `SITE_URL` to your Vercel domain after the first deploy.

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
| `Dates` + `Cancel policy` | Lodging cards with cost, cancel-by date, map link |
| `Name` + `Arrival Day` / `Depart Day` | Per-person flight cards, arrivals + departures merged |
| `Things to do` | Activity cards with rank, reservation flag, notes |
| `Date` + `What` + `How Much` | Payments table |
| `Name` + `Location` + `Notes` | Restaurant cards (name inferred from the link if blank) |
| anything else | A plain styled table |

That last row matters: **a brand-new tab you add later will still render**, just
as a table. If you want it styled specially, tell Claude what the tab is.

### Schedule colours

The legend rows at the bottom of the Schedule tab define the categories. The
site reads each legend row's fill colour, then matches every event cell's fill
against it to label the event. Change a legend colour in the sheet and the site
follows. Merged cells become multi-hour events automatically.

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
