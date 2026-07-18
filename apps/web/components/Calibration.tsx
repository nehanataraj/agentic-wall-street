"use client";

import { AGENTS } from "../lib/demo-data";

/** Full-width calibration diagonal: stated confidence (x) vs observed frequency (y). */
export function CalibrationDiagonal({
  agentId,
  large = false,
}: {
  agentId: string;
  large?: boolean;
}) {
  const agent = AGENTS.find((a) => a.id === agentId);
  const pts = agent?.calibration ?? [];
  const size = 400;
  const pad = 36;
  const inner = size - pad * 2;

  const toX = (c: number) => pad + ((c - 0.5) / 0.5) * inner;
  const toY = (f: number) => pad + inner - ((f - 0.5) / 0.5) * inner;

  return (
    <svg
      className="cal-svg"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Calibration plot: stated confidence versus observed frequency"
      style={large ? { maxWidth: "100%" } : { maxWidth: 280 }}
    >
      {/* Grid */}
      {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((v) => (
        <g key={v}>
          <line
            x1={toX(v)}
            y1={pad}
            x2={toX(v)}
            y2={pad + inner}
            stroke="var(--hairline)"
            strokeWidth={1}
          />
          <line
            x1={pad}
            y1={toY(v)}
            x2={pad + inner}
            y2={toY(v)}
            stroke="var(--hairline)"
            strokeWidth={1}
          />
          <text
            x={toX(v)}
            y={pad + inner + 14}
            textAnchor="middle"
            fontFamily="var(--mono)"
            fontSize={9}
            fill="var(--muted)"
          >
            {v.toFixed(1)}
          </text>
          <text
            x={pad - 8}
            y={toY(v) + 3}
            textAnchor="end"
            fontFamily="var(--mono)"
            fontSize={9}
            fill="var(--muted)"
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* 45° truth line — accent */}
      <line
        x1={toX(0.5)}
        y1={toY(0.5)}
        x2={toX(1)}
        y2={toY(1)}
        stroke="var(--accent)"
        strokeWidth={1.5}
      />

      {/* Agent points */}
      {pts.map(([c, f], i) => (
        <circle
          key={i}
          cx={toX(c)}
          cy={toY(f)}
          r={4}
          fill="var(--ink)"
          stroke="var(--paper)"
          strokeWidth={1}
        />
      ))}

      <text
        x={pad + inner / 2}
        y={size - 6}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={10}
        fill="var(--muted)"
      >
        stated confidence →
      </text>
      <text
        x={12}
        y={pad + inner / 2}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={10}
        fill="var(--muted)"
        transform={`rotate(-90 12 ${pad + inner / 2})`}
      >
        observed frequency →
      </text>
    </svg>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const w = 80;
  const h = 28;
  const max = Math.max(...values, 0.01);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1}
        points={pts}
      />
    </svg>
  );
}
