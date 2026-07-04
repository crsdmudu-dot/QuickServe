/**
 * src/app/(admin-web)/promos/index.tsx — Admin Promotions Management
 *
 * Allows admins to:
 *   1. Create new promo codes via a controlled form (code, type, discount_value,
 *      optional limits, optional date window, is_active toggle).
 *   2. View all promo codes in a DataTable with Enable/Disable actions.
 *   3. View the full redemption history across all customers in a second DataTable.
 *
 * Loads adminGetPromoCodes() + adminGetPromoRedemptions() on mount and after
 * every successful mutation (create or enable/disable).
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 *
 * Reuses T2 admin helpers: adminGetPromoCodes, adminCreatePromoCode,
 * adminUpdatePromoCode, adminGetPromoRedemptions.
 * Read + create/toggle only. No payout/share/auth/chat change.
 */

import { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { formatKes } from '@/lib/currency';
import {
  adminCreatePromoCode,
  adminGetPromoCodes,
  adminGetPromoRedemptions,
  adminUpdatePromoCode,
  type PromoCode,
  type PromoRedemption,
  type PromoType,
} from '@/lib/promotions';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROMO_TYPES: PromoType[] = ['percentage', 'fixed', 'wallet_credit'];

// ── Codes table column definitions ───────────────────────────────────────────

function buildCodeColumns(
  onToggleActive: (row: PromoCode) => void,
): Column<PromoCode>[] {
  return [
    {
      key: 'code',
      header: 'Code',
      render: (row) => (
        <Text variant="label" color="text" weight="semibold">
          {row.code}
        </Text>
      ),
      width: 120,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.discount_type}
        </Text>
      ),
      width: 110,
    },
    {
      key: 'value',
      header: 'Value',
      render: (row) => (
        <Text variant="caption" color="text">
          {row.discount_type === 'percentage'
            ? `${row.discount_value}%`
            : formatKes(row.discount_value)}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'limits',
      header: 'Limits',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`${row.max_redemptions ?? '∞'} / ${row.per_user_limit}`}
        </Text>
      ),
      width: 90,
    },
    {
      key: 'window',
      header: 'Window',
      render: (row) => {
        const start = row.starts_at
          ? new Date(row.starts_at).toLocaleDateString()
          : '—';
        const end = row.ends_at
          ? new Date(row.ends_at).toLocaleDateString()
          : '—';
        return (
          <Text variant="caption" color="textSecondary">
            {`${start} → ${end}`}
          </Text>
        );
      },
      width: 160,
    },
    {
      key: 'active',
      header: 'Active',
      render: (row) => (
        <Text
          variant="caption"
          color={row.is_active ? 'text' : 'textSecondary'}>
          {row.is_active ? 'Yes' : 'No'}
        </Text>
      ),
      width: 70,
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <View>
          <Button
            label={row.is_active ? 'Disable' : 'Enable'}
            variant="ghost"
            size="md"
            onPress={() => onToggleActive(row)}
          />
        </View>
      ),
      width: 90,
    },
  ];
}

// ── Redemption history column definitions ─────────────────────────────────────

function buildRedemptionColumns(): Column<PromoRedemption>[] {
  return [
    {
      key: 'promo',
      header: 'Promo',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.promo_code_id.slice(0, 8)}`}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.customer_id.slice(0, 8)}`}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'booking',
      header: 'Booking',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.booking_id ? `#${row.booking_id.slice(0, 8)}` : '—'}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.payment_id ? `#${row.payment_id.slice(0, 8)}` : '—'}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <Text variant="caption" color="text">
          {formatKes(row.discount_amount)}
        </Text>
      ),
      width: 110,
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
  ];
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminWebPromosScreen() {
  // ── Data state ─────────────────────────────────────────────────────────────
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [redemptions, setRedemptions] = useState<PromoRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // ── Action error ───────────────────────────────────────────────────────────
  const [actionError, setActionError] = useState('');

  // ── Create form state ──────────────────────────────────────────────────────
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<PromoType>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [perUserLimit, setPerUserLimit] = useState('1');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const [fetchedCodes, fetchedRedemptions] = await Promise.all([
        adminGetPromoCodes(),
        adminGetPromoRedemptions(),
      ]);
      setCodes(fetchedCodes);
      setRedemptions(fetchedRedemptions);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Create handler ─────────────────────────────────────────────────────────
  async function handleCreate() {
    setCreateError('');
    setCreating(true);
    try {
      const result = await adminCreatePromoCode({
        code,
        discount_type: discountType,
        discount_value: Number(discountValue),
        max_discount: maxDiscount ? Number(maxDiscount) : undefined,
        max_redemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        per_user_limit: perUserLimit ? Number(perUserLimit) : 1,
        starts_at: startsAt || undefined,
        ends_at: endsAt || undefined,
        is_active: isActive,
      });
      if (result.ok) {
        // Clear form
        setCode('');
        setDiscountValue('');
        setMaxDiscount('');
        setMaxRedemptions('');
        setPerUserLimit('1');
        setStartsAt('');
        setEndsAt('');
        setIsActive(true);
        setDiscountType('percentage');
        await load();
      } else {
        setCreateError(result.error ?? 'Could not create promo code.');
      }
    } finally {
      setCreating(false);
    }
  }

  // ── Enable / Disable handler ───────────────────────────────────────────────
  async function handleToggleActive(row: PromoCode) {
    setActionError('');
    const result = await adminUpdatePromoCode(row.id, {
      is_active: !row.is_active,
    });
    if (result.ok) {
      await load();
    } else {
      setActionError(result.error ?? 'Could not update promo code.');
    }
  }

  // ── Column definitions ─────────────────────────────────────────────────────
  const codeColumns = buildCodeColumns(handleToggleActive);
  const redemptionColumns = buildRedemptionColumns();

  // ── Whether Create button is enabled ──────────────────────────────────────
  const canCreate = code.trim().length > 0 && Number(discountValue) > 0;

  return (
    <>
      <PageMeta
        title="Promotions"
        description="Create and manage promo codes and view redemption history."
      />

      {/* ── Create form ─────────────────────────────────────────────────── */}
      <View style={{ gap: Spacing.two, marginBottom: Spacing.four }}>
        <Text variant="heading" color="text" weight="semibold">
          Create promo code
        </Text>

        {/* Code */}
        <Input
          label="Code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="e.g. SAVE20"
        />

        {/* Type chips */}
        <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
          {PROMO_TYPES.map((t) => (
            <Button
              key={t}
              label={t}
              variant={discountType === t ? 'primary' : 'secondary'}
              size="md"
              onPress={() => setDiscountType(t)}
            />
          ))}
        </View>

        {/* Discount value */}
        <Input
          label="Discount value"
          value={discountValue}
          onChangeText={setDiscountValue}
          keyboardType="numeric"
          placeholder={discountType === 'percentage' ? 'e.g. 20' : 'e.g. 500'}
        />

        {/* Optional limits */}
        <Input
          label="Max discount (optional)"
          value={maxDiscount}
          onChangeText={setMaxDiscount}
          keyboardType="numeric"
          placeholder="Leave blank for unlimited"
        />
        <Input
          label="Max redemptions (optional)"
          value={maxRedemptions}
          onChangeText={setMaxRedemptions}
          keyboardType="numeric"
          placeholder="Leave blank for unlimited"
        />
        <Input
          label="Per-user limit"
          value={perUserLimit}
          onChangeText={setPerUserLimit}
          keyboardType="numeric"
          placeholder="1"
        />

        {/* Date window — optional ISO strings */}
        <Input
          label="Starts at (ISO, optional)"
          value={startsAt}
          onChangeText={setStartsAt}
          placeholder="e.g. 2026-07-01T00:00:00Z"
        />
        <Input
          label="Ends at (ISO, optional)"
          value={endsAt}
          onChangeText={setEndsAt}
          placeholder="e.g. 2026-12-31T23:59:59Z"
        />

        {/* is_active toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <Text variant="label" color="text">
            Active
          </Text>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>

        {createError ? (
          <Text variant="caption" color="error">
            {createError}
          </Text>
        ) : null}

        <Button
          label="Create promo"
          variant="primary"
          size="md"
          onPress={() => void handleCreate()}
          disabled={!canCreate || creating}
        />
      </View>

      {/* ── Action error ────────────────────────────────────────────────── */}
      {actionError ? (
        <Text variant="caption" color="error">
          {actionError}
        </Text>
      ) : null}

      {/* ── Codes list ──────────────────────────────────────────────────── */}
      <Text variant="heading" color="text" weight="semibold" style={{ marginBottom: Spacing.two }}>
        Promo codes
      </Text>
      <DataTable
        columns={codeColumns}
        rows={codes}
        keyExtractor={(r) => r.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No promo codes yet."
      />

      {/* ── Redemption history ───────────────────────────────────────────── */}
      <Text
        variant="heading"
        color="text"
        weight="semibold"
        style={{ marginTop: Spacing.five, marginBottom: Spacing.two }}>
        Redemption history
      </Text>
      <DataTable
        columns={redemptionColumns}
        rows={redemptions}
        keyExtractor={(r) => r.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No redemptions yet."
      />
    </>
  );
}
