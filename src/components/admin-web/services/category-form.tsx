/**
 * category-form.tsx
 *
 * Controlled form for creating and editing a service category.
 *
 * Create mode:
 *   - slug (required, format-validated, create-only)
 *   - name (required)
 *   - icon picker (predefined only)
 *   - color picker (design-system palette only)
 *
 * Edit mode:
 *   - slug shown READ-ONLY / disabled (immutable after creation)
 *   - name, icon, color are editable
 *
 * On submit: calls adminCreateCategory or adminUpdateCategory.
 * Surfaces friendly errors inline (duplicate slug, duplicate name, format errors).
 *
 * Props:
 *   mode         — 'create' | 'edit'
 *   initial      — pre-populated values for edit mode (pass the DbCategory)
 *   onSuccess    — called after a successful save (caller reloads the list)
 *   onCancel     — called when the user cancels
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import {
  adminCreateCategory,
  adminUpdateCategory,
  type DbCategory,
} from '@/lib/services-catalog';
import { ColorPicker } from './color-picker';
import { IconPicker } from './icon-picker';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CategoryFormProps = {
  mode: 'create' | 'edit';
  initial?: DbCategory;
  onSuccess: () => void;
  onCancel: () => void;
};

// Slug format: lowercase letters, numbers, hyphens; at least 1 character.
const SLUG_REGEX = /^[a-z0-9-]+$/;

// ── Component ─────────────────────────────────────────────────────────────────

export function CategoryForm({ mode, initial, onSuccess, onCancel }: CategoryFormProps) {
  const [slug, setSlug]   = useState(initial?.slug ?? '');
  const [name, setName]   = useState(initial?.name ?? '');
  const [icon, setIcon]   = useState(initial?.icon ?? '');
  const [color, setColor] = useState(initial?.color ?? '');

  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [slugError, setSlugError] = useState('');
  const [nameError, setNameError] = useState('');

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    let ok = true;
    setSlugError('');
    setNameError('');
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
        result = await adminCreateCategory({
          slug: slug.trim(),
          name: name.trim(),
          icon: icon || undefined,
          color: color || undefined,
        });
      } else {
        result = await adminUpdateCategory({
          id: initial!.id,
          name: name.trim(),
          icon: icon || undefined,
          color: color || undefined,
        });
      }

      if (result.ok) {
        onSuccess();
      } else {
        // Surface friendly error; try to route to the right field
        const msg = result.error ?? 'Could not save. Please try again.';
        if (msg.toLowerCase().includes('slug')) {
          setSlugError(msg);
        } else if (msg.toLowerCase().includes('name')) {
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

  const canSave = !saving;

  return (
    <View style={styles.container} testID="category-form">
      <Text variant="heading" color="text" weight="semibold">
        {mode === 'create' ? 'New category' : 'Edit category'}
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
          placeholder="e.g. home-services"
          autoCapitalize="none"
          error={slugError || undefined}
        />
      ) : (
        <View style={styles.readOnlyField} testID="category-slug-readonly">
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
        placeholder="e.g. Home Services"
        error={nameError || undefined}
      />

      {/* Icon picker */}
      <IconPicker value={icon} onSelect={setIcon} />

      {/* Color picker */}
      <ColorPicker value={color} onSelect={setColor} />

      {/* General error */}
      {error ? (
        <Text variant="caption" color="error" testID="category-form-error">
          {error}
        </Text>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          label={saving ? 'Saving…' : mode === 'create' ? 'Create category' : 'Save changes'}
          variant="primary"
          size="md"
          onPress={() => void handleSave()}
          disabled={!canSave}
          // Note: testID not supported by Button; use accessibilityLabel for test targeting
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
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
    marginTop: Spacing.two,
  },
});
