// api/monthly-shrink-report.js
// Assembles the monthly report Roxy asked for: Starting Inventory, Total Qty
// Sent, Total Items Damaged/Tester, Net Items Sold, Expected Ending Units —
// per product, for a given month. Four different data sources feed this,
// none of which live in one place in Shopify:
//   - Starting Inventory  <- inventory_snapshots (api/snapshot-inventory.js)
//   - Total Qty Sent      <- Shopify's inventoryTransfers GraphQL query
//   - Damaged / Tester    <- adjustments (api/adjustments.js)
//   - Net Items Sold      <- Shopify orders (DTD + DCA), adapted from
//     Jellyland restock reports/utils/shopify.js's getUnitsSoldByLocation — same
//     proven query and location-matching logic, re-keyed by product_id
//     instead of display-name string. See getNetItemsSoldByProduct below for
//     the two deliberate differences from the original.
//
// IMPORTANT — one thing still worth a sanity check before relying on this in
// production: `totalQuantity` on InventoryTransferLineItem reflects the full
// line-item quantity on the transfer regardless of shipment/receiving status.
// If Jellyland ever creates a transfer, then edits it down before shipping, this
// will report the latest total, not "what was true at cutoffDate." For a
// once-a-month reconciliation this is very unlikely to matter, but if numbers
// look off for a given month, that's the first thing to check.


import { createClient } from '@supabase/supabase-js'
import { getShopDomain, getShopifyLocations, shopifyGraphQL, adminUrl } from './shopify-config.js'

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}


// Requires the SHOPIFY_ACCESS_TOKEN's app to have the `read_inventory_transfers`
// scope added (Partner Dashboard -> Jellyland Inventory Control -> Configuration ->
// API access scopes) — same OAuth re-auth flow documented in the README for
// adding write_inventory. Not needed for anything else in this app.
// NOTE: `totalQuantity` on InventoryTransferLineItem is confirmed against
// Shopify's schema (fields are totalQuantity / processableQuantity /
// shippableQuantity / shippedQuantity — there's no "plannedQuantity"). It's
// the full line-item quantity on the transfer regardless of shipment status,
// i.e. "how much did we say we're sending," which is what Total Qty Sent
// means. No comments live inside the query string below on purpose — a
// GraphQL query is sent over the wire as plain text, and any stray
// non-ASCII character (an em dash, a curly quote) risks getting mangled in
// transit and breaking the parse, which is exactly what caused this query to
// fail with a PARSE_ERROR the first time around.
const TRANSFERS_QUERY = `
  query getTransfers($cursor: String, $query: String) {
    inventoryTransfers(first: 50, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        dateCreated
        status
        origin { location { id } }
        destination { location { id } }
        lineItems(first: 100) {
          nodes {
            inventoryItem { id }
            totalQuantity
          }
        }
      }
    }
  }
`

// Adapted from Jellyland restock reports/utils/shopify.js's getUnitsSoldByLocation
// — same orders query, same financial_status:paid + created_at filter, same
// physicalLocation/fulfillment location-matching logic (all already proven
// in production across the daily/weekly/monthly restock reports). Two
// deliberate differences for this use case:
//   1. Keyed by product_id (item.product.id, already in the query) instead
//      of a "Title - Variant Title" display-name string. product_id is what
//      the rest of this file merges on, and it can't collide the way two
//      differently-worded titles for the same product theoretically could.
//   2. Sums across BOTH DTD and DCA Festival (Jellyland's two point-of-sale
//      kiosks) into one number, rather than the restock reports' per-location
//      breakdown — Roxy's spreadsheet asks for one "Net Items Sold" per
//      product per month, not split by location. Not asked to also exclude
//      Overstock/Warehouse sales specifically, but those two locations are
//      backroom storage, not point-of-sale, so this only ever queries DTD +
//      DCA — worth flagging to Roxy if that assumption is wrong.
// Uses the CALENDAR MONTH (monthStart to nextMonthStart), not a rolling
// 30-day window like the restock reports use — this is a monthly
// reconciliation report, not a rolling demand forecast.
const NET_SOLD_QUERY = `
  query getOrders($cursor: String, $query: String!) {
    orders(first: 250, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        physicalLocation { id }
        fulfillments(first: 5) { location { id } }
        lineItems(first: 100) {
          nodes {
            quantity
            product { id status }
          }
        }
      }
    }
  }
`

async function getNetItemsSoldByProduct({ store, token, monthStart, nextMonthStart, locationIds }) {
  const gqlQuery = `created_at:>='${monthStart}' created_at:<'${nextMonthStart}' financial_status:paid`

  const totals = {} // product_id -> qty
  let ordersScanned = 0
  let cursor = null
  let hasNextPage = true
  while (hasNextPage) {
    const data = await shopifyGraphQL(token, NET_SOLD_QUERY, { cursor, query: gqlQuery })
    const conn = data.orders
    if (!conn) break
    for (const order of conn.nodes || []) {
      const orderLocationId = order.physicalLocation?.id || ''
      const fulfillmentLocationId = order.fulfillments?.[0]?.location?.id || ''
      const isAtJellylandLocation = locationIds.some(id => orderLocationId.includes(id) || fulfillmentLocationId.includes(id))
      if (!isAtJellylandLocation) continue
      ordersScanned += 1
      for (const item of order.lineItems?.nodes || []) {
        if (item.product?.status === 'ARCHIVED') continue
        const pid = item.product?.id?.split('/').pop()
        if (!pid) continue
        totals[pid] = (totals[pid] || 0) + (item.quantity || 0)
      }
    }
    hasNextPage = conn.pageInfo.hasNextPage
    cursor = conn.pageInfo.endCursor
  }
  return { totals, ordersScanned }
}

async function getQtySentByInventoryItem({ store, token, monthStart, cutoffDate, debug, locations }) {
  // Only transfers destined for a Jellyland location, created within the month,
  // and created before the cycle-count cutoff — per Roxy's rule: never count
  // a transfer sent after cycle count started.
  //
  // The destination_id OR-clause is explicitly parenthesized. Without the
  // parens, "A OR B OR C AND date>=X AND date<=Y" risks AND binding tighter
  // than OR (common in this kind of search grammar), which would silently
  // apply the date filter to only the last location and return the WRONG
  // total_qty_sent with no error at all — worse than a crash, since nothing
  // would flag it. Grouping removes the ambiguity instead of relying on
  // precedence rules that haven't been confirmed against a live store.
  //
  // destination_id's documented type is `id` (Shopify's search-syntax filter
  // type used for id ranges, e.g. `id:1234`, `id:>=1234`) — NOT a full GID
  // string. A first version of this filter used
  // `gid://shopify/Location/<id>` here, which is the most likely reason
  // transfersScanned came back 0 with no error on a live run — the query
  // still parses fine either way, so a wrong ID format fails silently
  // instead of erroring. Not yet confirmed against a known real transfer;
  // verify this returns a nonzero transfersScanned once you know for sure a
  // transfer happened in the tested date range.
  const destinationClause = locations.map(l => `destination_id:${l.id}`).join(' OR ')
  const gqlQuery = `(${destinationClause}) AND created_at:>=${monthStart} AND created_at:<=${cutoffDate}`

  // Per Roxy: Warehouse is a waystation, not a point of sale — corporate
  // ships stock IN to Warehouse, and it's later moved internally from
  // Warehouse to the kiosks (DTD/DCA). Shopify's InventoryTransfer object
  // has both an origin AND a destination location, and internal
  // relocations between two of our own tracked locations use the exact same
  // object type as a genuine external shipment — so the destination-only
  // filter above would count a single physical unit TWICE: once landing at
  // Warehouse (origin: corporate, destination: Warehouse), again moving to
  // DTD (origin: Warehouse, destination: DTD).
  //
  // Fix: only count a transfer toward Total Qty Sent if its ORIGIN is NOT
  // one of the 4 tracked Jellyland locations — i.e. only genuine new inflow
  // into the complex, regardless of which of the 4 locations it happens to
  // land in first. A transfer with no origin at all (Shopify now allows
  // creating transfers without one) is treated as external inflow too,
  // since "no known origin" can't be an internal reshuffle between
  // locations we're tracking.
  //
  // This is deliberately NOT "only count Warehouse -> DTD/DCA transfers" —
  // that narrower rule would silently drop stock that arrives straight at
  // a kiosk from corporate (no Warehouse hop), AND stock that arrives at
  // Warehouse/Overstock and simply hasn't moved to a kiosk yet within the
  // same month — both of which are real inflow that Starting Inventory
  // next month would otherwise show up as an unexplained overage.
  const trackedLocationIds = new Set(locations.map(l => l.id))

  const totals = {} // inventory_item_id -> qty
  let transfersScanned = 0
  let internalTransfersExcluded = 0
  // Only populated when debug=true — raw per-transfer/per-line data so the
  // totalQuantity assumption can be checked line-by-line against what
  // Shopify admin's Transfers page actually shows, instead of trusting an
  // aggregate number that already proved wrong once (see file history: real
  // transfers for DISJellylandBRASHO_1044 totaled ~1200 units, this endpoint
  // reported 4800 — exactly 4x, which points at totalQuantity meaning
  // something other than "units sent" for at least some transfers).
  const rawTransfers = []
  let cursor = null
  let hasNextPage = true
  while (hasNextPage) {
    const data = await shopifyGraphQL(token, TRANSFERS_QUERY, { cursor, query: gqlQuery })
    const conn = data.inventoryTransfers
    if (!conn) break
    for (const t of conn.nodes || []) {
      transfersScanned += 1
      const originLocationId = t.origin?.location?.id?.split('/').pop() || null
      const isInternalReshuffle = originLocationId && trackedLocationIds.has(originLocationId)
      const lineItemsOut = []
      for (const li of t.lineItems?.nodes || []) {
        const itemId = li.inventoryItem?.id?.split('/').pop()
        if (!itemId) continue
        if (!isInternalReshuffle) totals[itemId] = (totals[itemId] || 0) + (li.totalQuantity || 0)
        if (debug) lineItemsOut.push({ inventory_item_id: itemId, totalQuantity: li.totalQuantity })
      }
      if (isInternalReshuffle) internalTransfersExcluded += 1
      if (debug) {
        rawTransfers.push({
          id: t.id, dateCreated: t.dateCreated, status: t.status,
          originLocationId, destinationLocationId: t.destination?.location?.id,
          excludedAsInternal: isInternalReshuffle, lineItems: lineItemsOut,
        })
      }
    }
    hasNextPage = conn.pageInfo.hasNextPage
    cursor = conn.pageInfo.endCursor
  }
  return { totals, transfersScanned, internalTransfersExcluded, rawTransfers }
}


// Supabase/PostgREST caps every read at 1000 rows/request (same cap
// documented in api/reports.js). A month with a big combined cycle-count
// session or a lot of adjustments can exceed that silently, so anything
// that could plausibly cross 1000 rows pages through in chunks.
async function fetchAllRows(supabase, table, buildQuery) {
  const PAGE_SIZE = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(supabase.from(table)).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

// Actual Ending Units — pulled from Lauren's cycle count (the `sessions` +
// `counts` tables the cycle-count app already writes to), rather than a new
// data source. Only COMPLETED sessions that finished within this calendar
// month count — an in-progress or abandoned session shouldn't silently feed
// the monthly report.
//
// If Lauren (or anyone) recounts the same location twice in one month, the
// LATER session wins per location — "Actual Ending Units" means "what was
// physically on the shelf as of month end," not "the first count someone
// happened to save." Recency is compared on `sessions.completed_at`, which
// sorts correctly as plain ISO-8601 strings without needing Date parsing.
//
// Notes are sourced from `shrink_reports.reason` for the exact same sessions
// — the reason Lauren's team already typed in for each variance travels
// with the number instead of Roxy having to cross-reference the cycle-count
// app separately.
async function getActualEndingUnitsByProduct({ supabase, monthStart, nextMonthStart }) {
  const { data: sessionRows, error: sessErr } = await supabase
    .from('sessions').select('id, completed_at')
    .eq('status', 'completed')
    .gte('completed_at', monthStart)
    .lt('completed_at', nextMonthStart)
  if (sessErr) throw sessErr
  if (!sessionRows || sessionRows.length === 0) {
    return { totals: {}, notes: {}, sessionCount: 0 }
  }

  const sessionIds = sessionRows.map(s => s.id)
  const completedAtBySession = Object.fromEntries(sessionRows.map(s => [s.id, s.completed_at]))

  const countRows = await fetchAllRows(supabase, 'counts', q =>
    q.select('product_id, location_id, counted_qty, session_id').in('session_id', sessionIds)
  )

  // Keep only the most-recently-completed session's count per (product,
  // location) pair, then sum across locations for one Actual Ending Units
  // number per product — same "sum across all tracked Jellyland locations" shape as
  // Starting Inventory below, just sourced from counts instead of snapshots.
  const latestByKey = {}
  for (const c of countRows) {
    if (c.counted_qty === null || c.counted_qty === undefined) continue
    const locKey = c.location_id || 'NOLOC'
    const key = `${c.product_id}__${locKey}`
    const completedAt = completedAtBySession[c.session_id]
    if (!latestByKey[key] || completedAt > latestByKey[key].completedAt) {
      latestByKey[key] = { qty: c.counted_qty, completedAt, sessionId: c.session_id }
    }
  }

  const totals = {}
  const sessionsUsed = new Set()
  for (const [key, v] of Object.entries(latestByKey)) {
    const productId = key.split('__')[0]
    totals[productId] = (totals[productId] || 0) + v.qty
    sessionsUsed.add(v.sessionId)
  }

  const shrinkReportRows = sessionsUsed.size
    ? await fetchAllRows(supabase, 'shrink_reports', q =>
        q.select('product_id, location_name, reason').in('session_id', [...sessionsUsed]))
    : []

  const notesLists = {}
  for (const r of shrinkReportRows) {
    if (!r.reason) continue
    const label = r.location_name ? `${r.location_name}: ${r.reason}` : r.reason
    if (!notesLists[r.product_id]) notesLists[r.product_id] = []
    if (!notesLists[r.product_id].includes(label)) notesLists[r.product_id].push(label)
  }
  const notes = {}
  for (const [pid, arr] of Object.entries(notesLists)) notes[pid] = arr.join('; ')

  return { totals, notes, sessionCount: sessionRows.length }
}

// Product cost (COGS) + price (MSRP), for Shrink Cost / Shrink Value. Same
// live Shopify catalog as api/products.js and api/snapshot-inventory.js, so any
// product visible to the cycle count is visible here too.
//
// IMPORTANT: `unitCost` is gated by the merchant's own "view product costs"
// staff permission in Shopify admin — separate from any API access scope.
// If that permission isn't granted to whichever staff account issued this
// app's token, Shopify returns unitCost: null for every variant (not an
// error), which is handled below by leaving cost: null per product — that
// flows through as "N/A" on Shrink Cost rather than breaking the report.
const COST_PRICE_QUERY = `
  query getCostPrice($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        status
        variants(first: 250) {
          nodes {
            price
            inventoryItem { unitCost { amount } }
          }
        }
      }
    }
  }
`

async function getProductCostAndPrice({ token }) {
  const byProduct = {}
  let cursor = null
  let hasNextPage = true
  while (hasNextPage) {
    const data = await shopifyGraphQL(token, COST_PRICE_QUERY, { cursor })
    const products = data.products
    if (!products) break
    for (const p of products.nodes || []) {
      if (p.status === 'ARCHIVED') continue
      const pid = p.id.split('/').pop()
      const first = (p.variants?.nodes || [])[0]
      if (!first) continue
      byProduct[pid] = {
        cost: first.inventoryItem?.unitCost?.amount != null ? parseFloat(first.inventoryItem.unitCost.amount) : null,
        price: first.price != null ? parseFloat(first.price) : null,
      }
    }
    hasNextPage = products.pageInfo.hasNextPage
    cursor = products.pageInfo.endCursor
  }
  return byProduct
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { month, cutoffDate, debug } = req.query // month = 'YYYY-MM', cutoffDate = 'YYYY-MM-DD' (the actual cycle-count date, since it moves around), debug=1 to get raw per-transfer line-item data instead of just the aggregate
  if (!month) return res.status(400).json({ error: 'month (YYYY-MM) is required' })

  const monthStart = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const nextMonthStart = new Date(y, m, 1).toISOString().slice(0, 10) // first of next month
  const effectiveCutoff = cutoffDate || nextMonthStart

  const store = getShopDomain()
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  const supabase = getSupabase()

  try {
    const locations = await getShopifyLocations(token)
    // 1. Starting Inventory — snapshot taken on the 1st of this month
    const { data: snapshotRows, error: snapErr } = await supabase
      .from('inventory_snapshots').select('*').eq('snapshot_date', monthStart)
    if (snapErr) throw snapErr

    // 2. Damaged / Tester totals for the month, from adjustments
    const { data: adjRows, error: adjErr } = await supabase
      .from('adjustments').select('*')
      .gte('created_at', monthStart).lt('created_at', nextMonthStart)
    if (adjErr) throw adjErr

    // 3. Total Qty Sent — Shopify inventoryTransfers, before the cycle-count cutoff
    let qtySentByItem = {}
    let transfersScanned = 0
    let internalTransfersExcluded = 0
    let rawTransfers = []
    let transfersError = null
    if (store && token) {
      try {
        const result = await getQtySentByInventoryItem({ store, token, monthStart, cutoffDate: effectiveCutoff, debug: !!debug, locations })
        qtySentByItem = result.totals
        transfersScanned = result.transfersScanned
        internalTransfersExcluded = result.internalTransfersExcluded
        rawTransfers = result.rawTransfers
      } catch (err) { transfersError = err.message }
    }

    // 4. Net Items Sold — Shopify orders, DTD + DCA Festival (Jellyland's two
    // point-of-sale kiosks), for the calendar month.
    let netSoldByProduct = {}
    let ordersScanned = 0
    let salesError = null
    if (store && token) {
      try {
        const result = await getNetItemsSoldByProduct({ store, token, monthStart, nextMonthStart, locationIds: locations.map(l => l.id) })
        netSoldByProduct = result.totals
        ordersScanned = result.ordersScanned
      } catch (err) { salesError = err.message }
    }

    // Merge everything by product_id (snapshot rows are per-location; sum
    // across all tracked Jellyland locations for a single per-product starting number,
    // matching how the spreadsheet asked for it — one row per SKU/month).
    //
    // BUG FIXED: total_qty_sent comes from qtySentByItem, which is already a
    // GLOBAL total per inventory_item_id summed across every Jellyland location
    // (Shopify's inventoryTransfers doesn't come back pre-split by location
    // the way inventory_snapshots does). snapshotRows has one row PER
    // LOCATION per product (4 rows for a product stocked everywhere), so the
    // old code below added that global total once per location row —
    // quadruple-counting it for anything stocked at all 4 locations. Caught
    // with real data: DISJellylandBRASHO_1044 has confirmed real transfers totaling
    // 1200 units, but the report showed 4800 = 1200 x 4. `seenItemsForQtySent`
    // ensures each inventory_item_id's global total is added exactly once
    // per product, no matter how many location rows that product has.
    const byProduct = {}
    const seenItemsForQtySent = new Set()
    for (const s of snapshotRows || []) {
      const k = s.product_id
      if (!byProduct[k]) byProduct[k] = { product_id: k, sku: s.sku, product_name: s.product_name, starting_inventory: 0, total_qty_sent: 0, total_damaged: 0, total_tester: 0 }
      byProduct[k].starting_inventory += s.qty
      if (s.inventory_item_id && !seenItemsForQtySent.has(s.inventory_item_id)) {
        byProduct[k].total_qty_sent += qtySentByItem[s.inventory_item_id] || 0
        seenItemsForQtySent.add(s.inventory_item_id)
      }
    }
    for (const a of adjRows || []) {
      const k = a.product_id
      if (!byProduct[k]) byProduct[k] = { product_id: k, sku: a.sku, product_name: a.product_name, starting_inventory: 0, total_qty_sent: 0, total_damaged: 0, total_tester: 0 }
      if (a.adjustment_type === 'damage') byProduct[k].total_damaged += a.qty
      if (a.adjustment_type === 'tester') byProduct[k].total_tester += a.qty
    }

    // Any product that sold this month but has no snapshot or adjustment row
    // (e.g. added to the live Shopify catalog mid-month, so it missed the 1st-of-
    // month snapshot) would otherwise vanish from `rows` entirely — its sales
    // are real but silently dropped rather than just showing as a zero. Add
    // a placeholder row for those so the sale is at least visible, flagged
    // via missingSnapshotProductIds so it's easy to spot in warnings.
    const missingSnapshotProductIds = []
    for (const pid of Object.keys(netSoldByProduct)) {
      if (!byProduct[pid]) {
        byProduct[pid] = { product_id: pid, sku: null, product_name: '(no snapshot/adjustment row — check if this product is new)', starting_inventory: 0, total_qty_sent: 0, total_damaged: 0, total_tester: 0 }
        missingSnapshotProductIds.push(pid)
      }
    }

    // 5. Actual Ending Units — Lauren's cycle count (`sessions` + `counts`),
    // for completed sessions that finished within this calendar month.
    let actualEndingByProduct = {}
    let notesByProduct = {}
    let actualUnitsError = null
    let cycleCountSessionsFound = 0
    try {
      const result = await getActualEndingUnitsByProduct({ supabase, monthStart, nextMonthStart })
      actualEndingByProduct = result.totals
      notesByProduct = result.notes
      cycleCountSessionsFound = result.sessionCount
    } catch (err) { actualUnitsError = err.message }

    // Same "don't silently drop it" treatment as missingSnapshotProductIds
    // above, for products that got counted this month but have no
    // snapshot/adjustment/sales row at all (e.g. a brand-new SKU counted for
    // the first time before it ever sold).
    for (const pid of Object.keys(actualEndingByProduct)) {
      if (!byProduct[pid]) {
        byProduct[pid] = { product_id: pid, sku: null, product_name: '(no snapshot/adjustment row — check if this product is new)', starting_inventory: 0, total_qty_sent: 0, total_damaged: 0, total_tester: 0 }
        if (!missingSnapshotProductIds.includes(pid)) missingSnapshotProductIds.push(pid)
      }
    }

    // 6. Product cost (COGS) / price (MSRP) — best-effort, feeds Shrink Cost
    // and Shrink Value. A failure here never blocks the rest of the report;
    // those two columns just show null ("N/A" on the frontend/PDF) instead.
    let costPriceByProduct = {}
    let costPriceError = null
    if (store && token) {
      try { costPriceByProduct = await getProductCostAndPrice({ token }) }
      catch (err) { costPriceError = err.message }
    }

    // Expected Ending Units, per Roxy's original spec: Starting + Sent -
    // Sold. Damaged/Tester stay as their own separate columns (not subtracted
    // here) — they're informational context on shrink causes, not part of
    // the expected-vs-actual variance math.
    //
    // Variance = Expected − Actual (book-vs-physical, the standard shrinkage
    // direction): positive means units are missing, negative means an
    // overage. Shrink % follows the same convention, expressed against
    // Expected Ending Units (the "book" number) — null/"N/A" whenever Actual
    // Ending Units isn't available yet (no cycle count this month) or
    // Expected is exactly 0 (nothing to take a percentage of).
    //
    // Shrink Cost / Shrink Value = Variance × unit cost/price. Signed on
    // purpose: a negative Shrink Cost on an overage row isn't a typo, it's
    // showing the dollar value of stock that showed up that wasn't expected.
    const missingActualUnitsProductIds = []
    const rows = Object.values(byProduct).map(r => {
      const net_items_sold = netSoldByProduct[r.product_id] ?? 0
      const expected_ending_units = r.starting_inventory + r.total_qty_sent - net_items_sold
      const hasActual = Object.prototype.hasOwnProperty.call(actualEndingByProduct, r.product_id)
      if (!hasActual) missingActualUnitsProductIds.push(r.product_id)
      const actual_ending_units = hasActual ? actualEndingByProduct[r.product_id] : null
      const variance = hasActual ? expected_ending_units - actual_ending_units : null
      const shrink_pct = (variance !== null && expected_ending_units !== 0) ? (variance / expected_ending_units * 100) : null
      const cp = costPriceByProduct[r.product_id] || {}
      const shrink_cost = (variance !== null && cp.cost != null) ? variance * cp.cost : null
      const shrink_value = (variance !== null && cp.price != null) ? variance * cp.price : null
      return {
        ...r,
        net_items_sold,
        expected_ending_units,
        actual_ending_units,
        variance,
        shrink_pct,
        shrink_cost,
        shrink_value,
        notes: notesByProduct[r.product_id] || null,
      }
    })

    return res.status(200).json({
      month, cutoffDate: effectiveCutoff, transfersScanned, internalTransfersExcluded, ordersScanned, cycleCountSessionsFound, rows,
      ...(debug ? { rawTransfers } : {}),
      warnings: [
        !snapshotRows?.length ? `No inventory_snapshots found for ${monthStart} — make sure api/snapshot-inventory.js has run.` : null,
        transfersError ? `Could not fetch Shopify transfers: ${transfersError}` : null,
        (!transfersError && transfersScanned === 0) ? `0 Shopify transfers matched the destination/date filter for ${monthStart}–${effectiveCutoff} — if you know transfers happened this month, double-check this before trusting total_qty_sent as zero.` : null,
        (!transfersError && internalTransfersExcluded > 0) ? `${internalTransfersExcluded} transfer(s) were excluded from Total Qty Sent as internal moves between two of all tracked Jellyland locations (e.g. Warehouse → DTD/DCA) — only genuine new inflow from outside the complex counts. Re-run with debug=1 to see which transfers were excluded, and confirm a couple by hand against Shopify's Transfers page.` : null,
        salesError ? `Could not fetch Shopify sales: ${salesError}` : null,
        (!salesError && ordersScanned === 0) ? `0 orders matched DTD/DCA for ${monthStart}–${nextMonthStart} — if you know sales happened this month, double-check this before trusting net_items_sold as zero (this exact silent-zero pattern already happened once with total_qty_sent).` : null,
        missingSnapshotProductIds.length ? `${missingSnapshotProductIds.length} product(s) had activity this month but no snapshot/adjustment row (product_ids: ${missingSnapshotProductIds.join(', ')}) — likely added to the live Shopify catalog after the 1st-of-month snapshot ran.` : null,
        actualUnitsError ? `Could not fetch Actual Ending Units from the cycle-count app: ${actualUnitsError}` : null,
        (!actualUnitsError && cycleCountSessionsFound === 0) ? `No completed cycle-count session finished between ${monthStart} and ${nextMonthStart} — Actual Ending Units, Variance, Shrink %, Shrink Cost, and Shrink Value will show as N/A until Lauren's count for this month is saved.` : null,
        (!actualUnitsError && cycleCountSessionsFound > 0 && missingActualUnitsProductIds.length) ? `${missingActualUnitsProductIds.length} product(s) had no matching cycle count this month (product_ids: ${missingActualUnitsProductIds.slice(0, 20).join(', ')}${missingActualUnitsProductIds.length > 20 ? ', …' : ''}) — Actual Ending Units/Variance/Shrink % shown as N/A for those.` : null,
        costPriceError ? `Could not fetch product cost/price from Shopify: ${costPriceError} — Shrink Cost/Shrink Value will show N/A.` : null,
      ].filter(Boolean),
    })
  } catch (err) {
    console.error('Monthly shrink report error:', err)
    return res.status(500).json({ error: err.message })
  }
}
