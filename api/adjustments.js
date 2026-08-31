// api/adjustments.js
// Replaces the separate "Stock Take" app for mid-month damages/testers/misc
// adjustments. POST logs the adjustment AND pushes it to Shopify inventory in
// the same request (same inventoryAdjustQuantities delta pattern as
// api/shopify-sync.js), so Lauren never needs direct Shopify inventory access
// and there's no separate reconciliation step at cycle-count time.
//
// The Shopify push is best-effort but NOT silent: if it fails, the adjustment
// row is still saved (synced_to_shopify: false, sync_error set) so nothing is
// lost, and the frontend can show a "retry sync" action instead of the
// adjustment just vanishing. This is different from the Slack auto-post
// pattern elsewhere in the app, which is fire-and-forget — inventory accuracy
// is the whole point here, so failures need to stay visible.

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function shopifyGraphQL(store, token, query, variables = {}) {
  const resp = await fetch(`https://${store}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(`Shopify HTTP ${resp.status}: ${JSON.stringify(json)}`)
  if (json.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`)
  return json.data
}

const ADJUST_MUTATION = `
  mutation adjustQuantities($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      inventoryAdjustmentGroup { createdAt reason }
      userErrors { field message }
    }
  }
`

// Shopify's own adjustment reasons — 'damaged' exists natively; testers use
// 'safety_stock' (Roxy's call — no built-in "tester" reason exists, and
// 'safety_stock' reads more clearly in Shopify's inventory history than the
// generic 'correction' this originally shipped with).
//
// ADJUSTABLE: if that ever needs to change again, this is the only place —
// Shopify's full reason list (as of API 2025-10) is: correction,
// cycle_count_available, damaged, movement_created, movement_updated,
// movement_received, movement_canceled, other, promotion, quality_control,
// received, reservation_created, reservation_deleted, reservation_updated,
// restock, safety_stock, shrinkage.
const SHOPIFY_REASON = { damage: 'damaged', tester: 'safety_stock', other: 'correction' }

const VALID_TYPES = new Set(['damage', 'tester', 'other'])

async function pushToShopify({ store, token, inventory_item_id, location_id, qty, adjustment_type }) {
  if (!inventory_item_id || !location_id) return { synced: false, error: 'Missing inventory_item_id or location_id' }
  try {
    const data = await shopifyGraphQL(store, token, ADJUST_MUTATION, {
      input: {
        reason: SHOPIFY_REASON[adjustment_type] || 'correction',
        name: 'available',
        changes: [{
          inventoryItemId: `gid://shopify/InventoryItem/${inventory_item_id}`,
          locationId: `gid://shopify/Location/${location_id}`,
          delta: -Math.abs(qty), // adjustments always remove stock
        }],
      },
    })
    const userErrors = data.inventoryAdjustQuantities?.userErrors || []
    if (userErrors.length > 0) return { synced: false, error: userErrors.map(e => e.message).join('; ') }
    return { synced: true, error: null }
  } catch (err) {
    return { synced: false, error: err.message }
  }
}

export default async function handler(req, res) {
  const supabase = getSupabase()
  const store = process.env.VITE_SHOPIFY_STORE
  const token = process.env.SHOPIFY_ACCESS_TOKEN

  // ── POST — log a new adjustment, then try to push it to Shopify ─────────
  if (req.method === 'POST') {
    const {
      product_id, variant_id, inventory_item_id, product_name, sku, category,
      location_id, location_name, adjustment_type, qty, note, logged_by,
      cost_at_time, price_at_time,
    } = req.body

    if (!product_id || !location_id || !adjustment_type || !qty) {
      return res.status(400).json({ error: 'product_id, location_id, adjustment_type, and qty are required' })
    }
    if (!VALID_TYPES.has(adjustment_type)) {
      return res.status(400).json({ error: `adjustment_type must be one of: ${[...VALID_TYPES].join(', ')}` })
    }
    if (adjustment_type === 'other' && !(note || '').trim()) {
      return res.status(400).json({ error: 'note is required when adjustment_type is "other"' })
    }
    if (qty <= 0) {
      return res.status(400).json({ error: 'qty must be a positive number of units' })
    }

    let syncResult = { synced: false, error: 'Shopify credentials not configured' }
    if (store && token) {
      syncResult = await pushToShopify({ store, token, inventory_item_id, location_id, qty, adjustment_type })
    }

    try {
      const { data, error } = await supabase.from('adjustments').insert({
        product_id, variant_id, inventory_item_id, product_name, sku, category,
        location_id, location_name, adjustment_type, qty,
        note: note || null, logged_by: logged_by || null,
        cost_at_time: cost_at_time ?? null, price_at_time: price_at_time ?? null,
        synced_to_shopify: syncResult.synced,
        shopify_synced_at: syncResult.synced ? new Date().toISOString() : null,
        sync_error: syncResult.error || null,
      }).select().single()

      if (error) throw error
      return res.status(200).json({ success: true, adjustment: data, shopifySynced: syncResult.synced, shopifyError: syncResult.error })
    } catch (err) {
      console.error('Save adjustment error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── PATCH — retry a failed Shopify sync for one adjustment ──────────────
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id is required' })
    if (!store || !token) return res.status(500).json({ error: 'Shopify credentials not configured' })

    try {
      const { data: row, error: fetchErr } = await supabase.from('adjustments').select('*').eq('id', id).single()
      if (fetchErr) throw fetchErr
      if (row.synced_to_shopify) return res.status(200).json({ success: true, message: 'Already synced' })

      const syncResult = await pushToShopify({
        store, token,
        inventory_item_id: row.inventory_item_id, location_id: row.location_id,
        qty: row.qty, adjustment_type: row.adjustment_type,
      })

      const { data: updated, error: updateErr } = await supabase.from('adjustments').update({
        synced_to_shopify: syncResult.synced,
        shopify_synced_at: syncResult.synced ? new Date().toISOString() : null,
        sync_error: syncResult.error || null,
      }).eq('id', id).select().single()
      if (updateErr) throw updateErr

      return res.status(200).json({ success: syncResult.synced, adjustment: updated, shopifyError: syncResult.error })
    } catch (err) {
      console.error('Retry sync error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── GET — list recent adjustments, OR return a per-product monthly rollup ─
  if (req.method === 'GET') {
    const { from, to, rollup, locationId, category, limit } = req.query

    let query = supabase.from('adjustments').select('*').order('created_at', { ascending: false })
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)
    if (locationId && locationId !== 'ALL') query = query.eq('location_id', locationId)
    if (category && category !== 'ALL') query = query.eq('category', category)
    if (!rollup) query = query.limit(limit ? parseInt(limit, 10) : 100)

    try {
      const { data, error } = await query
      if (error) throw error

      if (!rollup) return res.status(200).json({ adjustments: data })

      // rollup=1: collapse to one row per product_id with damage/tester/other
      // totals — this is exactly the "Total Items Damaged" / "Total Items
      // Testers" pair the monthly shrink report needs, joinable by SKU.
      const byProduct = {}
      for (const row of data) {
        const key = row.product_id
        if (!byProduct[key]) {
          byProduct[key] = {
            product_id: row.product_id, sku: row.sku, product_name: row.product_name,
            total_damaged: 0, total_tester: 0, total_other: 0,
            damaged_cost: 0, tester_cost: 0, damaged_value: 0, tester_value: 0,
          }
        }
        const b = byProduct[key]
        const cost = row.cost_at_time || 0
        const price = row.price_at_time || 0
        if (row.adjustment_type === 'damage') { b.total_damaged += row.qty; b.damaged_cost += row.qty * cost; b.damaged_value += row.qty * price }
        else if (row.adjustment_type === 'tester') { b.total_tester += row.qty; b.tester_cost += row.qty * cost; b.tester_value += row.qty * price }
        else { b.total_other += row.qty }
      }
      return res.status(200).json({ rollup: Object.values(byProduct), from: from || null, to: to || null })
    } catch (err) {
      console.error('List adjustments error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
