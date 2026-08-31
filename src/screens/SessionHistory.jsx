// src/screens/SessionHistory.jsx
// Item #4: browse the 10 most recent completed sessions, then pick a location
// within that session, to re-view (and optionally re-sync) its report.
import { useState, useEffect } from 'react'

function formatPST(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
  return `${date} · ${time} PST`
}

export default function SessionHistory({ onBack, onViewSession }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [sessionDetail, setSessionDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState('ALL')

  useEffect(() => {
    fetch('/api/reports')
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
        return data
      })
      .then(data => { setSessions(data.sessions || []); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  function selectSession(s) {
    setSelectedSession(s)
    setDropdownOpen(false)
    setSessionDetail(null)
    setSelectedLocationId('ALL')
    setDetailLoading(true)
    fetch(`/api/reports?sessionId=${s.id}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`)
        return data
      })
      .then(data => { setSessionDetail(data); setDetailLoading(false) })
      .catch(err => { setError(err.message); setDetailLoading(false) })
  }

  const locationsAvailable = sessionDetail?.locationsInSession || []

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)', paddingBottom: '40px' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '22px', padding: '0', color: 'var(--gray-400)', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown)' }}>Previous Sessions</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {loading && <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>Loading recent sessions…</div>}
        {error && <div style={{ fontSize: '13px', color: 'var(--red)' }}>Couldn't load sessions: {error}</div>}

        {!loading && !error && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '10px' }}>Select a session (last {sessions.length})</div>

            {/* Session dropdown */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <button onClick={() => setDropdownOpen(o => !o)} style={{ width: '100%', textAlign: 'left', padding: '13px 14px', background: '#fff', border: '1.5px solid var(--gray-200)', borderRadius: '12px', fontSize: '13px', color: 'var(--brown)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  {selectedSession
                    ? <><strong>#{selectedSession.id.slice(0, 8)}</strong> — {formatPST(selectedSession.completed_at)}{selectedSession.counted_by ? ` · ${selectedSession.counted_by}` : ''}</>
                    : 'Choose a session…'}
                </span>
                <span style={{ color: 'var(--gray-400)' }}>{dropdownOpen ? '▲' : '▼'}</span>
              </button>

              {dropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '6px', background: '#fff', border: '1.5px solid var(--gray-200)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, maxHeight: '340px', overflowY: 'auto' }}>
                  {sessions.length === 0 && (
                    <div style={{ padding: '14px', fontSize: '13px', color: 'var(--gray-400)' }}>No completed sessions yet</div>
                  )}
                  {sessions.map(s => (
                    <button key={s.id} onClick={() => selectSession(s)}
                      style={{ width: '100%', textAlign: 'left', padding: '12px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--gray-100)', cursor: 'pointer' }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--brown)' }}>#{s.id.slice(0, 8)} · {s.location}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{formatPST(s.completed_at)}{s.counted_by ? ` · ${s.counted_by}` : ''}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Location picker, once a session is chosen */}
            {selectedSession && (
              <div style={{ marginBottom: '20px' }}>
                {detailLoading && <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>Loading session detail…</div>}
                {!detailLoading && sessionDetail && (
                  <>
                    <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '8px' }}>Select a location for this session</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                      <button onClick={() => setSelectedLocationId('ALL')}
                        style={{ padding: '8px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: selectedLocationId === 'ALL' ? '1.5px solid var(--pink)' : '1.5px solid var(--gray-200)', background: selectedLocationId === 'ALL' ? 'var(--pink-light)' : '#fff', color: 'var(--brown)' }}>
                        All Locations
                      </button>
                      {locationsAvailable.map(loc => (
                        <button key={loc.id} onClick={() => setSelectedLocationId(loc.id)}
                          style={{ padding: '8px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: selectedLocationId === loc.id ? '1.5px solid var(--pink)' : '1.5px solid var(--gray-200)', background: selectedLocationId === loc.id ? 'var(--pink-light)' : '#fff', color: 'var(--brown)' }}>
                          {loc.label}
                        </button>
                      ))}
                      {locationsAvailable.length === 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                          This session predates the per-location update — only a combined view is available.
                        </div>
                      )}
                    </div>

                    <button onClick={() => onViewSession(sessionDetail, selectedLocationId)}
                      style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)', border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: '700', color: 'var(--brown)', cursor: 'pointer' }}>
                      View Report →
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
