/**
 * src/app/(admin-web)/operations/new.tsx — Operations Portal: Create Case
 *
 * Accepts optional context prefill from query params:
 *   booking_id, customer_id, provider_id, payment_id, review_id
 *
 * Passes them to <CreateCaseForm initial={...}> so the new case is
 * automatically linked to the originating entity.
 *
 * On creation, navigates to the case detail screen.
 *
 * Admin-web only. Operations data is never exposed to customer/provider apps.
 */

import { useLocalSearchParams, router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PageMeta } from '@/components/admin-web/page-meta';
import { CreateCaseForm } from '@/components/admin-web/operations/create-case-form';
import { Spacing } from '@/constants/theme';

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
});

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebOperationsNewScreen() {
  const {
    booking_id: bookingId,
    customer_id: customerId,
    provider_id: providerId,
    payment_id: paymentId,
    review_id: reviewId,
  } = useLocalSearchParams<{
    booking_id?: string;
    customer_id?: string;
    provider_id?: string;
    payment_id?: string;
    review_id?: string;
  }>();

  // Build only the ids that are present so CreateCaseForm's context display
  // only shows what is actually linked.
  const initial = {
    ...(bookingId  ? { bookingId }  : {}),
    ...(customerId ? { customerId } : {}),
    ...(providerId ? { providerId } : {}),
    ...(paymentId  ? { paymentId }  : {}),
    ...(reviewId   ? { reviewId }   : {}),
  };

  function handleCreated(id: string) {
    router.replace(`/(admin-web)/operations/${id}` as Href);
  }

  return (
    <View style={styles.container}>
      <PageMeta title="New support case" />
      <CreateCaseForm initial={initial} onCreated={handleCreated} />
    </View>
  );
}
