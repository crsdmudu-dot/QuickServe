create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null check (role in ('customer','provider','admin')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Users may update their own row but NOT change their role or approval_status
-- (prevents privilege escalation). WITH CHECK pins both to their current values.
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and approval_status = (select p.approval_status from public.profiles p where p.id = auth.uid())
  );

-- Public self-signup: only 'customer' or 'provider' (admin is NEVER self-assignable).
-- Customers are auto-approved; providers start 'pending'. Admins are created manually
-- in Supabase (role='admin', approval_status='approved') outside this trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
begin
  v_role := case
    when (new.raw_user_meta_data ->> 'role') = 'provider' then 'provider'
    else 'customer'
  end;
  v_status := case when v_role = 'provider' then 'pending' else 'approved' end;

  insert into public.profiles (id, full_name, phone, role, approval_status)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    v_role,
    v_status
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
