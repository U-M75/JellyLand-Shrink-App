// src/screens/Login.jsx
import { useState } from 'react'

export default function Login({ onLogin }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleDigit(idx, val) {
    if (!/^\d?$/.test(val)) return
    const next = [...pin]
    next[idx] = val
    setPin(next)
    setError('')
    if (val && idx < 3) document.getElementById(`pin-${idx + 1}`)?.focus()
    if (val && idx === 3) { const full = next.join(''); if (full.length === 4) submit(full) }
  }

  function handleKeyDown(idx, e) {
    if (e.key === 'Backspace') {
      if (pin[idx]) { const n = [...pin]; n[idx] = ''; setPin(n) }
      else if (idx > 0) document.getElementById(`pin-${idx - 1}`)?.focus()
    }
  }

  async function submit(fullPin) {
    const p = fullPin || pin.join('')
    if (!name.trim()) { setError('Enter your name'); return }
    if (p.length < 4) { setError('Enter your 4-digit PIN'); return }
    setLoading(true)
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pin: p }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error === 'Name required' ? 'Enter your name' : 'Incorrect name or PIN — try again')
        setPin(['', '', '', ''])
        setTimeout(() => document.getElementById('pin-0')?.focus(), 50)
      } else onLogin(data.user || null)
    } catch { setError('Network error — check connection') }
    finally { setLoading(false) }
  }

  const filled = pin.join('').length

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #FDF0F4 0%, #F7D4DF 60%, #E8F6F9 100%)',
      padding: '24px',
    }}>
      <img src="/jellyland-logo.svg" alt="Jellyland" style={{ width: '110px', height: '110px', objectFit: 'contain', marginBottom: '16px', filter: 'drop-shadow(0 4px 16px rgba(107,63,42,0.15))' }} />
      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--brown)', marginBottom: '4px' }}>Jellyland</div>
      <div style={{ fontSize: '13px', color: 'var(--brown-light)', marginBottom: '32px' }}>Jellyland Cycle Count</div>

      <div style={{ background: '#fff', borderRadius: '24px', boxShadow: '0 8px 40px rgba(107,63,42,0.10)', border: '1.5px solid rgba(242,188,204,0.6)', padding: '32px 28px', width: '100%', maxWidth: '320px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown-light)', marginBottom: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Your name</div>
        <input
          type="text" value={name} onChange={e => { setName(e.target.value); setError('') }}
          placeholder="e.g. Your name" autoComplete="off"
          onKeyDown={e => { if (e.key === 'Enter') document.getElementById('pin-0')?.focus() }}
          style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${error && !name.trim() ? 'var(--red)' : 'var(--gray-200)'}`, borderRadius: '12px', fontSize: '15px', fontWeight: '600', color: 'var(--brown)', outline: 'none', marginBottom: '22px', boxSizing: 'border-box', background: 'var(--gray-50)' }}
        />

        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--brown-light)', textAlign: 'center', marginBottom: '14px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Enter PIN</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }}>
          {pin.map((d, i) => (
            <input key={i} id={`pin-${i}`} type="tel" inputMode="numeric" maxLength={1} value={d}
              onChange={e => handleDigit(i, e.target.value)} onKeyDown={e => handleKeyDown(i, e)}
              autoComplete="off"
              style={{ width: '58px', height: '66px', background: d ? 'var(--pink-light)' : 'var(--gray-50)', border: `2px solid ${error ? 'var(--red)' : d ? 'var(--pink)' : 'var(--gray-200)'}`, borderRadius: '16px', fontSize: '28px', fontWeight: '700', textAlign: 'center', color: 'var(--brown)', outline: 'none', transition: 'all 0.15s', caretColor: 'var(--brown)', WebkitTextSecurity: d ? 'disc' : 'none' }}
            />
          ))}
        </div>
        <button onClick={() => submit()} disabled={loading || filled < 4 || !name.trim()}
          style={{ width: '100%', padding: '15px', background: filled === 4 && name.trim() && !loading ? 'linear-gradient(135deg, var(--pink) 0%, #E88FAA 100%)' : 'var(--gray-200)', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '700', color: filled === 4 && name.trim() ? 'var(--brown)' : 'var(--gray-400)', cursor: filled === 4 && name.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: filled === 4 && name.trim() ? '0 4px 16px rgba(242,188,204,0.5)' : 'none' }}>
          {loading ? 'Checking…' : 'Enter →'}
        </button>
        {error && <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--red)', textAlign: 'center', background: 'var(--red-light)', borderRadius: '10px', padding: '9px 14px', fontWeight: '500' }}>{error}</div>}
      </div>
      <div style={{ marginTop: '20px', fontSize: '12px', color: 'var(--brown-light)', opacity: 0.6 }}>Contact your manager if you forgot your PIN</div>
    </div>
  )
}
