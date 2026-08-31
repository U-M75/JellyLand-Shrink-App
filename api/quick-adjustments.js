// api/quick-adjustments.js
// Roxy's "stock take" ask: a general +/- correction on any SKU — add stock
// back, remove stock — that behaves like a manual stock take adjustment
// rather than a shrink event. Deliberately a separate table from
// `adjustments` (damage/tester/other) so it never pollutes the shrink
// report's damage/tester totals, and gets its own report + sync-retry flow.
//
// Unlike `adjustments` (qty is always positive, always subtracted), qty here
// is a signed delta: positive adds stock, negative removes it — pushed to
// Shopify as-is via the same inventoryAdjustQuantities pattern.

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function shopifyGraphQL(store, token, query, variables = {}) {
  const resp = await fetch(`https://${store}/admin/api/2026-07/graphql.json`, {
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

async function pushToShopify({ store, token, inventory_item_id, location_id, qty }) {
  if (!inventory_item_id || !location_id) return { synced: false, error: 'Missing inventory_item_id or location_id' }
  try {
    const data = await shopifyGraphQL(store, token, ADJUST_MUTATION, {
      input: {
        reason: 'correction',
        name: 'available',
        changes: [{
          inventoryItemId: `gid://shopify/InventoryItem/${inventory_item_id}`,
          locationId: `gid://shopify/Location/${location_id}`,
          delta: qty, // signed — positive adds, negative removes
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

  // ── POST — log a new quick adjustment, then try to push it to Shopify ───
  if (req.method === 'POST') {
    const {
      product_id, variant_id, inventory_item_id, product_name, sku, category,
      location_id, location_name, qty, note, logged_by_user_id, logged_by,
    } = req.body

    if (!product_id || !location_id || qty === undefined || qty === null) {
      return res.status(400).json({ error: 'product_id, location_id, and qty are required' })
    }
    const qtyNum = Number(qty)
    if (!Number.isInteger(qtyNum) || qtyNum === 0) {
      return res.status(400).json({ error: 'qty must be a nonzero whole number (positive to add, negative to remove)' })
    }

    let syncResult = { synced: false, error: 'Shopify credentials not configured' }
    if (store && token) {
      syncResult = await pushToShopify({ store, token, inventory_item_id, location_id, qty: qtyNum })
    }

    try {
      const { data, error } = await supabase.from('quick_adjustments').insert({
        product_id, variant_id, inventory_item_id, product_name, sku, category,
        location_id, location_name, qty: qtyNum,
        note: note || null,
        logged_by_user_id: logged_by_user_id || null,
        logged_by: logged_by || null,
        synced_to_shopify: syncResult.synced,
        shopify_synced_at: syncResult.synced ? new Date().toISOString() : null,
        sync_error: syncResult.error || null,
      }).select().single()

      if (error) throw error
      return res.status(200).json({ success: true, adjustment: data, shopifySynced: syncResult.synced, shopifyError: syncResult.error })
    } catch (err) {
      console.error('Save quick adjustment error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── PATCH — retry a failed Shopify sync for one adjustment ──────────────
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id is required' })
    if (!store || !token) return res.status(500).json({ error: 'Shopify credentials not configured' })

    try {
      const { data: row, error: fetchErr } = await supabase.from('quick_adjustments').select('*').eq('id', id).single()
      if (fetchErr) throw fetchErr
      if (row.synced_to_shopify) return res.status(200).json({ success: true, message: 'Already synced' })

      const syncResult = await pushToShopify({
        store, token,
        inventory_item_id: row.inventory_item_id, location_id: row.location_id, qty: row.qty,
      })

      const { data: updated, error: updateErr } = await supabase.from('quick_adjustments').update({
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

  // ── GET — list recent quick adjustments, OR a per-product net rollup ────
  if (req.method === 'GET') {
    const { from, to, rollup, locationId, category, limit } = req.query

    let query = supabase.from('quick_adjustments').select('*').order('created_at', { ascending: false })
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)
    if (locationId && locationId !== 'ALL') query = query.eq('location_id', locationId)
    if (category && category !== 'ALL') query = query.eq('category', category)
    if (!rollup) query = query.limit(limit ? parseInt(limit, 10) : 100)

    try {
      const { data, error } = await query
      if (error) throw error

      if (!rollup) return res.status(200).json({ adjustments: data })

      // rollup=1: collapse to one row per product_id — net qty change, plus
      // how much of that was added vs. removed, for the Quick Adjust report.
      const byProduct = {}
      for (const row of data) {
        const key = row.product_id
        if (!byProduct[key]) {
          byProduct[key] = {
            product_id: row.product_id, sku: row.sku, product_name: row.product_name,
            net_qty: 0, total_added: 0, total_removed: 0, entry_count: 0,
          }
        }
        const b = byProduct[key]
        b.net_qty += row.qty
        b.entry_count += 1
        if (row.qty > 0) b.total_added += row.qty
        else b.total_removed += Math.abs(row.qty)
      }
      return res.status(200).json({ rollup: Object.values(byProduct), from: from || null, to: to || null })
    } catch (err) {
      console.error('List quick adjustments error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
