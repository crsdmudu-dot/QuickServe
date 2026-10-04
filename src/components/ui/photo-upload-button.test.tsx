import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PhotoUploadButton } from '@/components/ui/photo-upload-button';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock expo-image-picker so tests run without native modules. The permission request stays mocked
// only so the tests can prove it is never called (C-124-7).
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// Mock @/lib/photos to avoid real Supabase calls.
jest.mock('@/lib/photos', () => ({
  uploadBookingPhoto: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { uploadBookingPhoto } from '@/lib/photos';

// Typed helper references to the mocked functions.
const mockRequestPermission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockUpload = uploadBookingPhoto as jest.Mock;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PhotoUploadButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls uploadBookingPhoto with correct args and fires onUploaded after a successful pick', async () => {
    // Simulate user picking an image
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://x.jpg' }] });
    // Simulate a successful upload
    mockUpload.mockResolvedValue({ ok: true });

    const onUploaded = jest.fn();
    render(
      <PhotoUploadButton
        bookingId="bk1"
        photoType="issue"
        label="Upload Photo"
        onUploaded={onUploaded}
      />,
    );

    fireEvent.press(screen.getByText('Upload Photo'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledWith({ bookingId: 'bk1', uri: 'file://x.jpg', photoType: 'issue' });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
  });

  it('does not call uploadBookingPhoto when the user cancels the picker', async () => {
    // Simulate user cancelling the picker
    mockLaunchLibrary.mockResolvedValue({ canceled: true });

    render(
      <PhotoUploadButton bookingId="bk1" photoType="issue" label="Upload Photo" />,
    );

    fireEvent.press(screen.getByText('Upload Photo'));

    // Give any pending promises a tick to settle
    await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalledTimes(1));
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('opens the images-only system picker without asking for photo-library permission', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true });

    render(
      <PhotoUploadButton bookingId="bk1" photoType="issue" label="Upload Photo" />,
    );

    fireEvent.press(screen.getByText('Upload Photo'));

    await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalledWith({ mediaTypes: ['images'] }));
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('shows an inline error when the upload fails', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://x.jpg' }] });
    mockUpload.mockResolvedValue({ ok: false, error: 'Upload failed. Please try again.' });

    render(
      <PhotoUploadButton bookingId="bk1" photoType="issue" label="Upload Photo" />,
    );

    fireEvent.press(screen.getByText('Upload Photo'));

    await waitFor(() => expect(screen.getByText('Upload failed. Please try again.')).toBeOnTheScreen());
  });
});
