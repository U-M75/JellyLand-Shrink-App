// Returns all Shopify locations using the same live Admin GraphQL configuration
// as the product/inventory endpoint.
import { getShopifyLocations } from './shopify-config.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!token) return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN is not configured' })

  try {
    const locations = await getShopifyLocations(token)
    return res.status(200).json({ locations })
  } catch (err) {
    console.error('Locations error:', err)
    return res.status(500).json({ error: err.message })
  }
}
