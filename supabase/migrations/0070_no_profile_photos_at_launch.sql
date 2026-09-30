-- 0070_no_profile_photos_at_launch.sql - R6: no provider photos at launch (owner decision, option (a)).
-- Profile photos were a free-text image link that providers (and admins) typed in, so any outside picture could appear
-- in the customer apps with no moderation. The store user-content rules cover pictures as well as text. Until a
-- moderated upload exists, KwikServe shows initials instead of photos (lead-PM stage 06 R6, stage 08 S8-2).
--
-- WHAT THIS DOES
--   1. Clears every stored photo link. Only the number of cleared rows is reported, never the links themselves.
--   2. Adds a CHECK that profile_photo_url stays empty. Every write path is covered at once: the provider's own
--      profile, the admin web, the API, and anything added later. NULL writes (account deletion, 0056/0060) still
--      work. The column is kept, so the read functions and the apps need no change; they show initials.
--   The table is locked for the few statements this takes, so no link can be written between 1 and 2.
--
-- WHEN PHOTOS RETURN: a later migration drops this CHECK together with a moderated upload (a private bucket, the
-- deletion inventory and the cleanup routines updated, deletion re-certified).

lock table public.profiles in share row exclusive mode;

do $$
declare
  v_cleared integer;
begin
  update public.profiles set profile_photo_url = null where profile_photo_url is not null;
  get diagnostics v_cleared = row_count;
  raise notice '0070: cleared % profile photo link(s)', v_cleared;
end $$;

alter table public.profiles drop constraint if exists profiles_no_photo_at_launch;
alter table public.profiles
  add constraint profiles_no_photo_at_launch check (profile_photo_url is null);
