// Shopify OAuth authorization-code flow for the JellyLand standalone app.
//
// Start the flow:
//   GET /api/shopify-oauth?shop=YOUR-STORE.myshopify.com
//
// Shopify redirects back to the same endpoint with ?code=...&state=...&hmac=...
// The callback validates HMAC + state and displays the one-time authorization
// code. The code is intentionally NOT exchanged here; use the helper command
// in scripts/exchange-shopify-code.mjs so the client secret never reaches the
// browser.

import crypto from 'node:crypto'

const DEFAULT_SCOPES = [
  'read_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
]

function getClientId() {
  return (process.env.SHOPIFY_CLIENT_ID || '').trim()
}

function getClientSecret() {
  return (process.env.SHOPIFY_CLIENT_SECRET || '').trim()
}

function getRedirectUri(req) {
  if (process.env.SHOPIFY_OAUTH_REDIRECT_URI) {
    return process.env.SHOPIFY_OAUTH_REDIRECT_URI.trim()
  }
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers.host || 'localhost:3000'
  return `${proto}://${host}/api/shopify-oauth`
}

function normalizeShop(shop) {
  return String(shop || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

function isValidShop(shop) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
}

function parseCookies(req) {
  const header = req.headers.cookie || ''
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=')
    if (index < 0) return ['', '']
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]
  }).filter(([key]) => key))
}

function buildHmacMessage(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pairs = []
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'hmac' || key === 'signature') continue
    pairs.push([key, value])
  }
  pairs.sort(([a], [b]) => a.localeCompare(b))
  return pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
}

function safeEqualHex(a, b) {
  if (!a || !b || !/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function verifyHmac(req, secret) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const supplied = url.searchParams.get('hmac') || ''
  const digest = crypto.createHmac('sha256', secret).update(buildHmacMessage(req)).digest('hex')
  return safeEqualHex(digest, supplied)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function sendPage(res, status, title, body) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.end(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:Inter,Arial,sans-serif;max-width:760px;margin:60px auto;padding:0 20px;line-height:1.5;color:#222}code,pre{background:#f4f4f4;padding:12px;border-radius:8px;display:block;overflow:auto}.ok{color:#167c3a}.err{color:#b42318}.warn{background:#fff8e1;padding:14px;border-radius:8px}</style></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const clientId = getClientId()
  const clientSecret = getClientSecret()
  const redirectUri = getRedirectUri(req)
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required for OAuth.' })
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const code = url.searchParams.get('code')
  const shop = normalizeShop(url.searchParams.get('shop'))
  const state = url.searchParams.get('state')

  // Callback branch.
  if (code || state || url.searchParams.get('hmac')) {
    if (!shop || !isValidShop(shop)) {
      return sendPage(res, 400, 'Invalid Shopify shop', '<p class="err">The shop parameter is missing or is not a valid *.myshopify.com domain.</p>')
    }
    if (!verifyHmac(req, clientSecret)) {
      return sendPage(res, 400, 'OAuth verification failed', '<p class="err">Shopify HMAC verification failed. Do not use the returned code.</p>')
    }

    const cookies = parseCookies(req)
    if (!state || !cookies.shopify_oauth_state || state !== cookies.shopify_oauth_state) {
      return sendPage(res, 400, 'OAuth state mismatch', '<p class="err">The OAuth state check failed. Start the authorization flow again.</p>')
    }

    res.setHeader('Set-Cookie', 'shopify_oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax')

    const command = `node scripts/exchange-shopify-code.mjs YOUR_APP_KEY YOUR_APP_SECRET ${code}`
    return sendPage(res, 200, 'Shopify authorization code received', `
      <p class="ok"><strong>Success.</strong> Shopify returned a valid authorization code for <strong>${escapeHtml(shop)}</strong>.</p>
      <p class="warn"><strong>Important:</strong> this code is single-use. Do not commit it or put it in GitHub.</p>
      <p>Run this from the project root:</p>
      <pre>${escapeHtml(command)}</pre>
      <p>Replace <code>YOUR_APP_KEY</code> and <code>YOUR_APP_SECRET</code> with the credentials from Shopify. The command prints the access token; put that token in Vercel as <code>SHOPIFY_ACCESS_TOKEN</code>.</p>
    `)
  }

  // Start branch.
  const requestedShop = normalizeShop(url.searchParams.get('shop') || process.env.VITE_SHOPIFY_STORE || process.env.SHOPIFY_STORE)
  if (!requestedShop || !isValidShop(requestedShop)) {
    return sendPage(res, 400, 'Shopify shop required', '<p>Open this endpoint with <code>?shop=YOUR-STORE.myshopify.com</code>.</p>')
  }

  const configuredShop = normalizeShop(process.env.VITE_SHOPIFY_STORE || process.env.SHOPIFY_STORE)
  if (configuredShop && requestedShop !== configuredShop) {
    return sendPage(res, 400, 'Wrong Shopify shop', `<p class="err">This app is configured for <strong>${escapeHtml(configuredShop)}</strong>, not <strong>${escapeHtml(requestedShop)}</strong>.</p>`)
  }

  const oauthState = crypto.randomBytes(32).toString('hex')
  const scopes = (process.env.SHOPIFY_OAUTH_SCOPES || DEFAULT_SCOPES.join(','))
    .split(',').map(s => s.trim()).filter(Boolean).join(',')

  const authorize = new URL(`https://${requestedShop}/admin/oauth/authorize`)
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('scope', scopes)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('state', oauthState)

  const secure = String(redirectUri).startsWith('https://') ? '; Secure' : ''
  res.setHeader('Set-Cookie', `shopify_oauth_state=${encodeURIComponent(oauthState)}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${secure}`)
  return res.redirect(302, authorize.toString())
}
