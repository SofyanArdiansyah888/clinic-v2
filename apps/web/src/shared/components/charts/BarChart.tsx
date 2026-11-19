import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { formatCompact } from '@/shared/lib/formatters'

export type BarDatum = {
  key: string
  /** Short x-axis label (e.g. "19 Nov"). */
  label: string
  value: number
}

type BarChartProps = {
  data: BarDatum[]
  /** Full value text for the tooltip (e.g. Rp 1.250.000). */
  formatValue: (value: number) => string
  /** Full label for the tooltip (e.g. "Kam, 19 Nov"). */
  formatLabel?: (d: BarDatum) => string
  className?: string
}

const TICKS = 3

// Rounds the max up to a clean step so gridlines land on readable numbers.
function niceMax(max: number) {
  if (max <= 0) return TICKS
  const raw = max / TICKS
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return step * TICKS
}

/**
 * Single-series column chart: one hue, thin columns with a rounded data end,
 * hairline grid, per-column hover tooltip. Built from divs so it stays fluid.
 */
export function BarChart({ data, formatValue, formatLabel, className }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (max / TICKS) * (TICKS - i))
  // ~7 x labels whatever the range, so 30 days don't collide.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7))
  const active = hover !== null ? data[hover] : null

  return (
    <div className={cn('flex h-56 gap-2', className)}>
      {/* y axis */}
      <div className="flex w-10 shrink-0 flex-col justify-between pb-5 text-right text-[11px] text-slate-400 tabular-nums">
        {ticks.map((t) => (
          <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
            {formatCompact(t)}
          </span>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        {/* gridlines */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
          {ticks.map((t) => (
            <div key={t} className="h-px bg-slate-100" />
          ))}
        </div>

        <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => {
            const pct = max > 0 ? (d.value / max) * 100 : 0
            return (
              <div
                key={d.key}
                className="flex h-full min-w-0 flex-1 flex-col"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${formatLabel ? formatLabel(d) : d.label}: ${formatValue(d.value)}`}
              >
                {/* the whole column slot is the hit target, not just the bar */}
                <div
                  className={cn(
                    // px-[1px] each side = the 2px surface gap between touching columns
                    'flex flex-1 items-end justify-center px-[1px]',
                    hover === i && 'bg-slate-50',
                  )}
                >
                  <div
                    className={cn(
                      'w-full max-w-6 rounded-t-[4px] transition-colors',
                      hover === i ? 'bg-rose-600' : 'bg-rose-500',
                      d.value > 0 && 'min-h-0.5',
                    )}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                {/* label centred on its column but free to overflow it (30 narrow columns) */}
                <div className="relative h-5">
                  {i % labelEvery === 0 ? (
                    <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[11px] leading-none whitespace-nowrap text-slate-400">
                      {d.label}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {active && hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
            style={{
              left: `${Math.min(85, Math.max(15, ((hover + 0.5) / data.length) * 100))}%`,
            }}
          >
            <p className="text-slate-500">{formatLabel ? formatLabel(active) : active.label}</p>
            <p className="font-semibold text-slate-900 tabular-nums">{formatValue(active.value)}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
