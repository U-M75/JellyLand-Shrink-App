// src/screens/QuickAdjustSyncIssues.jsx
// Same pattern as SyncIssues.jsx, pointed at quick_adjustments instead of
// adjustments — quick adjustments that saved but didn't make it into Shopify
// inventory yet, with a retry button per row.

import { useState, useEffect } from 'react'

export default function QuickAdjustSyncIssues({ onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/quick-adjustments?limit=200')
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
      const resp = await fetch(`/api/quick-adjustments?id=${id}`, { method: 'PATCH' })
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

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Quick Adjust sync issues</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '16px' }}>
          These quick adjustments saved but didn't make it into Shopify inventory yet. Retry once the underlying issue (usually a permissions or connectivity error) is fixed.
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
              <span style={{ fontSize: '13px', fontWeight: '700', color: r.qty > 0 ? 'var(--green-dark)' : 'var(--red)', flexShrink: 0 }}>{r.qty > 0 ? '+' : ''}{r.qty}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '6px' }}>
              {r.location_name} · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
