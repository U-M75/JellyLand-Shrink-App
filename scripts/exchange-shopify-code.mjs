#!/usr/bin/env node

const [,, clientId, clientSecret, code] = process.argv

if (!clientId || !clientSecret || !code) {
  console.error('Usage: node scripts/exchange-shopify-code.mjs APP_KEY APP_SECRET CODE')
  process.exit(1)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const shop = process.env.SHOPIFY_STORE?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
  fail('Set SHOPIFY_STORE to your *.myshopify.com domain before running the command.')
}

const body = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  code,
})

const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
})

const text = await response.text()
let data
try { data = JSON.parse(text) } catch { data = { raw: text } }

if (!response.ok || !data.access_token) {
  console.error('Shopify token exchange failed:')
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log('\nAccess token obtained successfully.\n')
console.log(`SHOPIFY_ACCESS_TOKEN=${data.access_token}`)
if (data.expires_in) console.log(`expires_in=${data.expires_in}`)
if (data.scope) console.log(`scope=${data.scope}`)
console.log('\nCopy only the SHOPIFY_ACCESS_TOKEN value into your Vercel environment variables.\n')
