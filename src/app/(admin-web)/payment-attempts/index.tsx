/**
 * src/app/(admin-web)/payment-attempts/index.tsx — Web Admin Payment Attempts List
 *
 * Loads all payment attempts via adminGetPaymentAttempts() on mount and displays
 * them in a DataTable. Each row shows amount, status badge, provider, phone,
 * Daraja refs, booking ref, and date. Pending/initiated rows get Confirm + Cancel
 * action buttons that reload the list on success.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { formatKes } from '@/lib/currency';
import { Input } from '@/components/ui/input';
import {
  adminGetPaymentAttempts,
  adminConfirmAttempt,
  adminReconcileAttemptNoCollection,
  type PaymentAttempt,
} from '@/lib/attempts';

/**
 * Statuses an admin may still resolve - mirrors the accepted set in both 0045 RPCs.
 * 'timed_out' is included deliberately: the provider outcome is unresolved, so it needs a human
 * decision in one direction or the other rather than being treated as a safe failure.
 */
const RESOLVABLE: PaymentAttempt['status'][] = ['initiated', 'pending', 'timed_out'];

type ResolveMode = 'confirm' | 'reconcile';

// ── Column definitions ─────────────────────────────────────────────────────

function buildColumns(
  onResolve: (row: PaymentAttempt, mode: ResolveMode) => void,
): Column<PaymentAttempt>[] {
  return [
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
      header: 'Status',
      render: (row) => <AttemptStatusBadge status={row.status} />,
      width: 110,
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.provider.toUpperCase()}
        </Text>
      ),
      width: 90,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.phone ?? '—'}
        </Text>
      ),
      width: 130,
    },
    {
      key: 'daraja',
      header: 'Daraja refs',
      render: (row) => (
        <View style={{ gap: 2 }}>
          {row.checkout_request_id ? (
            <Text variant="caption" color="textSecondary">
              {`Checkout: ${row.checkout_request_id}`}
            </Text>
          ) : null}
          {row.result_code != null ? (
            <Text variant="caption" color="textSecondary">
              {`Result: ${row.result_code} · ${row.result_desc ?? ''}`}
            </Text>
          ) : null}
          {row.callback_received_at ? (
            <Text variant="caption" color="textSecondary">
              {`Callback: ${new Date(row.callback_received_at).toLocaleString()}`}
            </Text>
          ) : null}
          {!row.checkout_request_id && row.result_code == null && !row.callback_received_at ? (
            <Text variant="caption" color="textSecondary">
              {'—'}
            </Text>
          ) : null}
        </View>
      ),
      width: 240,
    },
    {
      key: 'booking',
      header: 'Payment',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.payment_id.slice(0, 8)}`}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {new Date(row.created_at).toLocaleDateString()}
        </Text>
      ),
      width: 110,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => {
        if (!RESOLVABLE.includes(row.status)) {
          return (
            <Text variant="caption" color="textSecondary">
              {'—'}
            </Text>
          );
        }
        return (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Button label="Confirm collected" onPress={() => onResolve(row, 'confirm')} />
            <Button
              label="No collection"
              variant="ghost"
              onPress={() => onResolve(row, 'reconcile')}
            />
          </View>
        );
      },
      width: 260,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebPaymentAttemptsScreen() {
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [target, setTarget] = useState<PaymentAttempt | null>(null);
  const [mode, setMode] = useState<ResolveMode>('confirm');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const rows = await adminGetPaymentAttempts();
      setAttempts(rows);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Migration 0045 removed both evidence-free actions. Confirming asserts "this collection
  // HAPPENED" and needs the collected amount, a note and - for non-cash - the provider's
  // transaction reference. The old Cancel asserted "no money moved" with no evidence; it is now
  // an explicit no-collection reconciliation requiring a note. The backend stays authoritative
  // for amounts, eligibility and uniqueness; these checks only block incomplete submissions.
  function openResolve(row: PaymentAttempt, m: ResolveMode) {
    setActionError('');
    setTarget(row);
    setMode(m);
    setAmount(m === 'confirm' ? String(row.amount) : '');
    setNote('');
    setReference('');
  }

  function closeResolve() {
    setTarget(null);
    setAmount('');
    setNote('');
    setReference('');
  }

  async function submitResolve() {
    if (!target) return;
    setActionError('');
    const trimmedNote = note.trim();
    const trimmedRef = reference.trim();

    if (!trimmedNote) {
      setActionError(
        mode === 'confirm' ? 'Confirmation note is required.' : 'Reconciliation note is required.',
      );
      return;
    }

    setBusy(true);
    let r: { ok: boolean; error?: string };
    if (mode === 'confirm') {
      const collected = Number(amount);
      if (!Number.isFinite(collected) || collected <= 0) {
        setActionError('Collected amount must be a positive number.');
        setBusy(false);
        return;
      }
      if (target.provider !== 'cash' && !trimmedRef) {
        setActionError('Transaction reference is required for this provider.');
        setBusy(false);
        return;
      }
      r = await adminConfirmAttempt(target.id, collected, trimmedNote, trimmedRef || null);
    } else {
      r = await adminReconcileAttemptNoCollection(target.id, trimmedNote, trimmedRef || null);
    }
    setBusy(false);

    if (r.ok) {
      closeResolve();
      setAttempts(await adminGetPaymentAttempts());
    } else {
      setActionError(r.error ?? 'Could not update attempt.');
    }
  }

  const columns = buildColumns(openResolve);

  return (
    <>
      <PageMeta title="Payment attempts" />
      {actionError ? (
        <Text variant="caption" color="error">
          {actionError}
        </Text>
      ) : null}
      {target ? (
        <View style={{ gap: 8, marginBottom: 12 }}>
          <Text variant="label" color="text">
            {mode === 'confirm'
              ? 'Confirm collection for attempt #' + target.id.slice(0, 8)
              : 'Record no collection for attempt #' + target.id.slice(0, 8)}
          </Text>

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
                ? 'How was this collection verified?'
                : 'How was it verified that no money was collected?'
            }
            testID="resolution-note"
          />

          <Input
            label={
              mode === 'confirm'
                ? target.provider === 'cash'
                  ? 'Transaction reference (optional for cash)'
                  : 'Transaction reference'
                : 'Provider reference (optional)'
            }
            value={reference}
            onChangeText={setReference}
            autoCapitalize="characters"
            helperText={
              mode === 'confirm'
                ? 'Provider receipt, e.g. the M-Pesa transaction code.'
                : 'Provider enquiry or case reference, if any.'
            }
            testID="resolution-reference"
          />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={mode === 'confirm' ? 'Submit confirmation' : 'Submit reconciliation'}
              onPress={submitResolve}
              disabled={busy}
            />
            <Button label="Cancel" variant="ghost" onPress={closeResolve} disabled={busy} />
          </View>
        </View>
      ) : null}
      <DataTable
        columns={columns}
        rows={attempts}
        keyExtractor={(a) => a.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No payment attempts yet."
      />
    </>
  );
}
