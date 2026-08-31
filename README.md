# Jellyland Inventory Control

Internal cycle-count, inventory-adjustment and shrink-report app for the
[Jellyland](https://jellylandusa.com/) Shopify store.

## What changed for Jellyland

This version is configured for the JellyLand Shopify store and reads its live
Shopify Admin API catalog and inventory:

- **Storefront:** `jellylandusa.com`
- **Products:** all non-archived Shopify products
- **Variants:** all variants returned by Shopify
- **Collections:** all Shopify collections are fetched and exposed by the API
- **Inventory:** current available inventory is fetched for every active/inactive
  Shopify location returned by the store
- **Locations:** no store-specific location IDs are hard-coded; locations come directly
  from Shopify
- **Product grouping:** the count screen groups products by Shopify
  `productType`, with an Uncategorized fallback
- **Prices:** current variant prices come from Shopify
- **Inventory adjustments:** continue to use Shopify inventory adjustment
  mutations
- **Monthly reports:** use the live Shopify locations/catalog

## Shopify connection

The Admin API requires an access token with the scopes used by the app,
including inventory read/write access for the inventory features.

Set:

```env
VITE_SHOPIFY_STORE=your-jellyland-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
```

`VITE_SHOPIFY_STORE` is the Shopify Admin API shop domain. The public storefront
domain remains `jellylandusa.com`.

The project includes a standalone Shopify OAuth authorization-code flow. For
local setup, use `vercel dev` and set this Shopify app redirect URI:

`http://localhost:3000/api/shopify-oauth`

Then open `/api/shopify-oauth?shop=YOUR-STORE.myshopify.com`. Shopify returns to
the same endpoint with a one-time authorization code after the HMAC and OAuth
state checks pass. Exchange that code with:

```bash
node scripts/exchange-shopify-code.mjs APP_KEY APP_SECRET CODE
```

Store the resulting `SHOPIFY_ACCESS_TOKEN` only in Vercel environment variables.
Never commit the client secret, authorization code, or access token.

## Supabase

The existing Supabase schema/migrations remain in place for:

- completed cycle-count sessions
- individual product/location counts
- shrink-report rows and reasons
- damage/tester adjustments
- quick stock adjustments
- staff PIN logins
- inventory snapshots used by monthly reporting

Required environment variables are documented in `.env.example`.

## Local development

For the frontend only:

```bash
npm install
npm run dev
```

For the full app including `/api` serverless functions and the OAuth callback:

```bash
npx vercel dev
```

The local OAuth redirect is `http://localhost:3000/api/shopify-oauth`.

## Important architecture note

The browser never talks directly to the Shopify Admin API. It calls the Vercel
API endpoints, which use `SHOPIFY_ACCESS_TOKEN` server-side. This keeps the
Admin API token out of the client bundle.

The product endpoint is deliberately live rather than seeded with a copied
catalog, so newly created Jellyland products, variants, collections and
locations are picked up without another code conversion.
