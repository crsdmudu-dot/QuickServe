/**
 * src/app/(admin-web)/operations/[id].tsx — Operations Portal: Case Detail
 *
 * Loads a support/dispute case and its notes + events, then provides
 * controls to update status, priority, assignment, add case notes, record
 * dispute outcome, view evidence, and view related account flags / internal notes.
 *
 * GUARDRAILS (read before editing):
 *   - NO wallet/refund/payment calls here. Wallet-credit recommendations are
 *     WORDING + a deep-link to the booking/customer that hosts AdminWalletPanel.
 *   - NO user deletion. AccountFlagPanel is RECORD-ONLY (no enforcement).
 *   - Admin-web only. RLS enforces server-side; this screen is inside the
 *     protected (admin-web) route group.
 *   - The only direct Supabase call allowed here is supabase.auth.getUser()
 *     for the "Assign to me" button — all other data goes through @/lib/operations.
 *
 * RN/RN-web safe — no DOM-only APIs.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  getSupportCase,
  getSupportCaseNotes,
  getSupportCaseEvents,
  updateSupportCaseStatus,
  updateSupportCasePriority,
  assignSupportCase,
  setDisputeOutcome,
  addSupportCaseNote,
} from '@/lib/operations';
import {
  CASE_STATUSES,
  CASE_PRIORITIES,
  RESOLUTION_OUTCOMES,
  CASE_TYPES,
  type CaseNoteType,
  type CaseStatus,
  type CasePriority,
  type ResolutionOutcome,
  type SupportCase,
  type SupportCaseNote,
  type SupportCaseEvent,
} from '@/constants/operations';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { PageMeta } from '@/components/admin-web/page-meta';
import { CaseStatusBadge } from '@/components/admin-web/operations/case-status-badge';
import { CasePriorityBadge } from '@/components/admin-web/operations/case-priority-badge';
import { CaseTimeline } from '@/components/admin-web/operations/case-timeline';
import { EvidenceLinks } from '@/components/admin-web/operations/evidence-links';
import { InternalNotesPanel } from '@/components/admin-web/operations/internal-notes-panel';
import { AccountFlagPanel } from '@/components/admin-web/operations/account-flag-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerCard: {
    gap: Spacing.two,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  assignRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  contextChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  noteTypeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  walletNotice: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    gap: Spacing.two,
    borderWidth: 1,
  },
  resolutionArea: {
    gap: Spacing.three,
  },
});

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebOperationDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  // ── Core case state ────────────────────────────────────────────────────
  const [caseData, setCaseData] = useState<SupportCase | null>(null);
  const [notes, setNotes] = useState<SupportCaseNote[]>([]);
  const [events, setEvents] = useState<SupportCaseEvent[]>([]);
  const [loadError, setLoadError] = useState('');

  // ── Action error ───────────────────────────────────────────────────────
  const [actionError, setActionError] = useState('');

  // ── Case note composer state ───────────────────────────────────────────
  const [noteBody, setNoteBody] = useState('');
  const [noteType, setNoteType] = useState<CaseNoteType>('internal');
  const [addingNote, setAddingNote] = useState(false);

  // ── Resolution state ───────────────────────────────────────────────────
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);

  // ── Data load ──────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    if (!id) return;
    setLoadError('');
    const [c, n, e] = await Promise.all([
      getSupportCase(id),
      getSupportCaseNotes(id),
      getSupportCaseEvents(id),
    ]);
    if (!c) {
      setLoadError('Case not found.');
      return;
    }
    setCaseData(c);
    setNotes(n);
    setEvents(e);
    setResolutionNotes(c.resolution_notes ?? '');
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ── Action handlers ────────────────────────────────────────────────────

  async function handleStatusChange(status: CaseStatus) {
    if (!id) return;
    setActionError('');
    const res = await updateSupportCaseStatus(id, status);
    if (res.ok) { void reload(); }
    else { setActionError(res.error ?? 'Could not update status.'); }
  }

  async function handlePriorityChange(priority: CasePriority) {
    if (!id) return;
    setActionError('');
    const res = await updateSupportCasePriority(id, priority);
    if (res.ok) { void reload(); }
    else { setActionError(res.error ?? 'Could not update priority.'); }
  }

  async function handleAssignToMe() {
    if (!id) return;
    setActionError('');
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) { setActionError('Could not get current user.'); return; }
    const res = await assignSupportCase(id, uid);
    if (res.ok) { void reload(); }
    else { setActionError(res.error ?? 'Could not assign case.'); }
  }

  async function handleUnassign() {
    if (!id) return;
    setActionError('');
    const res = await assignSupportCase(id, null);
    if (res.ok) { void reload(); }
    else { setActionError(res.error ?? 'Could not unassign case.'); }
  }

  async function handleAddNote() {
    if (!id || !noteBody.trim()) return;
    setAddingNote(true);
    setActionError('');
    const res = await addSupportCaseNote(id, noteBody.trim(), noteType);
    if (res.ok) {
      setNoteBody('');
      void reload();
    } else {
      setActionError(res.error ?? 'Could not add note.');
    }
    setAddingNote(false);
  }

  async function handleSetOutcome(outcome: ResolutionOutcome) {
    if (!id) return;
    setSavingOutcome(true);
    setActionError('');
    const res = await setDisputeOutcome(id, outcome, resolutionNotes.trim() || undefined);
    if (res.ok) { void reload(); }
    else { setActionError(res.error ?? 'Could not set dispute outcome.'); }
    setSavingOutcome(false);
  }

  // ── Loading / not-found guard ──────────────────────────────────────────

  if (!caseData) {
    return (
      <View style={styles.center}>
        <Text variant="body" color="textSecondary">
          {loadError || 'Loading…'}
        </Text>
      </View>
    );
  }

  // ── Derived helpers ────────────────────────────────────────────────────

  const isDispute = caseData.case_type === 'dispute';
  const currentOutcome = caseData.resolution_outcome;
  const walletRecommended =
    currentOutcome === 'refund_recommended' ||
    currentOutcome === 'wallet_credit_recommended';

  // Deep-link for wallet panel: prefer booking → then customer list.
  const walletLink: string | null = caseData.booking_id
    ? `/(admin-web)/bookings/${caseData.booking_id}`
    : caseData.customer_id
    ? '/(admin-web)/customers'
    : null;

  // Subject entity for InternalNotesPanel (most specific present context).
  const notesSubjectType = caseData.booking_id
    ? 'booking'
    : caseData.customer_id
    ? 'customer'
    : caseData.provider_id
    ? 'provider'
    : caseData.payment_id
    ? 'payment'
    : null;

  const notesSubjectId =
    (notesSubjectType === 'booking'  && caseData.booking_id)  ||
    (notesSubjectType === 'customer' && caseData.customer_id) ||
    (notesSubjectType === 'provider' && caseData.provider_id) ||
    (notesSubjectType === 'payment'  && caseData.payment_id)  ||
    null;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <ScrollView>
      <View style={styles.container}>
        <PageMeta title="Case detail" />

        {/* ── Header ─────────────────────────────────────────────────── */}
        <SectionHeader title="Case" />
        <Card style={styles.headerCard}>
          <Text variant="heading" weight="semibold">
            {caseData.subject}
          </Text>
          <View style={styles.headerBadgeRow}>
            <CaseStatusBadge status={caseData.status} />
            <CasePriorityBadge priority={caseData.priority} />
            <Text variant="caption" color="textSecondary">
              {CASE_TYPES.find((t) => t.id === caseData.case_type)?.label ?? caseData.case_type}
            </Text>
          </View>
          {caseData.description ? (
            <Text variant="body" color="textSecondary">
              {caseData.description}
            </Text>
          ) : null}
          <Text variant="caption" color="textTertiary">
            {`Created: ${new Date(caseData.created_at).toLocaleString()}  ·  Updated: ${new Date(caseData.updated_at).toLocaleString()}`}
          </Text>
        </Card>

        {/* ── Action error ────────────────────────────────────────────── */}
        {actionError ? (
          <Text variant="caption" color="error">
            {actionError}
          </Text>
        ) : null}

        {/* ── Status picker ───────────────────────────────────────────── */}
        <SectionHeader title="Status" />
        <View style={styles.chipRow}>
          {CASE_STATUSES.map((s) => {
            const selected = caseData.status === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => handleStatusChange(s.id)}
                accessibilityRole="button"
                accessibilityLabel={s.label}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text variant="caption" color={selected ? 'background' : 'textSecondary'}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Priority picker ─────────────────────────────────────────── */}
        <SectionHeader title="Priority" />
        <View style={styles.chipRow}>
          {CASE_PRIORITIES.map((p) => {
            const selected = caseData.priority === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => handlePriorityChange(p.id)}
                accessibilityRole="button"
                accessibilityLabel={p.label}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text variant="caption" color={selected ? 'background' : 'textSecondary'}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Assignment ──────────────────────────────────────────────── */}
        <SectionHeader title="Assignment" />
        <Text variant="caption" color="textSecondary">
          {caseData.assigned_to
            ? `Assigned to: #${caseData.assigned_to.slice(0, 8)}`
            : 'Unassigned'}
        </Text>
        <View style={styles.assignRow}>
          <Button label="Assign to me" onPress={handleAssignToMe} />
          <Button
            label="Unassign"
            variant="ghost"
            onPress={handleUnassign}
            disabled={!caseData.assigned_to}
          />
        </View>

        {/* ── Context link chips ──────────────────────────────────────── */}
        {(caseData.booking_id || caseData.customer_id || caseData.provider_id ||
          caseData.payment_id || caseData.review_id) ? (
          <>
            <SectionHeader title="Linked context" />
            <View style={styles.contextChipRow}>
              {caseData.booking_id ? (
                <Button
                  key="booking"
                  label={`Booking #${caseData.booking_id.slice(0, 8)}`}
                  variant="secondary"
                  onPress={() =>
                    router.push(`/(admin-web)/bookings/${caseData.booking_id}` as Href)
                  }
                />
              ) : null}
              {caseData.provider_id ? (
                <Button
                  key="provider"
                  label={`Provider #${caseData.provider_id.slice(0, 8)}`}
                  variant="secondary"
                  onPress={() =>
                    router.push(`/(admin-web)/providers/${caseData.provider_id}` as Href)
                  }
                />
              ) : null}
              {caseData.customer_id ? (
                <Button
                  key="customer"
                  label={`Customer #${caseData.customer_id.slice(0, 8)}`}
                  variant="ghost"
                  onPress={() => router.push('/(admin-web)/customers' as Href)}
                />
              ) : null}
              {caseData.payment_id ? (
                <Button
                  key="payment"
                  label={`Payment #${caseData.payment_id.slice(0, 8)}`}
                  variant="ghost"
                  onPress={() => router.push('/(admin-web)/payments' as Href)}
                />
              ) : null}
              {caseData.review_id ? (
                <Text key="review" variant="caption" color="textSecondary">
                  {`Review: #${caseData.review_id.slice(0, 8)}`}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ── Timeline ────────────────────────────────────────────────── */}
        <SectionHeader title="Timeline" />
        <CaseTimeline notes={notes} events={events} />

        {/* ── Case note composer ───────────────────────────────────────── */}
        <SectionHeader title="Add case note" />
        <View style={styles.noteTypeRow}>
          {(['internal', 'resolution'] as CaseNoteType[]).map((nt) => {
            const selected = noteType === nt;
            return (
              <Pressable
                key={nt}
                onPress={() => setNoteType(nt)}
                accessibilityRole="button"
                accessibilityLabel={nt === 'internal' ? 'Internal note' : 'Resolution note'}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text variant="caption" color={selected ? 'background' : 'textSecondary'}>
                  {nt === 'internal' ? 'Internal' : 'Resolution'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Input
          label="Note"
          value={noteBody}
          onChangeText={setNoteBody}
          placeholder="Add a case note…"
          multiline
        />
        <Button
          label="Add note"
          onPress={handleAddNote}
          disabled={noteBody.trim() === ''}
          loading={addingNote}
        />

        {/* ── Resolution (dispute only: outcome picker) ────────────────── */}
        {isDispute ? (
          <View style={styles.resolutionArea}>
            <SectionHeader title="Dispute resolution" />
            <Input
              label="Resolution notes"
              value={resolutionNotes}
              onChangeText={setResolutionNotes}
              placeholder="Describe the resolution…"
              multiline
            />
            <Text variant="label" color="textSecondary">
              Outcome
            </Text>
            <View style={styles.chipRow}>
              {RESOLUTION_OUTCOMES.map((o) => {
                const selected = currentOutcome === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => handleSetOutcome(o.id)}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.primary : theme.surface,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}>
                    <Text variant="caption" color={selected ? 'background' : 'textSecondary'}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {savingOutcome ? (
              <Text variant="caption" color="textSecondary">
                Saving…
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── Wallet-credit recommendation (WORDING + LINK ONLY) ────────── */}
        {walletRecommended && walletLink ? (
          <View
            style={[
              styles.walletNotice,
              { backgroundColor: theme.warningSurface, borderColor: theme.warning },
            ]}>
            <Text variant="label" weight="semibold" color="warning">
              Recommendation only — no automated action taken
            </Text>
            <Text variant="body" color="textSecondary">
              {currentOutcome === 'wallet_credit_recommended'
                ? 'A wallet credit has been recommended for this case. Action the wallet credit manually via the customer\'s wallet adjustment on the booking or customer context below.'
                : 'A refund has been recommended for this case. Action the refund manually via the customer\'s wallet adjustment on the booking or customer context below.'}
            </Text>
            <Button
              label="Go to wallet adjustment"
              variant="secondary"
              onPress={() => router.push(walletLink as Href)}
            />
          </View>
        ) : null}

        {/* ── Evidence ────────────────────────────────────────────────── */}
        <EvidenceLinks caseId={id} />

        {/* ── Account flag panel (for customer or provider) ───────────── */}
        {caseData.customer_id ? (
          <AccountFlagPanel subjectId={caseData.customer_id} subjectRole="customer" />
        ) : caseData.provider_id ? (
          <AccountFlagPanel subjectId={caseData.provider_id} subjectRole="provider" />
        ) : null}

        {/* ── Internal notes panel (most relevant present context) ─────── */}
        {notesSubjectType && notesSubjectId ? (
          <InternalNotesPanel
            subjectType={notesSubjectType}
            subjectId={notesSubjectId}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
