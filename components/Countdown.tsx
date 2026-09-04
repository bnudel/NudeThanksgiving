"use client";

import { useEffect, useState } from "react";

/** First arrivals: Saturday, November 21, 2026, 9:36am PST (UTC-8). */
const TARGET = Date.UTC(2026, 10, 21, 17, 36, 0);

const UNITS: [string, number][] = [
  ["days", 86400000],
  ["hours", 3600000],
  ["minutes", 60000],
  ["seconds", 1000],
];

export default function Countdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Render nothing on the server pass to avoid a hydration mismatch.
  if (now === null) return <div className="countdown" style={{ minHeight: 74 }} />;

  let remaining = TARGET - now;
  if (remaining <= 0) {
    return (
      <div className="countdown">
        <div className="cd-unit" style={{ minWidth: 200 }}>
          <div className="cd-num">We&rsquo;re here</div>
          <div className="cd-label">Portland, Oregon</div>
        </div>
      </div>
    );
  }

  return (
    <div className="countdown">
      {UNITS.map(([label, ms]) => {
        const value = Math.floor(remaining / ms);
        remaining -= value * ms;
        return (
          <div className="cd-unit" key={label}>
            <div className="cd-num">{value}</div>
            <div className="cd-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
