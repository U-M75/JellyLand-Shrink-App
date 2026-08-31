// api/shopify-sync.js
// Pushes counted variances to Shopify as a manual inventory ADJUSTMENT (delta),
// not an overwrite — exactly like doing it by hand in Shopify admin. A variance
// of -1 sends a delta of -1; a variance of +2 sends a delta of +2. This means
// any sales that happened between the physical count and this sync are naturally
// preserved (we're not setting an absolute number that could stomp on them).
//
// Requires SHOPIFY_ACCESS_TOKEN (same var as the rest of the app) to include the
// write_inventory scope. If the current token only has read scopes, this will
// fail with a Shopify permission error — see README for how to add the scope
// via the Partner Dashboard OAuth flow (JellyLand app), same pattern used for the
// other Jellyland automations.

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

const BATCH_SIZE = 100

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const store = process.env.VITE_SHOPIFY_STORE
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!store || !token) return res.status(500).json({ error: 'Shopify credentials not configured' })

  // items: [{ inventory_item_id, variance }], variance already = counted - shopify
  const { sessionId, locationId, locationLabel, items } = req.body
  if (!locationId || !Array.isArray(items)) {
    return res.status(400).json({ error: 'locationId and items are required' })
  }

  // Skip zero-variance rows — nothing to adjust.
  const changes = items
    .filter(i => i.variance !== 0 && i.inventory_item_id)
    .map(i => ({
      inventoryItemId: `gid://shopify/InventoryItem/${i.inventory_item_id}`,
      locationId: `gid://shopify/Location/${locationId}`,
      delta: i.variance,
    }))

  if (changes.length === 0) {
    return res.status(200).json({ success: true, adjusted: 0, message: 'No variances to sync for this location.' })
  }

  try {
    const batches = []
    for (let i = 0; i < changes.length; i += BATCH_SIZE) batches.push(changes.slice(i, i + BATCH_SIZE))

    let adjusted = 0
    const errors = []

    for (const batch of batches) {
      const data = await shopifyGraphQL(store, token, ADJUST_MUTATION, {
        input: {
          reason: 'correction',
          name: 'available',
          changes: batch,
        },
      })
      const userErrors = data.inventoryAdjustQuantities?.userErrors || []
      if (userErrors.length > 0) errors.push(...userErrors)
      else adjusted += batch.length
    }

    // Mark this location as synced for this session so the button can show
    // "already synced" instead of letting someone double-adjust by accident.
    if (sessionId && errors.length === 0) {
      try {
        const supabase = getSupabase()
        const { data: sessionRow } = await supabase.from('sessions').select('synced_locations').eq('id', sessionId).single()
        const existing = new Set(sessionRow?.synced_locations || [])
        existing.add(locationId)
        await supabase.from('sessions').update({ synced_locations: [...existing] }).eq('id', sessionId)
      } catch (e) { console.error('Failed to record sync status:', e) }
    }

    if (errors.length > 0) {
      return res.status(207).json({ success: false, adjusted, errors, message: `${errors.length} item(s) failed to sync.` })
    }

    return res.status(200).json({ success: true, adjusted, location: locationLabel })
  } catch (err) {
    console.error('Shopify sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}
