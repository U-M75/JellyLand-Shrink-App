// api/auth.js — per-person name + PIN login (staff_users table), falling
// back to the old single shared PIN (PIN_JELLYLAND) if no staff_users row
// matches both the name and PIN. This means nothing breaks for anyone
// before staff_users has been seeded — the shared PIN keeps working, using
// whatever name was typed as the identity (since there's no row to confirm
// it against).
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { name, pin } = req.body
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name required' })
  if (!pin) return res.status(400).json({ error: 'PIN required' })
  const trimmedName = String(name).trim()
  const trimmedPin = String(pin).trim()

  try {
    const supabase = getSupabase()
    const { data: user, error } = await supabase
      .from('staff_users')
      .select('id, name')
      .ilike('name', trimmedName)
      .eq('pin', trimmedPin)
      .eq('active', true)
      .maybeSingle()
    if (error) throw error
    if (user) return res.status(200).json({ success: true, user })
  } catch (err) {
    // staff_users may not exist yet (pre-migration) — fall through to legacy PIN
    console.error('staff_users lookup failed, falling back to shared PIN:', err.message)
  }

  const validPin = String(process.env.PIN_JELLYLAND || '').trim()
  if (validPin && trimmedPin === validPin) {
    return res.status(200).json({ success: true, user: { id: null, name: trimmedName } })
  }

  return res.status(401).json({ error: 'Invalid name or PIN' })
}
