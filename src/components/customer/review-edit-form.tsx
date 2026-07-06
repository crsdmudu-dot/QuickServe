// review-edit-form.tsx — Pre-filled form for editing an existing review.
// Calls ONLY editReview from @/lib/reviews — no scoring math, no other mutation.
// Overall rating >= 1 is required to submit.
// The parent should call canEditReview before rendering this — but this form
// also guards (shows a message if the review is not editable).

import { useState } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Review, REVIEW_TAGS, editReview, canEditReview } from '@/lib/reviews';
import { Text } from '@/components/ui/text';
import { StarInput } from '@/components/ui/star-input';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ── Props ──────────────────────────────────────────────────────────────────────

export type ReviewEditFormProps = {
  review: Review;
  onSaved: () => void;
  onCancel?: () => void;
};

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORY_FIELDS: { label: string; key: keyof Review; idPrefix: string }[] = [
  { label: 'Quality',         key: 'quality_rating',       idPrefix: 'quality'       },
  { label: 'Punctuality',     key: 'punctuality_rating',   idPrefix: 'punctuality'   },
  { label: 'Communication',   key: 'communication_rating', idPrefix: 'communication' },
  { label: 'Professionalism', key: 'professionalism_rating', idPrefix: 'professionalism' },
  { label: 'Value',           key: 'value_rating',         idPrefix: 'value'         },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function ReviewEditForm({ review, onSaved, onCancel }: ReviewEditFormProps) {
  const theme = useTheme();

  // Edit-window guard (display-only — server is the authority)
  const withinWindow = canEditReview(review);

  // ── Form state (pre-filled from review) ─────────────────────────────────────
  const [rating,            setRating]           = useState(review.rating);
  const [qualityRating,     setQualityRating]    = useState(review.quality_rating       ?? 0);
  const [punctualityRating, setPunctualityRating]= useState(review.punctuality_rating   ?? 0);
  const [communicationRating, setCommunicationRating] = useState(review.communication_rating ?? 0);
  const [professionalismRating, setProfessionalismRating] = useState(review.professionalism_rating ?? 0);
  const [valueRating,       setValueRating]      = useState(review.value_rating         ?? 0);
  const [wouldRecommend,    setWouldRecommend]   = useState<boolean | null>(review.would_recommend ?? null);
  const [selectedTags,      setSelectedTags]     = useState<string[]>(review.tags ?? []);
  const [comment,           setComment]          = useState(review.comment ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Tag toggle ────────────────────────────────────────────────────────────────

  function toggleTag(key: string) {
    setSelectedTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setError(null);

    // Client-side guard: overall rating required
    if (rating < 1) {
      setError('Please select an overall rating before saving.');
      return;
    }

    setSubmitting(true);

    const result = await editReview({
      reviewId: review.id,
      rating,
      comment: comment.trim() || undefined,
      qualityRating:         qualityRating         > 0 ? qualityRating         : undefined,
      punctualityRating:     punctualityRating     > 0 ? punctualityRating     : undefined,
      communicationRating:   communicationRating   > 0 ? communicationRating   : undefined,
      professionalismRating: professionalismRating > 0 ? professionalismRating : undefined,
      valueRating:           valueRating           > 0 ? valueRating           : undefined,
      wouldRecommend:        wouldRecommend ?? undefined,
      tags:                  selectedTags,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not update review. Please try again.');
      return;
    }

    onSaved();
  }

  // ── Edit window closed ────────────────────────────────────────────────────────

  if (!withinWindow) {
    return (
      <View
        testID="edit-window-closed"
        style={[styles.windowClosed, { backgroundColor: theme.warningSurface }]}
      >
        <Text variant="body" color="warning" weight="medium">
          Edit window closed
        </Text>
        <Text variant="caption" color="textSecondary">
          Reviews can only be edited within 24 hours of submission.
        </Text>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.form} testID="review-edit-form">
      {/* ── Overall rating ── */}
      <View style={styles.section}>
        <Text variant="label" weight="semibold">
          Overall rating *
        </Text>
        <StarInput
          value={rating}
          onChange={setRating}
          idPrefix="overall"
        />
      </View>

      {/* ── Category ratings ── */}
      <View style={styles.section}>
        <Text variant="label" weight="semibold">
          Category ratings (optional)
        </Text>
        {CATEGORY_FIELDS.map(({ label, idPrefix }) => {
          const currentVal =
            idPrefix === 'quality'        ? qualityRating         :
            idPrefix === 'punctuality'    ? punctualityRating     :
            idPrefix === 'communication'  ? communicationRating   :
            idPrefix === 'professionalism'? professionalismRating :
                                           valueRating;

          const setter =
            idPrefix === 'quality'        ? setQualityRating         :
            idPrefix === 'punctuality'    ? setPunctualityRating     :
            idPrefix === 'communication'  ? setCommunicationRating   :
            idPrefix === 'professionalism'? setProfessionalismRating :
                                           setValueRating;

          return (
            <View key={idPrefix} style={styles.categoryRow}>
              <Text variant="caption" style={styles.categoryLabel}>
                {label}
              </Text>
              <StarInput value={currentVal} onChange={setter} idPrefix={idPrefix} />
            </View>
          );
        })}
      </View>

      {/* ── Would recommend ── */}
      <View style={styles.section}>
        <Text variant="label" weight="semibold">
          Would you recommend this provider?
        </Text>
        <View style={styles.recommendRow}>
          {([true, false] as const).map((val) => {
            const isSelected = wouldRecommend === val;
            return (
              <Pressable
                key={String(val)}
                testID={val ? 'recommend-yes' : 'recommend-no'}
                onPress={() => setWouldRecommend(isSelected ? null : val)}
                style={[
                  styles.recommendChip,
                  {
                    backgroundColor: isSelected ? theme.primaryTint : theme.backgroundElement,
                    borderColor:     isSelected ? theme.primary      : theme.border,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  color={isSelected ? 'primary' : 'textSecondary'}
                  weight={isSelected ? 'semibold' : 'regular'}
                >
                  {val ? '👍 Yes' : '👎 No'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Tags ── */}
      <View style={styles.section}>
        <Text variant="label" weight="semibold">
          Tags (optional)
        </Text>
        <View style={styles.tagsRow}>
          {REVIEW_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag.key);
            return (
              <Pressable
                key={tag.key}
                testID={`tag-${tag.key}`}
                onPress={() => toggleTag(tag.key)}
                style={[
                  styles.tagChip,
                  {
                    backgroundColor: isSelected
                      ? (tag.sentiment === 'positive' ? theme.primaryTint : theme.errorSurface)
                      : theme.backgroundElement,
                    borderColor: isSelected
                      ? (tag.sentiment === 'positive' ? theme.primary : theme.error)
                      : theme.border,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  color={
                    isSelected
                      ? tag.sentiment === 'positive' ? 'primary' : 'error'
                      : 'textSecondary'
                  }
                >
                  {tag.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Comment ── */}
      <Input
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        placeholder="Tell us about your experience…"
        multiline
      />

      {/* ── Error message ── */}
      {error && (
        <Text testID="edit-error" variant="caption" color="error">
          {error}
        </Text>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <Button
          label={submitting ? 'Saving…' : 'Save changes'}
          onPress={handleSubmit}
          disabled={submitting}
          loading={submitting}
          fullWidth
        />
        {onCancel && (
          <Button
            label="Cancel"
            variant="secondary"
            onPress={onCancel}
            fullWidth
          />
        )}
      </View>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  categoryLabel: {
    width: 110,
  },
  recommendRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  recommendChip: {
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  tagChip: {
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  windowClosed: {
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
