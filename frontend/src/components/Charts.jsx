import React, { useState } from 'react'

// ── Palette ───────────────────────────────────────────────────────────────────

const DONUT_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444', '#84cc16', '#ec4899']

// ── Helpers ───────────────────────────────────────────────────────────────────

function niceMax(rawMax) {
  if (!rawMax || rawMax <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)))
  const norm = rawMax / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

function niceSteps(max, steps = 4) {
  const step = max / steps
  const out = []
  for (let i = 0; i <= steps; i++) out.push(step * i)
  return out
}

function fmtShort(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}

// ── BarChart ──────────────────────────────────────────────────────────────────
// Responsive SVG bar chart with axes, gridlines, and hover tooltips.
//
// Props:
//   data        — array of objects
//   valueKey    — numeric field to plot (e.g. 'revenue')
//   labelKey    — x-axis label field (e.g. 'date')
//   subKey      — optional second line in tooltip (e.g. 'transactions')
//   subLabel    — label for subKey
//   color       — bar fill (default accent blue)
//   height      — chart height in px (default 220)
//   fmt         — optional KES formatter function; falls back to fmtShort

export function BarChart({
  data = [],
  valueKey = 'value',
  labelKey = 'label',
  subKey,
  subLabel = '',
  color = '#4f6ef7',
  height = 220,
  fmt,
}) {
  const [hovered, setHovered] = useState(null)

  if (!data.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>No data</div>

  // SVG coordinate space
  const VW = 540, VH = height
  const PAD = { top: 12, right: 12, bottom: 36, left: 56 }
  const plotW = VW - PAD.left - PAD.right
  const plotH = VH - PAD.top - PAD.bottom

  const rawMax = Math.max(...data.map(d => d[valueKey] || 0))
  const yMax   = niceMax(rawMax)
  const ySteps = niceSteps(yMax)

  const barSlot = plotW / data.length
  const barW    = Math.max(4, barSlot * 0.65)

  function px(i) { return PAD.left + barSlot * i + (barSlot - barW) / 2 }
  function py(v) { return PAD.top + plotH - (v / yMax) * plotH }

  // Show every N-th x-label so they don't overlap
  const maxLabels = Math.floor(plotW / 36)
  const skip = Math.max(1, Math.ceil(data.length / maxLabels))

  const display = fmt || fmtShort

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height, display: 'block' }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Gridlines + Y labels */}
        {ySteps.map(v => {
          const y = py(v)
          return (
            <g key={v}>
              <line x1={PAD.left} y1={y} x2={VW - PAD.right} y2={y}
                stroke="var(--border)" strokeWidth={0.8} strokeDasharray={v === 0 ? 'none' : '3 3'} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'inherit' }}>
                {fmtShort(v)}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const v   = d[valueKey] || 0
          const x   = px(i)
          const bh  = Math.max(v > 0 ? 2 : 0, (v / yMax) * plotH)
          const y   = PAD.top + plotH - bh
          const hot = hovered === i
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barW} height={bh}
                fill={color} rx={2}
                opacity={hovered !== null && !hot ? 0.4 : 1}
                style={{ transition: 'opacity 0.15s', cursor: 'default' }}
                onMouseEnter={() => setHovered(i)}
              />
              {/* X label */}
              {i % skip === 0 && (
                <text x={x + barW / 2} y={VH - PAD.bottom + 14} textAnchor="middle"
                  style={{ fontSize: 9, fill: hot ? 'var(--text)' : 'var(--text-muted)', fontFamily: 'inherit', fontWeight: hot ? 600 : 400 }}>
                  {String(d[labelKey]).slice(-5)}
                </text>
              )}
            </g>
          )
        })}

        {/* Hover value label above bar */}
        {hovered !== null && (() => {
          const d  = data[hovered]
          const v  = d[valueKey] || 0
          const x  = px(hovered) + barW / 2
          const y  = py(v) - 6
          return (
            <text x={x} y={y} textAnchor="middle"
              style={{ fontSize: 10, fill: color, fontWeight: 700, fontFamily: 'inherit' }}>
              {display(v)}
            </text>
          )
        })()}
      </svg>

      {/* Floating tooltip */}
      {hovered !== null && (() => {
        const d = data[hovered]
        return (
          <div style={{
            position: 'absolute', bottom: PAD.bottom + 8,
            left: `${((px(hovered) + barW / 2) / VW) * 100}%`,
            transform: 'translateX(-50%)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', fontSize: 11,
            pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{d[labelKey]}</div>
            <div style={{ color }}>{display(d[valueKey] || 0)}</div>
            {subKey && <div style={{ color: 'var(--text-muted)' }}>{subLabel} {d[subKey]}</div>}
          </div>
        )
      })()}
    </div>
  )
}

// ── DonutChart ────────────────────────────────────────────────────────────────
// SVG donut chart for payment method breakdown.
//
// Props:
//   data      — array of { [labelKey]: string, [valueKey]: number }
//   labelKey  — field for segment label
//   valueKey  — field for segment value
//   colors    — optional color array (defaults to DONUT_COLORS)
//   fmt       — value formatter

export function DonutChart({
  data = [],
  labelKey = 'method',
  valueKey = 'total',
  colors = DONUT_COLORS,
  fmt,
  size = 180,
}) {
  const [hovered, setHovered] = useState(null)

  const nonZero = data.filter(d => (d[valueKey] || 0) > 0)
  if (!nonZero.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>No data</div>

  const total = nonZero.reduce((s, d) => s + (d[valueKey] || 0), 0)

  const CX = size / 2, CY = size / 2
  const R  = size * 0.38
  const RI = size * 0.24  // inner radius

  // Build arcs
  let cursor = -Math.PI / 2  // start at top
  const segments = nonZero.map((d, i) => {
    const frac  = (d[valueKey] || 0) / total
    const angle = frac * 2 * Math.PI
    const start = cursor
    const end   = cursor + angle
    cursor = end

    const x1 = CX + R * Math.cos(start), y1 = CY + R * Math.sin(start)
    const x2 = CX + R * Math.cos(end),   y2 = CY + R * Math.sin(end)
    const ix1 = CX + RI * Math.cos(start), iy1 = CY + RI * Math.sin(start)
    const ix2 = CX + RI * Math.cos(end),   iy2 = CY + RI * Math.sin(end)
    const large = angle > Math.PI ? 1 : 0

    const path = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${RI} ${RI} 0 ${large} 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ')

    return { path, color: colors[i % colors.length], d, frac, mid: start + angle / 2 }
  })

  const display = fmt || (v => fmtShort(v))
  const hot = hovered !== null ? segments[hovered] : null

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
        {segments.map((seg, i) => {
          const scale = hovered === i ? 1.06 : 1
          return (
            <path key={i} d={seg.path}
              fill={seg.color}
              opacity={hovered !== null && hovered !== i ? 0.45 : 1}
              style={{ transform: `scale(${scale})`, transformOrigin: `${CX}px ${CY}px`, transition: 'all 0.15s', cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}
        {/* Center text */}
        <text x={CX} y={CY - 5} textAnchor="middle"
          style={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'inherit' }}>
          {hot ? hot.d[labelKey] : 'Total'}
        </text>
        <text x={CX} y={CY + 11} textAnchor="middle"
          style={{ fontSize: 13, fontWeight: 700, fill: 'var(--text)', fontFamily: 'inherit' }}>
          {hot ? display(hot.d[valueKey]) : display(total)}
        </text>
        {hot && (
          <text x={CX} y={CY + 24} textAnchor="middle"
            style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'inherit' }}>
            {(hot.frac * 100).toFixed(1)}%
          </text>
        )}
      </svg>

      {/* Legend */}
      <div style={{ flex: 1, minWidth: 100 }}>
        {segments.map((seg, i) => (
          <div key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, cursor: 'pointer', opacity: hovered !== null && hovered !== i ? 0.45 : 1 }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 500, textTransform: 'capitalize' }}>{seg.d[labelKey]}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(seg.frac * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── HorizontalBars ────────────────────────────────────────────────────────────
// Clean horizontal bar chart for top products.
//
// Props:
//   data      — array of objects
//   valueKey  — numeric field
//   labelKey  — label field
//   subKey    — optional secondary stat (e.g. qty)
//   subLabel  — label for subKey
//   maxItems  — truncate to N items (default 10)
//   color     — bar color
//   fmt       — value formatter

export function HorizontalBars({
  data = [],
  valueKey = 'revenue',
  labelKey = 'name',
  subKey,
  subLabel = '',
  maxItems = 10,
  color = '#4f6ef7',
  fmt,
}) {
  const [hovered, setHovered] = useState(null)
  const rows = data.slice(0, maxItems)
  if (!rows.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>No data</div>

  const max = Math.max(...rows.map(d => d[valueKey] || 0), 1)
  const display = fmt || fmtShort

  return (
    <div>
      {rows.map((d, i) => {
        const pct = ((d[valueKey] || 0) / max) * 100
        const hot = hovered === i
        return (
          <div key={i}
            style={{ marginBottom: 10, cursor: 'default' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: hot ? 600 : 500, color: hot ? 'var(--text)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, minWidth: 14 }}>{i + 1}</span>
                {d[labelKey]}
              </span>
              <span style={{ color: hot ? color : 'var(--text-muted)', fontWeight: hot ? 700 : 400, marginLeft: 12, flexShrink: 0, fontSize: 12 }}>
                {display(d[valueKey] || 0)}
                {subKey && <span style={{ fontWeight: 400, marginLeft: 6 }}>· {d[subKey]} {subLabel}</span>}
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 3,
                background: color,
                opacity: hovered !== null && !hot ? 0.4 : 1,
                transition: 'width 0.5s ease, opacity 0.15s',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── LineChart ─────────────────────────────────────────────────────────────────
// SVG line chart — useful for revenue trend with a continuous line.

export function LineChart({
  data = [],
  valueKey = 'value',
  labelKey = 'label',
  subKey,
  subLabel = '',
  color = '#4f6ef7',
  height = 180,
  fmt,
}) {
  const [hovered, setHovered] = useState(null)
  if (!data.length) return null

  const VW = 540, VH = height
  const PAD = { top: 16, right: 16, bottom: 32, left: 56 }
  const plotW = VW - PAD.left - PAD.right
  const plotH = VH - PAD.top - PAD.bottom

  const rawMax = Math.max(...data.map(d => d[valueKey] || 0))
  const yMax   = niceMax(rawMax)
  const ySteps = niceSteps(yMax)

  const skip = Math.max(1, Math.ceil(data.length / Math.floor(plotW / 36)))
  const display = fmt || fmtShort

  function cx(i) { return PAD.left + (i / (data.length - 1)) * plotW }
  function cy(v) { return PAD.top + plotH - (v / yMax) * plotH }

  const points = data.map((d, i) => `${cx(i)},${cy(d[valueKey] || 0)}`).join(' ')

  // Area fill path
  const areaPath = [
    `M ${cx(0)} ${cy(data[0][valueKey] || 0)}`,
    ...data.map((d, i) => `L ${cx(i)} ${cy(d[valueKey] || 0)}`),
    `L ${cx(data.length - 1)} ${PAD.top + plotH}`,
    `L ${cx(0)} ${PAD.top + plotH}`,
    'Z',
  ].join(' ')

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height, display: 'block' }}
        onMouseLeave={() => setHovered(null)}>

        {/* Y gridlines + labels */}
        {ySteps.map(v => {
          const y = cy(v)
          return (
            <g key={v}>
              <line x1={PAD.left} y1={y} x2={VW - PAD.right} y2={y}
                stroke="var(--border)" strokeWidth={0.8} strokeDasharray={v === 0 ? 'none' : '3 3'} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'inherit' }}>
                {fmtShort(v)}
              </text>
            </g>
          )
        })}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity={0.08} />

        {/* Line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots + x-labels */}
        {data.map((d, i) => {
          const x = cx(i), y = cy(d[valueKey] || 0)
          const hot = hovered === i
          return (
            <g key={i} onMouseEnter={() => setHovered(i)}>
              <rect x={x - 8} y={PAD.top} width={16} height={plotH} fill="transparent" />
              {(hot || i % skip === 0) && (
                <circle cx={x} cy={y} r={hot ? 4 : 2.5} fill={color} />
              )}
              {i % skip === 0 && (
                <text x={x} y={VH - PAD.bottom + 14} textAnchor="middle"
                  style={{ fontSize: 9, fill: hot ? 'var(--text)' : 'var(--text-muted)', fontFamily: 'inherit', fontWeight: hot ? 600 : 400 }}>
                  {String(d[labelKey]).slice(-5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {hovered !== null && (() => {
        const d = data[hovered]
        const x = (cx(hovered) / VW) * 100
        return (
          <div style={{
            position: 'absolute', bottom: PAD.bottom + 8,
            left: `${x}%`, transform: 'translateX(-50%)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', fontSize: 11,
            pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{d[labelKey]}</div>
            <div style={{ color }}>{display(d[valueKey] || 0)}</div>
            {subKey && <div style={{ color: 'var(--text-muted)' }}>{subLabel} {d[subKey]}</div>}
          </div>
        )
      })()}
    </div>
  )
}
