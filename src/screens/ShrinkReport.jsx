// src/screens/ShrinkReport.jsx
import { useState } from 'react'

const REASONS = [
  { value: 'theft',     label: '🚨 Theft / shoplifting' },
  { value: 'damaged',   label: '💔 Damaged / unsellable' },
  { value: 'miscount',  label: '🔢 Counting error' },
  { value: 'misring',   label: '🔀 Misring (mixed up with nearby SKU)' },
  { value: 'receiving', label: '📦 Receiving error' },
  { value: 'transfer',  label: '🔄 Transfer to other location' },
  { value: 'return',    label: '↩️ Customer return not restocked' },
  { value: 'display',   label: '🏪 Display / tester item' },
  { value: 'other',     label: '📝 Other (please specify)' },
]

export default function ShrinkReport({ variances, onGenerate, onBack }) {
  const [reasons, setReasons] = useState({})
  const [otherText, setOtherText] = useState({})

  const key = v => `${v.product_id}_${v.variant_id}__${v.location?.id}`

  const allReasoned = variances.every(v => {
    const k = key(v)
    const r = reasons[k]
    if (!r) return false
    if (r === 'other') return (otherText[k] || '').trim().length > 0
    return true
  })

  const losses = variances.filter(v => v.counted_qty < v.shopify_qty)
  const overages = variances.filter(v => v.counted_qty > v.shopify_qty)

  const byLocation = {}
  variances.forEach(v => {
    const loc = v.location?.label || 'Unknown'
    if (!byLocation[loc]) byLocation[loc] = []
    byLocation[loc].push(v)
  })

  function handleGenerate() {
    onGenerate(variances.map(v => {
      const k = key(v)
      const r = reasons[k] || ''
      const finalReason = r === 'other' ? (otherText[k] || 'Other').trim() : r
      return { ...v, reason: finalReason }
    }))
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', paddingBottom: '100px' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Shrink Report</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {variances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown)', marginBottom: '8px' }}>No variances!</div>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>All counted items match the system</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {losses.length > 0 && <div style={{ background: 'var(--red-light)', color: 'var(--red)', fontSize: '12px', fontWeight: '600', padding: '6px 14px', borderRadius: '99px' }}>▼ {losses.length} loss item{losses.length !== 1 ? 's' : ''}</div>}
              {overages.length > 0 && <div style={{ background: 'var(--green-light)', color: 'var(--green-dark)', fontSize: '12px', fontWeight: '600', padding: '6px 14px', borderRadius: '99px' }}>▲ {overages.length} overage{overages.length !== 1 ? 's' : ''}</div>}
              <div style={{ background: 'var(--blue-light)', color: 'var(--blue-dark)', fontSize: '12px', fontWeight: '600', padding: '6px 14px', borderRadius: '99px' }}>{Object.keys(byLocation).length} locations</div>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '16px' }}>Select a reason for each variance — grouped by location</div>

            {Object.entries(byLocation).map(([locLabel, locVars]) => (
              <div key={locLabel} style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--brown)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: 'var(--blue-light)', color: 'var(--blue-dark)', padding: '3px 10px', borderRadius: '99px', fontSize: '12px' }}>{locLabel}</span>
                  <span style={{ color: 'var(--gray-400)', fontWeight: '400', fontSize: '12px' }}>{locVars.length} variance{locVars.length !== 1 ? 's' : ''}</span>
                </div>

                {locVars.map(v => {
                  const k = key(v)
                  const diff = v.counted_qty - v.shopify_qty
                  const isLoss = diff < 0
                  const selectedReason = reasons[k] || ''
                  return (
                    <div key={k} style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '12px 14px', marginBottom: '8px', borderLeft: `4px solid ${isLoss ? 'var(--red)' : 'var(--green)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)', wordBreak: 'break-word' }}>{v.product_name}</div>
                          {/* SKU shown here too — keeps this screen consistent with the cycle
                              count page and gives a second reference point when reviewing a
                              long list of similarly-named products before finalizing the report. */}
                          {v.sku && <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>{v.sku}</div>}
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '700', padding: '3px 10px', borderRadius: '99px', flexShrink: 0, background: isLoss ? 'var(--red-light)' : 'var(--green-light)', color: isLoss ? 'var(--red)' : 'var(--green-dark)' }}>
                          {isLoss ? `▼ ${Math.abs(diff)}` : `▲ +${diff}`}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '10px' }}>
                        Counted: <strong>{v.counted_qty}</strong> · System: <strong>{v.shopify_qty}</strong> · {v.category}
                      </div>

                      {/* Reason dropdown */}
                      <select value={selectedReason} onChange={e => setReasons(r => ({ ...r, [k]: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${selectedReason ? 'var(--pink)' : 'var(--gray-200)'}`, borderRadius: '10px', background: 'var(--gray-50)', fontSize: '13px', color: 'var(--gray-700)', outline: 'none', marginBottom: selectedReason === 'other' ? '8px' : '0' }}>
                        <option value="">— Select reason —</option>
                        {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>

                      {/* Fix 3: Other text input */}
                      {selectedReason === 'other' && (
                        <input
                          type="text"
                          placeholder="Please describe the reason…"
                          value={otherText[k] || ''}
                          onChange={e => setOtherText(t => ({ ...t, [k]: e.target.value }))}
                          style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${otherText[k]?.trim() ? 'var(--pink)' : 'var(--gray-200)'}`, borderRadius: '10px', background: '#fff', fontSize: '13px', color: 'var(--brown)', outline: 'none' }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: 'var(--border)', padding: '14px 16px' }}>
        <button onClick={handleGenerate} disabled={variances.length > 0 && !allReasoned}
          style={{ width: '100%', padding: '15px', background: variances.length === 0 || allReasoned ? 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)' : 'var(--gray-200)', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '700', color: variances.length === 0 || allReasoned ? 'var(--brown)' : 'var(--gray-400)', cursor: variances.length > 0 && !allReasoned ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
          {variances.length === 0 ? 'Generate report →' : allReasoned ? 'Generate report →' : `${Object.keys(reasons).length} of ${variances.length} reasons selected`}
        </button>
      </div>
    </div>
  )
}
