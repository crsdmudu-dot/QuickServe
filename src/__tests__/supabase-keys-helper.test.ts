/**
 * supabase-keys-helper.test.ts — the shared API-key helper the Edge Functions use (package 262).
 *
 * `supabase/functions/_shared/supabase-keys.ts` reads the new injected variables
 * SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS (a JSON dictionary keyed by key name) and
 * returns the `default` key. These tests prove that it fails closed, that no key text can reach an
 * error message or a log line, and that it never falls back to the legacy injected names.
 *
 * Every key below is FAKE. They are deliberately short and contain hyphens, so no credential
 * scanner pattern matches them.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  ApiKeyConfigError,
  KEY_NAME,
  KEY_VARIABLES,
  apiKeyFailureLogLine,
  logApiKeyFailure,
  publishableKeyFrom,
  secretKeyFrom,
  selectApiKey,
} from '../../supabase/functions/_shared/supabase-keys';

const FAKE_SECRET = 'sb_secret_fake-test-only-1';
const FAKE_PUBLISHABLE = 'sb_publishable_fake-test-only-1';
const FAKE_LEGACY = 'eyJfake-legacy-test-only.payload.signature';

const dict = (value: unknown) => JSON.stringify({ [KEY_NAME]: value });
const reader = (vars: Record<string, string | undefined>) => (name: string) => vars[name];

/** Runs fn, expects an ApiKeyConfigError, and returns it. */
function failure(fn: () => unknown): ApiKeyConfigError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiKeyConfigError);
    return e as ApiKeyConfigError;
  }
  throw new Error('expected ApiKeyConfigError');
}

let log: jest.SpyInstance[];
beforeEach(() => {
  log = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  for (const s of log) s.mockRestore();
});

describe('supabase-keys: the happy path', () => {
  it('returns the default secret key from SUPABASE_SECRET_KEYS', () => {
    expect(secretKeyFrom(reader({ SUPABASE_SECRET_KEYS: dict(FAKE_SECRET) }))).toBe(FAKE_SECRET);
  });

  it('returns the default publishable key from SUPABASE_PUBLISHABLE_KEYS', () => {
    expect(publishableKeyFrom(reader({ SUPABASE_PUBLISHABLE_KEYS: dict(FAKE_PUBLISHABLE) }))).toBe(FAKE_PUBLISHABLE);
  });

  it('picks the default entry when the dictionary holds several keys', () => {
    const raw = JSON.stringify({ other: 'sb_secret_fake-other-key', [KEY_NAME]: FAKE_SECRET });
    expect(selectApiKey('secret', raw)).toBe(FAKE_SECRET);
  });

  it('reads only the variable of the requested kind', () => {
    const seen: string[] = [];
    secretKeyFrom((name) => {
      seen.push(name);
      return dict(FAKE_SECRET);
    });
    publishableKeyFrom((name) => {
      seen.push(name);
      return dict(FAKE_PUBLISHABLE);
    });
    expect(seen).toEqual([KEY_VARIABLES.secret, KEY_VARIABLES.publishable]);
    expect(KEY_VARIABLES).toEqual({ secret: 'SUPABASE_SECRET_KEYS', publishable: 'SUPABASE_PUBLISHABLE_KEYS' });
  });
});

describe('supabase-keys: fails closed', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('absent variable (%s) → absent', (_label, raw) => {
    expect(failure(() => selectApiKey('secret', raw)).reason).toBe('absent');
    expect(failure(() => selectApiKey('publishable', raw)).reason).toBe('absent');
  });

  it.each([
    ['not JSON', `{${FAKE_SECRET}`],
    ['a bare key string', FAKE_SECRET],
    ['a JSON string', JSON.stringify(FAKE_SECRET)],
    ['a JSON array', JSON.stringify([FAKE_SECRET])],
    ['JSON null', 'null'],
    ['a JSON number', '42'],
  ])('unparseable dictionary (%s) → unparseable', (_label, raw) => {
    expect(failure(() => selectApiKey('secret', raw)).reason).toBe('unparseable');
  });

  it('a dictionary without the default entry → no_default_key', () => {
    const raw = JSON.stringify({ other: FAKE_SECRET });
    expect(failure(() => selectApiKey('secret', raw)).reason).toBe('no_default_key');
  });

  it('an inherited "default" (prototype) does not count', () => {
    expect(failure(() => selectApiKey('secret', '{}')).reason).toBe('no_default_key');
    const viaProto = `{"__proto__": {"${KEY_NAME}": "${FAKE_SECRET}"}}`;
    expect(failure(() => selectApiKey('secret', viaProto)).reason).toBe('no_default_key');
  });

  it.each([
    ['a legacy JWT', FAKE_LEGACY],
    ['a publishable key in the secret slot', FAKE_PUBLISHABLE],
    ['the bare prefix', 'sb_secret_'],
    ['a key with whitespace', 'sb_secret_fake test'],
    ['a number', 7],
    ['an object', { key: FAKE_SECRET }],
    ['null', null],
  ])('wrong value for a secret key (%s) → wrong_kind', (_label, value) => {
    expect(failure(() => selectApiKey('secret', dict(value))).reason).toBe('wrong_kind');
  });

  it.each([
    ['a legacy JWT', FAKE_LEGACY],
    ['a SECRET key in the publishable slot', FAKE_SECRET],
    ['the bare prefix', 'sb_publishable_'],
  ])('wrong value for a publishable key (%s) → wrong_kind', (_label, value) => {
    expect(failure(() => selectApiKey('publishable', dict(value))).reason).toBe('wrong_kind');
  });

  it('never falls back to the legacy injected names', () => {
    const legacyOnly = reader({ SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY, SUPABASE_ANON_KEY: FAKE_LEGACY });
    expect(failure(() => secretKeyFrom(legacyOnly)).reason).toBe('absent');
    expect(failure(() => publishableKeyFrom(legacyOnly)).reason).toBe('absent');
  });
});

describe('supabase-keys: no key text anywhere', () => {
  const hostile = [
    `{${FAKE_SECRET}`, // the parser's own message would quote this
    `{"${KEY_NAME}": "${FAKE_SECRET}",}`,
    dict(`${FAKE_SECRET} `),
    dict(FAKE_PUBLISHABLE),
    dict(FAKE_LEGACY),
    JSON.stringify({ other: FAKE_SECRET }),
  ];

  it.each(hostile.map((raw, i) => [i, raw]))('case %i: the error carries no key text and no cause', (_i, raw) => {
    const e = failure(() => selectApiKey('secret', raw as string));
    const everything = [e.message, String(e), e.stack ?? '', JSON.stringify(e), String((e as { cause?: unknown }).cause ?? '')].join('\n');
    for (const fragment of [FAKE_SECRET, FAKE_PUBLISHABLE, FAKE_LEGACY, 'fake-test-only', 'eyJ']) {
      expect(everything).not.toContain(fragment);
    }
    expect((e as { cause?: unknown }).cause).toBeUndefined();
    expect(e.message).toMatch(/^SUPABASE_SECRET_KEYS is not usable \((absent|unparseable|no_default_key|wrong_kind)\)\.$/);
  });

  it('writes nothing to the console, on success or failure', () => {
    secretKeyFrom(reader({ SUPABASE_SECRET_KEYS: dict(FAKE_SECRET) }));
    publishableKeyFrom(reader({ SUPABASE_PUBLISHABLE_KEYS: dict(FAKE_PUBLISHABLE) }));
    for (const raw of hostile) failure(() => selectApiKey('secret', raw));
    for (const s of log) expect(s).not.toHaveBeenCalled();
  });
});

describe('supabase-keys: the key-failure log line (package 265, F-40bb-12)', () => {
  const LINE = /^delete-account: server key unavailable \((secret|publishable), (absent|unparseable|no_default_key|wrong_kind)\)\.$/;
  // Each raw value fails for BOTH kinds (a valid key of one kind is a wrong_kind for the other,
  // so dict(FAKE_SECRET) and dict(FAKE_PUBLISHABLE) are covered by the swap below).
  const hostileRaws = [
    undefined,
    '',
    `{${FAKE_SECRET}`,
    `{"${KEY_NAME}": "${FAKE_SECRET}",}`,
    dict(`${FAKE_SECRET} `),
    dict(FAKE_LEGACY),
    JSON.stringify({ other: FAKE_SECRET }),
  ];

  it('a key of the other kind gives wrong_kind, with no key text', () => {
    const s = apiKeyFailureLogLine('delete-account', failure(() => selectApiKey('secret', dict(FAKE_PUBLISHABLE))));
    const p = apiKeyFailureLogLine('delete-account', failure(() => selectApiKey('publishable', dict(FAKE_SECRET))));
    expect(s).toBe('delete-account: server key unavailable (secret, wrong_kind).');
    expect(p).toBe('delete-account: server key unavailable (publishable, wrong_kind).');
  });

  it.each(hostileRaws.map((raw, i) => [i, raw]))('case %i: fixed words only, the reason matches, no key text', (_i, raw) => {
    for (const kind of ['secret', 'publishable'] as const) {
      const e = failure(() => selectApiKey(kind, raw as string | undefined));
      const line = apiKeyFailureLogLine('delete-account', e);
      expect(line).toMatch(LINE);
      expect(line).toBe(`delete-account: server key unavailable (${kind}, ${e.reason}).`);
      for (const fragment of [FAKE_SECRET, FAKE_PUBLISHABLE, FAKE_LEGACY, 'fake-test-only', 'eyJ', 'sb_']) {
        expect(line).not.toContain(fragment);
      }
    }
  });

  it('gives null for any error that is not an ApiKeyConfigError (those stay unlogged)', () => {
    expect(apiKeyFailureLogLine('delete-account', new Error(`boom ${FAKE_SECRET}`))).toBeNull();
    expect(apiKeyFailureLogLine('delete-account', new TypeError('x'))).toBeNull();
    expect(apiKeyFailureLogLine('delete-account', FAKE_SECRET)).toBeNull();
    expect(apiKeyFailureLogLine('delete-account', undefined)).toBeNull();
    expect(apiKeyFailureLogLine('delete-account', { reason: 'absent', kind: 'secret' })).toBeNull();
  });

  it('never copies a tampered reason or kind into the line', () => {
    const e = new ApiKeyConfigError('secret', 'absent');
    Object.defineProperty(e, 'reason', { value: FAKE_SECRET });
    Object.defineProperty(e, 'kind', { value: FAKE_LEGACY });
    expect(apiKeyFailureLogLine('deletion-worker', e)).toBe('deletion-worker: server key unavailable (unknown, unknown).');
  });

  it('writes nothing to the console itself', () => {
    apiKeyFailureLogLine('delete-account', new ApiKeyConfigError('secret', 'absent'));
    logApiKeyFailure('delete-account', new ApiKeyConfigError('secret', 'absent'), () => undefined);
    for (const s of log) expect(s).not.toHaveBeenCalled();
  });

  it('logApiKeyFailure writes the one line for a key failure, and nothing for any other error', () => {
    const written: string[] = [];
    const write = (line: string) => written.push(line);
    logApiKeyFailure('register-device', new ApiKeyConfigError('publishable', 'no_default_key'), write);
    logApiKeyFailure('register-device', new Error(`boom ${FAKE_SECRET}`), write);
    logApiKeyFailure('register-device', undefined, write);
    expect(written).toEqual(['register-device: server key unavailable (publishable, no_default_key).']);
  });
});

describe('supabase-keys: source shape', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/functions/_shared/supabase-keys.ts'),
    'utf-8',
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('is pure: no Deno, no import, no console, no global environment read', () => {
    expect(code).not.toMatch(/\bDeno\b/);
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/console\.|process\.env/);
  });

  it('names no legacy injected variable in code', () => {
    expect(code).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY/);
  });

  it('never attaches the parse error as a cause', () => {
    expect(code).not.toMatch(/cause/);
  });
});
