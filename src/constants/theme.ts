import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const Colors = {
  light: {
    // --- Core text ---
    text: '#0E1116',
    ink: '#0E1116',
    textSecondary: '#5B6470',
    textTertiary: '#8C939D',

    // --- Core backgrounds ---
    background: '#FFFFFF',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    surface: '#FFFFFF',
    surfaceMuted: '#F7F8FA',

    // --- Green ecosystem ---
    primary: '#00875A',
    primaryDark: '#006B47',
    primaryTint: '#E7F7F0',
    primaryDeep: '#005A3C',
    primarySurface: '#F2FBF7',

    // --- Borders ---
    border: '#ECEEF1',
    borderStrong: '#D5D8DC',

    // --- Neutral ramp ---
    neutral50: '#F9FAFB',
    neutral100: '#F3F4F6',
    neutral200: '#E5E7EB',
    neutral300: '#D1D5DB',
    neutral400: '#9CA3AF',
    neutral500: '#6B7280',
    neutral600: '#4B5563',
    neutral700: '#374151',
    neutral800: '#1F2937',
    neutral900: '#111827',

    // --- Semantic base colours ---
    success: '#00875A',
    warning: '#F5A524',
    error: '#E5484D',
    info: '#0EA5E9',

    // --- Semantic surface tints ---
    successSurface: '#ECFDF5',
    warningSurface: '#FFFBEB',
    errorSurface: '#FFF1F2',
    infoSurface: '#F0F9FF',
  },
  dark: {
    // --- Core text ---
    text: '#FFFFFF',
    ink: '#FFFFFF',
    textSecondary: '#B0B4BA',
    textTertiary: '#6E757E',

    // --- Core backgrounds ---
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    surface: '#0F1011',
    surfaceMuted: '#18191C',

    // --- Green ecosystem ---
    primary: '#00875A',
    primaryDark: '#006B47',
    primaryTint: '#10271F',
    primaryDeep: '#1A4D38',
    primarySurface: '#0C1F18',

    // --- Borders ---
    border: '#26282B',
    borderStrong: '#3A3D42',

    // --- Neutral ramp ---
    neutral50: '#18191C',
    neutral100: '#212225',
    neutral200: '#2E3135',
    neutral300: '#3D4147',
    neutral400: '#5B6470',
    neutral500: '#8C939D',
    neutral600: '#B0B4BA',
    neutral700: '#C8CBD0',
    neutral800: '#E0E1E6',
    neutral900: '#F3F4F6',

    // --- Semantic base colours ---
    // success is lightened in dark mode so it contrasts against successSurface (#052E1A)
    success: '#2ECC82',
    warning: '#F5A524',
    error: '#E5484D',
    info: '#38BDF8',

    // --- Semantic surface tints ---
    successSurface: '#052E1A',
    warningSurface: '#2D1E00',
    errorSurface: '#2D0A0B',
    infoSurface: '#082030',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const Shadows = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,
  e1: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  } as ViewStyle,
  e2: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  } as ViewStyle,
  e3: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  } as ViewStyle,
} as const;

export const Typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

/** Font weight constants for consistent use across components. */
export const Weights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
