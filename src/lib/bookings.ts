import { supabase } from '@/lib/supabase';

export type BookingStatus =
  | 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export type NewBooking = { serviceId: string; address: string; scheduledFor: string; notes?: string };

export type Booking = {
  id: string;
  service_id: string;
  address: string;
  scheduled_for: string;
  notes: string | null;
  status: BookingStatus;
  created_at: string;
};

export async function createBooking(input: NewBooking): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in to book.' };
  const { error } = await supabase.from('bookings').insert({
    customer_id: data.user.id,
    service_id: input.serviceId,
    address: input.address,
    scheduled_for: input.scheduledFor,
    notes: input.notes ?? null,
  });
  if (error) return { ok: false, error: 'Could not create booking. Please try again.' };
  return { ok: true };
}

export async function getCustomerBookings(): Promise<Booking[]> {
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Booking[] | null) ?? [];
}
