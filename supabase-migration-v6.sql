-- Run this in your Supabase SQL Editor on the EXISTING database (additive, safe to re-run)
--
-- Two independent additions, both from the Aug 29 Slack thread with Roxy/Blakeli/Lauren:
--
-- 1) staff_users — replaces the single shared PIN_JELLYLAND login with individual
--    named logins (name + 4-digit PIN), so adjustments can be attributed to a
--    real person instead of a free-text "logged_by" field nobody reliably
--    filled in. Kept deliberately simple (identity only, no roles/permissions)
--    per Junaid's call — everyone who logs in can still do everything the
--    shared PIN could do. Seeded below with the initial team.
--
--    There's no in-app admin UI for this on purpose (out of scope for now).
--    See the insert/update examples after the seed block below to add/retire
--    someone later.
--
-- 2) quick_adjustments — Roxy's "stock take" ask: a general +/- correction on
--    any SKU (add stock back, remove stock) that isn't a damage/tester/other
--    shrink event and shouldn't count toward the shrink report's damage/tester
--    totals. Kept in its own table (not `adjustments`) precisely so it stays
--    out of that rollup, with its own sync-to-Shopify and its own report,
--    exactly as requested.

create table if not exists staff_users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  pin         text not null,        -- 4-digit PIN, unique among active staff
  active      boolean default true,
  created_at  timestamptz default now()
);

create unique index if not exists staff_users_active_pin_idx
  on staff_users(pin) where active = true;

-- Seed the initial team (Aug 29 2026 request). Login now asks for both name
-- and PIN, so these are matched on name (case-insensitive) + pin together —
-- safe to re-run, won't duplicate on a second run.
insert into staff_users (name, pin)
select v.name, v.pin from (values
  ('Junaid',    '9274'),
  ('Roxy',      '4769'),
  ('April',     '1122'),
  ('Lauren',    '6600'),
  ('Lirizeth',  '9281'),
  ('Andre',     '3281')
) as v(name, pin)
where not exists (
  select 1 from staff_users su where su.active and lower(su.name) = lower(v.name)
);

-- To add someone later or retire a PIN, run directly:
--   insert into staff_users (name, pin) values ('New Person', '1234');
--   update staff_users set active = false where lower(name) = lower('Some Former Staff');
-- Login still falls back to the old shared PIN_JELLYLAND env var (using whatever
-- name was typed) if no staff_users row matches, so nothing breaks if this
-- table is ever empty or someone's row gets deactivated by mistake.

create table if not exists quick_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  product_id          text not null,
  variant_id          text,
  inventory_item_id   text,
  product_name        text not null,
  sku                 text,
  category             text,
  location_id         text not null,
  location_name       text,
  qty                 integer not null,     -- signed delta: positive = add stock, negative = remove
  note                text,
  logged_by_user_id   uuid references staff_users(id),
  logged_by           text,                 -- resolved name at time of entry (survives user being deactivated later)
  synced_to_shopify   boolean default false,
  shopify_synced_at   timestamptz,
  sync_error          text,
  created_at          timestamptz default now()
);

create index if not exists quick_adjustments_created_at_idx on quick_adjustments(created_at);
create index if not exists quick_adjustments_product_idx     on quick_adjustments(product_id, location_id);
