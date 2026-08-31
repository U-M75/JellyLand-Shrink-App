// Shared token accessor. OAuth is completed once during app setup; the resulting
// Admin API access token is stored server-side as SHOPIFY_ACCESS_TOKEN.
export function getShopifyToken() {
  const token = (process.env.SHOPIFY_ACCESS_TOKEN || '').trim()
  if (!token) throw new Error('SHOPIFY_ACCESS_TOKEN is not configured')
  return token
}
