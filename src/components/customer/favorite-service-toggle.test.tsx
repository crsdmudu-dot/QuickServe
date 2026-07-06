/**
 * Tests for FavoriteServiceToggle.
 *
 * Verifies: active/inactive rendering, onToggle fires with serviceId.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { FavoriteServiceToggle } from '@/components/customer/favorite-service-toggle';

describe('FavoriteServiceToggle', () => {
  it('renders inactive state when active=false', () => {
    render(
      <FavoriteServiceToggle serviceId="plumbing" active={false} onToggle={jest.fn()} />,
    );
    expect(screen.getByTestId('fav-service-inactive')).toBeOnTheScreen();
  });

  it('renders active state when active=true', () => {
    render(
      <FavoriteServiceToggle serviceId="plumbing" active={true} onToggle={jest.fn()} />,
    );
    expect(screen.getByTestId('fav-service-active')).toBeOnTheScreen();
  });

  it('shows hollow heart (♡) when inactive', () => {
    render(
      <FavoriteServiceToggle serviceId="plumbing" active={false} onToggle={jest.fn()} />,
    );
    expect(screen.getByText('♡')).toBeOnTheScreen();
  });

  it('shows filled heart (♥) when active', () => {
    render(
      <FavoriteServiceToggle serviceId="plumbing" active={true} onToggle={jest.fn()} />,
    );
    expect(screen.getByText('♥')).toBeOnTheScreen();
  });

  it('calls onToggle with serviceId when pressed (inactive → active)', () => {
    const onToggle = jest.fn();
    render(
      <FavoriteServiceToggle serviceId="plumbing" active={false} onToggle={onToggle} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('plumbing');
  });

  it('calls onToggle with serviceId when pressed (active → inactive)', () => {
    const onToggle = jest.fn();
    render(
      <FavoriteServiceToggle serviceId="house-cleaning" active={true} onToggle={onToggle} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Remove from favorites' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('house-cleaning');
  });

  it('has accessible role=button', () => {
    render(
      <FavoriteServiceToggle serviceId="plumbing" active={false} onToggle={jest.fn()} />,
    );
    expect(screen.getByRole('button')).toBeOnTheScreen();
  });
});
