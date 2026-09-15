import { useNavigationContainerRef } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * `useRootNavigationReady` — is the root navigator ready to accept `router.setParams`?
 *
 * WHY THIS EXISTS. `router.setParams` is not safe to call before the root navigator has mounted.
 * In the installed expo-router it calls `store.assertIsReady()` first, which throws
 * "Attempted to navigate before mounting the Root Layout component", and then calls
 * `(store.navigationRef?.current?.setParams)(params)` where the optional chaining guards the
 * property lookup but NOT the call. `router.replace` is different: it goes through `linkTo`, which
 * pushes a ROUTER_LINK action onto `routingQueue` with no readiness assertion, so it is safe early
 * and is drained once the ref exists.
 *
 * A deep-link cold launch runs a screen's first effect before the container reports ready, so an
 * unguarded `setParams` there throws into the global error boundary. On 2026-09-15 that is exactly
 * what happened to a real confirmation link: the app showed "Something went wrong" and the gateway
 * logged zero verification requests.
 *
 * WHY THIS SIGNAL IS THE RIGHT ONE. `useNavigationContainerRef()` returns `store.navigationRef` —
 * the very object `assertIsReady()` interrogates — and its `isReady()` is the identical predicate
 * (`current != null && current.isReady()`). So a `true` here means `assertIsReady()` will pass.
 *
 * WHY SUBSCRIBING EARLY IS SAFE. The container ref buffers listeners registered before it mounts:
 * `addListener` stores the callback and returns an unsubscribe, and the `current` setter replays
 * every buffered listener onto the real container once it is set. So this subscription works from
 * the very first render. `useSyncExternalStore` additionally re-reads the snapshot after
 * subscribing, which covers a container that became ready between render and subscription.
 */
export function useRootNavigationReady(): boolean {
  const navigationRef = useNavigationContainerRef();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubscribe = navigationRef.addListener('state', onStoreChange);
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    },
    [navigationRef],
  );

  const getSnapshot = useCallback(() => navigationRef.isReady(), [navigationRef]);

  // Server and first-paint snapshot: never assume readiness.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
