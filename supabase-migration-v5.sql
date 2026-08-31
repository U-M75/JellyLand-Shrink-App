-- Run this in your Supabase SQL Editor on the EXISTING database (additive, safe to re-run)

-- 1. Price on `counts` -------------------------------------------------------------
-- The Full Count Log PDF added a Price column, but `counts` never stored price —
-- only `product_price`/live in-memory data had it, so a report generated straight
-- after counting showed prices fine, while any report reopened later from
-- Session History (which reloads from this table) showed "—" for every row.
-- Storing it at save time makes historical reports show real prices too.
alter table counts add column if not exists price numeric(10,2);

-- NOTE: sessions saved before this migration will still show "—" for Price on
-- Session History — the number was never captured for those rows, and there's
-- no reliable way to know what it was at count time. Only sessions saved after
-- this migration + the app update will have it.

-- 2. Category on `adjustments` -----------------------------------------------------
-- Lets the damages/tester log be filtered by product category ("that category"),
-- which is how Lauren/Lirizeth think about it (matches the cycle-count zones).
alter table adjustments add column if not exists category text;

create index if not exists adjustments_category_idx on adjustments(category);
