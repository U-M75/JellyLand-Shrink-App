-- Run this in your Supabase SQL Editor on the EXISTING database (additive, safe to re-run)
-- Adds the `adjustments` table: replaces the separate "Stock Take" app for mid-month
-- damages/testers/misc inventory adjustments. Lauren's team logs these directly in
-- this app instead, which (a) gives us the SKU-level Damages/Testers columns Roxy
-- wants in the monthly shrink report, and (b) can push the same adjustment straight
-- into Shopify inventory (via inventoryAdjustQuantities, same pattern as sync), so
-- there's no separate reconciliation step and Lauren never needs direct Shopify
-- product/inventory access.

create table if not exists adjustments (
  id                  uuid primary key default gen_random_uuid(),
  product_id          text not null,
  variant_id          text,
  inventory_item_id   text,
  product_name        text not null,
  sku                 text,
  location_id         text not null,
  location_name       text,
  adjustment_type     text not null,        -- 'damage' | 'tester' | 'other'
  qty                 integer not null,     -- always a positive count of units removed
  note                text,                 -- mandatory when adjustment_type = 'other'
  logged_by           text,                 -- free-text name (shared PIN can't identify who)
  cost_at_time        numeric(10,2),        -- COGS snapshot, for Shrink Cost rollup
  price_at_time       numeric(10,2),        -- MSRP snapshot, for Shrink Value rollup
  synced_to_shopify   boolean default false,
  shopify_synced_at   timestamptz,
  sync_error          text,                 -- last Shopify push error, if any (for retry UI)
  created_at          timestamptz default now()
);

create index if not exists adjustments_created_at_idx on adjustments(created_at);
create index if not exists adjustments_product_idx     on adjustments(product_id, location_id);
create index if not exists adjustments_type_idx        on adjustments(adjustment_type);

-- NOTE ON MONTHLY ROLLUP:
-- The Jellyland/Jellyland monthly shrink report's "Total Items Damaged" and
-- "Total Items Testers" columns are just: for a given product_id + month,
--   sum(qty) where adjustment_type = 'damage'   -> Total Items Damaged
--   sum(qty) where adjustment_type = 'tester'    -> Total Items Testers
-- api/adjustments.js exposes a `?rollup=1&from=&to=` GET mode that returns
-- exactly this, grouped by product_id, so the external report generator
-- (or a future /api/monthly-shrink-report) can just join against it by SKU.
