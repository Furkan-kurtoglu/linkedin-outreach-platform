export function LineChart({ labels, series }: { labels: string[]; series: { key: string; color: string; counts: number[] }[] }) {
  const W = 640, H = 220, L = 34, B = 24, T = 10, R = 8;
  const max = Math.max(4, ...series.flatMap((s) => s.counts));
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, labels.length - 1);
  const y = (v: number) => T + (1 - v / nice) * (H - T - B);
  const ticks = [0, 1, 2, 3, 4].map((i) => (nice * i) / 4);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Etkinlik grafiği">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{t}</text>
        </g>
      ))}
      {[...new Set([0, Math.floor(labels.length / 4), Math.floor(labels.length / 2), Math.floor((labels.length * 3) / 4), labels.length - 1])].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{labels[i]}</text>
      ))}
      {series.map((s) => (
        <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.counts.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      ))}
    </svg>
  );
}

