import { Platform } from 'react-native';

import { SUPPORT_EMAIL, buildSupportMailtoUrl } from './support';

describe('SUPPORT_EMAIL', () => {
  it('is the verified Hired Corp support mailbox', () => {
    expect(SUPPORT_EMAIL).toBe('support@hiredcorp.co.ke');
  });
});

describe('buildSupportMailtoUrl', () => {
  const original = Platform.OS;
  afterEach(() => {
    (Platform as { OS: string }).OS = original;
  });

  it.each(['ios', 'android', 'web'])('is the same bare mailto on %s', (os) => {
    (Platform as { OS: string }).OS = os;
    expect(buildSupportMailtoUrl()).toBe('mailto:support@hiredcorp.co.ke');
  });

  // The Auth surfaces that carry this link are rendered on routes that received a one-time token.
  // The URL must therefore be a constant: nothing about the route, the link or the user can reach
  // it. A builder that takes no arguments cannot be handed a token to leak.
  it('takes no arguments', () => {
    expect(buildSupportMailtoUrl).toHaveLength(0);
  });

  it('carries no query, fragment, subject or body', () => {
    const url = buildSupportMailtoUrl();
    expect(url).not.toContain('?');
    expect(url).not.toContain('#');
    expect(url).not.toContain('&');
    expect(url).not.toMatch(/subject=|body=|cc=|bcc=/i);
  });

  it('is exactly the scheme and the address, with nothing appended', () => {
    expect(buildSupportMailtoUrl()).toMatch(/^mailto:[^?#&\s]+@[^?#&\s]+$/);
  });

  it('returns an identical value on every call', () => {
    expect(buildSupportMailtoUrl()).toBe(buildSupportMailtoUrl());
  });
});
