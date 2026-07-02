import { createContext, useContext, useState, type ReactNode } from 'react';

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
};
type BookingDraft = Draft & {
  start: (serviceId: string) => void;
  setAddress: (v: string) => void;
  setScheduledFor: (iso: string) => void;
  setNotes: (v: string) => void;
  addIssuePhoto: (uri: string) => void;
  removeIssuePhoto: (uri: string) => void;
  reset: () => void;
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
};
const Ctx = createContext<BookingDraft | null>(null);

export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const value: BookingDraft = {
    ...draft,
    start: (serviceId) => setDraft({ ...EMPTY, serviceId }),
    setAddress: (address) => setDraft((d) => ({ ...d, address })),
    setScheduledFor: (scheduledFor) => setDraft((d) => ({ ...d, scheduledFor })),
    setNotes: (notes) => setDraft((d) => ({ ...d, notes })),
    addIssuePhoto: (uri) => setDraft((d) => ({ ...d, issuePhotos: [...d.issuePhotos, uri] })),
    removeIssuePhoto: (uri) => setDraft((d) => ({ ...d, issuePhotos: d.issuePhotos.filter((u) => u !== uri) })),
    reset: () => setDraft(EMPTY),
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
