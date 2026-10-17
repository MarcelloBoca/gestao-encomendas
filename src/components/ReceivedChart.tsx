"use client";

import { useState } from "react";
import { formatShort } from "@/lib/money";
import { axisLabel, niceMax, type Bucket } from "@/lib/report-series";

const W = 320;
const H = 176;
const LEFT = 40;
const RIGHT = 12;
const TOP = 30;
const BOTTOM = 26;

/** Linha "Recebido por dia/semana" com cursor e etiqueta ao passar ou com as setas do teclado. */
export default function ReceivedChart({ buckets, unitLabel }: { buckets: Bucket[]; unitLabel: string }) {
  const max = niceMax(Math.max(0, ...buckets.map((b) => b.cents)));
  const best = buckets.reduce((bi, b, i) => (b.cents > (buckets[bi]?.cents ?? 0) ? i : bi), 0);
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? ((buckets[best]?.cents ?? 0) > 0 ? best : null);

  const innerW = W - LEFT - RIGHT;
  const innerH = H - TOP - BOTTOM;
  const step = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;
  const x = (i: number) => LEFT + (buckets.length > 1 ? i * step : innerW / 2);
  const y = (cents: number) => TOP + innerH - (Math.max(0, cents) / max) * innerH;
  const base = TOP + innerH;
  const labelEvery = buckets.length <= 7 ? 1 : buckets.length <= 14 ? 3 : 5;

  const line = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(b.cents).toFixed(1)}`).join(" ");
  const area = buckets.length ? `${line} L${x(buckets.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z` : "";
  const dots = buckets.length <= 31;

  const tip = shown !== null ? buckets[shown] : null;
  const tipText = tip ? formatShort(tip.cents) : "";
  const tipW = Math.max(56, tipText.length * 7.4 + 16);
  const tipX = shown !== null ? Math.min(W - RIGHT - tipW, Math.max(LEFT - 8, x(shown) - tipW / 2)) : 0;

  return (
    <div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Recebido por ${unitLabel}: ${buckets.map((b) => `${b.longLabel} ${formatShort(b.cents)} MT`).join(", ")}`}
        tabIndex={0}
        onKeyDown={(e: { key: string; preventDefault(): void }) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const current = shown ?? buckets.length - 1;
          setActive(Math.max(0, Math.min(buckets.length - 1, current + (e.key === "ArrowRight" ? 1 : -1))));
        }}
        onMouseLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        <line x1={LEFT} y1={base} x2={W - RIGHT} y2={base} stroke="#FFFFFF" strokeOpacity="0.18" />
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={LEFT} y1={base - innerH * f} x2={W - RIGHT} y2={base - innerH * f} stroke="#FFFFFF" strokeOpacity="0.1" strokeDasharray="3 4" />
            <text x={LEFT - 6} y={base - innerH * f + 4} textAnchor="end" fontSize="11" fill="#FFFFFF" fillOpacity="0.62">
              {axisLabel(max * f)}
            </text>
          </g>
        ))}
        <text x={LEFT - 6} y={base + 4} textAnchor="end" fontSize="11" fill="#FFFFFF" fillOpacity="0.62">
          0
        </text>

        {area ? <path d={area} fill="#ECB0DC" fillOpacity="0.12" /> : null}
        {line ? <path d={line} fill="none" stroke="#ECB0DC" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}

        {shown !== null ? <line x1={x(shown)} y1={TOP - 4} x2={x(shown)} y2={base} stroke="#ECB0DC" strokeOpacity="0.4" strokeWidth="1" /> : null}

        {dots
          ? buckets.map((b, i) =>
              i === shown ? null : <circle key={b.from} cx={x(i)} cy={y(b.cents)} r={buckets.length > 14 ? 2.5 : 4} fill="#ECB0DC" />,
            )
          : null}
        {shown !== null ? <circle cx={x(shown)} cy={y(buckets[shown].cents)} r="6" fill="#2B1C27" stroke="#ECB0DC" strokeWidth="3" /> : null}

        {tip ? (
          <g aria-hidden="true">
            <rect x={tipX} y="2" width={tipW} height="22" rx="8" fill="#ECB0DC" />
            <text x={tipX + tipW / 2} y="17" textAnchor="middle" fontSize="12" fontWeight="800" fill="#2B1C27">
              {tipText}
            </text>
          </g>
        ) : null}

        {buckets.map((b, i) =>
          i % labelEvery === 0 || i === buckets.length - 1 ? (
            <text
              key={`l${b.from}`}
              x={x(i)}
              y={H - 6}
              textAnchor={i === buckets.length - 1 && buckets.length > 7 ? "end" : "middle"}
              fontSize="11"
              fontWeight={i === shown ? 800 : 400}
              fill="#FFFFFF"
              fillOpacity={i === shown ? 1 : 0.7}
            >
              {b.label}
            </text>
          ) : null,
        )}

        {buckets.map((b, i) => (
          <rect
            key={`h${b.from}`}
            x={x(i) - Math.max(step, 12) / 2}
            y={TOP - 8}
            width={Math.max(step, 12)}
            height={innerH + 8}
            fill="transparent"
            onMouseEnter={() => setActive(i)}
            onTouchStart={() => setActive(i)}
          />
        ))}
      </svg>
      <p className="tiny dark-muted" style={{ margin: "4px 0 0", minHeight: 16 }} aria-live="polite">
        {tip ? `${tip.longLabel[0].toUpperCase()}${tip.longLabel.slice(1)}: ${formatShort(tip.cents)} MT` : ""}
      </p>
    </div>
  );
}
