import Atmosphere from "@/components/Atmosphere";
import Countdown from "@/components/Countdown";
import Haystack from "@/components/Haystack";
import PaymentsGate from "@/components/PaymentsGate";
import {
  ActivitiesView,
  FlightsView,
  GenericView,
  LodgingView,
  RestaurantsView,
  ScheduleView,
  Section,
} from "@/components/sections";
import {
  classify,
  parseActivities,
  parseFlights,
  parseGeneric,
  parseLodging,
  parseRestaurants,
  parseSchedule,
  slug,
  titleFor,
} from "@/lib/model";
import { EDIT_URL, fetchWorkbook, REVALIDATE, type Tab } from "@/lib/sheet";

export const revalidate = 300;

/** Section titles and anchors, deduplicated so two similar tabs can't collide. */
function buildIndex(tabs: Tab[]) {
  const used = new Map<string, number>();
  return tabs.map((tab) => {
    const kind = classify(tab);
    const title = titleFor(tab, kind);
    const base = slug(title);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return { tab, kind, title, id: n === 1 ? base : `${base}-${n}` };
  });
}

function renderTab({
  tab,
  kind,
  title,
  id,
}: ReturnType<typeof buildIndex>[number]) {
  const tabName = title;
  switch (kind) {
    case "schedule": {
      const schedule = parseSchedule(tab);
      return (
        <Section key={id} id={id} title={tabName} count={`${schedule.days.length} days`}>
          <ScheduleView schedule={schedule} />
        </Section>
      );
    }
    case "lodging": {
      const stays = parseLodging(tab);
      return (
        <Section key={id} id={id} title={tabName} count={`${stays.length} stays`}>
          <LodgingView stays={stays} />
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
      const items = parseActivities(tab);
      return (
        <Section key={id} id={id} title={tabName} count={`${items.length} ideas`}>
          <ActivitiesView items={items} />
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

  return (
    <>
      <Atmosphere />

      <header className="hero">
        <Haystack />
        <div className="wrap hero-inner">
          <div className="eyebrow">Cannon Beach · Seaside · Portland</div>
          <h1>
            Nudelman
            <em>Thanksgiving 2026</em>
          </h1>
          <p className="hero-sub">
            November 21–29 on the Oregon coast. Grey skies, standing water, a very large rock, and
            all of us in one place.
          </p>
          <Countdown />
        </div>
      </header>

      {sections.length > 0 && (
        <nav className="nav">
          <div className="nav-inner">
            {sections.map((s) => (
              <a key={s.tab.gid} href={`#${s.id}`}>
                {s.title}
              </a>
            ))}
          </div>
        </nav>
      )}

      <main>
        {error ? <SetupNotice message={error} /> : sections.map(renderTab)}

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
