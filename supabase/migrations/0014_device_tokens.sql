-- ============================================================
-- Slice 15 — Device Tokens schema
-- ============================================================

-- ----------------------------------------------------------------
-- 1. device_tokens table
-- ----------------------------------------------------------------
create table if not exists public.device_tokens (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  platform          text        not null check (platform in ('ios','android','web')),
  provider          text        not null default 'expo'
                                  check (provider in ('expo','fcm','apns')),
  push_token        text        not null,
  native_push_token text,
  device_name       text,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (user_id, push_token)
);
alter table public.device_tokens enable row level security;

-- ----------------------------------------------------------------
-- 2. RLS — user manages own; admin read-only; no cross-user access
-- ----------------------------------------------------------------

-- Read: own tokens, or admin (read-only oversight).
create policy "device_tokens_select" on public.device_tokens
  for select using (user_id = auth.uid() or public.is_admin());

-- Write: only the owner. Admin has NO write path.
create policy "device_tokens_insert" on public.device_tokens
  for insert with check (user_id = auth.uid());
create policy "device_tokens_update" on public.device_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "device_tokens_delete" on public.device_tokens
  for delete using (user_id = auth.uid());
