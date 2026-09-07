import { describe, fetchForecasts, formatDate, type Sky } from "@/lib/weather";
import { Section } from "./sections";

function SkyIcon({ sky }: { sky: Sky }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 26,
    height: 26,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const cloud = <path d="M6.5 18h11a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.4 3.4 0 0 0 6.5 18Z" />;

  switch (sky) {
    case "clear":
      return (
        <svg {...common} className="sky sky-clear">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      );
    case "partly":
      return (
        <svg {...common} className="sky sky-clear">
          <circle cx="8.5" cy="8" r="3" />
          <path d="M8.5 2.5v1.6M3 8h1.6M4.6 4.1l1.1 1.1M12.4 4.1l-1.1 1.1" />
          <path d="M9 19h8a3 3 0 0 0 .2-6 4.3 4.3 0 0 0-8.2-1A3 3 0 0 0 9 19Z" />
        </svg>
      );
    case "fog":
      return (
        <svg {...common} className="sky sky-grey">
          <path d="M4 9h16M6 13h12M4 17h16" />
        </svg>
      );
    case "drizzle":
      return (
        <svg {...common} className="sky sky-wet">
          {cloud}
          <path d="M9 20.5v1M13 20.5v1M17 20.5v1" />
        </svg>
      );
    case "rain":
      return (
        <svg {...common} className="sky sky-wet">
          {cloud}
          <path d="M9 20v2M13 20v2M17 20v2" />
        </svg>
      );
    case "snow":
      return (
        <svg {...common} className="sky sky-grey">
          {cloud}
          <path d="M9 21h.01M13 21h.01M17 21h.01" />
        </svg>
      );
    case "storm":
      return (
        <svg {...common} className="sky sky-wet">
          {cloud}
          <path d="M13 19.5 10.5 23h3L11 26" />
        </svg>
      );
    default:
      return (
        <svg {...common} className="sky sky-grey">
          {cloud}
        </svg>
      );
  }
}

const round = (n: number | null) => (n === null ? "—" : `${Math.round(n)}°`);

export default async function Weather() {
  const forecasts = await fetchForecasts();

  return (
    <Section id="weather" title="Weather" count="next 7 days">
      {forecasts.length === 0 ? (
        <p className="empty">
          The forecast isn&rsquo;t loading right now. It&rsquo;ll come back on its own.
        </p>
      ) : (
        <div className="weather">
          {forecasts.map((f) => (
            <div className="card weather-place" key={f.place}>
              <div className="kicker">{f.place}</div>
              <div className="week">
                {f.days.map((d) => {
                  const { sky, label } = describe(d.code);
                  const { dow, day } = formatDate(d.date);
                  const wet = d.chance !== null && d.chance >= 50;
                  return (
                    <div className="wx" key={d.date} title={label}>
                      <span className="wx-dow">{dow}</span>
                      <span className="wx-date">{day}</span>
                      <SkyIcon sky={sky} />
                      <span className="wx-hi">{round(d.hi)}</span>
                      <span className="wx-lo">{round(d.lo)}</span>
                      <span className={`wx-chance${wet ? " is-wet" : ""}`}>
                        {d.chance === null ? "" : `${Math.round(d.chance)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="faint" style={{ marginTop: 14 }}>
        Forecast from Open-Meteo, refreshed every 30 minutes. Thanksgiving is still outside
        forecast range — this becomes the trip forecast in early November.
      </p>
    </Section>
  );
}
