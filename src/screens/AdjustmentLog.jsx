// src/screens/AdjustmentLog.jsx
// Answers Lirizeth's question: "is there a way to get the damages log and what
// was recorded for that category?" — a read-only browse/filter view over the
// same `adjustments` table LogAdjustment.jsx writes to, filterable by category
// (zone) and type, since that's how the team already thinks about the counts.

import { useState, useEffect, useMemo } from 'react'

const TYPE_LABEL = { damage: '💔 Damage', tester: '🧪 Tester', other: '📝 Other' }

export default function AdjustmentLog({ onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/adjustments?limit=200')
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Failed to load') }
      const data = await resp.json()
      setRows(data.adjustments || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Older rows logged before the category column existed will have
  // category === null — grouped under "Uncategorized" rather than hidden.
  const categories = useMemo(() => {
    const set = new Set(rows.map(r => r.category || 'Uncategorized'))
    return ['ALL', ...[...set].sort()]
  }, [rows])

  const filtered = rows
    .filter(r => categoryFilter === 'ALL' || (r.category || 'Uncategorized') === categoryFilter)
    .filter(r => typeFilter === 'ALL' || r.adjustment_type === typeFilter)

  // Quick total for whichever filter is active — this is the "what was
  // recorded for that category" number Lirizeth asked about.
  const totalUnits = filtered.reduce((s, r) => s + (r.qty || 0), 0)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Damage / Tester Log</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '14px' }}>
          Everything logged from "Log damage / tester", filterable by category and type.
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            style={{ flex: 1, padding: '9px 10px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '12px', fontWeight: '600', color: 'var(--brown)', background: '#fff', outline: 'none' }}>
            {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ flex: 1, padding: '9px 10px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '12px', fontWeight: '600', color: 'var(--brown)', background: '#fff', outline: 'none' }}>
            <option value="ALL">All types</option>
            <option value="damage">💔 Damage</option>
            <option value="tester">🧪 Tester</option>
            <option value="other">📝 Other</option>
          </select>
        </div>

        {!loading && !error && rows.length > 0 && (
          <div style={{ background: 'var(--blue-light)', border: '1px solid rgba(126,200,216,0.3)', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: 'var(--blue-dark)', fontWeight: '600' }}>
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'} · {totalUnits} unit{totalUnits !== 1 ? 's' : ''} total
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-400)', fontSize: '13px' }}>Loading…</div>}
        {error && <div style={{ background: 'var(--red-light)', color: 'var(--red)', borderRadius: '10px', padding: '12px', fontSize: '13px' }}>{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Nothing here yet</div>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '4px' }}>No adjustments match this filter</div>
          </div>
        )}

        {filtered.map(r => (
          <div key={r.id} style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>{r.product_name}</div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--brown-light)', flexShrink: 0 }}>{TYPE_LABEL[r.adjustment_type] || r.adjustment_type}</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '6px' }}>
              {r.sku || 'No SKU'} · {r.category || 'Uncategorized'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-700)', marginBottom: r.note ? '6px' : '0' }}>
              {r.location_name} · <strong>{r.qty}</strong> unit{r.qty !== 1 ? 's' : ''} · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
      </div>
    </div>
  )
}
