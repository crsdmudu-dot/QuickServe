import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PhotoGallery } from '@/components/ui/photo-gallery';
import { type BookingPhotoView } from '@/lib/photos';

// Factory for a minimal BookingPhotoView.
function makePhoto(id: string, signedUrl: string | null = 'https://x'): BookingPhotoView {
  return {
    id,
    booking_id: 'bk1',
    uploaded_by: 'u1',
    photo_url: `booking-photos/bk1/${id}.jpg`,
    photo_type: 'before',
    caption: null,
    is_verified: false,
    created_at: '2026-01-01T00:00:00Z',
    signedUrl,
  };
}

describe('PhotoGallery', () => {
  it('shows "No photos yet" when the array is empty', () => {
    render(<PhotoGallery photos={[]} />);
    expect(screen.getByText('No photos yet')).toBeOnTheScreen();
  });

  it('renders a photo-image for each photo in the list', () => {
    render(<PhotoGallery photos={[makePhoto('p1'), makePhoto('p2')]} />);
    // getAllByTestId throws if none found, so this also asserts presence.
    expect(screen.getAllByTestId('photo-image')).toHaveLength(2);
  });

  it('renders the renderActions output under each photo', () => {
    const renderActions = () => <Text>Delete</Text>;
    render(<PhotoGallery photos={[makePhoto('p1'), makePhoto('p2')]} renderActions={renderActions} />);
    expect(screen.getAllByText('Delete')).toHaveLength(2);
  });

  it('does not show "No photos yet" when photos are present', () => {
    render(<PhotoGallery photos={[makePhoto('p1')]} />);
    expect(screen.queryByText('No photos yet')).toBeNull();
  });
});
