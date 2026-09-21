/**
 * skeleton-animation-lifecycle.test.tsx — regression cover for the Skeleton shimmer lifecycle.
 *
 * Skeleton checks the OS "Reduce Motion" setting asynchronously, so the component can unmount
 * before that promise settles. The original implementation captured the animation in a local
 * `let` that the cleanup closed over while it was still `null`, so a late callback started an
 * endless `Animated.loop` on an unmounted component that nothing could stop. Under the React
 * Native Jest preset each native-driver flush schedules a 16 ms timer, so the leaked loop kept
 * the worker's event loop alive ("a worker process has failed to exit gracefully").
 *
 * These tests drive the reduced-motion promise by hand — no sleeps, no arbitrary waits — and
 * assert on whether a loop is ever constructed, whether it is stopped exactly once, and whether
 * any timer survives the component.
 */

import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';

jest.mock('@/constants/motion', () => ({
  ...jest.requireActual('@/constants/motion'),
  prefersReducedMotion: jest.fn(),
}));

import { prefersReducedMotion } from '@/constants/motion';
import { Skeleton } from '@/components/ui/skeleton';

const mockPrefersReducedMotion = prefersReducedMotion as jest.MockedFunction<
  typeof prefersReducedMotion
>;

/** A promise whose settlement this test controls, so nothing depends on timing. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Captured before any spy is installed so the spy can delegate to the real implementation.
const realLoop = Animated.loop;

/** Every loop Animated.loop handed back during a test, with start/stop observable. */
let loops: Animated.CompositeAnimation[] = [];
let loopSpy: jest.SpyInstance;

/** Let the reduced-motion promise's `.then` run, inside act, without any sleep. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Drain pending timers. A correctly stopped shimmer leaves nothing behind; a leaked loop keeps
 * rescheduling its native-driver flush, so timers remain no matter how far time is advanced.
 */
function drainTimers() {
  act(() => {
    jest.advanceTimersByTime(5000);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  loops = [];
  loopSpy = jest.spyOn(Animated, 'loop').mockImplementation((...args) => {
    const animation = realLoop(...(args as Parameters<typeof realLoop>));
    jest.spyOn(animation, 'start');
    jest.spyOn(animation, 'stop');
    loops.push(animation);
    return animation;
  });
});

afterEach(() => {
  loops.forEach((animation) => animation.stop());
  loopSpy.mockRestore();
  jest.clearAllTimers();
  jest.useRealTimers();
  mockPrefersReducedMotion.mockReset();
});

describe('Skeleton shimmer lifecycle', () => {
  it('never starts the loop when it unmounts before the reduced-motion check resolves', async () => {
    const motion = deferred<boolean>();
    mockPrefersReducedMotion.mockReturnValue(motion.promise);

    const view = render(<Skeleton testID="skel" />);
    // Unmount first: the accessibility lookup is still in flight.
    view.unmount();

    // Now the lookup comes back saying motion IS allowed — the dangerous case.
    motion.resolve(false);
    await flushMicrotasks();

    expect(Animated.loop).not.toHaveBeenCalled();
    expect(loops).toHaveLength(0);

    drainTimers();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts the loop while mounted and stops it exactly once on unmount', async () => {
    const motion = deferred<boolean>();
    mockPrefersReducedMotion.mockReturnValue(motion.promise);

    const view = render(<Skeleton testID="skel" />);

    motion.resolve(false);
    await flushMicrotasks();

    expect(Animated.loop).toHaveBeenCalledTimes(1);
    expect(loops).toHaveLength(1);
    expect(loops[0].start).toHaveBeenCalledTimes(1);
    expect(loops[0].stop).not.toHaveBeenCalled();

    view.unmount();

    expect(loops[0].stop).toHaveBeenCalledTimes(1);

    drainTimers();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts no animation at all when reduced motion is enabled', async () => {
    const motion = deferred<boolean>();
    mockPrefersReducedMotion.mockReturnValue(motion.promise);

    const view = render(<Skeleton testID="skel" />);

    motion.resolve(true);
    await flushMicrotasks();

    expect(Animated.loop).not.toHaveBeenCalled();

    view.unmount();
    drainTimers();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('leaves nothing running when the reduced-motion check rejects after unmount', async () => {
    const motion = deferred<boolean>();
    mockPrefersReducedMotion.mockReturnValue(motion.promise);

    const view = render(<Skeleton testID="skel" />);
    view.unmount();

    motion.reject(new Error('AccessibilityInfo unavailable'));
    await flushMicrotasks();

    expect(Animated.loop).not.toHaveBeenCalled();

    drainTimers();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('leaves no loop or timer running across repeated mount/unmount cycles', async () => {
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const motion = deferred<boolean>();
      mockPrefersReducedMotion.mockReturnValue(motion.promise);

      const view = render(<Skeleton testID={`skel-${cycle}`} />);

      // Alternate: half the cycles resolve while mounted, half resolve only after unmount.
      if (cycle % 2 === 0) {
        motion.resolve(false);
        await flushMicrotasks();
        view.unmount();
      } else {
        view.unmount();
        motion.resolve(false);
        await flushMicrotasks();
      }
    }

    // Three cycles resolved while mounted, so three loops were built; the other two must not exist.
    expect(loops).toHaveLength(3);
    loops.forEach((animation) => {
      expect(animation.stop).toHaveBeenCalledTimes(1);
    });

    drainTimers();
    expect(jest.getTimerCount()).toBe(0);
  });
});
