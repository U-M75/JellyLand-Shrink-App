// api/snapshot-inventory.js
// Meant to be hit by cron-job.org at 00:00 on the 1st of every month (same
// external-cron pattern used everywhere else in Jellyland's stack). Shopify has no
// "what was inventory on this past date" API, so this is the only way to get
// a real "Starting Inventory" number for the monthly shrink report — it has
// to be captured going forward, not reconstructed after the fact.
//
// Mirrors the product/inventory fetch in api/products.js (live Shopify catalog,
// GraphQL for products+variants, REST for inventory levels to stay under the
// GraphQL query-cost cap) but only stores qty per (inventory_item_id,
// location_id) — no zone classification needed here.

import { createClient } from '@supabase/supabase-js'
import { getShopDomain, getShopifyLocations, shopifyGraphQL, adminUrl } from './shopify-config.js'


function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

const PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title status
        variants(first: 250) {
          nodes { id sku inventoryItem { id } }
        }
      }
    }
  }
`

export default async function handler(req, res) {
  // Allow either a scheduled GET (cron-job.org) or a manual POST (retry/backfill).
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const store = getShopDomain()
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!store || !token) return res.status(500).json({ error: 'Shopify credentials not configured' })

  // Snapshot date: defaults to today (truncated to the 1st isn't forced — if
  // this ever needs to run for a specific past/backfill date, pass ?date=YYYY-MM-DD).
  const snapshotDate = req.query?.date || new Date().toISOString().slice(0, 10)

  const restHeaders = { 'X-Shopify-Access-Token': token }

  try {
    const locations = await getShopifyLocations(token)
    let allProducts = []
    let cursor = null
    let hasNextPage = true
    while (hasNextPage) {
      const data = await shopifyGraphQL(token, PRODUCTS_QUERY, { cursor })
      const products = data.products
      if (!products) break
      allProducts = allProducts.concat(products.nodes || [])
      hasNextPage = products.pageInfo.hasNextPage
      cursor = products.pageInfo.endCursor
    }
    allProducts = allProducts.filter(p => p.status !== 'ARCHIVED')

    const allVariants = []
    allProducts.forEach(product => {
      ;(product.variants?.nodes || []).forEach(variant => {
        if (!variant?.id || !variant?.inventoryItem?.id) return
        allVariants.push({
          product_id: product.id.split('/').pop(),
          variant_id: variant.id.split('/').pop(),
          inventory_item_id: variant.inventoryItem.id.split('/').pop(),
          sku: variant.sku || '',
          product_name: product.title,
        })
      })
    })

    const BATCH = 50
    const locationIds = locations.map(l => l.id).join(',')
    const inventoryMap = {}
    const batches = []
    for (let i = 0; i < allVariants.length; i += BATCH) batches.push(allVariants.slice(i, i + BATCH))

    await Promise.all(batches.map(async batch => {
      const itemIds = batch.map(v => v.inventory_item_id).join(',')
      const resp = await fetch(
        adminUrl(`/inventory_levels.json?inventory_item_ids=${itemIds}&location_ids=${locationIds}&limit=250`),
        { headers: restHeaders }
      )
      if (!resp.ok) return
      const data = await resp.json()
      ;(data.inventory_levels || []).forEach(level => {
        if (!inventoryMap[level.inventory_item_id]) inventoryMap[level.inventory_item_id] = {}
        inventoryMap[level.inventory_item_id][level.location_id] = level.available || 0
      })
    }))

    const rows = []
    allVariants.forEach(v => {
      const locInv = inventoryMap[v.inventory_item_id] || {}
      locations.forEach(loc => {
        rows.push({
          snapshot_date: snapshotDate,
          product_id: v.product_id,
          variant_id: v.variant_id,
          inventory_item_id: v.inventory_item_id,
          sku: v.sku,
          product_name: v.product_name,
          location_id: loc.id,
          location_name: loc.label,
          qty: locInv[loc.id] ?? 0,
        })
      })
    })

    const supabase = getSupabase()
    // upsert on the (snapshot_date, inventory_item_id, location_id) unique index —
    // safe to re-run the same day without creating duplicate rows.
    const CHUNK = 500
    let written = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('inventory_snapshots')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'snapshot_date,inventory_item_id,location_id' })
      if (error) throw error
      written += rows.slice(i, i + CHUNK).length
    }

    return res.status(200).json({ success: true, snapshotDate, productsSnapshotted: allVariants.length, rowsWritten: written })
  } catch (err) {
    console.error('Snapshot inventory error:', err)
    return res.status(500).json({ error: err.message })
  }
}
