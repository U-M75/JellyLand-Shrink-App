-- Run this in your Supabase SQL Editor on the EXISTING database (additive, safe to re-run)
-- Adds per-location columns to counts/shrink_reports, inventory_item_id for Shopify sync,
-- and sync-tracking on sessions so we don't double-adjust inventory.

-- 1. Per-location columns (item #3) ------------------------------------------------
alter table counts          add column if not exists location_id   text;
alter table counts          add column if not exists location_name text;
alter table shrink_reports  add column if not exists location_id   text;
alter table shrink_reports  add column if not exists location_name text;

-- 2. inventory_item_id so historical sessions (loaded from the DB, not just the
--    live in-memory count) can still be synced to Shopify later (item #6) --------
alter table counts          add column if not exists inventory_item_id text;
alter table shrink_reports  add column if not exists inventory_item_id text;

-- 3. Track which locations of a session have already been pushed to Shopify,
--    so the "Sync to Shopify" button can warn/disable instead of double-adjusting.
alter table sessions add column if not exists synced_locations text[] default '{}';

-- 4. Indexes for the new "fetch by location" queries (item #4) --------------------
create index if not exists counts_location_idx         on counts(session_id, location_id);
create index if not exists shrink_reports_location_idx  on shrink_reports(session_id, location_id);

-- NOTE: existing rows saved before this migration will have location_id = NULL.
-- Those older sessions will still show up in the "recent sessions" list, but their
-- per-location breakdown/PDF will show everything under "Unknown location" and they
-- can't be re-synced to Shopify (no inventory_item_id on file). Only new sessions
-- saved after this migration + the app update get full location + sync support.
