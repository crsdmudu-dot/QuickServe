// supabase-keys.ts — the ONE place the Edge Functions get their Supabase API keys.
//
// Supabase injects the new API keys into every Edge Function as two variables:
//   SUPABASE_SECRET_KEYS       the secret keys      (sb_secret_…)
//   SUPABASE_PUBLISHABLE_KEYS  the publishable keys (sb_publishable_…)
// Each is a JSON dictionary keyed by key name, for example {"default": "sb_secret_…"}.
// This file picks the key named `default` from the right dictionary.
//
// SECURITY RULES (pinned by src/__tests__/supabase-keys-helper.test.ts):
//   * Fail closed. A missing variable, text that is not a JSON dictionary, a missing `default`
//     entry, or a value of the wrong kind (a legacy JWT, or a publishable key where a secret key
//     belongs) throws ApiKeyConfigError. The function then answers its usual generic error.
//   * Never log a key. This file logs nothing, and the error message is fixed text: it never
//     contains the variable's content (JSON.parse messages can quote the input, so they are
//     discarded, never wrapped or attached as a cause). apiKeyFailureLogLine builds the one line a
//     function may log for a key failure: its own name, the key kind and the reason word only.
//   * No fallback to the legacy SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY. Those carry the
//     legacy keys this migration retires.
//
// The file is pure (no Deno, no imports, no globals): each function passes its own reader, e.g.
//   const env = (name: string) => Deno.env.get(name);
//   const serviceKey = secretKeyFrom(env);

/** Reads one environment variable; returns undefined when it is unset. */
export type EnvReader = (name: string) => string | undefined;

export type ApiKeyKind = 'secret' | 'publishable';

export type ApiKeyFailure = 'absent' | 'unparseable' | 'no_default_key' | 'wrong_kind';

/** The injected variable for each kind of key. */
export const KEY_VARIABLES: Readonly<Record<ApiKeyKind, string>> = {
  secret: 'SUPABASE_SECRET_KEYS',
  publishable: 'SUPABASE_PUBLISHABLE_KEYS',
};

/** The dictionary entry every function uses. */
export const KEY_NAME = 'default';

/** The prefix each kind of key starts with. A legacy JWT key starts with neither. */
const KEY_PREFIXES: Readonly<Record<ApiKeyKind, string>> = {
  secret: 'sb_secret_',
  publishable: 'sb_publishable_',
};

/** Thrown when a key cannot be used. The message names the variable and the reason only. */
export class ApiKeyConfigError extends Error {
  readonly kind: ApiKeyKind;
  readonly reason: ApiKeyFailure;

  constructor(kind: ApiKeyKind, reason: ApiKeyFailure) {
    super(`${KEY_VARIABLES[kind]} is not usable (${reason}).`);
    this.name = 'ApiKeyConfigError';
    this.kind = kind;
    this.reason = reason;
  }
}

/** Parses the injected text and returns the `default` key of the given kind, or throws. */
export function selectApiKey(kind: ApiKeyKind, raw: string | undefined): string {
  if (typeof raw !== 'string' || raw.trim() === '') throw new ApiKeyConfigError(kind, 'absent');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Deliberately no detail: the parser's message can quote the key text.
    throw new ApiKeyConfigError(kind, 'unparseable');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiKeyConfigError(kind, 'unparseable');
  }

  const dictionary = parsed as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(dictionary, KEY_NAME)) {
    throw new ApiKeyConfigError(kind, 'no_default_key');
  }

  const key = dictionary[KEY_NAME];
  const prefix = KEY_PREFIXES[kind];
  if (typeof key !== 'string' || !key.startsWith(prefix) || key.length === prefix.length || /\s/.test(key)) {
    throw new ApiKeyConfigError(kind, 'wrong_kind');
  }
  return key;
}

/** The secret key (full access; server-side only). */
export function secretKeyFrom(env: EnvReader): string {
  return selectApiKey('secret', env(KEY_VARIABLES.secret));
}

/** The publishable key (the public key; RLS applies). */
export function publishableKeyFrom(env: EnvReader): string {
  return selectApiKey('publishable', env(KEY_VARIABLES.publishable));
}

const FAILURES: readonly ApiKeyFailure[] = ['absent', 'unparseable', 'no_default_key', 'wrong_kind'];

/**
 * The one log line a function writes when its key cannot be used, or null for any other error.
 * It holds only the function's own fixed name, the key kind and the fixed reason word, so it can
 * never carry key text. Other errors give null: their messages are not checked, so they stay unlogged.
 * Example: "delete-account: server key unavailable (secret, absent)."
 */
export function apiKeyFailureLogLine(source: string, error: unknown): string | null {
  if (!(error instanceof ApiKeyConfigError)) return null;
  const kind = error.kind === 'secret' || error.kind === 'publishable' ? error.kind : 'unknown';
  const reason = FAILURES.includes(error.reason) ? error.reason : 'unknown';
  return `${source}: server key unavailable (${kind}, ${reason}).`;
}

/**
 * Writes apiKeyFailureLogLine's line through the given writer, or nothing for any other error.
 * Functions call it from their catch: logApiKeyFailure('delete-account', error, (line) => console.error(line));
 */
export function logApiKeyFailure(source: string, error: unknown, write: (line: string) => void): void {
  const line = apiKeyFailureLogLine(source, error);
  if (line !== null) write(line);
}
