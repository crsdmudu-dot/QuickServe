/**
 * validate-rpc-shape.ts — a PURE request-shape validator primitive (no browser).
 *
 * Both analytics stub modules (Executive, Detailed) validate that each intercepted
 * Supabase RPC is a POST carrying the parameters its contract requires. This
 * primitive expresses that check declaratively so the rules live in one place and
 * can be unit-tested without a browser (see `framework.spec.ts` health-tests).
 *
 * It returns a list of human-readable problems (empty ⇒ the request is well-shaped).
 * The interceptor wraps these with the RPC name + body for diagnostics.
 */

/** The minimal slice of a Playwright `Request` this validator needs. */
export type RpcRequestLike = {
  method(): string;
  postDataJSON(): unknown;
};

export type RpcShapeRules = {
  /** Keys that must be present (any value except `undefined`). */
  requireParams: string[];
  /** Keys that must be present AND whose value is one of the allowed strings. */
  enums?: Record<string, readonly string[]>;
  /** Keys that must be present AND whose value is a number. */
  numbers?: string[];
};

export function validateRpcShape(req: RpcRequestLike, rules: RpcShapeRules): string[] {
  const problems: string[] = [];

  if (req.method() !== 'POST') problems.push(`method=${req.method()}`);

  let body: Record<string, unknown> | null = null;
  try {
    body = req.postDataJSON() as Record<string, unknown> | null;
  } catch {
    body = null;
  }

  for (const key of rules.requireParams) {
    if (!body || body[key] === undefined) problems.push(`missing ${key}`);
  }

  if (rules.enums) {
    for (const [key, allowed] of Object.entries(rules.enums)) {
      const value = body?.[key];
      if (value === undefined) problems.push(`missing ${key}`);
      else if (!allowed.includes(value as string)) problems.push(`bad ${key}=${String(value)}`);
    }
  }

  if (rules.numbers) {
    for (const key of rules.numbers) {
      const value = body?.[key];
      if (value === undefined) problems.push(`missing ${key}`);
      else if (typeof value !== 'number') problems.push(`bad ${key}=${String(value)}`);
    }
  }

  return problems;
}
