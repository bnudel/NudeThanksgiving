import type { ReactNode } from "react";

import type {
  Activity,
  GenericTable,
  LodgingGroup,
  Payment,
  Restaurant,
  Schedule,
  ScheduleDay,
  Stay,
  TodoGroup,
  Traveler,
} from "@/lib/model";
import { normalsFor, type Normals } from "@/lib/climate";
import { formatTime, sunTimes } from "@/lib/sun";
import { describe, lookup, placeForCity, type PlaceForecast, type Sky } from "@/lib/weather";

/* --------------------------------------------------------------- shared UI */

export function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <section className="section" id={id}>
      <div className="wrap">
        <div className="section-head">
          <h2>{title}</h2>
          {count ? <span className="count">{count}</span> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

function mapsUrl(place: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}

/* ------------------------------------------------------------------ schedule */

/** Lighten a hex fill so it reads as an accent on a dark background. */
function accent(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "var(--moss-bright)";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.55) return hex;
  const lift = (c: number) => Math.round(c + (255 - c) * 0.45);
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}

const glyph = {
  viewBox: "0 0 24 24",
  width: 14,
  height: 14,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function SkyGlyph({ sky }: { sky: Sky }) {
  const cloud = <path d="M6.5 18h11a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.4 3.4 0 0 0 6.5 18Z" />;
  if (sky === "clear")
    return (
      <svg {...glyph} className="g-sun">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </svg>
    );
  if (sky === "partly")
    return (
      <svg {...glyph} className="g-sun">
        <circle cx="8.5" cy="8" r="3" />
        <path d="M9 19h8a3 3 0 0 0 .2-6 4.3 4.3 0 0 0-8.2-1A3 3 0 0 0 9 19Z" />
      </svg>
    );
  if (sky === "rain" || sky === "drizzle" || sky === "storm")
    return (
      <svg {...glyph} className="g-wet">
        {cloud}
        <path d="M9 20v2M13 20v2M17 20v2" />
      </svg>
    );
  if (sky === "fog")
    return (
      <svg {...glyph} className="g-grey">
        <path d="M4 9h16M6 13h12M4 17h16" />
      </svg>
    );
  return (
    <svg {...glyph} className="g-grey">
      {cloud}
    </svg>
  );
}

function SunUpGlyph() {
  return (
    <svg {...glyph} className="g-sun">
      <path d="M4 18h16" />
      <path d="M12 5v5M8.5 11 12 7.5 15.5 11" />
      <path d="M6 14.5h1.5M16.5 14.5H18" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 16v-3l1.8-4.2A2 2 0 0 1 7.6 7.5h8.8a2 2 0 0 1 1.8 1.3L20 13v3" />
      <circle cx="7.5" cy="16.5" r="1.6" />
      <circle cx="16.5" cy="16.5" r="1.6" />
    </svg>
  );
}

/** Weather and daylight for one schedule day, at that day's location. */
function DayConditions({
  day,
  forecasts,
  normals,
}: {
  day: ScheduleDay;
  forecasts: PlaceForecast[];
  normals: Normals[];
}) {
  const place = placeForCity(day.city);
  const wx = lookup(forecasts, place.name, day.date);
  const typical = wx ? undefined : normalsFor(normals, place.name);
  const sun = day.date
    ? sunTimes(new Date(`${day.date}T12:00:00Z`), place.lat, place.lon)
    : null;

  if (!wx && !typical && !sun) return null;

  return (
    <div className="day-cond">
      {wx && (
        <span className="cond-wx" title={`${describe(wx.code).label} in ${place.name}`}>
          <SkyGlyph sky={describe(wx.code).sky} />
          {wx.hi !== null && <b>{Math.round(wx.hi)}°</b>}
          {wx.lo !== null && <span className="cond-lo">{Math.round(wx.lo)}°</span>}
          {wx.chance !== null && (
            <span className={wx.chance >= 40 ? "cond-rain" : "cond-lo"}>
              {Math.round(wx.chance)}% rain
            </span>
          )}
        </span>
      )}

      {typical && (
        <span
          className="cond-wx is-typical"
          title={`Average for mid-to-late November in ${place.name}, from ${typical.samples} days of past observations`}
        >
          <SkyGlyph sky={typical.wetPct >= 55 ? "rain" : "cloud"} />
          <b>{Math.round(typical.hi)}°</b>
          <span className="cond-lo">{Math.round(typical.lo)}°</span>
          <span className={typical.wetPct >= 50 ? "cond-rain" : "cond-lo"}>
            {typical.wetPct}% rain
          </span>
          <span className="cond-tag">typical</span>
        </span>
      )}

      {sun && (
        <span className="cond-sun" title={`Daylight in ${place.name}`}>
          <SunUpGlyph />
          {formatTime(sun.sunrise)}
          <span className="cond-sep">–</span>
          {formatTime(sun.sunset)}
        </span>
      )}
    </div>
  );
}

export function ScheduleView({
  schedule,
  forecasts = [],
  normals = [],
}: {
  schedule: Schedule;
  forecasts?: PlaceForecast[];
  normals?: Normals[];
}) {
  const { days, types, cities } = schedule;
  const cityColor = new Map(cities.map((c) => [c.label, accent(c.fg)]));

  if (!days.length) return <Empty>No days on the schedule tab yet.</Empty>;

  return (
    <>
      {(types.length > 0 || cities.length > 0) && (
        <div className="legend">
          {types.map((l, i) => (
            <span className="legend-item" key={`t${i}`}>
              <span className="swatch" style={{ background: l.bg || "transparent" }} aria-hidden />
              {l.label}
            </span>
          ))}
          {cities.map((l, i) => (
            <span className="legend-item" key={`c${i}`}>
              <span
                className="swatch swatch-city"
                style={{ borderColor: accent(l.fg), color: accent(l.fg) }}
                aria-hidden
              />
              {l.label}
            </span>
          ))}
        </div>
      )}

      <div className="card">
        {days.map((d, i) => {
          const [dow, ...rest] = d.label.split(/,\s*/);
          const isThanksgiving = /thursday/i.test(d.label) && /november\s*26/i.test(d.label);
          return (
            <div className={`day${isThanksgiving ? " day-thanksgiving" : ""}`} key={i}>
              <div>
                <span className="day-dow">{rest.length ? dow : " "}</span>
                <span className="day-label">{rest.length ? rest.join(", ") : d.label}</span>
                {isThanksgiving && <div className="day-summary">Thanksgiving</div>}
                {d.summary && <div className="day-summary">{d.summary}</div>}
                {d.driveTime && (
                  <div className="day-drive">
                    <DriveIcon />
                    {d.driveTime}
                  </div>
                )}
                <DayConditions day={d} forecasts={forecasts} normals={normals} />
              </div>
              <div className="events">
                {d.events.length === 0 ? (
                  <span className="empty">Nothing planned yet</span>
                ) : (
                  d.events.map((e, j) => {
                    const color = e.bg ? accent(e.bg) : "var(--moss)";
                    const city = e.city ? cityColor.get(e.city) ?? accent(e.fg) : undefined;
                    return (
                      <div className="event" key={j} style={{ borderLeftColor: color }}>
                        <span className="event-time">{e.time}</span>
                        <span className="event-text">
                          {e.text}
                          {e.type && (
                            <span className="event-cat" style={{ color }}>
                              {e.type}
                            </span>
                          )}
                          {e.city && (
                            <span className="event-cat event-city" style={{ color: city }}>
                              {e.city}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- lodging */

function isBooked(s: Stay): boolean {
  return /^(booked|yes|confirmed|y|x|✓)/i.test(s.status.trim());
}

export function LodgingView({ groups }: { groups: LodgingGroup[] }) {
  if (!groups.length) return <Empty>No lodging entered yet.</Empty>;

  return (
    <div className="lodging">
      {groups.map((group, gi) => {
        const decided = group.stays.some(isBooked);
        return (
          <div className="lodging-group" key={gi}>
            {group.name && (
              <div className="group-head">
                <h3>{group.name}</h3>
                <span className="count">
                  {decided
                    ? "booked"
                    : `${group.stays.length} option${group.stays.length === 1 ? "" : "s"}`}
                </span>
              </div>
            )}
            <div className="grid two">
              {group.stays.map((s, i) => {
                const address = s.location
                  .split(/,?\s*(?:near|Renewed|Check-in)/i)[0]
                  .trim();
                const booked = isBooked(s);
                return (
                  <div className={`card stay${booked ? " stay-booked" : ""}`} key={i}>
                    <div className="stay-head">
                      <span className="kicker">{s.label || s.acct || "Option"}</span>
                      {booked && <span className="pill good">Booked</span>}
                      {!booked && s.paid && <span className="pill good">Paid</span>}
                    </div>
                    <div className="stay-dates">{s.dates}</div>
                    <div className="stay-loc">{s.location}</div>
                    <div className="stay-meta">
                      {s.acct && s.label && <span className="pill">{s.acct}</span>}
                      {s.cost && <span className="pill">{s.cost}</span>}
                      {s.cancel && <span className="pill warn">{s.cancel}</span>}
                    </div>
                    {address && (
                      <p className="map-link" style={{ marginBottom: 0 }}>
                        <a href={mapsUrl(address)} target="_blank" rel="noreferrer">
                          Open in Maps &rarr;
                        </a>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- flights */

export function FlightsView({ travelers }: { travelers: Traveler[] }) {
  if (!travelers.length) return <Empty>No flights entered yet.</Empty>;
  return (
    <div className="grid">
      {travelers.map((t, i) => (
        <div className="card" key={i}>
          <div className="flight-card">
            <div className="flight-name">{t.name}</div>
            <div>
              <div className="leg-title">Arriving</div>
              {t.arrive ? (
                <>
                  <div className="leg-when">
                    {[t.arrive.day, t.arrive.time].filter(Boolean).join(" · ")}
                  </div>
                  {t.arrive.details && <div className="leg-details">{t.arrive.details}</div>}
                </>
              ) : (
                <div className="leg-missing">Not booked yet</div>
              )}
            </div>
            <div>
              <div className="leg-title">Departing</div>
              {t.depart ? (
                <>
                  <div className="leg-when">
                    {[t.depart.day, t.depart.time].filter(Boolean).join(" · ")}
                  </div>
                  {t.depart.details && <div className="leg-details">{t.depart.details}</div>}
                </>
              ) : (
                <div className="leg-missing">Not booked yet</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- activities */

/** Mountain marker for entries that came from the hikes list. */
function HikeMark() {
  return (
    <svg
      className="hike-mark"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 19 L9.5 7.5 L13 13.5 L15 10 L21 19 Z" />
    </svg>
  );
}

export function ActivitiesView({ items }: { items: Activity[] }) {
  if (!items.length) return <Empty>Nothing on this list yet.</Empty>;
  return (
    <div className="grid three">
      {items.map((a, i) => {
        const needs = /^(y|yes|true)/i.test(a.needsReservation);
        return (
          <div className={`act${a.isHike ? " act-hike" : ""}`} key={i}>
            <div className="act-name">
              {a.isHike && <HikeMark />}
              {a.href ? (
                <a href={a.href} target="_blank" rel="noreferrer">
                  {a.name}
                </a>
              ) : (
                a.name
              )}
            </div>
            {(a.location || a.rank || needs || a.when || a.isHike) && (
              <div className="stay-meta" style={{ marginTop: 2 }}>
                {a.isHike && <span className="pill good">Hike</span>}
                {a.location && <span className="pill">{a.location}</span>}
                {a.rank && <span className="pill good">Rank {a.rank}</span>}
                {needs && <span className="pill warn">Reservation needed</span>}
                {a.when && <span className="pill warn">{a.when}</span>}
              </div>
            )}
            {a.notes && <div className="act-notes">{a.notes}</div>}
            <div className="map-link">
              <a href={mapsUrl(`${a.name} ${a.location} Oregon`)} target="_blank" rel="noreferrer">
                Map
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- restaurants */

export function RestaurantsView({ items }: { items: Restaurant[] }) {
  if (!items.length) return <Empty>No restaurants yet.</Empty>;
  return (
    <div className="grid three">
      {items.map((r, i) => (
        <div className="act" key={i}>
          <div className="act-name">
            {r.href ? (
              <a href={r.href} target="_blank" rel="noreferrer">
                {r.name}
              </a>
            ) : (
              r.name
            )}
          </div>
          {(r.cuisine || r.trivia || r.hours.length > 0) && (
            <div className="stay-meta" style={{ marginTop: 2 }}>
              {r.cuisine && <span className="pill cuisine">{r.cuisine}</span>}
              {r.trivia && <span className="pill trivia">{r.trivia}</span>}
              {r.hours.map((h, j) => (
                <span className="pill warn" key={j}>
                  {h}
                </span>
              ))}
            </div>
          )}
          {r.notes && <div className="act-notes">{r.notes}</div>}
          {r.location && <div className="act-notes faint">{r.location}</div>}
          <div className="map-link">
            <a
              href={mapsUrl(r.location || `${r.name} restaurant Portland Oregon`)}
              target="_blank"
              rel="noreferrer"
            >
              Map
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- todo */

function CheckMark({ done }: { done: boolean }) {
  return (
    <span className={`box${done ? " is-done" : ""}`} aria-hidden>
      {done && (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      )}
    </span>
  );
}

export function TodoView({ groups }: { groups: TodoGroup[] }) {
  if (!groups.length) return <Empty>Nothing on the list yet.</Empty>;

  return (
    <div className="todo">
      {groups.map((group, gi) => {
        const done = group.items.filter((t) => t.done).length;
        return (
          <div className="todo-group" key={gi}>
            <div className="group-head">
              <h3>{group.name || "To do"}</h3>
              <span className="count">
                {done} of {group.items.length} done
              </span>
            </div>
            <ul className="todo-list">
              {group.items.map((t, i) => (
                <li className={`todo-item${t.done ? " is-done" : ""}`} key={i}>
                  <CheckMark done={t.done} />
                  <div className="todo-body">
                    <span className="todo-task">{t.task}</span>
                    {(t.when || t.who || t.details) && (
                      <span className="stay-meta">
                        {t.who && <span className="pill">{t.who}</span>}
                        {t.when && <span className="pill warn">{t.when}</span>}
                        {t.details && <span className="pill good">{t.details}</span>}
                      </span>
                    )}
                    {t.notes && <span className="act-notes">{t.notes}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="faint" style={{ marginTop: 4 }}>
        Tick the boxes in the spreadsheet and they&rsquo;ll cross off here.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ payments */

export function PaymentsView({ items }: { items: Payment[] }) {
  if (!items.length) return <Empty>No payments logged yet.</Empty>;
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>What</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={i}>
              <td>{p.date}</td>
              <td>{p.what}</td>
              <td className="amount">{p.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- generic */

export function GenericView({ table }: { table: GenericTable }) {
  if (!table.rows.length) return <Empty>This tab is empty.</Empty>;
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i}>{h || " "}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {table.headers.map((_, j) => {
                const cell = r[j];
                return (
                  <td key={j}>
                    {cell?.href ? (
                      <a href={cell.href} target="_blank" rel="noreferrer">
                        {cell.text || cell.href}
                      </a>
                    ) : (
                      cell?.text ?? ""
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
