// src/screens/ReportSummary.jsx
import { useState } from 'react'
import { exportShrinkReportPdf } from '../lib/exportPdf.js'

const REASON_LABELS = { theft:'Theft', damaged:'Damaged', miscount:'Miscount', misring:'Misring', receiving:'Receiving error', transfer:'Transfer', return:'Return', display:'Display item', other:'Other' }

// Fallback only — used if no `locations` prop is passed at all. In normal use,
// App.jsx always passes the real list: the live Shopify locations for a
// live session, or whatever locations are actually present in the data for a
// historical one (which may be a single combined bucket for pre-migration
// sessions that never saved a location per row).
const DEFAULT_LOCATIONS = []

export default function ReportSummary({
  locationId, startedAt, countedProducts, shrinkRows, onDone, saving, saved,
  sessionId, syncedLocations = [], onLocationSynced, locations, allowSync = true, countedBy,
}) {
  const [syncState, setSyncState] = useState({}) // { [locId]: 'idle'|'syncing'|'done'|'error' }
  const [syncError, setSyncError] = useState({})

  const knownLocations = locations && locations.length > 0 ? locations : DEFAULT_LOCATIONS

  async function handleSync(loc) {
    const itemsForLoc = countedProducts
      .filter(p => p.location?.id === loc.id && (p.counted_qty - p.shopify_qty) !== 0)
      .map(p => ({ inventory_item_id: p.inventory_item_id, variance: p.counted_qty - p.shopify_qty }))

    if (itemsForLoc.length === 0) {
      setSyncState(s => ({ ...s, [loc.id]: 'done' }))
      return
    }

    setSyncState(s => ({ ...s, [loc.id]: 'syncing' }))
    setSyncError(e => ({ ...e, [loc.id]: null }))
    try {
      const resp = await fetch('/api/shopify-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, locationId: loc.id, locationLabel: loc.label, items: itemsForLoc }),
      })
      const data = await resp.json()
      if (!resp.ok || data.success === false) throw new Error(data.error || data.message || 'Sync failed')
      setSyncState(s => ({ ...s, [loc.id]: 'done' }))
      onLocationSynced?.(loc.id)
    } catch (err) {
      setSyncState(s => ({ ...s, [loc.id]: 'error' }))
      setSyncError(e => ({ ...e, [loc.id]: err.message }))
    }
  }
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Only show the location(s) the report was actually generated for.
  const displayLocations = locationId && locationId !== 'ALL'
    ? knownLocations.filter(l => l.id === locationId)
    : knownLocations
  const locationLabel = locationId && locationId !== 'ALL'
    ? (knownLocations.find(l => l.id === locationId)?.label || 'All Locations')
    : 'All Locations'

  // Per-location stats
  const locStats = displayLocations.map(loc => {
    const locRows = shrinkRows.filter(r => r.location?.id === loc.id)
    const locCounted = countedProducts.filter(p => p.location?.id === loc.id)
    const losses = locRows.filter(r => r.counted_qty < r.shopify_qty)
    const overages = locRows.filter(r => r.counted_qty > r.shopify_qty)
    const totalLost = losses.reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty), 0)
    const totalOver = overages.reduce((s, r) => s + (r.counted_qty - r.shopify_qty), 0)
    const valueLost = losses.reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty) * (r.price || 0), 0)
    return { ...loc, locRows, locCounted, losses, overages, totalLost, totalOver, valueLost }
  })

  const totalLostAll = locStats.reduce((s, l) => s + l.totalLost, 0)
  const valueLostAll = locStats.reduce((s, l) => s + l.valueLost, 0)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', paddingBottom: '100px' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, var(--pink-light) 0%, var(--blue-light) 100%)', borderBottom: 'var(--border)', padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '13px', color: 'var(--brown-light)', fontWeight: '500' }}>Jellyland — {locationLabel} · {dateStr}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--brown)' }}>Shrink Report</div>
            {countedBy && <div style={{ fontSize: '12px', color: 'var(--brown-light)', marginTop: '2px' }}>Counted by {countedBy}</div>}
          </div>
        </div>
        {saved && <div style={{ fontSize: '12px', color: 'var(--green-dark)', fontWeight: '500' }}>✓ Saved to database</div>}
        {saving && <div style={{ fontSize: '12px', color: 'var(--blue-dark)' }}>Saving…</div>}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Overall summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Total counted', value: countedProducts.length, color: 'var(--brown)', bg: 'var(--gray-100)' },
            { label: 'Total variances', value: shrinkRows.length, color: shrinkRows.length > 0 ? 'var(--red)' : 'var(--green-dark)', bg: shrinkRows.length > 0 ? 'var(--red-light)' : 'var(--green-light)' },
            { label: 'Total value lost', value: `$${valueLostAll.toFixed(2)}`, color: valueLostAll > 0 ? 'var(--red)' : 'var(--green-dark)', bg: valueLostAll > 0 ? 'var(--red-light)' : 'var(--green-light)', small: true },
          ].map(m => (
            <div key={m.label} style={{ background: m.bg, borderRadius: '14px', padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: m.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', fontWeight: '600', opacity: 0.7 }}>{m.label}</div>
              <div style={{ fontSize: m.small ? '14px' : '22px', fontWeight: '700', color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Per-location breakdown */}
        {locStats.map(loc => (
          <div key={loc.id} style={{ background: '#fff', border: 'var(--border)', borderRadius: '16px', marginBottom: '14px', overflow: 'hidden' }}>
            {/* Location header */}
            <div style={{ background: 'var(--blue-light)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--blue-dark)' }}>{loc.label}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontSize: '11px', background: '#fff', color: 'var(--blue-dark)', padding: '2px 8px', borderRadius: '99px', fontWeight: '600' }}>{loc.locCounted.length} counted</span>
                {loc.locRows.length > 0 && <span style={{ fontSize: '11px', background: 'var(--red-light)', color: 'var(--red)', padding: '2px 8px', borderRadius: '99px', fontWeight: '600' }}>{loc.locRows.length} variances</span>}
                {loc.locRows.length === 0 && loc.locCounted.length > 0 && <span style={{ fontSize: '11px', background: 'var(--green-light)', color: 'var(--green-dark)', padding: '2px 8px', borderRadius: '99px', fontWeight: '600' }}>✓ Perfect</span>}
              </div>
            </div>

            {/* Sync to Shopify — item #6. A manual adjustment (delta), not an
                overwrite: -1 sends a delta of -1, +2 sends a delta of +2, so
                live sales between the count and this sync are preserved.
                Made big/prominent per request — this is the action that
                actually applies the count, so it shouldn't read as secondary
                to Download PDF. */}
            {loc.locCounted.length > 0 && allowSync && (
              <div style={{ padding: '14px 16px', borderTop: 'var(--border)' }}>
                {syncedLocations.includes(loc.id) || syncState[loc.id] === 'done' ? (
                  <div style={{ width: '100%', padding: '13px', borderRadius: '12px', background: 'var(--green-light)', border: '1.5px solid var(--green)', textAlign: 'center', fontSize: '14px', fontWeight: '700', color: 'var(--green-dark)' }}>
                    ✓ Synced to Shopify
                  </div>
                ) : (
                  <button onClick={() => handleSync(loc)} disabled={syncState[loc.id] === 'syncing'}
                    style={{
                      width: '100%', padding: '15px', border: 'none', borderRadius: '14px',
                      background: syncState[loc.id] === 'syncing' ? 'var(--gray-200)' : 'linear-gradient(135deg, var(--blue-dark) 0%, #3D7E90 100%)',
                      fontSize: '16px', fontWeight: '800', color: syncState[loc.id] === 'syncing' ? 'var(--gray-400)' : '#fff',
                      cursor: syncState[loc.id] === 'syncing' ? 'default' : 'pointer',
                      boxShadow: syncState[loc.id] === 'syncing' ? 'none' : '0 4px 16px rgba(74,155,171,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      letterSpacing: '0.01em', transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: '18px' }}>{syncState[loc.id] === 'syncing' ? '⏳' : '↻'}</span>
                    {syncState[loc.id] === 'syncing' ? 'Syncing…' : 'Sync to Shopify'}
                  </button>
                )}
                {syncState[loc.id] === 'error' && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)', fontWeight: '500' }}>{syncError[loc.id]}</div>
                )}
              </div>
            )}

            {loc.locCounted.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--gray-400)' }}>Not counted yet</div>
            ) : loc.locRows.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--green-dark)', fontWeight: '500' }}>🎉 No variances found</div>
            ) : (
              <>
                <div style={{ padding: '10px 16px 6px', display: 'flex', gap: '16px' }}>
                  {[
                    { label: 'Units lost', value: loc.totalLost, color: loc.totalLost > 0 ? 'var(--red)' : 'var(--gray-400)' },
                    { label: 'Units over', value: `+${loc.totalOver}`, color: loc.totalOver > 0 ? 'var(--green-dark)' : 'var(--gray-400)' },
                    { label: 'Est. loss', value: `$${loc.valueLost.toFixed(2)}`, color: loc.valueLost > 0 ? 'var(--red)' : 'var(--gray-400)' },
                  ].map(m => (
                    <div key={m.label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                {loc.locRows.map((r, i) => {
                  const diff = r.counted_qty - r.shopify_qty
                  const isLoss = diff < 0
                  return (
                    <div key={r.product_id + '_' + r.variant_id + '_' + r.location?.id} style={{ padding: '10px 16px', borderTop: 'var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{r.counted_qty} counted · {r.shopify_qty} system · {REASON_LABELS[r.reason] || r.reason}</div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', padding: '3px 10px', borderRadius: '99px', flexShrink: 0, background: isLoss ? 'var(--red-light)' : 'var(--green-light)', color: isLoss ? 'var(--red)' : 'var(--green-dark)' }}>
                        {isLoss ? diff : `+${diff}`}
                      </span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: 'var(--border)', padding: '14px 16px', display: 'flex', gap: '10px' }}>
        <button onClick={onDone} style={{ flex: 1, padding: '13px', border: 'var(--border)', borderRadius: '12px', background: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: 'var(--gray-700)' }}>Done</button>
        <button
          onClick={() => exportShrinkReportPdf({ location: `Jellyland — ${locationLabel}`, startedAt, countedProducts, shrinkRows, locations: displayLocations, countedBy })}
          style={{ flex: 2, padding: '13px', background: 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '700', color: 'var(--brown)', cursor: 'pointer', boxShadow: '0 4px 16px rgba(242,188,204,0.4)' }}>
          ⬇ Download PDF
        </button>
      </div>
    </div>
  )
}
