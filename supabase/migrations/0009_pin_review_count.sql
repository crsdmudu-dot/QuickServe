-- Pin review_count in the self-update guard.
-- profiles_update_own (0005) predates the review_count column (added in 0008),
-- so a provider could self-edit their own review_count via a crafted profiles
-- update. review_count is trigger-computed (recompute_provider_rating) and must
-- not be client-writable. Recreate the policy with review_count pinned alongside
-- the existing protected columns.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and approval_status = (select p.approval_status from public.profiles p where p.id = auth.uid())
    and is_verified = (select p.is_verified from public.profiles p where p.id = auth.uid())
    and completed_jobs_count = (select p.completed_jobs_count from public.profiles p where p.id = auth.uid())
    and review_count = (select p.review_count from public.profiles p where p.id = auth.uid())
    and average_rating is not distinct from (select p.average_rating from public.profiles p where p.id = auth.uid())
  );
