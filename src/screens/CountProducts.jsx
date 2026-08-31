// src/screens/CountProducts.jsx
import { useState, useEffect, useRef } from 'react'

export default function CountProducts({ locations, category, products, existingCounts, lockedCells, wasSaved, onSave, onAutosave, onToggleLock, onLockAllCounted, onBack }) {
  // Only flag empty cells amber once this zone has actually been saved/locked
  // incomplete before — on a fresh, never-touched zone every cell is empty by
  // definition, so lighting the whole thing up amber would just be noise.
  const showMissingHighlight = !!wasSaved
  const [counts, setCounts] = useState(() => {
    const init = {}
    products.forEach(p => {
      locations.forEach(loc => {
        const k = `${p.product_id}_${p.variant_id}__${loc.id}`
        if (existingCounts[k] !== undefined) init[k] = existingCounts[k]
      })
    })
    return init
  })
  const [search, setSearch] = useState('')
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const [missingSnapshot, setMissingSnapshot] = useState(null)
  const [autosavedAt, setAutosavedAt] = useState(null)
  const isFirstRender = useRef(true)

  // Autosave a few seconds after the last edit — this is a background save
  // to localStorage only (doesn't mark the zone complete or navigate away),
  // so a crash or wifi drop mid-zone loses at most a few seconds of typing
  // rather than the whole zone. Skips the very first render so opening an
  // already-saved zone doesn't immediately "autosave" unchanged data.
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!onAutosave) return
    const t = setTimeout(() => {
      onAutosave(category, counts)
      setAutosavedAt(new Date())
    }, 3000)
    return () => clearTimeout(t)
  }, [counts])

  const key = (p, locId) => `${p.product_id}_${p.variant_id}__${locId}`
  const isMissingSomewhere = p => locations.some(loc => counts[key(p, loc.id)] === undefined)
  const rowId = p => p.product_id + '_' + p.variant_id
  const isCellLocked = (p, locId) => lockedCells.has(key(p, locId))

  function toggleMissingOnly() {
    if (showMissingOnly) {
      setShowMissingOnly(false)
      setMissingSnapshot(null)
    } else {
      // Snapshot which products are missing right now — this list stays put
      // even as you fill items in, so they don't vanish out from under you.
      setMissingSnapshot(new Set(products.filter(isMissingSomewhere).map(rowId)))
      setShowMissingOnly(true)
    }
  }

  function adjust(p, locId, delta) {
    if (isCellLocked(p, locId)) return
    const k = key(p, locId)
    setCounts(prev => ({ ...prev, [k]: (prev[k] ?? 0) + delta }))
  }

  function setExact(p, locId, val) {
    if (isCellLocked(p, locId)) return
    const k = key(p, locId)
    if (val === '') { setCounts(prev => { const n = { ...prev }; delete n[k]; return n }) }
    else { const num = parseInt(val); if (!isNaN(num)) setCounts(prev => ({ ...prev, [k]: num })) }
  }

  const missingCount = products.filter(isMissingSomewhere).length

  const filtered = products
    .filter(p => !search.trim() || p.product_name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())))
    .filter(p => !showMissingOnly || missingSnapshot?.has(rowId(p)))

  const countedRows = products.filter(p => locations.some(loc => counts[key(p, loc.id)] !== undefined)).length

  const totalCells = products.length * locations.length
  const lockedCellCount = products.reduce((n, p) => n + locations.filter(loc => isCellLocked(p, loc.id)).length, 0)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', paddingBottom: '90px' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brown)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {category}
            {lockedCellCount > 0 && <span style={{ fontSize: '11px', background: 'var(--gray-200)', color: 'var(--gray-400)', padding: '2px 8px', borderRadius: '99px' }}>🔒 {lockedCellCount} of {totalCells} locked</span>}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
            {countedRows} of {products.length} products · {locations.length} locations
            {autosavedAt && <span> · ✓ Autosaved {autosavedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
          </div>
        </div>
        {/* Bulk convenience — locks every cell that currently has a number in it.
            Cells left blank (not yet counted) stay open and untouched. Individual
            cells can still be locked/unlocked one at a time via the padlock on each. */}
        <button onClick={() => onLockAllCounted(category, counts)} style={{ fontSize: '12px', padding: '7px 14px', border: '1.5px solid var(--gray-200)', borderRadius: '10px', background: 'var(--gray-100)', cursor: 'pointer', color: 'var(--gray-700)', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0 }}>🔒 Lock all counted</button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px 4px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: `1.5px solid ${search ? 'var(--pink)' : 'var(--gray-200)'}`, borderRadius: '11px', fontSize: '13px', outline: 'none', background: '#fff', color: 'var(--brown)' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>}
        </div>
        {missingCount > 0 && (
          <button onClick={toggleMissingOnly}
            style={{
              marginTop: '8px', fontSize: '12px', fontWeight: '700', padding: '6px 12px', borderRadius: '99px',
              border: `1.5px solid ${showMissingOnly ? '#E8B84B' : 'var(--gray-200)'}`,
              background: showMissingOnly ? '#FFF8ED' : '#fff', color: showMissingOnly ? '#B8791F' : 'var(--gray-700)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
            ⚠ {showMissingOnly ? `Showing ${missingSnapshot?.size ?? 0} incomplete — tap to exit` : `Show ${missingCount} incomplete ${missingCount === 1 ? 'product' : 'products'}`}
          </button>
        )}
      </div>

      {/* Product list */}
      <div style={{ padding: '8px 16px' }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-400)', fontSize: '13px' }}>No products found</div>}
        {filtered.map(p => {
          const hasAnyCount = locations.some(loc => counts[key(p, loc.id)] !== undefined)
          return (
            <div key={p.product_id + '_' + p.variant_id} style={{
              background: hasAnyCount ? 'var(--pink-light)' : '#fff',
              border: `1.5px solid ${hasAnyCount ? 'var(--pink)' : 'var(--gray-200)'}`,
              borderRadius: '14px', padding: '12px', marginBottom: '10px',
            }}>
              {/* Top row: thumbnail + name */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                {p.thumb
                  ? <a href={p.image} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                      <img src={p.thumb} alt={p.product_name} style={{ width: '44px', height: '44px', borderRadius: '9px', objectFit: 'cover', border: '1.5px solid var(--gray-200)', display: 'block' }} onError={e => e.target.style.display='none'} />
                    </a>
                  : <div style={{ width: '44px', height: '44px', borderRadius: '9px', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🫧</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Fix 5: allow wrapping for long titles */}
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)', lineHeight: '1.4', wordBreak: 'break-word' }}>
                    {p.product_name}
                  </div>
                  {p.sku && <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>{p.sku}</div>}
                </div>
              </div>

              {/* Fix 6: counters on separate row, wrapping on mobile */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {locations.map(loc => {
                  const k = key(p, loc.id)
                  const counted = counts[k]
                  const cellLocked = isCellLocked(p, loc.id)
                  const isMissing = counted === undefined && showMissingHighlight && !cellLocked
                  const sysQty = p.locationStock?.find(l => l.id === loc.id)?.qty ?? 0
                  return (
                    <div key={loc.id} style={{
                      position: 'relative',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                      background: cellLocked ? '#F5F0EC' : isMissing ? '#FFF8ED' : 'rgba(255,255,255,0.6)',
                      border: cellLocked ? '1.5px solid var(--gray-200)' : isMissing ? '1.5px dashed #E8B84B' : '1.5px solid transparent',
                      borderRadius: '10px', padding: '5px 4px',
                    }}>
                      {/* Per-cell lock toggle — locks just this product+location, independent
                          of the other locations on the same product row. */}
                      <button onClick={() => onToggleLock(p, loc.id)}
                        title={cellLocked ? 'Unlock this cell' : 'Lock this cell'}
                        style={{
                          position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px',
                          border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                          fontSize: '10px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: cellLocked ? 1 : 0.35,
                        }}>{cellLocked ? '🔒' : '🔓'}</button>
                      {/* Location label */}
                      <div style={{ fontSize: '9px', fontWeight: '700', color: isMissing ? '#B8791F' : 'var(--brown-light)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
                        {loc.short}{isMissing ? ' ⚠' : ''}
                      </div>
                      {/* Counter */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <button onClick={() => adjust(p, loc.id, -1)} disabled={cellLocked}
                          style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--gray-200)', background: cellLocked ? 'var(--gray-100)' : '#fff', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: cellLocked ? 'default' : 'pointer', color: 'var(--gray-700)', lineHeight: 1, padding: 0, flexShrink: 0 }}>−</button>
                        <input type="number" value={counted ?? ''} placeholder="—"
                          onChange={e => setExact(p, loc.id, e.target.value)}
                          readOnly={cellLocked}
                          style={{ width: '30px', textAlign: 'center', border: 'none', background: 'transparent', fontSize: '14px', fontWeight: '700', color: 'var(--brown)', outline: 'none', padding: '0' }} />
                        <button onClick={() => adjust(p, loc.id, 1)} disabled={cellLocked}
                          style={{ width: '24px', height: '24px', borderRadius: '6px', border: `1px solid ${cellLocked ? 'var(--gray-200)' : 'var(--pink)'}`, background: cellLocked ? 'var(--gray-100)' : 'var(--pink-light)', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: cellLocked ? 'default' : 'pointer', color: 'var(--brown)', lineHeight: 1, padding: 0, flexShrink: 0 }}>+</button>
                      </div>
                      {/* Autofill: tap the system qty to drop it straight into the count */}
                      <button onClick={() => !cellLocked && setExact(p, loc.id, String(sysQty))} disabled={cellLocked}
                        title="Autofill system quantity"
                        style={{
                          fontSize: '9px', fontWeight: '700', textAlign: 'center',
                          color: cellLocked ? 'var(--gray-400)' : 'var(--blue-dark)',
                          background: cellLocked ? 'transparent' : 'var(--blue-light)',
                          border: `1px solid ${cellLocked ? 'transparent' : 'rgba(126,200,216,0.5)'}`,
                          borderRadius: '99px', padding: '2px 8px', margin: 0,
                          cursor: cellLocked ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '3px', lineHeight: 1.3,
                        }}>
                        <span style={{ fontSize: '10px' }}>↺</span> system: {sysQty}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: 'var(--border)', padding: '12px 16px', display: 'flex', gap: '10px' }}>
        <button onClick={onBack} style={{ flex: 1, padding: '12px', border: 'var(--border)', borderRadius: '12px', background: '#fff', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: 'var(--gray-700)' }}>Back</button>
        <button onClick={() => onSave(category, counts)} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: '700', color: 'var(--brown)', cursor: 'pointer' }}>Save ✓</button>
      </div>
    </div>
  )
}