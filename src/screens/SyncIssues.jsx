// src/screens/SyncIssues.jsx
// Lists adjustments that saved successfully but failed to push to Shopify
// (bad token, item not stocked at that location, network hiccup, etc.), with
// a retry button per row. Nothing here is ever lost — a failed sync just sits
// here until someone retries it or it's superseded by the next cycle count.

import { useState, useEffect } from 'react'

export default function SyncIssues({ onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(null) // id currently retrying

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/adjustments?limit=200')
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Failed to load') }
      const data = await resp.json()
      setRows((data.adjustments || []).filter(a => !a.synced_to_shopify))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleRetry(id) {
    setRetrying(id)
    try {
      const resp = await fetch(`/api/adjustments?id=${id}`, { method: 'PATCH' })
      const data = await resp.json()
      if (data.success) {
        setRows(rs => rs.filter(r => r.id !== id))
      } else {
        setRows(rs => rs.map(r => r.id === id ? { ...r, sync_error: data.shopifyError || data.error } : r))
      }
    } catch (err) {
      setRows(rs => rs.map(r => r.id === id ? { ...r, sync_error: err.message } : r))
    } finally { setRetrying(null) }
  }

  const TYPE_LABEL = { damage: '💔 Damage', tester: '🧪 Tester', other: '📝 Other' }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Sync issues</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '16px' }}>
          These damage/tester adjustments saved to the report but didn't make it into Shopify inventory yet. Retry once the underlying issue (usually a permissions or connectivity error) is fixed.
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-400)', fontSize: '13px' }}>Loading…</div>}
        {error && <div style={{ background: 'var(--red-light)', color: 'var(--red)', borderRadius: '10px', padding: '12px', fontSize: '13px' }}>{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>All synced</div>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '4px' }}>No pending Shopify sync failures</div>
          </div>
        )}

        {rows.map(r => (
          <div key={r.id} style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '12px 14px', marginBottom: '10px', borderLeft: '4px solid var(--red)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>{r.product_name}</div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--red)', flexShrink: 0 }}>{TYPE_LABEL[r.adjustment_type] || r.adjustment_type}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '6px' }}>
              {r.location_name} · {r.qty} unit{r.qty !== 1 ? 's' : ''} · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--red)', background: 'var(--red-light)', borderRadius: '8px', padding: '6px 10px', marginBottom: '8px' }}>
              {r.sync_error || 'Unknown sync error'}
            </div>
            <button onClick={() => handleRetry(r.id)} disabled={retrying === r.id}
              style={{ width: '100%', padding: '9px', background: retrying === r.id ? 'var(--gray-200)' : 'var(--brown)', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#fff', cursor: retrying === r.id ? 'not-allowed' : 'pointer' }}>
              {retrying === r.id ? 'Retrying…' : 'Retry sync →'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
