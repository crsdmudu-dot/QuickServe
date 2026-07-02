/**
 * admin-shell.tsx
 *
 * Full-page layout wrapper for the web admin panel.
 *
 * Layout — Desktop (width ≥ AdminBreakpoints.wide):
 *   ┌───────────────┬──────────────────────────────────┐
 *   │ AdminSidebar  │  top-bar  (title | rightSlot)    │
 *   │  (side nav)   │──────────────────────────────────│
 *   │               │  <ScrollView> children           │
 *   └───────────────┴──────────────────────────────────┘
 *
 * Layout — Tablet / narrow (width < AdminBreakpoints.wide):
 *   ┌──────────────────────────────────────────────────┐
 *   │ AdminSidebar orientation="top"  (horiz. nav row) │
 *   ├──────────────────────────────────────────────────┤
 *   │  top-bar  (title | rightSlot)                    │
 *   ├──────────────────────────────────────────────────┤
 *   │  <ScrollView> children                           │
 *   └──────────────────────────────────────────────────┘
 *
 * RN/RN-web safe — no DOM-only APIs.
 */

import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AdminSidebar } from '@/components/admin-web/admin-sidebar';
import { Text } from '@/components/ui/text';
import { AdminBreakpoints } from '@/constants/admin-web';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ── Types ──────────────────────────────────────────────────────────────────

export type AdminShellProps = {
  /** Page title shown in the top bar. */
  title: string;
  /** Optional element rendered at the right end of the top bar (e.g. action buttons). */
  rightSlot?: ReactNode;
  children: ReactNode;
};

// ── Component ──────────────────────────────────────────────────────────────

export function AdminShell({ title, rightSlot, children }: AdminShellProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // Desktop: side-by-side sidebar + content.
  // Tablet/narrow: compact horizontal top-nav stacked above content.
  const isWide = width >= AdminBreakpoints.wide;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Desktop side navigation */}
      {isWide && <AdminSidebar orientation="side" />}

      {/* Main content column */}
      <View style={[styles.content, { backgroundColor: theme.surface }]}>
        {/* Tablet / narrow horizontal top nav */}
        {!isWide && <AdminSidebar orientation="top" />}

        {/* Top bar — title + optional right slot */}
        <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
          <Text variant="title" color="text" style={styles.titleText}>
            {title}
          </Text>
          {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
        </View>

        {/* Scrollable page body constrained to MaxContentWidth */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: MaxContentWidth },
          ]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
    flexDirection: 'column',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  titleText: {
    flex: 1,
  },
  rightSlot: {
    flexShrink: 0,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
