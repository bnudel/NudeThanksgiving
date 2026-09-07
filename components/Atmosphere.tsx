// Deterministic "randomness" so the server and client render identical markup.
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// A real drizzle, but not the downpour we started with — the sun's out too.
const rand = lcg(20261121);
const DROPS = Array.from({ length: 64 }, () => ({
  left: rand() * 100,
  delay: rand() * 3.4,
  duration: 0.6 + rand() * 0.95,
  opacity: 0.16 + rand() * 0.36,
  height: 45 + rand() * 80,
}));

export default function Atmosphere() {
  return (
    <>
      <div className="fog high" aria-hidden />
      <div className="fog low" aria-hidden />
      <div className="rain" aria-hidden>
        {DROPS.map((d, i) => (
          <span
            key={i}
            className="drop"
            style={{
              left: `${d.left}%`,
              height: `${d.height}px`,
              opacity: d.opacity,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
            }}
          />
        ))}
      </div>
    </>
  );
}
