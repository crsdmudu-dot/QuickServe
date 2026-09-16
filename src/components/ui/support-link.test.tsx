import { Linking, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SupportLink } from '@/components/ui/support-link';
import { SUPPORT_EMAIL } from '@/lib/support';

describe('SupportLink', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the support address as readable text', () => {
    render(<SupportLink />);
    expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen();
  });

  it('shows a default prompt and accepts a caller-supplied one', () => {
    const { unmount } = render(<SupportLink />);
    expect(screen.getByText('Need help?')).toBeOnTheScreen();
    unmount();

    render(<SupportLink prompt="Still stuck?" />);
    expect(screen.getByText('Still stuck?')).toBeOnTheScreen();
  });

  it('opens the bare support mailto when pressed', async () => {
    render(<SupportLink />);
    fireEvent.press(screen.getByRole('link'));
    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
    expect(openURL).toHaveBeenCalledWith('mailto:support@hiredcorp.co.ke');
  });

  // canOpenURL uses queryIntentActivities / LSApplicationQueriesSchemes, which would make this
  // component require a native declaration. openURL alone does not.
  it('never calls canOpenURL, which would create a native configuration requirement', () => {
    const canOpen = jest.spyOn(Linking, 'canOpenURL');
    render(<SupportLink />);
    fireEvent.press(screen.getByRole('link'));
    expect(canOpen).not.toHaveBeenCalled();
  });

  it('survives a rejected openURL without throwing', async () => {
    openURL.mockRejectedValue(new Error('no mail client'));
    render(<SupportLink />);
    expect(() => fireEvent.press(screen.getByRole('link'))).not.toThrow();
    // The address stays on screen so the user can still copy it by hand.
    await waitFor(() => expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen());
  });

  it('exposes an accessible link with an explicit label', () => {
    render(<SupportLink />);
    const link = screen.getByRole('link');
    expect(link).toBeOnTheScreen();
    expect(link.props.accessibilityLabel).toBe(`Email KwikServe support at ${SUPPORT_EMAIL}`);
  });

  it('keeps the address selectable so it can be copied when no mail app is configured', () => {
    render(<SupportLink />);
    expect(screen.getByText(SUPPORT_EMAIL).props.selectable).toBe(true);
  });

  it('gives the touch target at least the 44pt minimum', () => {
    render(<SupportLink />);
    const style = StyleSheet.flatten(screen.getByRole('link').props.style) as { minHeight?: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });
});
