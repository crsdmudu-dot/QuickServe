/**
 * Tests for ConductAcceptanceCard
 *
 * Verifies:
 *   - Shows current conduct version.
 *   - Not-accepted state: shows "Not yet accepted" + Accept button fires onAccept.
 *   - Accepted state: shows "Accepted" + formatted date + button is disabled.
 *   - submitting=true: button is disabled (loading).
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { ConductAcceptanceCard } from '@/components/provider/conduct-acceptance-card';

describe('ConductAcceptanceCard', () => {
  it('shows the conduct version', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={false}
        onAccept={jest.fn()}
      />,
    );
    expect(screen.getByText(/Version: v1/i)).toBeOnTheScreen();
  });

  it('shows "Not yet accepted" when not accepted', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={false}
        onAccept={jest.fn()}
      />,
    );
    expect(screen.getByText('Not yet accepted')).toBeOnTheScreen();
  });

  it('shows the Accept button when not accepted', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={false}
        onAccept={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Accept' })).toBeOnTheScreen();
  });

  it('fires onAccept when Accept button is pressed', () => {
    const onAccept = jest.fn();
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={false}
        onAccept={onAccept}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('shows "Accepted" check when accepted=true', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={true}
        acceptedAt="2024-06-15T10:30:00Z"
        onAccept={jest.fn()}
      />,
    );
    expect(screen.getByText(/✓ Accepted/i)).toBeOnTheScreen();
  });

  it('shows the accepted date when accepted=true and acceptedAt is provided', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={true}
        acceptedAt="2024-06-15T10:30:00Z"
        onAccept={jest.fn()}
      />,
    );
    // The date is formatted by toLocaleDateString — match partial
    expect(screen.getByText(/2024/)).toBeOnTheScreen();
  });

  it('does NOT show the Accept button when accepted=true', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={true}
        acceptedAt="2024-06-15T10:30:00Z"
        onAccept={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('disables the Accept button when submitting=true', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={false}
        onAccept={jest.fn()}
        submitting={true}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Accept' });
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('shows a spinner when submitting=true', () => {
    render(
      <ConductAcceptanceCard
        version="v1"
        accepted={false}
        onAccept={jest.fn()}
        submitting={true}
      />,
    );
    expect(screen.getByTestId('conduct-spinner')).toBeOnTheScreen();
  });
});
