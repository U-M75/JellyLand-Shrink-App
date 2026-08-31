// src/screens/LogAdjustment.jsx
// Replaces the "Stock Take" app for mid-month damages/testers/misc adjustments.
// Staff pick a product + location, choose a type, enter qty, and submit — this
// saves to `adjustments` and pushes the same delta straight into Shopify
// inventory, so there's no separate reconciliation step and no need to grant
// Lauren direct Shopify inventory access.

import { useState, useMemo } from 'react'

const TYPES = [
  { value: 'damage', label: '💔 Damaged / unsellable' },
  { value: 'tester', label: '🧪 Used as tester' },
  { value: 'other',  label: '📝 Other (please specify)' },
]

export default function LogAdjustment({ locations, categories, onBack, onViewSyncIssues, onViewAdjustmentLog, loggedInUser }) {
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [locationId, setLocationId] = useState(locations[0].id)
  const [type, setType] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { success, shopifySynced, shopifyError }
  const [recent, setRecent] = useState([])

  const allProducts = useMemo(
    () => Object.values(categories || {}).flat(),
    [categories]
  )

  const matches = useMemo(() => {
    if (!search.trim()) return []
    const q = search.trim().toLowerCase()
    return allProducts.filter(p =>
      p.product_name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [search, allProducts])

  const canSubmit = selectedProduct && locationId && type && Number(qty) > 0 &&
    (type !== 'other' || note.trim().length > 0) && !submitting

  async function handleSubmit() {
    setSubmitting(true)
    setResult(null)
    const loc = locations.find(l => l.id === locationId)
    try {
      const resp = await fetch('/api/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.product_id,
          variant_id: selectedProduct.variant_id,
          inventory_item_id: selectedProduct.inventory_item_id,
          product_name: selectedProduct.product_name,
          sku: selectedProduct.sku,
          category: selectedProduct.category,
          location_id: locationId,
          location_name: loc?.label,
          adjustment_type: type,
          qty: Number(qty),
          note: note.trim() || null,
          logged_by: loggedInUser?.name || null,
          price_at_time: selectedProduct.price || null,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to save')
      setResult({ success: true, shopifySynced: data.shopifySynced, shopifyError: data.shopifyError })
      setRecent(r => [{ ...selectedProduct, locationLabel: loc?.label, type, qty: Number(qty) }, ...r].slice(0, 5))
      // Reset the form for the next entry
      setSelectedProduct(null); setSearch(''); setType(''); setQty(''); setNote('')
    } catch (err) {
      setResult({ success: false, error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', paddingBottom: '100px' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)', flex: 1 }}>Log Damage / Tester</div>
        <button onClick={onViewAdjustmentLog} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: '600', color: 'var(--gray-400)', cursor: 'pointer', marginRight: '10px' }}>View log</button>
        <button onClick={onViewSyncIssues} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: '600', color: 'var(--gray-400)', cursor: 'pointer' }}>Sync issues</button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '16px' }}>
          Use this instead of Stock Take for damages, testers, or other mid-month adjustments — it saves to the shrink report and updates Shopify inventory automatically.
        </div>

        {/* Product search */}
        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown)', display: 'block', marginBottom: '6px' }}>Product</label>
        {selectedProduct ? (
          <div style={{ background: '#fff', border: '1.5px solid var(--pink)', borderRadius: '12px', padding: '10px 12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>{selectedProduct.product_name}</div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{selectedProduct.sku || 'No SKU'}</div>
            </div>
            <button onClick={() => setSelectedProduct(null)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: '13px', cursor: 'pointer' }}>Change</button>
          </div>
        ) : (
          <>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or SKU…"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '13px', marginBottom: '8px', outline: 'none', boxSizing: 'border-box' }}
            />
            {matches.length > 0 && (
              <div style={{ background: '#fff', border: 'var(--border)', borderRadius: '12px', marginBottom: '14px', overflow: 'hidden' }}>
                {matches.map(p => (
                  <button key={`${p.product_id}_${p.variant_id}`} onClick={() => { setSelectedProduct(p); setSearch('') }}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: 'var(--border)', background: 'none', cursor: 'pointer' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>{p.product_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{p.sku || 'No SKU'} · {p.category}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Location */}
        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown)', display: 'block', marginBottom: '6px' }}>Location</label>
        <select value={locationId} onChange={e => setLocationId(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '13px', marginBottom: '14px', background: '#fff', outline: 'none' }}>
          {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>

        {/* Type */}
        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown)', display: 'block', marginBottom: '6px' }}>Type</label>
        <select value={type} onChange={e => setType(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${type ? 'var(--pink)' : 'var(--gray-200)'}`, borderRadius: '10px', fontSize: '13px', marginBottom: type === 'tester' ? '6px' : '14px', background: '#fff', outline: 'none' }}>
          <option value="">— Select type —</option>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {type === 'tester' && (
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '14px' }}>
            Shows up in Shopify's inventory history as "Safety stock" — Shopify has no built-in tester reason, so this is the closest match.
          </div>
        )}

        {/* Qty */}
        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown)', display: 'block', marginBottom: '6px' }}>Quantity</label>
        <input
          type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
          placeholder="Units to remove"
          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '13px', marginBottom: '14px', outline: 'none', boxSizing: 'border-box' }}
        />

        {/* Note */}
        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown)', display: 'block', marginBottom: '6px' }}>
          Note {type === 'other' && <span style={{ color: 'var(--red)' }}>(required)</span>}
        </label>
        <input
          type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="What happened?"
          style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${type === 'other' && !note.trim() ? 'var(--red)' : 'var(--gray-200)'}`, borderRadius: '10px', fontSize: '13px', marginBottom: '14px', outline: 'none', boxSizing: 'border-box' }}
        />

        {/* Logged by — from your login */}
        <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '14px' }}>Logged by <strong style={{ color: 'var(--brown)' }}>{loggedInUser?.name || 'Unknown'}</strong></div>

        {result && (
          <div style={{
            background: result.success ? 'var(--green-light)' : 'var(--red-light)',
            border: `1.5px solid ${result.success ? 'var(--green)' : 'var(--red)'}`,
            borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px',
            color: result.success ? 'var(--green-dark)' : 'var(--red)',
          }}>
            {result.success ? (
              result.shopifySynced
                ? '✅ Saved and Shopify inventory updated.'
                : `✅ Saved — but Shopify sync failed (${result.shopifyError || 'unknown error'}). It's logged and can be retried later.`
            ) : `❌ ${result.error}`}
          </div>
        )}

        {recent.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--gray-400)', marginBottom: '8px' }}>LOGGED THIS SESSION</div>
            {recent.map((r, i) => (
              <div key={i} style={{ background: '#fff', border: 'var(--border)', borderRadius: '10px', padding: '10px 12px', marginBottom: '6px', fontSize: '12px', color: 'var(--brown)' }}>
                {r.product_name} · {r.locationLabel} · {TYPES.find(t => t.value === r.type)?.label} · {r.qty} unit{r.qty !== 1 ? 's' : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: 'var(--border)', padding: '14px 16px' }}>
        <button onClick={handleSubmit} disabled={!canSubmit}
          style={{ width: '100%', padding: '15px', background: canSubmit ? 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)' : 'var(--gray-200)', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '700', color: canSubmit ? 'var(--brown)' : 'var(--gray-400)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Saving…' : 'Log adjustment →'}
        </button>
      </div>
    </div>
  )
}
