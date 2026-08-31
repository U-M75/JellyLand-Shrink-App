-- Run this in your Supabase SQL Editor on the EXISTING database (additive, safe to re-run)
-- Adds `inventory_snapshots`: a monthly snapshot of Shopify inventory per product
-- per location, taken at midnight on the 1st of each month. This is what makes
-- "Starting Inventory" in the monthly shrink report possible — Shopify itself
-- has no historical inventory API, so we have to capture the number ourselves,
-- on a schedule, before it changes.

create table if not exists inventory_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  snapshot_date      date not null,          -- always the 1st of a month
  product_id         text not null,
  variant_id         text,
  inventory_item_id  text,
  sku                text,
  product_name       text not null,
  location_id        text not null,
  location_name      text,
  qty                integer not null,       -- Shopify "available" at snapshot time
  created_at         timestamptz default now()
);

create unique index if not exists inventory_snapshots_unique
  on inventory_snapshots(snapshot_date, inventory_item_id, location_id);

create index if not exists inventory_snapshots_date_idx on inventory_snapshots(snapshot_date);
create index if not exists inventory_snapshots_product_idx on inventory_snapshots(product_id, location_id);
