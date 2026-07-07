/**
 * src/app/(admin-web)/services/index.tsx — Admin Services & Categories Management
 *
 * Two sections on a single scrollable screen:
 *
 * 1. CATEGORIES — list ordered by display_order; service-count per category;
 *    create/edit form; activate/deactivate (active-services guard surfaced inline);
 *    move-up / move-down reorder.
 *
 * 2. SERVICES — list (all statuses); filters (category, status, featured, trending);
 *    search (name/slug); create/edit form (slug immutable on edit); 5 boolean
 *    toggles on edit; duplicate; status quick-actions; move-up/move-down.
 *
 * All mutation helpers come from @/lib/services-catalog.
 * Lists reload after every successful mutation.
 * No booking/dispatch/payment/wallet/promotions/payout/auth/notification change.
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { ServiceStatusBadge } from '@/components/admin-web/services/service-status-badge';
import { CategoryForm } from '@/components/admin-web/services/category-form';
import { ServiceForm } from '@/components/admin-web/services/service-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Radii, Spacing } from '@/constants/theme';
import { iconGlyphByName } from '@/constants/icons';
import { useTheme } from '@/hooks/use-theme';
import {
  adminDuplicateService,
  adminReorderCategories,
  adminReorderServices,
  adminSetCategoryActive,
  adminSetServiceStatus,
  listAdminServiceCategories,
  listAdminServices,
  type DbCategory,
  type DbService,
  type ServiceStatus,
} from '@/lib/services-catalog';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_STATUSES: ServiceStatus[] = ['draft', 'active', 'hidden', 'disabled', 'archived'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Move item at index `from` to `from + delta`, return new array. */
function swapByDelta<T>(arr: T[], from: number, delta: -1 | 1): T[] {
  const to = from + delta;
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.sectionHeader, { borderBottomColor: theme.border }]}>
      <Text variant="title" color="text" weight="bold">
        {title}
      </Text>
    </View>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  visible,
  message,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <Pressable
        style={styles.modalOverlay}
        onPress={onCancel}>
        <Pressable
          style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => { /* swallow */ }}>
          <Text variant="body" color="text">{message}</Text>
          <View style={styles.dialogActions}>
            <Button label="Cancel" variant="secondary" size="md" onPress={onCancel} />
            <Button label="Confirm" variant="primary" size="md" onPress={onConfirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminServicesScreen() {
  const theme = useTheme();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [categories,   setCategories]   = useState<DbCategory[]>([]);
  const [services,     setServices]     = useState<DbService[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(false);

  // ── Category form state ─────────────────────────────────────────────────────
  const [showCatForm,  setShowCatForm]  = useState(false);
  const [editCat,      setEditCat]      = useState<DbCategory | undefined>();
  const [catActionErr, setCatActionErr] = useState('');

  // ── Service form state ──────────────────────────────────────────────────────
  const [showSvcForm,  setShowSvcForm]  = useState(false);
  const [editSvc,      setEditSvc]      = useState<DbService | undefined>();
  const [svcActionErr, setSvcActionErr] = useState('');

  // ── Archive confirm dialog ──────────────────────────────────────────────────
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);

  // ── Service filters + search ────────────────────────────────────────────────
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus,   setFilterStatus]   = useState<ServiceStatus | ''>('');
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [filterTrending, setFilterTrending] = useState(false);
  const [searchQuery,    setSearchQuery]     = useState('');

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const [cats, svcs] = await Promise.all([
        listAdminServiceCategories(),
        listAdminServices(),
      ]);
      setCategories(cats);
      setServices(svcs);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived: service count per category ────────────────────────────────────

  const svcCountByCat: Record<string, number> = {};
  for (const svc of services) {
    if (svc.category_id) {
      svcCountByCat[svc.category_id] = (svcCountByCat[svc.category_id] ?? 0) + 1;
    }
  }

  // ── Derived: filtered services ─────────────────────────────────────────────

  const filteredServices = services.filter((svc) => {
    if (filterCategory && svc.category_id !== filterCategory) return false;
    if (filterStatus   && svc.status !== filterStatus)        return false;
    if (filterFeatured && !svc.featured)                      return false;
    if (filterTrending && !svc.trending)                      return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!svc.name.toLowerCase().includes(q) && !svc.slug.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Category actions ────────────────────────────────────────────────────────

  async function handleToggleCategoryActive(cat: DbCategory) {
    setCatActionErr('');
    const result = await adminSetCategoryActive(cat.id, !cat.active);
    if (result.ok) {
      await load();
    } else {
      setCatActionErr(result.error ?? 'Could not update category.');
    }
  }

  async function handleReorderCategory(index: number, delta: -1 | 1) {
    const newOrder = swapByDelta(categories, index, delta);
    setCategories(newOrder); // optimistic
    const result = await adminReorderCategories(newOrder.map((c) => c.id));
    if (!result.ok) {
      await load(); // revert on failure
      setCatActionErr(result.error ?? 'Could not reorder.');
    }
  }

  // ── Service actions ─────────────────────────────────────────────────────────

  async function handleSetStatus(svc: DbService, status: ServiceStatus) {
    if (status === 'archived') {
      setArchiveTarget(svc.id);
      return;
    }
    setSvcActionErr('');
    const result = await adminSetServiceStatus(svc.id, status);
    if (result.ok) {
      await load();
    } else {
      setSvcActionErr(result.error ?? 'Could not update service status.');
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setSvcActionErr('');
    setArchiveTarget(null);
    const result = await adminSetServiceStatus(archiveTarget, 'archived');
    if (result.ok) {
      await load();
    } else {
      setSvcActionErr(result.error ?? 'Could not archive service.');
    }
  }

  async function handleDuplicate(svc: DbService) {
    setSvcActionErr('');
    const result = await adminDuplicateService(svc.id);
    if (result.ok) {
      await load();
    } else {
      setSvcActionErr(result.error ?? 'Could not duplicate service.');
    }
  }

  async function handleReorderService(svc: DbService, index: number, delta: -1 | 1) {
    // Only reorder services within the same category
    const sameCat = services.filter((s) => s.category_id === svc.category_id);
    const localIdx = sameCat.findIndex((s) => s.id === svc.id);
    if (localIdx === -1) return;
    const newCatOrder = swapByDelta(sameCat, localIdx, delta);
    // Reconstruct the full list with the new sub-order
    const newServices = services.map((s) => {
      if (s.category_id !== svc.category_id) return s;
      return newCatOrder.find((x) => x.id === s.id)!;
    });
    setServices(newServices); // optimistic
    const result = await adminReorderServices(
      svc.category_id!,
      newCatOrder.map((s) => s.id),
    );
    if (!result.ok) {
      await load();
      setSvcActionErr(result.error ?? 'Could not reorder service.');
    }
  }

  // ── Category table columns ──────────────────────────────────────────────────

  const catColumns: Column<DbCategory & { _index: number }>[] = [
    {
      key: 'icon',
      header: 'Icon',
      render: (row) => (
        <Text style={styles.iconGlyph}>{iconGlyphByName(row.icon ?? '')}</Text>
      ),
      width: 56,
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <Text variant="label" color="text" weight="semibold">{row.name}</Text>
      ),
      width: 160,
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (row) => (
        <Text variant="caption" color="textSecondary">{row.slug}</Text>
      ),
      width: 160,
    },
    {
      key: 'color',
      header: 'Color',
      render: (row) =>
        row.color ? (
          <View style={[styles.colorDot, { backgroundColor: row.color }]} />
        ) : (
          <Text variant="caption" color="textTertiary">—</Text>
        ),
      width: 64,
    },
    {
      key: 'services',
      header: 'Services',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {svcCountByCat[row.id] ?? 0}
        </Text>
      ),
      width: 80,
    },
    {
      key: 'active',
      header: 'Active',
      render: (row) => (
        <Switch
          value={row.active}
          onValueChange={() => void handleToggleCategoryActive(row)}
          testID={`cat-active-switch-${row.id}`}
        />
      ),
      width: 72,
    },
    {
      key: 'edit',
      header: 'Edit',
      render: (row) => (
        <Button
          label="Edit"
          variant="ghost"
          size="md"
          onPress={() => {
            setEditCat(row);
            setShowCatForm(true);
          }}
        />
      ),
      width: 70,
    },
    {
      key: 'order',
      header: 'Order',
      render: (row) => (
        <View style={styles.orderButtons}>
          <Button
            label="↑"
            variant="secondary"
            size="md"
            onPress={() => void handleReorderCategory(row._index, -1)}
            disabled={row._index === 0}
          />
          <Button
            label="↓"
            variant="secondary"
            size="md"
            onPress={() => void handleReorderCategory(row._index, 1)}
            disabled={row._index === categories.length - 1}
          />
        </View>
      ),
      width: 120,
    },
  ];

  // Category rows enriched with their display index
  const catRows = categories.map((c, i) => ({ ...c, _index: i }));

  // ── Service table columns ───────────────────────────────────────────────────

  const svcColumns: Column<DbService & { _catIndex: number; _svcIndex: number }>[] = [
    {
      key: 'icon',
      header: 'Icon',
      render: (row) => (
        <Text style={styles.iconGlyph}>{iconGlyphByName(row.icon ?? '')}</Text>
      ),
      width: 56,
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <Text variant="label" color="text" weight="semibold">{row.name}</Text>
      ),
      width: 160,
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (row) => (
        <Text variant="caption" color="textSecondary">{row.slug}</Text>
      ),
      width: 160,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => {
        const cat = categories.find((c) => c.id === row.category_id);
        return (
          <Text variant="caption" color="textSecondary">{cat?.name ?? '—'}</Text>
        );
      },
      width: 140,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <ServiceStatusBadge status={row.status} />,
      width: 96,
    },
    {
      key: 'flags',
      header: 'Flags',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {[
            row.featured    && '⭐',
            row.trending    && '🔥',
            row.emergency_available && '🚨',
            row.available_24_7      && '24h',
            row.inspection_required && '🔍',
          ].filter(Boolean).join(' ') || '—'}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <View style={styles.actionGroup}>
          <Button
            label="Edit"
            variant="ghost"
            size="md"
            onPress={() => {
              setEditSvc(row);
              setShowSvcForm(true);
            }}
          />
          <Button
            label="Dupe"
            variant="ghost"
            size="md"
            onPress={() => void handleDuplicate(row)}
          />
        </View>
      ),
      width: 130,
    },
    {
      key: 'status_action',
      header: 'Status action',
      render: (row) => (
        <View style={styles.actionGroup}>
          {row.status !== 'active'   && <Button label="Activate" variant="secondary" size="md" onPress={() => void handleSetStatus(row, 'active')} />}
          {row.status !== 'draft'    && <Button label="→Draft"   variant="ghost"     size="md" onPress={() => void handleSetStatus(row, 'draft')} />}
          {row.status !== 'hidden'   && <Button label="Hide"     variant="ghost"     size="md" onPress={() => void handleSetStatus(row, 'hidden')} />}
          {row.status !== 'disabled' && <Button label="Disable"  variant="ghost"     size="md" onPress={() => void handleSetStatus(row, 'disabled')} />}
          {row.status !== 'archived' && <Button label="Archive"  variant="ghost"     size="md" onPress={() => void handleSetStatus(row, 'archived')} />}
        </View>
      ),
      width: 260,
    },
    {
      key: 'order',
      header: 'Order',
      render: (row) => {
        const sameCat = services.filter((s) => s.category_id === row.category_id);
        const localIdx = sameCat.findIndex((s) => s.id === row.id);
        return (
          <View style={styles.orderButtons}>
            <Button
              label="↑"
              variant="secondary"
              size="md"
              onPress={() => void handleReorderService(row, row._svcIndex, -1)}
              disabled={localIdx === 0}
            />
            <Button
              label="↓"
              variant="secondary"
              size="md"
              onPress={() => void handleReorderService(row, row._svcIndex, 1)}
              disabled={localIdx === sameCat.length - 1}
            />
          </View>
        );
      },
      width: 120,
    },
  ];

  // Enrich service rows with their global index
  const svcRows = filteredServices.map((s, i) => ({
    ...s,
    _catIndex: categories.findIndex((c) => c.id === s.category_id),
    _svcIndex: i,
  }));

  // ── Category name for display ───────────────────────────────────────────────
  function catName(id: string) {
    return categories.find((c) => c.id === id)?.name ?? id;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID="admin-services-screen">
      <PageMeta
        title="Services"
        description="Manage service categories and services."
      />

      {/* ═══════════════════════════════════════════════ CATEGORIES ═══════ */}
      <SectionHeader title="Service Categories" />

      {/* Category action error */}
      {catActionErr ? (
        <Text variant="caption" color="error" testID="cat-action-error">
          {catActionErr}
        </Text>
      ) : null}

      {/* Create category button */}
      {!showCatForm && (
        <Button
          label="+ New category"
          variant="primary"
          size="md"
          onPress={() => {
            setEditCat(undefined);
            setShowCatForm(true);
          }}
        />
      )}

      {/* Category form (inline) */}
      {showCatForm && (
        <View
          style={[styles.formCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <CategoryForm
            mode={editCat ? 'edit' : 'create'}
            initial={editCat}
            onSuccess={() => {
              setShowCatForm(false);
              setEditCat(undefined);
              void load();
            }}
            onCancel={() => {
              setShowCatForm(false);
              setEditCat(undefined);
            }}
          />
        </View>
      )}

      {/* Categories table */}
      <DataTable
        columns={catColumns}
        rows={catRows}
        keyExtractor={(r) => r.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No categories yet."
      />

      {/* ═══════════════════════════════════════════════ SERVICES ═══════ */}
      <SectionHeader title="Services" />

      {/* Service action error */}
      {svcActionErr ? (
        <Text variant="caption" color="error" testID="svc-action-error">
          {svcActionErr}
        </Text>
      ) : null}

      {/* Filters row */}
      <View style={styles.filtersRow}>
        {/* Search */}
        <View style={styles.searchBox}>
          <Input
            label="Search"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Name or slug…"
          />
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterChips}>
        {/* Category filter */}
        <View style={styles.filterGroup}>
          <Text variant="caption" color="textSecondary">Category:</Text>
          <Button
            label="All"
            variant={filterCategory === '' ? 'primary' : 'secondary'}
            size="md"
            onPress={() => setFilterCategory('')}
          />
          {categories.map((cat) => (
            <Button
              key={cat.id}
              label={cat.name}
              variant={filterCategory === cat.id ? 'primary' : 'secondary'}
              size="md"
              onPress={() => setFilterCategory(cat.id)}
            />
          ))}
        </View>

        {/* Status filter */}
        <View style={styles.filterGroup}>
          <Text variant="caption" color="textSecondary">Status:</Text>
          <Button
            label="All"
            variant={filterStatus === '' ? 'primary' : 'secondary'}
            size="md"
            onPress={() => setFilterStatus('')}
          />
          {ALL_STATUSES.map((s) => (
            <Button
              key={s}
              label={s}
              variant={filterStatus === s ? 'primary' : 'secondary'}
              size="md"
              onPress={() => setFilterStatus(s)}
            />
          ))}
        </View>

        {/* Featured + Trending toggles */}
        <View style={styles.filterGroup}>
          <View style={styles.toggleChip}>
            <Text variant="caption" color="textSecondary">Featured only</Text>
            <Switch
              value={filterFeatured}
              onValueChange={setFilterFeatured}
              testID="filter-featured-switch"
            />
          </View>
          <View style={styles.toggleChip}>
            <Text variant="caption" color="textSecondary">Trending only</Text>
            <Switch
              value={filterTrending}
              onValueChange={setFilterTrending}
              testID="filter-trending-switch"
            />
          </View>
        </View>
      </View>

      {/* Result count */}
      <Text variant="caption" color="textTertiary">
        {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''}
        {(filterCategory || filterStatus || filterFeatured || filterTrending || searchQuery.trim())
          ? ' (filtered)'
          : ''}
      </Text>

      {/* Create service button */}
      {!showSvcForm && (
        <Button
          label="+ New service"
          variant="primary"
          size="md"
          onPress={() => {
            setEditSvc(undefined);
            setShowSvcForm(true);
          }}
        />
      )}

      {/* Service form (inline) */}
      {showSvcForm && (
        <View
          style={[styles.formCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <ServiceForm
            mode={editSvc ? 'edit' : 'create'}
            initial={editSvc}
            categories={categories}
            onSuccess={() => {
              setShowSvcForm(false);
              setEditSvc(undefined);
              void load();
            }}
            onCancel={() => {
              setShowSvcForm(false);
              setEditSvc(undefined);
            }}
          />
        </View>
      )}

      {/* Services table */}
      <DataTable
        columns={svcColumns}
        rows={svcRows}
        keyExtractor={(r) => r.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No services found."
      />

      {/* Archive confirm dialog */}
      <ConfirmDialog
        visible={archiveTarget !== null}
        message="Archive this service? It will no longer be visible to customers."
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiveTarget(null)}
      />
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  sectionHeader: {
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  formCard: {
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  searchBox: {
    flex: 1,
    minWidth: 200,
  },
  filterChips: {
    gap: Spacing.two,
  },
  filterGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  orderButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  actionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  iconGlyph: {
    fontSize: 20,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    maxWidth: 360,
    width: '90%',
    gap: Spacing.three,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
});
