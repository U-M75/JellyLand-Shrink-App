// src/screens/QuickAdjustReport.jsx
// The "separate report" Roxy asked for: everything logged from Quick Stock
// Adjust, plus a per-product net rollup (added vs. removed vs. net change) —
// kept entirely apart from the damage/tester shrink log and report.

import { useState, useEffect, useMemo } from 'react'

export default function QuickAdjustReport({ onBack }) {
  const [rows, setRows] = useState([])
  const [rollup, setRollup] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('log') // 'log' | 'rollup'
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [logResp, rollupResp] = await Promise.all([
        fetch('/api/quick-adjustments?limit=200'),
        fetch('/api/quick-adjustments?rollup=1'),
      ])
      if (!logResp.ok) { const e = await logResp.json(); throw new Error(e.error || 'Failed to load') }
      if (!rollupResp.ok) { const e = await rollupResp.json(); throw new Error(e.error || 'Failed to load') }
      const logData = await logResp.json()
      const rollupData = await rollupResp.json()
      setRows(logData.adjustments || [])
      setRollup(rollupData.rollup || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const categories = useMemo(() => {
    const set = new Set(rows.map(r => r.category || 'Uncategorized'))
    return ['ALL', ...[...set].sort()]
  }, [rows])

  const filteredRows = rows.filter(r => categoryFilter === 'ALL' || (r.category || 'Uncategorized') === categoryFilter)
  const netTotal = filteredRows.reduce((s, r) => s + (r.qty || 0), 0)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Quick Adjust Report</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '14px' }}>
          Every add/remove correction logged from Quick Stock Adjust — separate from the damage/tester shrink log.
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button onClick={() => setView('log')}
            style={{ flex: 1, padding: '9px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1.5px solid ${view === 'log' ? 'var(--pink)' : 'var(--gray-200)'}`, background: view === 'log' ? 'var(--pink-light)' : '#fff', color: 'var(--brown)' }}>
            Entry log
          </button>
          <button onClick={() => setView('rollup')}
            style={{ flex: 1, padding: '9px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1.5px solid ${view === 'rollup' ? 'var(--pink)' : 'var(--gray-200)'}`, background: view === 'rollup' ? 'var(--pink-light)' : '#fff', color: 'var(--brown)' }}>
            By product
          </button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-400)', fontSize: '13px' }}>Loading…</div>}
        {error && <div style={{ background: 'var(--red-light)', color: 'var(--red)', borderRadius: '10px', padding: '12px', fontSize: '13px' }}>{error}</div>}

        {!loading && !error && view === 'log' && (
          <>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              style={{ width: '100%', padding: '9px 10px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '12px', fontWeight: '600', color: 'var(--brown)', background: '#fff', outline: 'none', marginBottom: '14px' }}>
              {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
            </select>

            {rows.length > 0 && (
              <div style={{ background: 'var(--blue-light)', border: '1px solid rgba(126,200,216,0.3)', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: 'var(--blue-dark)', fontWeight: '600' }}>
                {filteredRows.length} entr{filteredRows.length !== 1 ? 'ies' : 'y'} · net {netTotal > 0 ? '+' : ''}{netTotal} unit{netTotal !== 1 ? 's' : ''}
              </div>
            )}

            {filteredRows.length === 0 && rows.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔧</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Nothing here yet</div>
                <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '4px' }}>No quick adjustments logged</div>
              </div>
            )}

            {filteredRows.map(r => (
              <div key={r.id} style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>{r.product_name}</div>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: r.qty > 0 ? 'var(--green-dark)' : 'var(--red)', flexShrink: 0 }}>{r.qty > 0 ? '+' : ''}{r.qty}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '6px' }}>
                  {r.sku || 'No SKU'} · {r.category || 'Uncategorized'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--gray-700)', marginBottom: r.note ? '6px' : '0' }}>
                  {r.location_name} · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {r.logged_by && <> · logged by {r.logged_by}</>}
                </div>
                {r.note && (
                  <div style={{ fontSize: '11px', color: 'var(--gray-400)', background: 'var(--gray-50)', borderRadius: '8px', padding: '6px 10px' }}>{r.note}</div>
                )}
                {!r.synced_to_shopify && (
                  <div style={{ fontSize: '10px', color: 'var(--red)', marginTop: '6px', fontWeight: '600' }}>⚠ Not yet synced to Shopify</div>
                )}
              </div>
            ))}
          </>
        )}

        {!loading && !error && view === 'rollup' && (
          <>
            {rollup.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔧</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Nothing here yet</div>
                <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '4px' }}>No quick adjustments logged</div>
              </div>
            )}
            {rollup.sort((a, b) => Math.abs(b.net_qty) - Math.abs(a.net_qty)).map(p => (
              <div key={p.product_id} style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>{p.product_name}</div>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: p.net_qty > 0 ? 'var(--green-dark)' : p.net_qty < 0 ? 'var(--red)' : 'var(--gray-400)', flexShrink: 0 }}>{p.net_qty > 0 ? '+' : ''}{p.net_qty}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '6px' }}>{p.sku || 'No SKU'}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray-700)' }}>
                  +{p.total_added} added · −{p.total_removed} removed · {p.entry_count} entr{p.entry_count !== 1 ? 'ies' : 'y'}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
