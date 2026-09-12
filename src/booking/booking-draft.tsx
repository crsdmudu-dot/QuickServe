import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import type { SchedulingType, TimeWindow, Recurrence, ResolvedSchedule } from '@/lib/scheduling';
import { newIdempotencyKey } from '@/lib/idempotency';
import type { ServiceDetailsSnapshot } from '@/lib/service-details';

type Draft = {
  serviceId: string | null;
  address: string;
  scheduledFor: string | null;
  notes: string;
  issuePhotos: string[];
  // Slice 20 structured address fields
  address_label: string;
  latitude: number | null;
  longitude: number | null;
  building_name: string;
  floor: string;
  door_number: string;
  landmark: string;
  access_notes: string;
  // Slice 24 scheduling fields
  scheduling_type: SchedulingType;
  time_window: TimeWindow | null;
  window_start: string | null;
  window_end: string | null;
  recurrence: Recurrence;
  /** Service Details V1 — the structured snapshot for this booking, or null until answered.
   *  Cleared by start()/reset() so answers can never carry across services or bookings. */
  serviceDetails: ServiceDetailsSnapshot | null;
};
type BookingDraft = Draft & {
  start: (serviceId: string) => void;
  setAddress: (v: string) => void;
  setScheduledFor: (iso: string) => void;
  setSchedule: (r: ResolvedSchedule) => void;
  setNotes: (v: string) => void;
  /** Replace the Service Details snapshot for this booking (null clears it). */
  setServiceDetails: (v: ServiceDetailsSnapshot | null) => void;
  addIssuePhoto: (uri: string) => void;
  removeIssuePhoto: (uri: string) => void;
  reset: () => void;
  /** The idempotency key for the CURRENT logical submission. Generated once and reused across
   *  retries of the same submission; cleared by start()/reset() so the next booking gets a new
   *  one. Ref-backed, so synchronous double-taps share the same key. */
  ensureIdempotencyKey: () => string;
  // Slice 20 structured address setters
  /** Set the Google-resolved location fields (address + label + coords). Spreads into draft. */
  setLocation: (partial: Partial<Pick<Draft, 'address' | 'address_label' | 'latitude' | 'longitude'>>) => void;
  /** Set apartment / access detail fields. Spreads into draft. */
  setApartment: (partial: Partial<Pick<Draft, 'building_name' | 'floor' | 'door_number' | 'landmark' | 'access_notes'>>) => void;
};

const EMPTY: Draft = {
  serviceId: null,
  address: '',
  scheduledFor: null,
  notes: '',
  issuePhotos: [],
  // Slice 20 defaults
  address_label: '',
  latitude: null,
  longitude: null,
  building_name: '',
  floor: '',
  door_number: '',
  landmark: '',
  access_notes: '',
  // Slice 24 scheduling defaults
  scheduling_type: 'datetime',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
  // Service Details V1 default — no structured answers until the customer provides them.
  serviceDetails: null,
};
const Ctx = createContext<BookingDraft | null>(null);

export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // Idempotency key for the current submission. A ref (not state) so two synchronous Place
  // Booking taps read the SAME key; cleared whenever a new booking flow starts or the draft resets.
  const idempotencyKeyRef = useRef<string | null>(null);
  const value: BookingDraft = {
    ...draft,
    start: (serviceId) => { idempotencyKeyRef.current = null; setDraft({ ...EMPTY, serviceId }); },
    setAddress: (address) => setDraft((d) => ({ ...d, address })),
    setScheduledFor: (iso) => setDraft((d) => ({ ...d, scheduledFor: iso, scheduling_type: 'datetime', time_window: 'specific' })),
    setSchedule: (r) => setDraft((d) => ({
      ...d,
      scheduledFor: r.scheduled_for,
      scheduling_type: r.scheduling_type,
      time_window: r.time_window,
      window_start: r.window_start,
      window_end: r.window_end,
      recurrence: r.recurrence,
    })),
    setNotes: (notes) => setDraft((d) => ({ ...d, notes })),
    // Service Details V1 — the snapshot is built by the caller (buildServiceDetailsSnapshot)
    // and stored whole; the draft never edits its interior.
    setServiceDetails: (serviceDetails) => setDraft((d) => ({ ...d, serviceDetails })),
    addIssuePhoto: (uri) => setDraft((d) => ({ ...d, issuePhotos: [...d.issuePhotos, uri] })),
    removeIssuePhoto: (uri) => setDraft((d) => ({ ...d, issuePhotos: d.issuePhotos.filter((u) => u !== uri) })),
    reset: () => { idempotencyKeyRef.current = null; setDraft(EMPTY); },
    ensureIdempotencyKey: () => {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
      return idempotencyKeyRef.current;
    },
    // Slice 20 structured address setters
    setLocation: (partial) => setDraft((d) => ({ ...d, ...partial })),
    setApartment: (partial) => setDraft((d) => ({ ...d, ...partial })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBookingDraft(): BookingDraft {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBookingDraft must be used within BookingDraftProvider');
  return ctx;
}
