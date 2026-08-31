-- Run this entire file in your Supabase SQL Editor (one time setup)

-- Sessions: one per cycle count
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text default 'in_progress' -- in_progress | completed
);

-- Counts: one row per product per session
create table if not exists counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  product_id text not null,
  variant_id text,
  product_name text not null,
  sku text,
  category text,
  shopify_qty integer not null,
  counted_qty integer,
  variance integer,
  created_at timestamptz default now()
);

-- Shrink report rows: only items with variance
create table if not exists shrink_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  sku text,
  category text,
  shopify_qty integer not null,
  counted_qty integer not null,
  variance integer not null,
  reason text,
  estimated_value numeric(10,2),
  created_at timestamptz default now()
);

-- Index for fast lookups by session
create index if not exists counts_session_id_idx on counts(session_id);
create index if not exists shrink_session_id_idx on shrink_reports(session_id);
