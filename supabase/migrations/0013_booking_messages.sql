create table if not exists public.booking_messages (
  id           uuid        primary key default gen_random_uuid(),
  booking_id   uuid        not null references public.bookings(id) on delete cascade,
  sender_id    uuid        not null references public.profiles(id),
  message_text text        not null
                 check (char_length(btrim(message_text)) between 1 and 2000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz                 -- reserved/unused this slice
);
alter table public.booking_messages enable row level security;

create index if not exists booking_messages_booking_created_idx
  on public.booking_messages (booking_id, created_at);

create policy "booking_messages_select" on public.booking_messages
  for select using (
    exists (select 1 from public.bookings b
            where b.id = booking_id
              and (b.customer_id = auth.uid()
                   or b.assigned_provider_id = auth.uid()
                   or public.is_admin()))
  );

create policy "booking_messages_insert" on public.booking_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.bookings b
                where b.id = booking_id
                  and b.assigned_provider_id is not null
                  and b.status not in ('completed','cancelled')
                  and (b.customer_id = auth.uid()
                       or b.assigned_provider_id = auth.uid()))
  );

create or replace function public.get_chat_peer_name(p_booking_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_customer_id         uuid;
  v_assigned_provider_id uuid;
  v_result              text;
begin
  select customer_id, assigned_provider_id
    into v_customer_id, v_assigned_provider_id
    from public.bookings
   where id = p_booking_id;

  if not found then
    return null;
  end if;

  if auth.uid() = v_customer_id then
    select full_name into v_result
      from public.profiles
     where id = v_assigned_provider_id;
    return v_result;
  elsif auth.uid() = v_assigned_provider_id then
    select split_part(full_name, ' ', 1) into v_result
      from public.profiles
     where id = v_customer_id;
    return v_result;
  else
    return null;
  end if;
end; $$;
