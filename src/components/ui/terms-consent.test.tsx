// terms-consent.test.tsx — the register screen's Terms checkbox (F5.4).
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TermsConsent } from '@/components/ui/terms-consent';

const savedUrl = process.env.EXPO_PUBLIC_WEBSITE_URL;
afterEach(() => {
  if (savedUrl === undefined) delete process.env.EXPO_PUBLIC_WEBSITE_URL;
  else process.env.EXPO_PUBLIC_WEBSITE_URL = savedUrl;
});

describe('TermsConsent', () => {
  it('is a real checkbox for screen readers and toggles on press', () => {
    const onChange = jest.fn();
    const { rerender } = render(<TermsConsent checked={false} onChange={onChange} />);
    const box = screen.getByTestId('terms-consent');
    expect(box.props.accessibilityRole).toBe('checkbox');
    expect(box.props.accessibilityState).toEqual({ checked: false });
    fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<TermsConsent checked onChange={onChange} />);
    expect(screen.getByTestId('terms-consent').props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(screen.getByTestId('terms-consent'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('shows an error as an alert', () => {
    render(<TermsConsent checked={false} onChange={jest.fn()} error="Please agree to the Terms of Service to create an account." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Please agree to the Terms of Service to create an account.');
  });

  it('offers the Terms link only when the website address is configured', () => {
    delete process.env.EXPO_PUBLIC_WEBSITE_URL;
    const { rerender } = render(<TermsConsent checked={false} onChange={jest.fn()} />);
    expect(screen.queryByText('Read the Terms')).toBeNull();
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    rerender(<TermsConsent checked={false} onChange={jest.fn()} />);
    expect(screen.getByRole('link', { name: 'Read the Terms' })).toBeOnTheScreen();
  });

  // D-12: the Privacy Policy link sits beside the Terms link, under the same website-address rule.
  it('offers the Privacy Policy link beside the Terms link only when the website address is configured', () => {
    delete process.env.EXPO_PUBLIC_WEBSITE_URL;
    const { rerender } = render(<TermsConsent checked={false} onChange={jest.fn()} />);
    expect(screen.queryByText('Read the Privacy Policy')).toBeNull();

    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    rerender(<TermsConsent checked={false} onChange={jest.fn()} />);
    expect(screen.getByRole('link', { name: 'Read the Terms' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Read the Privacy Policy' })).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('terms-consent-privacy-link'));
    expect(open).toHaveBeenCalledWith('https://kwikserve.example/privacy/');
    open.mockRestore();
  });

  it('opening the Privacy Policy does not tick or untick the Terms box', () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const onChange = jest.fn();
    render(<TermsConsent checked={false} onChange={onChange} />);
    fireEvent.press(screen.getByTestId('terms-consent-privacy-link'));
    expect(onChange).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
