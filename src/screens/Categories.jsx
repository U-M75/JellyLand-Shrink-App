// src/screens/Categories.jsx
import { useState } from 'react'

const ICONS = {
  'DIY Toppings': '🌿', 'DIY Slime': '🫧', 'DIY Add Ons': '🍦', 'Slime Misc': '🧴',
  'Signature Dome™ Slimes': '🍮', 'Toys': '🧸', 'Misc Items': '🏷️', default: '🏷️',
}

export default function Categories({ categories, locations, collections, completedCats, lockedCells, onSelectCategory, onFinish, onBack, onStartFresh, onExportCsv, completion, zoneCompletion, locationCompletion, loading, error }) {
  const [search, setSearch] = useState('')
  const [confirmingFresh, setConfirmingFresh] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const catNames = Object.keys(categories)
  const collectionCount = (collections || []).length

  const doneCount = completedCats.size
  const hasAnyCounted = completedCats.size > 0
  const { total = 0, filled = 0, isComplete = false } = completion || {}
  const pct = total ? Math.round((filled / total) * 100) : 0

  // Which single locations are fully counted (independent of the others), so
  // staff can generate a report scoped to just Warehouse, say, once that one
  // location's counts are all in — "All Locations" only appears once every
  // location is done.
  const completedLocations = (locationCompletion || []).filter(l => l.isComplete)
  const allLocationsComplete = (locationCompletion || []).length > 0 && completedLocations.length === locationCompletion.length
  const reportOptions = [
    ...completedLocations.map(l => ({ value: l.id, label: l.label })),
    ...(allLocationsComplete ? [{ value: 'ALL', label: 'All Locations' }] : []),
  ]
  const effectiveSelection = reportOptions.some(o => o.value === selectedLocation)
    ? selectedLocation
    : (reportOptions[reportOptions.length - 1]?.value ?? null)

  const allProducts = Object.entries(categories).flatMap(([cat, products]) => products.map(p => ({ ...p, category: cat })))
  const searchResults = search.trim().length > 1
    ? allProducts.filter(p => p.product_name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())))
    : []

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', display: 'flex', flexDirection: 'column' }}>
      <TopBar onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '70px', height: '70px', objectFit: 'contain', animation: 'spin 2s linear infinite' }} />
        <div style={{ fontSize: '14px', color: 'var(--brown-light)', fontWeight: '500' }}>Loading products from Shopify…</div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', display: 'flex', flexDirection: 'column' }}>
      <TopBar onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px' }}>⚠️</div>
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Failed to load products</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>{error}</div>
        <button onClick={onBack} style={secBtn}>Go back</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', paddingBottom: '110px' }}>
      <TopBar onBack={onBack} />
      <div style={{ padding: '16px 20px' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder="Search products by name or SKU…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '11px 12px 11px 34px', border: `1.5px solid ${search ? 'var(--pink)' : 'var(--gray-200)'}`, borderRadius: '12px', fontSize: '13px', outline: 'none', background: '#fff', color: 'var(--brown)', transition: 'all 0.15s' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>}
        </div>

        {/* SEARCH MODE */}
        {search.trim().length > 1 && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '10px' }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</div>
            {searchResults.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-400)', fontSize: '13px' }}>No products found</div>
              : searchResults.map(p => (
                <div key={p.product_id + '_' + p.variant_id} onClick={() => { setSearch(''); onSelectCategory(p.category) }}
                  style={{ background: '#fff', border: 'var(--border)', borderRadius: '12px', padding: '12px 14px', marginBottom: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {p.thumb ? <img src={p.thumb} alt="" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display='none'} /> : <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🫧</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{p.category} {p.sku && `· ${p.sku}`}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--brown-light)', background: 'var(--pink-light)', padding: '3px 8px', borderRadius: '99px', flexShrink: 0 }}>Go →</div>
                </div>
              ))
            }
          </>
        )}

        {/* BROWSE MODE */}
        {search.trim().length <= 1 && (
          <>
            {/* Progress */}
            <div style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', color: 'var(--brown)' }}>Progress</span>
                <span style={{ color: 'var(--gray-400)' }}>{filled} of {total} counts entered</span>
              </div>
              <div style={{ height: '7px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--pink) 0%, var(--blue) 100%)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>{doneCount} of {catNames.length} zones touched</div>
            </div>

            {/* Info */}
            <div style={{ background: 'var(--blue-light)', border: '1px solid rgba(126,200,216,0.3)', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: 'var(--blue-dark)', lineHeight: '1.5' }}>
              💡 Your progress saves automatically and sticks around until you tap "Start fresh." Every product needs a number (even 0) in all Shopify locations before you can generate the report.
            </div>

            {/* Start fresh + CSV backup */}
            <div style={{ marginBottom: '14px' }}>
              {!confirmingFresh ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <button onClick={() => setConfirmingFresh(true)} style={{ fontSize: '12px', color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', textDecoration: 'underline' }}>
                    Start fresh (clear all counts)
                  </button>
                  {/* Item #2 — a downloadable copy of everything entered so far, so a
                      crash or wifi drop doesn't mean recounting from scratch. Available
                      as soon as anything's been counted, not just once a zone is done. */}
                  {hasAnyCounted && (
                    <button onClick={onExportCsv} style={{ fontSize: '12px', color: 'var(--blue-dark)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      ⬇ Export CSV backup
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ background: 'var(--red-light)', border: '1px solid var(--red)', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: '600', marginBottom: '10px' }}>This clears every count you've entered. Are you sure?</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={onStartFresh} style={{ flex: 1, padding: '9px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Yes, clear everything</button>
                    <button onClick={() => setConfirmingFresh(false)} style={{ flex: 1, padding: '9px', background: '#fff', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', color: 'var(--gray-700)' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {catNames.map(cat => {
                const zc = zoneCompletion?.[cat] || {}
                const zoneComplete = !!zc.isComplete
                const zoneTouched = (zc.filled || 0) > 0
                const count = categories[cat]?.length || 0
                const icon = ICONS[cat] || ICONS.default

                // Locking is per (product, location) cell now, not per zone — count how
                // many of this zone's cells are locked to know if it's fully, partially,
                // or not-at-all locked. Opening a zone is always allowed either way.
                const catProducts = categories[cat] || []
                let lockedCount = 0
                catProducts.forEach(p => {
                  locations.forEach(loc => {
                    if (lockedCells.has(`${p.product_id}_${p.variant_id}__${loc.id}`)) lockedCount += 1
                  })
                })
                const totalCells = zc.total || (catProducts.length * locations.length)
                const zoneFullyLocked = totalCells > 0 && lockedCount === totalCells
                const zonePartiallyLocked = lockedCount > 0 && !zoneFullyLocked

                // Complete = every product/location in this zone actually has a value.
                // Touched-but-incomplete gets its own amber state so it's never confused with done.
                const tileBg = zoneComplete ? 'var(--pink-light)' : zoneFullyLocked ? 'var(--gray-100)' : zoneTouched ? '#FFF8ED' : '#fff'
                const tileBorder = zoneComplete ? 'var(--pink)' : zoneFullyLocked ? 'var(--gray-200)' : zoneTouched ? '#E8B84B' : 'var(--gray-200)'
                return (
                  <button key={cat} onClick={() => onSelectCategory(cat)}
                    style={{ background: tileBg, border: `1.5px solid ${tileBorder}`, borderRadius: '16px', padding: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative' }}>
                    {zoneFullyLocked && <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '14px' }}>🔒</div>}
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--brown)', marginBottom: '3px', lineHeight: '1.3' }}>{cat}</div>
                    <div style={{ fontSize: '11px', fontWeight: zoneComplete || zoneTouched ? '700' : '400', color: zoneComplete ? 'var(--brown-light)' : zoneTouched ? '#B8791F' : 'var(--gray-400)' }}>
                      {zoneComplete ? '✓ Complete' : zoneTouched ? `⚠ ${zc.missing} missing` : `${count} products`}
                      {zoneFullyLocked ? ' · Locked' : zonePartiallyLocked ? ` · 🔒 ${lockedCount} locked` : ''}
                    </div>
                  </button>
                )
              })}
            </div>

            {!hasAnyCounted && (
              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--gray-400)', padding: '16px 8px' }}>
                Start counting a zone — finish every product for a single location to generate a report for it
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky footer */}
      {hasAnyCounted && search.trim().length <= 1 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: 'var(--border)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reportOptions.length > 0 ? (
            <>
              {/* Item #3 — this field is easy to miss since it sits low on the
                  screen with a lot else going on above it. Labeling it makes clear
                  it picks which location's Shrink Report will be generated below. */}
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Generate Shrink Report for
              </div>
              <select value={effectiveSelection ?? ''} onChange={e => setSelectedLocation(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gray-200)', borderRadius: '12px', fontSize: '13px', fontWeight: '600', color: 'var(--brown)', background: '#fff', outline: 'none' }}>
                {reportOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={() => onFinish(effectiveSelection)} disabled={!effectiveSelection}
                style={{ width: '100%', padding: '15px', background: effectiveSelection ? 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)' : 'var(--gray-200)', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '700', color: effectiveSelection ? 'var(--brown)' : 'var(--gray-400)', cursor: effectiveSelection ? 'pointer' : 'not-allowed', boxShadow: effectiveSelection ? '0 4px 16px rgba(242,188,204,0.4)' : 'none', transition: 'all 0.2s' }}>
                Generate shrink report →
              </button>
            </>
          ) : (
            <div style={{ width: '100%', padding: '15px', background: 'var(--gray-200)', borderRadius: '14px', fontSize: '13px', fontWeight: '600', color: 'var(--gray-400)', textAlign: 'center' }}>
              {filled} of {total} counts entered — finish one full location to generate a report
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TopBar({ onBack }) {
  return (
    <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
      <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Cycle Count</div>
    </div>
  )
}

const secBtn = { padding: '10px 20px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', background: '#fff', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: 'var(--gray-700)' }