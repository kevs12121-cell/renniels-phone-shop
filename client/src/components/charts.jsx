import { useEffect, useRef, useState } from 'react'

/*
 * Lightweight SVG/HTML charts following the data-viz spec:
 * single-series columns (<=24px, 4px rounded data-end, square at baseline), hairline grid,
 * hover tooltips, text in ink tokens (never series colors), categorical hues in fixed order.
 */

// Validated categorical order (light mode). Colors follow the entity, never its rank.
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
export const PAYMENT_COLORS = { CASH: CATEGORICAL[0], GCASH: CATEGORICAL[1], CARD: CATEGORICAL[2], BANK_TRANSFER: CATEGORICAL[3], OTHER: CATEGORICAL[4] }

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

function niceMax(value) {
  if (value <= 0) return 1
  const exponent = 10 ** Math.floor(Math.log10(value))
  const fraction = value / exponent
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * exponent
}

function columnPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

export function ColumnChart({ data, height = 240, axisFormat = String, xLabel = (item) => item.label, tooltip, ariaLabel = 'Column chart', highlightLast = false }) {
  const [ref, width] = useWidth()
  const [active, setActive] = useState(null)
  const margin = { top: 14, right: 6, bottom: 30, left: 56 }
  const innerWidth = Math.max(0, width - margin.left - margin.right)
  const innerHeight = height - margin.top - margin.bottom
  const max = niceMax(Math.max(0, ...data.map((item) => item.value)))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => step * max)
  const band = data.length ? innerWidth / data.length : 0
  const barWidth = Math.min(24, Math.max(3, band * 0.6))
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerWidth / 54))))
  const activeItem = active !== null ? data[active] : null
  const tooltipLeft = active !== null ? Math.min(Math.max(margin.left + active * band + band / 2, 80), width - 80) : 0
  const tooltipTop = activeItem ? margin.top + innerHeight - (activeItem.value / max) * innerHeight : 0

  return (
    <div className="chart" ref={ref} style={{ height }} onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {ticks.map((tick) => {
              const y = innerHeight - (tick / max) * innerHeight
              return (
                <g key={tick}>
                  <line x1={0} x2={innerWidth} y1={y} y2={y} className={tick === 0 ? 'chart-baseline' : 'chart-grid'} />
                  <text x={-10} y={y} dy="0.32em" textAnchor="end" className="chart-tick">{axisFormat(tick)}</text>
                </g>
              )
            })}
            {data.map((item, index) => {
              const barHeight = (item.value / max) * innerHeight
              const x = index * band + (band - barWidth) / 2
              const className = ['chart-bar', active === index && 'is-active', active !== null && active !== index && 'is-dim', highlightLast && index === data.length - 1 && 'is-current'].filter(Boolean).join(' ')
              return (
                <g key={item.key ?? index}>
                  {barHeight > 0 && <path d={columnPath(x, innerHeight - barHeight, barWidth, barHeight, 4)} className={className} />}
                  {index % labelEvery === 0 && <text x={index * band + band / 2} y={innerHeight + 20} textAnchor="middle" className="chart-tick">{xLabel(item)}</text>}
                </g>
              )
            })}
            {data.map((item, index) => (
              <rect key={`hit-${item.key ?? index}`} x={index * band} y={0} width={band} height={innerHeight} fill="transparent"
                onMouseEnter={() => setActive(index)} onClick={() => setActive(index)} onFocus={() => setActive(index)} tabIndex={-1} />
            ))}
          </g>
        </svg>
      )}
      {activeItem && (
        <div className="chart-tooltip" style={{ left: tooltipLeft, top: tooltipTop }}>
          {tooltip ? tooltip(activeItem) : <strong>{activeItem.value}</strong>}
        </div>
      )}
    </div>
  )
}

export function BarList({ items, format = String, emptyText = 'No data for this period.' }) {
  if (!items.length) return <p className="muted-text">{emptyText}</p>
  const max = Math.max(0, ...items.map((item) => item.value)) || 1
  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.key ?? item.label} title={`${item.label}: ${format(item.value)}`}>
          <div className="bar-list-head">
            <span className="bar-list-label">{item.label}</span>
            <span className="bar-list-value">{format(item.value)}</span>
          </div>
          <div className="bar-list-fill" style={{ width: `${Math.max(1, (item.value / max) * 100)}%` }} />
          {item.sublabel && <small className="bar-list-sub">{item.sublabel}</small>}
        </li>
      ))}
    </ul>
  )
}

export function SegmentedBar({ items, format = String, valueLabel = 'Amount' }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (!total) return <p className="muted-text">No payments in this period.</p>
  const share = (value) => `${((value / total) * 100).toFixed(1)}%`
  return (
    <div className="segmented-bar-wrap">
      <div className="segmented-bar" role="img" aria-label={items.map((item) => `${item.label} ${share(item.value)}`).join(', ')}>
        {items.filter((item) => item.value > 0).map((item) => (
          <span key={item.key} style={{ flexGrow: item.value, background: item.color }} title={`${item.label}: ${format(item.value)} (${share(item.value)})`} />
        ))}
      </div>
      <table className="legend-table">
        <thead><tr><th>Method</th><th className="num">{valueLabel}</th><th className="num">Share</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key}>
              <td><i className="swatch" style={{ background: item.color }} />{item.label}{item.detail && <small>{item.detail}</small>}</td>
              <td className="num">{format(item.value)}</td>
              <td className="num">{share(item.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
