import Atmosphere from "@/components/Atmosphere";
import Countdown from "@/components/Countdown";
import ActivityTabs, { type ActivityList } from "@/components/ActivityTabs";
import Haystack from "@/components/Haystack";
import PaymentsGate from "@/components/PaymentsGate";
import {
  FlightsView,
  GenericView,
  LodgingView,
  RestaurantsView,
  ScheduleView,
  Section,
  TodoView,
} from "@/components/sections";
import {
  classify,
  countStays,
  countTodos,
  mergeActivityTabs,
  orderSections,
  parseActivities,
  parseFlights,
  parseGeneric,
  parseLodging,
  parseRestaurants,
  parseSchedule,
  parseTodos,
  slug,
  titleFor,
  type TabKind,
} from "@/lib/model";
import { EDIT_URL, fetchWorkbook, REVALIDATE, type Tab } from "@/lib/sheet";
import { fetchClimate, type Normals } from "@/lib/climate";
import { fetchForecasts, type PlaceForecast } from "@/lib/weather";

export const revalidate = 300;

/**
 * Section titles and anchors, deduplicated so two similar tabs can't collide.
 * Activity tabs get a merge pass first: the hikes tab is folded into the
 * things-to-do lists rather than becoming a third section of its own.
 */
type Entry = {
  tab: Tab;
  kind: TabKind;
  title: string;
  id: string;
  /** Set only on the single combined "Things to do" entry. */
  lists?: ActivityList[];
};

function buildIndex(tabs: Tab[]): Entry[] {
  const kinds = new Map<Tab, TabKind>(tabs.map((t) => [t, classify(t)]));
  const { sections, absorbed } = mergeActivityTabs(
    tabs.filter((t) => kinds.get(t) === "activities"),
  );
  const absorbedTabs = new Set(absorbed);

  const lists: ActivityList[] = sections.map((s) => ({
    id: slug(s.label),
    label: s.label,
    items: s.activities,
  }));

  const used = new Map<string, number>();
  const entries: Entry[] = [];
  let placedActivities = false;

  for (const tab of tabs) {
    if (absorbedTabs.has(tab)) continue;
    const kind = kinds.get(tab)!;

    // Every things-to-do list shares one section with a toggle, placed where
    // the first of them appeared in the sheet.
    if (kind === "activities") {
      if (placedActivities) continue;
      placedActivities = true;
      entries.push({ tab, kind, title: "Things to do", id: "things-to-do", lists });
      continue;
    }

    const title = titleFor(tab, kind);
    const base = slug(title);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    entries.push({ tab, kind, title, id: n === 1 ? base : `${base}-${n}` });
  }

  return orderSections(entries);
}

function renderTab(
  { tab, kind, title, id, lists }: Entry,
  forecasts: PlaceForecast[],
  normals: Normals[],
) {
  const tabName = title;
  switch (kind) {
    case "schedule": {
      const schedule = parseSchedule(tab);
      return (
        <Section key={id} id={id} title={tabName} count={`${schedule.days.length} days`}>
          <ScheduleView schedule={schedule} forecasts={forecasts} normals={normals} />
        </Section>
      );
    }
    case "todo": {
      const groups = parseTodos(tab);
      const { done, total } = countTodos(groups);
      return (
        <Section key={id} id={id} title={tabName} count={`${done} of ${total} done`}>
          <TodoView groups={groups} />
        </Section>
      );
    }
    case "lodging": {
      const groups = parseLodging(tab);
      const total = countStays(groups);
      return (
        <Section key={id} id={id} title={tabName} count={`${total} options`}>
          <LodgingView groups={groups} />
        </Section>
      );
    }
    case "flights": {
      const travelers = parseFlights(tab);
      const booked = travelers.filter((t) => t.arrive || t.depart).length;
      return (
        <Section
          key={id}
          id={id}
          title={tabName}
          count={`${booked} of ${travelers.length} booked`}
        >
          <FlightsView travelers={travelers} />
        </Section>
      );
    }
    case "activities": {
      const all = lists ?? [{ id, label: tabName, items: parseActivities(tab) }];
      // With two or more lists the toggle buttons carry their own counts.
      const single = all.length === 1 ? all[0] : null;
      return (
        <Section
          key={id}
          id={id}
          title={tabName}
          count={single ? `${single.items.length} ideas` : undefined}
        >
          <ActivityTabs lists={all} />
        </Section>
      );
    }
    case "restaurants": {
      const items = parseRestaurants(tab);
      return (
        <Section key={id} id={id} title={tabName} count={`${items.length} spots`}>
          <RestaurantsView items={items} />
        </Section>
      );
    }
    case "payments": {
      // Deliberately no parsePayments here: this page is statically
      // prerendered, so anything read at build time ends up in the public
      // HTML. The rows are fetched only after /api/payments accepts the
      // password.
      return (
        <Section key={id} id={id} title={tabName} count="password required">
          <PaymentsGate />
        </Section>
      );
    }
    default:
      return (
        <Section key={id} id={id} title={tabName}>
          <GenericView table={parseGeneric(tab)} />
        </Section>
      );
  }
}

function SetupNotice({ message }: { message: string }) {
  return (
    <div className="wrap">
      <div className="card notice">
        <div className="kicker">Can&rsquo;t reach the spreadsheet</div>
        <h2 style={{ marginTop: 10 }}>The published sheet didn&rsquo;t load</h2>
        <p className="muted">{message}</p>
        <ol className="muted">
          <li>
            Open <a href={EDIT_URL}>the trip spreadsheet</a>
          </li>
          <li>
            <code>File → Share → Publish to web</code>
          </li>
          <li>
            Under <em>Link</em>, choose <code>Entire Document</code> and <code>Web page</code>
          </li>
          <li>
            Copy the <code>2PACX-…</code> id from the published link into the{" "}
            <code>SHEET_PUB_ID</code> environment variable
          </li>
        </ol>
        <p className="faint" style={{ marginBottom: 0 }}>
          Visit <code>/api/tabs</code> to see exactly which tabs were found.
        </p>
      </div>
    </div>
  );
}

export default async function Page() {
  let tabs: Tab[] = [];
  let error: string | null = null;

  try {
    tabs = await fetchWorkbook();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not read the spreadsheet.";
  }

  const sections = buildIndex(tabs);

  // Weather lives inside the schedule now — each day shows the forecast for
  // wherever that day happens. A weather outage yields an empty list and the
  // schedule simply renders without it.
  const [forecasts, normals] = await Promise.all([fetchForecasts(), fetchClimate()]);

  const navItems = sections.map((s) => ({ id: s.id, title: s.title }));
  const body = sections.map((s) => renderTab(s, forecasts, normals));

  return (
    <>
      <Atmosphere />

      <header className="hero">
        <Haystack />
        <div className="wrap hero-inner">
          <div className="eyebrow">Cannon Beach · Vancouver · Portland</div>
          <h1>
            Nudelman/Veldran
            <em>Thanksgiving 2026</em>
          </h1>
          <Countdown />
        </div>
      </header>

      {sections.length > 0 && (
        <nav className="nav">
          <div className="nav-inner">
            {navItems.map((n) => (
              <a key={n.id} href={`#${n.id}`}>
                {n.title}
              </a>
            ))}
          </div>
        </nav>
      )}

      <main>
        {error ? <SetupNotice message={error} /> : body}

        <div className="wrap">
          <div className="footer">
            <span>
              Live from the family spreadsheet · refreshes every {Math.round(REVALIDATE / 60)} min
            </span>
            <a href={EDIT_URL} target="_blank" rel="noreferrer">
              Edit the spreadsheet →
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
