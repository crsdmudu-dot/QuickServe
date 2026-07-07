/**
 * service-form.tsx
 *
 * Controlled form for creating and editing a service.
 *
 * Create mode:
 *   - slug (required, format-validated, create-only)
 *   - name (required)
 *   - category (required; select from the provided categories list)
 *   - short_description, full_description (optional)
 *   - icon picker, color picker
 *   - estimated_duration, starting_price_text (optional)
 *
 * Edit mode:
 *   - slug shown READ-ONLY / disabled (immutable after creation)
 *   - all other fields editable + 5 boolean toggles:
 *       featured / trending / emergency_available / inspection_required / available_24_7
 *
 * Surfaces friendly inline errors (duplicate slug/name, validation failures).
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import {
  adminCreateService,
  adminUpdateService,
  type DbCategory,
  type DbService,
} from '@/lib/services-catalog';
import { ColorPicker } from './color-picker';
import { IconPicker } from './icon-picker';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ServiceFormProps = {
  mode: 'create' | 'edit';
  initial?: DbService;
  categories: DbCategory[];
  onSuccess: () => void;
  onCancel: () => void;
};

const SLUG_REGEX = /^[a-z0-9-]+$/;

// ── Small toggle row helper ────────────────────────────────────────────────────

function ToggleRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text variant="label" color="text" style={styles.toggleLabel}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} testID={testID} />
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ServiceForm({
  mode,
  initial,
  categories,
  onSuccess,
  onCancel,
}: ServiceFormProps) {
  // Core fields
  const [slug,       setSlug]       = useState(initial?.slug ?? '');
  const [name,       setName]       = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [shortDesc,  setShortDesc]  = useState(initial?.short_description ?? '');
  const [fullDesc,   setFullDesc]   = useState(initial?.full_description ?? '');
  const [icon,       setIcon]       = useState(initial?.icon ?? '');
  const [color,      setColor]      = useState(initial?.color ?? '');
  const [duration,   setDuration]   = useState(initial?.estimated_duration ?? '');
  const [priceText,  setPriceText]  = useState(initial?.starting_price_text ?? '');

  // 5 toggles (edit mode)
  const [featured,    setFeatured]    = useState(initial?.featured ?? false);
  const [trending,    setTrending]    = useState(initial?.trending ?? false);
  const [emergency,   setEmergency]   = useState(initial?.emergency_available ?? false);
  const [inspection,  setInspection]  = useState(initial?.inspection_required ?? false);
  const [avail247,    setAvail247]    = useState(initial?.available_24_7 ?? false);

  // UI state
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [slugError,   setSlugError]   = useState('');
  const [nameError,   setNameError]   = useState('');
  const [catError,    setCatError]    = useState('');

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    let ok = true;
    setSlugError('');
    setNameError('');
    setCatError('');
    setError('');

    if (mode === 'create') {
      if (!slug.trim()) {
        setSlugError('Slug is required.');
        ok = false;
      } else if (!SLUG_REGEX.test(slug.trim())) {
        setSlugError('Slug must be lowercase letters, numbers and hyphens.');
        ok = false;
      }
    }

    if (!name.trim()) {
      setNameError('Name is required.');
      ok = false;
    }

    if (!categoryId) {
      setCatError('Category is required.');
      ok = false;
    }

    return ok;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setError('');
    try {
      let result: { ok: boolean; error?: string };

      if (mode === 'create') {
        result = await adminCreateService({
          slug: slug.trim(),
          name: name.trim(),
          categoryId,
          shortDescription: shortDesc || undefined,
          fullDescription: fullDesc || undefined,
          icon: icon || undefined,
          color: color || undefined,
          estimatedDuration: duration || undefined,
          startingPriceText: priceText || undefined,
        });
      } else {
        result = await adminUpdateService({
          id: initial!.id,
          name: name.trim(),
          categoryId,
          shortDescription: shortDesc || undefined,
          fullDescription: fullDesc || undefined,
          icon: icon || undefined,
          color: color || undefined,
          estimatedDuration: duration || undefined,
          startingPriceText: priceText || undefined,
          featured,
          trending,
          emergencyAvailable: emergency,
          inspectionRequired: inspection,
          available247: avail247,
        });
      }

      if (result.ok) {
        onSuccess();
      } else {
        const msg = result.error ?? 'Could not save. Please try again.';
        if (msg.toLowerCase().includes('slug')) {
          setSlugError(msg);
        } else if (msg.toLowerCase().includes('name') || msg.toLowerCase().includes('category')) {
          setNameError(msg);
        } else {
          setError(msg);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container} testID="service-form">
      <Text variant="heading" color="text" weight="semibold">
        {mode === 'create' ? 'New service' : 'Edit service'}
      </Text>

      {/* Slug — create-only; read-only on edit */}
      {mode === 'create' ? (
        <Input
          label="Slug (immutable after creation)"
          value={slug}
          onChangeText={(t) => {
            setSlug(t.toLowerCase());
            setSlugError('');
          }}
          placeholder="e.g. house-cleaning"
          autoCapitalize="none"
          error={slugError || undefined}
        />
      ) : (
        <View style={styles.readOnlyField} testID="service-slug-readonly">
          <Text variant="label" color="textSecondary">Slug (read-only)</Text>
          <Text variant="body" color="text">{initial?.slug}</Text>
        </View>
      )}

      {/* Name */}
      <Input
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameError('');
        }}
        placeholder="e.g. House Cleaning"
        error={nameError || undefined}
      />

      {/* Category picker — rendered as tappable chip buttons */}
      <View style={styles.fieldGroup}>
        <Text variant="label" color="textSecondary">
          Category
        </Text>
        <View style={styles.categoryChips}>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              label={cat.name}
              variant={categoryId === cat.id ? 'primary' : 'secondary'}
              size="md"
              onPress={() => {
                setCategoryId(cat.id);
                setCatError('');
              }}
            />
          ))}
        </View>
        {catError ? (
          <Text variant="caption" color="error">
            {catError}
          </Text>
        ) : null}
      </View>

      {/* Short description */}
      <Input
        label="Short description (optional)"
        value={shortDesc}
        onChangeText={setShortDesc}
        placeholder="One-line summary"
        multiline
      />

      {/* Full description */}
      <Input
        label="Full description (optional)"
        value={fullDesc}
        onChangeText={setFullDesc}
        placeholder="Detailed description…"
        multiline
      />

      {/* Icon picker */}
      <IconPicker value={icon} onSelect={setIcon} />

      {/* Color picker */}
      <ColorPicker value={color} onSelect={setColor} />

      {/* Estimated duration */}
      <Input
        label="Estimated duration (optional)"
        value={duration}
        onChangeText={setDuration}
        placeholder="e.g. 2-3 hours"
      />

      {/* Starting price text */}
      <Input
        label="Starting price text (optional)"
        value={priceText}
        onChangeText={setPriceText}
        placeholder="e.g. From KES 1,500"
      />

      {/* 5 toggles — edit mode only */}
      {mode === 'edit' && (
        <View style={styles.togglesSection}>
          <Text variant="label" color="textSecondary" style={styles.togglesHeading}>
            Feature flags
          </Text>
          <ToggleRow
            label="Featured"
            value={featured}
            onChange={setFeatured}
            testID="toggle-featured"
          />
          <ToggleRow
            label="Trending"
            value={trending}
            onChange={setTrending}
            testID="toggle-trending"
          />
          <ToggleRow
            label="Emergency available"
            value={emergency}
            onChange={setEmergency}
            testID="toggle-emergency"
          />
          <ToggleRow
            label="Inspection required"
            value={inspection}
            onChange={setInspection}
            testID="toggle-inspection"
          />
          <ToggleRow
            label="Available 24/7"
            value={avail247}
            onChange={setAvail247}
            testID="toggle-avail247"
          />
        </View>
      )}

      {/* General error */}
      {error ? (
        <Text variant="caption" color="error" testID="service-form-error">
          {error}
        </Text>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          label={saving ? 'Saving…' : mode === 'create' ? 'Create service' : 'Save changes'}
          variant="primary"
          size="md"
          onPress={() => void handleSave()}
          disabled={saving}
        />
        <Button
          label="Cancel"
          variant="ghost"
          size="md"
          onPress={onCancel}
          disabled={saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  readOnlyField: {
    gap: Spacing.one,
  },
  fieldGroup: {
    gap: Spacing.two,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  togglesSection: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  togglesHeading: {
    marginBottom: Spacing.one,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  toggleLabel: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
    marginTop: Spacing.two,
  },
});
