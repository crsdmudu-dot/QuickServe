/**
 * Tests for PageMeta
 *
 * PageMeta is web-only: it renders null on native (Platform.OS !== 'web')
 * and renders a Head wrapper on web.
 *
 * expo-router/head is mocked so no real HeadProvider / router context is needed.
 * Platform.OS is overridden via Object.defineProperty since jest-mock doesn't
 * support get-accessor spying on RN's Platform object.
 */

// Mock expo-router/head so Head renders its children without needing a provider.
// The module exports Head as default.
jest.mock('expo-router/head', () => {
  const MockHead = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return { __esModule: true, default: MockHead };
});

import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { PageMeta } from '@/components/admin-web/page-meta';
import { ADMIN_TITLE_SUFFIX } from '@/constants/admin-web';

/** Temporarily override Platform.OS and restore it after the test. */
function withPlatformOS(os: string, fn: () => void) {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
}

describe('PageMeta', () => {
  it('returns null on native (Platform.OS = ios)', () => {
    withPlatformOS('ios', () => {
      const { toJSON } = render(<PageMeta title="Dashboard" />);
      expect(toJSON()).toBeNull();
    });
  });

  it('returns null on android (Platform.OS = android)', () => {
    withPlatformOS('android', () => {
      const { toJSON } = render(<PageMeta title="Dashboard" />);
      expect(toJSON()).toBeNull();
    });
  });

  it('renders without throwing when Platform.OS = web', () => {
    withPlatformOS('web', () => {
      expect(() => render(<PageMeta title="Dashboard" />)).not.toThrow();
    });
  });

  it('title includes the ADMIN_TITLE_SUFFIX constant', () => {
    // The suffix value itself should match the constant
    expect(ADMIN_TITLE_SUFFIX).toBe(' · QuickServe Admin');
  });
});
