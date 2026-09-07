import type { ReactNode } from "react";

import type {
  Activity,
  GenericTable,
  LodgingGroup,
  Payment,
  Restaurant,
  Schedule,
  Stay,
  Traveler,
} from "@/lib/model";

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

export function ScheduleView({ schedule }: { schedule: Schedule }) {
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
