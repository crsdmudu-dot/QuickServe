/**
 * Tests for the 4 chart components:
 *   TrendCard / BarChart / LineChart / PieChart
 *
 * NOTE ON react-native-svg MOCK:
 * Although react-native-svg is listed in jest's transformIgnorePatterns (so it
 * IS transpiled), its host SVG elements (Svg, Rect, Path, etc.) are native-only
 * and not queryable via RNTL's text/testID selectors in the jsdom environment.
 * We therefore mock react-native-svg to simple React Native <View> wrappers so
 * that all text nodes (labels, values) land in the RN tree and can be asserted
 * with getByText / getByTestId. TrendCard needs no mock (no SVG).
 */

// ── Mocks (must come before all imports) ───────────────────────────────────

// Suppress Skeleton animation in test env.
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: { gentle: { damping: 18, stiffness: 160 }, snappy: { damping: 14, stiffness: 220 } },
}));

// Mock react-native-svg: map all SVG host components to View/Text so RNTL
// can find rendered text nodes and testIDs.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View, Text } = require('react-native');

  // A tiny wrapper that renders children (as a View) so text bubbles up.
  const svgView = (props: any) => React.createElement(View, props, props.children);
  // SvgText renders as a RN Text so getByText can find it.
  const svgText = (props: any) => React.createElement(Text, props, props.children);

  return {
    __esModule: true,
    default: svgView,    // Svg
    Svg: svgView,
    Rect: svgView,
    Path: svgView,
    Line: svgView,
    Polyline: svgView,
    G: svgView,
    Circle: svgView,
    Text: svgText,       // SvgText → renders as RN Text
  };
});

// ── Imports ────────────────────────────────────────────────────────────────

import { render, screen } from '@testing-library/react-native';
import { TrendCard } from '@/components/admin-web/charts/trend-card';
import { BarChart } from '@/components/admin-web/charts/bar-chart';
import { LineChart } from '@/components/admin-web/charts/line-chart';
import { PieChart } from '@/components/admin-web/charts/pie-chart';

// ── TrendCard ──────────────────────────────────────────────────────────────

describe('TrendCard', () => {
  it('renders the title and value', () => {
    render(<TrendCard title="Total Revenue" value="KES 12,000" />);
    expect(screen.getByText('Total Revenue')).toBeOnTheScreen();
    expect(screen.getByText('KES 12,000')).toBeOnTheScreen();
  });

  it('renders a positive trendPct with ▲ symbol', () => {
    render(<TrendCard title="Orders" value={42} trendPct={12} testID="tc" />);
    // Should show "▲ 12%"
    expect(screen.getByText('▲ 12%')).toBeOnTheScreen();
  });

  it('renders a negative trendPct with ▼ symbol and absolute value', () => {
    render(<TrendCard title="Orders" value={42} trendPct={-5} testID="tc" />);
    // Should show "▼ 5%"
    expect(screen.getByText('▼ 5%')).toBeOnTheScreen();
  });

  it('does not render trend indicator when trendPct is omitted', () => {
    render(<TrendCard title="Sales" value={100} />);
    expect(screen.queryByText(/▲|▼/)).toBeNull();
  });

  it('renders the optional subtitle', () => {
    render(<TrendCard title="Sales" value={100} subtitle="vs last month" />);
    expect(screen.getByText('vs last month')).toBeOnTheScreen();
  });

  it('renders — when value is null', () => {
    render(<TrendCard title="Revenue" value={null as any} />);
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('renders — when value is empty string', () => {
    render(<TrendCard title="Revenue" value="" />);
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('renders numeric value as string', () => {
    render(<TrendCard title="Count" value={99} />);
    expect(screen.getByText('99')).toBeOnTheScreen();
  });
});

// ── BarChart ───────────────────────────────────────────────────────────────

const BAR_DATA = [
  { label: 'Jan', value: 100 },
  { label: 'Feb', value: 200 },
  { label: 'Mar', value: 150 },
];

describe('BarChart', () => {
  it('renders each bar label from a 3-bar fixture', () => {
    render(<BarChart data={BAR_DATA} testID="bar" />);
    expect(screen.getByText('Jan')).toBeOnTheScreen();
    expect(screen.getByText('Feb')).toBeOnTheScreen();
    expect(screen.getByText('Mar')).toBeOnTheScreen();
  });

  it('renders each bar value from a 3-bar fixture', () => {
    render(<BarChart data={BAR_DATA} testID="bar" />);
    expect(screen.getByText('100')).toBeOnTheScreen();
    expect(screen.getByText('200')).toBeOnTheScreen();
    expect(screen.getByText('150')).toBeOnTheScreen();
  });

  it('renders formatted values when format prop is provided', () => {
    render(<BarChart data={BAR_DATA} format={(n) => `$${n}`} />);
    expect(screen.getByText('$100')).toBeOnTheScreen();
    expect(screen.getByText('$200')).toBeOnTheScreen();
  });

  it('renders chart-empty when data is empty array', () => {
    render(<BarChart data={[]} />);
    expect(screen.getByTestId('chart-empty')).toBeOnTheScreen();
    expect(screen.getByText('No data')).toBeOnTheScreen();
  });

  it('renders chart-loading when loading is true', () => {
    render(<BarChart data={BAR_DATA} loading={true} />);
    expect(screen.getByTestId('chart-loading')).toBeOnTheScreen();
  });

  it('renders the testID on the container', () => {
    render(<BarChart data={BAR_DATA} testID="my-bar" />);
    expect(screen.getByTestId('my-bar')).toBeOnTheScreen();
  });
});

// ── LineChart ──────────────────────────────────────────────────────────────

const LINE_SERIES = [
  { label: 'Mon', value: 10 },
  { label: 'Tue', value: 25 },
  { label: 'Wed', value: 18 },
  { label: 'Thu', value: 32 },
  { label: 'Fri', value: 28 },
];

describe('LineChart', () => {
  it('renders x-axis labels from a multi-point series (sampled)', () => {
    render(<LineChart series={LINE_SERIES} testID="line" />);
    // First and last are always shown.
    expect(screen.getByText('Mon')).toBeOnTheScreen();
    expect(screen.getByText('Fri')).toBeOnTheScreen();
  });

  it('renders chart-empty when series is empty', () => {
    render(<LineChart series={[]} />);
    expect(screen.getByTestId('chart-empty')).toBeOnTheScreen();
    expect(screen.getByText('No data')).toBeOnTheScreen();
  });

  it('renders chart-loading when loading is true', () => {
    render(<LineChart series={LINE_SERIES} loading={true} />);
    expect(screen.getByTestId('chart-loading')).toBeOnTheScreen();
  });

  it('renders the testID on the container', () => {
    render(<LineChart series={LINE_SERIES} testID="my-line" />);
    expect(screen.getByTestId('my-line')).toBeOnTheScreen();
  });

  it('renders a single-point series without crashing', () => {
    render(<LineChart series={[{ label: 'A', value: 5 }]} />);
    expect(screen.getByText('A')).toBeOnTheScreen();
  });
});

// ── PieChart ───────────────────────────────────────────────────────────────

const PIE_SLICES = [
  { label: 'Category A', value: 60 },
  { label: 'Category B', value: 40 },
];

describe('PieChart', () => {
  it('renders legend labels for each slice', () => {
    render(<PieChart slices={PIE_SLICES} testID="pie" />);
    expect(screen.getByText('Category A')).toBeOnTheScreen();
    expect(screen.getByText('Category B')).toBeOnTheScreen();
  });

  it('renders a percentage in the legend for each slice', () => {
    render(<PieChart slices={PIE_SLICES} testID="pie" />);
    // 60/(60+40)*100 = 60%, 40/(60+40)*100 = 40%
    expect(screen.getAllByText('60%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('40%').length).toBeGreaterThanOrEqual(1);
  });

  it('renders chart-empty when slices is empty', () => {
    render(<PieChart slices={[]} />);
    expect(screen.getByTestId('chart-empty')).toBeOnTheScreen();
    expect(screen.getByText('No data')).toBeOnTheScreen();
  });

  it('renders chart-empty when all slice values are 0', () => {
    render(<PieChart slices={[{ label: 'X', value: 0 }]} />);
    expect(screen.getByTestId('chart-empty')).toBeOnTheScreen();
  });

  it('renders chart-loading when loading is true', () => {
    render(<PieChart slices={PIE_SLICES} loading={true} />);
    expect(screen.getByTestId('chart-loading')).toBeOnTheScreen();
  });

  it('renders the testID on the container', () => {
    render(<PieChart slices={PIE_SLICES} testID="my-pie" />);
    expect(screen.getByTestId('my-pie')).toBeOnTheScreen();
  });
});
