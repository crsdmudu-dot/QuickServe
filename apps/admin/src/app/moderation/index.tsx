/**
 * src/app/moderation/index.tsx — Web Admin Moderation queue (store-compliance F5.1)
 *
 * Reports from the apps (chat messages, reviews, people) land here, oldest first, so the published
 * 24-hour commitment is worked in order. Each open report shows its age and turns red once it is
 * over 24 hours old.
 *
 * Actions (every one is audited on the server, as the signed-in admin):
 *   - Hide / Unhide the reported chat message or review
 *   - Clear the provider's bio and skills (reported people who are providers)
 *   - Close the report: "Action taken" or "Dismiss", with an optional note
 *   - Suspend or lift the reported customer or provider (F5.6), linked to the report
 *
 * Data comes from admin_get_content_reports (0065), which only answers active admins.
 * Wrapped by AdminShell via the _layout.tsx — this screen only returns its content.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PageMeta } from '@admin/components/page-meta';
import { AccountSuspensionPanel } from '@admin/components/operations/account-suspension-panel';
import { Spacing } from '@/constants/theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  REPORT_REASONS,
  REPORT_RESPONSE_HOURS,
  adminClearProfileText,
  adminGetContentReports,
  adminResolveContentReport,
  adminSetMessageHidden,
  adminSetReviewHidden,
  isOverdue,
  reportAgeHours,
  type ContentReport,
  type ReportStatus,
} from '@/lib/moderation';

const STATUS_FILTERS: { key: ReportStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'actioned', label: 'Action taken' },
  { key: 'dismissed', label: 'Dismissed' },
];

const TARGET_LABELS: Record<ContentReport['target_type'], string> = {
  message: 'Chat message',
  review: 'Review',
  user: 'Person',
};

function reasonLabel(key: string): string {
  return REPORT_REASONS.find((r) => r.key === key)?.label ?? key;
}

/**
 * The apps report a booking photo as a report of the person who uploaded it (C-124-2), and the
 * report does not say which photo. So every person report gets this procedure line.
 */
const PERSON_REPORT_PHOTO_CHECK =
  'This may be about a booking photo. Check the photos on the bookings these two people share, ' +
  'delete any that break the rules (Bookings, then the booking), then decide on suspension.';

// ── One report ─────────────────────────────────────────────────────────────

function ReportCard({
  report,
  onChanged,
}: {
  report: ContentReport;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSuspension, setShowSuspension] = useState(false);
  const overdue = isOverdue(report);
  const canSuspend =
    !!report.reported_user_id && (report.reported_role === 'customer' || report.reported_role === 'provider');
  const age = reportAgeHours(report.created_at);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError('');
    const result = await action();
    setBusy(false);
    if (result.ok) onChanged();
    else setError(result.error ?? 'Something went wrong. Please try again.');
  }

  const isOpen = report.status === 'open';
  const canHide = report.target_type === 'message' || report.target_type === 'review';
  const canClearProfile = report.target_type === 'user' && report.reported_role === 'provider';

  function toggleHidden() {
    const hide = !report.content_hidden;
    return run(() =>
      report.target_type === 'message'
        ? adminSetMessageHidden(report.target_id, hide, report.report_id, note)
        : adminSetReviewHidden(report.target_id, hide, report.report_id, note),
    );
  }

  return (
    <Card elevation="e1" testID={`report-${report.report_id}`}>
      <View style={styles.cardContent}>
        <View style={styles.row}>
          <Text variant="label">{TARGET_LABELS[report.target_type]}</Text>
          <Text variant="caption" color="textSecondary">
            {reasonLabel(report.reason)}
          </Text>
          {isOpen ? (
            <Text
              variant="caption"
              color={overdue ? 'error' : 'textSecondary'}
              testID={`report-age-${report.report_id}`}>
              {overdue ? `Over ${REPORT_RESPONSE_HOURS} h (${age} h)` : `${age} h ago`}
            </Text>
          ) : null}
        </View>

        <Text variant="caption" color="textSecondary">
          Reported: {report.reported_name ?? 'Unknown'}
          {report.reported_role ? ` (${report.reported_role})` : ''} · Reported by:{' '}
          {report.reporter_name ?? 'Unknown'}
          {report.booking_id ? ` · Booking #${report.booking_id.slice(0, 8)}` : ''}
        </Text>

        <Text variant="body" testID={`report-content-${report.report_id}`}>
          {report.content_text ?? '(No text)'}
        </Text>
        {report.target_type === 'user' ? (
          <Text variant="caption" color="textSecondary" testID={`report-photo-check-${report.report_id}`}>
            {PERSON_REPORT_PHOTO_CHECK}
          </Text>
        ) : null}
        {report.content_hidden ? (
          <Text variant="caption" color="error">
            Hidden by moderation
          </Text>
        ) : null}

        {isOpen ? (
          <>
            <Input
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="What you checked or did"
            />
            <View style={styles.row}>
              {canHide ? (
                <Button
                  label={report.content_hidden ? 'Unhide' : 'Hide'}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  testID={`report-toggle-hidden-${report.report_id}`}
                  onPress={toggleHidden}
                />
              ) : null}
              {canClearProfile ? (
                <Button
                  label="Clear bio and skills"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  testID={`report-clear-profile-${report.report_id}`}
                  onPress={() =>
                    run(() => adminClearProfileText(report.target_id, report.report_id, note))
                  }
                />
              ) : null}
              <Button
                label="Action taken"
                size="sm"
                disabled={busy}
                testID={`report-actioned-${report.report_id}`}
                onPress={() =>
                  run(() => adminResolveContentReport(report.report_id, 'actioned', note))
                }
              />
              <Button
                label="Dismiss"
                variant="ghost"
                size="sm"
                disabled={busy}
                testID={`report-dismiss-${report.report_id}`}
                onPress={() =>
                  run(() => adminResolveContentReport(report.report_id, 'dismissed', note))
                }
              />
            </View>
          </>
        ) : (
          <Text variant="caption" color="textSecondary">
            Closed {report.resolved_at ? new Date(report.resolved_at).toLocaleString() : ''}
            {report.resolution_note ? ` · ${report.resolution_note}` : ''}
          </Text>
        )}

        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        {canSuspend ? (
          <>
            <Button
              label={showSuspension ? 'Hide account suspension' : 'Account suspension…'}
              variant="ghost"
              size="sm"
              testID={`report-suspension-toggle-${report.report_id}`}
              onPress={() => setShowSuspension((v) => !v)}
            />
            {showSuspension ? (
              <AccountSuspensionPanel userId={report.reported_user_id as string} reportId={report.report_id} />
            ) : null}
          </>
        ) : null}
      </View>
    </Card>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebModerationScreen() {
  const [status, setStatus] = useState<ReportStatus>('open');
  // null while loading; the list once loaded.
  const [reports, setReports] = useState<ContentReport[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Bumped to load the same filter again (Retry, or after an action).
  const [reloadKey, setReloadKey] = useState(0);

  // State is only set when the request finishes, and ignored if the filter changed meanwhile.
  useEffect(() => {
    let current = true;
    adminGetContentReports(status)
      .then((rows) => {
        if (current) setReports(rows);
      })
      .catch(() => {
        if (current) setLoadError(true);
      });
    return () => {
      current = false;
    };
  }, [status, reloadKey]);

  const reload = useCallback(() => {
    setReports(null);
    setLoadError(false);
    setReloadKey((k) => k + 1);
  }, []);

  function changeStatus(next: ReportStatus) {
    setReports(null);
    setLoadError(false);
    setStatus(next);
  }

  const loading = reports === null && !loadError;

  return (
    <>
      <PageMeta title="Moderation" />
      <Text variant="caption" color="textSecondary">
        We promise users a response to every report within {REPORT_RESPONSE_HOURS} hours. Oldest
        reports are listed first.
      </Text>

      <View style={styles.row}>
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.key}
            label={f.label}
            size="sm"
            variant={status === f.key ? 'primary' : 'secondary'}
            testID={`moderation-filter-${f.key}`}
            onPress={() => changeStatus(f.key)}
          />
        ))}
      </View>

      {loading ? (
        <Text variant="caption" color="textSecondary">
          Loading reports…
        </Text>
      ) : loadError ? (
        <View style={styles.row}>
          <Text variant="caption" color="error">
            Could not load reports.
          </Text>
          <Button label="Retry" variant="ghost" size="sm" onPress={reload} />
        </View>
      ) : !reports || reports.length === 0 ? (
        <Text variant="body" color="textSecondary" testID="moderation-empty">
          No reports here.
        </Text>
      ) : (
        <View style={styles.list}>
          {reports.map((r) => (
            <ReportCard key={r.report_id} report={r} onChanged={reload} />
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
  cardContent: {
    gap: Spacing.two,
  },
});
