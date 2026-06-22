import { createContext, useContext, useState, type ReactNode } from 'react';

type Draft = {
  serviceId: string | null;
  address: string;
  scheduledFor: string | null;
  notes: string;
  issuePhotos: string[];
};
type BookingDraft = Draft & {
  start: (serviceId: string) => void;
  setAddress: (v: string) => void;
  setScheduledFor: (iso: string) => void;
  setNotes: (v: string) => void;
  addIssuePhoto: (uri: string) => void;
  removeIssuePhoto: (uri: string) => void;
  reset: () => void;
};

const EMPTY: Draft = { serviceId: null, address: '', scheduledFor: null, notes: '', issuePhotos: [] };
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
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBookingDraft(): BookingDraft {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBookingDraft must be used within BookingDraftProvider');
  return ctx;
}
