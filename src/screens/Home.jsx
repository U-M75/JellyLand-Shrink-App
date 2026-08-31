// src/screens/Home.jsx
export default function Home({ onStartCount, onLogout, hasResume, onClearAndStart, onViewHistory, onLogAdjustment, onQuickAdjust, onViewMonthlyReport, loggedInUser }) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const h = now.getHours()
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--gray-50)' }}>
      <div style={{ background: '#fff', borderBottom: 'var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brown)' }}>Jellyland Cycle Count</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{dateStr}</div>
          </div>
        </div>
        <div style={{ fontSize: '12px', background: 'var(--pink-light)', color: 'var(--brown)', border: '1px solid var(--pink)', padding: '5px 12px', borderRadius: '99px', fontWeight: '600' }}>Jellyland</div>
      </div>

      <div style={{ padding: '28px 20px' }}>
        <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--brown)', marginBottom: '4px' }}>{greet}! 👋</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginBottom: '16px' }}>Count all 4 Jellyland locations simultaneously</div>

        {/* Location chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '24px' }}>
          {['DCA Festival', 'Jellyland DTD', 'Jellyland CA Overstock', 'Jellyland CA Warehouse'].map(loc => (
            <span key={loc} style={{ fontSize: '11px', background: 'var(--blue-light)', color: 'var(--blue-dark)', border: '1px solid rgba(126,200,216,0.3)', padding: '4px 10px', borderRadius: '99px', fontWeight: '500' }}>{loc}</span>
          ))}
        </div>

        {/* Resume banner */}
        {hasResume && (
          <div style={{ background: 'var(--green-light)', border: '1.5px solid var(--green)', borderRadius: '16px', padding: '16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--green-dark)', marginBottom: '4px' }}>📂 Resume saved session</div>
            <div style={{ fontSize: '12px', color: 'var(--green-dark)', opacity: 0.8, marginBottom: '12px' }}>You have a count in progress. Continue where you left off.</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onStartCount} style={{ flex: 2, padding: '10px', background: 'var(--green-dark)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>Resume →</button>
              <button onClick={onClearAndStart} style={{ flex: 1, padding: '10px', background: '#fff', border: '1.5px solid var(--gray-200)', borderRadius: '10px', fontSize: '13px', fontWeight: '500', color: 'var(--gray-700)', cursor: 'pointer' }}>Start fresh</button>
            </div>
          </div>
        )}

        {/* Main action */}
        {!hasResume && (
          <button onClick={onStartCount} style={{ width: '100%', background: '#fff', border: '2px solid var(--pink)', borderRadius: '20px', padding: '22px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 20px rgba(242,188,204,0.25)', marginBottom: '12px' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'linear-gradient(135deg, var(--pink-light) 0%, var(--blue-light) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', flexShrink: 0 }}>📋</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brown)', marginBottom: '4px' }}>Start cycle count</div>
              <div style={{ fontSize: '13px', color: 'var(--gray-400)', lineHeight: '1.4' }}>Count by zone — all 4 locations side by side</div>
            </div>
            <div style={{ fontSize: '22px', color: 'var(--pink)' }}>›</div>
          </button>
        )}

        <button onClick={onViewHistory} style={{ width: '100%', background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', textAlign: 'left', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>🕓</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>Previous sessions</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Browse the last 10 completed reports</div>
          </div>
          <div style={{ fontSize: '18px', color: 'var(--gray-400)' }}>›</div>
        </button>

        <button onClick={onLogAdjustment} style={{ width: '100%', background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', textAlign: 'left', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>💔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>Log damage / tester</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Mid-month adjustment — updates Shopify automatically</div>
          </div>
          <div style={{ fontSize: '18px', color: 'var(--gray-400)' }}>›</div>
        </button>

        <button onClick={onQuickAdjust} style={{ width: '100%', background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', textAlign: 'left', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>🔧</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>Quick stock adjust</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Add or remove units on the spot — like a stock take correction</div>
          </div>
          <div style={{ fontSize: '18px', color: 'var(--gray-400)' }}>›</div>
        </button>

        <button onClick={onViewMonthlyReport} style={{ width: '100%', background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', textAlign: 'left', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown)' }}>Monthly shrink report</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Starting/ending units, variance, shrink cost & value</div>
          </div>
          <div style={{ fontSize: '18px', color: 'var(--gray-400)' }}>›</div>
        </button>

        <div style={{ background: '#fff', border: 'var(--border)', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>Connected to Shopify · 4 Jellyland locations</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{loggedInUser?.name ? `Signed in as ${loggedInUser.name}` : ''}</div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--gray-400)', padding: '0', cursor: 'pointer' }}>← Sign out</button>
        </div>
      </div>
    </div>
  )
}
