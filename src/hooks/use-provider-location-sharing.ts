import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '@/auth/auth-context';
import { upsertProviderLocation, clearProviderLocation } from '@/lib/tracking';
import type { BookingStatus } from '@/constants/booking-status';

type SharingBooking = { id: string; status: BookingStatus; assigned_provider_id: string | null };
type Permission = 'granted' | 'denied' | 'undetermined';

/** Foreground location sharing for the assigned provider of an ACTIVE booking.
 *  Active only when: isFocused AND status in (on_the_way,in_progress) AND the signed-in user IS the
 *  assigned provider. Starts a battery-conscious watcher → upsertProviderLocation. Stops on
 *  inactive/unmount; clears the row on completion/cancellation. Never throws. No background. */
export function useProviderLocationSharing(
  booking: SharingBooking | null,
  isFocused: boolean,
): { sharing: boolean; permission: Permission } {
  const { session } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [permission, setPermission] = useState<Permission>('undetermined');
  const prevStatusRef = useRef<BookingStatus | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const uid = session?.user?.id;
        const isAssigned = !!booking && booking.assigned_provider_id === uid;
        const isActiveStatus =
          !!booking &&
          (booking.status === 'on_the_way' || booking.status === 'in_progress');
        const isActive = !!booking && isFocused && isAssigned && isActiveStatus;

        // Detect transition to terminal status and clear location
        const prevStatus = prevStatusRef.current;
        if (
          booking &&
          (booking.status === 'completed' || booking.status === 'cancelled') &&
          prevStatus !== null &&
          prevStatus !== booking.status
        ) {
          void clearProviderLocation(booking.id);
        }
        // Update prevStatus ref
        prevStatusRef.current = booking?.status ?? null;

        if (!isActive) {
          // Stop any existing watcher
          if (subRef.current) {
            subRef.current.remove();
            subRef.current = null;
          }
          if (active) setSharing(false);
          return;
        }

        // Request foreground permission
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;

        if (status !== 'granted') {
          setPermission('denied');
          setSharing(false);
          return;
        }

        setPermission('granted');

        // Start the location watcher
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 8000,
            distanceInterval: 25,
          },
          (pos) => {
            void upsertProviderLocation(booking.id, {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              heading: pos.coords.heading ?? null,
              speed: pos.coords.speed ?? null,
            });
          },
        );

        if (!active) {
          // Unmounted before watcher resolved — clean up immediately
          sub.remove();
          return;
        }

        subRef.current = sub;
        setSharing(true);
      } catch {
        // Never crash — gracefully degrade
        if (active) setSharing(false);
      }
    }

    void run();

    return () => {
      active = false;
      if (subRef.current) {
        subRef.current.remove();
        subRef.current = null;
      }
      setSharing(false);
    };
  }, [booking?.id, booking?.status, isFocused, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sharing, permission };
}
