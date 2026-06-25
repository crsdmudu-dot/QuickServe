/**
 * Tests for Skeleton — verifies mounting with default and explicit props,
 * and checks that height/radius are reflected in the rendered block's style.
 *
 * `prefersReducedMotion` is mocked to resolve `true` so no animation loop
 * runs during tests, keeping the suite fast and stable.
 */

import { render, screen } from '@testing-library/react-native';

// Mock @/constants/motion BEFORE importing the component so that the
// useEffect inside Skeleton sees the mock immediately and skips the animation.
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: { gentle: { damping: 18, stiffness: 160 }, snappy: { damping: 14, stiffness: 220 } },
}));

import { Skeleton } from '@/components/ui/skeleton';

describe('Skeleton', () => {
  it('renders without crashing with default props', () => {
    render(<Skeleton testID="skel" />);
    expect(screen.getByTestId('skel')).toBeOnTheScreen();
  });

  it('renders with explicit width, height, and radius', () => {
    render(<Skeleton testID="skel-explicit" width={120} height={24} radius={8} />);
    const block = screen.getByTestId('skel-explicit');
    expect(block).toBeOnTheScreen();
  });

  it('applies the given height to the block style', () => {
    render(<Skeleton testID="skel-height" height={32} />);
    const block = screen.getByTestId('skel-height');

    // Flatten the style array (mirrors message-bubble.test.tsx pattern).
    const flat = Array.isArray(block.props.style)
      ? Object.assign({}, ...block.props.style.flat(Infinity).filter(Boolean))
      : block.props.style;

    expect(flat.height).toBe(32);
  });

  it('applies the given radius to the block style', () => {
    render(<Skeleton testID="skel-radius" radius={8} />);
    const block = screen.getByTestId('skel-radius');

    const flat = Array.isArray(block.props.style)
      ? Object.assign({}, ...block.props.style.flat(Infinity).filter(Boolean))
      : block.props.style;

    expect(flat.borderRadius).toBe(8);
  });
});
