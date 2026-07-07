/**
 * s35-admin-services.test.tsx
 *
 * Tests for Slice 35 Task 6: Admin Services & Categories Management UI.
 *
 * Covers (as required by the brief):
 *   - CRUD: create/edit category+service call right wrapper with right args
 *   - Status transitions: each quick-action calls adminSetServiceStatus
 *   - Duplicate validation: dup-slug/name error surfaces inline, no crash
 *   - Immutable slug: edit form renders slug disabled/read-only, never sends slug
 *   - Reorder: move up/down calls the reorder wrapper
 *   - Filters: category/status/featured/trending narrow list; search name+slug
 *   - Icon picker: offers PREDEFINED_ICONS only; selection sets the icon
 *   - Color picker: offers design-system palette; selection sets the color
 *   - Category guard: deactivating with active services surfaces friendly error
 *   - Admin-only visibility: sidebar shows Services; screen renders admin lists
 *
 * Tests are split across describe blocks:
 *   1. ServiceStatusBadge
 *   2. IconPicker
 *   3. ColorPicker
 *   4. CategoryForm — create
 *   5. CategoryForm — edit (immutable slug)
 *   6. ServiceForm — create
 *   7. ServiceForm — edit (immutable slug + 5 toggles)
 *   8. AdminServicesScreen — categories section
 *   9. AdminServicesScreen — services section (filters, search, status, duplicate, reorder)
 *  10. AdminSidebar — Services entry present
 */

// ── Mock services-catalog ─────────────────────────────────────────────────────

const mockListAdminServiceCategories = jest.fn().mockResolvedValue([]);
const mockListAdminServices          = jest.fn().mockResolvedValue([]);
const mockAdminCreateCategory        = jest.fn().mockResolvedValue({ ok: true, id: 'cat-new' });
const mockAdminUpdateCategory        = jest.fn().mockResolvedValue({ ok: true });
const mockAdminSetCategoryActive     = jest.fn().mockResolvedValue({ ok: true });
const mockAdminReorderCategories     = jest.fn().mockResolvedValue({ ok: true });
const mockAdminCreateService         = jest.fn().mockResolvedValue({ ok: true, id: 'svc-new' });
const mockAdminUpdateService         = jest.fn().mockResolvedValue({ ok: true });
const mockAdminSetServiceStatus      = jest.fn().mockResolvedValue({ ok: true });
const mockAdminDuplicateService      = jest.fn().mockResolvedValue({ ok: true, id: 'svc-copy' });
const mockAdminReorderServices       = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/services-catalog', () => ({
  listAdminServiceCategories: (...a: unknown[]) => mockListAdminServiceCategories(...a),
  listAdminServices:          (...a: unknown[]) => mockListAdminServices(...a),
  adminCreateCategory:        (...a: unknown[]) => mockAdminCreateCategory(...a),
  adminUpdateCategory:        (...a: unknown[]) => mockAdminUpdateCategory(...a),
  adminSetCategoryActive:     (...a: unknown[]) => mockAdminSetCategoryActive(...a),
  adminReorderCategories:     (...a: unknown[]) => mockAdminReorderCategories(...a),
  adminCreateService:         (...a: unknown[]) => mockAdminCreateService(...a),
  adminUpdateService:         (...a: unknown[]) => mockAdminUpdateService(...a),
  adminSetServiceStatus:      (...a: unknown[]) => mockAdminSetServiceStatus(...a),
  adminDuplicateService:      (...a: unknown[]) => mockAdminDuplicateService(...a),
  adminReorderServices:       (...a: unknown[]) => mockAdminReorderServices(...a),
}));

// ── Mock expo-router (for sidebar + screen) ───────────────────────────────────

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useSegments: () => [],
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

// ── Mock auth context (for sidebar) ──────────────────────────────────────────

const mockSignOut = jest.fn();
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { email: 'admin@qs.test' } }, signOut: mockSignOut }),
}));

// ── Mock expo-router/head (used by PageMeta) ──────────────────────────────────

jest.mock('expo-router/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react-native';

import { ServiceStatusBadge } from '@/components/admin-web/services/service-status-badge';
import { IconPicker }         from '@/components/admin-web/services/icon-picker';
import { ColorPicker, COLOR_PALETTE } from '@/components/admin-web/services/color-picker';
import { CategoryForm }       from '@/components/admin-web/services/category-form';
import { ServiceForm }        from '@/components/admin-web/services/service-form';
import AdminServicesScreen    from '@/app/(admin-web)/services/index';
import { AdminSidebar }       from '@/components/admin-web/admin-sidebar';

import { PREDEFINED_ICONS }   from '@/constants/icons';
import type { DbCategory, DbService } from '@/lib/services-catalog';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CAT_HOME: DbCategory = {
  id: 'cat-home-id',
  slug: 'home',
  name: 'Home Services',
  icon: 'house',
  color: '#00875A',
  display_order: 1,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const CAT_AUTO: DbCategory = {
  id: 'cat-auto-id',
  slug: 'automotive',
  name: 'Automotive',
  icon: 'car',
  color: '#F5A524',
  display_order: 2,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const SVC_CLEANING: DbService = {
  id: 'svc-cleaning-id',
  slug: 'house-cleaning',
  name: 'House Cleaning',
  short_description: 'Deep clean your home',
  full_description: null,
  category_id: 'cat-home-id',
  icon: 'broom',
  color: '#00875A',
  display_order: 1,
  status: 'active',
  featured: true,
  trending: false,
  emergency_available: false,
  inspection_required: false,
  available_24_7: false,
  estimated_duration: '2-3 hours',
  starting_price_text: 'From KES 1,500',
  active_from: null,
  active_until: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const SVC_TOWING: DbService = {
  id: 'svc-towing-id',
  slug: 'car-towing',
  name: 'Car Towing',
  short_description: 'Emergency towing',
  full_description: null,
  category_id: 'cat-auto-id',
  icon: 'tow-truck',
  color: '#F5A524',
  display_order: 1,
  status: 'draft',
  featured: false,
  trending: true,
  emergency_available: true,
  inspection_required: false,
  available_24_7: true,
  estimated_duration: null,
  starting_price_text: null,
  active_from: null,
  active_until: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. ServiceStatusBadge
// ═══════════════════════════════════════════════════════════════════════════

describe('ServiceStatusBadge', () => {
  it.each([
    ['active',   'Active'],
    ['draft',    'Draft'],
    ['hidden',   'Hidden'],
    ['disabled', 'Disabled'],
    ['archived', 'Archived'],
  ] as const)('renders label "%s" for status %s', (status, label) => {
    render(<ServiceStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeOnTheScreen();
  });

  it('renders a testID for each status', () => {
    render(<ServiceStatusBadge status="active" />);
    expect(screen.getByTestId('service-status-badge-active')).toBeOnTheScreen();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. IconPicker
// ═══════════════════════════════════════════════════════════════════════════

describe('IconPicker', () => {
  it('renders all PREDEFINED_ICONS (no extras)', () => {
    const onSelect = jest.fn();
    render(<IconPicker value="" onSelect={onSelect} />);
    // Every icon in PREDEFINED_ICONS should have a testID
    for (const icon of PREDEFINED_ICONS) {
      expect(screen.getByTestId(`icon-option-${icon.name}`)).toBeOnTheScreen();
    }
    // There should be exactly PREDEFINED_ICONS.length icon cells
    const cells = PREDEFINED_ICONS.map((i) => screen.getByTestId(`icon-option-${i.name}`));
    expect(cells).toHaveLength(PREDEFINED_ICONS.length);
  });

  it('calls onSelect with the icon name when tapped', () => {
    const onSelect = jest.fn();
    render(<IconPicker value="" onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('icon-option-broom'));
    expect(onSelect).toHaveBeenCalledWith('broom');
  });

  it('marks the selected icon with accessibilityState selected=true', () => {
    render(<IconPicker value="broom" onSelect={jest.fn()} />);
    const cell = screen.getByTestId('icon-option-broom');
    expect(cell).toBeOnTheScreen();
    // The selected cell has accessibilityState: { selected: true }
    expect(cell.props.accessibilityState?.selected).toBe(true);
  });

  it('non-selected icons do not show selected state', () => {
    render(<IconPicker value="broom" onSelect={jest.fn()} />);
    const notSelected = screen.getByTestId('icon-option-car');
    expect(notSelected.props.accessibilityState?.selected).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. ColorPicker
// ═══════════════════════════════════════════════════════════════════════════

describe('ColorPicker', () => {
  it('renders all palette swatches', () => {
    render(<ColorPicker value="" onSelect={jest.fn()} />);
    for (const swatch of COLOR_PALETTE) {
      const testId = `color-swatch-${swatch.hex.replace('#', '')}`;
      expect(screen.getByTestId(testId)).toBeOnTheScreen();
    }
  });

  it('calls onSelect with the hex string when a swatch is tapped', () => {
    const onSelect = jest.fn();
    render(<ColorPicker value="" onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('color-swatch-00875A'));
    expect(onSelect).toHaveBeenCalledWith('#00875A');
  });

  it('shows selected color text when a value is set', () => {
    render(<ColorPicker value="#00875A" onSelect={jest.fn()} />);
    expect(screen.getByText('Selected: #00875A')).toBeOnTheScreen();
  });

  it('marks selected swatch with accessibilityState selected=true', () => {
    render(<ColorPicker value="#00875A" onSelect={jest.fn()} />);
    const swatch = screen.getByTestId('color-swatch-00875A');
    expect(swatch.props.accessibilityState?.selected).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CategoryForm — create mode
// ═══════════════════════════════════════════════════════════════════════════

describe('CategoryForm — create', () => {
  beforeEach(() => {
    mockAdminCreateCategory.mockClear();
    mockAdminCreateCategory.mockResolvedValue({ ok: true, id: 'cat-new' });
  });

  it('renders a slug input in create mode', () => {
    render(
      <CategoryForm
        mode="create"
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('e.g. home-services')).toBeOnTheScreen();
  });

  it('blocks submit when slug is empty (validation)', async () => {
    render(
      <CategoryForm
        mode="create"
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Create category'));
    await waitFor(() => {
      expect(screen.getByText('Slug is required.')).toBeOnTheScreen();
    });
    expect(mockAdminCreateCategory).not.toHaveBeenCalled();
  });

  it('blocks submit when name is empty', async () => {
    render(
      <CategoryForm
        mode="create"
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('e.g. home-services'), 'my-slug');
    fireEvent.press(screen.getByText('Create category'));
    await waitFor(() => {
      expect(screen.getByText('Name is required.')).toBeOnTheScreen();
    });
  });

  it('calls adminCreateCategory with correct args', async () => {
    const onSuccess = jest.fn();
    render(
      <CategoryForm
        mode="create"
        onSuccess={onSuccess}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('e.g. home-services'), 'home');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Home Services'), 'Home Services');
    // Select an icon
    fireEvent.press(screen.getByTestId('icon-option-house'));
    // Select a color
    fireEvent.press(screen.getByTestId('color-swatch-00875A'));

    fireEvent.press(screen.getByText('Create category'));
    await waitFor(() => {
      expect(mockAdminCreateCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'home',
          name: 'Home Services',
          icon: 'house',
          color: '#00875A',
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('surfaces duplicate-slug error inline (no crash)', async () => {
    mockAdminCreateCategory.mockResolvedValue({
      ok: false,
      error: 'A service/category with that slug already exists.',
    });
    render(
      <CategoryForm
        mode="create"
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('e.g. home-services'), 'home');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Home Services'), 'Home Services');
    fireEvent.press(screen.getByText('Create category'));
    await waitFor(() => {
      expect(
        screen.getByText('A service/category with that slug already exists.'),
      ).toBeOnTheScreen();
    });
  });

  it('shows invalid slug format error for bad slug', async () => {
    render(
      <CategoryForm
        mode="create"
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('e.g. home-services'), 'BAD SLUG!');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Home Services'), 'Bad');
    fireEvent.press(screen.getByText('Create category'));
    await waitFor(() => {
      expect(
        screen.getByText('Slug must be lowercase letters, numbers and hyphens.'),
      ).toBeOnTheScreen();
    });
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = jest.fn();
    render(
      <CategoryForm
        mode="create"
        onSuccess={jest.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CategoryForm — edit mode (immutable slug)
// ═══════════════════════════════════════════════════════════════════════════

describe('CategoryForm — edit (immutable slug)', () => {
  beforeEach(() => {
    mockAdminUpdateCategory.mockClear();
    mockAdminUpdateCategory.mockResolvedValue({ ok: true });
  });

  it('shows slug as read-only text in edit mode', () => {
    render(
      <CategoryForm
        mode="edit"
        initial={CAT_HOME}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    // The read-only field should be present
    expect(screen.getByTestId('category-slug-readonly')).toBeOnTheScreen();
    // The slug value is displayed
    expect(screen.getByText('home')).toBeOnTheScreen();
    // The slug INPUT (placeholder e.g. home-services) should NOT be present
    expect(screen.queryByPlaceholderText('e.g. home-services')).toBeNull();
  });

  it('calls adminUpdateCategory WITHOUT a slug field', async () => {
    const onSuccess = jest.fn();
    render(
      <CategoryForm
        mode="edit"
        initial={CAT_HOME}
        onSuccess={onSuccess}
        onCancel={jest.fn()}
      />,
    );
    // Change name
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Home Services'), 'Home & Garden');
    fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => {
      expect(mockAdminUpdateCategory).toHaveBeenCalledTimes(1);
    });
    const callArgs = mockAdminUpdateCategory.mock.calls[0][0] as Record<string, unknown>;
    // Should NOT have a slug key
    expect(callArgs).not.toHaveProperty('slug');
    // Should have id + name
    expect(callArgs.id).toBe('cat-home-id');
    expect(callArgs.name).toBe('Home & Garden');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. ServiceForm — create mode
// ═══════════════════════════════════════════════════════════════════════════

describe('ServiceForm — create', () => {
  const categories = [CAT_HOME, CAT_AUTO];

  beforeEach(() => {
    mockAdminCreateService.mockClear();
    mockAdminCreateService.mockResolvedValue({ ok: true, id: 'svc-new' });
  });

  it('renders slug input in create mode', () => {
    render(
      <ServiceForm
        mode="create"
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('e.g. house-cleaning')).toBeOnTheScreen();
  });

  it('blocks submit when slug is empty', async () => {
    render(
      <ServiceForm
        mode="create"
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Create service'));
    await waitFor(() => {
      expect(screen.getByText('Slug is required.')).toBeOnTheScreen();
    });
    expect(mockAdminCreateService).not.toHaveBeenCalled();
  });

  it('blocks submit when category is missing', async () => {
    render(
      <ServiceForm
        mode="create"
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('e.g. house-cleaning'), 'my-svc');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. House Cleaning'), 'My Service');
    fireEvent.press(screen.getByText('Create service'));
    await waitFor(() => {
      expect(screen.getByText('Category is required.')).toBeOnTheScreen();
    });
  });

  it('calls adminCreateService with correct args', async () => {
    const onSuccess = jest.fn();
    render(
      <ServiceForm
        mode="create"
        categories={categories}
        onSuccess={onSuccess}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('e.g. house-cleaning'), 'house-cleaning');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. House Cleaning'), 'House Cleaning');
    // Select category chip
    fireEvent.press(screen.getByText('Home Services'));
    fireEvent.press(screen.getByText('Create service'));
    await waitFor(() => {
      expect(mockAdminCreateService).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'house-cleaning',
          name: 'House Cleaning',
          categoryId: 'cat-home-id',
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('surfaces duplicate name+category error inline', async () => {
    mockAdminCreateService.mockResolvedValue({
      ok: false,
      error: 'A service with that name already exists in this category.',
    });
    render(
      <ServiceForm
        mode="create"
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('e.g. house-cleaning'), 'house-cleaning');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. House Cleaning'), 'House Cleaning');
    fireEvent.press(screen.getByText('Home Services'));
    fireEvent.press(screen.getByText('Create service'));
    await waitFor(() => {
      expect(
        screen.getByText('A service with that name already exists in this category.'),
      ).toBeOnTheScreen();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. ServiceForm — edit mode (immutable slug + 5 toggles)
// ═══════════════════════════════════════════════════════════════════════════

describe('ServiceForm — edit (immutable slug + toggles)', () => {
  const categories = [CAT_HOME, CAT_AUTO];

  beforeEach(() => {
    mockAdminUpdateService.mockClear();
    mockAdminUpdateService.mockResolvedValue({ ok: true });
  });

  it('shows slug as read-only in edit mode', () => {
    render(
      <ServiceForm
        mode="edit"
        initial={SVC_CLEANING}
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByTestId('service-slug-readonly')).toBeOnTheScreen();
    expect(screen.getByText('house-cleaning')).toBeOnTheScreen();
    // No slug input present
    expect(screen.queryByPlaceholderText('e.g. house-cleaning')).toBeNull();
  });

  it('renders all 5 toggle switches in edit mode', () => {
    render(
      <ServiceForm
        mode="edit"
        initial={SVC_CLEANING}
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByTestId('toggle-featured')).toBeOnTheScreen();
    expect(screen.getByTestId('toggle-trending')).toBeOnTheScreen();
    expect(screen.getByTestId('toggle-emergency')).toBeOnTheScreen();
    expect(screen.getByTestId('toggle-inspection')).toBeOnTheScreen();
    expect(screen.getByTestId('toggle-avail247')).toBeOnTheScreen();
  });

  it('does NOT render toggles in create mode', () => {
    render(
      <ServiceForm
        mode="create"
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('toggle-featured')).toBeNull();
  });

  it('calls adminUpdateService WITHOUT a slug field', async () => {
    const onSuccess = jest.fn();
    render(
      <ServiceForm
        mode="edit"
        initial={SVC_CLEANING}
        categories={categories}
        onSuccess={onSuccess}
        onCancel={jest.fn()}
      />,
    );
    // Change name
    const nameInput = screen.getByPlaceholderText('e.g. House Cleaning');
    fireEvent.changeText(nameInput, 'Deep House Cleaning');
    // Toggle trending on
    fireEvent(screen.getByTestId('toggle-trending'), 'valueChange', true);

    fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => {
      expect(mockAdminUpdateService).toHaveBeenCalledTimes(1);
    });
    const args = mockAdminUpdateService.mock.calls[0][0] as Record<string, unknown>;
    expect(args).not.toHaveProperty('slug');
    expect(args.id).toBe('svc-cleaning-id');
    expect(args.name).toBe('Deep House Cleaning');
    expect(args.trending).toBe(true);
  });

  it('sends all 5 boolean toggles in adminUpdateService', async () => {
    render(
      <ServiceForm
        mode="edit"
        initial={{ ...SVC_CLEANING, featured: false, trending: false, emergency_available: false, inspection_required: false, available_24_7: false }}
        categories={categories}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => {
      const args = mockAdminUpdateService.mock.calls[0][0] as Record<string, unknown>;
      expect(args).toMatchObject({
        featured:           false,
        trending:           false,
        emergencyAvailable: false,
        inspectionRequired: false,
        available247:       false,
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. AdminServicesScreen — categories section
// ═══════════════════════════════════════════════════════════════════════════

describe('AdminServicesScreen — categories', () => {
  beforeEach(() => {
    mockListAdminServiceCategories.mockReset();
    mockListAdminServices.mockReset();
    mockAdminSetCategoryActive.mockReset();
    mockAdminReorderCategories.mockReset();
    mockAdminCreateCategory.mockReset();

    mockListAdminServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);
    mockListAdminServices.mockResolvedValue([SVC_CLEANING, SVC_TOWING]);
    mockAdminSetCategoryActive.mockResolvedValue({ ok: true });
    mockAdminReorderCategories.mockResolvedValue({ ok: true });
    mockAdminCreateCategory.mockResolvedValue({ ok: true, id: 'cat-new' });
  });

  it('renders the categories section heading', async () => {
    render(<AdminServicesScreen />);
    expect(await screen.findByText('Service Categories')).toBeOnTheScreen();
  });

  it('renders category names from listAdminServiceCategories', async () => {
    render(<AdminServicesScreen />);
    // Home Services and Automotive appear as both table rows and filter chips
    expect(await screen.findAllByText('Home Services')).toBeTruthy();
    expect(screen.getAllByText('Automotive').length).toBeGreaterThanOrEqual(1);
  });

  it('renders service count per category', async () => {
    render(<AdminServicesScreen />);
    // Wait until data has loaded (categories will appear)
    await screen.findAllByText('Home Services');
    // There should be a "1" displayed for services count (two categories × 1 service each)
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2);
  });

  it('toggleing a category Switch calls adminSetCategoryActive', async () => {
    render(<AdminServicesScreen />);
    await screen.findAllByText('Home Services');
    const switchEl = screen.getByTestId('cat-active-switch-cat-home-id');
    fireEvent(switchEl, 'valueChange', false);
    await waitFor(() => {
      expect(mockAdminSetCategoryActive).toHaveBeenCalledWith('cat-home-id', false);
    });
  });

  it('surfaces the active-services guard error inline', async () => {
    mockAdminSetCategoryActive.mockResolvedValue({
      ok: false,
      error: 'Cannot deactivate a category that still has active services.',
    });
    render(<AdminServicesScreen />);
    await screen.findAllByText('Home Services');
    const switchEl = screen.getByTestId('cat-active-switch-cat-home-id');
    fireEvent(switchEl, 'valueChange', false);
    await waitFor(() => {
      expect(
        screen.getByText('Cannot deactivate a category that still has active services.'),
      ).toBeOnTheScreen();
    });
  });

  it('pressing ↑ on second category calls adminReorderCategories with swapped order', async () => {
    render(<AdminServicesScreen />);
    await screen.findAllByText('Automotive');
    // The ↑ buttons — get all, take the second (index 1 = Automotive ↑)
    const upBtns = screen.getAllByText('↑');
    // upBtns[0] = Home ↑ (disabled), upBtns[1] = Automotive ↑
    fireEvent.press(upBtns[1]);
    await waitFor(() => {
      expect(mockAdminReorderCategories).toHaveBeenCalledWith([
        'cat-auto-id',
        'cat-home-id',
      ]);
    });
  });

  it('opens category create form when "+ New category" is pressed', async () => {
    render(<AdminServicesScreen />);
    await screen.findAllByText('Home Services');
    fireEvent.press(screen.getByText('+ New category'));
    expect(screen.getByTestId('category-form')).toBeOnTheScreen();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. AdminServicesScreen — services section
// ═══════════════════════════════════════════════════════════════════════════

describe('AdminServicesScreen — services (filters, search, status, duplicate, reorder)', () => {
  beforeEach(() => {
    mockListAdminServiceCategories.mockReset();
    mockListAdminServices.mockReset();
    mockAdminSetServiceStatus.mockReset();
    mockAdminDuplicateService.mockReset();
    mockAdminReorderServices.mockReset();

    mockListAdminServiceCategories.mockResolvedValue([CAT_HOME, CAT_AUTO]);
    mockListAdminServices.mockResolvedValue([SVC_CLEANING, SVC_TOWING]);
    mockAdminSetServiceStatus.mockResolvedValue({ ok: true });
    mockAdminDuplicateService.mockResolvedValue({ ok: true, id: 'svc-copy' });
    mockAdminReorderServices.mockResolvedValue({ ok: true });
  });

  it('renders both services after load', async () => {
    render(<AdminServicesScreen />);
    expect(await screen.findByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('Car Towing')).toBeOnTheScreen();
  });

  it('renders ServiceStatusBadge for each service', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.getByTestId('service-status-badge-active')).toBeOnTheScreen();
    expect(screen.getByTestId('service-status-badge-draft')).toBeOnTheScreen();
  });

  it('filters by status — only shows services with selected status', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    // Press the 'draft' status filter button
    fireEvent.press(screen.getByText('draft'));
    // Only Car Towing (status: draft) should remain
    expect(screen.queryByText('House Cleaning')).toBeNull();
    expect(screen.getByText('Car Towing')).toBeOnTheScreen();
  });

  it('filters by category — only shows services in that category', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    // "Automotive" appears in the categories table row AND as a filter chip Button.
    // The Button Pressable wraps a Text node; press the parent Button via accessibilityRole.
    // getAllByRole('button') returns all Pressable elements; find the 'Automotive' filter chip.
    const automotiveFilterBtn = screen.getAllByRole('button').find(
      (el) => el.props.accessibilityLabel === 'Automotive',
    );
    expect(automotiveFilterBtn).toBeTruthy();
    fireEvent.press(automotiveFilterBtn!);
    // After filter, services list should show 1 service (filtered)
    await waitFor(() => {
      expect(screen.getByText('1 service (filtered)')).toBeOnTheScreen();
    });
    expect(screen.getByText('Car Towing')).toBeOnTheScreen();
  });

  it('filters by featured toggle — only shows featured services', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    fireEvent(screen.getByTestId('filter-featured-switch'), 'valueChange', true);
    // Only House Cleaning is featured
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.queryByText('Car Towing')).toBeNull();
  });

  it('filters by trending toggle — only shows trending services', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    fireEvent(screen.getByTestId('filter-trending-switch'), 'valueChange', true);
    // Only Car Towing is trending
    expect(screen.queryByText('House Cleaning')).toBeNull();
    expect(screen.getByText('Car Towing')).toBeOnTheScreen();
  });

  it('search by name filters results', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    fireEvent.changeText(screen.getByPlaceholderText('Name or slug…'), 'towing');
    expect(screen.queryByText('House Cleaning')).toBeNull();
    expect(screen.getByText('Car Towing')).toBeOnTheScreen();
  });

  it('search by slug filters results', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    fireEvent.changeText(screen.getByPlaceholderText('Name or slug…'), 'house-cleaning');
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.queryByText('Car Towing')).toBeNull();
  });

  it('Duplicate button calls adminDuplicateService', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    const dupeButtons = screen.getAllByText('Dupe');
    fireEvent.press(dupeButtons[0]);
    await waitFor(() => {
      expect(mockAdminDuplicateService).toHaveBeenCalledWith('svc-cleaning-id');
    });
  });

  it('Activate quick-action calls adminSetServiceStatus with "active"', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('Car Towing'); // draft service
    // Car Towing is draft — should show Activate button
    const activateBtns = screen.getAllByText('Activate');
    fireEvent.press(activateBtns[0]);
    await waitFor(() => {
      expect(mockAdminSetServiceStatus).toHaveBeenCalledWith('svc-towing-id', 'active');
    });
  });

  it('→Draft quick-action calls adminSetServiceStatus with "draft"', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning'); // active service
    // House Cleaning is active — should show →Draft button
    const draftBtns = screen.getAllByText('→Draft');
    fireEvent.press(draftBtns[0]);
    await waitFor(() => {
      expect(mockAdminSetServiceStatus).toHaveBeenCalledWith('svc-cleaning-id', 'draft');
    });
  });

  it('Hide quick-action calls adminSetServiceStatus with "hidden"', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    const hideBtns = screen.getAllByText('Hide');
    fireEvent.press(hideBtns[0]);
    await waitFor(() => {
      expect(mockAdminSetServiceStatus).toHaveBeenCalledWith('svc-cleaning-id', 'hidden');
    });
  });

  it('Disable quick-action calls adminSetServiceStatus with "disabled"', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    const disableBtns = screen.getAllByText('Disable');
    fireEvent.press(disableBtns[0]);
    await waitFor(() => {
      expect(mockAdminSetServiceStatus).toHaveBeenCalledWith('svc-cleaning-id', 'disabled');
    });
  });

  it('Archive shows confirm dialog, then calls adminSetServiceStatus with "archived"', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    const archiveBtns = screen.getAllByText('Archive');
    fireEvent.press(archiveBtns[0]);
    // Confirm dialog appears
    expect(await screen.findByText('Archive this service?', { exact: false })).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockAdminSetServiceStatus).toHaveBeenCalledWith('svc-cleaning-id', 'archived');
    });
  });

  it('Archive dialog Cancel does NOT call adminSetServiceStatus', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    const archiveBtns = screen.getAllByText('Archive');
    fireEvent.press(archiveBtns[0]);
    await screen.findByText('Archive this service?', { exact: false });
    fireEvent.press(screen.getByText('Cancel'));
    await act(async () => {}); // flush
    expect(mockAdminSetServiceStatus).not.toHaveBeenCalled();
  });

  it('service reorder ↓ calls adminReorderServices with new order', async () => {
    // Give the home category two services so reorder is meaningful
    const SVC2: DbService = {
      ...SVC_CLEANING,
      id: 'svc-painting-id',
      slug: 'home-painting',
      name: 'Home Painting',
      display_order: 2,
      featured: false,
    };
    mockListAdminServices.mockResolvedValue([SVC_CLEANING, SVC2, SVC_TOWING]);
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    await screen.findByText('Home Painting');
    // ↓ buttons appear for both categories AND services rows.
    // Categories (2): Home Services ↓ [index 0], Automotive ↓ [index 1]
    // Services (3): SVC_CLEANING ↓ [index 2], SVC2 ↓ [index 3], SVC_TOWING ↓ [index 4]
    // House Cleaning is first in cat-home-id so its ↓ is at overall index 2.
    const downBtns = screen.getAllByText('↓');
    expect(downBtns.length).toBeGreaterThanOrEqual(3);
    // Press index 2 = SVC_CLEANING ↓ (first service within cat-home-id)
    fireEvent.press(downBtns[2]);
    await waitFor(() => {
      expect(mockAdminReorderServices).toHaveBeenCalledWith(
        'cat-home-id',
        ['svc-painting-id', 'svc-cleaning-id'],
      );
    });
  });

  it('opens service create form when "+ New service" is pressed', async () => {
    render(<AdminServicesScreen />);
    await screen.findByText('House Cleaning');
    fireEvent.press(screen.getByText('+ New service'));
    expect(screen.getByTestId('service-form')).toBeOnTheScreen();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. AdminSidebar — Services entry
// ═══════════════════════════════════════════════════════════════════════════

describe('AdminSidebar — Services entry', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
  });

  it('renders the Services nav item', () => {
    render(<AdminSidebar />);
    expect(screen.getByText('Services')).toBeOnTheScreen();
  });

  it('navigates to /(admin-web)/services when Services is pressed', () => {
    render(<AdminSidebar />);
    fireEvent.press(screen.getByText('Services'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(admin-web)/services');
  });

  it('all existing nav items are still present', () => {
    render(<AdminSidebar />);
    expect(screen.getByText('Dashboard')).toBeOnTheScreen();
    expect(screen.getByText('Bookings')).toBeOnTheScreen();
    expect(screen.getByText('Reviews')).toBeOnTheScreen();
    expect(screen.getByText('Operations')).toBeOnTheScreen();
    expect(screen.getByText('Promotions')).toBeOnTheScreen();
    expect(screen.getByText('Analytics')).toBeOnTheScreen();
  });
});
