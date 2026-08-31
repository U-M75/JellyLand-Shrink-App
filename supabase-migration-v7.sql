-- Run this in your Supabase SQL Editor on the EXISTING database (additive, safe to re-run)
--
-- Extends attribution (from supabase-migration-v6.sql's named logins) to
-- cycle count sessions themselves — Previous Sessions, the shrink report PDF,
-- and the Monthly Shrink Report currently have no idea who ran a count, even
-- though logging in now requires a name. This adds that.

alter table sessions add column if not exists counted_by_user_id uuid references staff_users(id);
alter table sessions add column if not exists counted_by text; -- resolved name at time of completion (survives user being deactivated later)
