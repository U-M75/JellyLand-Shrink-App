// src/screens/MonthlyShrinkReport.jsx
// The report Roxy/April can open without anyone running anything manually —
// pulls everything /api/monthly-shrink-report already assembles (starting
// inventory, qty sent, damaged/tester, net sold, expected vs actual ending
// units, variance, shrink %, shrink cost/value, notes) into one screen, plus
// a "Download PDF" button for sending it around.

import { useState } from 'react'
import { exportMonthlyShrinkReportPdf } from '../lib/exportPdf.js'

function money(v) {
  if (v === null || v === undefined) return '—'
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toFixed(2)}`
}
function pct(v) {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(1)}%`
}
function num(v) {
  return v === null || v === undefined ? '—' : v
}

function defaultMonth() {
  const now = new Date()
  // Default to last month — this report is a reconciliation of a month that
  // just closed, not the one still in progress.
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MonthlyShrinkReport({ onBack }) {
  const [month, setMonth] = useState(defaultMonth())
  const [cutoffDate, setCutoffDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [showFullTable, setShowFullTable] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setReport(null)
    setShowFullTable(false)
    try {
      const params = new URLSearchParams({ month })
      if (cutoffDate) params.set('cutoffDate', cutoffDate)
      const resp = await fetch(`/api/monthly-shrink-report?${params.toString()}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to load report')
      setReport(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadPdf() {
    if (!report) return
    setExporting(true)
    try {
      await exportMonthlyShrinkReportPdf({ month: report.month, cutoffDate: report.cutoffDate, rows: report.rows, warnings: report.warnings })
    } catch (err) {
      setError(`PDF export failed: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  const rows = report?.rows || []
  const totalShrinkCostRows = rows.filter(r => r.shrink_cost !== null)
  const totalShrinkCost = totalShrinkCostRows.reduce((s, r) => s + r.shrink_cost, 0)
  const totalShrinkValueRows = rows.filter(r => r.shrink_value !== null)
  const totalShrinkValue = totalShrinkValueRows.reduce((s, r) => s + r.shrink_value, 0)
  const rowsWithVariance = rows.filter(r => r.variance !== null)
  const rowsMissingActual = rows.filter(r => r.actual_ending_units === null)

  // Shortages only (variance > 0 = book showed more than was actually
  // counted) — sorted by dollar impact where we have cost, otherwise by raw
  // unit variance, so the worst problems surface first without anyone
  // having to sort a 14-column table themselves.
  const shortageRows = rowsWithVariance.filter(r => r.variance > 0)
  const topIssues = [...shortageRows]
    .sort((a, b) => {
      const av = a.shrink_cost !== null ? Math.abs(a.shrink_cost) : a.variance
      const bv = b.shrink_cost !== null ? Math.abs(b.shrink_cost) : b.variance
      return bv - av
    })
    .slice(0, 5)

  const monthLabel = (() => {
    if (!report?.month) return ''
    const [y, m] = report.month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  })()

  // One sentence anyone can read without touching the table — the whole
  // point of this section.
  let headline
  if (rowsWithVariance.length === 0) {
    headline = `No completed cycle count found for ${monthLabel} yet — can't say anything about shrink until that's in.`
  } else if (shortageRows.length === 0) {
    headline = `${monthLabel}: no shortages across ${rowsWithVariance.length} product${rowsWithVariance.length !== 1 ? 's' : ''} with a cycle count. Clean month.`
  } else {
    const costPart = totalShrinkCostRows.length ? ` (${money(totalShrinkCost)} at cost)` : ' (cost data unavailable — see warnings)'
    headline = `${monthLabel}: ${shortageRows.length} product${shortageRows.length !== 1 ? 's' : ''} came up short${costPart}, out of ${rowsWithVariance.length} checked.`
  }

  const th = { padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: 'var(--brown)', background: 'var(--gray-100)', whiteSpace: 'nowrap', position: 'sticky', top: 0 }
  const td = { padding: '7px 10px', whiteSpace: 'nowrap', borderTop: 'var(--border)' }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', paddingBottom: '40px' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Monthly Shrink Report</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Controls */}
        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--brown)', display: 'block', marginBottom: '4px' }}>Month</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--brown)', display: 'block', marginBottom: '4px' }}>Cycle-count cutoff (optional)</label>
              <input type="date" value={cutoffDate} onChange={e => setCutoffDate(e.target.value)}
                placeholder="Defaults to end of month"
                style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '10px' }}>
            Transfers sent after the cutoff date don't count toward this month's Total Qty Sent — set this to the date Lauren's cycle count actually started, if different from month end.
          </div>
          <button onClick={handleGenerate} disabled={loading || !month}
            style={{ width: '100%', padding: '12px', background: loading ? 'var(--gray-200)' : 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '700', color: loading ? 'var(--gray-400)' : 'var(--brown)', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Generating…' : 'Generate report →'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--red-light)', color: 'var(--red)', borderRadius: '10px', padding: '12px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>
        )}

        {report && (
          <>
            {/* Plain-language headline — the "read this and you're done" part */}
            <div style={{ background: 'linear-gradient(135deg, var(--pink-light) 0%, var(--blue-light) 100%)', border: '1.5px solid var(--pink)', borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brown)', lineHeight: '1.4' }}>{headline}</div>
            </div>

            {/* Top issues — the 5 products driving most of the shrink, so
                the story is visible without opening the full table at all. */}
            {topIssues.length > 0 && (
              <div style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--brown)', marginBottom: '10px' }}>Biggest shortages this month</div>
                {topIssues.map(r => (
                  <div key={r.product_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: 'var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '600', color: 'var(--brown)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{r.sku || 'No SKU'} · expected {r.expected_ending_units}, counted {r.actual_ending_units}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--red)' }}>−{r.variance} unit{r.variance !== 1 ? 's' : ''}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{r.shrink_cost !== null ? money(r.shrink_cost) : 'N/A'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {report.warnings?.length > 0 && (
              <div style={{ background: '#FDF6E3', border: '1.5px solid #E8C468', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#8A6A1E', marginBottom: '6px' }}>⚠️ {report.warnings.length} thing{report.warnings.length !== 1 ? 's' : ''} to double-check</div>
                {report.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '11.5px', color: '#8A6A1E', marginBottom: i < report.warnings.length - 1 ? '6px' : 0, lineHeight: '1.4' }}>• {w}</div>
                ))}
              </div>
            )}

            {/* Summary metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: 'Products', value: rows.length, bg: 'var(--gray-100)', color: 'var(--brown)' },
                { label: 'With cycle count', value: `${rowsWithVariance.length}/${rows.length}`, bg: rowsMissingActual.length > 0 ? 'var(--red-light)' : 'var(--green-light)', color: rowsMissingActual.length > 0 ? 'var(--red)' : 'var(--green-dark)' },
                { label: 'Sessions used', value: report.cycleCountSessionsFound ?? 0, bg: 'var(--blue-light)', color: 'var(--blue-dark)' },
                { label: 'Shrink Cost', value: totalShrinkCostRows.length ? money(totalShrinkCost) : '—', bg: totalShrinkCost > 0 ? 'var(--red-light)' : 'var(--green-light)', color: totalShrinkCost > 0 ? 'var(--red)' : 'var(--green-dark)' },
                { label: 'Shrink Value', value: totalShrinkValueRows.length ? money(totalShrinkValue) : '—', bg: totalShrinkValue > 0 ? 'var(--red-light)' : 'var(--green-light)', color: totalShrinkValue > 0 ? 'var(--red)' : 'var(--green-dark)' },
                { label: 'Transfers scanned', value: report.transfersScanned ?? 0, bg: 'var(--gray-100)', color: 'var(--brown)' },
                { label: 'Internal moves excl.', value: report.internalTransfersExcluded ?? 0, bg: 'var(--gray-100)', color: 'var(--brown)' },
              ].map(m => (
                <div key={m.label} style={{ background: m.bg, borderRadius: '12px', padding: '12px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: m.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', fontWeight: '700', opacity: 0.75 }}>{m.label}</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Full table — collapsed by default so the screen reads as a
                summary first; opens up for anyone who wants to dig into
                every product/SKU. */}
            <button onClick={() => setShowFullTable(v => !v)}
              style={{ width: '100%', padding: '11px', background: '#fff', border: 'var(--border)', borderRadius: '12px', fontSize: '13px', fontWeight: '600', color: 'var(--brown)', cursor: 'pointer', marginBottom: showFullTable ? '10px' : '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {showFullTable ? '▲ Hide full product breakdown' : `▼ Show full breakdown (all ${rows.length} products)`}
            </button>

            {showFullTable && (
            <div style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', overflow: 'auto', maxHeight: '60vh', marginBottom: '16px' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '12px', color: 'var(--gray-700)', width: '100%' }}>
                <thead>
                  <tr>
                    {['Product', 'SKU', 'Start', 'Sent', 'Dmg', 'Test', 'Sold', 'Expected', 'Actual', 'Variance', 'Shrink %', 'Shrink Cost', 'Shrink Value', 'Notes'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const varianceColor = r.variance === null ? 'var(--gray-400)' : r.variance > 0 ? 'var(--red)' : r.variance < 0 ? 'var(--green-dark)' : 'var(--gray-700)'
                    return (
                      <tr key={r.product_id}>
                        <td style={{ ...td, fontWeight: '600', color: 'var(--brown)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.product_name}</td>
                        <td style={td}>{r.sku || '—'}</td>
                        <td style={td}>{num(r.starting_inventory)}</td>
                        <td style={td}>{num(r.total_qty_sent)}</td>
                        <td style={td}>{num(r.total_damaged)}</td>
                        <td style={td}>{num(r.total_tester)}</td>
                        <td style={td}>{num(r.net_items_sold)}</td>
                        <td style={td}>{num(r.expected_ending_units)}</td>
                        <td style={td}>{num(r.actual_ending_units)}</td>
                        <td style={{ ...td, fontWeight: '700', color: varianceColor }}>{r.variance === null ? 'N/A' : r.variance}</td>
                        <td style={{ ...td, color: varianceColor }}>{r.shrink_pct === null ? 'N/A' : pct(r.shrink_pct)}</td>
                        <td style={td}>{r.shrink_cost === null ? 'N/A' : money(r.shrink_cost)}</td>
                        <td style={td}>{r.shrink_value === null ? 'N/A' : money(r.shrink_value)}</td>
                        <td style={{ ...td, maxWidth: '220px', whiteSpace: 'normal', color: 'var(--gray-400)' }}>{r.notes || '—'}</td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={14} style={{ ...td, textAlign: 'center', color: 'var(--gray-400)' }}>No rows for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            )}

            <button onClick={handleDownloadPdf} disabled={exporting || rows.length === 0}
              style={{ width: '100%', padding: '13px', background: exporting ? 'var(--gray-200)' : 'var(--brown)', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: exporting ? 'not-allowed' : 'pointer' }}>
              {exporting ? 'Building PDF…' : '⬇ Download PDF'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
