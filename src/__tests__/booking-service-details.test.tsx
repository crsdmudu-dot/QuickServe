/**
 * Tests for src/app/booking/service-details.tsx — the new customer-visible booking Step 1 —
 * and the generic renderer in src/components/booking/service-details-form.tsx.
 *
 * These are SCREEN-level tests: what the customer sees, what Continue and Back do, and what
 * reaches the booking draft. The underlying visibility/validation/snapshot rules are tested as
 * pure functions in service-details-form.test.ts.
 *
 * Mocks: expo-router (push/back/replace/canGoBack), the booking draft, the services provider,
 * the image picker and the native date-time picker — so nothing touches a device or network.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

const mockLaunchLibrary = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}));

const mockAndroidOpen = jest.fn();
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: View,
    DateTimePickerAndroid: { open: (...args: unknown[]) => mockAndroidOpen(...args), dismiss: jest.fn() },
  };
});

const mockSetServiceDetails = jest.fn();
const mockAddIssuePhoto = jest.fn();
const mockRemoveIssuePhoto = jest.fn();
let mockServiceId: string | null = 'plumbing';
let mockServiceDetails: unknown = null;
let mockIssuePhotos: string[] = [];
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({
    serviceId: mockServiceId,
    serviceDetails: mockServiceDetails,
    setServiceDetails: mockSetServiceDetails,
    issuePhotos: mockIssuePhotos,
    addIssuePhoto: mockAddIssuePhoto,
    removeIssuePhoto: mockRemoveIssuePhoto,
  }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import ServiceDetailsScreen from '@/app/booking/service-details';
import { getServiceForm } from '@/constants/service-forms';
import { toSnapshot } from '@/booking/service-details-form';

const originalOS = Platform.OS;

/** The snapshot handed to setServiceDetails on the most recent Continue. */
const lastSnapshot = () => mockSetServiceDetails.mock.calls.at(-1)?.[0];

/** Fill in a valid plumbing answer set through the UI. */
function completePlumbing() {
  fireEvent.press(screen.getByTestId('option-issue-sink_problem'));
  fireEvent.press(screen.getByTestId('option-location_of_issue-kitchen'));
  fireEvent.press(screen.getByTestId('option-actively_leaking-no'));
}

describe('ServiceDetailsScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    (router.back as jest.Mock).mockClear();
    (router.replace as jest.Mock).mockClear();
    (router.canGoBack as jest.Mock).mockClear().mockReturnValue(true);
    mockSetServiceDetails.mockClear();
    mockAddIssuePhoto.mockClear();
    mockRemoveIssuePhoto.mockClear();
    mockLaunchLibrary.mockReset();
    mockAndroidOpen.mockReset();
    mockServiceId = 'plumbing';
    mockServiceDetails = null;
    mockIssuePhotos = [];
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  // ── 1. Primary question + step label ────────────────────────────────────────

  it('renders the service name, the step label and the primary question (requirement 1)', () => {
    render(<ServiceDetailsScreen />);

    expect(screen.getByText('Step 1 of 5')).toBeOnTheScreen();
    // Required questions render as "<label> *" in a single Text node, hence the regex.
    expect(screen.getByText(/What problem are you having\?/)).toBeOnTheScreen();
    expect(screen.getByTestId('question-issue')).toBeOnTheScreen();
  });

  it('does not reveal follow-ups before the primary is answered (progressive disclosure)', () => {
    render(<ServiceDetailsScreen />);
    expect(screen.queryByTestId('question-actively_leaking')).toBeNull();
    expect(screen.queryByTestId('question-other_description')).toBeNull();
  });

  // ── 2. Single-select ────────────────────────────────────────────────────────

  it('single-select reveals follow-ups and holds exactly one value (requirement 2)', () => {
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-issue-leaking_tap_or_pipe'));
    expect(screen.getByTestId('question-actively_leaking')).toBeOnTheScreen();

    // Switching to a branch that hides the follow-up removes it again.
    fireEvent.press(screen.getByTestId('option-issue-installation_or_replacement'));
    expect(screen.queryByTestId('question-actively_leaking')).toBeNull();
  });

  it('shows the "other" description field only when the customer picks Something else', () => {
    render(<ServiceDetailsScreen />);
    expect(screen.queryByTestId('question-other_description')).toBeNull();

    fireEvent.press(screen.getByTestId('option-issue-other'));
    expect(screen.getByTestId('question-other_description')).toBeOnTheScreen();
  });

  it('offers a "Not sure" escape without forcing a diagnosis', () => {
    render(<ServiceDetailsScreen />);
    expect(screen.getByTestId('option-issue-not_sure')).toBeOnTheScreen();
  });

  // ── 9/10/11. Transitive hiding through the UI ───────────────────────────────

  it('hides a whole dependent branch when the parent changes (requirements 10, 11)', () => {
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-issue-leaking_tap_or_pipe'));
    fireEvent.press(screen.getByTestId('option-actively_leaking-yes'));
    expect(screen.getByTestId('question-mains_shut_off')).toBeOnTheScreen();

    // Changing the top-level issue hides parent AND grandchild.
    fireEvent.press(screen.getByTestId('option-issue-installation_or_replacement'));
    expect(screen.queryByTestId('question-actively_leaking')).toBeNull();
    expect(screen.queryByTestId('question-mains_shut_off')).toBeNull();
  });

  // ── 12. Disabled options never render ───────────────────────────────────────

  it('never renders a disabled option — Food order_for_me (requirements 12, 31)', () => {
    mockServiceId = 'food-delivery';
    render(<ServiceDetailsScreen />);

    expect(screen.getByTestId('option-variant-collect_paid')).toBeOnTheScreen();
    expect(screen.getByTestId('option-variant-collect_unpaid')).toBeOnTheScreen();
    expect(screen.queryByTestId('option-variant-order_for_me')).toBeNull();
    expect(screen.queryByText('Order it for me')).toBeNull();
  });

  it('never renders Medicine request_items, and exposes no item list (requirement 32)', () => {
    mockServiceId = 'medicine-delivery';
    render(<ServiceDetailsScreen />);

    expect(screen.getByTestId('option-variant-collect')).toBeOnTheScreen();
    expect(screen.queryByTestId('option-variant-request_items')).toBeNull();
    expect(screen.queryByTestId('add-item')).toBeNull();
  });

  // ── 13. Safety gate ─────────────────────────────────────────────────────────

  it('asks the towing safety gate and blocks Continue when someone is in danger (requirement 33)', () => {
    mockServiceId = 'car-towing';
    render(<ServiceDetailsScreen />);

    expect(screen.getByText('Is anyone injured or in immediate danger?')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('gate-option-yes'));

    // The form and the Continue button are replaced by the guidance block.
    expect(screen.getByTestId('safety-block')).toBeOnTheScreen();
    expect(screen.queryByTestId('service-details-continue')).toBeNull();
    expect(screen.queryByTestId('question-issue')).toBeNull();
  });

  it('shows generic emergency guidance with no phone number (requirement 34)', () => {
    mockServiceId = 'car-towing';
    render(<ServiceDetailsScreen />);
    fireEvent.press(screen.getByTestId('gate-option-yes'));

    expect(screen.getAllByText(/contact emergency services/).length).toBeGreaterThan(0);
    for (const number of ['999', '911', '112']) {
      expect(screen.queryByText(new RegExp(number))).toBeNull();
    }
  });

  it('lets the customer continue once nobody is in danger', () => {
    mockServiceId = 'car-towing';
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('gate-option-no'));

    expect(screen.queryByTestId('safety-block')).toBeNull();
    expect(screen.getByTestId('service-details-continue')).toBeOnTheScreen();
    expect(screen.getByTestId('question-issue')).toBeOnTheScreen();
  });

  // ── 14. Non-blocking notices ────────────────────────────────────────────────

  it('shows the plumbing leak notice WITHOUT blocking Continue (requirement 36)', () => {
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-issue-leaking_tap_or_pipe'));
    fireEvent.press(screen.getByTestId('option-location_of_issue-kitchen'));
    fireEvent.press(screen.getByTestId('option-actively_leaking-yes'));
    fireEvent.press(screen.getByTestId('option-mains_shut_off-yes'));

    expect(screen.getByTestId('notice-active_leak_guidance')).toBeOnTheScreen();
    // Non-blocking: Continue is still there and still works.
    fireEvent.press(screen.getByTestId('service-details-continue'));
    expect(router.push).toHaveBeenCalledWith('/booking/address');
  });

  it('shows the electrical danger notice WITHOUT blocking Continue (requirement 35)', () => {
    mockServiceId = 'electrical';
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-issue-lights'));
    fireEvent.press(screen.getByTestId('option-danger_signs-burning_smell'));
    fireEvent.press(screen.getByTestId('option-affected_points-one'));

    expect(screen.getByTestId('notice-danger_guidance')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('service-details-continue'));
    expect(router.push).toHaveBeenCalledWith('/booking/address');
  });

  // ── 4/5. Number and text ────────────────────────────────────────────────────

  it('blocks Continue on an out-of-range number and shows an inline error (requirement 4)', () => {
    mockServiceId = 'makeup';
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-variant-photoshoot'));
    fireEvent.changeText(screen.getByTestId('input-number_of_people'), '99'); // max is 20
    fireEvent.press(screen.getByTestId('service-details-continue'));

    expect(screen.getByTestId('input-number_of_people-error')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('blocks Continue on a missing required text answer (requirement 5)', () => {
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-issue-other'));
    fireEvent.press(screen.getByTestId('option-location_of_issue-kitchen'));
    fireEvent.press(screen.getByTestId('option-actively_leaking-no'));
    fireEvent.press(screen.getByTestId('service-details-continue'));

    expect(screen.getByTestId('input-other_description-error')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  // ── 6. Boolean acknowledgement ──────────────────────────────────────────────

  it('requires an explicit acknowledgement tap — no implicit acceptance (requirement 6)', () => {
    mockServiceId = 'package-delivery';
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-variant-documents'));
    fireEvent.press(screen.getByTestId('option-fragile-no'));
    // Both required text fields.
    fireEvent.changeText(screen.getByTestId('input-recipient_name'), 'Amina');
    fireEvent.changeText(screen.getByTestId('input-recipient_phone'), '0700000000');

    fireEvent.press(screen.getByTestId('service-details-continue'));
    expect(screen.getByTestId('error-prohibited_acknowledgement')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('toggle-prohibited_acknowledgement'));
    fireEvent.press(screen.getByTestId('service-details-continue'));

    expect(router.push).toHaveBeenCalledWith('/booking/address');
    expect(lastSnapshot().answers.find((a: { key: string }) => a.key === 'prohibited_acknowledgement')).toMatchObject({
      value: true,
      display: 'Yes',
    });
  });

  // ── 7. Time ─────────────────────────────────────────────────────────────────

  it('opens the Android time picker for a time question (requirement 7)', () => {
    Platform.OS = 'android';
    mockServiceId = 'makeup';
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-variant-everyday_or_natural'));
    fireEvent.press(screen.getByTestId('time-ready_by_time'));

    expect(mockAndroidOpen).toHaveBeenCalledWith(expect.objectContaining({ mode: 'time' }));
  });

  it('stores the chosen time and shows it on the button', () => {
    Platform.OS = 'android';
    mockServiceId = 'makeup';
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-variant-everyday_or_natural'));
    fireEvent.press(screen.getByTestId('time-ready_by_time'));

    // Simulate the native picker returning a time. The callback fires outside React's render
    // loop, so the state update has to be flushed with act().
    const chosen = new Date(2026, 0, 1, 9, 30);
    act(() => mockAndroidOpen.mock.calls[0][0].onChange({ type: 'set' }, chosen));

    expect(screen.getByTestId('time-ready_by_time')).toBeOnTheScreen();
    expect(screen.queryByText('Choose a time')).toBeNull();
  });

  // ── 8 / 22-24. Item list ────────────────────────────────────────────────────

  describe('grocery item list', () => {
    beforeEach(() => {
      mockServiceId = 'grocery-delivery';
    });

    it('shows the item list only on the shopping paths (requirements 8, 30)', () => {
      render(<ServiceDetailsScreen />);
      expect(screen.queryByTestId('question-items')).toBeNull();

      fireEvent.press(screen.getByTestId('option-variant-shop_for_me'));
      expect(screen.getByTestId('question-items')).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('option-variant-collect_existing_order'));
      expect(screen.queryByTestId('question-items')).toBeNull();
      expect(screen.queryByTestId('add-item')).toBeNull();
    });

    it('adds and removes lines, and only offers Remove when more than one exists (requirements 22, 23)', () => {
      render(<ServiceDetailsScreen />);
      fireEvent.press(screen.getByTestId('option-variant-shop_for_me'));

      // One starting line, nothing to remove.
      expect(screen.getByText('Item 1')).toBeOnTheScreen();
      expect(screen.queryByText('Remove')).toBeNull();

      fireEvent.press(screen.getByTestId('add-item'));
      expect(screen.getByText('Item 2')).toBeOnTheScreen();
      expect(screen.getAllByText('Remove')).toHaveLength(2);

      fireEvent.press(screen.getAllByText('Remove')[1]);
      expect(screen.queryByText('Item 2')).toBeNull();
      expect(screen.queryByText('Remove')).toBeNull();
    });

    it('exposes a deterministic testID on the optional brand field, and captures what is typed', () => {
      // The brand field previously had no testID and no placeholder, so its only handle was its
      // label — and an Input's label is a plain Text sibling of the TextInput, which in React
      // Native cannot focus it. Native automation was therefore typing into nothing while
      // reporting success. The testID is what makes the field addressable at all; this test pins
      // it, and pins that a value typed through it actually reaches state (the Input is
      // controlled, so a rendered value IS state).
      render(<ServiceDetailsScreen />);
      fireEvent.press(screen.getByTestId('option-variant-shop_for_me'));

      const brand = screen.getAllByTestId(/^item-brand-line_/)[0];
      expect(brand).toBeOnTheScreen();

      fireEvent.changeText(brand, 'Brookside');
      expect(screen.getAllByTestId(/^item-brand-line_/)[0].props.value).toBe('Brookside');

      // One brand field per card, each with its own id — so automation can address them apart.
      fireEvent.press(screen.getByTestId('add-item'));
      const ids = screen.getAllByTestId(/^item-brand-line_/).map((n) => n.props.testID);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      // Adding a second card must not disturb the first card's captured brand.
      expect(screen.getAllByTestId(/^item-brand-line_/)[0].props.value).toBe('Brookside');
    });

    it('offers only the approved units (requirement 27)', () => {
      render(<ServiceDetailsScreen />);
      fireEvent.press(screen.getByTestId('option-variant-shop_for_me'));

      for (const unit of ['pcs', 'kg', 'g', 'litres', 'ml', 'packs', 'bottles', 'bunches']) {
        expect(screen.getByText(unit)).toBeOnTheScreen();
      }
      expect(screen.queryByText('sacks')).toBeNull();
    });

    it('describes the budget as a goods maximum with fees called out separately (requirement 29)', () => {
      render(<ServiceDetailsScreen />);
      fireEvent.press(screen.getByTestId('option-variant-shop_for_me'));

      expect(screen.getByText(/Delivery and service fees are separate/)).toBeOnTheScreen();
      expect(screen.queryByText(/total charge/i)).toBeNull();
      expect(screen.queryByText(/final charge/i)).toBeNull();
    });

    it('blocks Continue until the list and the budget are valid (requirements 25, 26, 28)', () => {
      render(<ServiceDetailsScreen />);
      fireEvent.press(screen.getByTestId('option-variant-shop_for_me'));
      fireEvent.press(screen.getByTestId('service-details-continue'));

      expect(screen.getByTestId('error-items')).toBeOnTheScreen();
      expect(screen.getByTestId('input-max_goods_budget-error')).toBeOnTheScreen();
      expect(router.push).not.toHaveBeenCalled();
    });
  });

  // ── 15. Media from config ───────────────────────────────────────────────────

  it('shows the configured photo prompt and reuses the existing picker (requirement 15)', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://photo.jpg' }] });
    render(<ServiceDetailsScreen />);

    expect(screen.getByTestId('service-details-media')).toBeOnTheScreen();
    expect(screen.getByText(getServiceForm('plumbing')!.media.prompt!)).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('add-photo'));
    await waitFor(() => expect(mockAddIssuePhoto).toHaveBeenCalledWith('file://photo.jpg'));
  });

  it('renders NO media UI for a service configured without it (requirement 15)', () => {
    mockServiceId = 'massage';
    render(<ServiceDetailsScreen />);

    expect(screen.queryByTestId('service-details-media')).toBeNull();
    expect(screen.queryByTestId('add-photo')).toBeNull();
  });

  it('does not add a photo when the picker is cancelled', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('add-photo'));
    await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalled());
    expect(mockAddIssuePhoto).not.toHaveBeenCalled();
  });

  // ── 16. Fail-closed ─────────────────────────────────────────────────────────

  it('blocks booking with a friendly message when the service has no config (requirement 16)', () => {
    mockServiceId = 'teleportation';
    render(<ServiceDetailsScreen />);

    expect(screen.getByTestId('service-details-unavailable')).toBeOnTheScreen();
    expect(screen.getByText(/isn't available yet/)).toBeOnTheScreen();
    // No way to proceed, and nothing written to the draft.
    expect(screen.queryByTestId('service-details-continue')).toBeNull();
    expect(mockSetServiceDetails).not.toHaveBeenCalled();
  });

  it('offers a safe way back from the unavailable screen (requirement 16)', () => {
    mockServiceId = 'teleportation';
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('service-details-unavailable-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('fails closed when no service has been chosen at all', () => {
    mockServiceId = null;
    render(<ServiceDetailsScreen />);
    expect(screen.getByTestId('service-details-unavailable')).toBeOnTheScreen();
  });

  // ── 17-19. Continue stores the snapshot ─────────────────────────────────────

  it('stores a ServiceDetailsSnapshot and routes to Address (requirements 17, 38)', () => {
    render(<ServiceDetailsScreen />);
    completePlumbing();
    fireEvent.press(screen.getByTestId('service-details-continue'));

    expect(mockSetServiceDetails).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/booking/address');

    const snap = lastSnapshot();
    expect(snap).toMatchObject({
      schema: 1,
      service_slug: 'plumbing',
      primary: { key: 'issue', value: 'sink_problem', display: 'Sink problem' },
    });
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('stores the human labels the customer saw, not just machine keys (requirement 19)', () => {
    render(<ServiceDetailsScreen />);
    completePlumbing();
    fireEvent.press(screen.getByTestId('service-details-continue'));

    const location = lastSnapshot().answers.find((a: { key: string }) => a.key === 'location_of_issue');
    expect(location).toMatchObject({ question: 'Where in the property?', value: 'kitchen', display: 'Kitchen' });
  });

  it('never stores an answer from a branch the customer left (requirement 18)', () => {
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('option-issue-leaking_tap_or_pipe'));
    fireEvent.press(screen.getByTestId('option-actively_leaking-yes'));
    fireEvent.press(screen.getByTestId('option-mains_shut_off-no'));
    // Change of mind — this branch disappears.
    fireEvent.press(screen.getByTestId('option-issue-installation_or_replacement'));
    fireEvent.press(screen.getByTestId('option-location_of_issue-kitchen'));
    fireEvent.press(screen.getByTestId('service-details-continue'));

    const keys = lastSnapshot().answers.map((a: { key: string }) => a.key);
    expect(keys).not.toContain('actively_leaking');
    expect(keys).not.toContain('mains_shut_off');
  });

  it('does not write to the draft when validation fails', () => {
    render(<ServiceDetailsScreen />);
    fireEvent.press(screen.getByTestId('service-details-continue'));

    expect(mockSetServiceDetails).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-issue')).toBeOnTheScreen();
  });

  // ── 20/21. Back restores; a different service does not leak ─────────────────

  it('restores previously entered answers when the customer comes back (requirement 20)', () => {
    const f = getServiceForm('plumbing')!;
    mockServiceDetails = toSnapshot(f, 'Plumbing', {
      answers: { issue: 'sink_problem', location_of_issue: 'bathroom', actively_leaking: 'no' },
      lines: [],
    });

    render(<ServiceDetailsScreen />);

    // The branch that depends on `issue` is visible again, i.e. the answers really were restored.
    expect(screen.getByTestId('question-actively_leaking')).toBeOnTheScreen();
    // And Continue succeeds immediately, with no re-answering.
    fireEvent.press(screen.getByTestId('service-details-continue'));
    expect(router.push).toHaveBeenCalledWith('/booking/address');
    expect(lastSnapshot().answers.find((a: { key: string }) => a.key === 'location_of_issue')).toMatchObject({
      value: 'bathroom',
    });
  });

  it('does not leak a snapshot from a DIFFERENT service into this form (requirement 47)', () => {
    // A leftover makeup snapshot while the draft's service is plumbing.
    mockServiceDetails = toSnapshot(getServiceForm('makeup')!, 'Makeup', {
      answers: { variant: 'bridal', number_of_people: 2, ready_by_time: '07:00' },
      lines: [],
    });

    render(<ServiceDetailsScreen />);

    // Nothing restored: the form starts blank and blocks on the unanswered primary.
    fireEvent.press(screen.getByTestId('service-details-continue'));
    expect(screen.getByTestId('error-issue')).toBeOnTheScreen();
    expect(mockSetServiceDetails).not.toHaveBeenCalled();
  });

  // ── 37/39. Back navigation ──────────────────────────────────────────────────

  it('shows a visible Back control that pops when history exists', () => {
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('service-details-back'));

    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('falls back to a safe destination when there is no history (no navigation trap)', () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    render(<ServiceDetailsScreen />);

    fireEvent.press(screen.getByTestId('service-details-back'));

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('Back never clears what the customer has entered', () => {
    render(<ServiceDetailsScreen />);
    completePlumbing();

    fireEvent.press(screen.getByTestId('service-details-back'));

    expect(mockSetServiceDetails).not.toHaveBeenCalled();
  });

  // ── Internal vocabulary must never surface ──────────────────────────────────

  it('never shows internal vocabulary to the customer', () => {
    render(<ServiceDetailsScreen />);
    fireEvent.press(screen.getByTestId('option-issue-other'));

    for (const word of ['variant', 'schema', 'form_version', 'snapshot', 'machine key']) {
      expect(screen.queryByText(new RegExp(word, 'i'))).toBeNull();
    }
  });
});
