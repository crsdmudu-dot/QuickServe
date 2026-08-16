/**
 * service-details-form.tsx — THE generic Service Details renderer.
 *
 * One component renders every service. There are no per-service screens: everything comes from
 * SERVICE_FORMS (V1.2) and the pure logic in src/booking/service-details-form.ts (visibility,
 * pruning, validation). Adding or changing a service is a configuration change, never a UI one.
 *
 * Internal vocabulary (variant, issue, schema, form_version, snapshot, machine keys) never
 * reaches the customer — only `label`, `hint`, `helpText` and `disclaimer` from the config do.
 */

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import type { Question, ServiceForm } from '@/constants/service-forms';
import type { ItemUnit } from '@/lib/service-details';
import {
  newDraftLine,
  optionsFor,
  setAnswer,
  toggleMulti,
  validateItems,
  visibleNotices,
  visibleQuestions,
  type DraftItemLine,
  type Errors,
  type FormState,
} from '@/booking/service-details-form';

export type ServiceDetailsFormProps = {
  form: ServiceForm;
  state: FormState;
  onChange: (next: FormState) => void;
  /** Shown only after the customer has attempted to continue. */
  errors: Errors;
  /**
   * Optional photo hooks. These reuse the booking draft's EXISTING issue-photo mechanism (the
   * same array the Notes step writes to, uploaded after creation) — no new media subsystem. When
   * omitted, or when the config sets `media.enabled: false`, no media UI renders at all.
   */
  photos?: string[];
  onAddPhoto?: () => void;
  onRemovePhoto?: (uri: string) => void;
};

/** Formats a Date as a short local time string for display and storage. */
function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ServiceDetailsForm({
  form,
  state,
  onChange,
  errors,
  photos,
  onAddPhoto,
  onRemovePhoto,
}: ServiceDetailsFormProps) {
  const theme = useTheme();
  const [iosTimeFor, setIosTimeFor] = useState<string | null>(null);

  const { answers, lines } = state;
  const questions = visibleQuestions(form, answers);
  const notices = visibleNotices(form, answers);

  const update = (key: string, value: Parameters<typeof setAnswer>[3]) =>
    onChange({ ...state, answers: setAnswer(form, answers, key, value) });

  const updateLines = (next: DraftItemLine[]) => onChange({ ...state, lines: next });

  // ── Item list ───────────────────────────────────────────────────────────────

  function renderItemList(q: Question) {
    const spec = q.itemList!;
    const itemErrors = validateItems(q, lines);
    return (
      <View key={q.key} style={styles.block} testID={`question-${q.key}`}>
        <SectionHeader title={q.label} />
        {q.helpText ? (
          <Text variant="caption" color="textSecondary">
            {q.helpText}
          </Text>
        ) : null}

        {lines.map((line, index) => (
          <View key={line.line_id} style={[styles.itemCard, { borderColor: theme.border }]}>
            <View style={styles.itemHeader}>
              <Text variant="caption" color="textSecondary">
                Item {index + 1}
              </Text>
              {lines.length > 1 && (
                <TouchableOpacity
                  onPress={() => updateLines(lines.filter((l) => l.line_id !== line.line_id))}
                  testID={`remove-item-${line.line_id}`}
                >
                  <Text variant="caption" color="error">
                    Remove
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Input
              testID={`item-name-${line.line_id}`}
              label="Item"
              value={line.name}
              onChangeText={(name) =>
                updateLines(lines.map((l) => (l.line_id === line.line_id ? { ...l, name } : l)))
              }
              placeholder="e.g. Milk"
              error={errors[q.key] ? itemErrors.lines[line.line_id] : undefined}
            />
            <Input
              testID={`item-qty-${line.line_id}`}
              label="Quantity"
              value={line.qty}
              keyboardType="numeric"
              onChangeText={(qty) => updateLines(lines.map((l) => (l.line_id === line.line_id ? { ...l, qty } : l)))}
              placeholder="e.g. 2"
            />

            <Text variant="caption" color="textSecondary">
              Unit (optional)
            </Text>
            <View style={styles.optionRow}>
              {spec.units.map((u: ItemUnit) => (
                <Button
                  key={u}
                  label={u}
                  variant={line.unit === u ? 'primary' : 'secondary'}
                  testID={`unit-${line.line_id}-${u}`}
                  onPress={() =>
                    updateLines(
                      lines.map((l) => (l.line_id === line.line_id ? { ...l, unit: l.unit === u ? null : u } : l)),
                    )
                  }
                />
              ))}
            </View>

            {spec.fields.brand && (
              <Input
                label="Brand or preference (optional)"
                value={line.brand}
                onChangeText={(brand) =>
                  updateLines(lines.map((l) => (l.line_id === line.line_id ? { ...l, brand } : l)))
                }
              />
            )}
            {spec.fields.note && (
              <Input
                label="Note (optional)"
                value={line.note}
                onChangeText={(note) => updateLines(lines.map((l) => (l.line_id === line.line_id ? { ...l, note } : l)))}
              />
            )}
          </View>
        ))}

        <Button
          label={spec.addLabel}
          variant="secondary"
          testID="add-item"
          onPress={() => updateLines([...lines, newDraftLine()])}
        />
        {errors[q.key] ? (
          <Text variant="caption" color="error" testID={`error-${q.key}`}>
            {errors[q.key]}
          </Text>
        ) : null}
      </View>
    );
  }

  // ── Time ────────────────────────────────────────────────────────────────────

  function openTime(q: Question) {
    const apply = (value: string) => update(q.key, value);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: new Date(),
        mode: 'time',
        onChange: (_e, date) => {
          if (date) apply(formatTime(date));
        },
      });
    } else {
      setIosTimeFor(q.key);
    }
  }

  // ── One question ────────────────────────────────────────────────────────────

  function renderQuestion(q: Question) {
    if (q.kind === 'itemlist') return renderItemList(q);

    const value = answers[q.key];
    const error = errors[q.key];
    const options = optionsFor(form, q, answers);

    const header = (
      <>
        <Text variant="body" style={styles.questionLabel}>
          {q.label}
          {q.required ? ' *' : ''}
        </Text>
        {q.helpText ? (
          <Text variant="caption" color="textSecondary">
            {q.helpText}
          </Text>
        ) : null}
      </>
    );

    const errorLine = error ? (
      <Text variant="caption" color="error" testID={`error-${q.key}`}>
        {error}
      </Text>
    ) : null;

    const disclaimer = q.disclaimer ? (
      <Text variant="caption" color="textSecondary" testID={`disclaimer-${q.key}`}>
        {q.disclaimer}
      </Text>
    ) : null;

    if (q.kind === 'single' || q.kind === 'multi') {
      const selected = q.kind === 'multi' && Array.isArray(value) ? (value as string[]) : [];
      return (
        <View key={q.key} style={styles.block} testID={`question-${q.key}`}>
          {header}
          <View style={styles.optionColumn}>
            {options.map((o) => {
              const isOn = q.kind === 'multi' ? selected.includes(o.key) : value === o.key;
              return (
                <View key={o.key}>
                  <Button
                    label={o.label}
                    fullWidth
                    variant={isOn ? 'primary' : 'secondary'}
                    testID={`option-${q.key}-${o.key}`}
                    onPress={() =>
                      q.kind === 'multi'
                        ? onChange({ ...state, answers: toggleMulti(form, answers, q, o.key) })
                        : update(q.key, o.key)
                    }
                  />
                  {o.hint ? (
                    <Text variant="caption" color="textSecondary" style={styles.optionHint}>
                      {o.hint}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          {disclaimer}
          {errorLine}
        </View>
      );
    }

    if (q.kind === 'boolean') {
      const on = value === true;
      return (
        <View key={q.key} style={styles.block} testID={`question-${q.key}`}>
          <Button
            label={`${on ? '☑' : '☐'}  ${q.label}`}
            variant={on ? 'primary' : 'secondary'}
            fullWidth
            testID={`toggle-${q.key}`}
            onPress={() => update(q.key, !on)}
          />
          {errorLine}
        </View>
      );
    }

    if (q.kind === 'time') {
      return (
        <View key={q.key} style={styles.block} testID={`question-${q.key}`}>
          {header}
          <Button
            label={typeof value === 'string' && value ? value : 'Choose a time'}
            variant="secondary"
            fullWidth
            testID={`time-${q.key}`}
            onPress={() => openTime(q)}
          />
          {Platform.OS === 'ios' && iosTimeFor === q.key && (
            <DateTimePicker
              value={new Date()}
              mode="time"
              display="spinner"
              onChange={(_e, date) => {
                setIosTimeFor(null);
                if (date) update(q.key, formatTime(date));
              }}
            />
          )}
          {errorLine}
        </View>
      );
    }

    // number | text — Input renders its own inline error, tagged `input-<key>-error`.
    return (
      <View key={q.key} style={styles.block} testID={`question-${q.key}`}>
        <Input
          testID={`input-${q.key}`}
          label={`${q.label}${q.required ? ' *' : ''}`}
          value={value === undefined || value === null ? '' : String(value)}
          onChangeText={(text) => update(q.key, q.kind === 'number' ? (text === '' ? null : Number(text)) : text)}
          keyboardType={q.kind === 'number' ? 'numeric' : 'default'}
          placeholder={q.placeholder}
          helperText={q.helpText}
          error={error}
          multiline={q.kind === 'text' && q.key.includes('description')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {notices.map((n) => (
        <View
          key={n.key}
          testID={`notice-${n.key}`}
          style={[
            styles.notice,
            { borderColor: n.tone === 'warn' ? theme.error : theme.border, backgroundColor: theme.surface },
          ]}
        >
          <Text variant="body" style={styles.noticeTitle}>
            {n.title}
          </Text>
          <Text variant="caption" color="textSecondary">
            {n.body}
          </Text>
        </View>
      ))}

      {questions.map(renderQuestion)}

      {/* ── Optional photos, purely config-driven. Services with media.enabled === false
             (Massage, Medicine, Food, Haircuts) render nothing here. Always skippable. ── */}
      {form.media.enabled && onAddPhoto && (
        <View style={styles.block} testID="service-details-media">
          <SectionHeader title={form.media.strong ? 'Add a photo' : 'Add a photo (optional)'} />
          {form.media.prompt ? (
            <Text variant="caption" color="textSecondary">
              {form.media.prompt}
            </Text>
          ) : null}
          <Button label="Pick photo from library" variant="secondary" testID="add-photo" onPress={onAddPhoto} />
          {(photos ?? []).map((uri) => (
            <View key={uri} style={styles.itemHeader}>
              <Text variant="caption" numberOfLines={1} style={styles.photoUri}>
                {uri}
              </Text>
              <TouchableOpacity onPress={() => onRemovePhoto?.(uri)} testID={`remove-photo-${uri}`}>
                <Text variant="caption" color="error">
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  block: { gap: Spacing.one },
  questionLabel: { fontWeight: '600' },
  optionColumn: { gap: Spacing.one },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  optionHint: { marginTop: 2, marginLeft: Spacing.one },
  itemCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photoUri: { flex: 1 },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  noticeTitle: { fontWeight: '600' },
});
