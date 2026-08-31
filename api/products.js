// api/products.js
// Jellyland Inventory Control product feed.
//
// This endpoint intentionally has NO hard-coded Jellyland collections, products,
// or store locations. It reads the live Shopify Admin API catalog, collections,
// locations, variants and inventory so the app follows the merchant's current
// Shopify setup automatically.

import { adminUrl, getShopDomain, getShopifyLocations, shopifyGraphQL } from './shopify-config.js'

const TOKEN_ENV = 'SHOPIFY_ACCESS_TOKEN'

const PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        status
        productType
        vendor
        tags
        featuredImage { url }
        variants(first: 250) {
          nodes {
            id
            title
            sku
            price
            image { url }
            inventoryItem { id }
          }
        }
      }
    }
  }
`

const COLLECTIONS_QUERY = `
  query getCollections($cursor: String) {
    collections(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        productsCount { count }
      }
    }
  }
`

async function getAllProducts(token) {
  const rows = []
  let cursor = null
  let hasNextPage = true
  while (hasNextPage) {
    const data = await shopifyGraphQL(token, PRODUCTS_QUERY, { cursor })
    const conn = data.products
    if (!conn) break
    rows.push(...(conn.nodes || []))
    hasNextPage = conn.pageInfo.hasNextPage
    cursor = conn.pageInfo.endCursor
  }
  return rows.filter(p => p.status !== 'ARCHIVED')
}

async function getAllCollections(token) {
  const rows = []
  let cursor = null
  let hasNextPage = true
  while (hasNextPage) {
    const data = await shopifyGraphQL(token, COLLECTIONS_QUERY, { cursor })
    const conn = data.collections
    if (!conn) break
    rows.push(...(conn.nodes || []))
    hasNextPage = conn.pageInfo.hasNextPage
    cursor = conn.pageInfo.endCursor
  }
  return rows
}

async function getInventory(token, variants, locations) {
  const store = getShopDomain()
  const inventoryMap = {}
  const itemIds = [...new Set(variants.map(v => v.inventory_item_id).filter(Boolean))]
  const locationIds = locations.map(l => l.id).join(',')
  if (!store || !itemIds.length || !locationIds) return inventoryMap

  const BATCH = 50
  await Promise.all(Array.from({ length: Math.ceil(itemIds.length / BATCH) }, async (_, index) => {
    const batch = itemIds.slice(index * BATCH, (index + 1) * BATCH)
    try {
      const resp = await fetch(
        adminUrl(`/inventory_levels.json?inventory_item_ids=${batch.join(',')}&location_ids=${locationIds}&limit=250`),
        { headers: { 'X-Shopify-Access-Token': token } }
      )
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      for (const level of data.inventory_levels || []) {
        if (!inventoryMap[level.inventory_item_id]) inventoryMap[level.inventory_item_id] = {}
        inventoryMap[level.inventory_item_id][level.location_id] = level.available ?? 0
      }
    } catch (err) {
      console.error('Inventory batch failed:', err)
    }
  }))
  return inventoryMap
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = process.env[TOKEN_ENV]
  if (!getShopDomain() || !token) {
    return res.status(500).json({ error: 'Shopify credentials not configured' })
  }

  try {
    const [products, collections, locations] = await Promise.all([
      getAllProducts(token),
      getAllCollections(token),
      getShopifyLocations(token),
    ])

    const variants = []
    for (const product of products) {
      for (const variant of product.variants?.nodes || []) {
        if (!variant?.id || !variant?.inventoryItem?.id) continue
        variants.push({
          product,
          variant,
          product_id: product.id.split('/').pop(),
          variant_id: variant.id.split('/').pop(),
          inventory_item_id: variant.inventoryItem.id.split('/').pop(),
        })
      }
    }

    const inventoryMap = await getInventory(token, variants, locations)

    // The existing app calls these "categories". For Jellyland they now mirror
    // Shopify product types instead of Jellyland-specific pick-list zones.
    const categories = {}
    for (const { product, variant, product_id, variant_id, inventory_item_id } of variants) {
      const category = (product.productType || 'Uncategorized').trim() || 'Uncategorized'
      if (!categories[category]) categories[category] = []

      const locInv = inventoryMap[inventory_item_id] || {}
      const locationStock = locations.map(loc => ({
        id: loc.id,
        label: loc.label,
        qty: locInv[loc.id] ?? 0,
      }))

      const image = variant.image?.url || product.featuredImage?.url || null
      const thumb = image ? image.replace(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i, '_small.$1') : null
      const hasMultipleVariants = (product.variants?.nodes?.length || 0) > 1

      categories[category].push({
        product_id: String(product_id),
        variant_id: String(variant_id),
        inventory_item_id,
        product_name: hasMultipleVariants && variant.title !== 'Default Title'
          ? `${product.title} — ${variant.title}`
          : product.title,
        sku: variant.sku || '',
        price: parseFloat(variant.price || 0),
        status: product.status,
        vendor: product.vendor || '',
        tags: product.tags || [],
        product_type: product.productType || '',
        locationStock,
        thumb,
        image,
        category,
      })
    }

    Object.keys(categories).forEach(name => {
      categories[name].sort((a, b) => a.product_name.localeCompare(b.product_name))
    })

    const orderedCategories = {}
    Object.keys(categories).sort((a, b) => a.localeCompare(b)).forEach(name => {
      orderedCategories[name] = categories[name]
    })

    return res.status(200).json({
      store: JELLYLAND_DOMAIN,
      collections: collections.map(c => ({
        id: c.id.split('/').pop(),
        title: c.title,
        handle: c.handle,
        product_count: c.productsCount?.count ?? null,
      })),
      categories: orderedCategories,
      locations,
      productCount: products.length,
      variantCount: variants.length,
    })
  } catch (err) {
    console.error('Jellyland products API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
