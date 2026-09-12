/**
 * src/app/(admin-web)/payment-attempts/index.tsx — Web Admin M-PESA Reconciliation Queue
 *
 * Reads the 0053 operational review RPC (category / urgency / blocks_retry / needs_operator are
 * derived in SQL from the real attempt + payment state; nothing is classified here) and exposes
 * exactly two money-affecting actions, both through the protected 0045 RPCs:
 *
 *   Confirm collected  → confirm_payment_attempt        (exact amount + note + receipt, then an
 *                                                        explicit second confirmation)
 *   No collection      → reconcile_payment_attempt_no_collection
 *                                                       (note + provider reference OR explicit
 *                                                        portal-verified declaration)
 *
 * There is deliberately no "Mark paid" and no payment-status editor. The queue shows attempts
 * needing an operator by default; "Show all" reveals history. Phones are masked by the RPC.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only returns content.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { formatKes } from '@/lib/currency';
import { adminConfirmAttempt, adminReconcileAttemptNoCollection } from '@/lib/attempts';
import {
  adminGetMpesaAttemptReview,
  adminGetMpesaCallbackEvents,
  adminReviewAttemptDiscrepancy,
  adminReviewMpesaCallbackEvent,
  CALLBACK_EVENT_LABELS,
  formatAge,
  noCollectionEvidenceIsSufficient,
  REVIEW_CATEGORY_LABELS,
  REVIEW_URGENCY_LABELS,
  type MpesaAttemptReviewRow,
  type MpesaCallbackEventRow,
} from '@/lib/mpesa-ops';

/** Statuses the two 0045 RPCs accept. Mirrors their guards; the server stays authoritative. */
const RESOLVABLE: MpesaAttemptReviewRow['status'][] = ['initiated', 'pending', 'timed_out'];

type ResolveMode = 'confirm' | 'reconcile';

// ── Columns ─────────────────────────────────────────────────────────────────

function buildColumns(
  onResolve: (row: MpesaAttemptReviewRow, mode: ResolveMode) => void,
  onDetails: (row: MpesaAttemptReviewRow) => void,
  onReviewDiscrepancy: (row: MpesaAttemptReviewRow) => void,
): Column<MpesaAttemptReviewRow>[] {
  return [
    {
      key: 'category',
      header: 'Operational state',
      render: (row) => (
        <View style={{ gap: 2 }} testID={`review-row-${row.attempt_id}`}>
          <Text variant="label" color={row.needs_operator ? 'error' : 'text'}>
            {REVIEW_CATEGORY_LABELS[row.category]}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`${REVIEW_URGENCY_LABELS[row.urgency]} · age ${formatAge(row.age_seconds)}`}
          </Text>
          <Text variant="caption" color={row.blocks_retry ? 'warning' : 'textSecondary'}>
            {row.blocks_retry ? 'Retry blocked' : 'Retry allowed'}
          </Text>
          {row.latest_discrepancy_type ? (
            <Text variant="caption" color="error">
              {`Discrepancy: ${row.latest_discrepancy_type} (${row.discrepancy_count})`}
            </Text>
          ) : null}
        </View>
      ),
      width: 210,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <Text variant="label" color="text">
          {formatKes(row.amount)}
        </Text>
      ),
      width: 100,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Attempt / payment',
      render: (row) => (
        <View style={{ gap: 2 }}>
          <AttemptStatusBadge status={row.status} />
          <Text variant="caption" color="textSecondary">
            {`Payment: ${row.payment_status}`}
          </Text>
        </View>
      ),
      width: 130,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.phone_masked ?? '—'}
        </Text>
      ),
      width: 80,
    },
    {
      key: 'daraja',
      header: 'Provider refs',
      render: (row) => (
        <View style={{ gap: 2 }}>
          <Text variant="caption" color="textSecondary">
            {row.checkout_request_id ? `Checkout: ${row.checkout_request_id}` : 'Checkout: —'}
          </Text>
          {row.result_code != null ? (
            <Text variant="caption" color="textSecondary">
              {`Result: ${row.result_code} · ${row.result_desc ?? ''}`}
            </Text>
          ) : null}
          <Text variant="caption" color="textSecondary">
            {row.callback_received_at
              ? `Callback: ${new Date(row.callback_received_at).toLocaleString()}`
              : 'Callback: none'}
          </Text>
        </View>
      ),
      width: 240,
    },
    {
      key: 'ids',
      header: 'Payment / booking',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.payment_id.slice(0, 8)} · bk ${row.booking_id.slice(0, 8)}`}
        </Text>
      ),
      width: 170,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          <Button
            label="Details"
            variant="ghost"
            onPress={() => onDetails(row)}
            testID={`details-${row.attempt_id}`}
          />
          {row.discrepancy_unresolved ? (
            <Button
              label="Mark discrepancy reviewed"
              variant="ghost"
              onPress={() => onReviewDiscrepancy(row)}
              testID={`review-discrepancy-${row.attempt_id}`}
            />
          ) : null}
          {RESOLVABLE.includes(row.status) ? (
            <>
              <Button
                label="Confirm collected"
                onPress={() => onResolve(row, 'confirm')}
                testID={`confirm-${row.attempt_id}`}
              />
              <Button
                label="No collection"
                variant="ghost"
                onPress={() => onResolve(row, 'reconcile')}
                testID={`nocollect-${row.attempt_id}`}
              />
            </>
          ) : null}
        </View>
      ),
      width: 320,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebPaymentAttemptsScreen() {
  const [rows, setRows] = useState<MpesaAttemptReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<MpesaAttemptReviewRow | null>(null);

  const [actionError, setActionError] = useState('');
  const [target, setTarget] = useState<MpesaAttemptReviewRow | null>(null);
  const [mode, setMode] = useState<ResolveMode>('confirm');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [portalChecked, setPortalChecked] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  // 0054: authenticated callbacks that matched no attempt. Evidence only — never payments.
  const [orphans, setOrphans] = useState<MpesaCallbackEventRow[]>([]);
  const [orphanTarget, setOrphanTarget] = useState<MpesaCallbackEventRow | null>(null);
  const [orphanNote, setOrphanNote] = useState('');

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const [review, events] = await Promise.all([
        adminGetMpesaAttemptReview(),
        adminGetMpesaCallbackEvents(),
      ]);
      setRows(review);
      setOrphans(events);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  async function submitOrphanReview() {
    if (!orphanTarget) return;
    setActionError('');
    if (!orphanNote.trim()) {
      setActionError('Review note is required.');
      return;
    }
    setBusy(true);
    const r = await adminReviewMpesaCallbackEvent(orphanTarget.event_id, orphanNote.trim());
    setBusy(false);
    if (r.ok) {
      setOrphanTarget(null);
      setOrphanNote('');
      setOrphans(await adminGetMpesaCallbackEvents());
    } else {
      setActionError(r.error ?? 'Could not record the review.');
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  function openResolve(row: MpesaAttemptReviewRow, m: ResolveMode) {
    setActionError('');
    setTarget(row);
    setMode(m);
    setAmount(m === 'confirm' ? String(row.amount) : '');
    setNote('');
    setReference('');
    setPortalChecked(false);
    setReviewing(false);
  }

  function closeResolve() {
    setTarget(null);
    setAmount('');
    setNote('');
    setReference('');
    setPortalChecked(false);
    setReviewing(false);
  }

  /** Step 1 of confirm: validate evidence locally, then show the explicit review. */
  function reviewConfirmation() {
    if (!target) return;
    setActionError('');
    const collected = Number(amount);
    if (!note.trim()) {
      setActionError('Confirmation note is required.');
      return;
    }
    if (!Number.isFinite(collected) || collected <= 0) {
      setActionError('Collected amount must be a positive number.');
      return;
    }
    if (!reference.trim()) {
      setActionError('Transaction reference is required for this provider.');
      return;
    }
    setReviewing(true);
  }

  /** Step 2 of confirm: the deliberate, specific settlement action. */
  async function submitConfirmation() {
    if (!target) return;
    setBusy(true);
    const r = await adminConfirmAttempt(
      target.attempt_id,
      Number(amount),
      note.trim(),
      reference.trim(),
    );
    setBusy(false);
    if (r.ok) {
      closeResolve();
      setRows(await adminGetMpesaAttemptReview());
    } else {
      setReviewing(false);
      setActionError(r.error ?? 'Could not confirm collection.');
    }
  }

  async function submitNoCollection() {
    if (!target) return;
    setActionError('');
    if (!note.trim()) {
      setActionError('Reconciliation note is required.');
      return;
    }
    if (!noCollectionEvidenceIsSufficient(note, reference, portalChecked)) {
      setActionError(
        'Evidence required: enter the provider reference or confirm the portal check shows no transaction.',
      );
      return;
    }
    setBusy(true);
    // The structured evidence source is persisted by the RPC (0053): a provider reference wins
    // when supplied; otherwise the explicit portal-lookup declaration is what is recorded.
    const r = await adminReconcileAttemptNoCollection(
      target.attempt_id,
      note.trim(),
      reference.trim() || null,
      reference.trim() ? 'provider_reference' : 'portal_lookup',
    );
    setBusy(false);
    if (r.ok) {
      closeResolve();
      setRows(await adminGetMpesaAttemptReview());
    } else {
      setActionError(r.error ?? 'Could not record reconciliation.');
    }
  }

  // ── Discrepancy review (no money movement) ─────────────────────────────────
  const [reviewTarget, setReviewTarget] = useState<MpesaAttemptReviewRow | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  function openReview(row: MpesaAttemptReviewRow) {
    setActionError('');
    setTarget(null);
    setReviewTarget(row);
    setReviewNote('');
  }

  async function submitReview() {
    if (!reviewTarget) return;
    setActionError('');
    if (!reviewNote.trim()) {
      setActionError('Review note is required.');
      return;
    }
    setBusy(true);
    const r = await adminReviewAttemptDiscrepancy(reviewTarget.attempt_id, reviewNote.trim());
    setBusy(false);
    if (r.ok) {
      setReviewTarget(null);
      setReviewNote('');
      setRows(await adminGetMpesaAttemptReview());
    } else {
      setActionError(r.error ?? 'Could not record the review.');
    }
  }

  const visible = showAll ? rows : rows.filter((r) => r.needs_operator);
  const columns = buildColumns(openResolve, setDetail, openReview);

  return (
    <>
      <PageMeta title="M-PESA reconciliation" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Text variant="label" color="text">
          {showAll ? 'All M-PESA attempts' : `Needs operator (${visible.length})`}
        </Text>
        <Button
          label={showAll ? 'Show needs-attention only' : 'Show all'}
          variant="ghost"
          onPress={() => setShowAll((v) => !v)}
        />
      </View>

      {actionError ? (
        <Text variant="caption" color="error">
          {actionError}
        </Text>
      ) : null}

      {detail ? (
        <View style={{ gap: 4, marginBottom: 12 }} testID="attempt-detail">
          <Text variant="label" color="text">
            {`Attempt #${detail.attempt_id.slice(0, 8)} — ${REVIEW_CATEGORY_LABELS[detail.category]}`}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`Payment #${detail.payment_id.slice(0, 8)} (${detail.payment_status}) · booking ${detail.booking_id.slice(0, 8)} · ${formatKes(detail.amount)} · age ${formatAge(detail.age_seconds)} · ${detail.blocks_retry ? 'retry blocked' : 'retry allowed'}`}
          </Text>
          <Text variant="label" color="text">
            Callback evidence
          </Text>
          <Text variant="caption" color="textSecondary">
            {detail.callback_received_at
              ? `Received ${new Date(detail.callback_received_at).toLocaleString()} · ResultCode ${detail.result_code ?? '—'} · ${detail.result_desc ?? ''}`
              : 'No callback received'}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`Receipt recorded: ${detail.has_settlement_reference ? 'yes' : 'no'} · collected amount recorded: ${detail.has_collected_amount ? 'yes' : 'no'} · discrepancies: ${detail.discrepancy_count}${detail.latest_discrepancy_type ? ` (${detail.latest_discrepancy_type})` : ''}`}
          </Text>
          <Text variant="label" color="text">
            Operator evidence
          </Text>
          <Text variant="caption" color="textSecondary">
            {detail.resolved_at
              ? `Resolved ${new Date(detail.resolved_at).toLocaleString()} by admin · note: ${detail.resolution_note ?? '—'} · reference: ${detail.resolution_reference ?? '—'}`
              : 'Operator resolution: none'}
          </Text>
          <Button label="Close details" variant="ghost" onPress={() => setDetail(null)} />
        </View>
      ) : null}

      {reviewTarget ? (
        <View style={{ gap: 8, marginBottom: 12 }} testID="discrepancy-review">
          <Text variant="label" color="text">
            {`Review contradictory evidence on attempt #${reviewTarget.attempt_id.slice(0, 8)}`}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`${reviewTarget.discrepancy_count} discrepancy entr${reviewTarget.discrepancy_count === 1 ? 'y' : 'ies'} · latest: ${reviewTarget.latest_discrepancy_type ?? '—'} · attempt ${reviewTarget.status} · payment ${reviewTarget.payment_status}. This records your review only; it does not change the payment.`}
          </Text>
          <Input
            label="Review note"
            value={reviewNote}
            onChangeText={setReviewNote}
            multiline
            helperText="What did the authoritative source (portal/statement) show, and what was concluded?"
            testID="discrepancy-review-note"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Submit review" onPress={submitReview} disabled={busy} />
            <Button label="Cancel" variant="ghost" onPress={() => setReviewTarget(null)} disabled={busy} />
          </View>
        </View>
      ) : null}

      {target ? (
        <View style={{ gap: 8, marginBottom: 12 }}>
          <Text variant="label" color="text">
            {mode === 'confirm'
              ? `Confirm collection for attempt #${target.attempt_id.slice(0, 8)}`
              : `Record no collection for attempt #${target.attempt_id.slice(0, 8)}`}
          </Text>

          {mode === 'confirm' && reviewing ? (
            <View style={{ gap: 4 }} testID="confirm-review">
              <Text variant="label" color="error">
                This will settle the payment. Check every line before continuing.
              </Text>
              <Text variant="caption" color="text">{`Attempt: ${target.attempt_id}`}</Text>
              <Text variant="caption" color="text">{`Payment: ${target.payment_id} (${target.payment_status})`}</Text>
              <Text variant="caption" color="text">{`Booking: ${target.booking_id}`}</Text>
              <Text variant="caption" color="text">{`Expected amount: ${formatKes(target.amount)}`}</Text>
              <Text variant="label" color="text">{formatKes(Number(amount))}</Text>
              <Text variant="caption" color="text">{`Transaction reference: ${reference.trim()}`}</Text>
              <Text variant="caption" color="text">{`Note: ${note.trim()}`}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Yes, settle this payment" onPress={submitConfirmation} disabled={busy} />
                <Button label="Back" variant="ghost" onPress={() => setReviewing(false)} disabled={busy} />
              </View>
            </View>
          ) : (
            <>
              {mode === 'confirm' ? (
                <Input
                  label="Collected amount"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  helperText="Must equal the attempt amount and the payment's remaining external due."
                  testID="collected-amount"
                />
              ) : null}

              <Input
                label={mode === 'confirm' ? 'Confirmation note' : 'Reconciliation note'}
                value={note}
                onChangeText={setNote}
                multiline
                helperText={
                  mode === 'confirm'
                    ? 'How was this collection verified? (receipt seen in the Safaricom portal, SMS, statement)'
                    : 'How was it verified that no money was collected? Customer assertion alone is not evidence.'
                }
                testID="resolution-note"
              />

              <Input
                label={mode === 'confirm' ? 'Transaction reference' : 'Provider reference'}
                value={reference}
                onChangeText={setReference}
                autoCapitalize="characters"
                helperText={
                  mode === 'confirm'
                    ? 'The genuine M-PESA receipt number. It becomes the settlement identity and must be unique.'
                    : 'Safaricom enquiry/case reference, or leave blank and confirm the portal check below.'
                }
                testID="resolution-reference"
              />

              {mode === 'reconcile' ? (
                <Pressable
                  onPress={() => setPortalChecked((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: portalChecked }}
                  testID="no-collection-portal-checked">
                  <Text variant="caption" color={portalChecked ? 'text' : 'textSecondary'}>
                    {`${portalChecked ? '☑' : '☐'} I checked the Safaricom business portal: no transaction exists for this request`}
                  </Text>
                </Pressable>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {mode === 'confirm' ? (
                  <Button label="Review confirmation" onPress={reviewConfirmation} disabled={busy} />
                ) : (
                  <Button label="Submit reconciliation" onPress={submitNoCollection} disabled={busy} />
                )}
                <Button label="Cancel" variant="ghost" onPress={closeResolve} disabled={busy} />
              </View>
            </>
          )}
        </View>
      ) : null}

      <DataTable
        columns={columns}
        rows={visible}
        keyExtractor={(a) => a.attempt_id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel={showAll ? 'No M-PESA attempts yet.' : 'Nothing needs an operator right now.'}
      />

      {/* ── 0054: Unmatched callback evidence (never payments, never settle here) ────── */}
      <View style={{ marginTop: 24, gap: 8 }} testID="orphan-section">
        <Text variant="label" color="text">
          Unmatched M-PESA callback evidence
        </Text>
        <Text variant="caption" color="textSecondary">
          Authenticated callbacks that matched no attempt. This is evidence for investigation only:
          match by exact CheckoutRequestID, check the Safaricom portal, and never settle from phone or
          amount. Where an attempt now matches, use that attempt&apos;s reconciliation workflow.
        </Text>
        {orphanTarget ? (
          <View style={{ gap: 8 }} testID="orphan-review">
            <Text variant="label" color="text">
              {`Review callback evidence #${orphanTarget.event_id.slice(0, 8)}`}
            </Text>
            <Input
              label="Review note"
              value={orphanNote}
              onChangeText={setOrphanNote}
              multiline
              helperText="What did the Safaricom portal / statement show for this CheckoutRequestID, and what was concluded? This records the review only."
              testID="orphan-review-note"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Submit orphan review" onPress={submitOrphanReview} disabled={busy} />
              <Button label="Cancel" variant="ghost" onPress={() => setOrphanTarget(null)} disabled={busy} />
            </View>
          </View>
        ) : null}
        {orphans.length === 0 ? (
          <Text variant="caption" color="textSecondary">
            No unmatched callbacks recorded.
          </Text>
        ) : (
          orphans.map((e) => (
            <View
              key={e.event_id}
              style={{ gap: 2, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}
              testID={`orphan-row-${e.event_id}`}>
              <Text variant="label" color={e.urgency === 'high' ? 'error' : 'text'}>
                {`${CALLBACK_EVENT_LABELS[e.classification]} (${e.classification}) · ${e.urgency === 'high' ? 'High urgency: collection evidence present' : 'Normal urgency'}${e.needs_review ? ' · needs review' : ' · reviewed'}`}
              </Text>
              <Text variant="caption" color="textSecondary">
                {`Checkout: ${e.checkout_request_id ?? '—'} · Merchant: ${e.merchant_request_id ?? '—'} · ResultCode ${e.result_code ?? '—'} · ${e.result_desc ?? ''}`}
              </Text>
              <Text variant="caption" color="textSecondary">
                {`Amount: ${e.amount != null ? formatKes(e.amount) : '—'} · receipt recorded: ${e.receipt ? 'yes' : 'no'} · phone ${e.phone_masked ?? '—'} · first seen ${formatAge(e.age_seconds)} ago · delivered ${e.seen_count}×`}
              </Text>
              <Text variant="caption" color={e.matched_attempt_id ? 'warning' : 'textSecondary'}>
                {e.matched_attempt_id
                  ? `Exact attempt match: ${e.matched_attempt_id.slice(0, 8)} (${e.matched_attempt_status}, payment ${e.matched_payment_id?.slice(0, 8)}) — use the attempt's reconciliation workflow above; this record moves no money.`
                  : 'No attempt matches this CheckoutRequestID. Do not match by phone or amount.'}
              </Text>
              {e.reviewed_at ? (
                <Text variant="caption" color="textSecondary">
                  {`Reviewed ${new Date(e.reviewed_at).toLocaleString()} · ${e.review_note ?? ''}`}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row' }}>
                  <Button
                    label="Mark evidence reviewed"
                    variant="ghost"
                    onPress={() => {
                      setActionError('');
                      setOrphanTarget(e);
                      setOrphanNote('');
                    }}
                    testID={`review-orphan-${e.event_id}`}
                  />
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </>
  );
}
