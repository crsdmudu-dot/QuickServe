// terms-consent.test.tsx — the register screen's Terms checkbox (F5.4).
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
    expect(screen.getByText('Read the Terms')).toBeOnTheScreen();
  });
});
