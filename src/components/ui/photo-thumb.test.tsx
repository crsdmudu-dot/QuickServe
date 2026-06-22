import { render, screen } from '@testing-library/react-native';
import { PhotoThumb } from '@/components/ui/photo-thumb';
import { type BookingPhotoView } from '@/lib/photos';

// Minimal BookingPhotoView fixture — only the fields PhotoThumb uses.
const mk: BookingPhotoView = {
  id: 'p1',
  booking_id: 'bk1',
  uploaded_by: 'u1',
  photo_url: 'booking-photos/bk1/p1.jpg',
  photo_type: 'before',
  caption: null,
  is_verified: false,
  created_at: '2026-01-01T00:00:00Z',
  signedUrl: null,
};

describe('PhotoThumb', () => {
  it('renders an Image with testID photo-image when signedUrl is provided', () => {
    render(<PhotoThumb photo={{ ...mk, signedUrl: 'https://x', photo_type: 'before', is_verified: false }} />);
    expect(screen.getByTestId('photo-image')).toBeOnTheScreen();
  });

  it('shows the correct type label "Before"', () => {
    render(<PhotoThumb photo={{ ...mk, signedUrl: 'https://x', photo_type: 'before', is_verified: false }} />);
    expect(screen.getByText('Before')).toBeOnTheScreen();
  });

  it('shows the verified tick when is_verified is true', () => {
    render(<PhotoThumb photo={{ ...mk, signedUrl: 'https://x', photo_type: 'before', is_verified: true }} />);
    expect(screen.getByText('✓ Verified')).toBeOnTheScreen();
  });

  it('renders a placeholder (no Image) when signedUrl is null', () => {
    render(<PhotoThumb photo={{ ...mk, signedUrl: null }} />);
    expect(screen.getByTestId('photo-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('photo-image')).toBeNull();
  });

  it('does not show the verified tick when is_verified is false', () => {
    render(<PhotoThumb photo={{ ...mk, signedUrl: null, is_verified: false }} />);
    expect(screen.queryByText('✓ Verified')).toBeNull();
  });

  it('shows correct labels for all photo types', () => {
    const types: Array<[BookingPhotoView['photo_type'], string]> = [
      ['issue', 'Issue'],
      ['before', 'Before'],
      ['after', 'After'],
      ['completion', 'Completion'],
    ];
    for (const [type, label] of types) {
      const { unmount } = render(<PhotoThumb photo={{ ...mk, photo_type: type }} />);
      expect(screen.getByText(label)).toBeOnTheScreen();
      unmount();
    }
  });
});
