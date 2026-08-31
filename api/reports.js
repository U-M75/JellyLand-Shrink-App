// api/reports.js
// Save completed shrink reports, list recent sessions, and fetch one session's detail
// (optionally scoped to a single location) from Supabase.

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )
}

// Supabase/PostgREST caps every read at a default of 1000 rows per request.
// A combined "All Locations" session (264 products x 4 locations = 1056 rows)
// blows past that silently — no error, just a truncated result — which is
// exactly why old reports started showing "1000 counted" instead of the real
// 1056. This pages through in chunks of 1000 and concatenates everything.
// Takes a factory (not a query itself) because a Supabase query builder can't
// be re-awaited after its first execution — each page needs a fresh one.
async function fetchAllRows(queryFactory) {
  const PAGE_SIZE = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export default async function handler(req, res) {
  const supabase = getSupabase()

  // ── POST — save a completed report ──────────────────────────────────────
  if (req.method === 'POST') {
    const { session, counts, shrinkRows } = req.body

    try {
      let sessionData, sessionErr
      ;({ data: sessionData, error: sessionErr } = await supabase
        .from('sessions')
        .insert({
          location: session.location,
          started_at: session.startedAt,
          completed_at: new Date().toISOString(),
          status: 'completed',
          counted_by_user_id: session.countedByUserId || null,
          counted_by: session.countedBy || null,
        })
        .select()
        .single())

      // counted_by/counted_by_user_id come from supabase-migration-v7.sql —
      // if it hasn't been run yet, Postgres errors with "column does not
      // exist" (42703). Rather than fail the whole report over that, retry
      // once without those two fields so saving still works; attribution
      // just won't show up until the migration is applied.
      if (sessionErr && sessionErr.code === '42703') {
        ;({ data: sessionData, error: sessionErr } = await supabase
          .from('sessions')
          .insert({
            location: session.location,
            started_at: session.startedAt,
            completed_at: new Date().toISOString(),
            status: 'completed',
          })
          .select()
          .single())
      }

      if (sessionErr) throw sessionErr
      const sessionId = sessionData.id

      // Each entry in `counts` / `shrinkRows` already carries its own `.location`
      // object (see App.jsx getCountedProducts / buildVariances) — we just persist
      // it now instead of dropping it on the floor like before.
      const countRows = counts.map(c => ({
        session_id: sessionId,
        product_id: c.product_id,
        variant_id: c.variant_id,
        product_name: c.product_name,
        sku: c.sku,
        category: c.category,
        shopify_qty: c.shopify_qty,
        counted_qty: c.counted_qty,
        variance: c.counted_qty - c.shopify_qty,
        price: c.price ?? null,
        location_id: c.location?.id || null,
        location_name: c.location?.label || null,
        inventory_item_id: c.inventory_item_id || null,
      }))

      const { error: countsErr } = await supabase.from('counts').insert(countRows)
      if (countsErr) throw countsErr

      if (shrinkRows.length > 0) {
        const reportRows = shrinkRows.map(r => ({
          session_id: sessionId,
          product_id: r.product_id,
          product_name: r.product_name,
          sku: r.sku,
          category: r.category,
          shopify_qty: r.shopify_qty,
          counted_qty: r.counted_qty,
          variance: r.counted_qty - r.shopify_qty,
          reason: r.reason,
          estimated_value: r.price ? Math.abs(r.counted_qty - r.shopify_qty) * r.price : null,
          location_id: r.location?.id || null,
          location_name: r.location?.label || null,
          inventory_item_id: r.inventory_item_id || null,
        }))

        const { error: reportErr } = await supabase.from('shrink_reports').insert(reportRows)
        if (reportErr) throw reportErr
      }

      return res.status(200).json({ success: true, sessionId })

    } catch (err) {
      console.error('Save report error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── GET — list recent sessions, OR fetch one session's full detail ────────
  if (req.method === 'GET') {
    const { sessionId, locationId } = req.query

    // Single-session detail (item #4 + #6): full counts + shrink_reports for
    // that session, optionally narrowed to one location.
    if (sessionId) {
      try {
        const { data: sessionRow, error: sessErr } = await supabase
          .from('sessions').select('*').eq('id', sessionId).single()
        if (sessErr) throw sessErr

        let counts, shrinkRows
        try {
          counts = await fetchAllRows(() => {
            let q = supabase.from('counts').select('*').eq('session_id', sessionId)
            if (locationId && locationId !== 'ALL') q = q.eq('location_id', locationId)
            return q
          })
          shrinkRows = await fetchAllRows(() => {
            let q = supabase.from('shrink_reports').select('*').eq('session_id', sessionId)
            if (locationId && locationId !== 'ALL') q = q.eq('location_id', locationId)
            return q
          })
        } catch (err) {
          return res.status(500).json({ error: err.message })
        }

        // Distinct locations actually present in this session's data, so the
        // frontend can offer a location picker without guessing. Paginated
        // too — same 1000-row cap applies here.
        const locRows = await fetchAllRows(() =>
          supabase.from('counts').select('location_id, location_name').eq('session_id', sessionId)
        )
        const locationsInSession = Object.values(
          (locRows || []).reduce((acc, r) => {
            if (r.location_id) acc[r.location_id] = { id: r.location_id, label: r.location_name }
            return acc
          }, {})
        )

        return res.status(200).json({ session: sessionRow, counts, shrinkRows, locationsInSession })
      } catch (err) {
        return res.status(500).json({ error: err.message })
      }
    }

    // Recent sessions list (item #4) — just enough for the dropdown.
    // select('*') on purpose: if supabase-migration-v2.sql hasn't been run yet,
    // naming synced_locations explicitly would 500 the whole list instead of
    // just missing that one field.
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('completed_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return res.status(200).json({
        sessions: (data || []).map(s => ({ ...s, synced_locations: s.synced_locations || [] })),
      })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
