// api/shopify-config.js
// Shared Shopify configuration helpers for Jellyland Inventory Control.
// The public storefront is jellylandusa.com; the Admin API host should be the
// shop's *.myshopify.com domain returned by Shopify OAuth. Keep the latter in
// VITE_SHOPIFY_STORE (or SHOPIFY_STORE) once the app is connected.

export const SHOPIFY_API_VERSION = '2026-07'
export const JELLYLAND_DOMAIN = 'jellylandusa.com'

export function getShopDomain() {
  return (process.env.VITE_SHOPIFY_STORE || process.env.SHOPIFY_STORE || '').trim()
}

export function adminUrl(path) {
  const store = getShopDomain()
  if (!store) throw new Error('Shopify store domain is not configured')
  return `https://${store.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/admin/api/${SHOPIFY_API_VERSION}${path}`
}

export async function shopifyGraphQL(token, query, variables = {}) {
  const resp = await fetch(adminUrl('/graphql.json'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!resp.ok) throw new Error(`Shopify HTTP ${resp.status}: ${await resp.text()}`)
  const json = await resp.json()
  if (json.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`)
  return json.data
}

export async function getShopifyLocations(token) {
  const locations = []
  let cursor = null
  let hasNextPage = true
  while (hasNextPage) {
    const data = await shopifyGraphQL(token, `
      query getLocations($cursor: String) {
        locations(first: 250, after: $cursor, includeInactive: true) {
          pageInfo { hasNextPage endCursor }
          nodes { id name isActive }
        }
      }
    `, { cursor })
    const conn = data.locations
    if (!conn) break
    locations.push(...(conn.nodes || []))
    hasNextPage = conn.pageInfo.hasNextPage
    cursor = conn.pageInfo.endCursor
  }
  return locations.map(l => ({
    id: l.id.split('/').pop(),
    label: l.name,
    short: l.name,
    isActive: l.isActive,
  }))
}
