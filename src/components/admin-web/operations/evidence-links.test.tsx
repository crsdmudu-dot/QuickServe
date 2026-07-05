/**
 * Tests for EvidenceLinks
 *
 * Mocks @/lib/operations so no real Supabase calls are made.
 *
 * Covers:
 *   - Renders links returned by getCaseEvidence (label + ref slice).
 *   - Shows the empty state when getCaseEvidence returns [].
 *   - Groups links by kind (photos, chat, payment_attempt, review).
 */

const mockGetCaseEvidence = jest.fn();

jest.mock('@/lib/operations', () => ({
  getCaseEvidence: (...args: unknown[]) => mockGetCaseEvidence(...args),
}));

import { render, screen, waitFor } from '@testing-library/react-native';
import { EvidenceLinks } from '@/components/admin-web/operations/evidence-links';
import type { CaseEvidenceLink } from '@/constants/operations';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PHOTO_LINK: CaseEvidenceLink = {
  kind:  'photo',
  label: 'Photo (before)',
  ref:   'photo-aaaabbbb-0000-0000-0000-000000000000',
};

const CHAT_LINK: CaseEvidenceLink = {
  kind:  'chat',
  label: 'Chat message: Hello there',
  ref:   'msg-ccccdddd-0000-0000-0000-000000000000',
};

const PAYMENT_LINK: CaseEvidenceLink = {
  kind:  'payment_attempt',
  label: 'Payment attempt: mpesa successful (500)',
  ref:   'attempt-eeeeffff-0000-0000-0000-000000000000',
};

const REVIEW_LINK: CaseEvidenceLink = {
  kind:  'review',
  label: 'Review: 4/5 — Great service',
  ref:   'review-gggghhhh-0000-0000-0000-000000000000',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('EvidenceLinks', () => {
  beforeEach(() => {
    mockGetCaseEvidence.mockClear();
  });

  it('shows empty state when getCaseEvidence returns []', async () => {
    mockGetCaseEvidence.mockResolvedValue([]);
    render(<EvidenceLinks caseId="case-001" />);
    await waitFor(() => {
      expect(screen.getByText('No linked evidence available.')).toBeOnTheScreen();
    });
  });

  it('renders a photo link label and ref slice', async () => {
    mockGetCaseEvidence.mockResolvedValue([PHOTO_LINK]);
    render(<EvidenceLinks caseId="case-001" />);
    await waitFor(() => {
      expect(screen.getByText('Photo (before)')).toBeOnTheScreen();
    });
    expect(screen.getByText(/Ref: #photo-aa/)).toBeOnTheScreen();
  });

  it('renders a chat link label', async () => {
    mockGetCaseEvidence.mockResolvedValue([CHAT_LINK]);
    render(<EvidenceLinks caseId="case-001" />);
    await waitFor(() => {
      expect(screen.getByText('Chat message: Hello there')).toBeOnTheScreen();
    });
  });

  it('renders a payment attempt link label', async () => {
    mockGetCaseEvidence.mockResolvedValue([PAYMENT_LINK]);
    render(<EvidenceLinks caseId="case-001" />);
    await waitFor(() => {
      expect(
        screen.getByText('Payment attempt: mpesa successful (500)'),
      ).toBeOnTheScreen();
    });
  });

  it('renders a review link label', async () => {
    mockGetCaseEvidence.mockResolvedValue([REVIEW_LINK]);
    render(<EvidenceLinks caseId="case-001" />);
    await waitFor(() => {
      expect(screen.getByText('Review: 4/5 — Great service')).toBeOnTheScreen();
    });
  });

  it('renders all link kinds with group headings', async () => {
    mockGetCaseEvidence.mockResolvedValue([
      PHOTO_LINK,
      CHAT_LINK,
      PAYMENT_LINK,
      REVIEW_LINK,
    ]);
    render(<EvidenceLinks caseId="case-001" />);
    await waitFor(() => {
      expect(screen.getByText('Photos')).toBeOnTheScreen();
    });
    expect(screen.getByText('Chat messages')).toBeOnTheScreen();
    expect(screen.getByText('Payment attempts')).toBeOnTheScreen();
    expect(screen.getByText('Reviews')).toBeOnTheScreen();
  });

  it('calls getCaseEvidence with the provided caseId', async () => {
    mockGetCaseEvidence.mockResolvedValue([]);
    render(<EvidenceLinks caseId="case-xyz" />);
    await waitFor(() => {
      expect(mockGetCaseEvidence).toHaveBeenCalledWith('case-xyz');
    });
  });
});
