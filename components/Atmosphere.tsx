// Deterministic "randomness" so the server and client render identical markup.
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Light drizzle rather than a downpour — the sun's out.
const rand = lcg(20261121);
const DROPS = Array.from({ length: 38 }, () => ({
  left: rand() * 100,
  delay: rand() * 4,
  duration: 0.75 + rand() * 1.1,
  opacity: 0.12 + rand() * 0.3,
  height: 40 + rand() * 70,
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
